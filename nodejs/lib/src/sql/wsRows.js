"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSRows = void 0;
const taosResult_1 = require("../common/taosResult");
const wsError_1 = require("../common/wsError");
const wsResponse_1 = require("../client/wsResponse");
const log_1 = __importDefault(require("../common/log"));
const reqid_1 = require("../common/reqid");
const utils_1 = require("../common/utils");
const constant_1 = require("../common/constant");
class WSRows {
    constructor(wsInterface, resp) {
        this._wsClient = wsInterface;
        this._wsQueryResponse = resp;
        this._taosResult = new taosResult_1.TaosResult(resp);
        this._isClose = false;
    }
    async next() {
        if (this._wsQueryResponse.is_update || this._isClose) {
            log_1.default.debug("WSRows::Next::End=>", this._taosResult, this._isClose);
            return false;
        }
        let data = this._taosResult.getData();
        if (this._taosResult && data != null) {
            if (data && Array.isArray(this._taosResult.getData()) && data.length > 0) {
                return true;
            }
        }
        this._taosResult = await this.getBlockData();
        if (this._taosResult.getData()) {
            return true;
        }
        return false;
    }
    async getBlockData() {
        try {
            if (this._wsQueryResponse.id) {
                let bigintReqId = BigInt(reqid_1.ReqId.getReqID());
                let resp = await this._wsClient.sendBinaryMsg(bigintReqId, "binary_query", (0, utils_1.getBinarySql)(constant_1.FetchRawBlockMessage, bigintReqId, BigInt(this._wsQueryResponse.id)), false, true);
                this._taosResult.addTotalTime(resp.totalTime);
                let wsResponse = new wsResponse_1.WSFetchBlockResponse(resp.msg);
                if (wsResponse.code != 0) {
                    log_1.default.error("Executing SQL statement returns error: ", wsResponse.code, wsResponse.message);
                    throw new wsError_1.TaosResultError(wsResponse.code, wsResponse.message);
                }
                if (wsResponse.finished == 1) {
                    this.close();
                    this._taosResult.setData(null);
                }
                else {
                    (0, taosResult_1.parseBlock)(wsResponse, this._taosResult);
                }
            }
            return this._taosResult;
        }
        catch (err) {
            this.close();
            throw new wsError_1.TaosResultError(err.code, err.message);
        }
    }
    getMeta() {
        return this._taosResult.getMeta();
    }
    getData() {
        if (this._wsQueryResponse.is_update) {
            return undefined;
        }
        let data = this._taosResult.getData();
        if (this._taosResult && data != null) {
            if (Array.isArray(data) && data.length > 0) {
                return data.pop();
            }
        }
        return undefined;
    }
    async close() {
        if (this._isClose) {
            return;
        }
        this._isClose = true;
        this._wsClient.freeResult(this._wsQueryResponse);
    }
}
exports.WSRows = WSRows;
