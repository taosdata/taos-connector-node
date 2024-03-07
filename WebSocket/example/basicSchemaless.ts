import { WSConfig } from '../src/common/config';
import { SchemalessProto, WsSchemaless } from '../src/schemaless/wsSchemaless';
let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/schemaless';

let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000";
let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0";
let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}";

(async () => {
  let wsSchemaless = null
  try {
    let wsConf = new WSConfig(dsn);
    wsConf.SetDb('test')
    wsSchemaless = await WsSchemaless.NewConnector(wsConf)
    await wsSchemaless.Insert([influxdbData], SchemalessProto.InfluxDBLineProtocol, "ms", 0);
    await wsSchemaless.Insert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, "ms", 0);
    await wsSchemaless.Insert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, "ms", 0);
  } catch (e) {
    console.error(e);
  }finally {
    if (wsSchemaless) {
        wsSchemaless.Close();
    }
  }
})();
