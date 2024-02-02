import { TaosResult, TaosRowResult } from '../common/taosResult';
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
      console.log("WSRows::Next=>")
      console.log(this)
      return false;
    }

    if (Array.isArray(this._taosResult.data) && this._taosResult.data.length > 0) {
      return true;
    }

    this._taosResult = await this.getBlockData();
    if (this._taosResult.data == null) {
      return false;
    }
    return true;
  }

  private async getBlockData():Promise<TaosResult> {
    try {
      let wsFetchResponse = await this._wsInterface.fetch(this._wsQueryResponse);
      console.log("[wsQuery.execute.wsFetchResponse]==>\n")
      console.log(wsFetchResponse)
      // console.log(typeof BigInt(8))
      // console.log(typeof wsFetchResponse.timing)
      if (wsFetchResponse.completed == true) {
        this.Close();
        this._taosResult.data = null
      } else {
        this._taosResult.setRows(wsFetchResponse);
        return await this._wsInterface.fetchBlock(wsFetchResponse, this._taosResult);
      }
      return this._taosResult
    }catch(e){
      this.Close()
      console.log(e)
      throw new TaosResultError("query fetch error");
    } 
  }

  Scan(): Promise<TaosResult> {
    console.log("scan row=>\n")
    return new Promise((resolve, reject) => {
      if (this._wsQueryResponse.is_update == true) {
        return resolve(this._taosResult) 
      }

      if (Array.isArray(this._taosResult.data) && this._taosResult.data.length > 0) {
        let row = this._taosResult.data.pop();
        let taosResult = new TaosResult(this._wsQueryResponse)
        if (taosResult.data === null) {
          taosResult.data = []
        } 
        
        console.log(row)
        if (row !== undefined) {
          taosResult.data.push(row)
        }
        taosResult.meta = this._taosResult.meta
        resolve(taosResult);
      } else {
        reject(new TaosResultError('query no find data!'));
      }
    });
  }

  Close() {
    if (this._isClose) {
      return
    }

    this._isClose = true
    this._wsInterface.freeResult(this._wsQueryResponse)
  }

}
