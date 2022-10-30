import { WSCursor } from "./wsCursor";

let ws = new WSCursor("ws://root:taosdata@182.92.127.131:6041/rest/ws")
// ws.connect().then((e)=>{console.log(e);ws.close()}).catch(e=>console.log(e))

// ws.version().then((e) =>{console.log(e);ws.close()} );

ws.connect()
    .then(() => ws.query("select * from test.q"))
    .then((res) => {
        console.log((res))
    })
    .then(() => ws.close())
    .catch(e => { console.log(e); ws.close() })