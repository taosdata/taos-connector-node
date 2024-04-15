import { WSConfig } from '../src/common/config';
import { sqlConnect } from '../index'

let dsn = 'ws://root:taosdata@192.168.1.95:6051/ws';
(async () => {
    let wsSql = null;
    let wsRows = null;
    let reqId = 0;
    try {
        let conf :WSConfig = new WSConfig(dsn)
        wsSql = await sqlConnect(conf)

        let version = await wsSql.Version();
        console.log(version);

        let taosResult = await wsSql.Exec('show databases', reqId++)
        console.log(taosResult);
        
        taosResult = await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;',reqId++);
        console.log(taosResult);

        taosResult = await wsSql.Exec('use power',reqId++)
        console.log(taosResult);

        taosResult = await wsSql.Exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);', reqId++);
        console.log(taosResult);
    
        taosResult = await wsSql.Exec('describe meters', reqId++)
        console.log(taosResult);

        taosResult = await wsSql.Exec('INSERT INTO d1001 USING meters TAGS ("California.SanFrancisco", 3) VALUES (NOW, 10.2, 219, 0.32)', reqId++)
        console.log(taosResult);

        wsRows = await wsSql.Query('select * from meters', reqId++);
        let meta = wsRows.GetMeta()
        console.log("wsRow:meta:=>", meta);

        while (await wsRows.Next()) {
            let result = await wsRows.GetData();
            console.log('queryRes.Scan().then=>', result);
        }
        wsRows.Close()
    
    } catch (e) {
        let err:any = e
        console.error(err);
    
    } finally {
        if (wsRows) {
            wsRows.Close();
        }
        if (wsSql) {
            wsSql.Close();
        }
        console.log("finish!")
    }
})();
