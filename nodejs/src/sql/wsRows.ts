import { TDengineMeta, TaosResult } from '../common/taosResult';
import { TaosResultError } from '../common/wsError';
import { WSQueryResponse } from '../client/wsResponse';
import { WsClient } from '../client/wsClient';
import logger from '../common/log';

export class WSRows {
    private _wsClient: WsClient;
    private readonly _wsQueryResponse: WSQueryResponse;
    private _taosResult: TaosResult;
    private _isClose : boolean;
    constructor(wsInterface: WsClient, resp: WSQueryResponse) {
        this._wsClient = wsInterface;
        this._wsQueryResponse = resp;
        this._taosResult = new TaosResult(resp);
        this._isClose = false
    }

    async next(): Promise<boolean> {
        if (this._wsQueryResponse.is_update || this._isClose) {
            logger.debug("WSRows::Next::End=>", this._taosResult, this._isClose)
            return false;
        }
        
        let data = this._taosResult.getData();
        if (this._taosResult && data != null) {
            if (data && Array.isArray(this._taosResult.getData()) && data.length > 0) {
                return true;
            }
        }

        this._taosResult = await this.getBlockData();
        if (this._taosResult.getData()) {
            return true;
        }
        return false;
    }

    private async getBlockData():Promise<TaosResult> {
        try {
            let wsFetchResponse = await this._wsClient.fetch(this._wsQueryResponse);
            logger.debug("[wsQuery.execute.wsFetchResponse]==>\n", wsFetchResponse)
            if (wsFetchResponse.completed) {
                this.close();
                this._taosResult.setData(null);
            } else {
                this._taosResult.setRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing);
                return await this._wsClient.fetchBlock(wsFetchResponse, this._taosResult);
            }
            return this._taosResult;
        }catch(err:any){
            this.close();
            throw new TaosResultError(err.code, err.message);
        } 
    }
  
    getMeta():Array<TDengineMeta> | null {
        return this._taosResult.getMeta();
    }

    getData(): Array<any> | undefined {
        if (this._wsQueryResponse.is_update) {
            return undefined; 
        }

        let data = this._taosResult.getData();
        if (this._taosResult && data != null) {
            if (Array.isArray(data) && data.length > 0) {
                return data.pop();
            }
        } 
        return undefined;
    }

    async close():Promise<void> {
        if (this._isClose) {
            return
        }
        this._isClose = true
        this._wsClient.freeResult(this._wsQueryResponse)
    }

}
