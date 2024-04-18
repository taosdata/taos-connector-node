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

    async Next(): Promise<boolean> {
        if (this._wsQueryResponse.is_update || this._isClose) {
            logger.debug("WSRows::Next::End=>", this._taosResult, this._isClose)
            return false;
        }
        
        let data = this._taosResult.GetData();
        if (this._taosResult && data != null) {
            if (data && Array.isArray(this._taosResult.GetData()) && data.length > 0) {
                return true;
            }
        }

        this._taosResult = await this.getBlockData();
        if (this._taosResult.GetData()) {
            return true;
        }
        return false;
    }

    private async getBlockData():Promise<TaosResult> {
        try {
            let wsFetchResponse = await this._wsClient.fetch(this._wsQueryResponse);
            logger.debug("[wsQuery.execute.wsFetchResponse]==>\n", wsFetchResponse)
            if (wsFetchResponse.completed) {
                this.Close();
                this._taosResult.SetData(null);
            } else {
                this._taosResult.SetRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing);
                return await this._wsClient.fetchBlock(wsFetchResponse, this._taosResult);
            }
            return this._taosResult;
        }catch(err:any){
            this.Close();
            throw new TaosResultError(err.code, err.message);
        } 
    }
  
    GetMeta():Array<TDengineMeta> | null {
        return this._taosResult.GetMeta();
    }

    GetData(): Array<any> | undefined {
        if (this._wsQueryResponse.is_update) {
            return undefined; 
        }

        let data = this._taosResult.GetData();
        if (this._taosResult && data != null) {
            if (Array.isArray(data) && data.length > 0) {
                return data.pop();
            }
        } 
        return undefined;
    }

    async Close():Promise<void> {
        if (this._isClose) {
            return
        }
        this._isClose = true
        await this._wsClient.freeResult(this._wsQueryResponse)
    }

}
