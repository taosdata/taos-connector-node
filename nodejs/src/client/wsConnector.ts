import { Mutex } from "async-mutex";
import { ICloseEvent, w3cwebsocket } from "websocket";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketQueryError,
} from "../common/wsError";
import { OnMessageType, WsEventCallback } from "./wsEventCallback";
import {
    ParsedMultiAddress,
    buildUrlForHost,
    parseMultiAddressUrl,
} from "../common/urlParser";
import logger from "../common/log";
import { ReqId } from "../common/reqid";
import { maskSensitiveForLog, maskUrlForLog } from "../common/utils";

export interface InflightRequest {
    id: string;
    type: "text" | "binary";
    message?: string;
    reqId?: bigint;
    action?: string;
    binaryData?: ArrayBuffer;
    resolve: (args: unknown) => void;
    reject: (reason: any) => void;
    register: boolean;
}

export class WebSocketConnector {
    private _wsConn: w3cwebsocket | null = null;
    private _rawUrl: string;
    private _parsed: ParsedMultiAddress;
    private _currentIndex: number;
    _timeout = 5000;

    // Failover state
    private _inflightRequests: Map<string, InflightRequest> = new Map();
    private _reconnectMutex = new Mutex();
    private _closed: boolean = false;

    constructor(url: string, timeout?: number | null) {
        if (!url) {
            throw new WebSocketQueryError(
                ErrorCode.ERR_INVALID_URL,
                "websocket URL must be defined"
            );
        }
        this._rawUrl = url;
        this._parsed = parseMultiAddressUrl(url);
        this._currentIndex = this._parsed.hosts.length > 1
            ? Math.floor(Math.random() * this._parsed.hosts.length)
            : 0;
        if (timeout) {
            this._timeout = timeout;
        }
    }

    /** Parsed multi-address info. */
    getParsed(): ParsedMultiAddress {
        return this._parsed;
    }

    /** URL object for the current host. */
    getCurrentUrl(): URL {
        return buildUrlForHost(this._parsed, this._currentIndex);
    }

    /** Establish the initial WebSocket connection. */
    async connect(): Promise<void> {
        this._wsConn = this._createWsConnection(this._currentIndex);
        await this._ready();
    }

    /** Check if the current connection is open. */
    isConnected(): boolean {
        return (
            this._wsConn !== null &&
            this._wsConn.readyState === w3cwebsocket.OPEN
        );
    }

    readyState(): number {
        return this._wsConn ? this._wsConn.readyState : w3cwebsocket.CLOSED;
    }

    /**
     * Perform failover: retry current host, then round-robin through others.
     * Returns once reconnected or throws if all hosts fail.
     */
    async reconnect(): Promise<void> {
        const release = await this._reconnectMutex.acquire();
        try {
            if (this.isConnected()) return;
            if (this._closed) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_CONNECTION_CLOSED,
                    "WebSocketConnector is closed"
                );
            }

            const totalHosts = this._parsed.hosts.length;
            for (let i = 0; i < totalHosts; i++) {
                const hostIndex = (this._currentIndex + i) % totalHosts;
                const conn = await this._tryConnectWithRetries(hostIndex);
                if (conn) {
                    if (this._wsConn) {
                        try { this._wsConn.close(); } catch (_) { /* ignore */ }
                    }
                    this._wsConn = conn;
                    this._currentIndex = hostIndex;
                    await this._resendInflightRequests();
                    return;
                }
            }

            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `Failover failed: all ${totalHosts} hosts exhausted after retries`
            );
        } finally {
            release();
        }
    }

    /** Track an inflight request for potential resend on reconnect. */
    trackRequest(id: string, request: InflightRequest): void {
        this._inflightRequests.set(id, request);
    }

    /** Remove a completed request from inflight tracking. */
    completeRequest(id: string): void {
        this._inflightRequests.delete(id);
    }

    /** Get inflight request count (for diagnostics). */
    getInflightCount(): number {
        return this._inflightRequests.size;
    }

    close() {
        this._closed = true;
        if (this._wsConn) {
            this._wsConn.close();
            this._wsConn = null;
        }
        this._inflightRequests.clear();
    }

    async sendMsgNoResp(message: string): Promise<void> {
        logger.debug("[wsClient.sendMsgNoResp()]===>" + message);
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

    async sendMsg(message: string, register: Boolean = true) {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsClient.sendMessage()]===>" + maskSensitiveForLog(message));
        }
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id);
        }

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState === w3cwebsocket.OPEN) {
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
                    logger.debug("[wsClient.sendMessage.msg]===>" + maskSensitiveForLog(message));
                }
                this._wsConn.send(message);
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

    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        register: Boolean = true
    ) {
        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState === w3cwebsocket.OPEN) {
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
                    "[wsClient.sendBinaryMsg()]===>" +
                    reqId +
                    action +
                    message.byteLength
                );
                this._wsConn.send(message);
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

    /** Send raw binary data without callback registration (used for inflight resend). */
    sendBinaryMsgRaw(message: ArrayBuffer): void {
        if (this._wsConn && this._wsConn.readyState === w3cwebsocket.OPEN) {
            this._wsConn.send(message);
        } else {
            throw new WebSocketQueryError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `WebSocket connection is not ready, status: ${this._wsConn?.readyState}`
            );
        }
    }

    // ── private helpers ──

    /** Create a raw w3cwebsocket connection for a specific host. */
    private _createWsConnection(hostIndex: number): w3cwebsocket {
        const url = buildUrlForHost(this._parsed, hostIndex);
        const addr = url.origin + url.pathname + url.search;
        const conn = new w3cwebsocket(
            addr,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                maxReceivedFrameSize: 0x60000000,
                maxReceivedMessageSize: 0x60000000,
            }
        );
        conn.onerror = function (err: Error) {
            logger.error(`webSocket connection failed, url: ${maskUrlForLog(url)}, error: ${err.message}`);
        };
        conn.onclose = (e: ICloseEvent) => {
            logger.info("websocket connection closed");
            if (!this._closed) {
                logger.warn(
                    "WebSocket connection closed, failover will be triggered on next operation"
                );
            }
        };
        conn.onmessage = this._onmessage;
        conn._binaryType = "arraybuffer";
        return conn;
    }

    /** Wait for the current WebSocket to open and fire the connection callback. */
    private _ready(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this._wsConn) {
                return reject(
                    new TDWebSocketClientError(
                        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                        "WebSocket connection is undefined."
                    )
                );
            }
            const reqId = ReqId.getReqID();
            WsEventCallback.instance().registerCallback(
                {
                    action: "websocket_connection",
                    req_id: BigInt(reqId),
                    timeout: this._timeout,
                    id: BigInt(reqId),
                },
                resolve,
                reject
            );

            this._wsConn.onopen = () => {
                logger.debug("websocket connection opened");
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
    }

    /** Try connecting to a specific host with exponential backoff retries. */
    private async _tryConnectWithRetries(
        hostIndex: number
    ): Promise<w3cwebsocket | null> {
        const retries = this._parsed.retries;
        const baseBackoff = this._parsed.retryBackoffMs;
        const maxBackoff = this._parsed.retryBackoffMaxMs;
        const url = buildUrlForHost(this._parsed, hostIndex);

        for (let attempt = 0; attempt <= retries; attempt++) {
            if (this._closed) return null;
            try {
                logger.info(
                    `Attempting connection to ${maskUrlForLog(url)}, attempt ${attempt + 1}/${retries + 1}`
                );
                const conn = this._createWsConnection(hostIndex);
                this._wsConn = conn;
                await this._ready();
                logger.info(`Successfully connected to ${maskUrlForLog(url)}`);
                return conn;
            } catch (e: any) {
                logger.warn(
                    `Connection attempt ${attempt + 1} to ${maskUrlForLog(url)} failed: ${e.message}`
                );
                if (attempt < retries) {
                    const backoff = Math.min(
                        baseBackoff * Math.pow(2, attempt),
                        maxBackoff
                    );
                    await new Promise((r) => setTimeout(r, backoff));
                }
            }
        }
        return null;
    }

    /** Resend all inflight requests after a successful reconnect. */
    private async _resendInflightRequests(): Promise<void> {
        if (this._inflightRequests.size === 0) return;

        logger.info(
            `Resending ${this._inflightRequests.size} inflight requests after reconnect`
        );

        const requests = Array.from(this._inflightRequests.entries());
        for (const [id, req] of requests) {
            try {
                if (req.type === "text" && req.message) {
                    if (req.register) {
                        const msg = JSON.parse(req.message);
                        WsEventCallback.instance().registerCallback(
                            {
                                action: msg.action,
                                req_id: msg.args.req_id,
                                timeout: this._timeout,
                                id:
                                    msg.args.id === undefined
                                        ? msg.args.id
                                        : BigInt(msg.args.id),
                            },
                            req.resolve,
                            req.reject
                        );
                    }
                    this.sendMsgNoResp(req.message);
                } else if (
                    req.type === "binary" &&
                    req.binaryData &&
                    req.reqId !== undefined &&
                    req.action
                ) {
                    if (req.register) {
                        WsEventCallback.instance().registerCallback(
                            {
                                action: req.action,
                                req_id: req.reqId,
                                timeout: this._timeout,
                                id: req.reqId,
                            },
                            req.resolve,
                            req.reject
                        );
                    }
                    this.sendBinaryMsgRaw(req.binaryData);
                }
                logger.debug(`Resent inflight request ${id}`);
            } catch (e: any) {
                logger.error(
                    `Failed to resend inflight request ${id}: ${e.message}`
                );
                req.reject(e);
                this._inflightRequests.delete(id);
            }
        }
    }
}
