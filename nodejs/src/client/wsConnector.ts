import { ICloseEvent, w3cwebsocket } from "websocket";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketQueryError,
} from "../common/wsError";
import { OnMessageType, WsEventCallback } from "./wsEventCallback";
import logger from "../common/log";
import { ReqId } from "../common/reqid";
import { maskSensitiveForLog, maskUrlForLog, safeDecodeURIComponent } from "../common/utils";
import { HostInfo, ParsedUrl, buildHostUrl } from "../common/urlParser";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

export enum ConnectionState {
    CLOSED = "CLOSED",
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    RECONNECTING = "RECONNECTING",
    CLOSING = "CLOSING",
}

type InflightType = "query" | "write" | "meta" | "fetch";

interface InflightRequest {
    reqId: number;
    callbackId: bigint;
    message: string | ArrayBuffer;
    type: InflightType;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timestamp: number;
    originalTimeoutMs: number;
}

interface QueuedRequest {
    message: string | ArrayBuffer;
    isBinary: boolean;
    reqId?: bigint;
    action?: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

export interface RetryOptions {
    retries: number;
    retryBackoffMs: number;
    retryBackoffMaxMs: number;
    resendWrite: boolean;
}

export interface AuthInfo {
    username: string;
    password: string;
    database?: string;
    timezone?: string;
    bearerToken?: string;
    token?: string;
}

export interface WebSocketConnectorConfig {
    hosts: HostInfo[];
    parsedUrl: ParsedUrl;
    authInfo: AuthInfo;
    retryOptions?: Partial<RetryOptions>;
    timeout?: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    retries: 5,
    retryBackoffMs: 200,
    retryBackoffMaxMs: 2000,
    resendWrite: false,
};

const NORMAL_CLOSE_CODE = 1000;

export class WebSocketConnector {
    private _hosts: HostInfo[];
    private _parsedUrl: ParsedUrl;
    private _authInfo: AuthInfo;
    private _retryOptions: RetryOptions;
    private _timeout: number;
    private _state: ConnectionState = ConnectionState.CLOSED;
    private _connector?: w3cwebsocket;
    private _currentHostIndex: number = 0;
    private _database?: string;

    private _inflightRequests: Map<bigint, InflightRequest> = new Map();
    private _requestQueue: QueuedRequest[] = [];
    private _reconnectPromise?: Promise<void>;
    private _closeCancelled: boolean = false;

    constructor(config: WebSocketConnectorConfig) {
        this._parsedUrl = config.parsedUrl;
        this._hosts = config.hosts;
        this._authInfo = config.authInfo;
        this._retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...config.retryOptions };
        this._timeout = config.timeout || 5000;

        // Random initial host selection for load balancing
        this._currentHostIndex = Math.floor(Math.random() * this._hosts.length);
    }

    get state(): ConnectionState {
        return this._state;
    }

    get currentHost(): HostInfo | undefined {
        return this._hosts[this._currentHostIndex];
    }

    /**
     * Establish connection with retry logic.
     */
    async connect(database?: string): Promise<void> {
        if (this._state !== ConnectionState.CLOSED) {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `Cannot connect in state ${this._state}`
            );
        }

        this._database = database;
        this._state = ConnectionState.CONNECTING;
        this._closeCancelled = false;

        try {
            await this._tryConnect(this._currentHostIndex);
            await this._authenticate(database);
            this._state = ConnectionState.CONNECTED;
        } catch (e) {
            this._state = ConnectionState.CLOSED;
            throw e;
        }
    }

    /**
     * Send a JSON string message through the connection.
     */
    async sendMsg(message: string, register: boolean = true): Promise<any> {
        if (this._state === ConnectionState.RECONNECTING) {
            return this._queueRequest(message, false);
        }

        this._assertConnected();

        const msg = JSON.parse(message);
        const type = this._classifyJsonAction(msg.action);
        const reqId = msg.args?.req_id || ReqId.getReqID();
        const callbackId = msg.args?.id !== undefined ? BigInt(msg.args.id) : BigInt(reqId);

        return new Promise((resolve, reject) => {
            if (register) {
                this._trackInflight({
                    reqId,
                    callbackId,
                    message,
                    type,
                    resolve,
                    reject,
                    timestamp: Date.now(),
                    originalTimeoutMs: this._timeout,
                });
            }

            this._sendMsgInternal(message, register)
                .then((result: any) => {
                    this._inflightRequests.delete(callbackId);
                    if (register) {
                        resolve(result);
                    }
                })
                .catch((err: any) => {
                    this._inflightRequests.delete(callbackId);
                    if (register) {
                        reject(err);
                    }
                });

            if (!register) {
                resolve(undefined);
            }
        });
    }

    /**
     * Send a binary message through the connection.
     */
    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        register: boolean = true
    ): Promise<any> {
        if (this._state === ConnectionState.RECONNECTING) {
            return this._queueBinaryRequest(reqId, action, message);
        }

        this._assertConnected();

        const type = this._classifyBinaryAction(action, message);

        return new Promise((resolve, reject) => {
            if (register) {
                this._trackInflight({
                    reqId: Number(reqId),
                    callbackId: reqId,
                    message,
                    type,
                    resolve,
                    reject,
                    timestamp: Date.now(),
                    originalTimeoutMs: this._timeout,
                });
            }

            this._sendBinaryMsgInternal(reqId, action, message, register)
                .then((result: any) => {
                    this._inflightRequests.delete(reqId);
                    if (register) {
                        resolve(result);
                    }
                })
                .catch((err: any) => {
                    this._inflightRequests.delete(reqId);
                    if (register) {
                        reject(err);
                    }
                });

            if (!register) {
                resolve(undefined);
            }
        });
    }

    /**
     * Send a message without expecting a response.
     */
    async sendMsgNoResp(message: string): Promise<void> {
        if (this._state === ConnectionState.RECONNECTING) {
            await this._queueRequest(message, false);
            return;
        }
        this._assertConnected();
        return this._sendMsgNoRespInternal(message);
    }

    /**
     * Close the connection and clean up.
     */
    async close(): Promise<void> {
        if (this._state === ConnectionState.CLOSED || this._state === ConnectionState.CLOSING) {
            return;
        }

        this._closeCancelled = true;

        if (this._state === ConnectionState.RECONNECTING) {
            // Cancel reconnection, reject all inflight and queued
            this._rejectAllInflight(new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "Connection closed during reconnection"
            ));
            this._rejectAllQueued(new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "Connection closed during reconnection"
            ));
        }

        this._state = ConnectionState.CLOSING;

        try {
            if (this._connector) {
                this._connector.close();
                this._connector = undefined;
            }
        } catch (e) {
            logger.debug("Error closing connector: " + (e as Error).message);
        }

        this._inflightRequests.clear();
        this._requestQueue = [];
        this._state = ConnectionState.CLOSED;
    }

    /**
     * Get the ready state of the underlying WebSocket.
     */
    readyState(): number {
        if (this._connector) {
            return this._connector.readyState;
        }
        return w3cwebsocket.CLOSED;
    }

    /**
     * Generate multi-host URL string for connection pool key.
     */
    getMultiHostUrl(): string {
        const hostStrings = this._hosts.map(h => `${h.host}:${h.port}`);
        const protocol = this._parsedUrl.scheme;
        const pathname = "/ws";
        const params = new URLSearchParams();
        this._parsedUrl.params.forEach((value, key) => {
            params.set(key, value);
        });
        const search = params.toString() ? `?${params.toString()}` : "";
        return `${protocol}://${hostStrings.join(',')}${pathname}${search}`;
    }

    // ============ Private: Connection & Retry ============

    /**
     * Try to connect starting from a given host index.
     * Iterates through all hosts with per-host retries and exponential backoff.
     */
    private async _tryConnect(startIndex: number): Promise<void> {
        const totalHosts = this._hosts.length;
        const errors: string[] = [];

        for (let hostOffset = 0; hostOffset < totalHosts; hostOffset++) {
            const hostIndex = (startIndex + hostOffset) % totalHosts;
            const host = this._hosts[hostIndex];
            const hostUrl = buildHostUrl(this._parsedUrl, host);

            let backoffMs = this._retryOptions.retryBackoffMs;

            for (let attempt = 0; attempt <= this._retryOptions.retries; attempt++) {
                if (this._closeCancelled) {
                    throw new TDWebSocketClientError(
                        ErrorCode.ERR_CONNECTION_CLOSED,
                        "Connection attempt cancelled"
                    );
                }

                try {
                    logger.info(
                        `Connecting to ${maskUrlForLog(hostUrl)} (host ${hostOffset + 1}/${totalHosts}, attempt ${attempt + 1}/${this._retryOptions.retries + 1})`
                    );

                    // Clean up previous connector
                    if (this._connector) {
                        try { this._connector.close(); } catch (_) { /* ignore */ }
                        this._connector = undefined;
                    }

                    await this._createConnector(hostUrl);
                    this._currentHostIndex = hostIndex;

                    logger.info(`Connected to ${maskUrlForLog(hostUrl)}`);
                    return;
                } catch (e: any) {
                    const errMsg = `Host ${host.host}:${host.port} attempt ${attempt + 1} failed: ${e.message}`;
                    errors.push(errMsg);
                    logger.info(errMsg);

                    if (attempt < this._retryOptions.retries) {
                        logger.info(`Retrying in ${backoffMs}ms...`);
                        await this._sleep(backoffMs);
                        backoffMs = Math.min(backoffMs * 2, this._retryOptions.retryBackoffMaxMs);
                    }
                }
            }

            if (hostOffset < totalHosts - 1) {
                const nextHost = this._hosts[(startIndex + hostOffset + 1) % totalHosts];
                logger.warn(`All retries exhausted for ${host.host}:${host.port}, switching to ${nextHost.host}:${nextHost.port}`);
            }
        }

        throw new TDWebSocketClientError(
            ErrorCode.ERR_ALL_HOSTS_EXHAUSTED,
            `All hosts exhausted after retry. Errors: ${errors.join("; ")}`
        );
    }

    /**
     * Create a WebSocket connector and wait for it to be ready.
     */
    private async _createConnector(url: URL): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const origin = url.origin;
            const pathname = url.pathname;
            const search = url.search;

            this._connector = new w3cwebsocket(
                origin.concat(pathname).concat(search),
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    maxReceivedFrameSize: 0x60000000,
                    maxReceivedMessageSize: 0x60000000,
                }
            );

            this._connector.onerror = (err: Error) => {
                logger.error(`WebSocket connection failed, url: ${maskUrlForLog(url)}, error: ${err.message}`);
            };

            this._connector.onclose = this._createOnCloseHandler();
            this._connector.onmessage = this._onmessage.bind(this);
            (this._connector as any)._binaryType = "arraybuffer";

            const reqId = ReqId.getReqID();
            WsEventCallback.instance().registerCallback(
                {
                    action: "websocket_connection",
                    req_id: BigInt(reqId),
                    timeout: this._timeout,
                    id: BigInt(reqId),
                },
                resolve as (args: unknown) => void,
                reject
            );

            this._connector.onopen = () => {
                logger.debug("WebSocket connection opened");
                WsEventCallback.instance().handleEventCallback(
                    {
                        id: BigInt(reqId),
                        action: "websocket_connection",
                        req_id: BigInt(reqId),
                    },
                    OnMessageType.MESSAGE_TYPE_CONNECTION,
                    this
                );
            };
        });
    }

    /**
     * Create onclose handler for disconnect detection.
     */
    private _createOnCloseHandler(): (e: ICloseEvent) => void {
        return (e: ICloseEvent) => {
            if (e.code === NORMAL_CLOSE_CODE) {
                logger.info("WebSocket closed normally (code 1000), not reconnecting");
                return;
            }

            if (this._state === ConnectionState.CLOSING || this._state === ConnectionState.CLOSED) {
                return;
            }

            logger.warn(`WebSocket disconnected unexpectedly (code: ${e.code}, reason: ${e.reason}). Initiating reconnection...`);
            this._onDisconnect();
        };
    }

    /**
     * Authenticate with the server (send conn action).
     */
    private async _authenticate(database?: string): Promise<void> {
        const connMsg = {
            action: "conn",
            args: {
                req_id: ReqId.getReqID(),
                user: safeDecodeURIComponent(this._authInfo.username),
                password: safeDecodeURIComponent(this._authInfo.password),
                db: database,
                connector: ConnectorInfo,
                ...(this._authInfo.timezone && { tz: this._authInfo.timezone }),
                ...(this._authInfo.bearerToken && { bearer_token: this._authInfo.bearerToken }),
            },
        };

        try {
            const result: any = await this._sendMsgInternal(JSON.stringify(connMsg), true);
            if (result.msg.code !== 0) {
                throw new WebSocketQueryError(result.msg.code, result.msg.message);
            }
        } catch (e: any) {
            // If it's already a WebSocketQueryError, preserve the original error
            if (e instanceof WebSocketQueryError) {
                throw e;
            }
            // For other errors, wrap as authentication failure
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `Authentication failed: ${e.message || e}`
            );
        }
    }

    /**
     * Re-send options_connection (timezone) after reconnect.
     */
    private async _restoreOptions(): Promise<void> {
        if (this._authInfo.timezone) {
            const optMsg = {
                action: "options_connection",
                args: {
                    req_id: ReqId.getReqID(),
                    options: [
                        {
                            option: TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_TIMEZONE,
                            value: this._authInfo.timezone,
                        },
                    ],
                },
            };
            try {
                const result: any = await this._sendMsgInternal(JSON.stringify(optMsg), true);
                if (result.msg.code !== 0) {
                    logger.warn(`Failed to restore timezone option: ${result.msg.message}`);
                }
            } catch (e: any) {
                logger.warn(`Failed to restore timezone option: ${e.message}`);
            }
        }
    }

    /**
     * Handle unexpected disconnection: transition to RECONNECTING, preserve inflight, trigger reconnect.
     */
    private _onDisconnect(): void {
        if (this._state !== ConnectionState.CONNECTED) {
            return;
        }

        this._state = ConnectionState.RECONNECTING;

        // Cancel all WsEventCallback timers and collect inflight info
        this._cancelEventCallbackTimers();

        // Start reconnection (non-blocking)
        this._reconnectPromise = this._doReconnect()
            .then(() => {
                this._reconnectPromise = undefined;
            })
            .catch((err) => {
                this._reconnectPromise = undefined;
                logger.error(`Reconnection failed: ${err.message}`);
            });
    }

    /**
     * Perform the reconnection sequence: reconnect, re-auth, resend inflight, drain queue.
     */
    private async _doReconnect(): Promise<void> {
        const nextIndex = (this._currentHostIndex + 1) % this._hosts.length;

        try {
            await this._tryConnect(nextIndex);
            await this._authenticate(this._database);
            await this._restoreOptions();

            this._state = ConnectionState.CONNECTED;
            logger.info("Reconnection successful");

            // Resend inflight requests based on type
            await this._resendInflight();

            // Drain queued requests
            await this._drainQueue();
        } catch (e: any) {
            logger.error(`Reconnection failed after all retries: ${e.message}`);
            this._state = ConnectionState.CLOSED;

            const reconnectError = new TDWebSocketClientError(
                ErrorCode.ERR_RECONNECT_FAILED,
                `Reconnection failed: ${e.message}`
            );
            this._rejectAllInflight(reconnectError);
            this._rejectAllQueued(reconnectError);
        }
    }

    /**
     * Cancel all pending WsEventCallback timers.
     */
    private async _cancelEventCallbackTimers(): Promise<void> {
        try {
            await WsEventCallback.instance().cancelAllCallbacks();
        } catch (e: any) {
            logger.debug(`Error cancelling callbacks: ${e.message}`);
        }
    }

    // ============ Private: Inflight & Queue Management ============

    private _trackInflight(req: InflightRequest): void {
        this._inflightRequests.set(req.callbackId, req);
    }

    /**
     * Resend inflight requests after reconnection, per type policy.
     */
    private async _resendInflight(): Promise<void> {
        const toResend: InflightRequest[] = [];
        const toReject: InflightRequest[] = [];

        for (const [id, req] of this._inflightRequests) {
            if (req.type === "meta") {
                // Always resend meta requests
                toResend.push(req);
            } else if (req.type === "fetch") {
                // Never resend fetch — cursor is lost
                toReject.push(req);
            } else if (req.type === "write") {
                if (this._retryOptions.resendWrite) {
                    toResend.push(req);
                } else {
                    toReject.push(req);
                }
            } else {
                // query — resend by default
                toResend.push(req);
            }
        }

        // Reject non-resendable
        for (const req of toReject) {
            this._inflightRequests.delete(req.callbackId);
            req.reject(new TDWebSocketClientError(
                ErrorCode.ERR_RECONNECT_FAILED,
                `Request (type: ${req.type}) not resent after failover`
            ));
        }

        if (toResend.length > 0) {
            logger.info(`Resending ${toResend.length} inflight requests after reconnect`);
        }

        // Resend eligible requests
        for (const req of toResend) {
            this._inflightRequests.delete(req.callbackId);
            try {
                if (typeof req.message === "string") {
                    const result = await this._sendMsgInternal(req.message, true);
                    req.resolve(result);
                } else {
                    const result = await this._sendBinaryMsgInternal(
                        req.callbackId,
                        "", // action will be read from binary header
                        req.message,
                        true
                    );
                    req.resolve(result);
                }
            } catch (e) {
                req.reject(e);
            }
        }
    }

    /**
     * Drain the request queue after reconnection.
     */
    private async _drainQueue(): Promise<void> {
        const queue = [...this._requestQueue];
        this._requestQueue = [];

        for (const req of queue) {
            try {
                if (req.isBinary && req.reqId && req.action) {
                    const result = await this._sendBinaryMsgInternal(req.reqId, req.action, req.message as ArrayBuffer, true);
                    req.resolve(result);
                } else {
                    const result = await this._sendMsgInternal(req.message as string, true);
                    req.resolve(result);
                }
            } catch (e) {
                req.reject(e);
            }
        }
    }

    private _queueRequest(message: string, isBinary: boolean): Promise<any> {
        return new Promise((resolve, reject) => {
            this._requestQueue.push({ message, isBinary, resolve, reject });
        });
    }

    private _queueBinaryRequest(reqId: bigint, action: string, message: ArrayBuffer): Promise<any> {
        return new Promise((resolve, reject) => {
            this._requestQueue.push({
                message,
                isBinary: true,
                reqId,
                action,
                resolve,
                reject,
            });
        });
    }

    private _rejectAllInflight(error: Error): void {
        for (const [id, req] of this._inflightRequests) {
            req.reject(error);
        }
        this._inflightRequests.clear();
    }

    private _rejectAllQueued(error: Error): void {
        for (const req of this._requestQueue) {
            req.reject(error);
        }
        this._requestQueue = [];
    }

    private _assertConnected(): void {
        if (this._state !== ConnectionState.CONNECTED) {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                `Connection not available (state: ${this._state})`
            );
        }
        if (!this._connector || this._connector.readyState !== w3cwebsocket.OPEN) {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "WebSocket connection is not open"
            );
        }
    }

    // ============ Private: Low-level Send Methods ============

    private async _sendMsgInternal(message: string, register: boolean): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsConnector.sendMsg]===>" + maskSensitiveForLog(message));
        }
        const msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id);
        }

        return new Promise((resolve, reject) => {
            if (this._connector && this._connector.readyState === w3cwebsocket.OPEN) {
                if (register) {
                    WsEventCallback.instance().registerCallback(
                        {
                            action: msg.action,
                            req_id: msg.args.req_id,
                            timeout: this._timeout,
                            id: msg.args.id === undefined ? msg.args.id : BigInt(msg.args.id),
                        },
                        resolve,
                        reject
                    );
                }
                if (logger.isDebugEnabled()) {
                    logger.debug("[wsConnector.sendMsg.msg]===>" + maskSensitiveForLog(message));
                }
                this._connector.send(message);
            } else {
                reject(
                    new WebSocketQueryError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        `WebSocket connection is not ready, status: ${this._connector?.readyState}`
                    )
                );
            }
        });
    }

    private async _sendBinaryMsgInternal(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        register: boolean
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this._connector && this._connector.readyState === w3cwebsocket.OPEN) {
                if (register) {
                    WsEventCallback.instance().registerCallback(
                        {
                            action: action,
                            req_id: reqId,
                            timeout: this._timeout,
                            id: reqId,
                        },
                        resolve,
                        reject
                    );
                }
                logger.debug(
                    "[wsConnector.sendBinaryMsg()]===>" +
                    reqId +
                    action +
                    message.byteLength
                );
                this._connector.send(message);
            } else {
                reject(
                    new WebSocketQueryError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        `WebSocket connection is not ready, status: ${this._connector?.readyState}`
                    )
                );
            }
        });
    }

    private async _sendMsgNoRespInternal(message: string): Promise<void> {
        logger.debug("[wsConnector.sendMsgNoResp()]===>" + message);
        const msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id);
        }

        return new Promise((resolve, reject) => {
            if (this._connector && this._connector.readyState === w3cwebsocket.OPEN) {
                this._connector.send(message);
                resolve();
            } else {
                reject(
                    new WebSocketQueryError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        `WebSocket connection is not ready, status: ${this._connector?.readyState}`
                    )
                );
            }
        });
    }

    private _onmessage(event: any): void {
        const data = event.data;
        logger.debug("wsConnector._onMessage()====" + Object.prototype.toString.call(data));
        if (Object.prototype.toString.call(data) === "[object ArrayBuffer]") {
            const id = new DataView(data, 26, 8).getBigUint64(0, true);
            WsEventCallback.instance().handleEventCallback(
                { id: id, action: "", req_id: BigInt(0) },
                OnMessageType.MESSAGE_TYPE_ARRAYBUFFER,
                data
            );
        } else if (Object.prototype.toString.call(data) === "[object String]") {
            const msg = JSON.parse(data);
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
    }

    // ============ Private: Action Classification ============

    /**
     * Classify a JSON action string into an inflight type.
     */
    private _classifyJsonAction(action: string): InflightType {
        switch (action) {
            case "conn":
            case "version":
            case "options_connection":
                return "meta";
            case "insert":
                return "write";
            case "fetch":
            case "fetch_raw_block":
            case "free_result":
                return "fetch";
            default:
                return "query";
        }
    }

    /**
     * Classify a binary message action.
     * For binary_query, inspects SQL text to distinguish query vs write.
     */
    private _classifyBinaryAction(action: string, message: ArrayBuffer): InflightType {
        if (action === "fetch" || action === "fetch_raw_block" || action === "free_result") {
            return "fetch";
        }

        // For binary_query, try to detect SQL type from the buffer
        if (message.byteLength > 30) {
            try {
                const decoder = new TextDecoder();
                const sqlBytes = new Uint8Array(message, 30);
                const sql = decoder.decode(sqlBytes).trim().toUpperCase();
                if (
                    sql.startsWith("SELECT") ||
                    sql.startsWith("SHOW") ||
                    sql.startsWith("DESCRIBE") ||
                    sql.startsWith("DESC ")
                ) {
                    return "query";
                }
                return "write";
            } catch {
                return "query"; // default to query if can't parse
            }
        }

        // FetchRawBlockMessage has shorter buffer (26 bytes) — it's a fetch
        if (message.byteLength <= 26) {
            return "fetch";
        }

        return "query";
    }

    // ============ Private: Utility ============

    private _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
