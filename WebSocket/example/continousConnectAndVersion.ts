import { connect } from "../index";

let ws = connect("ws://root:taosdata@127.0.0.1:6041/rest/ws")

ws.Version()
.then((e) =>{console.log(e)} )
.then(()=>ws.Version())
.then((e) =>{console.log(e)} )
.then(()=>ws.Open())
.then((e) =>{console.log(e)} )
.then(()=>ws.Open('test'))
.then((e) =>{console.log(e);ws.Close()} )
.catch(e=>{console.log(e);ws.Close();})



