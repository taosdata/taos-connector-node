"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsEventCallback = exports.OnMessageType = void 0;
const async_mutex_1 = require("async-mutex");
const wsError_1 = require("../common/wsError");
const log_1 = __importDefault(require("../common/log"));
var OnMessageType;
(function (OnMessageType) {
    OnMessageType[OnMessageType["MESSAGE_TYPE_ARRAYBUFFER"] = 1] = "MESSAGE_TYPE_ARRAYBUFFER";
    OnMessageType[OnMessageType["MESSAGE_TYPE_BLOB"] = 2] = "MESSAGE_TYPE_BLOB";
    OnMessageType[OnMessageType["MESSAGE_TYPE_STRING"] = 3] = "MESSAGE_TYPE_STRING";
    OnMessageType[OnMessageType["MESSAGE_TYPE_CONNECTION"] = 4] = "MESSAGE_TYPE_CONNECTION";
})(OnMessageType || (exports.OnMessageType = OnMessageType = {}));
const eventMutex = new async_mutex_1.Mutex();
class WsEventCallback {
    constructor() {
    }
    static instance() {
        if (!WsEventCallback._instance) {
            WsEventCallback._instance = new WsEventCallback();
        }
        return WsEventCallback._instance;
    }
    async registerCallback(id, res, rej) {
        let release = await eventMutex.acquire();
        try {
            WsEventCallback._msgActionRegister.set(id, {
                sendTime: new Date().getTime(),
                reject: rej,
                resolve: res,
                timer: setTimeout(() => rej(new wsError_1.WebSocketQueryError(wsError_1.ErrorCode.ERR_WEBSOCKET_QUERY_TIMEOUT, `action:${id.action},req_id:${id.req_id} timeout with ${id.timeout} milliseconds`)), id.timeout)
            });
        }
        finally {
            release();
        }
    }
    async handleEventCallback(msg, messageType, data) {
        let action = undefined;
        log_1.default.debug("HandleEventCallback msg=", msg, messageType);
        let release = await eventMutex.acquire();
        log_1.default.debug("HandleEventCallback get lock msg=", msg, messageType);
        log_1.default.debug(WsEventCallback._msgActionRegister);
        try {
            for (let [k, v] of WsEventCallback._msgActionRegister) {
                if (messageType == OnMessageType.MESSAGE_TYPE_ARRAYBUFFER) {
                    if (k.id == msg.id || k.req_id == msg.id) {
                        action = v;
                        WsEventCallback._msgActionRegister.delete(k);
                        break;
                    }
                }
                else if (messageType == OnMessageType.MESSAGE_TYPE_BLOB) {
                    if (k.id == msg.id || k.req_id == msg.id) {
                        action = v;
                        WsEventCallback._msgActionRegister.delete(k);
                        break;
                    }
                }
                else if (messageType == OnMessageType.MESSAGE_TYPE_STRING) {
                    if (k.req_id == msg.req_id && k.action == msg.action) {
                        action = v;
                        WsEventCallback._msgActionRegister.delete(k);
                        break;
                    }
                }
                else if (messageType == OnMessageType.MESSAGE_TYPE_CONNECTION) {
                    if (k.req_id == msg.req_id && k.action == msg.action) {
                        action = v;
                        WsEventCallback._msgActionRegister.delete(k);
                        break;
                    }
                }
            }
        }
        finally {
            release();
        }
        if (action) {
            let currTime = new Date().getTime();
            let resp = {
                msg: data,
                totalTime: Math.abs(currTime - action.sendTime),
            };
            action.resolve(resp);
        }
        else {
            log_1.default.error("no find callback msg:=", msg);
            throw new wsError_1.TDWebSocketClientError(wsError_1.ErrorCode.ERR_WS_NO_CALLBACK, "no callback registered for fetch_block with req_id=" + msg.req_id + " action" + msg.action);
        }
    }
}
exports.WsEventCallback = WsEventCallback;
WsEventCallback._msgActionRegister = new Map();
