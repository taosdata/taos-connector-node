"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsClient = void 0;
const json_bigint_1 = __importDefault(require("json-bigint"));
const wsConnectorPool_1 = require("./wsConnectorPool");
const wsError_1 = require("../common/wsError");
const wsResponse_1 = require("./wsResponse");
const reqid_1 = require("../common/reqid");
const log_1 = __importDefault(require("../common/log"));
const utils_1 = require("../common/utils");
class WsClient {
    constructor(url, timeout) {
        this.checkURL(url);
        this._url = url;
        this._timeout = timeout;
    }
    async connect(database) {
        let _db = this._url.pathname.split('/')[3];
        if (database) {
            _db = database;
        }
        let connMsg = {
            action: 'conn',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                user: (0, utils_1.safeDecodeURIComponent)(this._url.username),
                password: (0, utils_1.safeDecodeURIComponent)(this._url.password),
                db: _db,
            },
        };
        this._wsConnector = await wsConnectorPool_1.WebSocketConnectionPool.instance().getConnection(this._url, this._timeout);
        if (this._wsConnector.readyState() > 0) {
            return;
        }
        try {
            await this._wsConnector.ready();
            let result = await this._wsConnector.sendMsg(JSON.stringify(connMsg));
            if (result.msg.code == 0) {
                return;
            }
            throw (new wsError_1.WebSocketQueryError(result.msg.code, result.msg.message));
        }
        catch (e) {
            log_1.default.error(e.code, e.message);
            throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}`));
        }
    }
    async execNoResp(queryMsg) {
        log_1.default.debug('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
        if (this._wsConnector && this._wsConnector.readyState() > 0) {
            await this._wsConnector.sendMsgNoResp(queryMsg);
            return;
        }
        throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
    }
    // need to construct Response.
    async exec(queryMsg, bSqlQuery = true) {
        return new Promise((resolve, reject) => {
            log_1.default.debug('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(queryMsg).then((e) => {
                    if (e.msg.code == 0) {
                        if (bSqlQuery) {
                            resolve(new wsResponse_1.WSQueryResponse(e));
                        }
                        else {
                            resolve(e);
                        }
                    }
                    else {
                        reject(new wsError_1.WebSocketInterfaceError(e.msg.code, e.msg.message));
                    }
                }).catch((e) => { reject(e); });
            }
            else {
                reject(new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }
    // need to construct Response.
    async sendBinaryMsg(reqId, action, message, bSqlQuery = true, bResultBinary = false) {
        return new Promise((resolve, reject) => {
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendBinaryMsg(reqId, action, message).then((e) => {
                    if (bResultBinary) {
                        resolve(e);
                    }
                    if (e.msg.code == 0) {
                        if (bSqlQuery) {
                            resolve(new wsResponse_1.WSQueryResponse(e));
                        }
                        else {
                            resolve(e);
                        }
                    }
                    else {
                        reject(new wsError_1.WebSocketInterfaceError(e.msg.code, e.msg.message));
                    }
                }).catch((e) => { reject(e); });
            }
            else {
                reject(new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }
    getState() {
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
    }
    async ready() {
        try {
            this._wsConnector = await wsConnectorPool_1.WebSocketConnectionPool.instance().getConnection(this._url, this._timeout);
            if (this._wsConnector.readyState() <= 0) {
                await this._wsConnector.ready();
            }
            log_1.default.debug("ready status ", this._url, this._wsConnector.readyState());
            return;
        }
        catch (e) {
            log_1.default.error(e.code, e.message);
            throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}`));
        }
    }
    async sendMsg(msg) {
        return new Promise((resolve, reject) => {
            log_1.default.debug("[wsQueryInterface.sendMsg]===>" + msg);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(msg).then((e) => {
                    resolve(e);
                }).catch((e) => reject(e));
            }
            else {
                reject(new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }
    async freeResult(res) {
        let freeResultMsg = {
            action: 'free_result',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                id: res.id,
            },
        };
        return new Promise((resolve, reject) => {
            let jsonStr = json_bigint_1.default.stringify(freeResultMsg);
            log_1.default.debug("[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(jsonStr, false)
                    .then((e) => { resolve(e); })
                    .catch((e) => reject(e));
            }
            else {
                reject(new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }
    async version() {
        let versionMsg = {
            action: 'version',
            args: {
                req_id: reqid_1.ReqId.getReqID()
            },
        };
        if (this._wsConnector) {
            try {
                if (this._wsConnector.readyState() <= 0) {
                    await this._wsConnector.ready();
                }
                let result = await this._wsConnector.sendMsg(json_bigint_1.default.stringify(versionMsg));
                if (result.msg.code == 0) {
                    return new wsResponse_1.WSVersionResponse(result).version;
                }
                throw (new wsError_1.WebSocketInterfaceError(result.msg.code, result.msg.message));
            }
            catch (e) {
                log_1.default.error(e.code, e.message);
                throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}`));
            }
        }
        throw (wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect");
    }
    async close() {
        if (this._wsConnector) {
            await wsConnectorPool_1.WebSocketConnectionPool.instance().releaseConnection(this._wsConnector);
            this._wsConnector = undefined;
            // this._wsConnector.close();
        }
    }
    checkURL(url) {
        // Assert is cloud url
        if (!url.searchParams.has('token')) {
            if (!(url.username || url.password)) {
                throw new wsError_1.WebSocketInterfaceError(wsError_1.ErrorCode.ERR_INVALID_AUTHENTICATION, 'invalid url, password or username needed.');
            }
        }
    }
}
exports.WsClient = WsClient;
