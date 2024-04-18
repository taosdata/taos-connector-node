import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";

beforeAll(async () => {
    let dns = 'ws://localhost:6041'
    let conf :WSConfig = new WSConfig(dns)
    conf.SetUser('root')
    conf.SetPwd('taosdata')   
    let wsSql = await WsSql.Open(conf)
    await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.Exec('CREATE STABLE if not exists power.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    await wsSql.Close()
})
describe('TDWebSocket.Stmt()', () => {
    jest.setTimeout(20 * 1000)
    let tags = ['California.SanFrancisco', 3];
    let multi = [
    // [1709183268567],
    // [10.2],
    // [292],
    // [0.32],      
    [1709183268567, 1709183268568, 1709183268569],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
    ];
    test('normal connect', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Close()
        await connector.Close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let connector = null;
        try {
            let dsn = 'ws://root:taosdata@localhost:6041';
            let wsConf :WSConfig = new WSConfig(dsn)
            wsConf.SetDb('jest')
            connector = await WsSql.Open(wsConf) 
            let stmt = await connector.StmtInit() 
            await stmt.Close()
        }catch(e){
            let err:any = e
            expect(err.message).toMatch('Database not exist')
        }finally{
            if(connector) {
                await connector.Close()
            }
        }
    })

    test('normal Prepare', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn([tags[0]]);
        params.SetIntColumn([tags[1]]);        
        await stmt.SetBinaryTags(params)
        await stmt.Close()
        await connector.Close();
    }); 

    test('set tag error', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn([tags[0]]);
        try {
          await stmt.SetBinaryTags(params)          
        } catch(err:any) {
            expect(err.message).toMatch('stmt tags count not match')
        }       
        await stmt.Close()
        await connector.Close();
    });    
    
    test('error Prepare table', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        try{
            await stmt.Prepare('INSERT ? INTO ? USING powr.meters TAGS (?, ?) VALUES (?, ?, ?, ?)');
            await stmt.SetTableName('d1001');
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("syntax error near '? into ? using powr.meters tags (?, ?) values (?, ?, ?, ?)' (keyword INTO is expected)")
        }
        await stmt.Close()
        await connector.Close();
    }); 

    test('error Prepare tag', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        try{
            await stmt.Prepare('INSERT INTO ? USING powr.meters TAGS (?, ?, ?) VALUES (?, ?, ?, ?)');
            await stmt.SetTableName('d1001');
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Database not exist")
        }
        await stmt.Close()
        await connector.Close();
    });

    test('normal BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        // let connector = WsStmtConnect.NewConnector(wsConf) 
        // let stmt = await connector.Init()
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');

        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 

        let lastTs = 0
        const allp:any[] = []
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < multi[0].length; j++) {
                multi[0][j] = multi[0][0] + j;
                lastTs = multi[0][j]
            }

            let dataParams = stmt.NewStmtParam()
            dataParams.SetTimestampColumn(multi[0])
            dataParams.SetFloatColumn(multi[1])
            dataParams.SetIntColumn(multi[2])
            dataParams.SetFloatColumn(multi[3])
            allp.push(stmt.BinaryBind(dataParams))
            multi[0][0] = lastTs + 1

        }
        await Promise.all(allp)
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(30)
        await stmt.Close()
        await connector.Close();
    });


    test('error BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3, 10.4, 10.5],
            [292, 293, 294],
            [0.32, 0.33, 0.31],
            ];
        try{
            let dataParams = stmt.NewStmtParam()
            dataParams.SetTimestampColumn(multi[0])
            dataParams.SetFloatColumn(multi[1])
            dataParams.SetIntColumn(multi[2])
            dataParams.SetFloatColumn(multi[3])
            await stmt.BinaryBind(dataParams)
            await stmt.Batch()
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("wrong row length")
        }
        await stmt.Close()
        await connector.Close();
    });

    test('no Batch', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];
        try{
            let dataParams = stmt.NewStmtParam()
            dataParams.SetTimestampColumn(multi[0])
            dataParams.SetFloatColumn(multi[1])
            dataParams.SetIntColumn(multi[2])
            dataParams.SetFloatColumn(multi[3])
            await stmt.BinaryBind(dataParams)
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Stmt API usage error")
        }
        await stmt.Close()
        await connector.Close();
    });

    test('Batch after BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 
        let multi1 = [
            [1709188881548, 1709188881549],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];
        let multi2 = [
            [1709188881550, 1709188881551],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];    
        
        let dataParams = stmt.NewStmtParam()
        dataParams.SetTimestampColumn(multi1[0])
        dataParams.SetFloatColumn(multi1[1])
        dataParams.SetIntColumn(multi1[2])
        dataParams.SetFloatColumn(multi1[3])
        await stmt.BinaryBind(dataParams)
        await stmt.Batch()

        dataParams = stmt.NewStmtParam()
        dataParams.SetTimestampColumn(multi2[0])
        dataParams.SetFloatColumn(multi2[1])
        dataParams.SetIntColumn(multi2[2])
        dataParams.SetFloatColumn(multi2[3])
        await stmt.BinaryBind(dataParams)
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(4)
        await stmt.Close()
        await connector.Close();
    });

    test('no set tag', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        // await stmt.SetTags(tags)
        try{
            let dataParams = stmt.NewStmtParam()
            dataParams.SetTimestampColumn(multi[0])
            dataParams.SetFloatColumn(multi[1])
            dataParams.SetIntColumn(multi[2])
            dataParams.SetFloatColumn(multi[3])
            await stmt.BinaryBind(dataParams)
            await stmt.Batch()
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Retry needed")
        }
        await stmt.Close()
        await connector.Close();
    });

    test('normal binary BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1002');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 
        let dataParams = stmt.NewStmtParam()
        dataParams.SetTimestampColumn(multi[0])
        dataParams.SetFloatColumn(multi[1])
        dataParams.SetIntColumn(multi[2])
        dataParams.SetFloatColumn(multi[3])
        await stmt.BinaryBind(dataParams)
        
        await stmt.Batch()
        await stmt.Exec()

        let result = await connector.Exec("select * from power.meters")
        console.log(result)
        await stmt.Close()
        await connector.Close();

    });

    test('normal json BindParam', async() => {
        let dsn = 'ws://root:taosdata@localhost:6041';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        let params = stmt.NewStmtParam()
        params.SetVarcharColumn(['SanFrancisco']);
        params.SetIntColumn([7]);
        await stmt.SetBinaryTags(params) 
        let multi1 = [
            [1709188881548, 1709188881549],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];        
        let dataParams = stmt.NewStmtParam()
        dataParams.SetTimestampColumn(multi1[0])
        dataParams.SetFloatColumn(multi1[1])
        dataParams.SetIntColumn(multi1[2])
        dataParams.SetFloatColumn(multi1[3])
        await stmt.BinaryBind(dataParams)
        await stmt.Batch()
        await stmt.Exec()
        await stmt.Close()
        await connector.Close();
    });
})

afterAll(async () => {
    WebSocketConnectionPool.Instance().Destroyed()
})