"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketConnector = void 0;
const websocket_1 = require("websocket");
const wsError_1 = require("../common/wsError");
const wsEventCallback_1 = require("./wsEventCallback");
const log_1 = __importDefault(require("../common/log"));
const reqid_1 = require("../common/reqid");
class WebSocketConnector {
    // create ws
    constructor(url, timeout) {
        this._timeout = 5000;
        // return w3bsocket3
        if (url) {
            this._wsURL = url;
            let origin = url.origin;
            let pathname = url.pathname;
            let search = url.search;
            if (timeout) {
                this._timeout = timeout;
            }
            this._wsConn = new websocket_1.w3cwebsocket(origin.concat(pathname).concat(search), undefined, undefined, undefined, undefined, { maxReceivedFrameSize: 0x60000000, maxReceivedMessageSize: 0x60000000 });
            this._wsConn.onerror = function (err) { log_1.default.error(err.message); throw err; };
            this._wsConn.onclose = this._onclose;
            this._wsConn.onmessage = this._onmessage;
            this._wsConn._binaryType = "arraybuffer";
        }
        else {
            throw new wsError_1.WebSocketQueryError(wsError_1.ErrorCode.ERR_INVALID_URL, "websocket URL must be defined");
        }
    }
    async ready() {
        return new Promise((resolve, reject) => {
            let reqId = reqid_1.ReqId.getReqID();
            wsEventCallback_1.WsEventCallback.instance().registerCallback({ action: "websocket_connection", req_id: BigInt(reqId),
                timeout: this._timeout, id: BigInt(reqId) }, resolve, reject);
            this._wsConn.onopen = () => {
                log_1.default.debug("websocket connection opened");
                wsEventCallback_1.WsEventCallback.instance().handleEventCallback({ id: BigInt(reqId), action: "websocket_connection", req_id: BigInt(reqId) }, wsEventCallback_1.OnMessageType.MESSAGE_TYPE_CONNECTION, this);
            };
        });
    }
    async _onclose(e) {
        log_1.default.info("websocket connection closed");
    }
    _onmessage(event) {
        let data = event.data;
        log_1.default.debug("wsClient._onMessage()====" + (Object.prototype.toString.call(data)));
        if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') {
            let id = new DataView(data, 26, 8).getBigUint64(0, true);
            wsEventCallback_1.WsEventCallback.instance().handleEventCallback({ id: id, action: '', req_id: BigInt(0) }, wsEventCallback_1.OnMessageType.MESSAGE_TYPE_ARRAYBUFFER, data);
        }
        else if (Object.prototype.toString.call(data) === '[object Blob]') {
            data.arrayBuffer().then((d) => {
                let id = new DataView(d, 8, 8).getBigUint64(0, true);
                wsEventCallback_1.WsEventCallback.instance().handleEventCallback({ id: id, action: '', req_id: BigInt(0) }, wsEventCallback_1.OnMessageType.MESSAGE_TYPE_BLOB, d);
            });
        }
        else if (Object.prototype.toString.call(data) === '[object String]') {
            let msg = JSON.parse(data);
            log_1.default.debug("[_onmessage.stringType]==>:" + data);
            wsEventCallback_1.WsEventCallback.instance().handleEventCallback({ id: BigInt(0), action: msg.action, req_id: msg.req_id }, wsEventCallback_1.OnMessageType.MESSAGE_TYPE_STRING, msg);
        }
        else {
            throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_INVALID_MESSAGE_TYPE, `invalid message type ${Object.prototype.toString.call(data)}`);
        }
    }
    close() {
        if (this._wsConn) {
            this._wsConn.close();
        }
        else {
            throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, "WebSocket connection is undefined.");
        }
    }
    readyState() {
        return this._wsConn.readyState;
    }
    async sendMsgNoResp(message) {
        log_1.default.debug("[wsClient.sendMsgNoResp()]===>" + message);
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id);
        }
        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {
                this._wsConn.send(message);
                resolve();
            }
            else {
                reject(new wsError_1.WebSocketQueryError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `WebSocket connection is not ready,status :${this._wsConn?.readyState}`));
            }
        });
    }
    async sendMsg(message, register = true) {
        log_1.default.debug("[wsClient.sendMessage()]===>" + message);
        let msg = JSON.parse(message);
        if (msg.args.id !== undefined) {
            msg.args.id = BigInt(msg.args.id);
        }
        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {
                if (register) {
                    wsEventCallback_1.WsEventCallback.instance().registerCallback({ action: msg.action, req_id: msg.args.req_id,
                        timeout: this._timeout, id: msg.args.id === undefined ? msg.args.id : BigInt(msg.args.id) }, resolve, reject);
                }
                log_1.default.debug("[wsClient.sendMessage.msg]===>\n", message);
                this._wsConn.send(message);
            }
            else {
                reject(new wsError_1.WebSocketQueryError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `WebSocket connection is not ready,status :${this._wsConn?.readyState}`));
            }
        });
    }
    async sendBinaryMsg(reqId, action, message, register = true) {
        return new Promise((resolve, reject) => {
            if (this._wsConn && this._wsConn.readyState > 0) {
                if (register) {
                    wsEventCallback_1.WsEventCallback.instance().registerCallback({ action: action, req_id: reqId,
                        timeout: this._timeout, id: reqId }, resolve, reject);
                }
                log_1.default.debug("[wsClient.sendBinaryMsg()]===>" + reqId + action + message.byteLength);
                this._wsConn.send(message);
            }
            else {
                reject(new wsError_1.WebSocketQueryError(wsError_1.ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `WebSocket connection is not ready,status :${this._wsConn?.readyState}`));
            }
        });
    }
    configTimeout(ms) {
        this._timeout = ms;
    }
    getWsURL() {
        return this._wsURL;
    }
}
exports.WebSocketConnector = WebSocketConnector;
