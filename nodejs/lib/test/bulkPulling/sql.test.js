"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wsConnectorPool_1 = require("../../src/client/wsConnectorPool");
const config_1 = require("../../src/common/config");
const wsSql_1 = require("../../src/sql/wsSql");
const utils_1 = require("../utils");
let dns = 'ws://localhost:6041';
let password1 = 'Ab1!@#$%,.:?<>;~';
let password2 = 'Bc%^&*()-_+=[]{}';
beforeAll(async () => {
    let conf = new config_1.WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await wsSql_1.WsSql.open(conf);
    await wsSql.exec(`CREATE USER user1 PASS '${password1}'`);
    await wsSql.exec(`CREATE USER user2 PASS '${password2}'`);
    await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await (0, utils_1.Sleep)(100);
    await wsSql.exec('use power');
    await wsSql.exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    await wsSql.close();
});
describe('TDWebSocket.WsSql()', () => {
    jest.setTimeout(20 * 1000);
    test('normal connect', async () => {
        let wsSql = null;
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power');
        wsSql = await wsSql_1.WsSql.open(conf);
        expect(wsSql.state()).toBeGreaterThan(0);
        await wsSql.close();
    });
    test('special characters connect1', async () => {
        let wsSql = null;
        let conf = new config_1.WSConfig(dns);
        conf.setUser('user1');
        conf.setPwd(password1);
        wsSql = await wsSql_1.WsSql.open(conf);
        expect(wsSql.state()).toBeGreaterThan(0);
        let version = await wsSql.version();
        expect(version).not.toBeNull();
        expect(version).not.toBeUndefined();
        await wsSql.close();
    });
    test('special characters connect2', async () => {
        let wsSql = null;
        let conf = new config_1.WSConfig(dns);
        conf.setUser('user2');
        conf.setPwd(password2);
        wsSql = await wsSql_1.WsSql.open(conf);
        expect(wsSql.state()).toBeGreaterThan(0);
        let version = await wsSql.version();
        expect(version).not.toBeNull();
        expect(version).not.toBeUndefined();
        await wsSql.close();
    });
    test('connect db with error', async () => {
        expect.assertions(1);
        let wsSql = null;
        try {
            let conf = new config_1.WSConfig(dns);
            conf.setUser('root');
            conf.setPwd('taosdata');
            conf.setDb('jest');
            wsSql = await wsSql_1.WsSql.open(conf);
        }
        catch (e) {
            let err = e;
            expect(err.message).toMatch('Database not exist');
        }
        finally {
            if (wsSql) {
                await wsSql.close();
            }
        }
    });
    test('get taosc version', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let version = await wsSql.version();
        await wsSql.close();
        console.log(version);
        expect(version).toBeTruthy();
    });
    test('show databases', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('show databases');
        await wsSql.close();
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
    });
    test('create databases', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
        await wsSql.close();
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
    });
    test('create stable', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('use power');
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
        taosResult = await wsSql.exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
        await wsSql.close();
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
    });
    test('insert recoder', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('use power');
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
        taosResult = await wsSql.exec('describe meters');
        console.log(taosResult);
        taosResult = await wsSql.exec('INSERT INTO d1001 USING meters (location, groupid) TAGS ("California", 3) VALUES (NOW, 10.2, 219, 0.32)');
        console.log(taosResult);
        expect(taosResult.getAffectRows()).toBeGreaterThanOrEqual(1);
        await wsSql.close();
    });
    test('query sql', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('use power');
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
        for (let i = 0; i < 10; i++) {
            let wsRows = await wsSql.query('select * from meters limit 3');
            expect(wsRows).toBeTruthy();
            let meta = wsRows.getMeta();
            expect(meta).toBeTruthy();
            console.log("wsRow:meta:=>", meta);
            while (await wsRows.next()) {
                let result = await wsRows.getData();
                expect(result).toBeTruthy();
            }
            await wsRows.close();
        }
        await wsSql.close();
    });
    test('query sql no getdata', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        let wsSql = await wsSql_1.WsSql.open(conf);
        let taosResult = await wsSql.exec('use power');
        console.log(taosResult);
        expect(taosResult).toBeTruthy();
        let wsRows = await wsSql.query('select * from meters');
        await wsRows.close();
        await wsSql.close();
    });
});
afterAll(async () => {
    let conf = new config_1.WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await wsSql_1.WsSql.open(conf);
    await wsSql.exec('drop database power');
    await wsSql.exec('DROP USER user1;');
    await wsSql.exec('DROP USER user2;');
    await wsSql.close();
    wsConnectorPool_1.WebSocketConnectionPool.instance().destroyed();
});
