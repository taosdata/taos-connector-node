import { StmtBindParams } from "./wsParamsBase";

export interface WsStmt {
    prepare(sql: string): Promise<void>;
    setTableName(tableName: string): Promise<void>;
    setTags(paramsArray:StmtBindParams): Promise<void>;
    newStmtParam():StmtBindParams
    bind(paramsArray:StmtBindParams): Promise<void>;
    batch(): Promise<void>;
    exec(): Promise<void>;
    getLastAffected(): number | null | undefined;
    close(): Promise<void>
}