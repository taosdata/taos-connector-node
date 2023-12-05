import { ICloseEvent, w3cwebsocket } from 'websocket';
import { WebSocketClientError, WebSocketQueryError } from './wsError';
import _ from 'json-bigint';
import { TimeoutValue } from './constant';

export interface MessageId {
  action: string;
  req_id: number;
  id?: bigint;
}

interface MessageAction {
  reject: Function;
  resolve: Function;
  timer: ReturnType<typeof setTimeout>;
}

var _msgActionRegister: Map<string, MessageAction> = new Map();

export class WebSocketClient {
  private _wsConn: w3cwebsocket;
  private _timeout = TimeoutValue;
  private stringHandler: (event: string) => void;
  private binaryHandler: (event: ArrayBuffer) => void;

  // create ws
  constructor(
    url: string,
    stringHandler: (event: string) => void,
    binaryHandler: (event: ArrayBuffer) => void = () => {},
    timeout: number = TimeoutValue
  ) {
    if (!url) {
      throw new WebSocketClientError('websocket URL must be defined');
    }
    this.stringHandler = stringHandler;
    this.binaryHandler = binaryHandler;
    this._timeout = timeout;

    this._wsConn = new w3cwebsocket(url);

    this._wsConn.onerror = (err: Error) => {
      throw err;
    };

    this._wsConn.onclose = this._onclose;

    this._wsConn.onmessage = (event: any) => {
      let data = event.data;
      if (Object.prototype.toString.call(data) === '[object String]') {
        this.stringHandler(data);
      } else if (
        Object.prototype.toString.call(data) === '[object ArrayBuffer]'
      ) {
        this.binaryHandler(data);
      } else if (Object.prototype.toString.call(data) === '[object Blob]') {
        data.arrayBuffer().then(this.binaryHandler);
      } else {
        _msgActionRegister.clear();
        throw new WebSocketClientError(
          `websocket receive unknown data type ${typeof data}`
        );
      }
    };
  }

  Ready(): Promise<WebSocketClient> {
    return new Promise((resolve, reject) => {
      this._wsConn.onopen = () => {
        resolve(this);
      };
    });
  }

  private _onclose(e: ICloseEvent) {
    return new Promise((resolve, reject) => {
      resolve('websocket connection closed');
    });
  }

  removeInflightRequest(key: MessageId): MessageAction | undefined {
    let k = this.getHash(key);
    let v = _msgActionRegister.get(k);
    if (v) {
      v.timer && clearTimeout(v.timer);
      _msgActionRegister.delete(k);
      return v;
    }
  }

  removeInflightVersionRequest(): MessageAction[] {
    let actions: MessageAction[] = [];
    _msgActionRegister.forEach((v, k) => {
      if (k.startsWith('version')) {
        actions.push(v);
        v.timer && clearTimeout(v.timer);
        _msgActionRegister.delete(k);
      }
    });
    return actions;
  }

  close() {
    if (this._wsConn) {
      _msgActionRegister.clear();
      this._wsConn.close();
    } else {
      throw new WebSocketClientError('WebSocket connection is undefined.');
    }
  }

  readyState(): number {
    return this._wsConn.readyState;
  }

  sendMsg(message: string, key: MessageId, register: Boolean = true) {
    return new Promise((resolve, reject) => {
      if (this._wsConn && this._wsConn.readyState > 0) {
        if (register) {
          this._registerCallback(key, resolve, reject);
        }
        this._wsConn.send(message);
      } else {
        reject(
          new WebSocketQueryError(
            `WebSocket connection is not ready,status :${this._wsConn?.readyState}`
          )
        );
      }
    });
  }

  private _registerCallback(
    id: MessageId,
    res: (args: unknown) => void,
    rej: (reason: any) => void
  ) {
    _msgActionRegister.set(this.getHash(id), {
      reject: rej,
      resolve: res,
      timer: setTimeout(
        () =>
          rej(
            new WebSocketQueryError(
              `action:${id.action},req_id:${id.req_id} timeout with ${this._timeout} milliseconds`
            )
          ),
        this._timeout
      ),
    });
  }

  private getHash(key: MessageId): string {
    let k = key.action + '-' + key.req_id;
    if (key.id) {
      k += '-' + key.id;
    }
    return k;
  }

  configTimeout(ms: number) {
    this._timeout = ms;
  }
}
