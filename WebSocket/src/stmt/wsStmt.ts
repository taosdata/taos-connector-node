import { WsClient } from '../client/wsClient';
import { ErrorCode, TDWebSocketClientError, TaosResultError, WebSocketInterfaceError } from '../common/wsError';
import { WSConfig } from '../common/config'
import { GetUrl } from '../common/utils';
import { WsStmtQueryResponse, StmtMessageInfo } from './wsProto';

export class WsStmtConnect {
    private _wsClient: WsClient | null;
    private _config:WSConfig;
    private _bClose = false
    constructor(wsConfig: WSConfig) {
        let url = GetUrl(wsConfig)
        this._config = wsConfig
        this._wsClient = new WsClient(url, wsConfig.GetTimeOut());
    }

    static NewConnector(wsConfig:WSConfig):WsStmtConnect {
        if (!wsConfig.GetUrl()) {
            throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
        }
        return new WsStmtConnect(wsConfig); 
    }

    Init() : Promise<WsStmt> {
        return this.open()
    }

    State(){
        if (this._wsClient) {
            return this._wsClient.getState();
        }
        return 0;
    }

    Close() {
        if (!this._bClose && this._wsClient) {
            this._wsClient.close();
            this._bClose = true
        }
    }

    private async open():Promise<WsStmt> {
        return new Promise(async (resolve, reject) => {
            if (this._wsClient) {
                try{
                    await this._wsClient.connect(this._config.GetDb());
                    let wsStmt = new WsStmt(this._wsClient);
                    await wsStmt.Init();
                    this._bClose = false;
                    resolve(wsStmt);
                } catch(e) {
                    console.log(e)
                    reject(e);
                }
            }else{
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
            }
        });
    }
}

export class WsStmt {
    private _wsClient: WsClient;
    private _req_id = 3000000;
    private stmt_id: number | undefined | null;
    private lastAffected: number | undefined | null;
    constructor(wsClient: WsClient) {
        this._wsClient = wsClient;
    }

    Init(reqId?:number): Promise<void> {
        return this.init(reqId);
    }

    Prepare(sql: string): Promise<void> {
        let queryMsg = {
            action: 'prepare',
            args: {
                req_id: this.getReqID(),
                sql: sql,
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    SetTableName(tableName: string): Promise<void> {
        let queryMsg = {
            action: 'set_table_name',
            args: {
                req_id: this.getReqID(),
                name: tableName,
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    SetTags(tags: Array<any>): Promise<void> {
        let queryMsg = {
            action: 'set_tags',
            args: {
                req_id: this.getReqID(),
                tags: tags,
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    BindParam(paramArray: Array<Array<any>>): Promise<void> {
        let queryMsg = {
            action: 'bind',
            args: {
                req_id: this.getReqID(),
                columns: paramArray,
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    Batch(): Promise<void> {
        let queryMsg = {
            action: 'add_batch',
            args: {
                req_id: this.getReqID(),
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    /**
     * return client version.
     */
    Version(): Promise<string> {
        return this._wsClient.version();
    }

    Exec(): Promise<void> {
        let queryMsg = {
            action: 'exec',
            args: {
                req_id: this.getReqID(),
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    GetLastAffected() {
        return this.lastAffected;
    }

    Close(): Promise<void> {
        let queryMsg = {
            action: 'close',
            args: {
                req_id: this.getReqID(),
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg, false);
    }
    
    private getReqID(reqId?:number) {
        if (reqId) {
            return reqId;
        }
        if (this._req_id == 3999999) {
            this._req_id = 3000000;
        } else {
            this._req_id += 1;
        }
        return this._req_id;
    }

    private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<void> {
        try {
            console.log('stmt execute result:', queryMsg);
            let reqMsg = JSON.stringify(queryMsg);
            console.log('stmt execute result:', queryMsg);
            if (register) {
                let result = await this._wsClient.exec(reqMsg, false);
                let resp = new WsStmtQueryResponse(result)
                if (resp.stmt_id) {
                this.stmt_id = resp.stmt_id;
                }

                if (resp.affected) {
                this.lastAffected = resp.affected
                }
                
                console.log('stmt execute result:', resp);     
            }else{
                await this._wsClient.execNoResp(reqMsg);
                this.stmt_id = null
                this.lastAffected = null
            }
            return
        } catch (e:any) {
            throw new TaosResultError(e.code, e.message);
        }
    }

    private init(reqId?: number):Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (this._wsClient) {
                try{
                    if (this._wsClient.getState() <= 0) {
                        await this._wsClient.connect();
                    }
                    let queryMsg = {
                        action: 'init',
                        args: {
                            req_id: this.getReqID(reqId),
                        },
                    };
                    await this.execute(queryMsg);
                    resolve()
                } catch(e) {
                    reject(e);
                }
            }else{
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
            }
        });
    }
    
}
