import { options, connect } from '../index'

options.host = '127.0.0.1';
//your cloud token
options.query = {token:'c37ef4dbec8708c0227b4e8cb84ffffb9b8711a1'}
options.port = 6041


const sql = 'show databases';

let conn = connect(options);
let cursor = conn.cursor();

async function execute(sql: string, pure = false) {
    let result = await cursor.query(sql, pure);
    // print query result as taos shell
    result.toString();
    // Get Result object, return Result object.
    console.log("result.getResult()",result.getResult());
    // Get status, return 'succ'|'error'.
    console.log("result.getStatus()",result.getStatus());
    // Get head,return response head (Array<any>|undefined,when execute failed this is undefined).
    console.log("result.getHead()",result.getHead());
    // Get Meta data, return Meta[]|undefined(when execute failed this is undefined).
    console.log("result.getMeta()",result.getMeta());
    // Get data,return Array<Array<any>>|undefined(when execute failed this is undefined).
    console.log("result.getData()",result.getData());
    // Get affect rows,return number|undefined(when execute failed this is undefined).
    console.log("result.getAffectRows()",result.getAffectRows());
    // Get command,return SQL send to server(need to `query(sql,false)`,set 'pure=false',default true).
    console.log("result.getCommand()",result.getCommand());
    // Get error code ,return number|undefined(when execute failed this is undefined).
    console.log("result.getErrCode()",result.getErrCode());
    // Get error string,return string|undefined(when execute failed this is undefined).
    console.log("result.getErrStr()",result.getErrStr());
}

(async () => {
    let start = new Date().getTime(); // start time
    await execute(sql)
    let end = new Date().getTime(); // end time
    console.log("total spend time:%d ms",end - start);
})()
