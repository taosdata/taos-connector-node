/**
 * define ws Response type|class, for query?
 */


export class WSVersionResponse {

    version: string;
    code: number;
    message: string;
    action: string;

    constructor(msg: any) {

        this.version = msg.version;
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
    }
}

export class WSQueryResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;
    id: number;
    is_update: boolean;
    affected_rows: number;
    fields_count: number|null;
    fields_names: Array<string>|null;
    fields_types: Array<number>|null;
    fields_lengths: Array<number>|null;
    precision: number;

    constructor(msg: any) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = msg.timing;
        this.id = msg.id;
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
    id: number;
    completed: boolean;
    length: Array<number>;
    rows: number;

    constructor(msg: any) {
        this.code = msg.code;
        this.message = msg.message;
        this.action = msg.action;
        this.req_id = msg.req_id;
        this.timing = msg.timing;
        this.id = msg.id;
        this.completed = msg.completed;
        this.length = msg.length;
        this.rows = msg.rows;
    }
}

export class WSFetchBlockResponse {

    req_id: bigint
    data: ArrayBuffer
    timing:bigint
    constructor(msg: ArrayBuffer) {
        //前8位
        this.timing = new DataView(msg,0,8).getBigUint64(0,true)
        this.req_id = new DataView(msg,8,8).getBigUint64(0,true)
        this.data = msg.slice(16)
    }
    // data Response

}

export class TDResponse {

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
        this.timing = msg.timing;
    }
}
