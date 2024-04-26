import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { ReqId } from "../../src/common/reqid";
import { WsSql } from "../../src/sql/wsSql";
import { TMQConstants } from "../../src/tmq/constant";
import { WsConsumer } from "../../src/tmq/wsTmq";

let tags = ['California.SanFrancisco', 3];
let multi = [
[1709183268567, 1709183268568, 1709183268569],
[10.2, 10.3, 10.4],
[292, 293, 294],
[0.32, 0.33, 0.34],
];


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
const stable = 'meters';
const db = 'power'
const topics:string[] = ['pwer_meters_topic']
let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
let stmtIds:number[] = []

async function connect() {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let wsSql = null;
    let conf :WSConfig = new WSConfig(dsn)
    conf.setDb('power')
    wsSql = await WsSql.open(conf)
    expect(wsSql.state()).toBeGreaterThan(0)
    console.log(await wsSql.version()) 
    wsSql.close();
}

async function stmtConnect() {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let wsConf = new WSConfig(dsn);
    wsConf.setDb('power')
    // let connector = WsStmtConnect.NewConnector(wsConf) 
    // let stmt = await connector.Init()
    let connector = await WsSql.open(wsConf) 
    let stmt = await connector.stmtInit()
    let id = stmt.getStmtId()
    if (id) {
        stmtIds.push(id)
    }
    expect(stmt).toBeTruthy()      
    await stmt.prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
    await stmt.setTableName('d1001');
    await stmt.setTags(tags)
    let lastTs = 0
    const allp:any[] = []
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < multi[0].length; j++) {
            multi[0][j] = multi[0][0] + j;
            lastTs = multi[0][j]
        }
        allp.push(stmt.bind(multi))
        multi[0][0] = lastTs + 1

    }
    await Promise.all(allp)
    await stmt.batch()
    await stmt.exec()
    expect(stmt.getLastAffected()).toEqual(30)
    stmt.close()
    connector.close();
}

async function tmqConnect() {
    let consumer = null    
    try {
        consumer = await WsConsumer.newConsumer(configMap);
        await consumer.subscribe(topics);
        
        let res = await consumer.poll(500); 
        for (let [key, value] of res) {
            console.log(key, value);
        }

        await consumer.commit();
        
        
        let assignment = await consumer.assignment()
        console.log(assignment)
        if (arguments && arguments.length > 0)
            await consumer.seekToBeginning(assignment)
        
        await consumer.unsubscribe()
    } catch (e) {
        console.error(e);
    } finally {
        if (consumer) {
           consumer.close();
        }
    }
}

beforeAll(async () => {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let conf :WSConfig = new WSConfig(dsn)
    let ws = await WsSql.open(conf);
    await ws.exec(createTopic, ReqId.getReqID());
    await ws.close()
})

describe('TDWebSocket.WsSql()', () => {
    jest.setTimeout(20 * 1000)
    test('ReqId', async()=> {
        const allp:any[] = []
        for (let i =0; i < 10; i++) {
            allp.push(console.log(ReqId.getReqID()))
        }
        await Promise.all(allp)
    });

    test.skip('normal connect', async() => {
        const allp:any[] = []
        for (let i =0; i < 20; i++) {
            allp.push(connect())
            allp.push(stmtConnect())
            allp.push(tmqConnect())
        }
        await Promise.all(allp)
        WebSocketConnectionPool.instance().destroyed()
        console.log(stmtIds)
    });
})

afterAll(async () => {
    WebSocketConnectionPool.instance().destroyed()
})