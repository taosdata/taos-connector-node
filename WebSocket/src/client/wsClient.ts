import { ICloseEvent, IMessageEvent, w3cwebsocket } from 'websocket';
import { ErrorCode, TDWebSocketClientError, WebSocketQueryError } from '../common/wsError'
import { MessageResp } from '../common/taosResult';

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

var _msgActionRegister: Map<MessageId, MessageAction> = new Map();

export class TDWebSocketClient {
    private _wsConn: w3cwebsocket;
    _wsURL: URL;
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

    Ready(): Promise<TDWebSocketClient> {
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
        // console.log("[wsClient._onMessage()._msgActionRegister]\n")
        // console.log(_msgActionRegister)

        console.log("wsClient._onMessage()===="+ (Object.prototype.toString.call(data)))
        if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
            let id = new DataView(data, 8, 8).getBigUint64(0, true)
            let action: MessageAction | any = undefined;
            _msgActionRegister.forEach((v: MessageAction, k: MessageId) => {
                if (k.id == id || k.req_id == id) {
                    action = v
                    _msgActionRegister.delete(k)
                }
            })
            if (action) {
                let currTime = new Date().getTime()
                let resp:MessageResp = {
                    msg:data,
                    totalTime:Math.abs(currTime - action.sendTime),
                };
                action.resolve(resp);
            }
            else {
                _msgActionRegister.clear()
                throw new TDWebSocketClientError(ErrorCode.ERR_WS_NO_CALLBACK, `no callback registered for fetch_block with id=${id}`);
            }

        } else if (Object.prototype.toString.call(data) === '[object Blob]') {
            data.arrayBuffer().then((d: ArrayBuffer) => {
                let id = new DataView(d, 8, 8).getBigUint64(0, true)
                let action: MessageAction | any = undefined;

                _msgActionRegister.forEach((v: MessageAction, k: MessageId) => {
                    if (k.id == id) {
                        action = v
                        _msgActionRegister.delete(k)
                    }
                })
                if (action) {
                    let currTime = new Date().getTime()
                    let resp:MessageResp = {
                        msg:d,
                        totalTime:Math.abs(currTime - action.sendTime),
                    };
                    action.resolve(resp);
                }
                else {
                    _msgActionRegister.clear()
                    throw new TDWebSocketClientError(ErrorCode.ERR_WS_NO_CALLBACK, `no callback registered for fetch_block with id=${id}`);
                }
            })

        } else if (Object.prototype.toString.call(data) === '[object String]') {
            let msg = JSON.parse(data)
            console.log("[_onmessage.stringType]==>:" + data);
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
                let currTime = new Date().getTime()
                let resp:MessageResp = {
                    msg:msg,
                    totalTime:Math.abs(currTime - action.sendTime),
                };
                // console.log("resp", resp, action.sendTime, currTime)
                action.resolve(resp);
            }
            else {
                _msgActionRegister.clear()
                throw new TDWebSocketClientError(ErrorCode.ERR_WS_NO_CALLBACK, `no callback registered for ${msg.action} with req_id=${msg.req_id}`);
            }
        } else {
            _msgActionRegister.clear()
            throw new TDWebSocketClientError(ErrorCode.ERR_INVALID_MESSAGE_TYPE, `invalid message type ${Object.prototype.toString.call(data)}`)
        }
    }

    close() {
        if (this._wsConn) {
            _msgActionRegister.clear();
            this._wsConn.close();
        } else {
            throw new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION, "WebSocket connection is undefined.")
        }
    }

    readyState(): number {
        return this._wsConn.readyState;
    }

    sendMsgNoResp(message: string):Promise<Boolean> {
        console.log("[wsClient.sendMsgNoResp()]===>" + message)
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id)
        }
        // console.log("[wsClient.sendMsgNoResp.msg]===>\n", msg)

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {            
                this._wsConn.send(message)
                resolve(true)
            } else {
                reject(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_CONNECTION, `WebSocket connection is not ready,status :${this._wsConn?.readyState}`))
            }
        })
    }


    sendMsg(message: string, register: Boolean = true) {
        console.log("[wsClient.sendMessage()]===>" + message)
        let msg = JSON.parse(message);
        // console.log(msg.args.req_id)
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id)
        }
        // console.log("[wsClient.sendMessage.msg]===>\n", msg)

        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {
                if (register) {
                    this._registerCallback({ action: msg.action, req_id: msg.args.req_id, id: msg.args.id === undefined ? msg.args.id : BigInt(msg.args.id) }, resolve, reject)
                    // console.log("[wsClient.sendMessage._msgActionRegister]===>\n", _msgActionRegister)
                }
                
                this._wsConn.send(message)
            } else {
                reject(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_CONNECTION, `WebSocket connection is not ready,status :${this._wsConn?.readyState}`))
            }
        })
    }

    private _registerCallback(id: MessageId, res: (args: unknown) => void, rej: (reason: any) => void) {
        _msgActionRegister.set(id,
            {
                sendTime: new Date().getTime(),
                reject: rej,
                resolve: res,
                timer: setTimeout(() => rej(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_QUERY_TIMEOUT, `action:${id.action},req_id:${id.req_id} timeout with ${this._timeout} milliseconds`)), this._timeout)
            })
    }

    configTimeout(ms: number) {
        this._timeout = ms;
    }

}

