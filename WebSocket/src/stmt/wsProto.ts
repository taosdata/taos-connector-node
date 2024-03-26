import { WSQueryResponse } from "../client/wsResponse";
import { TDengineTypeLength } from "../common/constant";
import { MessageResp } from "../common/taosResult";
import { ErrorCode, TaosResultError } from "../common/wsError";
import { StmtBindParams } from "./wsParams";

export interface StmtMessageInfo {
    action: string;
    args: StmtParamsInfo;
}

interface StmtParamsInfo {
    req_id: number;
    sql?: string | undefined | null;
    stmt_id?: number | undefined | null;
    name?: string | undefined | null;
    tags?: Array<any> | undefined | null;
    paramArray?: Array<Array<any>> | undefined | null;
}


export class WsStmtQueryResponse extends WSQueryResponse {
    affected:number | undefined | null;
    stmt_id?: number | undefined | null;
    constructor(resp:MessageResp) {
        super(resp);
        this.stmt_id = resp.msg.stmt_id  
        this.affected = resp.msg.affected 
    }
}

export const enum StmtBindType {
    STMT_TYPE_TAG=1,
    STMT_TYPE_BIND=2,
}

export const enum SchemalessProto {
	InfluxDBLineProtocol       = 1,
	OpenTSDBTelnetLineProtocol = 2,
	OpenTSDBJsonFormatProtocol = 3
}


export function binaryBlockEncode(bindParams :StmtBindParams, bindType:StmtBindType, stmtId:number, reqId:bigint, row:number): ArrayBuffer {
    let columns = bindParams.GetParams().length;
    let length = TDengineTypeLength['BIGINT'] * 4;
    length += TDengineTypeLength['INT'] * 5;
    length += columns * 5 + columns * 4;
    length += bindParams.GetDataTotalLen();
    
    let arrayBuffer = new ArrayBuffer(length);
    let arrayView = new DataView(arrayBuffer)
    
    arrayView.setBigUint64(0, reqId, true);
    arrayView.setBigUint64(8, BigInt(stmtId), true);
    arrayView.setBigUint64(16, BigInt(bindType), true);

    arrayView.setUint32(24, 1, true);
    arrayView.setUint32(28, arrayBuffer.byteLength, true);
    arrayView.setUint32(32, row, true);
    arrayView.setUint32(36, columns, true);
    arrayView.setUint32(40, 0, true);
    arrayView.setBigUint64(44, BigInt(0), true);
    let offset = 52;
    let typeView = new DataView(arrayBuffer, offset);
    let lenView = new DataView(arrayBuffer, offset + columns * 5);
    let dataOffset = offset + columns * 5 + columns * 4;
    let headOffset = 0;
    let columnsData = bindParams.GetParams()
    for (let i = 0; i< columnsData.length; i++) {
        typeView.setUint8(headOffset, columnsData[i].type)
        typeView.setUint32(headOffset+1, columnsData[i].typeLen, true)
        lenView.setUint32(i * 4, columnsData[i].length, true)
        if (columnsData[i].data) { 
            const sourceView = new Uint8Array(columnsData[i].data);  
            // console.log("begin:", dataOffset, columnsData[i].data.byteLength, bindParams.GetDataTotalLen());
            const destView = new Uint8Array(arrayBuffer, dataOffset, columnsData[i].data.byteLength);  
            destView.set(sourceView);  
            dataOffset += columnsData[i].data.byteLength;  
            // console.log("end:",dataOffset, columnsData[i].data.byteLength, bindParams.GetDataTotalLen());          
        }
        headOffset += 5
    }

    // console.log('bindParams.GetDataTotalLen -->', new Uint8Array(arrayBuffer))

    // throw new TaosResultError(ErrorCode.ERR_INVALID_FETCH_MESSAGE_DATA, `test`)
    return arrayBuffer;

}