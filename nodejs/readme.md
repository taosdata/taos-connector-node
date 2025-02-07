# WebSocket APIs

## Bulk Pulling

### DSN

User can connect to the TDengine by passing DSN to WebSocket client. The description about the DSN like before.

```text
[+<protocol>]://[[<username>:<password>@]<host>:<port>][/<database>][?<p1>=<v1>[&<p2>=<v2>]]
|------------|---|-----------|-----------|------|------|------------|-----------------------|
|   protocol |   | username  | password  | host | port |  database  |  params               |
```

- **protocol**: Display using websocket protocol to establish connection. eg. `ws://localhost:6041`
- **username/password**: Database's username and password.
- **host/port**: Declare host and port. eg. `localhost:6041`
- **database**: Optional, use to specify database name.
- **params**: Other parameters. Like cloud Token.

A complete DSN string example：

```text
ws://localhost:6041/test
```

## Connection types

**Node.js websocket connector** which is implemented through taosAdapter.

## Supported platforms

Node.js client library supports Node.js 14 or higher.

## Supported features

1. Connection Management
2. General Query
3. Continuous Query
4. Parameter Binding
5. Subscription
6. Schemaless

### Sql Usage

``` typescript
import { WSConfig } from '../src/common/config';
import { sqlConnect, destroy, setLogLevel } from '../src'

let dsn = 'ws://root:taosdata@localhost:6041';
(async () => {
    let wsSql = null;
    let wsRows = null;
    let reqId = 0;
    try {
        setLogLevel("debug")
        let conf :WSConfig = new WSConfig(dsn)
        conf.setUser('root')
        conf.setPwd('taosdata')
        wsSql = await sqlConnect(conf)

        let version = await wsSql.version();
        console.log(version);

        let taosResult = await wsSql.exec('show databases', reqId++)
        console.log(taosResult);

        taosResult = await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;',reqId++);
        console.log(taosResult);

        taosResult = await wsSql.exec('use power',reqId++)
        console.log(taosResult);

        taosResult = await wsSql.exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);', reqId++);
        console.log(taosResult);

        taosResult = await wsSql.exec('describe meters', reqId++)
        console.log(taosResult);

        taosResult = await wsSql.exec('INSERT INTO d1001 USING meters TAGS ("California.SanFrancisco", 3) VALUES (NOW, 10.2, 219, 0.32)', reqId++)
        console.log(taosResult);

        wsRows = await wsSql.query('select * from meters', reqId++);
        let meta = wsRows.getMeta()
        console.log("wsRow:meta:=>", meta);

        while (await wsRows.next()) {
            let result = wsRows.getData();
            console.log('queryRes.Scan().then=>', result);
        }
        wsRows.close()

    } catch (err: any) {
        console.error(err.code, err.message);

    } finally {
        if (wsRows) {
            await wsRows.close();
        }
        if (wsSql) {
           await wsSql.close();
        }
        destroy()
        console.log("finish!")
    }
})();

```

### Schemaless Usage

``` typescript
import { WSConfig } from '../src/common/config';
import { Precision, SchemalessProto } from '../src/sql/wsProto';
import { sqlConnect, destroy, setLogLevel } from '../src';
let dsn = 'ws://root:taosdata@localhost:6041';
let db = 'power'
let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000"
let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0"
let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}"
const dropDB = `drop database if exists ${db}`

async function Prepare() {
    let conf :WSConfig = new WSConfig(dsn)
    conf.setUser('root')
    conf.setPwd('taosdata')
    let wsSql = await sqlConnect(conf)
    const topics:string[] = ['pwer_meters_topic']
    let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`
    await wsSql.exec(dropTopic);
    await wsSql.exec(dropDB);

    await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.exec('CREATE STABLE if not exists power.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    wsSql.close();
}

(async () => {
    let wsSchemaless = null
    try {
        let conf :WSConfig = new WSConfig(dsn)
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power')
        wsSchemaless = await sqlConnect(conf)
        await wsSchemaless.schemalessInsert([influxdbData], SchemalessProto.InfluxDBLineProtocol, Precision.NANO_SECONDS, 0);
        await wsSchemaless.schemalessInsert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, Precision.SECONDS, 0);
        await wsSchemaless.schemalessInsert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, Precision.SECONDS, 0);
        wsSchemaless.close();
    } catch (e) {
        console.error(e);
    }finally {
        if (wsSchemaless) {
            await wsSchemaless.close();
        }
        destroy()
    }
})();

```

### Stmt Usage

``` typescript
import { WSConfig } from '../src/common/config';
import { destroy, sqlConnect } from '../src';

let db = 'power'
let stable = 'meters'
let tags = ['California.SanFrancisco', 3];
let multi = [
    [1706786044994, 1706786044995, 1706786044996],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
];
let dsn = 'ws://root:taosdata@localhost:6041';
async function Prepare() {

    let conf :WSConfig = new WSConfig(dsn)
    let wsSql = await sqlConnect(conf)
    await wsSql.exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    await wsSql.exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    wsSql.close()
}

(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let wsConf = new WSConfig(dsn);
        wsConf.setDb(db)
        connector = await sqlConnect(wsConf);
        stmt = await connector.stmtInit()
        await stmt.prepare(`INSERT INTO ? USING ${db}.${stable} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`);
        await stmt.setTableName('d1001');

        let tagParams = stmt.newStmtParam()
        tagParams.setVarchar([tags[0]])
        tagParams.setInt([tags[1]])
        await stmt.setTags(tagParams);

        let bindParams = stmt.newStmtParam()
        bindParams.setTimestamp(multi[0]);
        bindParams.setFloat(multi[1])
        bindParams.setInt(multi[2])
        bindParams.setFloat(multi[3])
        await stmt.bind(bindParams);
        await stmt.batch();
        await stmt.exec();
    } catch (e) {
        console.error(e);
    }finally {
        if (stmt) {
            await stmt.close();
        }
        if (connector) {
            await connector.close();
        }
        destroy()
    }
})();

```

### Tmq Usage

```typescript
import { WSConfig } from "../src/common/config";
import { TMQConstants } from "../src/tmq/constant";
import { destroy, sqlConnect, tmqConnect } from "../src";

const stable = 'meters';
const db = 'power'
const topics:string[] = ['pwer_meters_topic']
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`
let configMap = new Map([
    [TMQConstants.GROUP_ID, "gId"],
    [TMQConstants.CONNECT_USER, "root"],
    [TMQConstants.CONNECT_PASS, "taosdata"],
    [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [TMQConstants.CLIENT_ID, 'test_tmq_client'],
    [TMQConstants.WS_URL, 'ws://localhost:6041'],
    [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
    [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);
let dsn = 'ws://root:taosdata@localhost:6041';
async function Prepare() {
    let conf :WSConfig = new WSConfig(dsn)
    const createDB = `create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`
    const createStable = `CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`
    let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
    const useDB = `use ${db}`

    let ws = await sqlConnect(conf);
    await ws.exec(createDB);
    await ws.exec(useDB);
    await ws.exec(createStable);
    await ws.exec(createTopic);
    for (let i = 0; i < 10; i++) {
        await ws.exec(`INSERT INTO d1001 USING ${stable} (location, groupId) TAGS ("California.SanFrancisco", 3) VALUES (NOW, ${10+i}, ${200+i}, ${0.32 + i})`)
    }
    ws.close()
    
}

(async () => {
    let consumer = null
    try {
        await Prepare()
        consumer = await tmqConnect(configMap);
        await consumer.subscribe(topics);
        for (let i = 0; i < 5; i++) {
            let res = await consumer.poll(500);
            for (let [key, value] of res) {
                console.log(key, value);
            }
            if (res.size == 0) {
                break;
            }
            await consumer.commit();
        }

        let assignment = await consumer.assignment()
        console.log(assignment)
        await consumer.seekToBeginning(assignment)
        assignment = await consumer.assignment()
        for(let i in assignment) {
            console.log("seek after:", assignment[i])
        }
        await consumer.unsubscribe()
    } catch (e) {
        console.error(e);
    } finally {
        if (consumer) {
           await consumer.close();
        }
        destroy()
    }
})();
```