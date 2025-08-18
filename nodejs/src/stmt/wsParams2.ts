import { ColumnsBlockType, PrecisionLength, TDengineTypeCode, TDengineTypeLength } from "../common/constant";
import { ErrorCode, TaosError } from "../common/wsError";
import { getCharOffset, setBitmapNull, bitmapLen, _isVarType} from "../common/taosResult"
import { isEmpty } from "../common/utils";
import { StmtFieldInfo } from "./wsProto";
import { ColumnInfo } from "./wsColumnInfo";
import { IDataEncoder, StmtBindParams } from "./wsParamsBase";
import { timeStamp } from "console";


export class Stmt2BindParams extends StmtBindParams implements IDataEncoder  {
    constructor(precision?:number) {
        super(precision);
    }

    encode(params: any[], dataType: string, typeLen: number, columnType: number): ColumnInfo{
        if (!params || params.length == 0) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "StmtBindParams params is invalid!");
        }
        
        if (this._rows > 0) {
            if (this._rows !== params.length) {
                throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "wrong row length!")
            }
        }else {
            this._rows = params.length;
        }

        let isVarType = _isVarType(columnType)
        if (isVarType == ColumnsBlockType.SOLID) {
            if (dataType === "TIMESTAMP") {
                return this.encodeTimestampColumn(params, typeLen, columnType);
            }
            return this.encodeDigitColumns(params, dataType, typeLen, columnType);
        } 

        return this.encodeVarColumns(params, dataType, typeLen, columnType);

    }

    private encodeVarColumns(params:any[], dataType:string = 'number', typeLen:number, columnType:number):ColumnInfo {
        let isNull: number[] = []; 
        let dataLengths: number[] = [];
        // TotalLength(4) + Type (4) + Num(4) + IsNull(1) * size + haveLength(1) + BufferLength(4) + 4 * v.length + totalLength
        // 17 + (5 * params.length) + totalLength;
        const bytes: number[] = [];
        for (let i = 0; i <  params.length; i++) {
            if (!isEmpty(params[i])) {
                isNull.push(0);
                if (typeof params[i] == 'string' ) {
                    let encoder = new TextEncoder().encode(params[i]);
                    let length = encoder.length;
                    dataLengths.push(length);
                    bytes.push(...encoder);
                }
            } else {
                isNull.push(1);
            }
        }
               
    }

    private encodeDigitColumns(params:any[], dataType:string = 'number', typeLen:number, columnType:number):ColumnInfo {
        let isNull: number[] = [];
        let dataLength = 17 + (typeLen + 1) * params.length;
        let arrayBuffer = new ArrayBuffer(typeLen * params.length);
        let dataBuffer = new DataView(arrayBuffer);
        // TotalLength(4) + Type (4) + Num(4) + IsNull(1) * size + haveLength(1) + BufferLength(4) + size * dataLen    
        for (let i = 0; i < params.length; i++) {
            if (!isEmpty(params[i])) {
                isNull.push(0);
                this.writeDataToBuffer(dataBuffer, params[i], dataType, typeLen,columnType, i);  
            } else {
                isNull.push(1);
                if (dataType === 'bigint') {
                    this.writeDataToBuffer(dataBuffer, BigInt(0), dataType, typeLen,columnType, i);
                }else {
                    this.writeDataToBuffer(dataBuffer, 0, dataType, typeLen,columnType, i);
                }
            }
        }
        
        this._dataTotalLen += dataLength;
        return new ColumnInfo([dataLength, dataBuffer.buffer], columnType, typeLen, this._rows, isNull);
    }


    private encodeTimestampColumn(params:any[], typeLen:number, columnType:number):ColumnInfo {
        let timeStamps = [];
        for (let i = 0; i < params.length; i++) {
            if (!isEmpty(params[i])) {
                let timeStamp:bigint = BigInt(0);
                if (params[i] instanceof Date) {
                    let date:Date = params[i]
                    //node only support milliseconds, need fill 0
                    
                    if (this.precisionLength == PrecisionLength['us']) {
                        timeStamp =  BigInt(date.getMilliseconds() * 1000);
                    }else if (this.precisionLength == PrecisionLength['ns']) {
                        timeStamp =  BigInt(date.getMilliseconds() * 1000 * 1000);
                    }else {
                        timeStamp =  BigInt(date.getMilliseconds());
                    }
                    
                } else if (typeof params[i] == 'bigint' || typeof params[i] == 'number') {
                    if (typeof params[i] == 'number') {
                        timeStamp = BigInt(params[i])
                    }else {
                        timeStamp = params[i]
                    }
                }
                timeStamps.push(timeStamp);
            }else{
                //set bitmap bit is null
                timeStamps.push(null);                   
            }
        }
        return this.encodeDigitColumns(timeStamps, 'bigint', typeLen, columnType);
    }
}


