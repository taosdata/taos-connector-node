require('qingwa')();
import { WSConfig } from '../src/common/config';
import { connectorDestroy, sqlConnect } from '../index';

let db = 'power'
let stable = 'meters'
let tags = ['California.SanFrancisco', 3];
let multi = [
    [1706786044994, 1706786044995, 1706786044996],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
];
let dsn = 'ws://root:taosdata@localhost:6041';
async function Prepare() {
    
    let conf :WSConfig = new WSConfig(dsn)
    let wsSql = await sqlConnect(conf)
    await wsSql.Exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    await wsSql.Exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    wsSql.Close()
}

(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        connector = await sqlConnect(wsConf);
        stmt = await connector.StmtInit()
        await stmt.Prepare(`INSERT INTO ? USING ${db}.${stable} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`);
        await stmt.SetTableName('d1001');
        
        let tagParams = stmt.NewStmtParam()
        tagParams.SetVarcharColumn([tags[0]])
        tagParams.SetIntColumn([tags[1]])
        await stmt.SetBinaryTags(tagParams);

        let bindParams = stmt.NewStmtParam()
        bindParams.SetTimestampColumn(multi[0]);
        bindParams.SetFloatColumn(multi[1])
        bindParams.SetIntColumn(multi[2])
        bindParams.SetFloatColumn(multi[3])
        await stmt.BinaryBind(bindParams);
        await stmt.Batch();
        await stmt.Exec();
    } catch (e) {
        console.error(e);
    }finally {
        if (stmt) {
            await stmt.Close();
        }
        if (connector) {
            await connector.Close();
        }
        connectorDestroy()
    }
})();
