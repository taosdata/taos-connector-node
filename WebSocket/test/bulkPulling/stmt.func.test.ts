import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";

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
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        stmt.Close()
        connector.Close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let connector = null;
        try {
            let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
            let wsConf :WSConfig = new WSConfig(dsn)
            wsConf.SetDb('jest')
            connector = await WsSql.Open(wsConf) 
            await connector.StmtInit()     
        }catch(e){
            let err:any = e
            expect(err.message).toMatch('Database not exist')
        }finally{
            if(connector) {
                connector.Close()
            }
        }
    })

    test('normal Prepare', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
        stmt.Close()
        connector.Close();
    }); 

    test('normal Prepare', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(['California.SanFrancisco'])
        stmt.Close()
        connector.Close();
    });    
    
    test('error Prepare table', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
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
        stmt.Close()
        connector.Close();
    }); 

    test('error Prepare tag', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
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
        stmt.Close()
        connector.Close();
    });

    test('normal BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        // let connector = WsStmtConnect.NewConnector(wsConf) 
        // let stmt = await connector.Init()
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
        let lastTs = 0
        const allp:any[] = []
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < multi[0].length; j++) {
                multi[0][j] = multi[0][0] + j;
                lastTs = multi[0][j]
            }
            allp.push(stmt.Bind(multi))
            multi[0][0] = lastTs + 1

        }
        await Promise.all(allp)
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(30)
        stmt.Close()
        connector.Close();
    });


    test('error BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3, 10.4, 10.5],
            [292, 293, 294],
            [0.32, 0.33, 0.31],
            ];
        try{
            await stmt.Bind(multi)
            await stmt.Batch()
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("wrong row length")
        }
        stmt.Close()
        connector.Close();
    });

    test('no Batch', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];
        try{
            await stmt.Bind(multi)
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Stmt API usage error")
        }
        stmt.Close()
        connector.Close();
    });

    test('Batch after BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
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
        
        await stmt.Bind(multi1)
        await stmt.Batch()
        await stmt.Bind(multi2)
        await stmt.Batch()
        await stmt.Exec()
        expect(stmt.GetLastAffected()).toEqual(4)
        stmt.Close()
        connector.Close();
    });

    test('no set tag', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
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
            await stmt.Bind(multi)
            await stmt.Batch()
            await stmt.Exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Retry needed")
        }
        stmt.Close()
        connector.Close();
    });

    test('normal binary BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
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
        stmt.Close()

        let result = await connector.Exec("select * from power.meters")
        console.log(result)
        connector.Close();

    });

    test('normal json BindParam', async() => {
        let dsn = 'ws://root:taosdata@192.168.1.95:6041/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb('power')
        let connector = await WsSql.Open(wsConf) 
        let stmt = await connector.StmtInit()
        expect(stmt).toBeTruthy()      
        expect(connector.State()).toBeGreaterThan(0)
        await stmt.Prepare('INSERT INTO ? USING power.meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.SetTableName('d1001');
        await stmt.SetTags(tags)
        let multi1 = [
            [1709188881548, 1709188881549],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];        
        await stmt.Bind(multi1)
        await stmt.Batch()
        await stmt.Exec()
        stmt.Close()
        connector.Close();
    });
})