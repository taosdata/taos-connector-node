import { WSRows } from './wsRows'
import { TaosResult } from '../common/taosResult'
import { WSInterface } from '../client/wsInterface'
import { ErrorCode, TaosResultError, WebSocketInterfaceError } from '../common/wsError'
import { WSConfig } from '../common/config'
import { GetUrl } from '../common/utils'
import { WSQueryResponse } from '../client/wsResponse'
 
export class WsSql{
    private _wsInterface: WSInterface
    private _req_id = 2000000;
   
    constructor(url: URL, timeout :number | undefined | null) {
        this._wsInterface = new WSInterface(url, timeout)
    }

    static Open(wsConfig:WSConfig):Promise<WsSql> {
        if (!wsConfig.GetUrl()) {
            throw new WebSocketInterfaceError(ErrorCode.ERR_INVALID_URL, 'invalid url, password or username needed.');
        }

        let url = GetUrl(wsConfig)
        let wsSql = new WsSql(url, wsConfig.GetTimeOut());
        return wsSql.open(wsConfig.GetDb())
    }

    State(){
        return this._wsInterface.getState();
    }

    /**
     * return client version.
     */
    Version(): Promise<string> {
        return this._wsInterface.version()
    }

    Query(sql:string):Promise<WSRows>{
        return this.query(sql)
    }

    Exec(sql:string):Promise<TaosResult>{
        return this.execute(sql)
    }
    Close() {
        this._wsInterface.close();
    }

    async open(database:string | null | undefined):Promise<WsSql> {
        return new Promise((resolve, reject) => {
            this._wsInterface.connect(database).then(()=>{resolve(this)}).catch((e: any)=>{reject(e)});
        })
    }

    async execute(sql: string, action:string = 'query'): Promise<TaosResult> {
        try {
            let wsQueryResponse:WSQueryResponse = await this._wsInterface.exec(this.getSql(sql, action));
            let taosResult = new TaosResult(wsQueryResponse);
            if (wsQueryResponse.is_update == true) {
                return taosResult;
            } else {
                try{
                    while (true) {
                        let wsFetchResponse = await this._wsInterface.fetch(wsQueryResponse)
                        if (wsFetchResponse.completed == true) {
                            break;
                        } else {
                            taosResult.SetRowsAndTime(wsFetchResponse.rows, wsFetchResponse.timing);
                            let tmp: TaosResult = await this._wsInterface.fetchBlock(wsFetchResponse, taosResult);
                            taosResult = tmp;
                        }
                    }
                    return taosResult;                    
                } catch(e){
                    let err :any = e
                    throw new TaosResultError(err.code, err.message);
                } finally {
                    this._wsInterface.freeResult(wsQueryResponse)
                }
            }
        } catch(e) {
            let err :any = e
            throw new TaosResultError(err.code, err.message);
        }
    }

    async query(sql: string): Promise<WSRows> {
        try {
            let wsQueryResponse:WSQueryResponse = await this._wsInterface.exec(this.getSql(sql));
            return new WSRows(this._wsInterface, wsQueryResponse);
        } catch (e) {
            let err :any = e
            throw new TaosResultError(err.code, err.message);
        }
        
    }
    private getSql(sql:string, action:string = 'query'):string{
        this._reqIDIncrement()
        // construct msg
        let queryMsg = {
            action: action,
            args: {
                req_id: this._req_id,
                sql: sql,
                id: 0
            },
        }
        return JSON.stringify(queryMsg)
    }

    private _reqIDIncrement() {
        if (this._req_id == Number.MAX_SAFE_INTEGER) {
            this._req_id = 2000000;
        } else {
            this._req_id += 1;
        }
    }
} 