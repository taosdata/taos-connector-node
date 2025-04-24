"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bitmapLen = exports.setBitmapNull = exports.getCharOffset = exports.getString = exports.readNchar = exports.readVarchar = exports.readBinary = exports.readSolidData = exports.readSolidDataToArray = exports._isVarType = exports.parseBlock = exports.TaosResult = void 0;
const constant_1 = require("./constant");
const wsError_1 = require("./wsError");
const ut8Helper_1 = require("./ut8Helper");
const log_1 = __importDefault(require("./log"));
class TaosResult {
    constructor(queryResponse) {
        this._totalTime = 0;
        if (queryResponse == null) {
            this._meta = [];
            this._data = [];
            this._timing = BigInt(0);
            return;
        }
        if (queryResponse.is_update == true) {
            this._meta = null;
            this._data = null;
        }
        else {
            if (queryResponse.fields_count && queryResponse.fields_names && queryResponse.fields_types && queryResponse.fields_lengths) {
                let _meta = [];
                for (let i = 0; i < queryResponse.fields_count; i++) {
                    _meta.push({
                        name: queryResponse.fields_names[i],
                        type: queryResponse.fields_types[i],
                        length: queryResponse.fields_lengths[i]
                    });
                }
                this._meta = _meta;
            }
            else {
                throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, `fields_count,fields_names,fields_types,fields_lengths of the update query response should be null`);
            }
            this._data = [];
        }
        this._affectRows = queryResponse.affected_rows;
        this._timing = queryResponse.timing;
        this._precision = queryResponse.precision;
        this._totalTime = queryResponse.totalTime;
    }
    setPrecision(precision) {
        this._precision = precision;
    }
    setRowsAndTime(rows, timing) {
        if (this._affectRows) {
            this._affectRows += rows;
        }
        else {
            this._affectRows = rows;
        }
        if (timing) {
            this.setTiming(timing);
        }
    }
    getTopic() {
        if (this._topic) {
            return this._topic;
        }
        return "";
    }
    setTopic(topic = "") {
        this._topic = topic;
    }
    getMeta() {
        return this.getTDengineMeta();
    }
    setMeta(metaData) {
        if (this._meta) {
            this._meta.push(metaData);
        }
    }
    getData() {
        return this._data;
    }
    setData(value) {
        this._data = value;
    }
    getAffectRows() {
        return this._affectRows;
    }
    getTaosMeta() {
        return this._meta;
    }
    getPrecision() {
        return this._precision;
    }
    getTotalTime() {
        return this._totalTime;
    }
    addTotalTime(totalTime) {
        this._totalTime += totalTime;
    }
    setTiming(timing) {
        if (!this._timing) {
            this._timing = BigInt(0);
        }
        if (timing) {
            this._timing = this._timing + timing;
        }
    }
    /**
     * Mapping the WebSocket response type code to TDengine's type name.
     */
    getTDengineMeta() {
        if (this._meta) {
            let tdMeta = new Array();
            this._meta.forEach(m => {
                tdMeta.push({
                    name: m.name,
                    type: constant_1.TDengineTypeName[m.type],
                    length: m.length
                });
            });
            return tdMeta;
        }
        return null;
    }
}
exports.TaosResult = TaosResult;
function parseBlock(blocks, taosResult) {
    let metaList = taosResult.getTaosMeta();
    let dataList = taosResult.getData();
    let textDecoder = new TextDecoder();
    if (metaList && dataList && blocks && blocks.data) {
        let rows = blocks.data.getUint32(8, true);
        if (rows == 0) {
            return taosResult;
        }
        taosResult.setTiming(blocks.timing);
        const INT_32_SIZE = 4;
        // Offset num of bytes from rawBlockBuffer.
        let bufferOffset = (4 * 5) + 8 + (4 + 1) * metaList.length;
        let colLengthBlockSize = INT_32_SIZE * metaList.length;
        log_1.default.debug("===colLengthBlockSize:" + colLengthBlockSize);
        let bitMapSize = (rows + (1 << 3) - 1) >> 3;
        // whole raw block ArrayBuffer
        // let dataBuffer = blocks.data.slice(bufferOffset);
        let headOffset = blocks.data.byteOffset + bufferOffset;
        let dataView = new DataView(blocks.data.buffer, headOffset);
        // record the head of column in block
        let colBlockHead = 0;
        for (let i = 0; i < rows; i++) {
            let row = [];
            // point to the head of the column in the block
            colBlockHead = 0 + colLengthBlockSize;
            // point to the head of columns's data in the block (include bitMap and offsetArray)
            let colDataHead = colBlockHead;
            // traverse row after row. 
            for (let j = 0; j < metaList.length; j++) {
                let isVarType = _isVarType(metaList[j].type);
                if (isVarType == constant_1.ColumnsBlockType.SOLID) {
                    colDataHead = colBlockHead + bitMapSize + metaList[j].length * i;
                    let byteArrayIndex = i >> 3;
                    let bitwiseOffset = 7 - (i & 7);
                    // let bitMapArr = dataBuffer.slice(colBlockHead, colBlockHead + bitMapSize)
                    let bitMapArr = new DataView(dataView.buffer, dataView.byteOffset + colBlockHead, bitMapSize);
                    let bitFlag = (bitMapArr.getUint8(byteArrayIndex) & (1 << bitwiseOffset)) >> bitwiseOffset;
                    if (bitFlag == 1) {
                        row.push("NULL");
                    }
                    else {
                        row.push(readSolidData(dataView, colDataHead, metaList[j]));
                    }
                    colBlockHead = colBlockHead + bitMapSize + dataView.getInt32(INT_32_SIZE * j, true);
                }
                else {
                    // if null check
                    let varOffset = dataView.getInt32(colBlockHead + (INT_32_SIZE * i), true);
                    if (varOffset == -1) {
                        row.push("NULL");
                        colBlockHead = colBlockHead + INT_32_SIZE * rows + dataView.getInt32(j * INT_32_SIZE, true);
                    }
                    else {
                        colDataHead = colBlockHead + INT_32_SIZE * rows + varOffset;
                        let dataLength = dataView.getInt16(colDataHead, true);
                        if (isVarType == constant_1.ColumnsBlockType.VARCHAR) {
                            row.push(readVarchar(dataView.buffer, dataView.byteOffset + colDataHead + 2, dataLength, textDecoder));
                        }
                        else if (isVarType == constant_1.ColumnsBlockType.GEOMETRY || isVarType == constant_1.ColumnsBlockType.VARBINARY) {
                            row.push(readBinary(dataView.buffer, dataView.byteOffset + colDataHead + 2, dataLength));
                        }
                        else {
                            row.push(readNchar(dataView.buffer, dataView.byteOffset + colDataHead + 2, dataLength));
                        }
                        colBlockHead = colBlockHead + INT_32_SIZE * rows + dataView.getInt32(j * INT_32_SIZE, true);
                    }
                }
            }
            dataList.push(row);
        }
        return taosResult;
    }
    else {
        throw new wsError_1.TaosResultError(wsError_1.ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, "cannot fetch block for an update query.");
    }
}
exports.parseBlock = parseBlock;
function _isVarType(metaType) {
    switch (metaType) {
        case constant_1.TDengineTypeCode.NCHAR: {
            return constant_1.ColumnsBlockType['NCHAR'];
        }
        case constant_1.TDengineTypeCode.VARCHAR: {
            return constant_1.ColumnsBlockType['VARCHAR'];
        }
        case constant_1.TDengineTypeCode.BINARY: {
            return constant_1.ColumnsBlockType['VARCHAR'];
        }
        case constant_1.TDengineTypeCode.JSON: {
            return constant_1.ColumnsBlockType['VARCHAR'];
        }
        case constant_1.TDengineTypeCode.GEOMETRY: {
            return constant_1.ColumnsBlockType['GEOMETRY'];
        }
        case constant_1.TDengineTypeCode.VARBINARY: {
            return constant_1.ColumnsBlockType.VARBINARY;
        }
        default: {
            return constant_1.ColumnsBlockType['SOLID'];
        }
    }
}
exports._isVarType = _isVarType;
function readSolidDataToArray(dataBuffer, colBlockHead, rows, metaType, bitMapArr) {
    let result = [];
    switch (metaType) {
        case constant_1.TDengineTypeCode.BOOL:
        case constant_1.TDengineTypeCode.TINYINT:
        case constant_1.TDengineTypeCode.TINYINT_UNSIGNED: {
            for (let i = 0; i < rows; i++, colBlockHead++) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getInt8(colBlockHead));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.SMALLINT: {
            for (let i = 0; i < rows; i++, colBlockHead += 2) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getInt16(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.INT: {
            for (let i = 0; i < rows; i++, colBlockHead += 4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getInt32(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.BIGINT: {
            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getBigInt64(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.SMALLINT_UNSIGNED: {
            for (let i = 0; i < rows; i++, colBlockHead += 2) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getUint16(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.INT_UNSIGNED: {
            for (let i = 0; i < rows; i++, colBlockHead += 4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getUint32(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.BIGINT_UNSIGNED: {
            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getBigUint64(colBlockHead, true));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.FLOAT: {
            for (let i = 0; i < rows; i++, colBlockHead += 4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(parseFloat(dataBuffer.getFloat32(colBlockHead, true).toFixed(5)));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.DOUBLE: {
            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(parseFloat(dataBuffer.getFloat64(colBlockHead, true).toFixed(15)));
                }
            }
            break;
        }
        case constant_1.TDengineTypeCode.TIMESTAMP: {
            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }
                else {
                    result.push(dataBuffer.getBigInt64(colBlockHead, true));
                }
            }
            break;
        }
        default: {
            throw new wsError_1.WebSocketQueryInterFaceError(wsError_1.ErrorCode.ERR_UNSUPPORTED_TDENGINE_TYPE, `unspported type ${metaType}`);
        }
    }
    return result;
}
exports.readSolidDataToArray = readSolidDataToArray;
function readSolidData(dataBuffer, colDataHead, meta) {
    switch (meta.type) {
        case constant_1.TDengineTypeCode.BOOL: {
            return (Boolean)(dataBuffer.getInt8(colDataHead));
        }
        case constant_1.TDengineTypeCode.TINYINT: {
            return dataBuffer.getInt8(colDataHead);
        }
        case constant_1.TDengineTypeCode.SMALLINT: {
            return dataBuffer.getInt16(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.INT: {
            return dataBuffer.getInt32(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.BIGINT: {
            return dataBuffer.getBigInt64(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.TINYINT_UNSIGNED: {
            return dataBuffer.getUint8(colDataHead);
        }
        case constant_1.TDengineTypeCode.SMALLINT_UNSIGNED: {
            return dataBuffer.getUint16(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.INT_UNSIGNED: {
            return dataBuffer.getUint32(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.BIGINT_UNSIGNED: {
            return dataBuffer.getBigUint64(colDataHead, true);
        }
        case constant_1.TDengineTypeCode.FLOAT: {
            return parseFloat(dataBuffer.getFloat32(colDataHead, true).toFixed(5));
        }
        case constant_1.TDengineTypeCode.DOUBLE: {
            return parseFloat(dataBuffer.getFloat64(colDataHead, true).toFixed(15));
        }
        case constant_1.TDengineTypeCode.TIMESTAMP: {
            return dataBuffer.getBigInt64(colDataHead, true);
            // could change 
        }
        default: {
            throw new wsError_1.WebSocketQueryInterFaceError(wsError_1.ErrorCode.ERR_UNSUPPORTED_TDENGINE_TYPE, `unspported type ${meta.type} for column ${meta.name}`);
        }
    }
}
exports.readSolidData = readSolidData;
function readBinary(dataBuffer, colDataHead, length) {
    let buff = dataBuffer.slice(colDataHead, colDataHead + length);
    return buff;
}
exports.readBinary = readBinary;
function readVarchar(dataBuffer, colDataHead, length, textDecoder) {
    // let buff = dataBuffer.slice(colDataHead, colDataHead + length)
    let dataView = new DataView(dataBuffer, colDataHead, length);
    return textDecoder.decode(dataView);
}
exports.readVarchar = readVarchar;
function readNchar(dataBuffer, colDataHead, length) {
    let data = [];
    // let buff: ArrayBuffer = dataBuffer.slice(colDataHead, colDataHead + length);
    let dataView = new DataView(dataBuffer, colDataHead, length);
    for (let i = 0; i < length / 4; i++) {
        data.push((0, ut8Helper_1.appendRune)(dataView.getUint32(i * 4, true)));
    }
    return data.join('');
}
exports.readNchar = readNchar;
function getString(dataBuffer, colDataHead, length, textDecoder) {
    // let buff = dataBuffer.slice(colDataHead, colDataHead + length - 1)
    let dataView = new Uint8Array(dataBuffer.buffer, dataBuffer.byteOffset + colDataHead, length - 1);
    return textDecoder.decode(dataView);
}
exports.getString = getString;
function iteratorBuff(arr) {
    let buf = Buffer.from(arr);
    for (const value of buf) {
        log_1.default.debug(value.toString());
    }
}
function isNull(bitMapArr, n) {
    let c = new Uint8Array(bitMapArr);
    let position = n >>> 3;
    let index = n & 0x7;
    return (c[position] & (1 << (7 - index))) == (1 << (7 - index));
}
function getCharOffset(n) {
    return n >> 3;
}
exports.getCharOffset = getCharOffset;
function setBitmapNull(c, n) {
    return c + (1 << (7 - bitPos(n)));
}
exports.setBitmapNull = setBitmapNull;
function bitPos(n) {
    return n & ((1 << 3) - 1);
}
function bitmapLen(n) {
    return ((n) + ((1 << 3) - 1)) >> 3;
}
exports.bitmapLen = bitmapLen;
