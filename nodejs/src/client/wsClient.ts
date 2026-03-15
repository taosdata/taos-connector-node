import JSONBig from "json-bigint";
import { WebSocketConnector } from "./wsConnector";
import { WebSocketConnectionPool } from "./wsConnectorPool";
import { Dsn } from "../common/dsn";
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
} from "../common/utils";
import { w3cwebsocket } from "websocket";
import { ConnectorInfo, TSDB_OPTION_CONNECTION } from "../common/constant";

const DEFAULT_PORT = 6041;

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private readonly _dsn: Dsn;
    private readonly _wsPath: string;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;
    private _connectedDatabase: string | null = null;
    private _connectionOptions: Map<TSDB_OPTION_CONNECTION, string | null> = new Map();

    constructor(urlOrDsn: URL | Dsn, timeout?: number | undefined | null) {
        if (urlOrDsn instanceof URL) {
            this._dsn = this.convertUrlToDsn(urlOrDsn);
            this._wsPath = this.normalizePath(urlOrDsn.pathname);
        } else {
            this._dsn = {
                scheme: urlOrDsn.scheme,
                username: urlOrDsn.username,
                password: urlOrDsn.password,
                addresses: [...urlOrDsn.addresses],
                database: urlOrDsn.database,
                params: new Map(urlOrDsn.params),
            };
            this._wsPath = "ws";
        }
        this.checkAuth();
        this._timeout = timeout;
        if (this._dsn.params.has("timezone")) {
            this._timezone = this._dsn.params.get("timezone") || undefined;
        }
        if (this._dsn.params.has("bearer_token")) {
            this._bearerToken = this._dsn.params.get("bearer_token") || undefined;
        }
        if (this._dsn.database.length > 0) {
            this._connectedDatabase = this._dsn.database;
        }
    }

    private normalizePath(path: string): string {
        const normalized = path.trim().replace(/^\/+/, "");
        return normalized.length > 0 ? normalized : "ws";
    }

    private convertUrlToDsn(url: URL): Dsn {
        const scheme = url.protocol.replace(":", "");
        const host = url.hostname;
        const port = url.port.length > 0 ? Number.parseInt(url.port, 10) : DEFAULT_PORT;
        const params = new Map<string, string>();
        url.searchParams.forEach((value, key) => {
            params.set(key, value);
        });
        return {
            scheme,
            username: url.username,
            password: url.password,
            addresses: [{ host, port }],
            database: "",
            params,
        };
    }

    private buildLogUrl(): URL {
        const addr = this._dsn.addresses[0];
        const url = new URL(`${this._dsn.scheme}://${addr.host}:${addr.port}/${this._wsPath}`);
        url.username = this._dsn.username;
        url.password = this._dsn.password;
        const skipParams = new Set([
            "retries",
            "retry_backoff_ms",
            "retry_backoff_max_ms",
            "timezone",
        ]);
        for (const [key, value] of this._dsn.params) {
            if (!skipParams.has(key)) {
                url.searchParams.set(key, value);
            }
        }
        return url;
    }

    private maskedLogUrl(): string {
        return maskUrlForLog(this.buildLogUrl());
    }

    private buildConnMessage(database?: string | undefined | null) {
        return {
            action: "conn",
            args: {
                req_id: ReqId.getReqID(),
                user: safeDecodeURIComponent(this._dsn.username),
                password: safeDecodeURIComponent(this._dsn.password),
                db: database,
                connector: ConnectorInfo,
                ...(this._timezone && { tz: this._timezone }),
                ...(this._bearerToken && { bearer_token: this._bearerToken }),
            },
        };
    }

    private assertSuccessResponse(result: any, action: string): void {
        if (result && result.msg && result.msg.code == 0) {
            return;
        }
        const code = result?.msg?.code ?? ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL;
        const message = result?.msg?.message || `${action} failed`;
        throw new WebSocketQueryError(code, message);
    }

    private bindReconnectRecoveryHook(): void {
        if (!this._wsConnector) {
            return;
        }
        this._wsConnector.setSessionRecoveryHook(async () => {
            if (!this._wsConnector) {
                return;
            }
            const connMsg = this.buildConnMessage(this._connectedDatabase);
            const connResp = await this._wsConnector.sendMsgDirect(
                JSON.stringify(connMsg)
            );
            this.assertSuccessResponse(connResp, "conn");

            if (this._connectionOptions.size > 0) {
                const options = Array.from(this._connectionOptions.entries()).map(
                    ([option, value]) => ({
                        option,
                        value,
                    })
                );
                const optionsMsg = {
                    action: "options_connection",
                    args: {
                        req_id: ReqId.getReqID(),
                        options,
                    },
                };
                const optionsResp = await this._wsConnector.sendMsgDirect(
                    JSONBig.stringify(optionsMsg)
                );
                this.assertSuccessResponse(optionsResp, "options_connection");
            }
        });
    }

    async connect(database?: string | undefined | null): Promise<void> {
        const targetDatabase = database ?? (this._dsn.database.length > 0 ? this._dsn.database : undefined);
        const connMsg = this.buildConnMessage(targetDatabase);
        if (logger.isDebugEnabled()) {
            logger.debug("[wsClient.connect.connMsg]===>" + JSONBig.stringify(connMsg, (key, value) =>
                (key === "password" || key === "bearer_token") ? "[REDACTED]" : value
            ));
        }
        this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
            this._dsn,
            this._wsPath,
            this._timeout
        );
        this.bindReconnectRecoveryHook();
        if (this._wsConnector.readyState() === w3cwebsocket.OPEN) {
            this._connectedDatabase = targetDatabase ?? null;
            return;
        }
        try {
            await this._wsConnector.ready();
            let result: any = await this._wsConnector.sendMsg(JSON.stringify(connMsg));
            if (result.msg.code == 0) {
                this._connectedDatabase = targetDatabase ?? null;
                return;
            }
            await this.close();
            throw new WebSocketQueryError(result.msg.code, result.msg.message);
        } catch (e: any) {
            await this.close();
            const maskedUrl = this.maskedLogUrl();
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
            this._connectionOptions.set(option, value);
        } catch (e: any) {
            logger.error("[wsClient.setOptionConnection] failed: " + e.message);
            throw e;
        }
    }

    async execNoResp(queryMsg: string): Promise<void> {
        logger.debug("[wsQueryInterface.query.queryMsg]===>" + queryMsg);
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

    async exec(queryMsg: string, bSqlQuery: boolean = true): Promise<any> {
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

    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean = true,
        bResultBinary: boolean = false
    ): Promise<any> {
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

    getState() {
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }

    async ready(): Promise<void> {
        try {
            this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
                this._dsn,
                this._wsPath,
                this._timeout
            );
            this.bindReconnectRecoveryHook();
            if (this._wsConnector.readyState() !== w3cwebsocket.OPEN) {
                await this._wsConnector.ready();
            }
            if (logger.isDebugEnabled()) {
                logger.debug("ready status ", this.maskedLogUrl(), this._wsConnector.readyState());
            }
            return;
        } catch (e: any) {
            const maskedUrl = this.maskedLogUrl();
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
                const maskedUrl = this.maskedLogUrl();
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
        if (this._wsConnector) {
            this._wsConnector.setSessionRecoveryHook(null);
            await WebSocketConnectionPool.instance().releaseConnection(
                this._wsConnector
            );
            this._wsConnector = undefined;
        }
    }

    private checkAuth() {
        const hasToken = this._dsn.params.get("token") || this._dsn.params.get("bearer_token");
        if (!hasToken) {
            if (!(this._dsn.username || this._dsn.password)) {
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
