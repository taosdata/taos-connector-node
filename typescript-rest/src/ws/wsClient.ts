
import { ICloseEvent, IMessageEvent, w3cwebsocket } from "websocket";
import { TDWebSocketClientError, WebSocketQueryError } from './wsError'

interface MessageId {
    action: string,
    req_id: BigInt,
}

interface MessageAction {
    reject: Function,
    resolve: Function,
    timer: ReturnType<typeof setTimeout>,
}

var _msgActionRegister: Map<MessageId, MessageAction> = new Map();


export class TDWebSocketClient {
    private _wsConn: w3cwebsocket;
    _wsURL: URL;
    _timeout = 5000;

    // create ws
    constructor(url: URL) {

        // return w3bsocket3
        if (url) {
            this._wsURL = url;
            let origin = url.origin;
            let pathname = url.pathname;
            let search = url.search;

            this._wsConn = new w3cwebsocket(origin.concat(pathname).concat(search));

            // this._wsConn.onopen = this._onopen

            this._wsConn.onerror = function (err: Error) { throw err }

            this._wsConn.onclose = this._onclose

            this._wsConn.onmessage = this._onmessage
        } else {
            throw new WebSocketQueryError("websocket URL must be defined")
        }


    }

    Ready(): Promise<TDWebSocketClient> {
        return new Promise((resolve, reject) => {
            this._wsConn.onopen = () => {
                console.log("websocket connection opened")
                resolve(this);
            }
        })
    }

    private _onclose(e: ICloseEvent) {
        console.log("websocket connection closed")
    }

    private _onmessage(event: IMessageEvent) {
        let data = event.data;
        if ((data instanceof Buffer)) {
            console.log("Buffer:" + typeof data)
        } else if (data instanceof ArrayBuffer) {

           console.log(new DataView(data, 0, data.byteLength));
            let req_id = BigInt(2)
            let a = new DataView(data, 8, 8);
            console.log(a.getUint8(0))
            console.log(a.getUint8(1))
            console.log(a.getUint8(2))
            console.log(a.getUint8(3))
            console.log(a.getUint8(4))
            console.log(a.getUint8(5))
            console.log(a.getUint8(6))
            console.log(a.getUint8(7))
            console.log(a.getBigUint64(0,true))


            console.log("req_id"+req_id);
            let action: MessageAction | any = undefined;

            _msgActionRegister.forEach((v: MessageAction, k: MessageId) => {
                if (k.req_id == req_id) {
                    action = v
                    _msgActionRegister.delete(k)
                }
            })
            if (action) {
                action.resolve(data);
            }
            else {
                throw new TDWebSocketClientError(`no callback registered for fetch_block with req_id=${req_id}`);
            }

        }
        else {
            let msg = JSON.parse(data)
            console.log("onMessage:" + JSON.stringify(msg));
            let action: MessageAction | any = undefined;

            _msgActionRegister.forEach((v: MessageAction, k: MessageId) => {
                if (k.action == 'version') {
                    action = v
                    _msgActionRegister.delete(k)
                }
                if (k.req_id == msg.req_id && k.action == msg.action) {
                    action = v
                    _msgActionRegister.delete(k)
                }
            })
            if (action) {
                action.resolve(msg);
            }
            else {
                throw new TDWebSocketClientError(`no callback registered for ${msg.action} with req_id=${msg.req_id}` );
            }
        }
    }

    close() {
        if (this._wsConn) {
            _msgActionRegister.clear();
            this._wsConn.close();
        } else {
            throw new TDWebSocketClientError("WebSocket connection is undefined.")
        }
    }

    readyState(): number {
        return this._wsConn.readyState;
    }

    sendMsg(message: string) {
        let msg = JSON.parse(message);
        return new Promise((resolve, reject) => {
            this._registerCallback({ action: msg.action, req_id: msg.args.req_id }, resolve, reject)
            if (this._wsConn && this._wsConn.readyState > 0) {
                this._wsConn.send(message)
            } else {
                reject(new WebSocketQueryError(`WebSocket connection is not ready,status :${this._wsConn?.readyState}`))
            }
        })
    }

    private _registerCallback(id: MessageId, res: (args: unknown) => void, rej: (reason: any) => void) {
        console.log(id)
        _msgActionRegister.set(id,
            {
                reject: rej,
                resolve: res,
                timer: setTimeout(() => rej(new WebSocketQueryError(`action:${id.action},req_id:${id.req_id} timeout with ${this._timeout} milliseconds`)), this._timeout)
            })
    }

    setTimeout(waitTime: number) {
        this._timeout = waitTime;
    }

}

