import JSONBig from "json-bigint";
import { WebSocketConnector } from "./wsConnector";
import { WebSocketConnectionPool } from "./wsConnectorPool";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketInterfaceError,
    WebSocketQueryError,
} from "../common/wsError";
import { WSVersionResponse, WSQueryResponse } from "./wsResponse";
import { ReqId } from "../common/reqid";
import logger from "../common/log";
import {
    safeDecodeURIComponent,
    compareVersions,
    maskSensitiveForLog,
    maskUrlForLog,
    FailoverOptions,
} from "../common/utils";
import { w3cwebsocket } from "websocket";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

interface InflightMessage {
    key: string;
    type: "text" | "binary";
    action: string;
    reqId: bigint;
    id?: bigint;
    message: string | ArrayBuffer;
}

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private _urls: URL[];
    private _url: URL;
    private _currentIndex: number;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;
    private _database?: string | undefined | null;
    private _hasConn: boolean = false;
    private _failover: FailoverOptions;
    private _reconnectPromise?: Promise<void>;
    private _manualClose: boolean = false;
    private _inflight: Map<string, InflightMessage> = new Map();
    private _connectionOptions: Map<TSDB_OPTION_CONNECTION, string | null> = new Map();
·
    constructor(url: URL | URL[], timeout?: number | undefined | null, failover?: FailoverOptions) {
        this._urls = Array.isArray(url) ? url : [url];
        if (this._urls.length === 0) {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_INVALID_URL,
                "invalid url, empty address list"
            );
        }
        this._urls.forEach((u) => this.checkURL(u));
        this._currentIndex = this._urls.length > 1 ? Math.floor(Math.random() * this._urls.length) : 0;
        this._url = this._urls[this._currentIndex];
        this._timeout = timeout;
        this._failover = {
            retries: failover?.retries ?? 0,
            retryBackoffMs: failover?.retryBackoffMs ?? 0,
            retryBackoffMaxMs: failover?.retryBackoffMaxMs ?? 0,
        };

        for (const u of this._urls) {
            if (!this._timezone && u.searchParams.has("timezone")) {
                this._timezone = u.searchParams.get("timezone") || undefined;
            }
            u.searchParams.delete("timezone");
            if (!this._bearerToken && u.searchParams.has("bearer_token")) {
                this._bearerToken = u.searchParams.get("bearer_token") || undefined;
            }
        }
    }

    async connect(database?: string | undefined | null): Promise<void> {
        this._database = database;
        this._hasConn = true;
        this._manualClose = false;
        await this._recoverConnection(true);
    }

    async setOptionConnection(option: TSDB_OPTION_CONNECTION, value: string | null): Promise<void> {
        logger.debug("[wsClient.setOptionConnection]===>" + option + ", " + value);
        let connMsg = {
            action: "options_connection",
            args: {
                req_id: ReqId.getReqID(),
                options: [
                    {
                        option: option,
                        value: value,
                    },
                ],
            },
        };
        try {
            await this.exec(JSONBig.stringify(connMsg), false);
            this._connectionOptions.set(option, value);
        } catch (e: any) {
            logger.error("[wsClient.setOptionConnection] failed: " + e.message);
            throw e;
        }
    }

    async execNoResp(queryMsg: string): Promise<void> {
        logger.debug("[wsQueryInterface.query.queryMsg]===>" + queryMsg);
        await this._ensureConnected();
        if (
            this._wsConnector &&
            this._wsConnector.readyState() === w3cwebsocket.OPEN
        ) {
            await this._wsConnector.sendMsgNoResp(queryMsg);
            return;
        }
        throw new TDWebSocketClientError(
            ErrorCode.ERR_CONNECTION_CLOSED,
            "invalid websocket connect"
        );
    }

    // Need to construct Response
    async exec(queryMsg: string, bSqlQuery: boolean = true): Promise<any> {
        const inflight = this._trackInflightFromText(queryMsg);
        try {
            if (logger.isDebugEnabled()) {
                logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
            }
            await this._ensureConnected();
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                const e: any = await this._wsConnector.sendMsg(queryMsg);
                if (e.msg.code == 0) {
                    if (bSqlQuery) {
                        return new WSQueryResponse(e);
                    }
                    return e;
                }
                throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
            }
            throw new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "invalid websocket connect"
            );
        } catch (e: any) {
            if (this._isConnectionClosedError(e)) {
                await this._ensureConnected();
                const e2: any = await this._wsConnector?.sendMsg(queryMsg);
                if (e2 && e2.msg && e2.msg.code == 0) {
                    if (bSqlQuery) {
                        return new WSQueryResponse(e2);
                    }
                    return e2;
                }
                if (e2 && e2.msg) {
                    throw new WebSocketInterfaceError(e2.msg.code, e2.msg.message);
                }
            }
            throw e;
        } finally {
            if (inflight) {
                this._inflight.delete(inflight.key);
            }
        }
    }

    // need to construct Response.
    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean = true,
        bResultBinary: boolean = false
    ): Promise<any> {
        const inflight = this._trackInflightFromBinary(reqId, action, message);
        try {
            await this._ensureConnected();
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                const e: any = await this._wsConnector.sendBinaryMsg(reqId, action, message);
                if (bResultBinary) {
                    return e;
                }

                if (e.msg.code == 0) {
                    if (bSqlQuery) {
                        return new WSQueryResponse(e);
                    }
                    return e;
                }
                throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
            }
            throw new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "invalid websocket connect"
            );
        } catch (e: any) {
            if (this._isConnectionClosedError(e)) {
                await this._ensureConnected();
                const e2: any = await this._wsConnector?.sendBinaryMsg(reqId, action, message);
                if (bResultBinary) {
                    return e2;
                }
                if (e2 && e2.msg && e2.msg.code == 0) {
                    if (bSqlQuery) {
                        return new WSQueryResponse(e2);
                    }
                    return e2;
                }
                if (e2 && e2.msg) {
                    throw new WebSocketInterfaceError(e2.msg.code, e2.msg.message);
                }
            }
            throw e;
        } finally {
            if (inflight) {
                this._inflight.delete(inflight.key);
            }
        }
    }

    getState() {
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }

    async ready(): Promise<void> {
        this._manualClose = false;
        await this._ensureConnected();
    }

    async sendMsg(msg: string): Promise<any> {
        await this._ensureConnected();
        return new Promise((resolve, reject) => {
            logger.debug("[wsQueryInterface.sendMsg]===>" + msg);
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                this._wsConnector
                    .sendMsg(msg)
                    .then((e: any) => {
                        resolve(e);
                    })
                    .catch((e) => reject(e));
            } else {
                reject(
                    new TDWebSocketClientError(
                        ErrorCode.ERR_CONNECTION_CLOSED,
                        "invalid websocket connect"
                    )
                );
            }
        });
    }

    async freeResult(res: WSQueryResponse) {
        let freeResultMsg = {
            action: "free_result",
            args: {
                req_id: ReqId.getReqID(),
                id: res.id,
            },
        };
        return new Promise((resolve, reject) => {
            let jsonStr = JSONBig.stringify(freeResultMsg);
            logger.debug(
                "[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr
            );
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                this._wsConnector
                    .sendMsgNoResp(jsonStr)
                    .then((e: any) => {
                        resolve(e);
                    })
                    .catch((e) => reject(e));
            } else {
                reject(
                    new TDWebSocketClientError(
                        ErrorCode.ERR_CONNECTION_CLOSED,
                        "invalid websocket connect"
                    )
                );
            }
        });
    }

    async version(): Promise<string> {
        if (this._version) {
            return this._version;
        }

        let versionMsg = {
            action: "version",
            args: {
                req_id: ReqId.getReqID(),
            },
        };

        await this._ensureConnected();
        if (this._wsConnector) {
            try {
                if (this._wsConnector.readyState() !== w3cwebsocket.OPEN) {
                    await this._wsConnector.ready();
                }
                let result: any = await this._wsConnector.sendMsg(JSONBig.stringify(versionMsg));
                if (result.msg.code == 0) {
                    return new WSVersionResponse(result).version;
                }
                throw new WebSocketInterfaceError(result.msg.code, result.msg.message);
            } catch (e: any) {
                const maskedUrl = maskUrlForLog(this._url);
                logger.error(
                    `connection creation failed, url: ${maskedUrl}, code: ${e.code}, message: ${e.message}`
                );
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                    `connection creation failed, url: ${maskedUrl}, code: ${e.code}, message: ${e.message}`
                );
            }
        }
        throw (ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect");
    }

    async close(): Promise<void> {
        this._manualClose = true;
        this._inflight.clear();
        if (this._wsConnector) {
            await WebSocketConnectionPool.instance().releaseConnection(
                this._wsConnector
            );
            this._wsConnector = undefined;
        }
    }

    checkURL(url: URL) {
        // Assert token or bearer_token exists, otherwise username and password must exist.
        if (!url.searchParams.get("token") && !url.searchParams.get("bearer_token")) {
            if (!(url.username || url.password)) {
                throw new WebSocketInterfaceError(
                    ErrorCode.ERR_INVALID_AUTHENTICATION,
                    `invalid url, provide non-empty "token" or "bearer_token", or provide username/password`
                );
            }
        }
    }

    async checkVersion() {
        this._version = await this.version();
        let result = compareVersions(this._version, WsClient._minVersion);
        if (result < 0) {
            logger.error(
                `TDengine version is too low, current version: ${this._version}, minimum required version: ${WsClient._minVersion}`
            );
            throw new WebSocketQueryError(
                ErrorCode.ERR_TDENIGNE_VERSION_IS_TOO_LOW,
                `Version mismatch. The minimum required TDengine version is ${WsClient._minVersion}`
            );
        }
    }

    private async _ensureConnected(): Promise<void> {
        if (this._wsConnector && this._wsConnector.readyState() === w3cwebsocket.OPEN) {
            return;
        }
        if (this._reconnectPromise) {
            await this._reconnectPromise;
            return;
        }
        this._reconnectPromise = this._recoverConnection(this._hasConn);
        try {
            await this._reconnectPromise;
        } finally {
            this._reconnectPromise = undefined;
        }
    }

    private async _recoverConnection(needConn: boolean): Promise<void> {
        const total = this._urls.length;
        let lastError: any = undefined;
        for (let offset = 0; offset < total; offset++) {
            const index = (this._currentIndex + offset) % total;
            const url = this._urls[index];
            try {
                await this._connectWithRetries(url, needConn);
                this._currentIndex = index;
                this._url = url;
                await this._reapplyConnectionOptions();
                await this._resendInflight();
                return;
            } catch (e: any) {
                lastError = e;
                logger.error(
                    `failover connect failed, url: ${maskUrlForLog(url)}, code: ${e.code}, message: ${e.message}`
                );
            }
        }
        if (lastError) {
            throw lastError;
        }
        throw new TDWebSocketClientError(
            ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
            "all addresses failed to connect"
        );
    }

    private async _connectWithRetries(url: URL, needConn: boolean): Promise<void> {
        const retries = this._failover.retries;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this._openSocket(url);
                if (needConn) {
                    await this._sendConn(this._database);
                }
                return;
            } catch (e: any) {
                if (attempt >= retries) {
                    throw e;
                }
                const backoff = this._computeBackoff(attempt);
                if (backoff > 0) {
                    await this._sleep(backoff);
                }
            }
        }
    }

    private async _openSocket(url: URL): Promise<void> {
        if (this._wsConnector) {
            try {
                await WebSocketConnectionPool.instance().releaseConnection(this._wsConnector);
            } catch {
                // ignore
            }
            this._wsConnector = undefined;
        }
        this._url = url;
        this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
            this._url,
            this._timeout
        );
        this._wsConnector.setOnCloseHandler(() => this._onConnectionClosed());
        if (this._wsConnector.readyState() === w3cwebsocket.OPEN) {
            return;
        }
        await this._wsConnector.ready();
    }

    private async _sendConn(database?: string | undefined | null): Promise<void> {
        let connMsg = {
            action: "conn",
            args: {
                req_id: ReqId.getReqID(),
                user: safeDecodeURIComponent(this._url.username),
                password: safeDecodeURIComponent(this._url.password),
                db: database,
                connector: ConnectorInfo,
                ...(this._timezone && { tz: this._timezone }),
                ...(this._bearerToken && { bearer_token: this._bearerToken }),
            },
        };
        if (logger.isDebugEnabled()) {
            logger.debug(
                "[wsClient.connect.connMsg]===>" +
                JSONBig.stringify(connMsg, (key, value) =>
                    key === "password" || key === "bearer_token" ? "[REDACTED]" : value
                )
            );
        }
        if (!this._wsConnector) {
            throw new TDWebSocketClientError(
                ErrorCode.ERR_CONNECTION_CLOSED,
                "invalid websocket connect"
            );
        }
        try {
            let result: any = await this._wsConnector.sendMsg(JSON.stringify(connMsg));
            if (result.msg.code == 0) {
                return;
            }
            await this.close();
            throw new WebSocketQueryError(result.msg.code, result.msg.message);
        } catch (e: any) {
            await this.close();
            const maskedUrl = maskUrlForLog(this._url);
            logger.error(`connection creation failed, url: ${maskedUrl}, code:${e.code}, msg:${e.message}`);
            throw new TDWebSocketClientError(
                ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                `connection creation failed, url: ${maskedUrl}, code:${e.code}, msg:${e.message}`
            );
        }
    }

    private _trackInflightFromText(queryMsg: string): InflightMessage | null {
        try {
            const msg = JSON.parse(queryMsg);
            const action = msg?.action;
            const reqIdRaw = msg?.args?.req_id;
            if (!action || reqIdRaw === undefined || reqIdRaw === null) {
                return null;
            }
            const reqId = BigInt(reqIdRaw);
            const idRaw = msg?.args?.id;
            const id = idRaw === undefined || idRaw === null ? undefined : BigInt(idRaw);
            const key = this._makeInflightKey(action, reqId, id);
            const inflight: InflightMessage = {
                key,
                type: "text",
                action,
                reqId,
                id,
                message: queryMsg,
            };
            this._inflight.set(key, inflight);
            return inflight;
        } catch {
            return null;
        }
    }

    private _trackInflightFromBinary(reqId: bigint, action: string, message: ArrayBuffer): InflightMessage {
        const key = this._makeInflightKey(action, reqId, reqId);
        const inflight: InflightMessage = {
            key,
            type: "binary",
            action,
            reqId,
            id: reqId,
            message,
        };
        this._inflight.set(key, inflight);
        return inflight;
    }

    private _makeInflightKey(action: string, reqId: bigint, id?: bigint): string {
        return `${action}:${reqId.toString()}:${id ? id.toString() : ""}`;
    }

    private async _resendInflight(): Promise<void> {
        if (!this._wsConnector || this._inflight.size === 0) {
            return;
        }
        for (const inflight of this._inflight.values()) {
            if (inflight.type === "text") {
                await this._wsConnector.sendMsg(inflight.message as string, false);
            } else {
                await this._wsConnector.sendBinaryMsg(
                    inflight.reqId,
                    inflight.action,
                    inflight.message as ArrayBuffer,
                    false
                );
            }
        }
    }

    private async _reapplyConnectionOptions(): Promise<void> {
        if (!this._hasConn || this._connectionOptions.size === 0) {
            return;
        }
        for (const [option, value] of this._connectionOptions.entries()) {
            try {
                await this.setOptionConnection(option, value);
            } catch (e: any) {
                logger.error(`[wsClient.reapplyOptions] failed: ${e.message}`);
            }
        }
    }

    private _onConnectionClosed() {
        if (this._manualClose) {
            return;
        }
        if (this._reconnectPromise) {
            return;
        }
        this._reconnectPromise = this._recoverConnection(this._hasConn)
            .catch((e: any) => {
                logger.error(
                    `failover reconnect failed, url: ${maskUrlForLog(this._url)}, code: ${e.code}, message: ${e.message}`
                );
            })
            .finally(() => {
                this._reconnectPromise = undefined;
            });
    }

    private _isConnectionClosedError(e: any): boolean {
        return (
            e instanceof TDWebSocketClientError &&
            (e.code === ErrorCode.ERR_CONNECTION_CLOSED ||
                e.code === ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL)
        );
    }

    private _computeBackoff(attempt: number): number {
        const base = this._failover.retryBackoffMs;
        if (!base || base <= 0) {
            return 0;
        }
        let backoff = base * Math.pow(2, attempt);
        const max = this._failover.retryBackoffMaxMs;
        if (max && max > 0 && backoff > max) {
            backoff = max;
        }
        return backoff;
    }

    private async _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
