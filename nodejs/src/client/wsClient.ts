import JSONBig from "json-bigint";
import { WebSocketConnector, WebSocketConnectorConfig } from "./wsConnector";
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
    private _wsConnector: WebSocketConnector;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;

    constructor(config: WebSocketConnectorConfig) {
        this._wsConnector = new WebSocketConnector(config);
        this._timeout = config.timeout;
        this._timezone = config.authInfo.timezone;
        this._bearerToken = config.authInfo.bearerToken;
    }

    async connect(database?: string | undefined | null): Promise<void> {
        await this._wsConnector.connect(database || undefined);
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
        await this._wsConnector.sendMsgNoResp(queryMsg);
    }

    async exec(queryMsg: string, bSqlQuery: boolean = true): Promise<any> {
        if (logger.isDebugEnabled()) {
            logger.debug("[wsQueryInterface.query.queryMsg]===>" + maskSensitiveForLog(queryMsg));
        }
        const e: any = await this._wsConnector.sendMsg(queryMsg);
        if (e.msg.code == 0) {
            return bSqlQuery ? new WSQueryResponse(e) : e;
        }
        throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
    }

    async sendBinaryMsg(
        reqId: bigint,
        action: string,
        message: ArrayBuffer,
        bSqlQuery: boolean = true,
        bResultBinary: boolean = false
    ): Promise<any> {
        const e: any = await this._wsConnector.sendBinaryMsg(reqId, action, message);
        if (bResultBinary) {
            return e;
        }
        if (e.msg.code == 0) {
            return bSqlQuery ? new WSQueryResponse(e) : e;
        }
        throw new WebSocketInterfaceError(e.msg.code, e.msg.message);
    }

    getState(): number {
        return this._wsConnector.readyState();
    }

    async sendMsg(msg: string): Promise<any> {
        logger.debug("[wsQueryInterface.sendMsg]===>" + msg);
        return this._wsConnector.sendMsg(msg);
    }

    async freeResult(res: WSQueryResponse): Promise<any> {
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
        await this._wsConnector.sendMsgNoResp(jsonStr);
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
            const result: any = await this._wsConnector.sendMsg(JSONBig.stringify(versionMsg));
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

    async close(): Promise<void> {
        await this._wsConnector.close();
    }

    async checkVersion(): Promise<void> {
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
