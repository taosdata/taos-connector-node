import { WSQueryResponse } from "../client/wsResponse";
import { MessageResp } from "../common/taosResult";

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