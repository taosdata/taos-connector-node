import { WSConfig } from "../../src/common/config";
import { Precision, SchemalessProto } from "../../src/sql/wsProto";
import { WsSql } from "../../src/sql/wsSql";




beforeAll(async () => {
    let dns = 'ws://192.168.1.95:6041'  
    let conf :WSConfig = new WSConfig(dns)
    conf.SetUser('root')
    conf.SetPwd('taosdata')

    let wsSql = await WsSql.Open(conf)
    await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.Exec('CREATE STABLE if not exists power.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    wsSql.Close()
})


describe('TDWebSocket.WsSchemaless()', () => {
    jest.setTimeout(20 * 1000)
    let influxdbData = "st,t1=3i64,t2=4f64,t3=\"t3\" c1=3i64,c3=L\"passit\",c2=false,c4=4f64 1626006833639000000"
    let telnetData = "stb0_0 1626006833 4 host=host0 interface=eth0"
    let jsonData = "{\"metric\": \"meter_current\",\"timestamp\": 1626846400,\"value\": 10.3, \"tags\": {\"groupid\": 2, \"location\": \"California.SanFrancisco\", \"id\": \"d1001\"}}"

    test('normal connect', async() => {
        let dns = 'ws://192.168.1.95:6041'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSql.Open(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        wsSchemaless.Close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let wsSchemaless = null;
        try {
            let dns = 'ws://192.168.1.95:6041'
            let conf :WSConfig = new WSConfig(dns)
            conf.SetUser('root')
            conf.SetPwd('taosdata')
            conf.SetDb('jest')
            wsSchemaless = await WsSql.Open(conf)
        }catch(e :any){
            console.log(e)
            expect(e.message).toMatch('Database not exist')
        }finally{
            if(wsSchemaless) {
                wsSchemaless.Close()
            }
        }
    })

    test('normal insert', async() => {
        let dns = 'ws://192.168.1.95:6041'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSql.Open(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        await wsSchemaless.SchemalessInsert([influxdbData], SchemalessProto.InfluxDBLineProtocol, Precision.NANO_SECONDS, 0);
        await wsSchemaless.SchemalessInsert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, Precision.SECONDS, 0);
        await wsSchemaless.SchemalessInsert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, Precision.SECONDS, 0);
        wsSchemaless.Close();
    });

    test('normal wsSql insert', async() => {
        let dns = 'ws://192.168.1.95:6041'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSql.Open(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        await wsSchemaless.SchemalessInsert([influxdbData], SchemalessProto.InfluxDBLineProtocol, Precision.NOT_CONFIGURED, 0);
        await wsSchemaless.SchemalessInsert([influxdbData], SchemalessProto.InfluxDBLineProtocol, Precision.NANO_SECONDS, 0);
        await wsSchemaless.SchemalessInsert([telnetData], SchemalessProto.OpenTSDBTelnetLineProtocol, Precision.SECONDS, 0);
        await wsSchemaless.SchemalessInsert([jsonData], SchemalessProto.OpenTSDBJsonFormatProtocol, Precision.SECONDS, 0);
        
        wsSchemaless.Close();
    });

    test('SchemalessProto error', async() => {
        let dns = 'ws://192.168.1.95:6041'
        let conf :WSConfig = new WSConfig(dns)
        conf.SetUser('root')
        conf.SetPwd('taosdata')
        conf.SetDb('power')
        let wsSchemaless = await WsSql.Open(conf)
        expect(wsSchemaless.State()).toBeGreaterThan(0)
        try {
            await wsSchemaless.SchemalessInsert([influxdbData], SchemalessProto.OpenTSDBTelnetLineProtocol, Precision.NANO_SECONDS, 0);
        }catch (e:any) {
            expect(e.message).toMatch('invalid timestamp')
        }

        wsSchemaless.Close();
    });
})