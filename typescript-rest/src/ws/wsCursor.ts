
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

    // query(sql: string): Promise<any> {
    //     // let context = this
    //     return this._wsInterface.query(sql)
    //         .then((queryRes: any) => {
    //             if (queryRes.is_update) {
    //                 return queryRes.affected_rows;
    //             } else {
    //                 this._meta.concat(queryRes.fields_names);
    //                 this._meta.concat(queryRes.fields_types);
    //                 this._meta.concat(queryRes.length);
    //                 this._meta.concat(queryRes.precision)

    //                 this._wsInterface.fetch(queryRes)
    //                     .then((fetchRes: any) => {
    //                         while (!fetchRes.completed) {
    //                             this._wsInterface.fetchBlock(fetchRes)
    //                                 .then(((fetchBlockRes: any) => {
    //                                     this._data.concat(fetchBlockRes.data)
    //                                 }))
    //                         }
    //                     }).catch(e => { throw e })
    //             }
    //         })
    //         .catch(e => { throw e })
    // }

    query(sql:string):Promise<TaosResult>{
        return execute(sql,this._wsInterface)
    }
    close() {
        this._wsInterface.close();
    }

} 