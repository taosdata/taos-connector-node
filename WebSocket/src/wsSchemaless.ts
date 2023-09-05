import { Utils } from './utils';
import { WebsocketSchemalessError } from './wsError';
import { SchemalessPrecision, SchemalessProtocol, WsFunc } from './wsOptions';
import { MessageId, WebSocketClient } from './wsClient';
import { WSConnResponse, WSQueryResponse } from './wsQueryResponse';

export class Schemaless {
  private _url: URL;
  private _req_id = 0;
  private _ws: WebSocketClient;
  private _state: boolean = false;

  constructor(url: string) {
    if (!url) {
      throw new WebsocketSchemalessError('websocket URL must be defined');
    }

    this._url = new URL(url);
    Utils.checkURL(this._url);

    let origin = this._url.origin;

    let messageHandler = (data: string) => {
      let msg = JSON.parse(data);
      let key: MessageId = { action: msg.action, req_id: msg.req_id };
      let action = this._ws.removeInflightRequest(key);

      if (action) {
        action.resolve(msg);
      } else {
        this._ws.close();
        throw new WebsocketSchemalessError(
          `no callback registered for ${msg.action} with req_id=${msg.req_id}`
        );
      }
    };

    this._ws = new WebSocketClient(
      origin.concat(WsFunc.SCHEMALESS),
      messageHandler
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
              reject(
                new WebsocketSchemalessError(`${e.message}, code ${e.code}`)
              );
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
              reject(
                new WebsocketSchemalessError(`${e.message}, code ${e.code}`)
              );
            }
          });
      }
    });
  }

  insert(
    lines: string,
    protocol: SchemalessProtocol,
    precision: SchemalessPrecision,
    ttl?: number,
    reqID?: number
  ): Promise<InsertResponse> {
    this._reqIDIncrement();
    let msg: InsertMsg = {
      action: 'insert',
      args: {
        req_id: this._req_id,
        protocol: protocol,
        precision: precision,
        data: lines,
      },
    };

    if (ttl) {
      msg.args['ttl'] = ttl;
    }

    if (reqID) {
      msg.args['req_id'] = reqID;
    }
    return new Promise((resolve, reject) => {
      let json = JSON.stringify(msg);
      this._ws
        .sendMsg(json, { action: 'insert', req_id: this._req_id })
        .then((e: any) => {
          if (e.code == 0) {
            resolve(new InsertResponse(e));
          } else {
            reject(
              new WebsocketSchemalessError(
                `lines: ${lines}, msg: ${e.message}, code ${e.code}`
              )
            );
          }
        });
    });
  }

  private _reqIDIncrement() {
    if (this._req_id == Number.MAX_SAFE_INTEGER) {
      this._req_id = 0;
    } else {
      this._req_id += 1;
    }
  }

  close() {
    this._ws.close();
  }
}

interface InsertMsg {
  action: string;
  args: {
    req_id?: number;
    protocol: number;
    precision: string;
    data: string;
    ttl?: number;
  };
}

export class InsertResponse {
  code: number;
  message: string;
  action: string;
  req_id: number;
  timing: bigint;

  constructor(msg: any) {
    this.code = msg.code;
    this.message = msg.message;
    this.action = msg.action;
    this.req_id = msg.req_id;
    this.timing = BigInt(msg.timing);
  }
}
