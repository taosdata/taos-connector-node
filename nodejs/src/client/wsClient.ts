import JSONBig from 'json-bigint';
import { WebSocketConnector } from './wsConnector';
import { WebSocketConnectionPool } from './wsConnectorPool'
import { ErrorCode, TDWebSocketClientError, WebSocketInterfaceError, WebSocketQueryError } from '../common/wsError';
import {
    WSVersionResponse,
    WSQueryResponse,
} from './wsResponse';
import { ReqId } from '../common/reqid';
import logger from '../common/log';
import { safeDecodeURIComponent, compareVersions} from '../common/utils';

export class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?:number | undefined | null;
    private readonly _url:URL;
    private static readonly _minVersion = "3.3.2.0";

    constructor(url: URL, timeout ?:number | undefined | null) {
        this.checkURL(url);
        this._url = url;
        this._timeout = timeout;
    
    }

    async connect(database?: string | undefined | null): Promise<void> {
        let _db = this._url.pathname.split('/')[3];
        if (database) {
            _db = database;
        }
        
        let connMsg = {
            action: 'conn',
            args: {
                req_id: ReqId.getReqID(),
                user: safeDecodeURIComponent(this._url.username),
                password: safeDecodeURIComponent(this._url.password),
                db: _db,
            },
        };
        
        this._wsConnector = await WebSocketConnectionPool.instance().getConnection(this._url, this._timeout);
        if (this._wsConnector.readyState() === 1) {
            return;
        } 
        try {
            await this._wsConnector.ready();
            let result: any = await this._wsConnector.sendMsg(JSON.stringify(connMsg))
            if (result.msg.code  == 0) {
                return;
            }
            await this.close();
            throw(new WebSocketQueryError(result.msg.code, result.msg.message));            
       
        } catch (e: any) {
            await this.close();
            logger.error(`connection creation failed, url: ${this._url}, code:${e.code}, msg:${e.message}`);
            throw(new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}, code:${e.code}, msg:${e.message}`));
        }
     

    }

    async execNoResp(queryMsg: string): Promise<void> {
        logger.debug('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
        if (this._wsConnector && this._wsConnector.readyState() === 1) {
            await this._wsConnector.sendMsgNoResp(queryMsg)
            return;
        }
        throw(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"))
    }

    // need to construct Response.
    async exec(queryMsg: string, bSqlQuery:boolean = true): Promise<any> {
        return new Promise((resolve, reject) => {
            logger.debug('[wsQueryInterface.query.queryMsg]===>' + queryMsg);
            if (this._wsConnector && this._wsConnector.readyState() === 1) {
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
    async sendBinaryMsg(reqId: bigint, action:string, message: ArrayBuffer, bSqlQuery:boolean = true, bResultBinary: boolean = false): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this._wsConnector && this._wsConnector.readyState() === 1) {
                this._wsConnector.sendBinaryMsg(reqId, action, message).then((e: any) => {
                    if (bResultBinary) {
                        resolve(e);
                    }
                    
                    if (e.msg.code == 0) {
                        if (bSqlQuery) {
                            resolve(new WSQueryResponse(e));
                        }else{
                            resolve(e);
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

    async ready(): Promise<void> {
        try {
            this._wsConnector = await WebSocketConnectionPool.instance().getConnection(this._url, this._timeout);
            if (this._wsConnector.readyState() !== 1) {
                await this._wsConnector.ready()
            }
            logger.debug("ready status ", this._url, this._wsConnector.readyState())  
            return;             
        } catch (e: any) {
            logger.error(`connection creation failed, url: ${this._url}, code: ${e.code}, message: ${e.message}`);
            throw(new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}, code: ${e.code}, message: ${e.message}`));
        }  
             
    }

    async sendMsg(msg:string): Promise<any> {
        return new Promise((resolve, reject) => {
            logger.debug("[wsQueryInterface.sendMsg]===>" + msg)
            if (this._wsConnector && this._wsConnector.readyState() === 1) {
                this._wsConnector.sendMsg(msg).then((e: any) => {
                    resolve(e);
                }).catch((e) => reject(e));
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }

    async freeResult(res: WSQueryResponse) {
        let freeResultMsg = {
        action: 'free_result',
        args: {
            req_id: ReqId.getReqID(),
            id: res.id,
        },
        };
        return new Promise((resolve, reject) => {
            let jsonStr = JSONBig.stringify(freeResultMsg);
            logger.debug("[wsQueryInterface.freeResult.freeResultMsg]===>" + jsonStr)
            if (this._wsConnector && this._wsConnector.readyState() === 1) {
                this._wsConnector.sendMsg(jsonStr, false)
                .then((e: any) => {resolve(e);})
                .catch((e) => reject(e));
            } else {
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect"));
            }
        });
    }

    async version(): Promise<string> {
        let versionMsg = {
            action: 'version',
            args: {
                req_id: ReqId.getReqID()
            },
        };
        
        if (this._wsConnector) {
            try {
                if (this._wsConnector.readyState() <= 0) {
                    await this._wsConnector.ready();
                }
                let result:any = await this._wsConnector.sendMsg(JSONBig.stringify(versionMsg)); 
                if (result.msg.code == 0) {
                    return new WSVersionResponse(result).version;
                } 
                throw(new WebSocketInterfaceError(result.msg.code, result.msg.message));                
            } catch (e: any) {
                logger.error(`connection creation failed, url: ${this._url}, code: ${e.code}, message: ${e.message}`);
                throw(new TDWebSocketClientError(ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL, `connection creation failed, url: ${this._url}, code: ${e.code}, message: ${e.message}`));
            }

                               
        }
        throw(ErrorCode.ERR_CONNECTION_CLOSED, "invalid websocket connect");
    }

    async close():Promise<void> {
        if (this._wsConnector) {
            await WebSocketConnectionPool.instance().releaseConnection(this._wsConnector)
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

    async checkVersion() {
        let version = await this.version();
        let result = compareVersions(version, WsClient._minVersion);
        if (result < 0) {
            logger.error(`TDengine version is too low, current version: ${version}, minimum required version: ${WsClient._minVersion}`);
            throw(new WebSocketQueryError(ErrorCode.ERR_TDENIGNE_VERSION_IS_TOO_LOW, `Version mismatch. The minimum required TDengine version is ${WsClient._minVersion}`));  
        }
    }
}
