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
import { w3cwebsocket } from "websocket";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _connManager?: ConnectionManager;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private readonly _url?: URL;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;
    private _useConnManager: boolean = false;

    /**
     * Create a WsClient backed by a ConnectionManager (new multi-host path).
     */
    static withConnectionManager(connManager: ConnectionManager): WsClient {
        const client = new WsClient();
        client._connManager = connManager;
        client._useConnManager = true;
        return client;
    }

    constructor(url?: URL, timeout?: number | undefined | null) {
        if (url) {
            this.checkURL(url);
            this._url = url;
            this._timeout = timeout;
            if (this._url.searchParams.has("timezone")) {
                this._timezone = this._url.searchParams.get("timezone") || undefined;
                this._url.searchParams.delete("timezone");
            }
            if (this._url.searchParams.has("bearer_token")) {
                this._bearerToken = this._url.searchParams.get("bearer_token") || undefined;
            }
        }
    }

    async connect(database?: string | undefined | null): Promise<void> {
        if (this._useConnManager && this._connManager) {
            await this._connManager.connect(database || undefined);
            return;
        }

        // Legacy path (for TMQ/Stmt that haven't migrated)
        let connMsg = {
            action: "conn",
            args: {
                req_id: ReqId.getReqID(),
                user: safeDecodeURIComponent(this._url!.username),
                password: safeDecodeURIComponent(this._url!.password),
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
            this._url!,
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
            const maskedUrl = maskUrlForLog(this._url!);
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

        if (this._useConnManager && this._connManager) {
            await this._connManager.sendMsgNoResp(queryMsg);
            return;
        }

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
        if (this._useConnManager && this._connManager) {
            return this._execViaConnManager(queryMsg, bSqlQuery);
        }

        return new Promise((resolve, reject) => {
            if (logger.isDebugEnabled()) {
                logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
            }
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                this._wsConnector
                    .sendMsg(queryMsg)
                    .then((e: any) => {
                        if (e.msg.code == 0) {
                            if (bSqlQuery) {
                                resolve(new WSQueryResponse(e));
                            } else {
                                resolve(e);
                            }
                        } else {
                            reject(
                                new WebSocketInterfaceError(
                                    e.msg.code,
                                    e.msg.message
                                )
                            );
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
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

    private async _execViaConnManager(queryMsg: string, bSqlQuery: boolean): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
        }
        const e: any = await this._connManager!.sendMsg(queryMsg);
        if (e.msg.code == 0) {
            return bSqlQuery ? new WSQueryResponse(e) : e;
        }
        throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
    }

    // need to construct Response.
    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean = true,
        bResultBinary: boolean = false
    ): Promise<any> {
        if (this._useConnManager && this._connManager) {
            return this._sendBinaryMsgViaConnManager(reqId, action, message, bSqlQuery, bResultBinary);
        }

        return new Promise((resolve, reject) => {
            if (
                this._wsConnector &&
                this._wsConnector.readyState() === w3cwebsocket.OPEN
            ) {
                this._wsConnector
                    .sendBinaryMsg(reqId, action, message)
                    .then((e: any) => {
                        if (bResultBinary) {
                            resolve(e);
                        }

                        if (e.msg.code == 0) {
                            if (bSqlQuery) {
                                resolve(new WSQueryResponse(e));
                            } else {
                                resolve(e);
                            }
                        } else {
                            reject(
                                new WebSocketInterfaceError(
                                    e.msg.code,
                                    e.msg.message
                                )
                            );
                        }
                    })
                    .catch((e) => {
                        reject(e);
                    });
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

    private async _sendBinaryMsgViaConnManager(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean,
        bResultBinary: boolean
    ): Promise<any> {
        const e: any = await this._connManager!.sendBinaryMsg(reqId, action, message);
        if (bResultBinary) {
            return e;
        }
        if (e.msg.code == 0) {
            return bSqlQuery ? new WSQueryResponse(e) : e;
        }
        throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
    }

    getState() {
        if (this._useConnManager && this._connManager) {
            return this._connManager.getReadyState();
        }
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }

    async ready(): Promise<void> {
        if (this._useConnManager) {
            // ConnectionManager handles readiness internally
            return;
        }

        try {
            this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
                this._url!,
                this._timeout
            );
            if (this._wsConnector.readyState() !== w3cwebsocket.OPEN) {
                await this._wsConnector.ready();
            }
            if (logger.isDebugEnabled()) {
                logger.debug("ready status ", maskUrlForLog(this._url!), this._wsConnector.readyState());
            }
            return;
        } catch (e: any) {
            const maskedUrl = maskUrlForLog(this._url!);
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
        if (this._useConnManager && this._connManager) {
            return this._connManager.sendMsg(msg);
        }

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

            if (this._useConnManager && this._connManager) {
                this._connManager.sendMsgNoResp(jsonStr)
                    .then((e: any) => resolve(e))
                    .catch((e) => reject(e));
                return;
            }

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

        if (this._useConnManager && this._connManager) {
            try {
                const result: any = await this._connManager.sendMsg(JSONBig.stringify(versionMsg));
                if (result.msg.code == 0) {
                    this._version = new WSVersionResponse(result).version;
                    return this._version;
                }
                throw new WebSocketInterfaceError(result.msg.code, result.msg.message);
            } catch (e: any) {
                throw new TDWebSocketClientError(
                    ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
                    `version query failed: ${e.message}`
                );
            }
        }

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
                const maskedUrl = maskUrlForLog(this._url!);
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
        if (this._useConnManager && this._connManager) {
            await this._connManager.close();
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
