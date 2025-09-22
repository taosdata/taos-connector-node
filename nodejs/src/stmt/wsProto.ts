import exp from "constants";
import { WSQueryResponse } from "../client/wsResponse";
import { TDengineTypeCode, TDengineTypeLength } from "../common/constant";
import { MessageResp } from "../common/taosResult";
import { StmtBindParams } from "./wsParamsBase";
import { bigintToBytes, intToBytes, shortToBytes } from "../common/utils";
import { ColumnInfo } from "./wsColumnInfo";
import { ErrorCode, TaosResultError } from "../common/wsError";
import { TableInfo } from "./wsTableInfo";
export interface StmtMessageInfo {
    action: string;
    args: StmtParamsInfo;
}

interface StmtParamsInfo {
    req_id: number;
    sql?: string | undefined | null;
    stmt_id?: bigint | undefined | null;
    name?: string | undefined | null;
    tags?: Array<any> | undefined | null;
    paramArray?: Array<Array<any>> | undefined | null;
}


export interface StmtFieldInfo {
    name: string | undefined | null;
    field_type: number | undefined | null;
    precision: number | undefined | null;
    scale: number | undefined | null;
    bytes: number | undefined | null;
    bind_type: number | undefined | null;
}

export class WsStmtQueryResponse extends WSQueryResponse {
    affected:number | undefined | null;
    stmt_id?: bigint | undefined | null;
    is_insert?: boolean | undefined | null;
    fields?: Array<StmtFieldInfo> | undefined | null;
    constructor(resp:MessageResp) {
        super(resp);
        this.stmt_id = BigInt(resp.msg.stmt_id)
        this.affected = resp.msg.affected
        this.is_insert = resp.msg.is_insert;
        this.fields = resp.msg.fields;
    }
}

export const enum StmtBindType {
    STMT_TYPE_TAG=1,
    STMT_TYPE_BIND=2,
}


export function binaryBlockEncode(bindParams :StmtBindParams, bindType:StmtBindType, stmtId:bigint, reqId:bigint, row:number): ArrayBuffer {
    //Computing the length of data
    let columns = bindParams.getParams().length;
    let length = TDengineTypeLength[TDengineTypeCode.BIGINT] * 4;
    length += TDengineTypeLength[TDengineTypeCode.INT] * 5;
    length += columns * 5 + columns * 4;
    length += bindParams.getDataTotalLen();

    let arrayBuffer = new ArrayBuffer(length);
    let arrayView = new DataView(arrayBuffer)

    arrayView.setBigUint64(0, reqId, true);
    arrayView.setBigUint64(8, stmtId, true);
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
    let columnsData = bindParams.getParams()
    for (let i = 0; i< columnsData.length; i++) {
        //set column data type
        typeView.setUint8(headOffset, columnsData[i].type)
        //set column type length
        typeView.setUint32(headOffset+1, columnsData[i].typeLen, true)
        //set column data length
        lenView.setUint32(i * 4, columnsData[i].length, true)
        if (columnsData[i].data) {
            //get encode column data
            const sourceView = new Uint8Array(columnsData[i].data);
            const destView = new Uint8Array(arrayBuffer, dataOffset, columnsData[i].data.byteLength);
            //splicing data
            destView.set(sourceView);
            dataOffset += columnsData[i].data.byteLength;
        }
        headOffset += 5
    }

    return arrayBuffer;

}

export function stmt2BinaryBlockEncode(reqId: bigint, 
    stmtTableInfoList: TableInfo[], 
    stmtTableInfo: Map<string, TableInfo>, 
    stmt_id: bigint | undefined | null, 
    toBeBindTableNameIndex:number | undefined | null, 
    toBeBindTagCount:number, 
    toBeBindColCount:number ):number[] {
        if(stmt_id == null || stmt_id == undefined) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "stmt_id is invalid");
        }
        // cloc total size
        let totalTableNameSize  = 0;
        let tableNameSizeList:Array<number> = [];
        if (toBeBindTableNameIndex != null && toBeBindTableNameIndex != undefined) {
            stmtTableInfo.forEach((tableInfo) => {
                let tableName = tableInfo.getTableName();
                if (tableName) {
                    let size = new TextEncoder().encode(tableName).length;
                    totalTableNameSize += size + 1;
                    tableNameSizeList.push(size + 1);
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
            });
        }
        let totalTagSize = 0;
        let tagSizeList:Array<number> = [];
        if (toBeBindTagCount > 0) {
            stmtTableInfoList.forEach((tableInfo) => {
                let params = tableInfo.getTags();
                if (params) {
                    params.encode();
                    let tagSize = params.getDataTotalLen();
                    totalTagSize += tagSize;
                    tagSizeList.push(tagSize);
                }
            });
        }
        
        let totalColSize = 0;
        let colSizeList:Array<number> = [];
        if (toBeBindColCount > 0) {
            stmtTableInfoList.forEach((tableInfo) => {
                let params = tableInfo.getParams();
                if (!params) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
                }

                params.encode();
                let colSize = params.getDataTotalLen();
                totalColSize += colSize;
                colSizeList.push(colSize);
                
            });
        }
        let totalSize = totalTableNameSize + totalTagSize + totalColSize;
        let toBeBindTableNameCount = (toBeBindTableNameIndex != null && toBeBindTableNameIndex >= 0) ? 1 : 0;
        totalSize += stmtTableInfoList.length * (
                toBeBindTableNameCount * 2
                + (toBeBindTagCount > 0 ? 1 : 0) * 4
                + (toBeBindColCount > 0 ? 1 : 0) * 4);

        const bytes: number[] = [];
        // write req_id
        bytes.push(...bigintToBytes(reqId));
        
        // write stmt_id
        if (stmt_id) {
            bytes.push(...bigintToBytes(stmt_id));
        }
        bytes.push(...bigintToBytes(9n));
        bytes.push(...shortToBytes(1));
        bytes.push(...intToBytes(-1));
        bytes.push(...intToBytes(totalSize + 28, false));
   
        bytes.push(...intToBytes(stmtTableInfoList.length));
        bytes.push(...intToBytes(toBeBindTagCount));
        bytes.push(...intToBytes(toBeBindColCount));
        if (toBeBindTableNameCount > 0) {
            bytes.push(...intToBytes(0x1C));
        } else {
            bytes.push(...intToBytes(0));
        }
        
        if (toBeBindTagCount) {
            if (toBeBindTableNameCount > 0) {
                bytes.push(...intToBytes(28 + totalTableNameSize + 2 * stmtTableInfoList.length));
            } else {
                bytes.push(...intToBytes(28));
            }
        } else {
            bytes.push(...intToBytes(0));
        }
            
        if (toBeBindColCount > 0) {
            let skipSize = 0;
            if (toBeBindTableNameCount > 0) {
                skipSize += totalTableNameSize + 2 * stmtTableInfoList.length;
            }

            if (toBeBindTagCount > 0) {
                skipSize += totalTagSize + 4 * stmtTableInfoList.length;
            }

            // colOffset = 28(固定头) + skipSize
            bytes.push(...intToBytes(28 + skipSize));
        } else {
            bytes.push(...intToBytes(0));
        }


        if (toBeBindTableNameCount > 0) {
            for (let size of tableNameSizeList) {
                if (size === 0) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
                bytes.push(...shortToBytes(size));
            }

            for (let tableInfo of stmtTableInfoList) {
                let tableName = tableInfo.getTableName();
                if (tableName && tableName.length > 0) {
                    let encoder = new TextEncoder().encode(tableName);
                    bytes.push(...encoder);
                    bytes.push(0); // null terminator
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
                }
            }
        }

        if (toBeBindTagCount > 0) {
            for (let size of tagSizeList) {
                bytes.push(...intToBytes(size));
            }
            for (let tableInfo of stmtTableInfoList) {
                let tags = tableInfo.getTags();
                if (tags && tags.getParams().length > 0) {
                    for (let tagColumnInfo of tags.getParams()) {
                        serializeColumn(tagColumnInfo, bytes);
                    }
                } else {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Tags are empty");
                }
            }
        }

        // ColumnDataLength
        if (toBeBindColCount > 0) {
            for (let colSize of colSizeList) {
                bytes.push(...intToBytes(colSize, false));
            }
            for (let tableInfo of stmtTableInfoList) {
                let params = tableInfo.getParams();
                if (!params) {
                    throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
                }
                
                let colColumnInfos:ColumnInfo[] = params.getParams()
                colColumnInfos.forEach(colColumnInfo => {
                    serializeColumn(colColumnInfo, bytes);
                });   
            }
        }
        return bytes

    }

    function serializeColumn(column: ColumnInfo, bytes: number[]) {
        bytes.push(...intToBytes(column.length, false));
        bytes.push(...intToBytes(column.type));
        bytes.push(...intToBytes(column._rows));
        bytes.push(...column.isNull ? column.isNull : []);
        bytes.push(column._haveLength);
        
       if (column._haveLength == 1 && column._dataLengths) {
            column._dataLengths.forEach(length => {
               bytes.push(...intToBytes(length));
           });
        }
        bytes.push(...intToBytes(column.data.byteLength, false));
        bytes.push(...column.data.byteLength ? new Uint8Array(column.data) : []);
    }

