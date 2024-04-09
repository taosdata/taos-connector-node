# TDengine Connectors for Node.js

This repository includes two Node connector for TDengine. One is `@tdengine/client`, a Node.js connector using TDengine's native connection. Another is `@tdengine/rest`, a TypeScript connector using TDengine's rest connection.

This readme file introduce basic installation and work with our connectors.

## `@tdengine/client`

This is the Node.js library that lets you connect to [TDengine](https://www.github.com/taosdata/tdengine) 3.0 version. It is built so that you can use as much of it as you want or as little of it as you want through providing an extensive API. If you want the raw data in the form of an array of arrays for the row data retrieved from a table, you can do that. If you want to wrap that data with objects that allow you easily manipulate and display data such as using a prettifier function, you can do that!

### Installation

To get started, just type in the following to install the connector through [npm](https://www.npmjs.com/)

```cmd
npm install @tdengine/client
```

To interact with TDengine, we make use of the [node-gyp](https://github.com/nodejs/node-gyp) library. To install, you will need to install the following depending on platform (the following instructions are quoted from node-gyp)

#### On Linux

- `python`
- `make`
- A proper C/C++ compiler toolchain, like [GCC](https://gcc.gnu.org)
- `node` (either `v10.x` or `v12.x`, other version has some dependency compatibility problems)

<!-- 
#### On macOS

- `python` (`v2.7` recommended, `v3.x.x` is **not** supported) (already installed on macOS)

- Xcode

  - You also need to install the

    ```
    Command Line Tools
    ```

     via Xcode. You can find this under the menu

    ```
    Xcode -> Preferences -> Locations
    ```

     (or by running

    ```
    xcode-select --install
    ```

     in your Terminal)

    - This step will install `gcc` and the related toolchain containing `make`
    -->

#### On Windows

##### Option 1

Install all the required tools and configurations using Microsoft's [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) using `npm install --global --production windows-build-tools` from an elevated PowerShell or CMD.exe (run as Administrator).

##### Option 2

Install tools and configuration manually:

- Install Visual C++ Build Environment: [Visual Studio Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools) (using "Visual C++ build tools" workload) or [Visual Studio 2017 Community](https://visualstudio.microsoft.com/pl/thank-you-downloading-visual-studio/?sku=Community) (using the "Desktop development with C++" workload)
- Install [Python 2.7](https://www.python.org/downloads/) (`v3.x.x` is not supported), and run `npm config set python python2.7` (or see below for further instructions on specifying the proper Python version and path.)
- Launch cmd, `npm config set msvs_version 2017`

If the above steps didn't work for you, please visit [Microsoft's Node.js Guidelines for Windows](https://github.com/Microsoft/nodejs-guidelines/blob/master/windows-environment.md#compiling-native-addon-modules) for additional tips.

To target native ARM64 Node.js on Windows 10 on ARM, add the  components "Visual C++ compilers and libraries for ARM64" and "Visual  C++ ATL for ARM64".

### Usage

The following is a short summary of the basic usage of the connector, the  full api and documentation can be found [here](https://www.taosdata.com/docs/cn/v2.0/connector#nodejs)

#### Connection

To use the connector, first require the library ```@tdengine/client```. Running the function ```taos.connect``` with the connection options passed in as an object will return a TDengine connection object. The required connection option is ```host```, other options if not set, will be the default values as shown below.

A cursor also needs to be initialized in order to interact with TDengine from Node.js.

```javascript
const taos = require('@tdengine/client');
var conn = taos.connect({host:"127.0.0.1", user:"root", password:"taosdata", config:"/etc/taos",port:0})
var cursor = conn.cursor(); // Initializing a new cursor
```

Close a connection

```javascript
conn.close();
```

#### Queries

We can now start executing simple queries through the ```cursor.query``` function, which returns a TaosQuery object.

```javascript
var query = cursor.query('show databases;')
```

We can get the results of the queries through the ```query.execute()``` function, which returns a promise that resolves with a TaosResult object, which contains the raw data and additional functionalities such as pretty printing the results.

```javascript
var promise = query.execute();
promise.then(function(result) {
  result.pretty(); //logs the results to the console as if you were in the taos shell
});
```

You can also query by binding parameters to a query by filling in the question marks in a string as so. The query will automatically parse what was binded and convert it to the proper format for use with TDengine

```javascript
var query = cursor.query('select * from meterinfo.meters where ts <= ? and areaid = ?;').bind(new Date(), 5);
query.execute().then(function(result) {
  result.pretty();
})
```

The TaosQuery object can also be immediately executed upon creation by passing true as the second argument, returning a promise instead of a TaosQuery.

```javascript
var promise = cursor.query('select * from meterinfo.meters where v1 = 30;', true)
promise.then(function(result) {
  result.pretty();
})
```

If you want to execute queries without objects being wrapped around the data, use `cursor.execute()` directly and `cursor.fetchall()` to retrieve data if there is any.

```javascript
cursor.execute('select count(*), avg(v1), min(v2) from meterinfo.meters where ts >= \"2019-07-20 00:00:00.000\";');
var data = cursor.fetchall();
console.log(cursor.fields); // Latest query's Field metadata is stored in cursor.fields
console.log(cursor.data); // Latest query's result data is stored in cursor.data, also returned by fetchall.
```

#### Async functionality

Async queries can be performed using the same functions such as `cursor.execute`, `TaosQuery.query`, but now with `_a` appended to them.

Say you want to execute an two async query on two separate tables, using `cursor.query`, you can do that and get a TaosQuery object, which upon executing with the `execute_a` function, returns a promise that resolves with a TaosResult object.

```javascript
var promise1 = cursor.query('select count(*), avg(v1), avg(v2) from meter1;').execute_a()
var promise2 = cursor.query('select count(*), avg(v1), avg(v2) from meter2;').execute_a();
promise1.then(function(result) {
  result.pretty();
})
promise2.then(function(result) {
  result.pretty();
})
```

## `@tdengine/rest`

This is a TDengine's RESTful connector in TypeScript. It's depend on [node-fetch v2](https://github.com/node-fetch/node-fetch/tree/2.x). Using `fetch(url,options)` to send sql statement and receive response.

### Installation

```bash
npm i @tdengine/rest
```

### Usage

```TypeScript
import { options, connect } from '@tdengine/rest'
options.path='/rest/sql';
// set host
options.host='localhost';
// set other options like user/passwd

let conn = connect(options);
let cursor = conn.cursor();
(async()=>{
    let result = await cursor.query('show databases');

    // Get Result object, return Result object.
    console.log(result.getResult());
    // Get status, return 'succ'|'error'.
    console.log(result.getStatus());
    // Get head,return response head (Array<any>|undefined,when execute failed this is undefined).
    console.log(result.getHead());
    // Get Meta data, return Meta[]|undefined(when execute failed this is undefined).
    console.log(result.getMeta());
    // Get data,return Array<Array<any>>|undefined(when execute failed this is undefined).
    console.log(result.getData());
    // Get affect rows,return number|undefined(when execute failed this is undefined).
    console.log(result.getAffectRows());
    // Get command,return SQL send to server(need to `query(sql,false)`,set 'pure=false',default true).
    console.log(result.getCommand());
    // Get error code ,return number|undefined(when execute failed this is undefined).
    console.log(result.getErrCode());
    // Get error string,return string|undefined(when execute failed this is undefined).
    console.log(result.getErrStr());
})()

```
## `@tdengine/websocket`
This is a TDengine's WEBSOCKET connector in TypeScript. 

### Installation

```bash
npm i @tdengine/websocket
```
### Usage

Create a connection using DSN

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
```TypeScript
import { WSConfig } from '../src/common/config';
import { sqlConnect } from '../index'
let dsn = 'ws://root:taosdata@127.0.0.1:6041/ws';
(async () => {
    let wsSql = null;
    try {
        let conf :WSConfig = new WSConfig(dsn)
        wsSql = await sqlConnect(conf)
    } catch (err:any) {
        console.error(err);
    } finally {
        if (wsSql) {
            wsSql.Close();
        }
    }
})();
```

Create a connection using config

```TypeScript
import { WSConfig } from '../src/common/config';
import { sqlConnect } from '../index'

let dns = 'ws://127.0.0.1:6041/ws'
let conf :WSConfig = new WSConfig(dns)
conf.SetUser('root')
conf.SetPwd('taosdata')
(async () => {
    let wsSql = null;
    try {
        wsSql = await sqlConnect(conf)
    } catch (err:any) {
        console.error(err);
    
    } finally {
        if (wsSql) {
            wsSql.Close();
        }
    }
})();
```
Sql usage examples
```TypeScript
import { WSConfig } from '../src/common/config';
import { sqlConnect } from '../index'

let dns = 'ws://127.0.0.1:6041/ws'
let conf :WSConfig = new WSConfig(dns)
conf.SetUser('root')
conf.SetPwd('taosdata')
(async () => {
    let wsSql = null;
    let wsRows = null;
    let reqId = 0;
    try {
        wsSql = await sqlConnect(conf)

        let version = await wsSql.Version();
        console.log(version);

        let taosResult = await wsSql.Exec('show databases', reqId++)
        console.log(taosResult);
        
        taosResult = await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;',reqId++);
        console.log(taosResult);

        taosResult = await wsSql.Exec('use power',reqId++)
        console.log(taosResult);

        taosResult = await wsSql.Exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);', reqId++);
        console.log(taosResult);
    
        taosResult = await wsSql.Exec('describe meters', reqId++)
        console.log(taosResult);

        taosResult = await wsSql.Exec('INSERT INTO d1001 USING meters TAGS ("California.SanFrancisco", 3) VALUES (NOW, 10.2, 219, 0.32)', reqId++)
        console.log(taosResult);

        wsRows = await wsSql.Query('select * from meters', reqId++);
        let meta = wsRows.GetMeta()
        console.log("wsRow:meta:=>", meta);

        while (await wsRows.Next()) {
            let result = await wsRows.GetData();
            console.log('queryRes.Scan().then=>', result);
        }
        await wsRows.Close()
    
    } catch (e) {
        let err:any = e
        console.error(err);
    
    } finally {
        if (wsRows) {
            await wsRows.Close();
        }
        if (wsSql) {
            wsSql.Close();
        }
    }
})();
```

Writing data via parameter binding

TDengine's node.js connection implementation has significantly improved its support for data writing (INSERT) scenarios via bind interface. Writing data in this way avoids the resource consumption of SQL syntax parsing, resulting in significant write performance improvements in many cases.

usage examples

```TypeScript
import { WSConfig } from '../src/common/config';
import { sqlConnect } from '../index';

let db = 'power'
let stable = 'meters'
let tags = ['California.SanFrancisco', 3];
let multi = [
    [1706786044994, 1706786044995, 1706786044996],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
];

(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let dsn = 'ws://root:taosdata@127.0.0.1:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        connector = await sqlConnect(wsConf);
        stmt = await connector.StmtInit()
        await stmt.Prepare(`INSERT INTO ? USING ${db}.${stable} TAGS (?, ?) VALUES (?, ?, ?, ?)`);
        await stmt.SetTableName('d1001');

        let tagParams = stmt.NewStmtParam()
        tagParams.SetVarcharColumn([tags[0]])
        tagParams.SetIntColumn([tags[1]])
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam()
        bindParams.SetTimestampColumn(multi[0]);
        bindParams.SetFloatColumn(multi[1])
        bindParams.SetIntColumn(multi[2])
        bindParams.SetFloatColumn(multi[3])
        await stmt.BinaryBind(bindParams);
        await stmt.Batch();
        await stmt.Exec();
    } catch (e) {
        console.error(e);
    }finally {
        if (stmt) {
            stmt.Close();
        }
        if (connector) {
            connector.Close();
        }
    }
})();
```
Schemaless Writing

TDengine has added the ability to schemaless writing. It is compatible with InfluxDB's Line Protocol, OpenTSDB's telnet line protocol, and OpenTSDB's JSON format protocol. See schemaless writing for details.

usage examples
```TypeScript
import { WSConfig } from '../src/common/config';
import { Precision, SchemalessProto } from '../src/sql/wsProto';
import { sqlConnect } from '../index';

let db = 'power'
let dsn = 'ws://root:taosdata@127.0.0.1:6041/ws';
let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000";
let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0";
let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}";

async function Prepare() {
    let conf :WSConfig = new WSConfig(dsn)
    let wsSql = await sqlConnect(conf)
    await wsSql.Exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    wsSql.Close()
}

(async () => {
    let wsSchemaless = null
    try {
        await Prepare()
        let conf = new WSConfig(dsn);
        conf.SetDb(db)
        wsSchemaless = await sqlConnect(conf)
        await wsSchemaless.SchemalessInsert([influxdbData], SchemalessProto.InfluxDBLineProtocol, Precision.NANO_SECONDS, 0);
        await wsSchemaless.SchemalessInsert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, Precision.SECONDS, 0);
        await wsSchemaless.SchemalessInsert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, Precision.SECONDS, 0);
    } catch (e) {
        console.error(e);
    }finally {
        if (wsSchemaless) {
            wsSchemaless.Close();
        }
    }
})();
```

Subscriptions

The TDengine node.js Connector supports subscription functionality with the following application API.

create subscriptions

```TypeScript
    let createTopic = `create topic if not exists pwer_meters_topic as select * from power.meters`
    let dsn = 'ws://root:taosdata@127.0.0.1:6041/ws';
    let conf :WSConfig = new WSConfig(dsn)
    let ws = await sqlConnect(conf);
    await ws.Exec(createTopic);
    ws.Close()
```

The two parameters of the subscribe() method have the following meanings.

pwer_meters_topic: the subscribed topic (i.e., name). This parameter is the unique identifier of the subscription.

sql: the query statement of the subscription, this statement can only be select statement, only the original data should be queried, and you can query only the data in the positive time order
The above example will use the SQL command select ts, speed from speed_table to create a subscription named topic_speed. If the subscription exists.

Create Consumer and Subscribe topic
```TypeScript
    let configMap = new Map([
        [TMQConstants.GROUP_ID, "gId"],
        [TMQConstants.CONNECT_USER, "root"],
        [TMQConstants.CONNECT_PASS, "taosdata"],
        [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
        [TMQConstants.CLIENT_ID, 'test_tmq_client'],
        [TMQConstants.WS_URL, 'ws://127.0.0.1:6041/rest/tmq'],
        [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
        [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
    ]);
    consumer = await tmqConnect(configMap);
    await consumer.Subscribe(topics);
```
    enable.auto.commit: whether to allow auto commit.
    group.id: group id of consumer
    client.id: client id, maximum length: 192
    auto.offset.reset:earliest: subscribe from the earliest data; latest: subscribe from the latest data
    auto.commit.interval.ms:Interval for automatic commits, in milliseconds

usage examples

```TypeScript
import { WSConfig } from "../src/common/config";
import { TMQConstants } from "../src/tmq/constant";
import { sqlConnect, tmqConnect } from "../index";

const stable = 'meters';
const db = 'power'
const topics:string[] = ['pwer_meters_topic']
let configMap = new Map([
    [TMQConstants.GROUP_ID, "gId"],
    [TMQConstants.CONNECT_USER, "root"],
    [TMQConstants.CONNECT_PASS, "taosdata"],
    [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [TMQConstants.CLIENT_ID, 'test_tmq_client'],
    [TMQConstants.WS_URL, 'ws://127.0.0.1:6041/rest/tmq'],
    [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
    [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);

async function Prepare() {
    let dsn = 'ws://root:taosdata@192.168.1.95:6051/ws';
    let conf :WSConfig = new WSConfig(dsn)
    const createDB = `create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`
    const createStable = `CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`
    let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
    const useDB = `use ${db}`
  
    let ws = await sqlConnect(conf);
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createStable);
    await ws.Exec(createTopic);
    for (let i = 0; i < 10; i++) {
        await ws.Exec(`INSERT INTO d1001 USING ${stable} TAGS ("California.SanFrancisco", 3) VALUES (NOW, ${10+i}, ${200+i}, ${0.32 + i})`)
    }
    ws.Close()
}

(async () => {
    let consumer = null
    try {
        await Prepare()
        consumer = await tmqConnect(configMap);
        await consumer.Subscribe(topics);
        for (let i = 0; i < 5; i++) {
            let res = await consumer.Poll(500);
            for (let [key, value] of res) {
                console.log(key, value);
            }
            if (res.size == 0) {
                break;
            }
            await consumer.Commit();
        }

        let assignment = await consumer.Assignment()
        console.log(assignment)
        await consumer.SeekToBeginning(assignment)
        await consumer.Unsubscribe()
    } catch (e:any) {
        console.error(e);
    } finally {
        if (consumer) {
            consumer.Close();
        }
    }
})();

```
