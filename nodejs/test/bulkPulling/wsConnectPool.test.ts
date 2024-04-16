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
    [TMQConstants.WS_URL, 'ws://192.168.1.95:6041/rest/tmq'],
    [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
    [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);
const stable = 'meters';
const db = 'power'
const topics:string[] = ['pwer_meters_topic']
let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
let stmtIds:number[] = []

async function connect() {
    let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
    let wsSql = null;
    let conf :WSConfig = new WSConfig(dsn)
    conf.SetDb('power')
    wsSql = await WsSql.Open(conf)
    expect(wsSql.State()).toBeGreaterThan(0)
    console.log(await wsSql.Version()) 
    wsSql.Close();
}

async function stmtConnect() {
    let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
    let wsConf = new WSConfig(dsn);
    wsConf.SetDb('power')
    // let connector = WsStmtConnect.NewConnector(wsConf) 
    // let stmt = await connector.Init()
    let connector = await WsSql.Open(wsConf) 
    let stmt = await connector.StmtInit()
    let id = stmt.getStmtId()
    if (id) {
        stmtIds.push(id)
    }
    expect(stmt).toBeTruthy()      
    await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
    await stmt.SetTableName('d1001');
    await stmt.SetTags(tags)
    let lastTs = 0
    const allp:any[] = []
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < multi[0].length; j++) {
            multi[0][j] = multi[0][0] + j;
            lastTs = multi[0][j]
        }
        allp.push(stmt.Bind(multi))
        multi[0][0] = lastTs + 1

    }
    await Promise.all(allp)
    await stmt.Batch()
    await stmt.Exec()
    expect(stmt.GetLastAffected()).toEqual(30)
    stmt.Close()
    connector.Close();
}

async function tmqConnect() {
    let consumer = null    
    try {
        consumer = await WsConsumer.NewConsumer(configMap);
        await consumer.Subscribe(topics);
        
        let res = await consumer.Poll(500); 
        for (let [key, value] of res) {
            console.log(key, value);
        }

        await consumer.Commit();
        
        
        let assignment = await consumer.Assignment()
        console.log(assignment)
        if (arguments && arguments.length > 0)
            await consumer.SeekToBeginning(assignment)
        
        await consumer.Unsubscribe()
    } catch (e) {
        console.error(e);
    } finally {
        if (consumer) {
           consumer.Close();
        }
    }
}

beforeAll(async () => {
    let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
    let conf :WSConfig = new WSConfig(dsn)
    let ws = await WsSql.Open(conf);
    await ws.Exec(createTopic, ReqId.getReqID());
    ws.Close()
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
        WebSocketConnectionPool.Instance().Destroyed()
        console.log(stmtIds)
    });
})