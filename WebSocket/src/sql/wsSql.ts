import { WSRows } from './wsRows'
import { TaosResult } from '../common/taosResult'
import { WSInterface } from '../client/wsInterface'
import { WSConnResponse } from '../client/wsResponse'
import { TaosResultError } from '../common/wsError'
 
export class WsSql{
    private _wsInterface: WSInterface
    private _req_id = 2000000;
   
    constructor(url: string) {
        this._wsInterface = new WSInterface(new URL(url))
        this._req_id = Date.parse(new Date().toString())
    }

    Open(database?:string):Promise<WSConnResponse> {
        return this._wsInterface.connect(database)
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

    Exec(sql:string, action:string = 'query'):Promise<TaosResult>{
        return this.execute(sql, action)
    }
    Close() {
        this._wsInterface.close();
    }

    async execute(sql: string, action:string = 'query'): Promise<TaosResult> {
        try {
            let wsQueryResponse = await this._wsInterface.exec(this.getSql(sql, action));
            let taosResult = new TaosResult(wsQueryResponse);
            if (wsQueryResponse.is_update == true) {
                return taosResult;
            } else {
                try{
                    while (true) {
                        let wsFetchResponse = await this._wsInterface.fetch(wsQueryResponse)
                        console.log("[wsQuery.execute.wsFetchResponse]==>\n")
                        console.log(wsFetchResponse)
                        console.log(typeof BigInt(8))
                        console.log(typeof wsFetchResponse.timing)
                        if (wsFetchResponse.completed == false) {
                            break;
                        } else {
                            taosResult.setRows(wsFetchResponse)
                            let tmp: TaosResult = await this._wsInterface.fetchBlock(wsFetchResponse, taosResult)
                            taosResult = tmp;
                        }
                    }
                    return taosResult;                    
                } catch(e){
                    throw new TaosResultError("query sql fetch block error");
                } finally {
                    this._wsInterface.freeResult(wsQueryResponse)
                }
            }
        } catch(e) {
            console.log(e)
            throw new TaosResultError("exec sql error");
        }
    }

    async query(sql: string): Promise<WSRows> {
        try {
            let wsQueryResponse = await this._wsInterface.exec(this.getSql(sql));
            return new WSRows(this._wsInterface, wsQueryResponse);
        } catch (e) {
            console.log(e)
            throw new TaosResultError("query exec error");
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