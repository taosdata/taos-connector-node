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
import { safeDecodeURIComponent, compareVersions, maskSensitiveForLog, maskUrlForLog } from "../common/utils";
import { w3cwebsocket } from "websocket";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?: number | null;
    private _timezone?: string | null;
    private readonly _url: string;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | null;
    private _bearerToken?: string | null;
    private _database?: string | null;
    private _inflightIdCounter = 0;

    // Parsed URL info (extracted from the raw URL string)
    private _username: string = "";
    private _password: string = "";
    private _token?: string | null;

    constructor(url: string, timeout?: number | null) {
        if (!url) {
            throw new WebSocketInterfaceError(
                ErrorCode.ERR_INVALID_URL,
                `invalid url, provide non-empty URL`
            );
        }
        this._url = url;
        this._timeout = timeout;
    }

    private _nextInflightId(): string {
        return `inflight_${++this._inflightIdCounter}`;
    }

    /**
     * Ensure we have an active WebSocket connector, performing failover if needed.
     */
    private async _ensureConnector(): Promise<WebSocketConnector> {
        if (this._wsConnector && this._wsConnector.isConnected()) {
            return this._wsConnector;
        }
        if (this._wsConnector) {
            // Try reconnect with failover
            await this._wsConnector.reconnect();
            // Re-authenticate after reconnect
            await this._sendConnMsg(this._database);
            return this._wsConnector;
        }
        throw new TDWebSocketClientError(
            ErrorCode.ERR_CONNECTION_CLOSED,
            "invalid websocket connect"
        );
    }

    private async _sendConnMsg(database?: string | null): Promise<void> {
        if (!this._wsConnector) return;
        let connMsg = {
            action: "conn",
            args: {
                req_id: ReqId.getReqID(),
                user: this._username,
                password: this._password,
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
        let result: any = await this._wsConnector.sendMsg(JSON.stringify(connMsg));
        if (result.msg.code != 0) {
            throw new WebSocketQueryError(result.msg.code, result.msg.message);
        }
    }

    async connect(database?: string | null): Promise<void> {
        this._database = database;

        // Create connector from raw URL string
        this._wsConnector = new WebSocketConnector(this._url, this._timeout);
        const parsed = this._wsConnector.getParsed();

        // Extract credentials from parsed URL
        this._username = safeDecodeURIComponent(parsed.username);
        this._password = safeDecodeURIComponent(parsed.password);

        // Extract timezone/bearerToken from searchParams
        if (parsed.searchParams.has("timezone")) {
            this._timezone = parsed.searchParams.get("timezone") || undefined;
        }
        if (parsed.searchParams.has("bearer_token")) {
            this._bearerToken = parsed.searchParams.get("bearer_token") || undefined;
        }
        if (parsed.searchParams.has("token")) {
            this._token = parsed.searchParams.get("token") || undefined;
        }

        // Check authentication
        if (!this._token && !this._bearerToken) {
            if (!parsed.username && !parsed.password) {
                throw new WebSocketInterfaceError(
                    ErrorCode.ERR_INVALID_AUTHENTICATION,
                    `invalid url, provide non-empty "token" or "bearer_token", or provide username/password`
                );
            }
        }

        try {
            await this._wsConnector.connect();
            await this._sendConnMsg(database);
        } catch (e: any) {
            await this.close();
            const maskedUrl = maskUrlForLog(this._wsConnector?.getCurrentUrl() ?? null);
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

    async exec(queryMsg: string, bSqlQuery: boolean = true): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
        }
        const connector = await this._ensureConnector();
        const inflightId = this._nextInflightId();

        return new Promise((resolve, reject) => {
            const wrappedResolve = (e: any) => {
                connector.completeRequest(inflightId);
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
                connector.completeRequest(inflightId);
                reject(e);
            };

            connector.trackRequest(inflightId, {
                id: inflightId,
                type: "text",
                message: queryMsg,
                resolve: wrappedResolve,
                reject: wrappedReject,
                register: true,
            });

            connector
                .sendMsg(queryMsg)
                .then(wrappedResolve)
                .catch(wrappedReject);
        });
    }

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
                connector.completeRequest(inflightId);
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
                connector.completeRequest(inflightId);
                reject(e);
            };

            connector.trackRequest(inflightId, {
                id: inflightId,
                type: "binary",
                reqId,
                action,
                binaryData: message,
                resolve: wrappedResolve,
                reject: wrappedReject,
                register: true,
            });

            connector
                .sendBinaryMsg(reqId, action, message)
                .then(wrappedResolve)
                .catch(wrappedReject);
        });
    }

    getState() {
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }

    async ready(): Promise<void> {
        if (this._wsConnector && this._wsConnector.isConnected()) {
            return;
        }
        if (this._wsConnector) {
            try {
                await this._wsConnector.reconnect();
                return;
            } catch (e: any) {
                const maskedUrl = maskUrlForLog(this._wsConnector?.getCurrentUrl() ?? null);
                logger.error(
                    `connection creation failed, url: ${maskedUrl}, code: ${e.code}, message: ${e.message}`
                );
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                    `connection creation failed, url: ${maskedUrl}, code: ${e.code}, message: ${e.message}`
                );
            }
        }

        // No connector yet — create one and connect
        this._wsConnector = new WebSocketConnector(this._url, this._timeout);
        try {
            await this._wsConnector.connect();
            return;
        } catch (e: any) {
            const maskedUrl = maskUrlForLog(this._wsConnector?.getCurrentUrl() ?? null);
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
            const maskedUrl = maskUrlForLog(this._wsConnector?.getCurrentUrl() ?? null);
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
        if (this._wsConnector) {
            await WebSocketConnectionPool.instance().releaseConnection(
                this._wsConnector
            );
            this._wsConnector = undefined;
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
