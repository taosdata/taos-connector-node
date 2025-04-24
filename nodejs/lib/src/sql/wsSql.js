"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsSql = void 0;
const wsRows_1 = require("./wsRows");
const taosResult_1 = require("../common/taosResult");
const wsClient_1 = require("../client/wsClient");
const wsError_1 = require("../common/wsError");
const utils_1 = require("../common/utils");
const wsResponse_1 = require("../client/wsResponse");
const wsStmt_1 = require("../stmt/wsStmt");
const reqid_1 = require("../common/reqid");
const constant_1 = require("../common/constant");
const log_1 = __importDefault(require("../common/log"));
class WsSql {
    constructor(wsConfig) {
        let url = (0, utils_1.getUrl)(wsConfig);
        this._wsClient = new wsClient_1.WsClient(url, wsConfig.getTimeOut());
        this.wsConfig = wsConfig;
    }
    static async open(wsConfig) {
        if (!wsConfig.getUrl()) {
            throw new wsError_1.WebSocketInterfaceError(wsError_1.ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
        }
        let wsSql = new WsSql(wsConfig);
        let database = wsConfig.getDb();
        try {
            await wsSql._wsClient.connect(database);
            if (database && database.length > 0) {
                await wsSql.exec(`use ${database}`);
            }
            return wsSql;
        }
        catch (e) {
            log_1.default.error(e.code, e.message);
            throw (e);
        }
    }
    state() {
        return this._wsClient.getState();
    }
    /**
     * return client version.
     */
    async version() {
        return await this._wsClient.version();
    }
    async close() {
        await this._wsClient.close();
    }
    async schemalessInsert(lines, protocol, precision, ttl, reqId) {
        let data = '';
        if (!lines || lines.length == 0 || !protocol) {
            throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, 'WsSchemaless Insert params is error!');
        }
        lines.forEach((element, index) => {
            data += element;
            if (index < lines.length - 1) {
                data += '\n';
            }
        });
        let queryMsg = {
            action: 'insert',
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                protocol: protocol,
                precision: precision,
                data: data,
                ttl: ttl,
            },
        };
        return await this.executeSchemalessInsert(queryMsg);
    }
    async stmtInit(reqId) {
        if (this._wsClient) {
            try {
                let precision = constant_1.PrecisionLength["ms"];
                if (this.wsConfig.getDb()) {
                    let sql = "select `precision` from information_schema.ins_databases where name = '" + this.wsConfig.getDb() + "'";
                    let result = await this.exec(sql);
                    let data = result.getData();
                    if (data && data[0] && data[0][0]) {
                        precision = constant_1.PrecisionLength[data[0][0]];
                    }
                }
                return await wsStmt_1.WsStmt.newStmt(this._wsClient, precision, reqId);
            }
            catch (e) {
                log_1.default.error(e.code, e.message);
                throw (e);
            }
        }
        throw (new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
    }
    async exec(sql, reqId, action = 'binary_query') {
        try {
            let bigintReqId = BigInt(reqid_1.ReqId.getReqID(reqId));
            let wsQueryResponse = await this._wsClient.sendBinaryMsg(bigintReqId, action, (0, utils_1.getBinarySql)(constant_1.BinaryQueryMessage, bigintReqId, BigInt(0), sql));
            let taosResult = new taosResult_1.TaosResult(wsQueryResponse);
            if (wsQueryResponse.is_update) {
                return taosResult;
            }
            else {
                if (wsQueryResponse.id) {
                    try {
                        while (true) {
                            let bigintReqId = BigInt(reqid_1.ReqId.getReqID(reqId));
                            let resp = await this._wsClient.sendBinaryMsg(bigintReqId, action, (0, utils_1.getBinarySql)(constant_1.FetchRawBlockMessage, bigintReqId, BigInt(wsQueryResponse.id)), false, true);
                            taosResult.addTotalTime(resp.totalTime);
                            let wsResponse = new wsResponse_1.WSFetchBlockResponse(resp.msg);
                            if (wsResponse.code != 0) {
                                log_1.default.error("Executing SQL statement returns error: ", wsResponse.code, wsResponse.message);
                                throw new wsError_1.TaosResultError(wsResponse.code, wsResponse.message);
                            }
                            if (wsResponse.finished == 1) {
                                break;
                            }
                            (0, taosResult_1.parseBlock)(wsResponse, taosResult);
                        }
                        return taosResult;
                    }
                    catch (err) {
                        throw new wsError_1.TaosResultError(err.code, err.message);
                    }
                    finally {
                        this._wsClient.freeResult(wsQueryResponse);
                    }
                }
                throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, "The result data of the query is incorrect");
            }
        }
        catch (err) {
            throw new wsError_1.TaosResultError(err.code, err.message);
        }
    }
    async executeSchemalessInsert(queryMsg) {
        return new Promise(async (resolve, reject) => {
            try {
                let reqMsg = JSON.stringify(queryMsg);
                let result = await this._wsClient.exec(reqMsg);
                log_1.default.debug("executeSchemalessInsert:", reqMsg, result);
                resolve();
            }
            catch (e) {
                reject(new wsError_1.TaosResultError(e.code, e.message));
            }
        });
    }
    async query(sql, reqId) {
        try {
            let bigintReqId = BigInt(reqid_1.ReqId.getReqID(reqId));
            let wsQueryResponse = await this._wsClient.sendBinaryMsg(bigintReqId, 'binary_query', (0, utils_1.getBinarySql)(constant_1.BinaryQueryMessage, bigintReqId, BigInt(0), sql));
            return new wsRows_1.WSRows(this._wsClient, wsQueryResponse);
        }
        catch (err) {
            throw new wsError_1.TaosResultError(err.code, err.message);
        }
    }
    getSql(sql, reqId, action = 'query') {
        // construct msg
        let queryMsg = {
            action: action,
            args: {
                req_id: reqid_1.ReqId.getReqID(reqId),
                sql: sql,
                id: 0
            },
        };
        return JSON.stringify(queryMsg);
    }
}
exports.WsSql = WsSql;
