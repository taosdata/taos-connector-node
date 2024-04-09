import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";

beforeAll(async () => {
    let dns = 'ws://192.168.1.95:6041/ws'
    let conf :WSConfig = new WSConfig(dns)
    conf.SetUser('root')
    conf.SetPwd('taosdata')
    let wsSql = await WsSql.Open(conf)
    await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.Exec('use power')
    await wsSql.Exec('CREATE STABLE if not exists power.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    wsSql.Close()
})

describe('TDWebSocket.WsSql()', () => {
    jest.setTimeout(20 * 1000)
    test('normal connect', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsSql = null;
        let conf :WSConfig = new WSConfig(dsn)
        conf.SetDb('power')
        wsSql = await WsSql.Open(conf)
        expect(wsSql.State()).toBeGreaterThan(0)
        wsSql.Close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let wsSql = null;
        try {
            let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
            let conf :WSConfig = new WSConfig(dsn)
            conf.SetDb('jest')
            wsSql = await WsSql.Open(conf)
        }catch(e){
            let err:any = e
            expect(err.message).toMatch('Database not exist')
        }finally{
            if(wsSql) {
                wsSql.Close()
            }
        }
    })
    test('get taosc version', async() => {  
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let version = await wsSql.Version()
        wsSql.Close()
        console.log(version);
        expect(version).toBeTruthy()
    })

    test('show databases', async()=>{
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let taosResult = await wsSql.Exec('show databases')
        wsSql.Close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('create databases', async()=>{
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let taosResult = await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;')
        wsSql.Close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('create stable', async()=>{
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let taosResult = await wsSql.Exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy()

        taosResult = await wsSql.Exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
        wsSql.Close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('insert recoder', async()=>{
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let taosResult = await wsSql.Exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy()

        taosResult = await wsSql.Exec('describe meters')
        console.log(taosResult);
    
        taosResult = await wsSql.Exec('INSERT INTO d1001 USING meters (location, groupid) TAGS ("California.SanFrancisco", 3) VALUES (NOW, 10.2, 219, 0.32)')
        console.log(taosResult);
        expect(taosResult.GetAffectRows()).toBeGreaterThanOrEqual(1)
    
    })

    test('query sql', async()=>{
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let conf :WSConfig = new WSConfig(dsn)
        let wsSql = await WsSql.Open(conf)
        let taosResult = await wsSql.Exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy() 
        for (let i = 0; i < 10; i++) {
            let wsRows = await wsSql.Query('select * from meters limit 3');
            expect(wsRows).toBeTruthy()
            let meta = wsRows.GetMeta()
            expect(meta).toBeTruthy()
            console.log("wsRow:meta:=>", meta);
            while (await wsRows.Next()) {
                let result = await wsRows.GetData();
                expect(result).toBeTruthy()
            }
            wsRows.Close()
        }

        wsSql.Close()
    })
})