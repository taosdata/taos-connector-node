import { ICloseEvent, w3cwebsocket } from "websocket";
import { Address, Dsn } from "../common/dsn";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketQueryError,
} from "../common/wsError";
import { OnMessageType, WsEventCallback } from "./wsEventCallback";
import logger from "../common/log";
import { maskSensitiveForLog, maskUrlForLog, normalizeWsPath } from "../common/utils";

interface InflightRequest {
    reqId: bigint;
    action: string;
    id?: bigint;
    registerCallback: boolean;
    message: string | ArrayBuffer;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
}

type SessionRecoveryHook = () => Promise<void>;

const RETRIABLE_ACTIONS = new Set(["insert", "options_connection"]);
// TDengine websocket binary op codes that are safe to replay after reconnect.
const BINARY_RETRIABLE_ACTIONS = new Set<bigint>([4n, 5n, 6n, 10n]);

const DEFAULT_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_BACKOFF_MAX_MS = 2000;

function parseNonNegativeInt(
    value: string | undefined | null,
    fallback: number
): number {
    if (value === undefined || value === null || value.length === 0) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}

function parsePositiveInt(
    value: string | undefined | null,
    fallback: number
): number {
    if (value === undefined || value === null || value.length === 0) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

export class RetryConfig {
    readonly retries: number;
    readonly retryBackoffMs: number;
    readonly retryBackoffMaxMs: number;

    constructor(retries: number, retryBackoffMs: number, retryBackoffMaxMs: number) {
        this.retries = retries;
        this.retryBackoffMs = retryBackoffMs;
        this.retryBackoffMaxMs = Math.max(retryBackoffMs, retryBackoffMaxMs);
    }

    getBackoffDelay(attempt: number): number {
        const safeAttempt = Math.max(0, attempt);
        const rawDelay = this.retryBackoffMs * Math.pow(2, safeAttempt);
        const finiteDelay = Number.isFinite(rawDelay) ? rawDelay : this.retryBackoffMaxMs;
        return Math.min(finiteDelay, this.retryBackoffMaxMs);
    }

    static fromDsn(dsn: Dsn): RetryConfig {
        const retries = parseNonNegativeInt(
            dsn.params.get("retries"),
            DEFAULT_RETRIES
        );
        const retryBackoffMs = parsePositiveInt(
            dsn.params.get("retry_backoff_ms"),
            DEFAULT_BACKOFF_MS
        );
        const retryBackoffMaxMs = parsePositiveInt(
            dsn.params.get("retry_backoff_max_ms"),
            DEFAULT_BACKOFF_MAX_MS
        );
        return new RetryConfig(retries, retryBackoffMs, retryBackoffMaxMs);
    }
}

export class WebSocketConnector {
    private _wsConn!: w3cwebsocket;
    private _wsURL!: URL;
    private readonly _poolKey: string;
    private readonly _addresses: Address[];
    private _currentAddressIndex: number;
    private readonly _retryConfig: RetryConfig;
    private readonly _scheme: string;
    private readonly _path: string;
    private readonly _params: Map<string, string>;
    private readonly _inflightRequests: Map<bigint, InflightRequest> = new Map();
    private readonly _suppressedSockets: WeakSet<w3cwebsocket> = new WeakSet();
    private _reconnectLock: Promise<void> | null = null;
    private _isReconnecting = false;
    private _allowReconnect = true;
    private _connectionReadyPromise: Promise<void> = Promise.resolve();
    private _sessionRecoveryHook: SessionRecoveryHook | null = null;
    private _timeout = 60000;

    constructor(
        dsn: Dsn,
        wsPath: string,
        poolKey: string,
        timeout: number | undefined | null
    ) {
        if (!dsn || dsn.addresses.length === 0) {
            throw new WebSocketQueryError(
                ErrorCode.ERR_INVALID_URL,
                "websocket URL must be defined"
            );
        }
        this._poolKey = poolKey;
        this._addresses = dsn.addresses;
        this._currentAddressIndex = this.selectRandomIndex();
        this._retryConfig = RetryConfig.fromDsn(dsn);
        this._scheme = dsn.scheme;
        this._path = normalizeWsPath(wsPath);
        this._params = new Map(dsn.params);
        if (timeout) {
            this._timeout = timeout;
        }
        logger.info(
            `Initial websocket address selected: ${this.getCurrentAddress()} (index ${this._currentAddressIndex + 1}/${this._addresses.length})`
        );
        this.createConnection();
    }

    private selectRandomIndex(): number {
        if (this._addresses.length <= 1) {
            return 0;
        }
        return Math.floor(Math.random() * this._addresses.length);
    }

    private buildWebSocketUrl(index: number): string {
        const addr = this._addresses[index];
        const url = new URL(`${this._scheme}://${addr.host}:${addr.port}/${this._path}`);
        const forwardedParams = ["token", "bearer_token"];
        for (const key of forwardedParams) {
            const value = this._params.get(key);
            if (value !== undefined) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }

    private createConnection(): void {
        const url = this.buildWebSocketUrl(this._currentAddressIndex);
        this._wsURL = new URL(url);
        const wsConn = new w3cwebsocket(
            url,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                maxReceivedFrameSize: 0x60000000,
                maxReceivedMessageSize: 0x60000000,
            }
        );
        wsConn._binaryType = "arraybuffer";
        wsConn.onmessage = this._onmessage;
        this._connectionReadyPromise = new Promise((resolve, reject) => {
            let settled = false;
            const settle = (handler: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                handler();
            };
            const timeoutId = setTimeout(() => {
                settle(() => {
                    reject(
                        new WebSocketQueryError(
                            ErrorCode.ERR_WEBSOCKET_QUERY_TIMEOUT,
                            `websocket connection timeout with ${this._timeout} milliseconds`
                        )
                    );
                });
            }, this._timeout);

            wsConn.onopen = () => {
                logger.debug("websocket connection opened");
                settle(resolve);
            };
            wsConn.onerror = (err: Error) => {
                logger.error(
                    `webSocket connection failed, url: ${maskUrlForLog(new URL(wsConn.url))}, error: ${err.message}`
                );
                if (wsConn.readyState !== w3cwebsocket.OPEN) {
                    settle(() => reject(err));
                }
                this.handleConnectionError(wsConn);
            };
            wsConn.onclose = (e: ICloseEvent) => {
                logger.info("websocket connection closed");
                if (wsConn.readyState !== w3cwebsocket.OPEN) {
                    settle(() => {
                        reject(
                            new WebSocketQueryError(
                                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                                `websocket connection closed: ${e.code} ${e.reason}`
                            )
                        );
                    });
                }
                void this.handleConnectionClose(wsConn, e);
            };
        });
        this._wsConn = wsConn;
    }

    private _onmessage = (event: any) => {
        let data = event.data;
        logger.debug("wsClient._onMessage()====" + Object.prototype.toString.call(data));
        if (Object.prototype.toString.call(data) === "[object ArrayBuffer]") {
            let id = new DataView(data, 26, 8).getBigUint64(0, true);
            WsEventCallback.instance().handleEventCallback(
                { id: id, action: "", req_id: BigInt(0) },
                OnMessageType.MESSAGE_TYPE_ARRAYBUFFER,
                data
            );
        } else if (Object.prototype.toString.call(data) === "[object String]") {
            let msg = JSON.parse(data);
            logger.debug("[_onmessage.stringType]==>:" + data);
            WsEventCallback.instance().handleEventCallback(
                { id: BigInt(0), action: msg.action, req_id: msg.req_id },
                OnMessageType.MESSAGE_TYPE_STRING,
                msg
            );
        } else {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_INVALID_MESSAGE_TYPE,
                `invalid message type ${Object.prototype.toString.call(data)}`
            );
        }
    };

    private shouldSkipReconnect(wsConn: w3cwebsocket): boolean {
        if (!this._allowReconnect) {
            return true;
        }
        return this._suppressedSockets.has(wsConn);
    }

    private handleConnectionError(wsConn: w3cwebsocket): void {
        if (this.shouldSkipReconnect(wsConn) || this._isReconnecting) {
            return;
        }
        void this.triggerReconnect().catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Reconnect failed after websocket error: ${message}`);
        });
    }

    private async handleConnectionClose(
        wsConn: w3cwebsocket,
        e: ICloseEvent
    ): Promise<void> {
        if (this.shouldSkipReconnect(wsConn) || this._isReconnecting) {
            return;
        }
        if (e.code === 1000 || e.code === 1001) {
            return;
        }
        try {
            await this.triggerReconnect();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Reconnect failed after websocket close: ${message}`);
        }
    }

    private extractReqId(reqId: unknown): bigint | null {
        if (reqId === undefined || reqId === null) {
            return null;
        }
        try {
            return BigInt(reqId as bigint | number | string);
        } catch (err) {
            return null;
        }
    }

    private isRetriableAction(action: string): boolean {
        return RETRIABLE_ACTIONS.has(action);
    }

    private extractBinaryAction(message: ArrayBuffer): bigint {
        if (message.byteLength < 24) {
            return -1n;
        }
        return new DataView(message, 16, 8).getBigInt64(0, true);
    }

    private isRetriableBinaryAction(action: bigint): boolean {
        return BINARY_RETRIABLE_ACTIONS.has(action);
    }

    private triggerReconnectInBackground(context: string): void {
        void this.triggerReconnect().catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Reconnect trigger failed (${context}): ${message}`);
        });
    }

    private registerInflightCallback(req: InflightRequest): Promise<void> {
        return WsEventCallback.instance().registerCallback(
            {
                action: req.action,
                req_id: req.reqId,
                timeout: this._timeout,
                id: req.id,
            },
            (result) => {
                this._inflightRequests.delete(req.reqId);
                req.resolve(result);
            },
            (error) => {
                this._inflightRequests.delete(req.reqId);
                req.reject(error);
            }
        );
    }

    async ready() {
        if (this._wsConn && this._wsConn.readyState === w3cwebsocket.OPEN) {
            return;
        }
        if (this._reconnectLock) {
            await this._reconnectLock;
            return;
        }
        try {
            await this._connectionReadyPromise;
        } catch (err) {
            if (this._reconnectLock) {
                await this._reconnectLock;
                return;
            }
            throw err;
        }
    }

    private getCurrentAddress(): string {
        const current = this._addresses[this._currentAddressIndex];
        return `${current.host}:${current.port}`;
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async triggerReconnect(): Promise<void> {
        if (!this._reconnectLock) {
            this._reconnectLock = this._doReconnect();
        }

        const currentLock = this._reconnectLock;
        try {
            await currentLock;
        } finally {
            if (this._reconnectLock === currentLock) {
                this._reconnectLock = null;
            }
        }
    }

    private async _doReconnect(): Promise<void> {
        this._isReconnecting = true;
        try {
            await this.attemptReconnect();
            await this.recoverSessionContext();
            await this.replayRequests();
        } catch (err: unknown) {
            const reconnectError = err instanceof Error
                ? err
                : new Error("unknown reconnect error");
            this.failAllInflightRequests(reconnectError);
            throw reconnectError;
        } finally {
            this._isReconnecting = false;
        }
    }

    private async reconnectToCurrentAddress(): Promise<void> {
        if (this._wsConn) {
            this._suppressedSockets.add(this._wsConn);
            this._wsConn.close();
        }
        this.createConnection();
        await this._connectionReadyPromise;
    }

    private async attemptReconnect(): Promise<void> {
        const totalAddresses = this._addresses.length;

        for (let i = 0; i < totalAddresses; i++) {
            for (let retry = 0; retry <= this._retryConfig.retries; retry++) {
                try {
                    logger.info(
                        `Reconnecting to ${this.getCurrentAddress()}, attempt ${retry + 1}`
                    );
                    await this.reconnectToCurrentAddress();
                    logger.info(
                        `Reconnection successful to ${this.getCurrentAddress()}`
                    );
                    return;
                } catch (err: any) {
                    logger.warn(`Reconnect failed: ${err.message}`);
                    if (retry < this._retryConfig.retries) {
                        const delay = this._retryConfig.getBackoffDelay(retry);
                        await this.sleep(delay);
                    }
                }
            }

            if (i < totalAddresses - 1) {
                this._currentAddressIndex = (this._currentAddressIndex + 1) % totalAddresses;
                logger.info(`Switching to next address: ${this.getCurrentAddress()}`);
            }
        }

        throw new TDWebSocketClientError(
            ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
            "Failed to reconnect to any available address"
        );
    }

    private async replayRequests(): Promise<void> {
        logger.info("Replaying requests after reconnection");
        const inflightRequests = Array.from(this._inflightRequests.values());
        for (const req of inflightRequests) {
            try {
                if (req.registerCallback) {
                    await WsEventCallback.instance().unregisterCallback(req.reqId);
                    await this.registerInflightCallback(req);
                }
                this._wsConn.send(req.message);
                logger.debug("Replayed inflight request");
            } catch (err: any) {
                logger.error(`Failed to replay inflight request: ${err.message}`);
                req.reject(err);
                this._inflightRequests.delete(req.reqId);
                void WsEventCallback.instance().unregisterCallback(req.reqId);
            }
        }
    }

    private failAllInflightRequests(error: Error): void {
        for (const req of this._inflightRequests.values()) {
            req.reject(error);
            void WsEventCallback.instance().unregisterCallback(req.reqId);
        }
        this._inflightRequests.clear();
    }

    close() {
        if (this._wsConn) {
            this._allowReconnect = false;
            this._suppressedSockets.add(this._wsConn);
            this._wsConn.close();
        } else {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                "WebSocket connection is undefined."
            );
        }
    }

    readyState(): number {
        return this._wsConn.readyState;
    }

    public setSessionRecoveryHook(
        hook: SessionRecoveryHook | undefined | null
    ): void {
        this._sessionRecoveryHook = hook || null;
    }

    private async recoverSessionContext(): Promise<void> {
        if (!this._sessionRecoveryHook) {
            return;
        }
        await this._sessionRecoveryHook();
    }

    public async sendMsgDirect(message: string): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsClient.sendMsgDirect()]===>" + maskSensitiveForLog(message));
        }
        if (!this._wsConn || this._wsConn.readyState !== w3cwebsocket.OPEN) {
            throw new WebSocketQueryError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `WebSocket connection is not ready, status: ${this._wsConn?.readyState}`
            );
        }

        const msg = JSON.parse(message);
        const reqId = this.extractReqId(msg?.args?.req_id) ?? BigInt(0);
        const requestId = msg?.args?.id;
        let resolveResponse: (value: unknown) => void = () => { };
        let rejectResponse: (error: unknown) => void = () => { };
        const responsePromise = new Promise((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
        });

        await WsEventCallback.instance().registerCallback(
            {
                action: msg.action,
                req_id: reqId,
                timeout: this._timeout,
                id: requestId !== undefined ? BigInt(requestId) : undefined,
            },
            resolveResponse,
            rejectResponse
        );

        try {
            this._wsConn.send(message);
            return await responsePromise;
        } catch (err) {
            await WsEventCallback.instance().unregisterCallback(reqId);
            throw err;
        }
    }

    async sendMsgNoResp(message: string): Promise<void> {
        logger.debug("[wsClient.sendMsgNoResp()]===>" + maskSensitiveForLog(message));
        if (this._reconnectLock) {
            await this._reconnectLock;
        }

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState === w3cwebsocket.OPEN) {
                this._wsConn.send(message);
                resolve();
            } else {
                reject(
                    new WebSocketQueryError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        `WebSocket connection is not ready, status: ${this._wsConn?.readyState}`
                    )
                );
            }
        });
    }

    async sendMsg(message: string, register: boolean = true) {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsClient.sendMessage()]===>" + maskSensitiveForLog(message));
        }
        const msg = JSON.parse(message);
        const requestId = msg?.args?.id;
        if (this._reconnectLock) {
            await this._reconnectLock;
        }

        return new Promise((resolve, reject) => {
            // if (!this._wsConn || this._wsConn.readyState !== w3cwebsocket.OPEN) {
            //     reject(
            //         new WebSocketQueryError(
            //             ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
            //             `WebSocket connection is not ready, status: ${this._wsConn?.readyState}`
            //         )
            //     );
            //     return;
            // }

            const reqId = this.extractReqId(msg?.args?.req_id);
            const retriable = this.isRetriableAction(msg.action);

            if (retriable && reqId !== null) {
                this._inflightRequests.set(reqId, {
                    reqId,
                    action: msg.action,
                    id: requestId !== undefined ? BigInt(requestId) : undefined,
                    registerCallback: register,
                    message,
                    resolve,
                    reject,
                });
            }

            if (register) {
                void WsEventCallback.instance().registerCallback(
                    {
                        action: msg.action,
                        req_id: reqId ?? BigInt(0),
                        timeout: this._timeout,
                        id: requestId !== undefined ? BigInt(requestId) : undefined,
                    },
                    (result) => {
                        if (reqId !== null) {
                            this._inflightRequests.delete(reqId);
                        }
                        resolve(result);
                    },
                    (error) => {
                        if (reqId !== null) {
                            this._inflightRequests.delete(reqId);
                        }
                        reject(error);
                    }
                ).catch((error) => {
                    if (reqId !== null) {
                        this._inflightRequests.delete(reqId);
                    }
                    reject(error);
                });
            }

            try {
                this._wsConn.send(message);
            } catch (err) {
                if (retriable && reqId !== null) {
                    this.triggerReconnectInBackground("retriable string request send failure");
                    return;
                }

                if (reqId !== null) {
                    this._inflightRequests.delete(reqId);
                    if (register) {
                        void WsEventCallback.instance().unregisterCallback(reqId);
                    }
                }
                reject(err);
            }
        });
    }

    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        register: boolean = true
    ) {
        if (this._reconnectLock) {
            await this._reconnectLock;
        }

        return new Promise((resolve, reject) => {
            if (!this._wsConn || this._wsConn.readyState !== w3cwebsocket.OPEN) {
                reject(
                    new WebSocketQueryError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        `WebSocket connection is not ready, status: ${this._wsConn?.readyState}`
                    )
                );
                return;
            }

            const opCode = this.extractBinaryAction(message);
            const retriable = this.isRetriableBinaryAction(opCode);

            if (retriable) {
                this._inflightRequests.set(reqId, {
                    reqId,
                    action,
                    id: reqId,
                    registerCallback: register,
                    message,
                    resolve,
                    reject,
                });
            }

            if (register) {
                void WsEventCallback.instance().registerCallback(
                    {
                        action,
                        req_id: reqId,
                        timeout: this._timeout,
                        id: reqId,
                    },
                    (result) => {
                        this._inflightRequests.delete(reqId);
                        resolve(result);
                    },
                    (error) => {
                        this._inflightRequests.delete(reqId);
                        reject(error);
                    }
                ).catch((error) => {
                    this._inflightRequests.delete(reqId);
                    reject(error);
                });
            }

            try {
                this._wsConn.send(message);
            } catch (err) {
                if (retriable) {
                    this.triggerReconnectInBackground("retriable binary request send failure");
                    return;
                }
                this._inflightRequests.delete(reqId);
                if (register) {
                    void WsEventCallback.instance().unregisterCallback(reqId);
                }
                reject(err);
            }
        });
    }

    public getWsURL(): URL {
        return this._wsURL;
    }

    public getPoolKey(): string {
        return this._poolKey;
    }
}
