import { WSFetchBlockResponse, WSQueryResponse } from "../client/wsResponse";
import { ColumnsBlockType, TDengineTypeCode, TDengineTypeName } from './constant'
import { ErrorCode, TaosResultError, WebSocketQueryInterFaceError } from "./wsError";
import { AppendRune } from "./ut8Helper"

export interface TDengineMeta {
    name: string,
    type: string,
    length: number,
}

interface ResponseMeta {
    name: string,
    type: number,
    length: number,
}

export interface MessageResp {
    totalTime: number,
    msg:any,
}

export class TaosResult {
    private _meta: Array<ResponseMeta> | null;
    private _data: Array<Array<any>> | null;

    private _precision: number | null | undefined;
    protected _affectRows: number | null | undefined;
    private _totalTime = 0;
    /** unit nano seconds */
    private _timing: bigint | null | undefined;
    constructor(queryResponse?: WSQueryResponse) {
        if (queryResponse == null) {
            this._meta = null
            this._data = null
            this._timing = BigInt(0)
            return
        }
        if (queryResponse.is_update == true) {
            this._meta = null
            this._data = null
        } else {
            if (queryResponse.fields_count && queryResponse.fields_names && queryResponse.fields_types && queryResponse.fields_lengths) {
                let _meta = [];
                for (let i = 0; i < queryResponse.fields_count; i++) {
                    _meta.push({
                        name: queryResponse.fields_names[i],
                        type: queryResponse.fields_types[i],
                        length: queryResponse.fields_lengths[i]
                    })
                }
                this._meta = _meta;
            } else {
                throw new TaosResultError(ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, 
                    `fields_count,fields_names,fields_types,fields_lengths of the update query response should be null`)
            }
            this._data = [];
        }

        this._affectRows = queryResponse.affected_rows
        this._timing = queryResponse.timing
        this._precision = queryResponse.precision
        this._totalTime = queryResponse.totalTime
        // console.log(`typeof this.timing:${typeof this.timing}, typeof fetchResponse.timing:${typeof queryResponse.timing}`)
    }

    public SetRowsAndTime(rows: number, timing?:bigint) {
        if (this._affectRows) {
            this._affectRows += rows;
        }else{
            this._affectRows = rows
        }
        if (timing) {
            this.SetTiming(timing)
        }
        
    }
    
    public GetMeta(): Array<TDengineMeta> | null {
        return this.getTDengineMeta();
    }

    public GetData(): Array<Array<any>> | null {
        return this._data;
    }
    public SetData(value: Array<Array<any>> | null) {
        this._data = value;
    }
    public GetAffectRows(): number | null | undefined {
        return this._affectRows;
    }

    public GetTaosMeta(): Array<ResponseMeta> | null {
        return this._meta;
    }

    public GetPrecision():number | null | undefined {
        return this._precision;
    }
    public GetTotalTime() {
        return this._totalTime;
    }
    public  AddtotalTime(totalTime:number) {
        this._totalTime += totalTime;
    }

    public SetTiming(timing?: bigint) {
        if (!this._timing) {
            this._timing = BigInt(0) 
        }

        if (timing) {
            this._timing = this._timing + timing
        }    
    }
    /**
     * Mapping the WebSocket response type code to TDengine's type name. 
     */
    private getTDengineMeta(): Array<TDengineMeta> | null {
        if (this._meta) {
            let tdMeta = new Array<TDengineMeta>()
            this._meta.forEach(m => {
                tdMeta.push({
                    name: m.name,
                    type: TDengineTypeName[m.type],
                    length: m.length
                })
            })
            return tdMeta;
        } 
        return null;  
    }
}

export function parseBlock(rows: number, blocks: WSFetchBlockResponse, taosResult: TaosResult): TaosResult {
    let metaList = taosResult.GetTaosMeta()
    let dataList = taosResult.GetData()
    if (metaList && dataList) {
        // console.log(typeof taosResult.timing)
        // console.log(typeof blocks.timing)
        // console.log(blocks.id)
        taosResult.SetTiming(blocks.timing) 
        const INT_32_SIZE = 4;

        // Offset num of bytes from rawBlockBuffer.
        let bufferOffset = (4 * 5) + 8 + (4 + 1) * metaList.length
        let colLengthBlockSize = INT_32_SIZE * metaList.length
        // console.log("===colLengthBlockSize:" + colLengthBlockSize)

        let bitMapSize = (rows + (1 << 3) - 1) >> 3

        // whole raw block ArrayBuffer
        let dataBuffer = blocks.data.slice(bufferOffset);

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

                let isVarType = _isVarTye(metaList[j])
                // console.log("== dataBuffer Length:" + dataBuffer.byteLength)
                // console.log("== loop i:" + i + "J=" + j + "col:" + metaList[j].name + "type:" + metaList[j].type)
                // console.log("== loop isVarType:" + isVarType);
                if (isVarType == ColumnsBlockType.SOLID) {

                    colDataHead = colBlockHead + bitMapSize + metaList[j].length * i

                    let byteArrayIndex = i >> 3;
                    let bitwiseOffset = 7 - (i & 7)
                    let bitMapArr = dataBuffer.slice(colBlockHead, colBlockHead + bitMapSize)
                    // console.log("==i:" + i + "byteArrayIndex=" + byteArrayIndex)
                    // console.log("== loop colblockhead:" + colBlockHead)
                    // console.log("== loop bitmap:" + bitMapSize)
                    // console.log("== loop bitMap length=" + bitMapArr.byteLength)
                    // console.log("==loop bitMap bitwiseoffset:" + bitwiseOffset + "byteArrayIndex:" + byteArrayIndex)
                    let bitFlag = ((new DataView(bitMapArr).getUint8(byteArrayIndex)) & (1 << bitwiseOffset)) >> bitwiseOffset

                    if (bitFlag == 1) {
                        row.push("NULL")
                    } else {
                        row.push(readSolidData(dataBuffer, colDataHead, metaList[j]))
                    }
                    // console.log("=====(new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0))=" + (new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0, true)));
                    colBlockHead = colBlockHead + bitMapSize + (new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0, true))

                } else {
                    // if null check
                    let varOffset = new DataView(dataBuffer, colBlockHead + (INT_32_SIZE * i), INT_32_SIZE).getInt32(0, true)
                    // console.log("== var type offset:" + varOffset)
                    if (varOffset == -1) {
                        row.push("NULL")
                        colBlockHead = colBlockHead + INT_32_SIZE * rows + (new DataView(dataBuffer, j * INT_32_SIZE, INT_32_SIZE).getInt32(0, true))
                    } else {
                        colDataHead = colBlockHead + INT_32_SIZE * rows + varOffset
                        let dataLength = (new DataView(dataBuffer, colDataHead, 2).getInt16(0, true))
                        // console.log("== loop var type length:" + dataLength, isVarType)
                        if (isVarType == ColumnsBlockType.VARCHAR) {
                            row.push(readVarchar(dataBuffer, colDataHead + 2, dataLength))
                        } else if(isVarType == ColumnsBlockType.GEOMETRY || isVarType == ColumnsBlockType.VARBINARY) {
                            row.push(readBinary(dataBuffer, colDataHead + 2, dataLength))
                        } else {
                            row.push(readNchar(dataBuffer, colDataHead + 2, dataLength))
                        }
                        colBlockHead = colBlockHead + INT_32_SIZE * rows + (new DataView(dataBuffer, j * INT_32_SIZE, INT_32_SIZE).getInt32(0, true))
                    }
                }
            }
            dataList.push(row);
        }
        return taosResult;
    } else {
        throw new TaosResultError(ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA , 
            "cannot fetch block for an update query.")
    }
}

export function _isVarTye(meta: ResponseMeta): Number {
    switch (meta.type) {
        case TDengineTypeCode['NCHAR']: {
            return ColumnsBlockType['NCHAR']
        }
        case TDengineTypeCode['VARCHAR']: {
            return ColumnsBlockType['VARCHAR']
        }
        case TDengineTypeCode['BINARY']: {
            return ColumnsBlockType['VARCHAR']
        }
        case TDengineTypeCode['JSON']: {
            return ColumnsBlockType['VARCHAR']
        }
        case TDengineTypeCode['GEOMETRY']: {
            return ColumnsBlockType['GEOMETRY']
        }
        case TDengineTypeCode['VARBINARY']: {
            return ColumnsBlockType['VARBINARY']
        }
        default: {
            return ColumnsBlockType['SOLID']
        }
    }
}
export function readSolidDataToArray(buffer: ArrayBuffer, colBlockHead:number, 
    rows:number, meta: ResponseMeta, bitMapArr: ArrayBuffer): any[] {

    let dataBuffer = new DataView(buffer)
    let result:any[] = []
    switch (meta.type) {
        case TDengineTypeCode['BOOL']:
        case TDengineTypeCode['TINYINT']:
            case TDengineTypeCode['TINYINT UNSIGNED']:{
            for (let i = 0; i < rows; i++, colBlockHead++) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getInt8(colBlockHead));
                }
                
            }
            break;
        }
        case TDengineTypeCode['SMALLINT']: {
            for (let i = 0; i < rows; i++, colBlockHead+=2) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getInt16(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['INT']: {
            for (let i = 0; i < rows; i++, colBlockHead+=4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getInt32(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['BIGINT']: {
            for (let i = 0; i < rows; i++, colBlockHead+=8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getBigInt64(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['SMALLINT UNSIGNED']: {
            for (let i = 0; i < rows; i++, colBlockHead+=2) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getUint16(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['INT UNSIGNED']: {
            for (let i = 0; i < rows; i++, colBlockHead+=4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getUint32(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['BIGINT UNSIGNED']: {
            for (let i = 0; i < rows; i++, colBlockHead+=8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getBigUint64(colBlockHead, true));
                }
            }
            break;
        }
        case TDengineTypeCode['FLOAT']: {
            for (let i = 0; i < rows; i++, colBlockHead+=4) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(parseFloat(dataBuffer.getFloat32(colBlockHead, true).toFixed(5)));
                }
            }
            break;    
        }
        case TDengineTypeCode['DOUBLE']: {

            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(parseFloat(dataBuffer.getFloat64(colBlockHead, true).toFixed(15)));
                }
            }
            break;            
        }
        case TDengineTypeCode['TIMESTAMP']: {
            for (let i = 0; i < rows; i++, colBlockHead += 8) {
                if (isNull(bitMapArr, i)) {
                    result.push(null);
                }else{
                    result.push(dataBuffer.getBigInt64(colBlockHead, true));
                }
            }
            break;
        }
        default: {
            throw new WebSocketQueryInterFaceError(ErrorCode.ERR_UNSPPORTED_TDENGINE_TYPE, `unspported type ${meta.type} for column ${meta.name}`)
        }
    }
    return result;
   
}
export function readSolidData(dataBuffer: ArrayBuffer, colDataHead: number, meta: ResponseMeta): Number | Boolean | BigInt {

    switch (meta.type) {
        case TDengineTypeCode['BOOL']: {
            return (Boolean)(new DataView(dataBuffer, colDataHead, 1).getInt8(0))
        }
        case TDengineTypeCode['TINYINT']: {
            return (new DataView(dataBuffer, colDataHead, 1).getInt8(0))
        }
        case TDengineTypeCode['SMALLINT']: {
            return (new DataView(dataBuffer, colDataHead, 2).getInt16(0, true))
        }
        case TDengineTypeCode['INT']: {
            return (new DataView(dataBuffer, colDataHead, 4).getInt32(0, true))
        }
        case TDengineTypeCode['BIGINT']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigInt64(0, true))
        }
        case TDengineTypeCode['TINYINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 1).getUint8(0))
        }
        case TDengineTypeCode['SMALLINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 2).getUint16(0, true))
        }
        case TDengineTypeCode['INT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 4).getUint32(0, true))
        }
        case TDengineTypeCode['BIGINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigUint64(0, true))
        }
        case TDengineTypeCode['FLOAT']: {
            return (parseFloat(new DataView(dataBuffer, colDataHead, 4).getFloat32(0, true).toFixed(5)) )
        }
        case TDengineTypeCode['DOUBLE']: {
            return (parseFloat(new DataView(dataBuffer, colDataHead, 8).getFloat64(0, true).toFixed(15)))
        }
        case TDengineTypeCode['TIMESTAMP']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigInt64(0, true))
            // could change 
        }
        default: {
            throw new WebSocketQueryInterFaceError(ErrorCode.ERR_UNSPPORTED_TDENGINE_TYPE, `unspported type ${meta.type} for column ${meta.name}`)
        }
    }
}

export function readBinary(dataBuffer: ArrayBuffer, colDataHead: number, length: number): ArrayBuffer {
    let buff =  dataBuffer.slice(colDataHead, colDataHead + length)
    return buff
}

export function readVarchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number): string {
    let data = "";
    let buff = dataBuffer.slice(colDataHead, colDataHead + length)
    data += new TextDecoder().decode(buff)
    return data;
}

export function readNchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number): string {
    let decoder = new TextDecoder();
    let data = "";
    let buff: ArrayBuffer = dataBuffer.slice(colDataHead, colDataHead + length);
    for (let i = 0; i < length / 4; i++) {
        // console.log("== readNchar data:" + new DataView(buff, i * 4, 4).getUint32(0, true))
        data += AppendRune(new DataView(buff, i * 4, 4).getUint32(0, true))

    }
    return data;
}


function iteratorBuff(arr: ArrayBuffer) {
    let buf = Buffer.from(arr);
    for (const value of buf) {
        console.log(value.toString())
    }

}

function isNull(bitMapArr:ArrayBuffer, n:number) {
    let c = new Uint8Array(bitMapArr);
    let position = n >>> 3;
    let index = n & 0x7;
    return (c[position] & (1 << (7 - index))) == (1 << (7 - index));
}