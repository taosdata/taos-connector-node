require('qingwa')();
import { WSConfig } from '../src/common/config';
import { WsSql } from '../src/sql/wsSql';

let db = 'power'
let stable = 'meters'
let tags = ['California.SanFrancisco', 3];
let multi = [
    [1706786044994, 1706786044995, 1706786044996],
    [10.2, 10.3, 10.4],
    [292, 293, 294],
    [0.32, 0.33, 0.34],
];

async function Prepare() {
    let dsn = 'ws://root:taosdata@192.168.1.95:6051/ws';
    let conf :WSConfig = new WSConfig(dsn)
    let wsSql = await WsSql.Open(conf)
    await wsSql.Exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    await wsSql.Exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    wsSql.Close()
}

(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let dsn = 'ws://root:taosdata@192.168.1.95:6051/ws';
        let wsConf = new WSConfig(dsn);
        wsConf.SetDb(db)
        connector = await WsSql.Open(wsConf);
        stmt = await connector.StmtInit()
        await stmt.Prepare(`INSERT INTO ? USING ${db}.${stable} TAGS (?, ?) VALUES (?, ?, ?, ?)`);
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
            stmt.Close();
        }
        if (connector) {
            connector.Close();
        }
    }
})();
