import { WsClient } from '../client/wsClient';
import { ErrorCode, TDWebSocketClientError, TaosError, TaosResultError } from '../common/wsError';
import { WsStmtQueryResponse, StmtMessageInfo, binaryBlockEncode, StmtBindType } from './wsProto';
import { ReqId } from '../common/reqid';
import { PrecisionLength } from '../common/constant';
import { StmtBindParams } from './wsParams';

export class WsStmt {
    private _wsClient: WsClient;
    private _stmt_id: number | undefined | null;
    private _precision:number = PrecisionLength['ms'];

    private lastAffected: number | undefined | null;
    private constructor(wsClient: WsClient, precision?:number) {
        this._wsClient = wsClient;
        if (precision) {
            this._precision = precision;
        }
    }

    static NewStmt(wsClient: WsClient, precision?:number, reqId?:number): Promise<WsStmt> {
        let wsStmt = new WsStmt(wsClient, precision)
        return wsStmt.init(reqId);
    }

    Prepare(sql: string): Promise<void> {
        let queryMsg = {
            action: 'prepare',
            args: {
                req_id: ReqId.getReqID(),
                sql: sql,
                stmt_id: this._stmt_id,
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
                stmt_id: this._stmt_id,
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
                stmt_id: this._stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    NewStmtParam():StmtBindParams {
        return new StmtBindParams(this._precision);
    }

    SetBinaryTags(paramsArray:StmtBindParams): Promise<void> {
        if (!paramsArray || !this._stmt_id) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!")
        }

        let columnInfos = paramsArray.GetParams();
        if (!columnInfos) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "SetBinaryTags paramArray is invalid!") 
        }
        let reqId = BigInt(ReqId.getReqID())
        let dataBlock = binaryBlockEncode(paramsArray, StmtBindType.STMT_TYPE_TAG, this._stmt_id, reqId, paramsArray.GetDataRows())
        return this.sendBinaryMsg(reqId, 'set_tags', dataBlock);
    }

    BinaryBind(paramsArray:StmtBindParams): Promise<void> {
        if (!paramsArray || !this._stmt_id) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "BinaryBind paramArray is invalid!")
        }

        let columnInfos = paramsArray.GetParams();
        if (!columnInfos) {
            throw new TaosError(ErrorCode.ERR_INVALID_PARAMS, "BinaryBind paramArray is invalid!") 
        }
        let reqId = BigInt(ReqId.getReqID())
        let dataBlock = binaryBlockEncode(paramsArray, StmtBindType.STMT_TYPE_BIND, this._stmt_id, reqId, paramsArray.GetDataRows());
        return this.sendBinaryMsg(reqId, 'bind', dataBlock);
    }

    Bind(paramArray: Array<Array<any>>): Promise<void> {
        let queryMsg = {
            action: 'bind',
            args: {
                req_id: ReqId.getReqID(),
                columns: paramArray,
                stmt_id: this._stmt_id,
            },
        };
        return this.execute(queryMsg);
    }

    Batch(): Promise<void> {
        let queryMsg = {
            action: 'add_batch',
            args: {
                req_id: ReqId.getReqID(),
                stmt_id: this._stmt_id,
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
                stmt_id: this._stmt_id,
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
                stmt_id: this._stmt_id,
            },
        };
        return this.execute(queryMsg, false);
    }

    public getStmtId(): number | undefined | null {
        return this._stmt_id;
    } 
    
    private async execute(queryMsg: StmtMessageInfo, register: Boolean = true): Promise<void> {
        try {
            if (this._wsClient.getState() <= 0) {
                throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
            }
            let reqMsg = JSON.stringify(queryMsg);
            if (register) {
                let result = await this._wsClient.exec(reqMsg, false);
                let resp = new WsStmtQueryResponse(result)
                if (resp.stmt_id) {
                    this._stmt_id = resp.stmt_id;
                }

                if (resp.affected) {
                    this.lastAffected = resp.affected
                } 
            }else{
                await this._wsClient.execNoResp(reqMsg);
                this._stmt_id = null
                this.lastAffected = null
            }
            return
        } catch (e:any) {
            throw new TaosResultError(e.code, e.message);
        }
    }

    private async sendBinaryMsg(reqId: bigint, action:string, message: ArrayBuffer): Promise<void> {
        try {
            if (this._wsClient.getState() <= 0) {
                throw new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "websocket connect has closed!");
            }
            let result = await this._wsClient.sendBinaryMsg(reqId, action, message, false);
            let resp = new WsStmtQueryResponse(result)
            if (resp.stmt_id) {
                this._stmt_id = resp.stmt_id;
            }

            if (resp.affected) {
                this.lastAffected = resp.affected
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
