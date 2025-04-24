import { WSRows } from './wsRows';
import { TaosResult } from '../common/taosResult';
import { WSConfig } from '../common/config';
import { Precision, SchemalessProto } from './wsProto';
import { WsStmt } from '../stmt/wsStmt';
export declare class WsSql {
    private wsConfig;
    private _wsClient;
    constructor(wsConfig: WSConfig);
    static open(wsConfig: WSConfig): Promise<WsSql>;
    state(): number;
    /**
     * return client version.
     */
    version(): Promise<string>;
    close(): Promise<void>;
    schemalessInsert(lines: Array<string>, protocol: SchemalessProto, precision: Precision, ttl: number, reqId?: number): Promise<void>;
    stmtInit(reqId?: number): Promise<WsStmt>;
    exec(sql: string, reqId?: number, action?: string): Promise<TaosResult>;
    private executeSchemalessInsert;
    query(sql: string, reqId?: number): Promise<WSRows>;
    private getSql;
}
//# sourceMappingURL=wsSql.d.ts.map