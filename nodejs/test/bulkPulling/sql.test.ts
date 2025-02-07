import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { Sleep } from "../utils";

let dns = 'ws://localhost:6041'
beforeAll(async () => {
    let conf :WSConfig = new WSConfig(dns)
    conf.setUser('root')
    conf.setPwd('taosdata')
    let wsSql = await WsSql.open(conf)
    await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await Sleep(100)
    await wsSql.exec('use power')
    await wsSql.exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    await wsSql.close()
})

describe('TDWebSocket.WsSql()', () => {
    jest.setTimeout(20 * 1000)
    test('normal connect', async() => {
        let wsSql = null;
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power')
        wsSql = await WsSql.open(conf)
        expect(wsSql.state()).toBeGreaterThan(0)
        await wsSql.close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let wsSql = null;
        try {
            let conf :WSConfig = new WSConfig(dns)
            conf.setUser('root')
            conf.setPwd('taosdata')
            conf.setDb('jest')
            wsSql = await WsSql.open(conf)
        }catch(e){
            let err:any = e
            expect(err.message).toMatch('Database not exist')
        }finally{
            if(wsSql) {
                await wsSql.close()
            }
        }
    })
    test('get taosc version', async() => {  
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let version = await wsSql.version()
        await wsSql.close()
        console.log(version);
        expect(version).toBeTruthy()
    })

    test('show databases', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('show databases')
        await wsSql.close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('create databases', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;')
        await wsSql.close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('create stable', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy()

        taosResult = await wsSql.exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
        await wsSql.close()
        console.log(taosResult);
        expect(taosResult).toBeTruthy()
    })

    test('insert recoder', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy()

        taosResult = await wsSql.exec('describe meters')
        console.log(taosResult);
    
        taosResult = await wsSql.exec('INSERT INTO d1001 USING meters (location, groupid) TAGS ("California", 3) VALUES (NOW, 10.2, 219, 0.32)')
        console.log(taosResult);
        expect(taosResult.getAffectRows()).toBeGreaterThanOrEqual(1)
        await wsSql.close()
    
    })

    test('query sql', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy() 
        for (let i = 0; i < 10; i++) {
            let wsRows = await wsSql.query('select * from meters limit 3');
            expect(wsRows).toBeTruthy()
            let meta = wsRows.getMeta()
            expect(meta).toBeTruthy()
            console.log("wsRow:meta:=>", meta);
            while (await wsRows.next()) {
                let result = await wsRows.getData();
                expect(result).toBeTruthy()
            }
            await wsRows.close()
        }

        await wsSql.close()
    })

    test('query sql no getdata', async()=>{
        let conf :WSConfig = new WSConfig(dns)
        conf.setUser('root')
        conf.setPwd('taosdata')
        let wsSql = await WsSql.open(conf)
        let taosResult = await wsSql.exec('use power')
        console.log(taosResult);
        expect(taosResult).toBeTruthy() 
        let wsRows = await wsSql.query('select * from meters');
        await wsRows.close()
        await wsSql.close()
    })
})

afterAll(async () => {
    WebSocketConnectionPool.instance().destroyed()
})