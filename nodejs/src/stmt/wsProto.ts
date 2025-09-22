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

function writeColumnToView(column: ColumnInfo, view: DataView, offset: number): number {
    let currentOffset = offset;

    // length, type, _rows
    view.setInt32(currentOffset, column.length, true);
    currentOffset += TDengineTypeLength[TDengineTypeCode.INT];
    view.setInt32(currentOffset, column.type, true);
    currentOffset += TDengineTypeLength[TDengineTypeCode.INT];
    view.setInt32(currentOffset, column._rows, true);
    currentOffset += TDengineTypeLength[TDengineTypeCode.INT];

    // isNull bitmap
    if (column.isNull && column.isNull.length > 0) {
        const isNullBuffer = new Uint8Array(column.isNull);
        new Uint8Array(view.buffer, view.byteOffset + currentOffset).set(isNullBuffer);
        currentOffset += isNullBuffer.length;
    }

    // _haveLength and _dataLengths
    view.setUint8(currentOffset, column._haveLength);
    currentOffset += 1;
    if (column._haveLength === 1 && column._dataLengths) {
        for (const length of column._dataLengths) {
            view.setInt32(currentOffset, length, true);
            currentOffset += TDengineTypeLength[TDengineTypeCode.INT];
        }
    }

    // data
    view.setInt32(currentOffset, column.data.byteLength, true);
    currentOffset += TDengineTypeLength[TDengineTypeCode.INT];
    if (column.data.byteLength > 0) {
        new Uint8Array(view.buffer, view.byteOffset + currentOffset).set(new Uint8Array(column.data));
        currentOffset += column.data.byteLength;
    }

    return currentOffset - offset; // Return the total number of bytes written
}

export function stmt2BinaryBlockEncode(
    reqId: bigint,
    stmtTableInfoList: TableInfo[],
    stmt_id: bigint | undefined | null,
    toBeBindTableNameIndex: number | undefined | null,
    toBeBindTagCount: number,
    toBeBindColCount: number
): ArrayBuffer {
    if (!stmt_id) {
        throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "stmt_id is invalid");
    }

    // --- 1. Single pass to prepare data and calculate the exact size ---
    const hasTableName = toBeBindTableNameIndex != null && toBeBindTableNameIndex >= 0;
    const hasTags = toBeBindTagCount > 0;
    const hasCols = toBeBindColCount > 0;

    let totalDataSize = 0;
    const processedTables = stmtTableInfoList.map(tableInfo => {
        const tableNameBytes = hasTableName ? new TextEncoder().encode(tableInfo.getTableName() || '') : null;
        if (hasTableName && (!tableNameBytes || tableNameBytes.length === 0)) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Table name is empty");
        }

        const tags = hasTags ? tableInfo.getTags() : null;
        if (tags) tags.encode();

        const params = hasCols ? tableInfo.getParams() : null;
        if (params) {
            params.encode();
        } else {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, "Bind params is empty!");
        }

        // Accumulate the size of each part
        const tableNameBlockSize = tableNameBytes ? 2 + tableNameBytes.length + 1 : 0; // 2(len) + data + 1(\0)
        const tagsBlockSize = tags ? tags.getDataTotalLen() : 0;
        const colsBlockSize = params ? params.getDataTotalLen() : 0;
        
        totalDataSize += tableNameBlockSize + tagsBlockSize + colsBlockSize;
        if(hasTags){
            totalDataSize += TDengineTypeLength[TDengineTypeCode.INT]; // tag block length
        }
        if(hasCols){
            totalDataSize += TDengineTypeLength[TDengineTypeCode.INT]; // col block length
        }

        return { tableNameBytes, tags, params };
    });

    // --- 2. Allocate an ArrayBuffer with the exact size ---
    const HEADER_SIZE = 28; // Fixed header size
    const OFFSETS_SIZE = 12; // 3 offset pointers
    const totalBufferSize = HEADER_SIZE + OFFSETS_SIZE + totalDataSize;
    
    const buffer = new ArrayBuffer(totalBufferSize);
    const view = new DataView(buffer);
    let offset = 0;

    // --- 3. Write the fixed header ---
    view.setBigUint64(offset, reqId, true); offset += TDengineTypeLength[TDengineTypeCode.BIGINT];
    view.setBigUint64(offset, stmt_id, true); offset += TDengineTypeLength[TDengineTypeCode.BIGINT];
    view.setBigUint64(offset, 9n, true); offset += TDengineTypeLength[TDengineTypeCode.BIGINT]; // action: bind
    view.setUint32(offset, 1, true); offset += TDengineTypeLength[TDengineTypeCode.INT];

    // --- 4. Write the dynamic header and offsets ---
    const tableCount = stmtTableInfoList.length;
    view.setInt32(offset, totalBufferSize, true); offset += TDengineTypeLength[TDengineTypeCode.INT]; // total length
    view.setInt32(offset, tableCount, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
    view.setInt32(offset, toBeBindTagCount, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
    view.setInt32(offset, toBeBindColCount, true); offset += TDengineTypeLength[TDengineTypeCode.INT];

    let currentDataOffset = HEADER_SIZE + OFFSETS_SIZE;
    
    // TableName Offset
    view.setInt32(offset, hasTableName ? currentDataOffset : 0, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
    const tableNameDataStart = currentDataOffset;
    if (hasTableName) {
        currentDataOffset += processedTables.reduce((sum, t) => sum + (t.tableNameBytes ? 2 + t.tableNameBytes.length + 1 : 0), 0);
    }

    // Tags Offset
    view.setInt32(offset, hasTags ? currentDataOffset : 0, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
    const tagsDataStart = currentDataOffset;
    if (hasTags) {
        currentDataOffset += processedTables.reduce((sum, t) => sum + 4 + (t.tags ? t.tags.getDataTotalLen() : 0), 0);
    }

    // Columns Offset
    view.setInt32(offset, hasCols ? currentDataOffset : 0, true); offset += TDengineTypeLength[TDengineTypeCode.INT];

    // --- 5. Write the actual data blocks ---
    // a. Table Names
    if (hasTableName) {
        offset = tableNameDataStart;
        for (const table of processedTables) {
            const len = table.tableNameBytes!.length + 1;
            view.setUint16(offset, len, true); offset += 2;
            new Uint8Array(buffer, offset).set(table.tableNameBytes!); offset += table.tableNameBytes!.length;
            view.setUint8(offset, 0); offset += 1; // null terminator
        }
    }

    // b. Tags
    if (hasTags) {
        offset = tagsDataStart;
        for (const table of processedTables) {
            const tags = table.tags!;
            const tagDataLen = tags.getDataTotalLen();
            view.setInt32(offset, tagDataLen, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
            for (const col of tags.getParams()) {
                offset += writeColumnToView(col, new DataView(buffer, offset), 0);
            }
        }
    }

    // c. Columns
    if (hasCols) {
        for (const table of processedTables) {
            const params = table.params!;
            const colDataLen = params.getDataTotalLen();
            view.setInt32(offset, colDataLen, true); offset += TDengineTypeLength[TDengineTypeCode.INT];
            for (const col of params.getParams()) {
                offset += writeColumnToView(col, new DataView(buffer, offset), 0);
            }
        }
    }

    return buffer;
}
