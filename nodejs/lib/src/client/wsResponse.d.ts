/**
 * define ws Response type|class, for query?
 */
import { MessageResp } from "../common/taosResult";
export declare class WSVersionResponse {
    version: string;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    constructor(resp: MessageResp);
}
export declare class WSQueryResponse {
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
    constructor(resp: MessageResp);
    private initMsg;
}
export declare class WSFetchBlockResponse {
    data: DataView | undefined;
    action: bigint;
    timing: bigint;
    reqId: bigint;
    code: number;
    blockLen: number;
    message: string | undefined;
    resultId: bigint | undefined;
    finished: number | undefined;
    metaType: number | undefined;
    textDecoder: TextDecoder;
    constructor(msg: ArrayBuffer);
}
interface IWSConnResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;
}
export declare class WSConnResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    timing: bigint;
    constructor(msg: IWSConnResponse);
}
export {};
//# sourceMappingURL=wsResponse.d.ts.map