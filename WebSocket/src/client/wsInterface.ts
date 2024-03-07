import { parseBlock, MessageResp, TaosResult } from '../common/taosResult';
import { TDWebSocketClient } from './wsClient';
import { ErrorCode, WebSocketInterfaceError, WebSocketQueryError } from '../common/wsError';
import {
  WSVersionResponse,
  WSFetchBlockResponse,
  WSQueryResponse,
  WSFetchResponse,
  WSConnResponse,
} from './wsResponse';
import JSONBig from 'json-bigint';

export class WSInterface {
  private _wsQueryClient: TDWebSocketClient;
  private _req_id = 1000000;
  private _url;

  constructor(url: URL, timeout ?:number | undefined | null) {
    this.checkURL(url);
    this._url = url;
    this._wsQueryClient = new TDWebSocketClient(this._url, timeout);
  }

  connect(database?: string | undefined | null): Promise<WSConnResponse> {
    let _db = this._url.pathname.split('/')[3];

    if (database) {
      _db = database;
    }
    
    let connMsg = {
      action: 'conn',
      args: {
        req_id: this.getReqID(),
        user: this._url.username,
        password: this._url.password,
        db: _db,
      },
    };
    
    return new Promise((resolve, reject) => {
      if (this._wsQueryClient.readyState() > 0) {
        this._wsQueryClient.sendMsg(JSON.stringify(connMsg)).then((e: any) => {
          if (e.msg.code == 0) {
            resolve(e);
          } else {
            reject(new WebSocketQueryError(e.code, e.message));
          }
        }).catch((e) => {reject(e);});
      } else {
        this._wsQueryClient.Ready().then((ws: TDWebSocketClient) => {
            return ws.sendMsg(JSON.stringify(connMsg));
          })
          .then((e: any) => {
            if (e.msg.code == 0) {
              resolve(e);
            } else {
              reject(new WebSocketQueryError(e.msg.code, e.msg.message));
            }
          }).catch((e) => {reject(e);});
      }
    });
  }

  // // return Response need callor parse .
  // exec(queryMsg: string): Promise<any> {
  //   return new Promise((resolve, reject) => {
  //     console.log('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
  //     this._wsQueryClient.sendMsg(queryMsg).then((e: any) => {
  //       if (e.msg.code == 0) {
  //         resolve(e);
  //       } else {
  //         reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
  //       }
  //     }).catch((e) => {reject(e);});
  //   });
  // }

  execNoResp(queryMsg: string): Promise<Boolean> {
    return new Promise((resolve, reject) => {
      console.log('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
      this._wsQueryClient.sendMsgNoResp(queryMsg)
      .then((e: any) => {resolve(e);})
      .catch((e) => reject(e));
    });
  }

  // need to construct Response.
  exec(queryMsg: string, bQurey:boolean = true): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
      this._wsQueryClient.sendMsg(queryMsg).then((e: any) => {
        if (e.msg.code == 0) {
          if (bQurey) {
            resolve(new WSQueryResponse(e));
          }else{
            resolve(e)
          }
          
        } else {
          reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
        }
      }).catch((e) => {reject(e);});
    });
  }

  getState() {
    return this._wsQueryClient.readyState();
  }

  Ready(): Promise<TDWebSocketClient> {
    return this._wsQueryClient.Ready()
  }

  fetch(res: WSQueryResponse): Promise<WSFetchResponse> {
    let fetchMsg = {
      action: 'fetch',
      args: {
        req_id: this.getReqID(),
        id: res.id,
      },
    };
    // console.log("[wsQueryInterface.fetch()]===>wsQueryResponse\n")
    // console.log(res)
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(fetchMsg);
      console.log('[wsQueryInterface.fetch.fetchMsg]===>' + jsonStr);
      this._wsQueryClient.sendMsg(jsonStr).then((e: any) => {
        if (e.msg.code == 0) {
            resolve(new WSFetchResponse(e));
        } else {
            reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
        }
      }).catch((e) => {reject(e);});
    });
  }

  fetchBlock(fetchResponse: WSFetchResponse, taosResult: TaosResult): Promise<TaosResult> {
    let fetchBlockMsg = {
      action: 'fetch_block',
      args: {
        req_id: this.getReqID(),
        id: fetchResponse.id,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(fetchBlockMsg);
      // console.log("[wsQueryInterface.fetchBlock.fetchBlockMsg]===>" + jsonStr)
      this._wsQueryClient.sendMsg(jsonStr).then((e: any) => {
          let resp:MessageResp = e
          taosResult.AddtotalTime(resp.totalTime)
          resolve(parseBlock(fetchResponse.rows, new WSFetchBlockResponse(resp.msg), taosResult));
          // if retrieve JSON then reject with message
          // else is binary , so parse raw block to TaosResult
        }).catch((e) => reject(e));
    });
  }

  sendMsg(msg:string): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log("[wsQueryInterface.sendMsg]===>" + msg)
      this._wsQueryClient.sendMsg(msg).then((e: any) => {
          resolve(e);
        }).catch((e) => reject(e));
    });
  }

  freeResult(res: WSQueryResponse) {
    let freeResultMsg = {
      action: 'free_result',
      args: {
        req_id: this.getReqID(),
        id: res.id,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(freeResultMsg);
      // console.log("[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr)
      this._wsQueryClient.sendMsg(jsonStr, false)
      .then((e: any) => {resolve(e);})
      .catch((e) => reject(e));
    });
  }

  version(): Promise<string> {
    let versionMsg = {
      action: 'version',
      args: {
        req_id: this.getReqID()
      },
    };
    return new Promise((resolve, reject) => {
      if (this._wsQueryClient.readyState() > 0) {
        this._wsQueryClient.sendMsg(JSONBig.stringify(versionMsg))
          .then((e: any) => {
            // console.log(e)
            if (e.msg.code == 0) {
              resolve(new WSVersionResponse(e).version);
            } else {
              reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
            }
          }).catch((e) => reject(e));
      }

      this._wsQueryClient.Ready().then((ws: TDWebSocketClient) => {
          return ws.sendMsg(JSONBig.stringify(versionMsg));
        }).then((e: any) => {
          // console.log(e)
          if (e.msg.code == 0) {
            resolve(new WSVersionResponse(e).version);
          } else {
            reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
          }
        }).catch((e) => reject(e));
    });
  }

  close() {
    this._wsQueryClient.close();
  }

  checkURL(url: URL) {
    // Assert is cloud url
    if (!url.searchParams.has('token')) {
      if (!(url.username || url.password)) {
        throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_AUTHENTICATION, 'invalid url, password or username needed.');
      }
    }
  }

  private getReqID() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 1000000;
    } else {
      this._req_id += 1;
    }
    return this._req_id;
  }
}
