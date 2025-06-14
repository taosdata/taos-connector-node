import { Mutex } from "async-mutex";
import { ErrorCode, TDWebSocketClientError, WebSocketQueryError } from "../common/wsError";
import { MessageResp } from "../common/taosResult";
import logger from "../common/log";

interface MessageId {
    action: string,
    req_id: bigint,
    id?: bigint,
    timeout?:number
}

interface MessageAction {
    reject: Function,
    resolve: Function,
    timer: ReturnType<typeof setTimeout>,
    sendTime: number,
}

export enum OnMessageType {
    MESSAGE_TYPE_ARRAYBUFFER = 1,
    MESSAGE_TYPE_BLOB = 2,
    MESSAGE_TYPE_STRING = 3,
    MESSAGE_TYPE_CONNECTION = 4
}

const eventMutex = new Mutex();
export class WsEventCallback {
    private static _instance?:WsEventCallback;
    private static _msgActionRegister: Map<MessageId, MessageAction> = new Map();
    private constructor() {
    }

    public static instance():WsEventCallback {
        if (!WsEventCallback._instance) {
            WsEventCallback._instance = new WsEventCallback();
        }
        return WsEventCallback._instance;
    }

    async registerCallback(id: MessageId, res: (args: unknown) => void, rej: (reason: any) => void) {
        let release = await eventMutex.acquire()
        try {
            WsEventCallback._msgActionRegister.set(id,
                {
                    sendTime: new Date().getTime(),
                    reject: rej,
                    resolve: res,
                    timer: setTimeout(() => rej(new WebSocketQueryError(ErrorCode.ERR_WEBSOCKET_QUERY_TIMEOUT, 
                        `action:${id.action},req_id:${id.req_id} timeout with ${id.timeout} milliseconds`)), id.timeout)
                });            
        } finally {
            release()  
        }          
    }

    async handleEventCallback(msg: MessageId, messageType:OnMessageType, data:any) {
        let action: MessageAction | any = undefined;
        let release = await eventMutex.acquire()
        logger.debug(`HandleEventCallback get lock msg=${msg}, ${messageType}`)
        logger.debug(WsEventCallback._msgActionRegister)
        try {
            for (let [k, v] of  WsEventCallback._msgActionRegister) {
                if (messageType == OnMessageType.MESSAGE_TYPE_ARRAYBUFFER) {
                    if (k.id == msg.id || k.req_id == msg.id) {
                        action = v
                        WsEventCallback._msgActionRegister.delete(k)
                        break;
                    }               
                } else if (messageType == OnMessageType.MESSAGE_TYPE_BLOB) {
                    if (k.id == msg.id || k.req_id == msg.id) {
                        action = v
                        WsEventCallback._msgActionRegister.delete(k)
                        break;
                    } 
                } else if (messageType == OnMessageType.MESSAGE_TYPE_STRING) {
                    if (k.req_id == msg.req_id && k.action == msg.action) {
                        action = v
                        WsEventCallback._msgActionRegister.delete(k)
                        break;
                    }
                } else if (messageType == OnMessageType.MESSAGE_TYPE_CONNECTION) {
                    if (k.req_id == msg.req_id && k.action == msg.action) {
                        action = v
                        WsEventCallback._msgActionRegister.delete(k)
                        break;
                    }
                }
            }           
        } finally {
            release()
        }

        if (action) {
            let currTime = new Date().getTime()
            let resp:MessageResp = {
                msg:data,
                totalTime:Math.abs(currTime - action.sendTime),
            };
            action.resolve(resp);
        } else {
            logger.error("no find callback msg:=", msg)
            throw new TDWebSocketClientError(ErrorCode.ERR_WS_NO_CALLBACK, 
                "no callback registered for fetch_block with req_id=" + msg.req_id + " action" + msg.action);
        }    
    }

}