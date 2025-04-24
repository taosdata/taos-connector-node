import { WSQueryResponse } from './wsResponse';
export declare class WsClient {
    private _wsConnector?;
    private _timeout?;
    private readonly _url;
    constructor(url: URL, timeout?: number | undefined | null);
    connect(database?: string | undefined | null): Promise<void>;
    execNoResp(queryMsg: string): Promise<void>;
    exec(queryMsg: string, bSqlQuery?: boolean): Promise<any>;
    sendBinaryMsg(reqId: bigint, action: string, message: ArrayBuffer, bSqlQuery?: boolean, bResultBinary?: boolean): Promise<any>;
    getState(): number;
    ready(): Promise<void>;
    sendMsg(msg: string): Promise<any>;
    freeResult(res: WSQueryResponse): Promise<unknown>;
    version(): Promise<string>;
    close(): Promise<void>;
    checkURL(url: URL): void;
}
//# sourceMappingURL=wsClient.d.ts.map