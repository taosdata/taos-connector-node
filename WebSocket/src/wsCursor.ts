
import { execute } from './queryPromise'
import { TaosResult } from './TDengineResult'
import { WSInterface } from './wsQueryInterface'


export class WSCursor {
    _wsInterface: WSInterface
    _data: Array<any> = []
    _meta: Array<any> = []

    constructor(url: string) {
        this._wsInterface = new WSInterface(new URL(url))
    }

    connect() {
        return this._wsInterface.connect();
    }

    state(){
        return this._wsInterface.getState();
    }

    /**
     * return client version.
     */
    version(): Promise<string> {
        return this._wsInterface.version()
    }

    query(sql:string):Promise<TaosResult>{
        return execute(sql,this._wsInterface)
    }
    close() {
        this._wsInterface.close();
    }

} 