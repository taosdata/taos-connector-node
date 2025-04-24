import { TDengineMeta } from '../common/taosResult';
import { WSQueryResponse } from '../client/wsResponse';
import { WsClient } from '../client/wsClient';
export declare class WSRows {
    private _wsClient;
    private readonly _wsQueryResponse;
    private _taosResult;
    private _isClose;
    constructor(wsInterface: WsClient, resp: WSQueryResponse);
    next(): Promise<boolean>;
    private getBlockData;
    getMeta(): Array<TDengineMeta> | null;
    getData(): Array<any> | undefined;
    close(): Promise<void>;
}
//# sourceMappingURL=wsRows.d.ts.map