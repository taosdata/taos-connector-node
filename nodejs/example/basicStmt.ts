require('qingwa')();
import { WSConfig } from '../src/common/config';
import { destroy, sqlConnect } from '../src';

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
    await wsSql.exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`)
    await wsSql.exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    wsSql.close()
}

(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let wsConf = new WSConfig(dsn);
        wsConf.setDb(db)
        connector = await sqlConnect(wsConf);
        stmt = await connector.stmtInit()
        await stmt.prepare(`INSERT INTO ? USING ${db}.${stable} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`);
        await stmt.setTableName('d1001');

        let tagParams = stmt.newStmtParam()
        tagParams.setVarchar([tags[0]])
        tagParams.setInt([tags[1]])
        await stmt.setTags(tagParams);

        let bindParams = stmt.newStmtParam()
        bindParams.setTimestamp(multi[0]);
        bindParams.setFloat(multi[1])
        bindParams.setInt(multi[2])
        bindParams.setFloat(multi[3])
        await stmt.bind(bindParams);
        await stmt.batch();
        await stmt.exec();
    } catch (e) {
        console.error(e);
    }finally {
        if (stmt) {
            await stmt.close();
        }
        if (connector) {
            await connector.close();
        }
        destroy()
    }
})();
