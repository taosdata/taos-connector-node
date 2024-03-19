import { ICloseEvent, IMessageEvent, w3cwebsocket } from 'websocket';
import { ErrorCode, TDWebSocketClientError, WebSocketQueryError } from '../common/wsError'
import { MessageResp } from '../common/taosResult';
import { OnMessageType, WsEventCallback } from './wsEventCallback';

interface MessageId {
    action: string,
    req_id: bigint,
    id?: bigint
}

interface MessageAction {
    reject: Function,
    resolve: Function,
    timer: ReturnType<typeof setTimeout>,
    sendTime: number,
}

export class WebSocketConnector {
    private _wsConn: w3cwebsocket;
    private _wsURL: URL;
    _timeout = 5000;

    // create ws
    constructor(url: URL, timeout :number | undefined | null) {
        // return w3bsocket3
        if (url) {
            this._wsURL = url;
            let origin = url.origin;
            let pathname = url.pathname;
            let search = url.search;
            if (timeout) {
                this._timeout = timeout
            }
            this._wsConn = new w3cwebsocket(origin.concat(pathname).concat(search));

            this._wsConn.onerror = function (err: Error) { console.log(err.message); throw err }

            this._wsConn.onclose = this._onclose

            this._wsConn.onmessage = this._onmessage
            this._wsConn._binaryType = "arraybuffer"
        } else {
            throw new WebSocketQueryError(ErrorCode.ERR_INVALID_URL, "websocket URL must be defined")
        }
    }

    Ready(): Promise<WebSocketConnector> {
        return new Promise((resolve, reject) => {
            this._wsConn.onopen = () => {
                console.log("websocket connection opened")
                resolve(this);
            }
        })
    }

    private _onclose(e: ICloseEvent) {
        return new Promise((resolve, reject) => {
            resolve("websocket connection closed")
        })
    }


    private _onmessage(event: any) {
        let data = event.data;
        console.log("wsClient._onMessage()===="+ (Object.prototype.toString.call(data)))
        if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
            let id = new DataView(data, 8, 8).getBigUint64(0, true);
            WsEventCallback.Instance().HandleEventCallback({id:id, action:'', req_id:BigInt(0)}, 
                OnMessageType.MESSAGE_TYPE_ARRAYBUFFER, data);

        } else if (Object.prototype.toString.call(data) === '[object Blob]') {
            data.arrayBuffer().then((d: ArrayBuffer) => {
                let id = new DataView(d, 8, 8).getBigUint64(0, true);
                WsEventCallback.Instance().HandleEventCallback({id:id, action:'', req_id:BigInt(0)}, 
                    OnMessageType.MESSAGE_TYPE_BLOB, d);
            })

        } else if (Object.prototype.toString.call(data) === '[object String]') {
            let msg = JSON.parse(data)
            console.log("[_onmessage.stringType]==>:" + data);
            WsEventCallback.Instance().HandleEventCallback({id:BigInt(0), action:msg.action, req_id:msg.req_id}, 
                OnMessageType.MESSAGE_TYPE_STRING, msg);
        } else {
            throw new TDWebSocketClientError(ErrorCode.ERR_INVALID_MESSAGE_TYPE, 
                `invalid message type ${Object.prototype.toString.call(data)}`);
        }
    }

    close() {
        if (this._wsConn) {
            this._wsConn.close();
        } else {
            throw new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION, "WebSocket connection is undefined.")
        }
    }

    readyState(): number {
        return this._wsConn.readyState;
    }

    sendMsgNoResp(message: string):Promise<void> {
        console.log("[wsClient.sendMsgNoResp()]===>" + message)
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id)
        }

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {            
                this._wsConn.send(message)
                resolve()
            } else {
                reject(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_CONNECTION, 
                    `WebSocket connection is not ready,status :${this._wsConn?.readyState}`))
            }
        })
    }


    sendMsg(message: string, register: Boolean = true) {
        console.log("[wsClient.sendMessage()]===>" + message)
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id)
        }

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {
                if (register) {
                    WsEventCallback.Instance().RegisterCallback({ action: msg.action, req_id: msg.args.req_id, 
                        timeout:this._timeout, id: msg.args.id === undefined ? msg.args.id : BigInt(msg.args.id) }, 
                        resolve, reject);
                }
                console.log("[wsClient.sendMessage.msg]===>\n", message)
                this._wsConn.send(message)
            } else {
                reject(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_CONNECTION, 
                    `WebSocket connection is not ready,status :${this._wsConn?.readyState}`))
            }
        })
    }

    public configTimeout(ms: number) {
        this._timeout = ms;
    }

    public getWsURL(): URL {
        return this._wsURL;
    }
}

