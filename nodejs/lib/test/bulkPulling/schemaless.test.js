"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wsConnectorPool_1 = require("../../src/client/wsConnectorPool");
const config_1 = require("../../src/common/config");
const wsProto_1 = require("../../src/sql/wsProto");
const wsSql_1 = require("../../src/sql/wsSql");
let dns = 'ws://localhost:6041';
beforeAll(async () => {
    let conf = new config_1.WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await wsSql_1.WsSql.open(conf);
    await wsSql.exec('drop database if exists power_schemaless;');
    await wsSql.exec('create database if not exists power_schemaless KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.exec('CREATE STABLE if not exists power_schemaless.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    await wsSql.close();
});
describe('TDWebSocket.WsSchemaless()', () => {
    jest.setTimeout(20 * 1000);
    let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000";
    let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0";
    let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}";
    test('normal connect', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power_schemaless');
        let wsSchemaless = await wsSql_1.WsSql.open(conf);
        expect(wsSchemaless.state()).toBeGreaterThan(0);
        await wsSchemaless.close();
    });
    test('connect db with error', async () => {
        expect.assertions(1);
        let wsSchemaless = null;
        try {
            let conf = new config_1.WSConfig(dns);
            conf.setUser('root');
            conf.setPwd('taosdata');
            conf.setDb('jest');
            wsSchemaless = await wsSql_1.WsSql.open(conf);
        }
        catch (e) {
            console.log(e);
            expect(e.message).toMatch('Database not exist');
        }
        finally {
            if (wsSchemaless) {
                await wsSchemaless.close();
            }
        }
    });
    test('normal insert', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power_schemaless');
        let wsSchemaless = await wsSql_1.WsSql.open(conf);
        expect(wsSchemaless.state()).toBeGreaterThan(0);
        await wsSchemaless.schemalessInsert([influxdbData], wsProto_1.SchemalessProto.InfluxDBLineProtocol, wsProto_1.Precision.NANO_SECONDS, 0);
        await wsSchemaless.schemalessInsert([telnetData], wsProto_1.SchemalessProto.OpenTSDBTelnetLineProtocol, wsProto_1.Precision.SECONDS, 0);
        await wsSchemaless.schemalessInsert([jsonData], wsProto_1.SchemalessProto.OpenTSDBJsonFormatProtocol, wsProto_1.Precision.SECONDS, 0);
        await wsSchemaless.close();
    });
    test('normal wsSql insert', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power_schemaless');
        let wsSchemaless = await wsSql_1.WsSql.open(conf);
        expect(wsSchemaless.state()).toBeGreaterThan(0);
        await wsSchemaless.schemalessInsert([influxdbData], wsProto_1.SchemalessProto.InfluxDBLineProtocol, wsProto_1.Precision.NOT_CONFIGURED, 0);
        await wsSchemaless.schemalessInsert([influxdbData], wsProto_1.SchemalessProto.InfluxDBLineProtocol, wsProto_1.Precision.NANO_SECONDS, 0);
        await wsSchemaless.schemalessInsert([telnetData], wsProto_1.SchemalessProto.OpenTSDBTelnetLineProtocol, wsProto_1.Precision.SECONDS, 0);
        await wsSchemaless.schemalessInsert([jsonData], wsProto_1.SchemalessProto.OpenTSDBJsonFormatProtocol, wsProto_1.Precision.SECONDS, 0);
        await wsSchemaless.close();
    });
    test('SchemalessProto error', async () => {
        let conf = new config_1.WSConfig(dns);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power_schemaless');
        let wsSchemaless = await wsSql_1.WsSql.open(conf);
        expect(wsSchemaless.state()).toBeGreaterThan(0);
        try {
            await wsSchemaless.schemalessInsert([influxdbData], wsProto_1.SchemalessProto.OpenTSDBTelnetLineProtocol, wsProto_1.Precision.NANO_SECONDS, 0);
        }
        catch (e) {
            expect(e.message).toMatch('parse timestamp failed');
        }
        await wsSchemaless.close();
    });
});
afterAll(async () => {
    let conf = new config_1.WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await wsSql_1.WsSql.open(conf);
    await wsSql.exec('drop database if exists power_schemaless;');
    await wsSql.close();
    wsConnectorPool_1.WebSocketConnectionPool.instance().destroyed();
});
