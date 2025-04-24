import { WebSocketConnector } from "./wsConnector";
export declare class WebSocketConnectionPool {
    private static _instance?;
    private pool;
    private _connectionCount;
    private readonly _maxConnections;
    private constructor();
    static instance(maxConnections?: number): WebSocketConnectionPool;
    getConnection(url: URL, timeout: number | undefined | null): Promise<WebSocketConnector>;
    releaseConnection(connector: WebSocketConnector): Promise<void>;
    destroyed(): void;
}
//# sourceMappingURL=wsConnectorPool.d.ts.map