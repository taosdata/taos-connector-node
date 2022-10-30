// import { WSCursor } from "./wsCursor";

// var wsCursor = new WSCursor("ws://root:taosdata@182.92.127.131:6041/rest/ws")

// wsCursor.connect().then((e: any) => {
//     console.log(wsCursor.readyState());
// })
// .then(()=>wsCursor.close())
// .catch(e => { throw e })
// console.log(wsCursor.readyState());


import { WSInterface } from "./wsQueryInterface";

var ws: WSInterface = new WSInterface(new URL("ws://root:taosdata@182.92.127.131:6041/rest/ws"));
var block;

ws.connect()
.then(wsConnResponse=>{console.log(wsConnResponse)})
.then(()=>ws.version())
.then((wsVersionResponse)=>{console.log("version:"+JSON.stringify(wsVersionResponse))})
.then(()=>ws.query("show databases"))
.then(wsQueryResponse=>{console.log("query_result:"+JSON.stringify(wsQueryResponse));return wsQueryResponse;})
.then(wsQueryResponse=>ws.fetch(wsQueryResponse))
.then(wsFetchResponse=>{console.log("fetch_result:"+JSON.stringify(wsFetchResponse));return wsFetchResponse })
// .then(wsFetchResponse=>ws.freeResult(wsFetchResponse))
// .then(wsFreeResponse=>{console.log("free_result:"+JSON.stringify(wsFreeResponse));})
// .then(wsFetchResponse=>ws.fetchBlock(wsFetchResponse))
// .then(e=>{console.log("fetch_block:"+JSON.stringify(e))})
.then(()=>ws.close())
.catch(e=>{ws.close(); console.log(e)})//.then(()=>ws.close())

// ws.version().then((e)=>console.log(e)).then(()=>ws.close()).catch(e=>{console.log(e);ws.close(); })

// (async () =>{
//     let conn = ws.connect();
//     console.log(conn);
// })()