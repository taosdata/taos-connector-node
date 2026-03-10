import { Mutex } from "async-mutex";
import { w3cwebsocket, ICloseEvent } from "websocket";
import { WebSocketConnector } from "./wsConnector";
import { WebSocketConnectionPool } from "./wsConnectorPool";
import { WsEventCallback, OnMessageType } from "./wsEventCallback";
import {
    ParsedMultiAddress,
    buildUrlForHost,
} from "../common/urlParser";
import {
    ErrorCode,
    TDWebSocketClientError,
} from "../common/wsError";
import { ReqId } from "../common/reqid";
import logger from "../common/log";
import { maskUrlForLog } from "../common/utils";

export interface InflightRequest {
    id: string;
    type: "text" | "binary";
    // for text requests
    message?: string;
    // for binary requests
    reqId?: bigint;
    action?: string;
    binaryData?: ArrayBuffer;
    // callback
    resolve: (args: unknown) => void;
    reject: (reason: any) => void;
    register: boolean;
}

export class ConnectionManager {
    private _parsed: ParsedMultiAddress;
    private _currentIndex: number;
    private _timeout: number;
    private _connector: WebSocketConnector | null = null;
    private _inflightRequests: Map<string, InflightRequest> = new Map();
    private _isReconnecting: boolean = false;
    private _reconnectPromise: Promise<WebSocketConnector> | null = null;
    private _reconnectMutex = new Mutex();
    private _closed: boolean = false;

    constructor(parsed: ParsedMultiAddress, timeout?: number | null) {
        this._parsed = parsed;
        this._currentIndex = Math.floor(Math.random() * parsed.hosts.length);
        this._timeout = timeout || 5000;
    }

    /**
     * Establish the initial connection using a random host.
     */
    async connect(): Promise<WebSocketConnector> {
        const connector = await this._createConnector(this._currentIndex);
        this._connector = connector;
        this._setupCloseHandler(connector);
        return connector;
    }

    /**
     * Get current connector, or null if disconnected.
     */
    getConnector(): WebSocketConnector | null {
        return this._connector;
    }

    /**
     * Check if the current connection is open.
     */
    isConnected(): boolean {
        return (
            this._connector !== null &&
            this._connector.readyState() === w3cwebsocket.OPEN
        );
    }

    /**
     * Perform failover: retry current host, then round-robin through others.
     * Returns a connected WebSocketConnector or throws if all fail.
     */
    async reconnect(): Promise<WebSocketConnector> {
        const release = await this._reconnectMutex.acquire();
        try {
            // If already reconnected by another caller, return existing connector
            if (this.isConnected()) {
                return this._connector!;
            }

            if (this._closed) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_CONNECTION_CLOSED,
                    "ConnectionManager is closed"
                );
            }

            this._isReconnecting = true;
            const totalHosts = this._parsed.hosts.length;

            // Try each host starting from current
            for (let i = 0; i < totalHosts; i++) {
                const hostIndex =
                    (this._currentIndex + i) % totalHosts;
                const connector = await this._tryConnectWithRetries(hostIndex);
                if (connector) {
                    // Clean up old connector
                    if (this._connector) {
                        try { this._connector.close(); } catch (_) {}
                    }
                    this._connector = connector;
                    this._currentIndex = hostIndex;
                    this._setupCloseHandler(connector);
                    this._isReconnecting = false;

                    // Resend inflight requests
                    await this._resendInflightRequests(connector);
                    return connector;
                }
            }

            this._isReconnecting = false;
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `Failover failed: all ${totalHosts} hosts exhausted after retries`
            );
        } finally {
            release();
        }
    }

    /**
     * Track an inflight request for potential resend on reconnect.
     */
    trackRequest(id: string, request: InflightRequest): void {
        this._inflightRequests.set(id, request);
    }

    /**
     * Remove a completed request from inflight tracking.
     */
    completeRequest(id: string): void {
        this._inflightRequests.delete(id);
    }

    /**
     * Get inflight request count (for diagnostics).
     */
    getInflightCount(): number {
        return this._inflightRequests.size;
    }

    /**
     * Close the connection manager and underlying connector.
     */
    async close(): Promise<void> {
        this._closed = true;
        if (this._connector) {
            await WebSocketConnectionPool.instance().releaseConnection(
                this._connector
            );
            this._connector = null;
        }
        this._inflightRequests.clear();
    }

    /**
     * Get the current host URL.
     */
    getCurrentUrl(): URL {
        return buildUrlForHost(this._parsed, this._currentIndex);
    }

    /**
     * Get parsed multi-address info.
     */
    getParsed(): ParsedMultiAddress {
        return this._parsed;
    }

    /**
     * Try connecting to a specific host with exponential backoff retries.
     */
    private async _tryConnectWithRetries(
        hostIndex: number
    ): Promise<WebSocketConnector | null> {
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
                const connector = await this._createConnector(hostIndex);
                logger.info(
                    `Successfully connected to ${maskUrlForLog(url)}`
                );
                return connector;
            } catch (e: any) {
                logger.warn(
                    `Connection attempt ${attempt + 1} to ${maskUrlForLog(url)} failed: ${e.message}`
                );
                if (attempt < retries) {
                    const backoff = Math.min(
                        baseBackoff * Math.pow(2, attempt),
                        maxBackoff
                    );
                    await this._sleep(backoff);
                }
            }
        }
        return null;
    }

    /**
     * Create a WebSocketConnector for a specific host and wait until it's ready.
     */
    private async _createConnector(
        hostIndex: number
    ): Promise<WebSocketConnector> {
        const url = buildUrlForHost(this._parsed, hostIndex);
        const connector = await WebSocketConnectionPool.instance().getConnection(
            url,
            this._timeout
        );
        if (connector.readyState() !== w3cwebsocket.OPEN) {
            await connector.ready();
        }
        return connector;
    }

    /**
     * Set up the onclose handler to detect disconnections and trigger failover.
     */
    private _setupCloseHandler(connector: WebSocketConnector): void {
        connector.onClose((_event: ICloseEvent) => {
            if (this._closed) return;
            logger.warn(
                "WebSocket connection closed, failover will be triggered on next operation"
            );
        });
    }

    /**
     * Resend all inflight requests after a successful reconnect.
     */
    private async _resendInflightRequests(
        connector: WebSocketConnector
    ): Promise<void> {
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
                                timeout: connector._timeout,
                                id:
                                    msg.args.id === undefined
                                        ? msg.args.id
                                        : BigInt(msg.args.id),
                            },
                            req.resolve,
                            req.reject
                        );
                    }
                    connector.sendMsgNoResp(req.message);
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
                                timeout: connector._timeout,
                                id: req.reqId,
                            },
                            req.resolve,
                            req.reject
                        );
                    }
                    connector.sendBinaryMsgRaw(req.binaryData);
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

    private _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
