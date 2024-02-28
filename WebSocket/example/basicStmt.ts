require('qingwa')();
import { WSConfig } from '../src/common/config';
import { WsStmtConnect } from '../src/stmt/wsStmt';

let tags = ['California.SanFrancisco', 3];
let multi = [
  [1706786044994, 1706786044995, 1706786044996],
  [10.2, 10.3, 10.4],
  [292, 293, 294],
  [0.32, 0.33, 0.34],
];


(async () => {
  let stmt = null;
  let connector = null;
  try {
    let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/stmt';
    let wsConf = new WSConfig(dsn);
    wsConf.SetDb('test')
    connector = await WsStmtConnect.NewConnector(wsConf)
    stmt = await connector.Init()
    await stmt.Prepare('INSERT INTO ? USING test.stmt TAGS (?, ?) VALUES (?, ?, ?, ?)');
    await stmt.SetTableName('d1001');
    await stmt.SetTags(tags);
    await stmt.BindParam(multi);
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
