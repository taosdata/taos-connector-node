import { WSConfig } from "../../src/common/config";
import { SchemalessProto, WsSchemaless } from "../../src/schemaless/wsSchemaless";

describe.skip('TDWebSocket.WsSchemaless()', () => {
    let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000"
    let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0"
    let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}"

    test('normal connect', async() => {
        let dns = 'ws://192.168.1.95:6051/ws'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSchemaless.NewConnector(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        wsSchemaless.Close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let wsSchemaless = null;
        try {
            let dns = 'ws://192.168.1.95:6051/ws'
            let conf :WSConfig = new WSConfig(dns)
            conf.SetUser('root')
            conf.SetPwd('taosdata')
            conf.SetDb('jest')
            wsSchemaless = await WsSchemaless.NewConnector(conf)
        }catch(e :any){
            expect(e.message).toMatch('Database not exist')
        }finally{
            if(wsSchemaless) {
                wsSchemaless.Close()
            }
        }
    })

    test('normal insert', async() => {
        let dns = 'ws://192.168.1.95:6051/ws'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSchemaless.NewConnector(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        await wsSchemaless.Insert([influxdbData], SchemalessProto.InfluxDBLineProtocol, "ns", 0);
        await wsSchemaless.Insert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, "s", 0);
        await wsSchemaless.Insert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, "s", 0);
        wsSchemaless.Close();
    });

    test('SchemalessProto error', async() => {
        let dns = 'ws://192.168.1.95:6051/ws'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSchemaless.NewConnector(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        try {
            await wsSchemaless.Insert([influxdbData], SchemalessProto.OpenTSDBTelnetLineProtocol, "ns", 0);
        }catch (e:any) {
            expect(e.message).toMatch('invalid timestamp')
        }

        wsSchemaless.Close();
    });
})