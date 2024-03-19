import { WsClient } from '../client/wsClient';
import { ErrorCode, TDWebSocketClientError, TaosResultError } from '../common/wsError';
import { WsStmtQueryResponse, StmtMessageInfo } from './wsProto';
import { ReqId } from '../common/reqid';

export class WsStmt {
    private _wsClient: WsClient;
    private stmt_id: number | undefined | null;

    private lastAffected: number | undefined | null;
    private constructor(wsClient: WsClient) {
        this._wsClient = wsClient;
    }

    static NewStmt(wsClient: WsClient, reqId?:number): Promise<WsStmt> {
        let wsStmt = new WsStmt(wsClient)
        return wsStmt.init(reqId);
    }

    Prepare(sql: string): Promise<void> {
        let queryMsg = {
            action: 'prepare',
            args: {
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
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
                req_id: ReqId.getReqID(),
                stmt_id: this.stmt_id,
            },
        };
        return this.execute(queryMsg, false);
    }

    public getStmtId(): number | undefined | null {
        return this.stmt_id;
    } 
    
    private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<void> {
        try {
            if (this._wsClient.getState() <= 0) {
                throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
            }
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

    private init(reqId?: number):Promise<WsStmt> {
        return new Promise(async (resolve, reject) => {
            if (this._wsClient) {
                try{
                    if (this._wsClient.getState() <= 0) {
                        await this._wsClient.connect();
                    }
                    let queryMsg = {
                        action: 'init',
                        args: {
                            req_id: ReqId.getReqID(reqId),
                        },
                    };
                    await this.execute(queryMsg);
                    resolve(this)
                } catch(e) {
                    reject(e);
                }
            }else{
                reject(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed"));
            }
        });
    }
    
}
