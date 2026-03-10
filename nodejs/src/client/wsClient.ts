import JSONBig from "json-bigint";
import { WebSocketConnector } from "./wsConnector";
import { WebSocketConnectionPool } from "./wsConnectorPool";
import { ConnectionManager } from "./wsConnectionManager";
import {
    ErrorCode,
    TDWebSocketClientError,
    WebSocketInterfaceError,
    WebSocketQueryError,
} from "../common/wsError";
import { WSVersionResponse, WSQueryResponse } from "./wsResponse";
import { ReqId } from "../common/reqid";
import logger from "../common/log";
import { safeDecodeURIComponent, compareVersions, maskSensitiveForLog, maskUrlForLog } from "../common/utils";
import { ParsedMultiAddress, buildUrlForHost } from "../common/urlParser";
import { w3cwebsocket } from "websocket";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private readonly _url: URL;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;
    private _connMgr?: ConnectionManager;
    private _parsedMultiAddress?: ParsedMultiAddress;
    private _database?: string | null;
    private _inflightIdCounter = 0;

    constructor(url: URL, timeout?: number | undefined | null, parsedMultiAddress?: ParsedMultiAddress) {
        this.checkURL(url);
        this._url = url;
        this._timeout = timeout;
        this._parsedMultiAddress = parsedMultiAddress;
        if (this._url.searchParams.has("timezone")) {
            this._timezone = this._url.searchParams.get("timezone") || undefined;
            this._url.searchParams.delete("timezone");
        }
        if (this._url.searchParams.has("bearer_token")) {
            this._bearerToken = this._url.searchParams.get("bearer_token") || undefined;
        }

        // Initialize ConnectionManager if multi-address is provided
        if (this._parsedMultiAddress && this._parsedMultiAddress.hosts.length > 0) {
            this._connMgr = new ConnectionManager(this._parsedMultiAddress, this._timeout);
        }
    }

    private _nextInflightId(): string {
        return `inflight_${++this._inflightIdCounter}`;
    }

    /**
     * Ensure we have an active WebSocket connector, performing failover if needed.
     */
    private async _ensureConnector(): Promise<WebSocketConnector> {
        // If ConnectionManager is available, use it
        if (this._connMgr) {
            if (this._connMgr.isConnected()) {
                return this._connMgr.getConnector()!;
            }
            // Try reconnect with failover
            const connector = await this._connMgr.reconnect();
            this._wsConnector = connector;
            // Re-authenticate after reconnect
            await this._sendConnMsg(this._database);
            return connector;
        }

        // Fallback: original single-URL behavior
        if (this._wsConnector && this._wsConnector.readyState() === w3cwebsocket.OPEN) {
            return this._wsConnector;
        }
        throw new TDWebSocketClientError(
            ErrorCode.ERR_CONNECTION_CLOSED,
            "invalid websocket connect"
        );
    }

    private async _sendConnMsg(database?: string | null): Promise<void> {
        const connector = this._connMgr ? this._connMgr.getConnector()! : this._wsConnector!;
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
            logger.debug("[wsClient.connect.connMsg]===>" + JSONBig.stringify(connMsg, (key, value) =>
                (key === "password" || key === "bearer_token") ? "[REDACTED]" : value
            ));
        }
        let result: any = await connector.sendMsg(JSON.stringify(connMsg));
        if (result.msg.code != 0) {
            throw new WebSocketQueryError(result.msg.code, result.msg.message);
        }
    }

    async connect(database?: string | undefined | null): Promise<void> {
        this._database = database;

        if (this._connMgr) {
            // Multi-address: use ConnectionManager
            try {
                this._wsConnector = await this._connMgr.connect();
                await this._sendConnMsg(database);
                return;
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

        // Original single-URL path
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
            logger.debug("[wsClient.connect.connMsg]===>" + JSONBig.stringify(connMsg, (key, value) =>
                (key === "password" || key === "bearer_token") ? "[REDACTED]" : value
            ));
        }
        this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
            this._url,
            this._timeout
        );
        if (this._wsConnector.readyState() === w3cwebsocket.OPEN) {
            return;
        }
        try {
            await this._wsConnector.ready();
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
        } catch (e: any) {
            logger.error("[wsClient.setOptionConnection] failed: " + e.message);
            throw e;
        }
    }

    async execNoResp(queryMsg: string): Promise<void> {
        logger.debug("[wsQueryInterface.query.queryMsg]===>" + queryMsg);
        const connector = await this._ensureConnector();
        await connector.sendMsgNoResp(queryMsg);
    }

    // Need to construct Response
    async exec(queryMsg: string, bSqlQuery: boolean = true): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
        }
        const connector = await this._ensureConnector();
        const inflightId = this._nextInflightId();

        return new Promise((resolve, reject) => {
            const wrappedResolve = (e: any) => {
                if (this._connMgr) this._connMgr.completeRequest(inflightId);
                if (e.msg.code == 0) {
                    if (bSqlQuery) {
                        resolve(new WSQueryResponse(e));
                    } else {
                        resolve(e);
                    }
                } else {
                    reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
                }
            };
            const wrappedReject = (e: any) => {
                if (this._connMgr) this._connMgr.completeRequest(inflightId);
                reject(e);
            };

            if (this._connMgr) {
                this._connMgr.trackRequest(inflightId, {
                    id: inflightId,
                    type: "text",
                    message: queryMsg,
                    resolve: wrappedResolve,
                    reject: wrappedReject,
                    register: true,
                });
            }

            connector
                .sendMsg(queryMsg)
                .then(wrappedResolve)
                .catch(wrappedReject);
        });
    }

    // need to construct Response.
    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean = true,
        bResultBinary: boolean = false
    ): Promise<any> {
        const connector = await this._ensureConnector();
        const inflightId = this._nextInflightId();

        return new Promise((resolve, reject) => {
            const wrappedResolve = (e: any) => {
                if (this._connMgr) this._connMgr.completeRequest(inflightId);
                if (bResultBinary) {
                    resolve(e);
                    return;
                }
                if (e.msg.code == 0) {
                    if (bSqlQuery) {
                        resolve(new WSQueryResponse(e));
                    } else {
                        resolve(e);
                    }
                } else {
                    reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
                }
            };
            const wrappedReject = (e: any) => {
                if (this._connMgr) this._connMgr.completeRequest(inflightId);
                reject(e);
            };

            if (this._connMgr) {
                this._connMgr.trackRequest(inflightId, {
                    id: inflightId,
                    type: "binary",
                    reqId,
                    action,
                    binaryData: message,
                    resolve: wrappedResolve,
                    reject: wrappedReject,
                    register: true,
                });
            }

            connector
                .sendBinaryMsg(reqId, action, message)
                .then(wrappedResolve)
                .catch(wrappedReject);
        });
    }

    getState() {
        if (this._connMgr) {
            return this._connMgr.isConnected() ? w3cwebsocket.OPEN : w3cwebsocket.CLOSED;
        }
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }

    async ready(): Promise<void> {
        if (this._connMgr) {
            if (!this._connMgr.isConnected()) {
                this._wsConnector = await this._connMgr.reconnect();
            }
            return;
        }

        try {
            this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
                this._url,
                this._timeout
            );
            if (this._wsConnector.readyState() !== w3cwebsocket.OPEN) {
                await this._wsConnector.ready();
            }
            if (logger.isDebugEnabled()) {
                logger.debug("ready status ", maskUrlForLog(this._url), this._wsConnector.readyState());
            }
            return;
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

    async sendMsg(msg: string): Promise<any> {
        logger.debug("[wsQueryInterface.sendMsg]===>" + msg);
        const connector = await this._ensureConnector();
        return connector.sendMsg(msg);
    }

    async freeResult(res: WSQueryResponse) {
        let freeResultMsg = {
            action: "free_result",
            args: {
                req_id: ReqId.getReqID(),
                id: res.id,
            },
        };
        let jsonStr = JSONBig.stringify(freeResultMsg);
        logger.debug(
            "[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr
        );
        const connector = await this._ensureConnector();
        await connector.sendMsgNoResp(jsonStr);
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

        try {
            const connector = await this._ensureConnector();
            let result: any = await connector.sendMsg(JSONBig.stringify(versionMsg));
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

    async close(): Promise<void> {
        if (this._connMgr) {
            await this._connMgr.close();
            this._wsConnector = undefined;
            return;
        }
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
}
