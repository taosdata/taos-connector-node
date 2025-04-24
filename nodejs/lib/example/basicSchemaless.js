"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../src/common/config");
const wsProto_1 = require("../src/sql/wsProto");
const src_1 = require("../src");
let dsn = 'ws://root:taosdata@localhost:6041';
let db = 'power';
let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000";
let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0";
let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}";
const dropDB = `drop database if exists ${db}`;
async function Prepare() {
    let conf = new config_1.WSConfig(dsn);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await (0, src_1.sqlConnect)(conf);
    await wsSql.exec(dropDB);
    await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.exec('CREATE STABLE if not exists power.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    wsSql.close();
}
(async () => {
    let wsSchemaless = null;
    try {
        await Prepare();
        let conf = new config_1.WSConfig(dsn);
        conf.setUser('root');
        conf.setPwd('taosdata');
        conf.setDb('power');
        wsSchemaless = await (0, src_1.sqlConnect)(conf);
        await wsSchemaless.schemalessInsert([influxdbData], wsProto_1.SchemalessProto.InfluxDBLineProtocol, wsProto_1.Precision.NANO_SECONDS, 0);
        await wsSchemaless.schemalessInsert([telnetData], wsProto_1.SchemalessProto.OpenTSDBTelnetLineProtocol, wsProto_1.Precision.SECONDS, 0);
        await wsSchemaless.schemalessInsert([jsonData], wsProto_1.SchemalessProto.OpenTSDBJsonFormatProtocol, wsProto_1.Precision.SECONDS, 0);
        wsSchemaless.close();
    }
    catch (e) {
        console.error(e);
    }
    finally {
        if (wsSchemaless) {
            await wsSchemaless.close();
        }
        (0, src_1.destroy)();
    }
})();
