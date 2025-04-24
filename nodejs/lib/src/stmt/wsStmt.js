"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsStmt = void 0;
const wsError_1 = require("../common/wsError");
const wsProto_1 = require("./wsProto");
const reqid_1 = require("../common/reqid");
const constant_1 = require("../common/constant");
const wsParams_1 = require("./wsParams");
const log_1 = __importDefault(require("../common/log"));
class WsStmt {
    constructor(wsClient, precision) {
        this._precision = constant_1.PrecisionLength['ms'];
        this._wsClient = wsClient;
        if (precision) {
            this._precision = precision;
        }
    }
    static async newStmt(wsClient, precision, reqId) {
        try {
            let wsStmt = new WsStmt(wsClient, precision);
            return await wsStmt.init(reqId);
        }
        catch (e) {
            log_1.default.error(e.code, e.message);
            throw (e);
        }
    }
    async prepare(sql) {
        let queryMsg = {
            action: 'prepare',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                sql: sql,
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    async setTableName(tableName) {
        let queryMsg = {
            action: 'set_table_name',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                name: tableName,
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    async setJsonTags(tags) {
        let queryMsg = {
            action: 'set_tags',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                tags: tags,
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    newStmtParam() {
        return new wsParams_1.StmtBindParams(this._precision);
    }
    async setTags(paramsArray) {
        if (!paramsArray || !this._stmt_id) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!");
        }
        let columnInfos = paramsArray.getParams();
        if (!columnInfos) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!");
        }
        let reqId = BigInt(reqid_1.ReqId.getReqID());
        let dataBlock = (0, wsProto_1.binaryBlockEncode)(paramsArray, 1 /* StmtBindType.STMT_TYPE_TAG */, this._stmt_id, reqId, paramsArray.getDataRows());
        return await this.sendBinaryMsg(reqId, 'set_tags', dataBlock);
    }
    async bind(paramsArray) {
        if (!paramsArray || !this._stmt_id) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "BinaryBind paramArray is invalid!");
        }
        let columnInfos = paramsArray.getParams();
        if (!columnInfos) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "BinaryBind paramArray is invalid!");
        }
        let reqId = BigInt(reqid_1.ReqId.getReqID());
        let dataBlock = (0, wsProto_1.binaryBlockEncode)(paramsArray, 2 /* StmtBindType.STMT_TYPE_BIND */, this._stmt_id, reqId, paramsArray.getDataRows());
        return await this.sendBinaryMsg(reqId, 'bind', dataBlock);
    }
    async jsonBind(paramArray) {
        let queryMsg = {
            action: 'bind',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                columns: paramArray,
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    async batch() {
        let queryMsg = {
            action: 'add_batch',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    /**
     * return client version.
     */
    async version() {
        return await this._wsClient.version();
    }
    async exec() {
        let queryMsg = {
            action: 'exec',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg);
    }
    getLastAffected() {
        return this.lastAffected;
    }
    async close() {
        let queryMsg = {
            action: 'close',
            args: {
                req_id: reqid_1.ReqId.getReqID(),
                stmt_id: this._stmt_id,
            },
        };
        return await this.execute(queryMsg, false);
    }
    getStmtId() {
        return this._stmt_id;
    }
    async execute(queryMsg, register = true) {
        try {
            if (this._wsClient.getState() <= 0) {
                throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
            }
            let reqMsg = JSON.stringify(queryMsg);
            if (register) {
                let result = await this._wsClient.exec(reqMsg, false);
                let resp = new wsProto_1.WsStmtQueryResponse(result);
                if (resp.stmt_id) {
                    this._stmt_id = resp.stmt_id;
                }
                if (resp.affected) {
                    this.lastAffected = resp.affected;
                }
            }
            else {
                await this._wsClient.execNoResp(reqMsg);
                this._stmt_id = null;
                this.lastAffected = null;
            }
            return;
        }
        catch (e) {
            throw new wsError_1.TaosResultError(e.code, e.message);
        }
    }
    async sendBinaryMsg(reqId, action, message) {
        if (this._wsClient.getState() <= 0) {
            throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
        }
        let result = await this._wsClient.sendBinaryMsg(reqId, action, message, false);
        let resp = new wsProto_1.WsStmtQueryResponse(result);
        if (resp.stmt_id) {
            this._stmt_id = resp.stmt_id;
        }
        if (resp.affected) {
            this.lastAffected = resp.affected;
        }
    }
    async init(reqId) {
        if (this._wsClient) {
            try {
                if (this._wsClient.getState() <= 0) {
                    await this._wsClient.connect();
                }
                let queryMsg = {
                    action: 'init',
                    args: {
                        req_id: reqid_1.ReqId.getReqID(reqId),
                    },
                };
                await this.execute(queryMsg);
                return this;
            }
            catch (e) {
                log_1.default.error(e.code, e.message);
                throw (e);
            }
        }
        throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
    }
}
exports.WsStmt = WsStmt;
