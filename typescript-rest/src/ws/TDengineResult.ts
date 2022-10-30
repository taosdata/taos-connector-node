import { WSFetchBlockResponse, WSFetchResponse, WSQueryResponse } from "./wsQueryResponse";
import { ColumnsBlockType, TDengineTypeCode } from './constant'
import { TaosResultError, WebSocketQueryInterFaceError } from "./wsError";

export class TaosResult {
    meta: Array<TDengineMeta> | undefined
    data: Array<Array<any>> | null;
    precision: number = 0;
    affectRows: number = 0;
    timing: number = 0;
    constructor(queryResponse: WSQueryResponse) {
        if (queryResponse.is_update == true) {
            this.meta = undefined;
            this.data = null;
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
                this.meta = _meta;
            } else {
                throw new TaosResultError(`fields_count,fields_names,fields_types,fields_lengths of the update query response should be null`)
            }
            this.data = [];
        }

        this.precision = queryResponse.precision;
        this.timing += queryResponse.timing;
    }
    setRows(fetchResponse: WSFetchResponse) {
        this.affectRows += fetchResponse.rows;
        this.timing += fetchResponse.timing;
    }
    setData(fetchBlockResponse: WSFetchBlockResponse) {
        if (this.data) {
            this.data.push([])
        } else {
            throw new TaosResultError(`update query response cannot set data`)
        }

    }

}

interface TDengineMeta {
    name: string,
    type: number,
    length: number,
}

export function parseBlock(fetchResponse: WSFetchResponse, blocks: WSFetchBlockResponse, taosResult: TaosResult): TaosResult {
   
    if (taosResult.meta && taosResult.data) {
        let metaList = taosResult.meta;
        const INT_32_SIZE = 4;

        let bufferOffset = (4 * 5) + 8 + (4 + 1) * metaList.length;
        let colLengthBlockSize = INT_32_SIZE * metaList.length;
        console.log("===colLengthBlockSize:"+colLengthBlockSize)

        let bitMapSize = (fetchResponse.rows + (1 << 3) - 1) >> 3

        // whole raw block ArrayBuffer
        let dataBuffer = blocks.data.slice(bufferOffset);

        // record the head of column in block
        let colBlockHead = 0;
        for (let i = 0; i < fetchResponse.rows; i++) {
            let row = [];
            // point to the head of the column in the block
            colBlockHead = 0 + colLengthBlockSize;
            // point to the head of columns's data in the block (include bitMap and offsetArray)
            let colDataHead = colBlockHead;
            // traverse row after row. 
            for (let j = 0; j < metaList.length; j++) {

                let isVarType = _isVarTye(metaList[j])
                console.log("===================================>> ")
                console.log("== dataBuffer Length:"+dataBuffer.byteLength)
                console.log("== loop i:"+i +"J="+j + "col:"+metaList[j].name + "type:"+metaList[j].type)
                console.log("== loop isVarType:"+isVarType);
                if (isVarType == ColumnsBlockType.SOLID) {

                    colDataHead = colBlockHead + bitMapSize + metaList[j].length * i

                    let byteArrayIndex = i >> 3;
                    let bitwiseOffset = 7 - (i & 7)
                    let bitMapArr = dataBuffer.slice(colBlockHead, colBlockHead+bitMapSize);
                    console.log("==i:"+i +"byteArrayIndex="+byteArrayIndex)
                    console.log("== loop colblockhead:"+colBlockHead)
                    console.log("== loop bitmap:"+bitMapSize)
                    console.log("== loop bitMap length="+bitMapArr.byteLength)
                    console.log("==loop bitMap bitwiseoffset:"+bitwiseOffset+"byteArrayIndex:"+byteArrayIndex)
                    let bitFlag = ((new DataView(bitMapArr).getUint8(byteArrayIndex)) & (1 << bitwiseOffset)) >> bitwiseOffset

                    if (bitFlag == 1) {
                        row.push("NULL")
                    } else {
                        row.push(readSolidData(dataBuffer, colDataHead, metaList[j]))
                    }
                    console.log("=====(new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0))="+(new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0,true)));
                    colBlockHead = colBlockHead + bitMapSize + (new DataView(dataBuffer, INT_32_SIZE * j, INT_32_SIZE).getInt32(0,true))

                } else {
                    // if null check
                    let varOffset = new DataView(dataBuffer, colBlockHead+(INT_32_SIZE * i), INT_32_SIZE).getInt32(0,true);
                    console.log("== var type offset:"+varOffset )
                    if (varOffset == -1) {
                        row.push("NULL")
                        colBlockHead = colBlockHead + INT_32_SIZE * fetchResponse.rows + (new DataView(dataBuffer, j * INT_32_SIZE, INT_32_SIZE).getInt32(0,true))
                    } else {
                        colDataHead = colBlockHead + INT_32_SIZE * fetchResponse.rows + varOffset
                        let dataLength = (new DataView(dataBuffer, colDataHead, 2).getInt16(0,true));
                        if (isVarType == ColumnsBlockType.VARCHAR) {

                            row.push(readVarchar(dataBuffer, colDataHead + 2, dataLength));

                        } else {
                            row.push(readNchar(dataBuffer, colDataHead + 2, dataLength))
                        }
                        colBlockHead = colBlockHead + INT_32_SIZE * fetchResponse.rows + (new DataView(dataBuffer, j * INT_32_SIZE, INT_32_SIZE).getInt32(0,true))
                    }
                }
                console.log("<<=================================== ")
            }
            taosResult.data.push(row);
        }
        return taosResult;
    }else{
        throw new TaosResultError("cannot fetch block for an update query.")
    }

}

function _isVarTye(meta: TDengineMeta): Number {
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
        default: {
            return ColumnsBlockType['SOLID']
        }
    }
}

function readSolidData(dataBuffer: ArrayBuffer, colDataHead: number, meta: TDengineMeta): Number | Boolean | BigInt {

    switch (meta.type) {
        case TDengineTypeCode['BOOLEAN']: {
            return (Boolean)(new DataView(dataBuffer, colDataHead, 1).getInt8(0))
        }
        case TDengineTypeCode['TINY INT']: { 
            return (new DataView(dataBuffer, colDataHead, 1).getInt8(0))
        }
        case TDengineTypeCode['SMALL INT']: {
            console.log((new DataView(dataBuffer, colDataHead, 2)))
            return (new DataView(dataBuffer, colDataHead, 2).getInt16(0,true))
        }
        case TDengineTypeCode['INT']: {
            return (new DataView(dataBuffer, colDataHead, 4).getInt32(0,true))
        }
        case TDengineTypeCode['BIGINT']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigInt64(0,true))
        }
        case TDengineTypeCode['TINYINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 1).getUint8(0))
        }
        case TDengineTypeCode['SMALLINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 2).getUint16(0,true))
        }
        case TDengineTypeCode['INT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 4).getUint32(0,true))
        }
        case TDengineTypeCode['BIGINT UNSIGNED']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigUint64(0,true))
        }
        case TDengineTypeCode['FLOAT']: {
            return (new DataView(dataBuffer, colDataHead, 4).getFloat32(0,true))
        }
        case TDengineTypeCode['DOUBLE']: {
            return (new DataView(dataBuffer, colDataHead, 8).getFloat64(0,true))
        }
        case TDengineTypeCode['TIMESTAMP']: {
            return (new DataView(dataBuffer, colDataHead, 8).getBigInt64(0,true))
            // could change 
        }
        default: {
            throw new WebSocketQueryInterFaceError(`unspported type ${meta.type} for column ${meta.name}`)
        }
    }
}


function readVarchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number): string {
    let data = "";
    data += new TextDecoder().decode(dataBuffer.slice(colDataHead, colDataHead + length),{stream:true})
    return data;
}

function readNchar(dataBuffer: ArrayBuffer, colDataHead: number, length: number): string {
    let decoder = new TextDecoder();
    let data = "";
    for (let i = 0; i < length;) {
        data += decoder.decode(dataBuffer.slice(colDataHead + (i * 4), colDataHead + 4 + (i * 4)),{stream:true})
        i = i + 4
    }
    return data;
}
