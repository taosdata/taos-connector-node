import { TaosResult } from '../common/taosResult';
import { TopicPartition } from './tmqResponse';
export declare class WsConsumer {
    private _wsClient;
    private _wsConfig;
    private _topics?;
    private _commitTime?;
    private constructor();
    private init;
    static newConsumer(wsConfig: Map<string, any>): Promise<WsConsumer>;
    subscribe(topics: Array<string>, reqId?: number): Promise<void>;
    unsubscribe(reqId?: number): Promise<void>;
    poll(timeoutMs: number, reqId?: number): Promise<Map<string, TaosResult>>;
    subscription(reqId?: number): Promise<Array<string>>;
    commit(reqId?: number): Promise<Array<TopicPartition>>;
    private doCommit;
    committed(partitions: Array<TopicPartition>, reqId?: number): Promise<Array<TopicPartition>>;
    commitOffsets(partitions: Array<TopicPartition>): Promise<Array<TopicPartition>>;
    commitOffset(partition: TopicPartition, reqId?: number): Promise<void>;
    positions(partitions: Array<TopicPartition>, reqId?: number): Promise<Array<TopicPartition>>;
    seek(partition: TopicPartition, reqId?: number): Promise<void>;
    seekToBeginning(partitions: Array<TopicPartition>): Promise<void>;
    seekToEnd(partitions: Array<TopicPartition>): Promise<void>;
    close(): Promise<void>;
    private fetchBlockData;
    private pollData;
    private sendAssignmentReq;
    assignment(topics?: string[]): Promise<Array<TopicPartition>>;
    private seekToBeginOrEnd;
}
//# sourceMappingURL=wsTmq.d.ts.map