# WebSocket APIs

## Bulk Pulling

``` typescript
import {taoWS} from '@tdengine/websocket'
let url = "ws://host:port/rest/ws"
// create an instance of taoWS, while the returned websocket connection of the returned instance 'ws' may is not in 'OPEN' status
var ws = TDWebSocket(url)
```

``` typescript
// build connect with tdengine
ws.connect().then(connectRes=>console.log(connectRes)).catch(e=>{/*do some thing to  handle error*/})
```

``` typescript
//query data with SQL
ws.query(sql).then(taosResult=>{console.log(taosResult)}).catch(e=>{/*do some thing to  handle error*/})
```

```typescript
// get client version
ws.version().then(version=>console.log(version)).catch(e=>{/*do some thing to  handle error*/})
```

``` typescript
// get current WebSocket connection status
let status:number = ws.status()
```

``` typescript
// close current WebSocket connection
ws.close();
```

## STMT (Draft,could be changed)

``` typescript
let url = "ws://host:port/rest/stmt"

wsConnect();

function stmt_init(req_id:number){
    // send('{"action":"init","args":{"req_id":2}}')
}

function stmt_prepare(req_id:number,stmt_id:number,sql:string){
    // send('{"action":"prepare","args":{"req_id":3,"stmt_id":1,"sql":"insert into ? values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"}}')
}

function stmt_set_table_name((req_id:number,stmt_id:number,name:string){
    // send('{"action":"set_table_name","args":{"req_id":4,"stmt_id":1,"name":"test_ws_stmt.ct"}}');
}

function stmt_set_tags(req_id:number,stmt_id,tags:Array[any]){
    // send('{"action":"set_tags","args":{"req_id":4,"stmt_id":1,"tags":[123,"string",nil]}}')
}

function stmt_bind((req_id:number,stmt_id:number,columns:Array[any]){
    // send('{"action":"bind","args":{"req_id":5,"stmt_id":1,"columns":[["2022-06-07T11:02:44.022450088+08:00","2022-06-07T11:02:45.022450088+08:00","2022-06-07T11:02:46.022450088+08:00"],[true,false,null],[2,22,null],[3,33,null],[4,44,null],[5,55,null],[6,66,null],[7,77,null],[8,88,null],[9,99,null],[10,1010,null],[11,1111,null],["binary","bianry2",null],["nchar","nchar2",null]]}}')

}

function stmt_add_batch((req_id:number,stmt_id:number){
    // send('{"action":"add_batch","args":{"req_id":6,"stmt_id":1}}')
}

function stmt_execute((req_id:number,stmt_id:number){
    // send('{"action":"exec","args":{"req_id":7,"stmt_id":1}}')
}

function stmt_close(){
    // send('{"action":"close","args":{"req_id":8,"stmt_id":1}}')
}
```

## TMQ (Draft, could be changed)

```TypeScript
let url = "ws://host:port/rest/tmq"

function tmq_init(){
     // send('{"action":"init","args":{"req_id":1}}')
}

function tmq_subscribe(req_id:number,username:string,password:string,db:string,group_id:string,client_id:string,offset_rest:string,topics:Array[string]){
    // send('{"action":"subscribe","args":{"req_id":0,"user":"root","password":"taosdata","db":"","group_id":"test","client_id":"","offset_rest":"","topics":topics}}');
}

function tmq_poll(req_id:number,blocking_time:number){
    // send('{"action":"poll","args":{"req_id":3,"blocking_time":500}}')
}

function tmq_fetch(req_id:number,message_id:number){
    // send('{"action":"fetch","args":{"req_id":4,"message_id":1}}')
}

function tmq_fetch_block(req_id:number,message_id:number){
    // send('{"action":"fetch_block","args":{"req_id":0,"message_id":1}}')
}

function tmq_fetch_raw_meta(req_id:number,message_id:number){
    // send('{"action":"fetch_raw_meta","args":{"req_id":3,"message_id":1}}')
}

function tmq_fetch_json_meta(req_id:number,message_id:number){
    // send('{"action":"fetch_json_meta","args":{"req_id":4,"message_id":1}}')
}

function tmq_commit(req_id:number,message_id:number){
    // send('{"action":"commit","args":{"req_id":3,"message_id":3}}')
}

function tmq_unsubscribe(){
    // send('{"action":"unsubscribe","args":{"req_id":3,"message_id":3}}')
}

function tmq_close(){
    // send('{"action":"close","args":{"req_id":3,"message_id":3}}')    
}

```