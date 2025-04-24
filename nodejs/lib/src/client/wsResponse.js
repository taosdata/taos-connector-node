"use strict";
/**
 * define ws Response type|class, for query?
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSConnResponse = exports.WSFetchBlockResponse = exports.WSQueryResponse = exports.WSVersionResponse = void 0;
const taosResult_1 = require("../common/taosResult");
class WSVersionResponse {
    constructor(resp) {
        this.version = resp.msg.version;
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
    }
}
exports.WSVersionResponse = WSVersionResponse;
class WSQueryResponse {
    constructor(resp) {
        this.totalTime = resp.totalTime;
        this.initMsg(resp.msg);
    }
    initMsg(msg) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = BigInt(msg.timing);
        if (msg.id) {
            this.id = BigInt(msg.id);
        }
        else {
            this.id = BigInt(0);
        }
        this.is_update = msg.is_update;
        this.affected_rows = msg.affected_rows;
        this.fields_count = msg.fields_count;
        this.fields_names = msg.fields_names;
        this.fields_types = msg.fields_types;
        this.fields_lengths = msg.fields_lengths;
        this.precision = msg.precision;
    }
}
exports.WSQueryResponse = WSQueryResponse;
class WSFetchBlockResponse {
    constructor(msg) {
        let dataView = new DataView(msg);
        this.action = dataView.getBigUint64(8, true);
        this.timing = dataView.getBigUint64(18, true);
        this.reqId = dataView.getBigUint64(26, true);
        this.code = dataView.getUint32(34, true);
        this.textDecoder = new TextDecoder();
        this.blockLen = 0;
        if (this.code != 0) {
            let len = dataView.getUint32(38, true);
            this.message = (0, taosResult_1.readVarchar)(msg, 42, len, this.textDecoder);
            return;
        }
        this.resultId = dataView.getBigUint64(42, true);
        let offset = 50;
        if (this.action == BigInt(8)) {
            this.metaType = dataView.getUint16(50, true);
            offset += 2;
        }
        else {
            this.finished = dataView.getUint8(50);
            if (this.finished == 1) {
                return;
            }
            offset += 1;
        }
        this.blockLen = dataView.getUint32(offset, true);
        if (this.blockLen > 0) {
            this.data = new DataView(msg, offset + 4);
        }
    }
}
exports.WSFetchBlockResponse = WSFetchBlockResponse;
class WSConnResponse {
    constructor(msg) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = BigInt(msg.timing);
    }
}
exports.WSConnResponse = WSConnResponse;
