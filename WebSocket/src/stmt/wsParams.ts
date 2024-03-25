import { throws } from "assert";
import { PrecisionLength, TDengineTypeCode, TDengineTypeLength } from "../common/constant";
import { ErrorCode, TaosError } from "../common/wsError";
import { CharOffset, BMSetNull, BitmapLen} from "../common/taosResult"

export class ColumnInfo {
    data:ArrayBuffer;
    length:number;
    type:number;
    typeLen:number;
    constructor([length,data]:[number, ArrayBuffer], type:number, typeLen:number) {
        this.data = data;
        this.type = type;
        this.length = length;
        this.typeLen = typeLen;
    }

}

export class StmtBindParams {
    private precisionLength:number = PrecisionLength['ms']
    private _params: ColumnInfo[];
    private _dataTotalLen:number = 0;
    private _rows = 0;
    constructor(precision?:number) {
        if (precision) {
            this.precisionLength = precision
        }
        this._params = [];
        
    }

    public GetDataRows(): number {
        return this._rows;
    }

    public GetDataTotalLen(): number {
        return this._dataTotalLen;
    }

    public GetParams(): ColumnInfo[] {
        return this._params;
    }

    SetBooleanColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBooleanColumn params is invalid!");
        }
        let arrayBuffer = this.getColumnNumbers(params, "boolean", TDengineTypeLength['BOOL'], TDengineTypeCode['BOOL'])
        
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['BOOL'], TDengineTypeLength['BOOL'])) ;
    }

    SetTinyIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid!");
        }
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['TINYINT'], TDengineTypeCode['TINYINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['TINYINT'], TDengineTypeLength['TINYINT']));
    }

    SetUTinyIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUTinyIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['TINYINT UNSIGNED'], TDengineTypeCode['TINYINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['TINYINT UNSIGNED'], TDengineTypeLength['TINYINT UNSIGNED']));
    }

    SetSmallIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['SMALLINT'], TDengineTypeCode['SMALLINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['SMALLINT'], TDengineTypeLength['SMALLINT']));

    }

    SetUSmallIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['SMALLINT UNSIGNED'], TDengineTypeCode['SMALLINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['SMALLINT UNSIGNED'], TDengineTypeLength['SMALLINT UNSIGNED']));
    }

    SetIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['INT'], TDengineTypeCode['INT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT'], TDengineTypeLength['INT']));
    }

    SetUIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['INT UNSIGNED'], TDengineTypeCode['INT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT UNSIGNED'], TDengineTypeLength['INT UNSIGNED']));
    }

    SetBigIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBigIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "bigint", TDengineTypeLength['BIGINT'], TDengineTypeCode['BIGINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT'], TDengineTypeLength['BIGINT']));
    }

    SetUBigIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUBigIntColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "bigint", TDengineTypeLength['BIGINT UNSIGNED'], TDengineTypeCode['BIGINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['BIGINT UNSIGNED'], TDengineTypeLength['BIGINT UNSIGNED'])); 
    }

    SetFloatColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetFloatColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['FLOAT'], TDengineTypeCode['FLOAT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['FLOAT'], TDengineTypeLength['FLOAT'])); 
    }

    SetDoubleColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetDoubleColumn params is invalid!");
        }      
        let arrayBuffer = this.getColumnNumbers(params, "number", TDengineTypeLength['DOUBLE'], TDengineTypeCode['DOUBLE'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['DOUBLE'], TDengineTypeLength['DOUBLE'])); 
    }

    SetVarcharColumn(params :any[]) {
        let data = this.getStringColumn(params)
        this._params.push(new ColumnInfo(data, TDengineTypeCode['VARCHAR'], 0));
    }

    SetBinaryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.getStringColumn(params), TDengineTypeCode['BINARY'], 0));
    }

    SetNcharColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.getNcharColumn(params), TDengineTypeCode['NCHAR'], 0));
    }

    SetJsonColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.getStringColumn(params), TDengineTypeCode['JSON'], 0));
    }

    SetVarBinaryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.getStringColumn(params), TDengineTypeCode['VARBINARY'], 0));
    }

    SetGeometryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.getStringColumn(params), TDengineTypeCode['GEOMETRY'], 0));
    }

    SetTimestampColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid!");
        } 
        
        let nullCount = 0;
        let bitMapLen:number = BitmapLen(params.length)
        let arrayBuffer = new ArrayBuffer(bitMapLen + TDengineTypeLength['TIMESTAMP'] * params.length);
        let dataBuffer = new DataView(arrayBuffer, bitMapLen)
        this._rows = params.length;
        for (let i = 0; i < params.length; i++) {
            if (params[i]) {
                if (params[i] instanceof Date) {
                    let date:Date = params[i]
                    if (this.precisionLength == PrecisionLength['us']) {
                        let ms =  date.getMilliseconds() * 1000
                        dataBuffer.setBigInt64(i * 8, BigInt(ms), true);
                    }else if (this.precisionLength == PrecisionLength['ns']) {
                        let ns =  date.getMilliseconds() * 1000 * 1000
                        dataBuffer.setBigInt64(i * 8, BigInt(ns), true);
                    }else {
                        dataBuffer.setBigInt64(i * 8, BigInt(date.getMilliseconds()), true);
                    }
                    
                } else if (typeof params[i] == 'bigint' || typeof params[i] == 'number') {

                    let data:bigint
                    if (typeof params[i] == 'number') {
                        data = BigInt(params[i])
                    }else {
                        data = params[i]
                    }
                    let ndigit = this.countBigintDigits(data)
                    if (this.precisionLength == PrecisionLength['ns']) {
                        if (this.precisionLength <= ndigit) {
                            dataBuffer.setBigInt64(i * 8, data, true);
                        } else {
                            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid! param:=" + params[i])
                        }          
                    } else if (this.precisionLength == ndigit) {
                        dataBuffer.setBigInt64(i * 8, data, true);
                    } else {
                        throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid! param:=" + params[i])
                    }        
                }
            }else{

                let bitmapBuffer = new DataView(arrayBuffer)
                let charOffset = CharOffset(i);
                let nullVal = BMSetNull(dataBuffer.getInt8(charOffset), i);
                bitmapBuffer.setInt8(charOffset, nullVal);
                nullCount++;                      
            }
        }
        if (nullCount > 0) {
            arrayBuffer = arrayBuffer.slice(0, arrayBuffer.byteLength - nullCount * TDengineTypeLength['TIMESTAMP']); 
        } 
        this._dataTotalLen += arrayBuffer.byteLength; 
        this._params.push(new ColumnInfo([TDengineTypeLength['TIMESTAMP'] * params.length, arrayBuffer], TDengineTypeCode['TIMESTAMP'], TDengineTypeLength['TIMESTAMP']));  
    }


    private getColumnNumbers(params:any[], dataType:string = 'number', typeLen:number, columnType:number):[number, ArrayBuffer] {
        let bitMapLen:number = BitmapLen(params.length)
        let arrayBuffer = new ArrayBuffer(typeLen * params.length + bitMapLen);
        // console.log("ddddd=>", bitMapLen, typeLen * params.length, columnType)
        let dataBuffer = new DataView(arrayBuffer, bitMapLen)
        this._rows = params.length;
        let nullCount = 0;
        for (let i = 0; i < params.length; i++) {
            if (params[i]) {
                if (typeof params[i] == dataType) {
                    switch (columnType) {
                        case TDengineTypeCode['BOOL']: {
                            if (params[i]) {
                                dataBuffer.setInt8(i, 1);
                            } else {
                                dataBuffer.setInt8(i, 0);
                            }
                            break;
                        }
                        case TDengineTypeCode['TINYINT']: {
                            dataBuffer.setInt8(i, params[i]);
                            break;
                        }
                        case TDengineTypeCode['TINYINT UNSIGNED']: {
                            dataBuffer.setUint8(i, params[i]);
                            break;
                        }
                        case TDengineTypeCode['SMALLINT']: {
                            dataBuffer.setInt16(i * 2, params[i], true);
                            break;
                        }
                        case TDengineTypeCode['SMALLINT UNSIGNED']: {
                            dataBuffer.setUint16(i * 2, params[i], true);
                            break;
                        }

                        case TDengineTypeCode['INT']: {
                            dataBuffer.setInt32(i * 4, params[i], true);
                            break;
                        }

                        case TDengineTypeCode['INT UNSIGNED']: {
                            dataBuffer.setUint32(i * 4, params[i], true);
                            break;
                        }

                        case TDengineTypeCode['BIGINT']: {
                            dataBuffer.setBigInt64(i * 8, params[i], true);
                            break;
                        }

                        case TDengineTypeCode['BIGINT UNSIGNED']: {
                            dataBuffer.setBigUint64(i * 8, params[i], true);
                            break;
                        }

                        case TDengineTypeCode['FLOAT']: {
                            dataBuffer.setFloat32(i * 4, params[i], true);
                            break;
                        }
                        case TDengineTypeCode['DOUBLE']: {
                            dataBuffer.setFloat64(i * 8, params[i], true);
                            break;
                        }
                        default: {
                            throw new TaosError(ErrorCode.ERR_UNSPPORTED_TDENGINE_TYPE, "unspported type for column" + columnType)
                        }
                    }

                } else {
                    throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid! param:=" + params[i])
                }  
            } else {
                    let bitmapBuffer = new DataView(arrayBuffer)
                    let charOffset = CharOffset(i);
                    let nullVal = BMSetNull(dataBuffer.getInt8(charOffset), i);
                    bitmapBuffer.setInt8(charOffset, nullVal);  
                    nullCount++;                 
            }
        }

        if (nullCount > 0) {
            arrayBuffer = arrayBuffer.slice(0, arrayBuffer.byteLength - nullCount * typeLen); 
        }
        this._dataTotalLen += dataBuffer.buffer.byteLength;
        return [typeLen * params.length, dataBuffer.buffer];
    }

    private getStringColumn(params:any[]):[number, ArrayBuffer] {
        let data:ArrayBuffer[] = []
        let dataLength = 0;
        let indexBuffer = new ArrayBuffer(TDengineTypeLength['INT'] * params.length)
        let indexView = new DataView(indexBuffer)
        this._rows = params.length;
        for (let i = 0; i <  params.length; i++) {
            let offset = TDengineTypeLength['INT'] * i;
            if (params[i]) {
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    let val = dataLength >> (8 * j) & 0xFF;
                    indexView.setInt8(offset+j, val)
                }

                if (typeof params[i] == 'string' ) {
                    let encode = new TextEncoder();
                    let value = encode.encode(params[i]).buffer;
                    data.push(value);
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];
                } else if (params[i] instanceof ArrayBuffer) {
                    let value:ArrayBuffer = params[i] 
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];;
                    data.push(value);
                } else {
                    throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "getColumString params is invalid! param_type:=" + typeof params[i])
                }  
                
            }else{
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    indexView.setInt8(offset+j, 0xFF)
                }
                
            }
        }
        
        this._dataTotalLen += indexBuffer.byteLength + dataLength;
        return [dataLength, this.getStringColumnArrayBuffer(data, indexView.buffer, dataLength)];
    }

    private getStringColumnArrayBuffer(data:ArrayBuffer[], indexBuffer: ArrayBuffer, dataLength:number):ArrayBuffer {
        
        let paramsBuffer = new ArrayBuffer(indexBuffer.byteLength + dataLength)
        const paramsUint8 = new Uint8Array(paramsBuffer);
        const indexView = new Uint8Array(indexBuffer);
        paramsUint8.set(indexView, 0);
        const paramsView = new DataView(paramsBuffer, indexBuffer.byteLength);
        
        let offset = 0;
        for (let i = 0; i < data.length;  i++) {
            paramsView.setInt16(offset, data[i].byteLength, true)
            const dataView = new DataView(data[i]);
            for (let j = 0; j < data[i].byteLength; j++) {
                paramsView.setUint8(j + 2, dataView.getUint8(j))
            }
            offset += data[i].byteLength + 2;
        }
        
        return paramsBuffer
    }

    private getNcharColumn(params:any[]):[number, ArrayBuffer] {
        let data:ArrayBuffer[] = []
        let dataLength = 0;
        let indexBuffer = new ArrayBuffer(TDengineTypeLength['INT'] * params.length)
        let indexView = new DataView(indexBuffer)
        this._rows = params.length;
        for (let i = 0; i <  params.length; i++) {
            let offset = TDengineTypeLength['INT'] * i;
            if (params[i]) {
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    let val = dataLength >> (8 * j) & 0xFF;
                    indexView.setInt8(offset+j, val)
                }

                if (typeof params[i] == 'string' ) {
                    let codes:number[] = [];
                    let strNcharParams:string = params[i];
                    for (let j = 0; j < params[i].length; j++) { 
                        codes.push(strNcharParams.charCodeAt(j));
                    }

                    let ncharBuffer:ArrayBuffer = new ArrayBuffer(codes.length * 4);
                    let ncharView = new DataView(ncharBuffer);
                    for (let j = 0; j  < codes.length; j++) {
                        ncharView.setUint32(j*4, codes[j]);
                    }
                    data.push(ncharBuffer);
                    dataLength += codes.length * 4 + TDengineTypeLength['SMALLINT'];

                } else if (params[i] instanceof ArrayBuffer) {
                    let value:ArrayBuffer = params[i] 
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];;
                    data.push(value);
                } else {
                    throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "getColumString params is invalid! param_type:=" + typeof params[i])
                }  
                
            }else{
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    indexView.setInt8(offset+j, 0xFF)
                }
                
            }
        }
        this._dataTotalLen += indexBuffer.byteLength + dataLength;
        return [dataLength, this.getStringColumnArrayBuffer(data, indexView.buffer, dataLength)];
    }


    private countBigintDigits(numeral: bigint): number {  
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

    // private isFloat(numeral: number): boolean {  
    //     return numeral % 1 !== 0;  
    // }
    

}


