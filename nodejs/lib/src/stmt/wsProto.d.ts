import { WSQueryResponse } from "../client/wsResponse";
import { MessageResp } from "../common/taosResult";
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
export declare class WsStmtQueryResponse extends WSQueryResponse {
    affected: number | undefined | null;
    stmt_id?: number | undefined | null;
    constructor(resp: MessageResp);
}
export declare const enum StmtBindType {
    STMT_TYPE_TAG = 1,
    STMT_TYPE_BIND = 2
}
export declare function binaryBlockEncode(bindParams: StmtBindParams, bindType: StmtBindType, stmtId: number, reqId: bigint, row: number): ArrayBuffer;
export {};
//# sourceMappingURL=wsProto.d.ts.map