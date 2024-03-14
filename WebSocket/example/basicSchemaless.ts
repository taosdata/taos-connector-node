import { WSConfig } from '../src/common/config';
import { SchemalessProto, WsSchemaless } from '../src/schemaless/wsSchemaless';
import { Precision } from '../src/sql/wsProto';
import { WsSql } from '../src/sql/wsSql';
let dsn = 'ws://root:taosdata@192.168.1.95:6051/ws';
let db = 'power'
let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000";
let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0";
let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}";
// const dropDB = `drop database if exists ${db}`

async function Prepare() {
    let conf :WSConfig = new WSConfig(dsn)
    let wsSql = await WsSql.Open(conf)
    await wsSql.Exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    wsSql.Close()
}

(async () => {
    let wsSchemaless = null
    try {
        await Prepare()
        let conf = new WSConfig(dsn);
        conf.SetDb(db)
        wsSchemaless = await WsSql.Open(conf)
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
