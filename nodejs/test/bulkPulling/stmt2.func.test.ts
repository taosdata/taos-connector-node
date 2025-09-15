import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { setLevel } from "../../src/common/log";
import { WsSql } from "../../src/sql/wsSql";
import { WsStmt2 } from "../../src/stmt/wsStmt2";

let dns = 'ws://localhost:6041'
setLevel("debug")
beforeAll(async () => {
    let conf :WSConfig = new WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await WsSql.open(conf);
    await wsSql.exec('create database if not exists power_func_stmt2 KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    await wsSql.exec('CREATE STABLE if not exists power_func_stmt2.meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    await wsSql.close();
})
describe('TDWebSocket.Stmt()', () => {
    jest.setTimeout(20 * 1000)
    let tags = ['California', 3];
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
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);     
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.close()
        await connector.close();
    });

    test('connect db with error', async() => {
        expect.assertions(1)
        let connector = null;
        try {
            let conf :WSConfig = new WSConfig(dns)
            conf.setUser('root')
            conf.setPwd('taosdata')
            conf.setDb('jest')
            connector = await WsSql.open(conf) 
            let stmt = await connector.stmtInit() 
            await stmt.close()
        }catch(e){
            let err:any = e
            expect(err.message).toMatch('Database not exist')
        }finally{
            if(connector) {
                await connector.close()
            }
        }
    })

    test('normal Prepare', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);       
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar([tags[0]]);
        params.setInt([tags[1]]);        
        await stmt.setTags(params);
        await stmt.close()
        await connector.close();
    }); 

    test('set tag error', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar([tags[0]]);
        try {
          await stmt.setTags(params)          
        } catch(err:any) {
            expect(err.message).toMatch('stmt tags count not match')
        }       
        await stmt.close()
        await connector.close();
    });    
    
    test('error Prepare table', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        try{
            await stmt.prepare('INSERT ? INTO ? USING meters TAGS (?, ?) VALUES (?, ?, ?, ?)');
            await stmt.setTableName('d1001');
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch(/keyword INTO is expected|Syntax error in SQL/)
        }
        await stmt.close()
        await connector.close();
    }); 

    test('error Prepare tag', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        try{
            await stmt.prepare('INSERT INTO ? USING meters TAGS (?, ?, ?) VALUES (?, ?, ?, ?)');
            await stmt.setTableName('d1001');
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Tags number not matched")
        }
        await stmt.close()
        await connector.close();
    });

    test('Bind supper table', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        await stmt.prepare('INSERT INTO meters (ts, tbname, current, voltage, phase, location, groupId) VALUES (?, ?, ?, ?, ?, ?, ?)');
        let lastTs = 0
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < multi[0].length; j++) {
                multi[0][j] = multi[0][0] + j;
                lastTs = multi[0][j]
            }

            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setVarchar([`d1001`, `d1002`, `d1003`])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            dataParams.setVarchar(['SanFrancisco_1', 'SanFrancisco_2','SanFrancisco_3']);
            dataParams.setInt([1, 2, 3]);
            await stmt.bind(dataParams)
            multi[0][0] = lastTs + 1;

        }
        
        await stmt.batch()
        await stmt.exec()
        expect(stmt.getLastAffected()).toEqual(30)
        await stmt.close()
        await connector.close();
    });

    test('Bind a single table', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) (ts, current, voltage, phase) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('power_func_stmt2.d1001');

        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([1]);
        await stmt.setTags(params) 

        let lastTs = 0
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < multi[0].length; j++) {
                multi[0][j] = multi[0][0] + j;
                lastTs = multi[0][j]
            }

            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            await stmt.bind(dataParams)

            multi[0][0] = lastTs + 1;
        }
        await stmt.batch()
        await stmt.exec()
        expect(stmt.getLastAffected()).toEqual(30)
        await stmt.close()
        await connector.close();
    });

    test('Bind multiple tables', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) (ts, current, voltage, phase) VALUES (?, ?, ?, ?)');
        let lastTs = 0
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < multi[0].length; j++) {
                multi[0][j] = multi[0][0] + j;
                lastTs = multi[0][j]
            }
            await stmt.setTableName(`power_func_stmt2.d100${i+1}`);

            let params = stmt.newStmtParam()
            params.setVarchar([`SanFrancisco${i+1}`]);
            params.setInt([i+1]);
            await stmt.setTags(params) 

            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            await stmt.bind(dataParams)

            multi[0][0] = lastTs + 1;

        }
        
        await stmt.batch()
        await stmt.exec()
        expect(stmt.getLastAffected()).toEqual(30)
        await stmt.close()
        await connector.close();
    });

    test('query bind', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let wsSql = await WsSql.open(conf) 

        await wsSql.exec('CREATE STABLE if not exists power_func_stmt2.query_meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
        let insertQuery = "INSERT INTO " +
                    "power_func_stmt2.q1001 USING power_func_stmt2.query_meters TAGS('California.SanFrancisco', 1) " +
                    "VALUES " +
                    "('2024-12-19 19:12:45.642', 50.30000, 201, 0.31000) " +
                    "('2024-12-19 19:12:46.642', 82.60000, 202, 0.33000) " +
                    "('2024-12-19 19:12:47.642', 92.30000, 203, 0.31000) " +
                    "('2024-12-19 18:12:45.642', 50.30000, 201, 0.31000) " +
                    "('2024-12-19 18:12:46.642', 82.60000, 202, 0.33000) " +
                    "('2024-12-19 18:12:47.642', 92.30000, 203, 0.31000) " +
                    "('2024-12-19 17:12:45.642', 50.30000, 201, 0.31000) " +
                    "('2024-12-19 17:12:46.642', 82.60000, 202, 0.33000) " +
                    "('2024-12-19 17:12:47.642', 92.30000, 203, 0.31000) " +
                    "power_func_stmt2.q1002 USING power_func_stmt2.query_meters TAGS('Alabama.Montgomery', 2) " +
                    "VALUES " +
                    "('2024-12-19 19:12:45.642', 50.30000, 204, 0.25000) " +
                    "('2024-12-19 19:12:46.642', 62.60000, 205, 0.33000) " +
                    "('2024-12-19 19:12:47.642', 72.30000, 206, 0.31000) " +
                    "('2024-12-19 18:12:45.642', 50.30000, 204, 0.25000) " +
                    "('2024-12-19 18:12:46.642', 62.60000, 205, 0.33000) " +
                    "('2024-12-19 18:12:47.642', 72.30000, 206, 0.31000) " +
                    "('2024-12-19 17:12:45.642', 50.30000, 204, 0.25000) " +
                    "('2024-12-19 17:12:46.642', 62.60000, 205, 0.33000) " +
                    "('2024-12-19 17:12:47.642', 72.30000, 206, 0.31000) ";
        await wsSql.exec(insertQuery);
        
        let result = await wsSql.exec("select * from query_meters")
        console.log(result)

        let stmt = await wsSql.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        await stmt.prepare('select * from query_meters where ts >= ? and ts <= ?');
        let dataParams = stmt.newStmtParam()
        dataParams.setTimestamp([1734599565642])
        dataParams.setTimestamp([1734606767642])
        await stmt.bind(dataParams)
        await stmt.exec()
        let wsRows = await stmt.resultSet()
        let nRows = 0;
        while (await wsRows.next()) {
            let result = wsRows.getData();
            console.log(result)
            expect(result).toBeTruthy()
            nRows++;
        }
        expect(nRows).toEqual(18);
        await wsRows.close()
        await stmt.close()
        await wsSql.close();
    });


    test('error BindParam', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf)
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([7]);
        await stmt.setTags(params) 
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3, 10.4, 10.5],
            [292, 293, 294],
            [0.32, 0.33, 0.31],
            ];
        try{
            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            await stmt.bind(dataParams)
            await stmt.batch()
            await stmt.exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch(/wrong row length|bind data length error/)
        }
        await stmt.close()
        await connector.close();
    });

    test('no Batch', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy()
        expect(stmt).toBeInstanceOf(WsStmt2);
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([7]);
        await stmt.setTags(params) 
        let multi = [
            [1709183268567, 1709183268568],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];
        try{
            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            await stmt.bind(dataParams)
            await stmt.exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch("Stmt API usage error")
        }
        await stmt.close()
        await connector.close();
    });

    test('Batch after BindParam', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([7]);
        await stmt.setTags(params) 
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
        
        let dataParams = stmt.newStmtParam()
        dataParams.setTimestamp(multi1[0])
        dataParams.setFloat(multi1[1])
        dataParams.setInt(multi1[2])
        dataParams.setFloat(multi1[3])
        await stmt.bind(dataParams)
        await stmt.batch()

        await stmt.setTableName('d1002');
        params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([5]);
        await stmt.setTags(params) 
        
        dataParams = stmt.newStmtParam()
        dataParams.setTimestamp(multi2[0])
        dataParams.setFloat(multi2[1])
        dataParams.setInt(multi2[2])
        dataParams.setFloat(multi2[3])
        await stmt.bind(dataParams)
        await stmt.batch()
        await stmt.exec()
        expect(stmt.getLastAffected()).toEqual(4)
        await stmt.close()
        await connector.close();
    });

    test('no set tag', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        // await stmt.SetTags(tags)
        try{
            let dataParams = stmt.newStmtParam()
            dataParams.setTimestamp(multi[0])
            dataParams.setFloat(multi[1])
            dataParams.setInt(multi[2])
            dataParams.setFloat(multi[3])
            await stmt.bind(dataParams)
            await stmt.batch()
            await stmt.exec()
        }catch(e) {
            let err:any = e
            expect(err.message).toMatch(/Retry needed|Tags are empty/);
        }
        await stmt.close()
        await connector.close();
    });

    test('normal binary BindParam', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf) 
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1002');
        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([7]);
        await stmt.setTags(params) 
        let dataParams = stmt.newStmtParam()
        dataParams.setTimestamp(multi[0])
        dataParams.setFloat(multi[1])
        dataParams.setInt(multi[2])
        dataParams.setFloat(multi[3])
        await stmt.bind(dataParams)
        
        await stmt.batch()
        await stmt.exec()

        let result = await connector.exec("select * from power_func_stmt2.meters")
        console.log(result)
        await stmt.close()
        await connector.close();

    });

    test('normal json BindParam', async() => {
        let conf = new WSConfig(dns);
        conf.setUser('root')
        conf.setPwd('taosdata')
        conf.setDb('power_func_stmt2')
        let connector = await WsSql.open(conf)  
        let stmt = await connector.stmtInit()
        expect(stmt).toBeTruthy() 
        expect(stmt).toBeInstanceOf(WsStmt2);      
        expect(connector.state()).toBeGreaterThan(0)
        await stmt.prepare('INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)');
        await stmt.setTableName('d1001');
        let params = stmt.newStmtParam()
        params.setVarchar(['SanFrancisco']);
        params.setInt([7]);
        await stmt.setTags(params) 
        let multi1 = [
            [1709188881548, 1709188881549],
            [10.2, 10.3],
            [292, 293],
            [0.32, 0.33],
            ];        
        let dataParams = stmt.newStmtParam()
        dataParams.setTimestamp(multi1[0])
        dataParams.setFloat(multi1[1])
        dataParams.setInt(multi1[2])
        dataParams.setFloat(multi1[3])
        await stmt.bind(dataParams)
        await stmt.batch()
        await stmt.exec()
        await stmt.close()
        await connector.close();
    });
})

afterAll(async () => {
    let conf :WSConfig = new WSConfig(dns);
    conf.setUser('root');
    conf.setPwd('taosdata');
    let wsSql = await WsSql.open(conf);
    await wsSql.exec('drop database power_func_stmt2');
    await wsSql.close();
    WebSocketConnectionPool.instance().destroyed()
})