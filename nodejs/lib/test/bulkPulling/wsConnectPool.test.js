"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wsConnectorPool_1 = require("../../src/client/wsConnectorPool");
const config_1 = require("../../src/common/config");
const reqid_1 = require("../../src/common/reqid");
const wsSql_1 = require("../../src/sql/wsSql");
const constant_1 = require("../../src/tmq/constant");
const wsTmq_1 = require("../../src/tmq/wsTmq");
const utils_1 = require("../utils");
let dsn = 'ws://root:taosdata@localhost:6041';
let tags = ['California.SanFrancisco', 3];
let multi = [
    [1709183268567, 1709183268568, 1709183268569],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
];
let configMap = new Map([
    [constant_1.TMQConstants.GROUP_ID, "gId"],
    [constant_1.TMQConstants.CONNECT_USER, "root"],
    [constant_1.TMQConstants.CONNECT_PASS, "taosdata"],
    [constant_1.TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [constant_1.TMQConstants.CLIENT_ID, 'test_tmq_client'],
    [constant_1.TMQConstants.WS_URL, 'ws://localhost:6041'],
    [constant_1.TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
    [constant_1.TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);
const stable = 'meters';
const db = 'power_connect';
const topics = ['pwer_meters_topic'];
let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`;
let stmtIds = [];
async function connect() {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let wsSql = null;
    let conf = new config_1.WSConfig(dsn);
    conf.setDb(db);
    wsSql = await wsSql_1.WsSql.open(conf);
    expect(wsSql.state()).toBeGreaterThan(0);
    console.log(await wsSql.version());
    wsSql.close();
}
async function stmtConnect() {
    let dsn = 'ws://root:taosdata@localhost:6041';
    let wsConf = new config_1.WSConfig(dsn);
    wsConf.setDb(db);
    // let connector = WsStmtConnect.NewConnector(wsConf) 
    // let stmt = await connector.Init()
    let connector = await wsSql_1.WsSql.open(wsConf);
    let stmt = await connector.stmtInit();
    let id = stmt.getStmtId();
    if (id) {
        stmtIds.push(id);
    }
    expect(stmt).toBeTruthy();
    await stmt.prepare(`INSERT INTO ? USING ${stable} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`);
    await stmt.setTableName('d1001');
    await stmt.setJsonTags(tags);
    let lastTs = 0;
    const allp = [];
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < multi[0].length; j++) {
            multi[0][j] = multi[0][0] + j;
            lastTs = multi[0][j];
        }
        allp.push(stmt.jsonBind(multi));
        multi[0][0] = lastTs + 1;
    }
    await Promise.all(allp);
    await stmt.batch();
    await stmt.exec();
    expect(stmt.getLastAffected()).toEqual(30);
    stmt.close();
    connector.close();
}
async function tmqConnect() {
    let consumer = null;
    try {
        consumer = await wsTmq_1.WsConsumer.newConsumer(configMap);
        await consumer.subscribe(topics);
        let res = await consumer.poll(500);
        for (let [key, value] of res) {
            console.log(key, value.getMeta());
            let data = value.getData();
            if (data == null || data.length == 0) {
                break;
            }
            for (let record of data) {
                console.log(record);
            }
        }
        await consumer.commit();
        let assignment = await consumer.assignment();
        console.log(assignment);
        if (arguments && arguments.length > 0)
            await consumer.seekToBeginning(assignment);
        await consumer.unsubscribe();
    }
    catch (e) {
        console.error(e);
    }
    finally {
        if (consumer) {
            consumer.close();
        }
    }
}
beforeAll(async () => {
    let conf = new config_1.WSConfig(dsn);
    let ws = await wsSql_1.WsSql.open(conf);
    await ws.exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`);
    await (0, utils_1.Sleep)(100);
    await ws.exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    await (0, utils_1.Sleep)(100);
    await ws.exec(createTopic, reqid_1.ReqId.getReqID());
    await ws.close();
});
describe('TDWebSocket.WsSql()', () => {
    jest.setTimeout(20 * 1000);
    test('ReqId', async () => {
        const allp = [];
        for (let i = 0; i < 10; i++) {
            allp.push(console.log(reqid_1.ReqId.getReqID()));
        }
        await Promise.all(allp);
    });
    test('normal connect', async () => {
        const allp = [];
        for (let i = 0; i < 20; i++) {
            allp.push(connect());
            allp.push(stmtConnect());
            allp.push(tmqConnect());
        }
        await Promise.all(allp);
        wsConnectorPool_1.WebSocketConnectionPool.instance().destroyed();
        console.log(stmtIds);
    });
});
afterAll(async () => {
    let conf = new config_1.WSConfig(dsn);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await wsSql_1.WsSql.open(conf);
    await wsSql.exec(`drop topic if exists ${topics[0]};`);
    await wsSql.exec(`drop database if exists ${db};`);
    await wsSql.close();
    wsConnectorPool_1.WebSocketConnectionPool.instance().destroyed();
});
