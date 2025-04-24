"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.binaryBlockEncode = exports.WsStmtQueryResponse = void 0;
const wsResponse_1 = require("../client/wsResponse");
const constant_1 = require("../common/constant");
class WsStmtQueryResponse extends wsResponse_1.WSQueryResponse {
    constructor(resp) {
        super(resp);
        this.stmt_id = resp.msg.stmt_id;
        this.affected = resp.msg.affected;
    }
}
exports.WsStmtQueryResponse = WsStmtQueryResponse;
function binaryBlockEncode(bindParams, bindType, stmtId, reqId, row) {
    //Computing the length of data
    let columns = bindParams.getParams().length;
    let length = constant_1.TDengineTypeLength['BIGINT'] * 4;
    length += constant_1.TDengineTypeLength['INT'] * 5;
    length += columns * 5 + columns * 4;
    length += bindParams.getDataTotalLen();
    let arrayBuffer = new ArrayBuffer(length);
    let arrayView = new DataView(arrayBuffer);
    arrayView.setBigUint64(0, reqId, true);
    arrayView.setBigUint64(8, BigInt(stmtId), true);
    arrayView.setBigUint64(16, BigInt(bindType), true);
    //version int32
    arrayView.setUint32(24, 1, true);
    //data length int32
    arrayView.setUint32(28, arrayBuffer.byteLength, true);
    //rows int32
    arrayView.setUint32(32, row, true);
    //columns int32
    arrayView.setUint32(36, columns, true);
    //flagSegment int32
    arrayView.setUint32(40, 0, true);
    //groupID uint64
    arrayView.setBigUint64(44, BigInt(0), true);
    //head length
    let offset = 52;
    //type data range
    let typeView = new DataView(arrayBuffer, offset);
    //length data range
    let lenView = new DataView(arrayBuffer, offset + columns * 5);
    //data range offset
    let dataOffset = offset + columns * 5 + columns * 4;
    let headOffset = 0;
    let columnsData = bindParams.getParams();
    for (let i = 0; i < columnsData.length; i++) {
        //set column data type
        typeView.setUint8(headOffset, columnsData[i].type);
        //set column type length
        typeView.setUint32(headOffset + 1, columnsData[i].typeLen, true);
        //set column data length
        lenView.setUint32(i * 4, columnsData[i].length, true);
        if (columnsData[i].data) {
            //get encode column data
            const sourceView = new Uint8Array(columnsData[i].data);
            const destView = new Uint8Array(arrayBuffer, dataOffset, columnsData[i].data.byteLength);
            //splicing data
            destView.set(sourceView);
            dataOffset += columnsData[i].data.byteLength;
        }
        headOffset += 5;
    }
    return arrayBuffer;
}
exports.binaryBlockEncode = binaryBlockEncode;
