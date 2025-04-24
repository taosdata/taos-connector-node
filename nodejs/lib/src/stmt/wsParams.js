"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StmtBindParams = exports.ColumnInfo = void 0;
const constant_1 = require("../common/constant");
const wsError_1 = require("../common/wsError");
const taosResult_1 = require("../common/taosResult");
const utils_1 = require("../common/utils");
class ColumnInfo {
    constructor([length, data], type, typeLen) {
        this.data = data;
        this.type = type;
        this.length = length;
        this.typeLen = typeLen;
    }
}
exports.ColumnInfo = ColumnInfo;
class StmtBindParams {
    constructor(precision) {
        this.precisionLength = constant_1.PrecisionLength['ms'];
        this._dataTotalLen = 0;
        this._rows = 0;
        if (precision) {
            this.precisionLength = precision;
        }
        this._params = [];
    }
    getDataRows() {
        return this._rows;
    }
    getDataTotalLen() {
        return this._dataTotalLen;
    }
    getParams() {
        return this._params;
    }
    setBoolean(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetBooleanColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "boolean", constant_1.TDengineTypeLength['BOOL'], constant_1.TDengineTypeCode.BOOL);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.BOOL, constant_1.TDengineTypeLength['BOOL']));
    }
    setTinyInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['TINYINT'], constant_1.TDengineTypeCode.TINYINT);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.TINYINT, constant_1.TDengineTypeLength['TINYINT']));
    }
    setUTinyInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetUTinyIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['TINYINT UNSIGNED'], constant_1.TDengineTypeCode.TINYINT_UNSIGNED);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.TINYINT_UNSIGNED, constant_1.TDengineTypeLength['TINYINT UNSIGNED']));
    }
    setSmallInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['SMALLINT'], constant_1.TDengineTypeCode.SMALLINT);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.SMALLINT, constant_1.TDengineTypeLength['SMALLINT']));
    }
    setUSmallInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['SMALLINT UNSIGNED'], constant_1.TDengineTypeCode.SMALLINT_UNSIGNED);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.SMALLINT_UNSIGNED, constant_1.TDengineTypeLength['SMALLINT UNSIGNED']));
    }
    setInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['INT'], constant_1.TDengineTypeCode.INT);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.INT, constant_1.TDengineTypeLength['INT']));
    }
    setUInt(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetUIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['INT UNSIGNED'], constant_1.TDengineTypeCode.INT_UNSIGNED);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.INT_UNSIGNED, constant_1.TDengineTypeLength['INT UNSIGNED']));
    }
    setBigint(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetBigIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "bigint", constant_1.TDengineTypeLength['BIGINT'], constant_1.TDengineTypeCode.BIGINT);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.INT, constant_1.TDengineTypeLength['BIGINT']));
    }
    setUBigint(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetUBigIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "bigint", constant_1.TDengineTypeLength['BIGINT UNSIGNED'], constant_1.TDengineTypeCode.BIGINT_UNSIGNED);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.BIGINT_UNSIGNED, constant_1.TDengineTypeLength['BIGINT UNSIGNED']));
    }
    setFloat(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetFloatColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['FLOAT'], constant_1.TDengineTypeCode.FLOAT);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.FLOAT, constant_1.TDengineTypeLength['FLOAT']));
    }
    setDouble(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetDoubleColumn params is invalid!");
        }
        let arrayBuffer = this.encodeDigitColumns(params, "number", constant_1.TDengineTypeLength['DOUBLE'], constant_1.TDengineTypeCode.DOUBLE);
        this._params.push(new ColumnInfo(arrayBuffer, constant_1.TDengineTypeCode.DOUBLE, constant_1.TDengineTypeLength['DOUBLE']));
    }
    setVarchar(params) {
        let data = this.encodeVarLengthColumn(params);
        this._params.push(new ColumnInfo(data, constant_1.TDengineTypeCode.VARCHAR, 0));
    }
    setBinary(params) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), constant_1.TDengineTypeCode.BINARY, 0));
    }
    setNchar(params) {
        this._params.push(new ColumnInfo(this.encodeNcharColumn(params), constant_1.TDengineTypeCode.NCHAR, 0));
    }
    setJson(params) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), constant_1.TDengineTypeCode.JSON, 0));
    }
    setVarBinary(params) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), constant_1.TDengineTypeCode.VARBINARY, 0));
    }
    setGeometry(params) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), constant_1.TDengineTypeCode.GEOMETRY, 0));
    }
    setTimestamp(params) {
        if (!params || params.length == 0) {
            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid!");
        }
        //computing bitmap length
        let bitMapLen = (0, taosResult_1.bitmapLen)(params.length);
        //Computing the length of data
        let arrayBuffer = new ArrayBuffer(bitMapLen + constant_1.TDengineTypeLength['TIMESTAMP'] * params.length);
        //bitmap get data range
        let bitmapBuffer = new DataView(arrayBuffer);
        //skip bitmap get data range 
        let dataBuffer = new DataView(arrayBuffer, bitMapLen);
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "wrong row length!");
            }
        }
        else {
            this._rows = params.length;
        }
        for (let i = 0; i < params.length; i++) {
            if (!(0, utils_1.isEmpty)(params[i])) {
                if (params[i] instanceof Date) {
                    let date = params[i];
                    //node only support milliseconds, need fill 0
                    if (this.precisionLength == constant_1.PrecisionLength['us']) {
                        let ms = date.getMilliseconds() * 1000;
                        dataBuffer.setBigInt64(i * 8, BigInt(ms), true);
                    }
                    else if (this.precisionLength == constant_1.PrecisionLength['ns']) {
                        let ns = date.getMilliseconds() * 1000 * 1000;
                        dataBuffer.setBigInt64(i * 8, BigInt(ns), true);
                    }
                    else {
                        dataBuffer.setBigInt64(i * 8, BigInt(date.getMilliseconds()), true);
                    }
                }
                else if (typeof params[i] == 'bigint' || typeof params[i] == 'number') {
                    let data;
                    if (typeof params[i] == 'number') {
                        data = BigInt(params[i]);
                    }
                    else {
                        data = params[i];
                    }
                    //statistical bits of digit
                    let digit = this.countBigintDigits(data);
                    //check digit same table Precision 
                    if (this.precisionLength == constant_1.PrecisionLength['ns']) {
                        if (this.precisionLength <= digit) {
                            dataBuffer.setBigInt64(i * 8, data, true);
                        }
                        else {
                            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params precisionLength is invalid! param:=" + params[i]);
                        }
                    }
                    else if (this.precisionLength == digit) {
                        dataBuffer.setBigInt64(i * 8, data, true);
                    }
                    else {
                        throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid! param:=" + params[i]);
                    }
                }
            }
            else {
                //set bitmap bit is null
                let charOffset = (0, taosResult_1.getCharOffset)(i);
                let nullVal = (0, taosResult_1.setBitmapNull)(dataBuffer.getInt8(charOffset), i);
                bitmapBuffer.setInt8(charOffset, nullVal);
            }
        }
        this._dataTotalLen += arrayBuffer.byteLength;
        this._params.push(new ColumnInfo([constant_1.TDengineTypeLength['TIMESTAMP'] * params.length, arrayBuffer], constant_1.TDengineTypeCode.TIMESTAMP, constant_1.TDengineTypeLength['TIMESTAMP']));
    }
    encodeDigitColumns(params, dataType = 'number', typeLen, columnType) {
        let bitMapLen = (0, taosResult_1.bitmapLen)(params.length);
        let arrayBuffer = new ArrayBuffer(typeLen * params.length + bitMapLen);
        let bitmapBuffer = new DataView(arrayBuffer);
        let dataBuffer = new DataView(arrayBuffer, bitMapLen);
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "wrong row length!");
            }
        }
        else {
            this._rows = params.length;
        }
        for (let i = 0; i < params.length; i++) {
            if (!(0, utils_1.isEmpty)(params[i])) {
                if (typeof params[i] == dataType) {
                    switch (columnType) {
                        case constant_1.TDengineTypeCode.BOOL: {
                            if (params[i]) {
                                dataBuffer.setInt8(i, 1);
                            }
                            else {
                                dataBuffer.setInt8(i, 0);
                            }
                            break;
                        }
                        case constant_1.TDengineTypeCode.TINYINT: {
                            dataBuffer.setInt8(i, params[i]);
                            break;
                        }
                        case constant_1.TDengineTypeCode.TINYINT_UNSIGNED: {
                            dataBuffer.setUint8(i, params[i]);
                            break;
                        }
                        case constant_1.TDengineTypeCode.SMALLINT: {
                            dataBuffer.setInt16(i * 2, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.SMALLINT_UNSIGNED: {
                            dataBuffer.setUint16(i * 2, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.INT: {
                            dataBuffer.setInt32(i * 4, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.INT_UNSIGNED: {
                            dataBuffer.setUint32(i * 4, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.BIGINT: {
                            dataBuffer.setBigInt64(i * 8, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.BIGINT_UNSIGNED: {
                            dataBuffer.setBigUint64(i * 8, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.FLOAT: {
                            dataBuffer.setFloat32(i * 4, params[i], true);
                            break;
                        }
                        case constant_1.TDengineTypeCode.DOUBLE: {
                            dataBuffer.setFloat64(i * 8, params[i], true);
                            break;
                        }
                        default: {
                            throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_UNSUPPORTED_TDENGINE_TYPE, "unsupported type for column" + columnType);
                        }
                    }
                }
                else {
                    throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid! param:=" + params[i]);
                }
            }
            else {
                //set bitmap bit is null
                let charOffset = (0, taosResult_1.getCharOffset)(i);
                let nullVal = (0, taosResult_1.setBitmapNull)(bitmapBuffer.getUint8(charOffset), i);
                bitmapBuffer.setInt8(charOffset, nullVal);
            }
        }
        this._dataTotalLen += dataBuffer.buffer.byteLength;
        return [typeLen * params.length, dataBuffer.buffer];
    }
    encodeVarLengthColumn(params) {
        let data = [];
        let dataLength = 0;
        //create params length buffer
        let paramsLenBuffer = new ArrayBuffer(constant_1.TDengineTypeLength['INT'] * params.length);
        let paramsLenView = new DataView(paramsLenBuffer);
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "wrong row length!");
            }
        }
        else {
            this._rows = params.length;
        }
        for (let i = 0; i < params.length; i++) {
            //get param length offset 4byte
            let offset = constant_1.TDengineTypeLength['INT'] * i;
            if (!(0, utils_1.isEmpty)(params[i])) {
                //save param length offset 4byte
                paramsLenView.setInt32(offset, dataLength, true);
                if (typeof params[i] == 'string') {
                    //string TextEncoder
                    let encode = new TextEncoder();
                    let value = encode.encode(params[i]).buffer;
                    data.push(value);
                    //add offset length
                    dataLength += value.byteLength + constant_1.TDengineTypeLength['SMALLINT'];
                }
                else if (params[i] instanceof ArrayBuffer) {
                    //input arraybuffer, save not need encode
                    let value = params[i];
                    dataLength += value.byteLength + constant_1.TDengineTypeLength['SMALLINT'];
                    data.push(value);
                }
                else {
                    throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "getColumString params is invalid! param_type:=" + typeof params[i]);
                }
            }
            else {
                //set length -1, param is null
                for (let j = 0; j < constant_1.TDengineTypeLength['INT']; j++) {
                    paramsLenView.setInt8(offset + j, 255);
                }
            }
        }
        this._dataTotalLen += paramsLenBuffer.byteLength + dataLength;
        return [dataLength, this.getBinaryColumnArrayBuffer(data, paramsLenView.buffer, dataLength)];
    }
    //splicing encode params to arraybuffer
    getBinaryColumnArrayBuffer(data, paramsLenBuffer, dataLength) {
        //create arraybuffer 
        let paramsBuffer = new ArrayBuffer(paramsLenBuffer.byteLength + dataLength);
        //get length data range
        const paramsUint8 = new Uint8Array(paramsBuffer);
        const paramsLenView = new Uint8Array(paramsLenBuffer);
        paramsUint8.set(paramsLenView, 0);
        //get data range
        const paramsView = new DataView(paramsBuffer, paramsLenBuffer.byteLength);
        let offset = 0;
        for (let i = 0; i < data.length; i++) {
            //save param field length
            paramsView.setInt16(offset, data[i].byteLength, true);
            const dataView = new DataView(data[i]);
            //save data
            for (let j = 0; j < data[i].byteLength; j++) {
                paramsView.setUint8(offset + 2 + j, dataView.getUint8(j));
            }
            offset += data[i].byteLength + 2;
        }
        return paramsBuffer;
    }
    //encode nchar type params
    encodeNcharColumn(params) {
        let data = [];
        let dataLength = 0;
        let indexBuffer = new ArrayBuffer(constant_1.TDengineTypeLength['INT'] * params.length);
        let indexView = new DataView(indexBuffer);
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "wrong row length!");
            }
        }
        else {
            this._rows = params.length;
        }
        for (let i = 0; i < params.length; i++) {
            let offset = constant_1.TDengineTypeLength['INT'] * i;
            if (!(0, utils_1.isEmpty)(params[i])) {
                indexView.setInt32(offset, dataLength, true);
                if (typeof params[i] == 'string') {
                    let codes = [];
                    let strNcharParams = params[i];
                    for (let j = 0; j < params[i].length; j++) {
                        //get char, cn char need 3~4 byte
                        codes.push(strNcharParams.charCodeAt(j));
                    }
                    let ncharBuffer = new ArrayBuffer(codes.length * 4);
                    let ncharView = new DataView(ncharBuffer);
                    for (let j = 0; j < codes.length; j++) {
                        //1char, save into uint32
                        ncharView.setUint32(j * 4, codes[j], true);
                    }
                    data.push(ncharBuffer);
                    dataLength += codes.length * 4 + constant_1.TDengineTypeLength['SMALLINT'];
                }
                else if (params[i] instanceof ArrayBuffer) {
                    let value = params[i];
                    dataLength += value.byteLength + constant_1.TDengineTypeLength['SMALLINT'];
                    data.push(value);
                }
                else {
                    throw new wsError_1.TaosError(wsError_1.ErrorCode.ERR_INVALID_PARAMS, "getColumString params is invalid! param_type:=" + typeof params[i]);
                }
            }
            else {
                //set length -1, param is null
                for (let j = 0; j < constant_1.TDengineTypeLength['INT']; j++) {
                    indexView.setInt8(offset + j, 255);
                }
            }
        }
        this._dataTotalLen += indexBuffer.byteLength + dataLength;
        return [dataLength, this.getBinaryColumnArrayBuffer(data, indexView.buffer, dataLength)];
    }
    countBigintDigits(numeral) {
        if (numeral === 0n) {
            return 1;
        }
        let count = 0;
        let temp = numeral;
        while (temp !== 0n) {
            temp /= 10n;
            count++;
        }
        return count;
    }
}
exports.StmtBindParams = StmtBindParams;
