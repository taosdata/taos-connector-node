import { WSRows } from './wsRows'
import { TaosResult } from '../common/taosResult'
import { WsClient } from '../client/wsClient'
import { ErrorCode, TDWebSocketClientError, TaosResultError, WebSocketInterfaceError } from '../common/wsError'
import { WSConfig } from '../common/config'
import { GetUrl } from '../common/utils'
import { WSQueryResponse } from '../client/wsResponse'
import { Precision, SchemalessMessageInfo, SchemalessProto } from './wsProto'
import { WsStmt } from '../stmt/wsStmt'
import { ReqId } from '../common/reqid'
import { PrecisionLength } from '../common/constant'
import logger from '../common/log'
 
export class WsSql{
    private wsConfig:WSConfig;
    private _wsClient: WsClient;   
    constructor(wsConfig:WSConfig) {
        let url = GetUrl(wsConfig);
        this._wsClient = new WsClient(url, wsConfig.GetTimeOut());
        this.wsConfig = wsConfig;
    }

    static async Open(wsConfig:WSConfig):Promise<WsSql> {
        if (!wsConfig.GetUrl()) {
            throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
        }
        let wsSql = new WsSql(wsConfig);
        return await wsSql.open(wsConfig.GetDb())
    }

    private async open(database:string | null | undefined):Promise<WsSql> {  
        await this._wsClient.connect(database);
        if(database && database.length > 0) {
            await this.Exec(`use ${database}`);
        }
        return this;
    }

    State(){
        return this._wsClient.getState();
    }

    /**
     * return client version.
     */
    async Version(): Promise<string> {
        return await this._wsClient.version()
    }
    
    async Close():Promise<void> {
        await this._wsClient.close();
    }

    async SchemalessInsert(lines: Array<string>, protocol: SchemalessProto, precision: Precision, ttl: number, reqId?: number): Promise<void> {
        let data = '';
        if (!lines || lines.length == 0 || !protocol) {
            throw new TaosResultError(ErrorCode.ERR_INVALID_PARAMS, 'WsSchemaless Insert params is error!');
        }

        lines.forEach((element, index) => {
            data += element;
            if (index < lines.length - 1) {
                data += '\n';
            }
        });

        let queryMsg = {
            action: 'insert',
            args: {
                req_id : ReqId.getReqID(reqId),
                protocol: protocol,
                precision: precision,
                data: data,
                ttl: ttl,
            },
        };
        return await this.executeSchemalessInsert(queryMsg);
    }

    async StmtInit(reqId?:number): Promise<WsStmt> {
        if (this._wsClient) {   
            let precision = PrecisionLength["ms"];
            if (this.wsConfig.GetDb()) {
                let sql = "select `precision` from information_schema.ins_databases where name = '" + this.wsConfig.GetDb() + "'";
                let result = await this.Exec(sql);
                let data =result.GetData()
                    
                if (data && data[0] && data[0][0]) {
                    precision = PrecisionLength[data[0][0]]
                }
            }
            return await WsStmt.NewStmt(this._wsClient, precision, reqId);     
        }
        throw(new TDWebSocketClientError(ErrorCode.ERR_CONNECTION_CLOSED, "stmt connect closed")); 
    }

    async Exec(sql: string, reqId?: number, action:string = 'query'): Promise<TaosResult> {
        try {
            let wsQueryResponse:WSQueryResponse = await this._wsClient.exec(this.getSql(sql, reqId, action));
            let taosResult = new TaosResult(wsQueryResponse);
            if (wsQueryResponse.is_update) {
                return taosResult;
            } else {
                try{
                    while (true) {
                        let wsFetchResponse = await this._wsClient.fetch(wsQueryResponse)
                        if (wsFetchResponse.completed) {
                            break;
                        } else {
                            taosResult.SetRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing);
                            taosResult = await this._wsClient.fetchBlock(wsFetchResponse, taosResult);
                        }
                    }
                    return taosResult;                    
                } catch(err: any){
                    throw new TaosResultError(err.code, err.message);
                } finally {
                    this._wsClient.freeResult(wsQueryResponse)
                }
            }
        } catch(err: any) {
            throw new TaosResultError(err.code, err.message);
        }
    }

    private async executeSchemalessInsert(queryMsg: SchemalessMessageInfo): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                let reqMsg = JSON.stringify(queryMsg);
                let result = await this._wsClient.exec(reqMsg);
                logger.debug("executeSchemalessInsert:", reqMsg, result)
                resolve();
            } catch (e:any) {
                reject(new TaosResultError(e.code, e.message));
            }
        });
    }

    async Query(sql: string, reqId?:number): Promise<WSRows> {
        try {
            let wsQueryResponse:WSQueryResponse = await this._wsClient.exec(this.getSql(sql, reqId));
            return new WSRows(this._wsClient, wsQueryResponse);
        } catch (err: any) {
            throw new TaosResultError(err.code, err.message);
        }
        
    }
    private getSql(sql:string, reqId?:number, action:string = 'query'):string{
        // construct msg
        let queryMsg = {
            action: action,
            args: {
                req_id: ReqId.getReqID(reqId),
                sql: sql,
                id: 0
            },
        }
        return JSON.stringify(queryMsg)
    }
}