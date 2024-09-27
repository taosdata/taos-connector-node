/**
 * define ws Response type|class, for query?
 */

import { MessageResp, readVarchar } from "../common/taosResult";

export class WSVersionResponse {
    version: string;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    constructor(resp:MessageResp) {
        this.version = resp.msg.version;
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.action = resp.msg.action;
        this.totalTime = resp.totalTime;
    }
}

export class WSQueryResponse {
    code?: number;
    message?: string;
    action?: string;
    req_id?: number;
    timing?: bigint | null;
    totalTime: number;
    id?: bigint;
    is_update?: boolean;
    affected_rows?: number | null;
    fields_count?: number | null;
    fields_names?: Array<string> | null;
    fields_types?: Array<number> | null;
    fields_lengths?: Array<number> | null;
    precision?: number;
    
    constructor(resp:MessageResp) {
        this.totalTime = resp.totalTime
        this.initMsg(resp.msg)
    }
    private initMsg(msg:any) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = BigInt(msg.timing);
        if (msg.id) {
            this.id = BigInt(msg.id);
        }else{
            this.id = BigInt(0)
        }
        
        this.is_update = msg.is_update;
        this.affected_rows = msg.affected_rows;
        this.fields_count = msg.fields_count;
        this.fields_names = msg.fields_names;
        this.fields_types = msg.fields_types;
        this.fields_lengths = msg.fields_lengths;
        this.precision = msg.precision;
    }
}

export class WSFetchResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;
    id: bigint;
    completed: boolean;
    length: Array<number>;
    rows: number;
    totalTime: number;
    constructor(resp:MessageResp) {
        this.totalTime = resp.totalTime
        this.code = resp.msg.code;
        this.message = resp.msg.message;
        this.action = resp.msg.action;
        this.req_id = resp.msg.req_id;
        this.timing = BigInt(resp.msg.timing);
        this.id = BigInt(resp.msg.id);
        this.completed = resp.msg.completed;
        this.length = resp.msg.length;
        this.rows = resp.msg.rows;
    }
}

export class WSFetchBlockResponse {
    data: ArrayBuffer | undefined
    action: bigint
    timing: bigint
    reqId: bigint
    code: number
    blockLen: number
    message: string | undefined
    resultId: bigint | undefined
    finished: number | undefined
    metaType: number | undefined
    constructor(msg: ArrayBuffer) {
        this.action = new DataView(msg, 8, 8).getBigUint64(0, true)
        this.timing = new DataView(msg, 18, 8).getBigUint64(0, true)
        this.reqId = new DataView(msg, 26, 8).getBigUint64(0, true)
        this.code = new DataView(msg, 34, 4).getUint32(0, true)
        this.blockLen = 0;
        if (this.code != 0) {
            let len = new DataView(msg, 38, 4).getUint32(0, true)
            this.message = readVarchar(msg, 42, len);
            return;
        }
        this.resultId = new DataView(msg, 42, 8).getBigUint64(0, true)
        let offset  = 50;
        if (this.action == BigInt(8)) {
            this.metaType = new DataView(msg, 50, 2).getUint16(0, true)
            offset += 2;
        }else {
            this.finished = new DataView(msg, 50, 1).getUint8(0)
            if (this.finished == 1) {
                return;
            }            
            offset += 1;
        }

        this.blockLen = new DataView(msg, offset, 4).getUint32(0, true) 
        if (this.blockLen > 0) {
            this.data = msg.slice(offset + 4);
        }    
        
    }
}

interface IWSConnResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;
}

export class WSConnResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;

    constructor(msg: IWSConnResponse) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = BigInt(msg.timing);
    }
}
