import { ICloseEvent, w3cwebsocket } from "websocket";
import { Address, Dsn } from "../common/dsn";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketQueryError,
} from "../common/wsError";
import { OnMessageType, WsEventCallback } from "./wsEventCallback";
import logger from "../common/log";
import {
    maskSensitiveForLog,
    maskUrlForLog,
    normalizePath,
    parseNonNegativeInt,
    parsePositiveInt
} from "../common/utils";

interface InflightRequest {
    reqId: bigint;
    action: string;
    id?: bigint;
    message: string | ArrayBuffer;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
}

class InflightRequestStore {
    private nextMsgId = 1n;
    private readonly reqIdToMsgId: Map<bigint, bigint> = new Map();
    private readonly msgIdToRequest: Map<bigint, InflightRequest> = new Map();

    insert(req: InflightRequest): void {
        const msgId = this.nextMsgId;
        this.nextMsgId += 1n;
        this.reqIdToMsgId.set(req.reqId, msgId);
        this.msgIdToRequest.set(msgId, req);
    }

    remove(reqId: bigint): void {
        const msgId = this.reqIdToMsgId.get(reqId);
        if (msgId === undefined) {
            return;
        }

        this.reqIdToMsgId.delete(reqId);
        this.msgIdToRequest.delete(msgId);
    }

    getRequests(): InflightRequest[] {
        return Array.from(this.msgIdToRequest.entries())
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([, req]) => req);
    }

    clear(): void {
        this.nextMsgId = 1n;
        this.reqIdToMsgId.clear();
        this.msgIdToRequest.clear();
    }
}

type SessionRecoveryHook = () => Promise<void>;

const RETRIABLE_ACTIONS = new Set(["insert", "options_connection"]);
// TDengine websocket binary op codes that are safe to replay after reconnect.
const BINARY_RETRIABLE_ACTIONS = new Set<bigint>([4n, 5n, 6n, 10n]);

const DEFAULT_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 200;
const DEFAULT_BACKOFF_MAX_MS = 2000;

const NETWORK_ERROR_CODES = new Set([
    "econnreset",
    "econnrefused",
    "ehostunreach",
    "enotfound",
    "eai_again",
    "epipe",
    "etimedout",
    "err_socket_closed",
    "err_stream_write_after_end",
]);
const NETWORK_ERROR_MESSAGE_PATTERNS = [
    "not connected",
    "socket",
    "network",
    "econnreset",
    "econnrefused",
    "epipe",
    "etimedout",
    "write after end",
    "broken pipe",
    "connection reset",
    "connection closed",
];

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
    private _conn!: w3cwebsocket;
    private readonly _poolKey: string;
    private readonly _addresses: Address[];
    private _currentAddressIndex: number;
    private readonly _retryConfig: RetryConfig;
    // TODO: use Dsn replacement to simplify the constructor parameters
    private readonly _scheme: string;
    private readonly _path: string;
    private readonly _params: Map<string, string>;
    private _inflightStore: InflightRequestStore;
    private readonly _suppressedSockets: WeakSet<w3cwebsocket> = new WeakSet();
    private _reconnectLock: Promise<void> | null = null;
    private _isReconnecting = false;
    private _allowReconnect = true;
    private _connectionReady: Promise<void> = Promise.resolve();
    private _sessionRecoveryHook: SessionRecoveryHook | null = null;
    private _timeout = 60000;

    constructor(
        dsn: Dsn,
        path: string,
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
        this._path = normalizePath(path);
        this._params = new Map(dsn.params);
        this._inflightStore = new InflightRequestStore();
        if (timeout) {
            this._timeout = timeout;
        }
        logger.info(`Initial websocket address selected: ${this.getCurrentAddress()}`);
        this.createConnection();
    }

    private selectRandomIndex(): number {
        if (this._addresses.length <= 1) {
            return 0;
        }
        return Math.floor(Math.random() * this._addresses.length);
    }

    private buildUrl(index: number): string {
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
        const conn = new w3cwebsocket(
            this.buildUrl(this._currentAddressIndex),
            undefined,
            undefined,
            undefined,
            undefined,
            {
                maxReceivedFrameSize: 0x60000000,
                maxReceivedMessageSize: 0x60000000,
            }
        );
        conn._binaryType = "arraybuffer";
        conn.onmessage = this._onmessage;
        this._connectionReady = new Promise((resolve, reject) => {
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

            conn.onopen = () => {
                logger.debug("websocket connection opened");
                settle(resolve);
            };
            conn.onerror = (err: Error) => {
                logger.error(
                    `webSocket connection failed, url: ${maskUrlForLog(new URL(conn.url))}, error: ${err.message}`
                );
                if (conn.readyState !== w3cwebsocket.OPEN) {
                    settle(() => reject(err));
                }
                void this.handleDisconnect(conn);
            };
            conn.onclose = (e: ICloseEvent) => {
                logger.info("websocket connection closed");
                if (conn.readyState !== w3cwebsocket.OPEN) {
                    settle(() => {
                        reject(
                            new WebSocketQueryError(
                                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                                `websocket connection closed: ${e.code} ${e.reason}`
                            )
                        );
                    });
                }
                void this.handleDisconnect(conn, e);
            };
        });
        this._conn = conn;
    }

    private _onmessage(event: any) {
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

    private shouldSkipReconnect(conn: w3cwebsocket): boolean {
        if (!this._allowReconnect) {
            return true;
        }
        return this._suppressedSockets.has(conn);
    }

    private async handleDisconnect(conn: w3cwebsocket, event?: ICloseEvent): Promise<void> {
        if (this.shouldSkipReconnect(conn) || this._isReconnecting) {
            return;
        }
        if (event && event.code === 1000) {
            logger.info("Websocket closed normally, skipping reconnect.");
            return;
        }
        try {
            await this.triggerReconnect();
        } catch (err: unknown) {
            const type = event ? 'close' : 'error';
            const message = err instanceof Error ? err.message : String(err);
            logger.error(`Reconnect failed after websocket ${type}: ${message}`);
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

    private isNetworkError(err: unknown): boolean {
        if (!this._conn || this._conn.readyState !== w3cwebsocket.OPEN) {
            return true;
        }

        const errObj = err as { code?: unknown; message?: unknown };
        const code = typeof errObj?.code === "string" ? errObj.code.toLowerCase() : "";
        if (code.length > 0 && NETWORK_ERROR_CODES.has(code)) {
            return true;
        }

        const message = err instanceof Error
            ? err.message
            : typeof errObj?.message === "string"
                ? errObj.message
                : String(err);
        const lowered = message.toLowerCase();
        return NETWORK_ERROR_MESSAGE_PATTERNS.some((pattern) =>
            lowered.includes(pattern)
        );
    }

    private send(message: string | ArrayBuffer, triggerReconnect: boolean = true): void {
        try {
            this._conn.send(message);
        } catch (err) {
            if (triggerReconnect && this.isNetworkError(err)) {
                void this.triggerReconnect().catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err);
                    logger.error(`Reconnect trigger failed: ${message}`);
                });
            }
            throw err;
        }
    }

    async ready(): Promise<void> {
        if (this._conn && this._conn.readyState === w3cwebsocket.OPEN) {
            return;
        }
        if (this._reconnectLock) {
            await this._reconnectLock;
            return;
        }
        try {
            await this._connectionReady;
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

        const lock = this._reconnectLock;
        try {
            await lock;
        } finally {
            if (this._reconnectLock === lock) {
                this._reconnectLock = null;
            }
        }
    }

    private async _doReconnect(): Promise<void> {
        this._isReconnecting = true;
        try {
            await this.attemptReconnect();
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

    private async reconnect(): Promise<void> {
        if (this._conn) {
            this._suppressedSockets.add(this._conn);
            this._conn.close();
        }
        this.createConnection();
        await this._connectionReady;
    }

    private async attemptReconnect(): Promise<void> {
        const totalAddresses = this._addresses.length;

        for (let i = 0; i < totalAddresses; i++) {
            for (let retry = 0; retry < this._retryConfig.retries; retry++) {
                try {
                    logger.info(`Reconnecting to ${this.getCurrentAddress()}, attempt ${retry + 1}`);
                    await this.reconnect();
                    await this.recoverSessionContext();
                    await this.replayRequests();
                    logger.info(`Reconnection successful to ${this.getCurrentAddress()}`);
                    return;
                } catch (err: any) {
                    logger.warn(`Reconnect failed: ${err.message}`);
                    if (retry < this._retryConfig.retries - 1) {
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
        for (const req of this._inflightStore.getRequests()) {
            try {
                this.send(req.message, false);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (this.isNetworkError(err)) {
                    logger.warn(`Network error while replaying inflight request, stopping current replay round: ${message}`);
                    throw err;
                }
                logger.error(`Failed to replay inflight request: ${req}, error: ${message}`);
                req.reject(err);
            }
        }
    }

    private failAllInflightRequests(error: Error): void {
        for (const req of this._inflightStore.getRequests()) {
            req.reject(error);
        }
        this._inflightStore.clear();
    }

    close() {
        if (this._conn) {
            this._allowReconnect = false;
            this._suppressedSockets.add(this._conn);
            this._conn.close();
        } else {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                "WebSocket connection is undefined"
            );
        }
    }

    readyState(): number {
        return this._conn.readyState;
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
            logger.debug("[wsClient.sendMsgDirect]===>" + maskSensitiveForLog(message));
        }

        const msg = JSON.parse(message);
        const reqId = this.extractReqId(msg?.args?.req_id) ?? BigInt(0);

        let resolveResp: (value: unknown) => void = () => { };
        let rejectResp: (error: unknown) => void = () => { };
        const responsePromise = new Promise((resolve, reject) => {
            resolveResp = resolve;
            rejectResp = reject;
        });

        await WsEventCallback.instance().registerCallback(
            {
                action: msg.action,
                req_id: reqId,
                timeout: this._timeout,
            },
            resolveResp,
            rejectResp
        );

        try {
            this.send(message, false);
            return await responsePromise;
        } catch (err) {
            await WsEventCallback.instance().unregisterCallback(reqId);
            throw err;
        }
    }

    async sendMsgNoResp(message: string): Promise<void> {
        logger.debug("[wsClient.sendMsgNoResp]===>" + message);
        if (this._reconnectLock) {
            await this._reconnectLock;
        }
        this.send(message);
    }

    async sendMsg(message: string) {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsConnector.sendMsg]===>" + maskSensitiveForLog(message));
        }
        const msg = JSON.parse(message);
        const id = msg?.args?.id !== undefined ? BigInt(msg.args.id) : undefined;
        const reqId = this.extractReqId(msg?.args?.req_id) ?? BigInt(0);
        return this.sendAndTrackResponse(
            reqId,
            msg.action,
            message,
            this.isRetriableAction(msg.action),
            id,
        );
    }

    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
    ) {
        return this.sendAndTrackResponse(
            reqId,
            action,
            message,
            this.isRetriableBinaryAction(this.extractBinaryAction(message)),
            reqId,
        );
    }

    private async sendAndTrackResponse(
        reqId: bigint,
        action: string,
        message: string | ArrayBuffer,
        retriable: boolean,
        callbackId?: bigint,
    ) {
        if (this._reconnectLock) {
            await this._reconnectLock;
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const safeResolve = (result: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (retriable) {
                    this._inflightStore.remove(reqId);
                }
                resolve(result);
            };
            const safeReject = (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (retriable) {
                    this._inflightStore.remove(reqId);
                }
                void WsEventCallback.instance().unregisterCallback(reqId);
                reject(error);
            };

            if (retriable) {
                this._inflightStore.insert({
                    reqId,
                    action,
                    id: callbackId,
                    message,
                    resolve: safeResolve,
                    reject: safeReject,
                });
            }

            void WsEventCallback.instance()
                .registerCallback(
                    {
                        action,
                        req_id: reqId,
                        timeout: this._timeout,
                        id: callbackId,
                    },
                    safeResolve,
                    safeReject
                )
                .then(() => {
                    try {
                        this.send(message);
                    } catch (err) {
                        if (retriable && this.isNetworkError(err)) {
                            return;
                        }
                        safeReject(err);
                    }
                })
                .catch((error) => {
                    safeReject(error);
                });
        });
    }

    public getPoolKey(): string {
        return this._poolKey;
    }
}
