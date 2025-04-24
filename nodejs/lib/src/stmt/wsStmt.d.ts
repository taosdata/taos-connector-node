import { WsClient } from '../client/wsClient';
import { StmtBindParams } from './wsParams';
export declare class WsStmt {
    private _wsClient;
    private _stmt_id;
    private _precision;
    private lastAffected;
    private constructor();
    static newStmt(wsClient: WsClient, precision?: number, reqId?: number): Promise<WsStmt>;
    prepare(sql: string): Promise<void>;
    setTableName(tableName: string): Promise<void>;
    setJsonTags(tags: Array<any>): Promise<void>;
    newStmtParam(): StmtBindParams;
    setTags(paramsArray: StmtBindParams): Promise<void>;
    bind(paramsArray: StmtBindParams): Promise<void>;
    jsonBind(paramArray: Array<Array<any>>): Promise<void>;
    batch(): Promise<void>;
    /**
     * return client version.
     */
    version(): Promise<string>;
    exec(): Promise<void>;
    getLastAffected(): number | null | undefined;
    close(): Promise<void>;
    getStmtId(): number | undefined | null;
    private execute;
    private sendBinaryMsg;
    private init;
}
//# sourceMappingURL=wsStmt.d.ts.map