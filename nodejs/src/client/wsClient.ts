import JSONBig from 'json-bigint';
import { WebSocketConnector } from './wsConnector';
import { WebSocketConnectionPool } from './wsConnectorPool'
import { parseBlock, MessageResp, TaosResult } from '../common/taosResult';
import { ErrorCode, TDWebSocketClientError, WebSocketInterfaceError, WebSocketQueryError } from '../common/wsError';
import {
    WSVersionResponse,
    WSFetchBlockResponse,
    WSQueryResponse,
    WSFetchResponse,
} from './wsResponse';
import { ReqId } from '../common/reqid';
import logger from '../common/log';


export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?:number | undefined | null;
    private readonly _url:URL;

    constructor(url: URL, timeout ?:number | undefined | null) {
        this.checkURL(url);
        this._url = url;
        this._timeout = timeout;
    
    }

    connect(database?: string | undefined | null): Promise<void> {
        let _db = this._url.pathname.split('/')[3];
        if (database) {
            _db = database;
        }
        
        let connMsg = {
            action: 'conn',
            args: {
                req_id: ReqId.getReqID(),
                user: this._url.username,
                password: this._url.password,
                db: _db,
            },
        };
        
        return new Promise(async (resolve, reject) => {
            try {
                this._wsConnector = await WebSocketConnectionPool.Instance().getConnection(this._url, this._timeout);
                if (this._wsConnector.readyState() > 0) {
                    resolve()
                } else {
                    await this._wsConnector.Ready(); 
                    let result:any = await this._wsConnector.sendMsg(JSON.stringify(connMsg))
                    if (result.msg.code  == 0) {
                        resolve();
                    }else {
                        reject(new WebSocketQueryError(result.msg.code, result.msg.message));
                    }
                } 

            } catch(e:any) {
                reject(e)
            }
            
        });
    }

    execNoResp(queryMsg: string): Promise<void> {
        return new Promise((resolve, reject) => {
            logger.debug('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsgNoResp(queryMsg)
                .then(() => {resolve();})
                .catch((e) => reject(e));
            }else{
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"))
            }

        });
    }

    // need to construct Response.
    exec(queryMsg: string, bSqlQuery:boolean = true): Promise<any> {
        return new Promise((resolve, reject) => {
            // console.log('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(queryMsg).then((e: any) => {
                    if (e.msg.code == 0) {
                        if (bSqlQuery) {
                            resolve(new WSQueryResponse(e));
                        }else{
                            resolve(e)
                        }
                    } else {
                        reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
                    }
                }).catch((e) => {reject(e);});               
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"))
            }

        });
    }


    // need to construct Response.
    sendBinaryMsg(reqId: bigint, action:string, message: ArrayBuffer, bSqlQuery:boolean = true): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendBinaryMsg(reqId, action, message).then((e: any) => {
                    if (e.msg.code == 0) {
                        if (bSqlQuery) {
                            resolve(new WSQueryResponse(e));
                        }else{
                            resolve(e)
                        }
                    } else {
                        reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
                    }
                }).catch((e) => {reject(e);});               
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"))
            }

        });
    }


    getState() {
        if (this._wsConnector) {
            return this._wsConnector.readyState();
        }
        return -1;
        
    }

    Ready(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                this._wsConnector = await WebSocketConnectionPool.Instance().getConnection(this._url, this._timeout);
                if (this._wsConnector.readyState() <= 0) {
                    await this._wsConnector.Ready()
                }
                logger.debug("ready status ", this._url, this._wsConnector.readyState())  
                resolve()              
            }catch(e: any) {
                reject(e)
            }
        });
    }

    fetch(res: WSQueryResponse): Promise<WSFetchResponse> {
        let fetchMsg = {
            action: 'fetch',
            args: {
                req_id: ReqId.getReqID(),
                id: res.id,
            },
        };
        // console.log("[wsQueryInterface.fetch()]===>wsQueryResponse\n")
        // console.log(res)
        return new Promise((resolve, reject) => {
        let jsonStr = JSONBig.stringify(fetchMsg);
        logger.debug('[wsQueryInterface.fetch.fetchMsg]===>' + jsonStr);
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(jsonStr).then((e: any) => {
                    if (e.msg.code == 0) {
                        resolve(new WSFetchResponse(e));
                    } else {
                        reject(new WebSocketInterfaceError(e.msg.code, e.msg.message));
                    }
                }).catch((e) => {reject(e);});
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
            
        });
    }

    fetchBlock(fetchResponse: WSFetchResponse, taosResult: TaosResult): Promise<TaosResult> {
        let fetchBlockMsg = {
            action: 'fetch_block',
            args: {
                req_id: ReqId.getReqID(),
                id: fetchResponse.id,
            },
        };

        return new Promise((resolve, reject) => {
            let jsonStr = JSONBig.stringify(fetchBlockMsg);
            // console.log("[wsQueryInterface.fetchBlock.fetchBlockMsg]===>" + jsonStr)
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(jsonStr).then((e: any) => {
                    let resp:MessageResp = e
                    taosResult.AddTotalTime(resp.totalTime)
                    resolve(parseBlock(fetchResponse.rows, new WSFetchBlockResponse(resp.msg), taosResult));
                    // if retrieve JSON then reject with message
                    // else is binary , so parse raw block to TaosResult
                }).catch((e) => reject(e));
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }

    sendMsg(msg:string): Promise<any> {
        return new Promise((resolve, reject) => {
            // console.log("[wsQueryInterface.sendMsg]===>" + msg)
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(msg).then((e: any) => {
                    resolve(e);
                }).catch((e) => reject(e));
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }

    freeResult(res: WSQueryResponse) {
        let freeResultMsg = {
        action: 'free_result',
        args: {
            req_id: ReqId.getReqID(),
            id: res.id,
        },
        };
        return new Promise((resolve, reject) => {
            let jsonStr = JSONBig.stringify(freeResultMsg);
            // console.log("[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr)
            if (this._wsConnector && this._wsConnector.readyState() > 0) {
                this._wsConnector.sendMsg(jsonStr, false)
                .then((e: any) => {resolve(e);})
                .catch((e) => reject(e));
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }

    version(): Promise<string> {
        let versionMsg = {
            action: 'version',
            args: {
                req_id: ReqId.getReqID()
            },
        };
        return new Promise(async (resolve, reject) => {
            if (this._wsConnector) {
                try {
                    if (this._wsConnector.readyState() <= 0) {
                        await this._wsConnector.Ready()
                    }
                    let result:any = await this._wsConnector.sendMsg(JSONBig.stringify(versionMsg)); 
                    if (result.msg.code == 0) {
                        resolve(new WSVersionResponse(result).version);
                    } else {
                        reject(new WebSocketInterfaceError(result.msg.code, result.msg.message));
                    }                   
                } catch (e:any) {
                    reject(e);
                }
            }
        });
    }

    close() {
        if (this._wsConnector) {
            WebSocketConnectionPool.Instance().releaseConnection(this._wsConnector)
            this._wsConnector = undefined
            // this._wsConnector.close();
        }
       
    }

    checkURL(url: URL) {
        // Assert is cloud url
        if (!url.searchParams.has('token')) {
            if (!(url.username || url.password)) {
                throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_AUTHENTICATION, 'invalid url, password or username needed.');
            }
        }
    }

}
