import { TDengineMeta, TaosResult } from '../common/taosResult';
import { TaosResultError } from '../common/wsError';
import { WSQueryResponse } from '../client/wsResponse';
import { WSInterface } from '../client/wsInterface';
import { resolve } from 'path';


export class WSRows {
  private _wsInterface: WSInterface;
  private _wsQueryResponse: WSQueryResponse;
  private _taosResult: TaosResult;
  private _isClose : boolean;
  constructor(wsInterface: WSInterface, resp: WSQueryResponse) {
    this._wsInterface = wsInterface;
    this._wsQueryResponse = resp;
    this._taosResult = new TaosResult(resp);
    this._isClose = false
  }

  async Next(): Promise<boolean> {
    if (this._wsQueryResponse.is_update == true || this._isClose) {
      console.log("WSRows::Next::End=>", this._taosResult, this._isClose)
      return false;
    }
    
    let data = this._taosResult.GetData();
    if (this._taosResult && data != null) {
      if (data && Array.isArray(this._taosResult.GetData()) && data.length > 0) {
        return true;
      }
    }

    this._taosResult = await this.getBlockData();
    if (this._taosResult.GetData() == null) {
      return false;
    }
    return true;
  }

  private async getBlockData():Promise<TaosResult> {
    try {
      let wsFetchResponse = await this._wsInterface.fetch(this._wsQueryResponse);
      console.log("[wsQuery.execute.wsFetchResponse]==>\n", wsFetchResponse)
      if (wsFetchResponse.completed == true) {
        this.Close();
        this._taosResult.SetData(null);
      } else {
        this._taosResult.SetRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing);
        return await this._wsInterface.fetchBlock(wsFetchResponse, this._taosResult);
      }
      return this._taosResult;
    }catch(e){
      this.Close();
      console.log(e);
      throw new TaosResultError("query fetch error");
    } 
  }
  
  GetMeta():Array<TDengineMeta> | null {
    return this._taosResult.GetMeta();
  }

  GetData(): Array<any> | undefined {
    if (this._wsQueryResponse.is_update == true) {
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

  Close() {
    if (this._isClose) {
      return
    }
    this._isClose = true
    this._wsInterface.freeResult(this._wsQueryResponse)
  }

}
