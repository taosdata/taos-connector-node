import { PrecisionLength, TDengineTypeCode, TDengineTypeLength } from "../common/constant";
import { ErrorCode, TaosError } from "../common/wsError";
import { CharOffset, BMSetNull, BitmapLen} from "../common/taosResult"
import { IsEmpty } from "../common/utils";

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
        let arrayBuffer = this.encodeColumnNumbers(params, "boolean", TDengineTypeLength['BOOL'], TDengineTypeCode['BOOL'])
        
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['BOOL'], TDengineTypeLength['BOOL'])) ;
    }

    SetTinyIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetTinyIntColumn params is invalid!");
        }
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['TINYINT'], TDengineTypeCode['TINYINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['TINYINT'], TDengineTypeLength['TINYINT']));
    }

    SetUTinyIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUTinyIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['TINYINT UNSIGNED'], TDengineTypeCode['TINYINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['TINYINT UNSIGNED'], TDengineTypeLength['TINYINT UNSIGNED']));
    }

    SetSmallIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['SMALLINT'], TDengineTypeCode['SMALLINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['SMALLINT'], TDengineTypeLength['SMALLINT']));

    }

    SetUSmallIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetSmallIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['SMALLINT UNSIGNED'], TDengineTypeCode['SMALLINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['SMALLINT UNSIGNED'], TDengineTypeLength['SMALLINT UNSIGNED']));
    }

    SetIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['INT'], TDengineTypeCode['INT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT'], TDengineTypeLength['INT']));
    }

    SetUIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['INT UNSIGNED'], TDengineTypeCode['INT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT UNSIGNED'], TDengineTypeLength['INT UNSIGNED']));
    }

    SetBigIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBigIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "bigint", TDengineTypeLength['BIGINT'], TDengineTypeCode['BIGINT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['INT'], TDengineTypeLength['BIGINT']));
    }

    SetUBigIntColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetUBigIntColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "bigint", TDengineTypeLength['BIGINT UNSIGNED'], TDengineTypeCode['BIGINT UNSIGNED'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['BIGINT UNSIGNED'], TDengineTypeLength['BIGINT UNSIGNED'])); 
    }

    SetFloatColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetFloatColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['FLOAT'], TDengineTypeCode['FLOAT'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['FLOAT'], TDengineTypeLength['FLOAT'])); 
    }

    SetDoubleColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetDoubleColumn params is invalid!");
        }      
        let arrayBuffer = this.encodeColumnNumbers(params, "number", TDengineTypeLength['DOUBLE'], TDengineTypeCode['DOUBLE'])
        this._params.push(new ColumnInfo(arrayBuffer, TDengineTypeCode['DOUBLE'], TDengineTypeLength['DOUBLE'])); 
    }

    SetVarcharColumn(params :any[]) {
        let data = this.encodeVarLengthColumn(params)
        this._params.push(new ColumnInfo(data, TDengineTypeCode['VARCHAR'], 0));
    }

    SetBinaryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), TDengineTypeCode['BINARY'], 0));
    }

    SetNcharColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.encodeNcharColumn(params), TDengineTypeCode['NCHAR'], 0));
    }

    SetJsonColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), TDengineTypeCode['JSON'], 0));
    }

    SetVarBinaryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), TDengineTypeCode['VARBINARY'], 0));
    }

    SetGeometryColumn(params :any[]) {
        this._params.push(new ColumnInfo(this.encodeVarLengthColumn(params), TDengineTypeCode['GEOMETRY'], 0));
    }

    SetTimestampColumn(params :any[]) {
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid!");
        } 
        
        //computing bitmap length
        let bitMapLen:number = BitmapLen(params.length)
        //Computing the length of data
        let arrayBuffer = new ArrayBuffer(bitMapLen + TDengineTypeLength['TIMESTAMP'] * params.length);
        //bitmap get data range
        let bitmapBuffer = new DataView(arrayBuffer)
        //skip bitmap get data range 
        let dataBuffer = new DataView(arrayBuffer, bitMapLen)
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "wrong row length!")
            }
        }else {
            this._rows = params.length;
        }
        
        for (let i = 0; i < params.length; i++) {
            if (!IsEmpty(params[i])) {
                if (params[i] instanceof Date) {
                    let date:Date = params[i]
                    //node only support milliseconds, need fill 0
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
                    //statistical bits of digit
                    let ndigit = this.countBigintDigits(data)
                    //check digit same table Precision 
                    if (this.precisionLength == PrecisionLength['ns']) {
                        if (this.precisionLength <= ndigit) {
                            dataBuffer.setBigInt64(i * 8, data, true);
                        } else {
                            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params precisionLength is invalid! param:=" + params[i])
                        }          
                    } else if (this.precisionLength == ndigit) {
                        dataBuffer.setBigInt64(i * 8, data, true);
                    } else {
                        throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SeTimestampColumn params is invalid! param:=" + params[i])
                    }        
                }
            }else{
                //set bitmap bit is null
                let charOffset = CharOffset(i);
                let nullVal = BMSetNull(dataBuffer.getInt8(charOffset), i);
                bitmapBuffer.setInt8(charOffset, nullVal);                    
            }
        }

        this._dataTotalLen += arrayBuffer.byteLength; 
        this._params.push(new ColumnInfo([TDengineTypeLength['TIMESTAMP'] * params.length, arrayBuffer], TDengineTypeCode['TIMESTAMP'], TDengineTypeLength['TIMESTAMP']));  
    }


    private encodeColumnNumbers(params:any[], dataType:string = 'number', typeLen:number, columnType:number):[number, ArrayBuffer] {
        let bitMapLen:number = BitmapLen(params.length)
        let arrayBuffer = new ArrayBuffer(typeLen * params.length + bitMapLen);
        let bitmapBuffer = new DataView(arrayBuffer)
        let dataBuffer = new DataView(arrayBuffer, bitMapLen)
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "wrong row length!")
            }
        }else {
            this._rows = params.length;
        }

        for (let i = 0; i < params.length; i++) {
            if (!IsEmpty(params[i])) {
                // console.log("ddddd=>", bitMapLen, typeLen * params.length, columnType, params[i])
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
                //set bitmap bit is null
                let charOffset = CharOffset(i);
                let nullVal = BMSetNull(bitmapBuffer.getUint8(charOffset), i);
                bitmapBuffer.setInt8(charOffset, nullVal);                  
            }
        }
        this._dataTotalLen += dataBuffer.buffer.byteLength;
        return [typeLen * params.length, dataBuffer.buffer];
    }

    private encodeVarLengthColumn(params:any[]):[number, ArrayBuffer] {
        let data:ArrayBuffer[] = []
        let dataLength = 0;
        //create params length buffer
        let paramsLenBuffer = new ArrayBuffer(TDengineTypeLength['INT'] * params.length)
        let paramsLenView = new DataView(paramsLenBuffer)
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "wrong row length!")
            }
        }else {
            this._rows = params.length;
        }
        for (let i = 0; i <  params.length; i++) {
            //get param length offset 4byte
            let offset = TDengineTypeLength['INT'] * i;
            if (!IsEmpty(params[i])) {
                //save param length offset 4byte
                paramsLenView.setInt32(offset, dataLength, true);
                if (typeof params[i] == 'string' ) {
                    //string TextEncoder
                    let encode = new TextEncoder();
                    let value = encode.encode(params[i]).buffer;
                    data.push(value);
                    //add offset length
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];
                } else if (params[i] instanceof ArrayBuffer) {
                    //input arraybuffer, save not need encode
                    let value:ArrayBuffer = params[i];
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];
                    data.push(value);
                } else {
                    throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, 
                        "getColumString params is invalid! param_type:=" + typeof params[i]);
                }  
                
            }else{
                //set length -1, param is null
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    paramsLenView.setInt8(offset+j, 255);
                }
                
            }
        }
        
        this._dataTotalLen += paramsLenBuffer.byteLength + dataLength;
        return [dataLength, this.getBinaryColumnArrayBuffer(data, paramsLenView.buffer, dataLength)];
    }
    //splicing encode params to arraybuffer
    private getBinaryColumnArrayBuffer(data:ArrayBuffer[], paramsLenBuffer: ArrayBuffer, dataLength:number):ArrayBuffer {
        //creat arraybuffer 
        let paramsBuffer = new ArrayBuffer(paramsLenBuffer.byteLength + dataLength)
        //get length data range
        const paramsUint8 = new Uint8Array(paramsBuffer);
        const paramsLenView = new Uint8Array(paramsLenBuffer);
        paramsUint8.set(paramsLenView, 0);
        //get data range
        const paramsView = new DataView(paramsBuffer, paramsLenBuffer.byteLength);
        
        let offset = 0;
        for (let i = 0; i < data.length;  i++) {
            //save param field length
            paramsView.setInt16(offset, data[i].byteLength, true)
            const dataView = new DataView(data[i]);
            //save data
            for (let j = 0; j < data[i].byteLength; j++) {
                paramsView.setUint8(offset + 2 + j, dataView.getUint8(j))
            }
            offset += data[i].byteLength + 2;
        }
        
        return paramsBuffer
    }
    //encode nchar type params
    private encodeNcharColumn(params:any[]):[number, ArrayBuffer] {
        let data:ArrayBuffer[] = []
        let dataLength = 0;
        let indexBuffer = new ArrayBuffer(TDengineTypeLength['INT'] * params.length)
        let indexView = new DataView(indexBuffer)
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "wrong row length!")
            }
        }else {
            this._rows = params.length;
        }
        
        for (let i = 0; i <  params.length; i++) {
            let offset = TDengineTypeLength['INT'] * i;
            if (!IsEmpty(params[i])) {
                indexView.setInt32(offset, dataLength, true);
                if (typeof params[i] == 'string' ) {
                    let codes:number[] = [];
                    let strNcharParams:string = params[i];
                    for (let j = 0; j < params[i].length; j++) { 
                        //get char, cn char neet 3~4 byte
                        codes.push(strNcharParams.charCodeAt(j));
                    }

                    let ncharBuffer:ArrayBuffer = new ArrayBuffer(codes.length * 4);
                    let ncharView = new DataView(ncharBuffer);
                    for (let j = 0; j  < codes.length; j++) {
                        //1char, save into uint32
                        ncharView.setUint32(j*4, codes[j], true);
                    }
                    data.push(ncharBuffer);
                    dataLength += codes.length * 4 + TDengineTypeLength['SMALLINT'];

                } else if (params[i] instanceof ArrayBuffer) {
                    let value:ArrayBuffer = params[i] 
                    dataLength += value.byteLength + TDengineTypeLength['SMALLINT'];
                    data.push(value);
                } else {
                    throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "getColumString params is invalid! param_type:=" + typeof params[i])
                }  
                
            }else{
                //set length -1, param is null
                for (let j = 0; j < TDengineTypeLength['INT']; j++) {
                    indexView.setInt8(offset+j, 255)
                }
                
            }
        }
        
        this._dataTotalLen += indexBuffer.byteLength + dataLength;
        return [dataLength, this.getBinaryColumnArrayBuffer(data, indexView.buffer, dataLength)];
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

}


