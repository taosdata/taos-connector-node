import { TimeoutParam, TimeoutValue } from './constant';
import { parseBlock, TaosResult } from './taosResult';
import { Utils } from './utils';
import { MessageId, WebSocketClient } from './wsClient';
import {
  WebSocketClientError,
  WebSocketInterfaceError,
  WebSocketQueryError,
} from './wsError';
import { WsFunc } from './wsOptions';
import {
  WSFetchBlockResponse,
  WSQueryResponse,
  WSFetchResponse,
  WSConnResponse,
  WSVersionResponse,
} from './wsQueryResponse';
import JSONBig from 'json-bigint';

export class WSInterface {
  private _ws: WebSocketClient;
  private _req_id = 0;
  private _url;
  private _state = false;

  constructor(url: URL) {
    if (!url) {
      throw new WebSocketQueryError('websocket URL must be defined');
    }
    Utils.checkURL(url);
    this._url = url;

    let messageHandler = (data: string) => {
      let msg = JSON.parse(data);
      if (msg.action == 'version' && msg.version !== undefined) {
        this._ws.removeInflightVersionRequest().forEach((action) => {
          action.resolve(msg);
        });
        return;
      }
      let key: MessageId = { action: msg.action, req_id: msg.req_id };
      let action = this._ws.removeInflightRequest(key);

      if (action) {
        action.resolve(msg);
      } else {
        this._ws.close();
        throw new WebSocketClientError(
          `no callback registered for ${msg.action} with req_id=${msg.req_id}`
        );
      }
    };
    let binaryHandler = (data: ArrayBuffer) => {
      let id = new DataView(data, 8, 8).getBigUint64(0, true);

      let action = this._ws.removeInflightRequest({
        action: 'fetch_block',
        req_id: 0,
        id: id,
      });
      if (action) {
        action.resolve(data);
      } else {
        this._ws.close();
        throw new WebSocketClientError(
          `no callback registered for fetch_block with id=${id}`
        );
      }
    };

    this._ws = new WebSocketClient(
      url.origin.concat(WsFunc.WS),
      messageHandler,
      binaryHandler,
      url.searchParams.get(TimeoutParam)
        ? Number(url.searchParams.get(TimeoutParam))
        : TimeoutValue
    );
  }

  connect(database?: string): Promise<WSConnResponse> {
    let _db = this._url.pathname.split('/')[1];

    if (database) {
      _db = database;
    }
    this._reqIDIncrement();
    let connMsg = {
      action: 'conn',
      args: {
        req_id: this._req_id,
        user: this._url.username,
        password: this._url.password,
        db: _db,
      },
    };
    if (this._state) {
      return new Promise((resolve, reject) => {
        resolve(
          new WSConnResponse({
            code: 0,
            message: 'already connected',
            action: 'conn',
            req_id: this._req_id,
            timing: BigInt(0),
          })
        );
      });
    }
    return new Promise((resolve, reject) => {
      if (this._ws.readyState() > 0) {
        this._ws
          .sendMsg(JSON.stringify(connMsg), {
            action: 'conn',
            req_id: this._req_id,
          })
          .then((e: any) => {
            if (e.code == 0) {
              this._state = true;
              resolve(e);
            } else {
              reject(new WebSocketQueryError(`${e.message}, code ${e.code}`));
            }
          });
      } else {
        this._ws
          .Ready()
          .then((ws: WebSocketClient) => {
            return ws.sendMsg(JSON.stringify(connMsg), {
              action: 'conn',
              req_id: this._req_id,
            });
          })
          .then((e: any) => {
            if (e.code == 0) {
              this._state = true;
              resolve(e);
            } else {
              reject(new WebSocketQueryError(`${e.message}, code ${e.code}`));
            }
          });
      }
    });
  }

  // need to construct Response.
  query(sql: string): Promise<WSQueryResponse> {
    this._reqIDIncrement();
    let queryMsg = {
      action: 'query',
      args: {
        req_id: this._req_id,
        sql: sql,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSON.stringify(queryMsg);
      this._ws
        .sendMsg(jsonStr, {
          action: 'query',
          req_id: this._req_id,
        })
        .then((e: any) => {
          if (e.code == 0) {
            resolve(new WSQueryResponse(e));
          } else {
            reject(
              new WebSocketInterfaceError(
                `sql: ${sql}, msg: ${e.message}, code ${e.code}`
              )
            );
          }
        });
    });
  }

  getState() {
    return this._ws.readyState();
  }

  fetch(res: WSQueryResponse): Promise<WSFetchResponse> {
    this._reqIDIncrement();
    let fetchMsg = {
      action: 'fetch',
      args: {
        req_id: this._req_id,
        id: res.id,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(fetchMsg);
      this._ws
        .sendMsg(jsonStr, { action: 'fetch', req_id: this._req_id })
        .then((e: any) => {
          if (e.code == 0) {
            resolve(new WSFetchResponse(e));
          } else {
            reject(new WebSocketInterfaceError(`${e.message},code ${e.code}`));
          }
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  fetchBlock(
    fetchResponse: WSFetchResponse,
    taosResult: TaosResult
  ): Promise<TaosResult> {
    this._reqIDIncrement();
    let fetchBlockMsg = {
      action: 'fetch_block',
      args: {
        req_id: this._req_id,
        id: fetchResponse.id,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(fetchBlockMsg);
      this._ws
        .sendMsg(jsonStr, {
          action: 'fetch_block',
          // unused
          req_id: 0,
          id: fetchResponse.id,
        })
        .then((e: any) => {
          resolve(
            parseBlock(fetchResponse, new WSFetchBlockResponse(e), taosResult)
          );
        })
        .catch((e) => reject(e));
    });
  }

  freeResult(res: WSQueryResponse) {
    this._reqIDIncrement();
    let freeResultMsg = {
      action: 'free_result',
      args: {
        req_id: this._req_id,
        id: res.id,
      },
    };
    return new Promise((resolve, reject) => {
      let jsonStr = JSONBig.stringify(freeResultMsg);
      this._ws
        .sendMsg(jsonStr, { action: '', req_id: 0 }, false)
        .then((e: any) => {
          resolve(e);
        })
        .catch((e) => reject(e));
    });
  }

  version(): Promise<string> {
    this._reqIDIncrement();
    let versionMsg = {
      action: 'version',
      args: {
        req_id: this._req_id,
      },
    };
    return new Promise((resolve, reject) => {
      if (this._ws.readyState() > 0) {
        this._ws
          .sendMsg(JSON.stringify(versionMsg), {
            action: 'version',
            req_id: this._req_id,
          })
          .then((e: any) => {
            // console.log(e)
            if (e.code == 0) {
              resolve(new WSVersionResponse(e).version);
            } else {
              reject(new WSVersionResponse(e).message);
            }
          })
          .catch((e) => reject(e));
      }
      this._ws
        .Ready()
        .then((ws: WebSocketClient) => {
          return ws.sendMsg(JSON.stringify(versionMsg), {
            action: 'version',
            req_id: this._req_id,
          });
        })
        .then((e: any) => {
          // console.log(e)
          if (e.code == 0) {
            resolve(new WSVersionResponse(e).version);
          } else {
            reject(new WSVersionResponse(e).message);
          }
        })
        .catch((e) => reject(e));
    });
  }

  close() {
    this._ws.close();
  }

  private _reqIDIncrement() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 0;
    } else {
      this._req_id += 1;
    }
  }
}
