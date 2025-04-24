import { WSQueryResponse } from "../client/wsResponse";
import { MessageResp, TaosResult } from "../common/taosResult";
import { TMQBlockInfo, TMQRawDataSchema } from "./constant";
export declare class WsPollResponse {
    code: number;
    message: string;
    action: string;
    req_id: number;
    have_message: boolean;
    topic: string;
    database: string;
    vgroup_id: number;
    message_id: number;
    id: bigint;
    message_type: number;
    totalTime: number;
    constructor(resp: MessageResp);
}
export declare class WsTmqQueryResponse extends WSQueryResponse {
    completed: boolean;
    table_name: string;
    rows: number;
    message_id: number;
    constructor(resp: MessageResp);
}
export declare class TaosTmqResult extends TaosResult {
    database: string;
    vgroup_id: number;
    constructor(pollResp: WsPollResponse);
}
export declare class WSTmqFetchBlockInfo {
    withTableName?: boolean;
    withSchema?: boolean;
    blockInfos?: Array<TMQBlockInfo>;
    schema: Array<TMQRawDataSchema>;
    tableName?: string;
    taosResult: TaosResult;
    schemaLen: number;
    rows: number;
    textDecoder: TextDecoder;
    constructor(dataView: DataView, taosResult: TaosResult);
    getRows(): number;
    private skipHead;
    private getTypeSkip;
    private parseBlockInfos;
    private parseSchemaInfo;
    private parseVariableByteInteger;
    private parseTmqBlock;
}
export declare class AssignmentResp {
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing: bigint;
    topicPartition: TopicPartition[];
    constructor(resp: MessageResp, topic: string);
}
export declare class SubscriptionResp {
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing: bigint;
    topics: string[];
    constructor(resp: MessageResp);
}
export declare class PartitionsResp {
    req_id: number;
    code: number;
    message: string;
    action: string;
    totalTime: number;
    timing: bigint;
    positions: number[];
    constructor(resp: MessageResp);
    setTopicPartitions(topicPartitions: TopicPartition[]): TopicPartition[];
}
export declare class CommittedResp extends PartitionsResp {
    constructor(resp: MessageResp);
}
export declare class TopicPartition {
    topic: string;
    vgroup_id: number;
    offset?: number;
    begin?: number;
    end?: number;
    constructor(msg: any);
}
//# sourceMappingURL=tmqResponse.d.ts.map