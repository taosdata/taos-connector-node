import { connect, stmtConnect } from '../index';
import { WSRows } from '../src/sql/wsRows';

let dsn = 'ws://root:taosdata@192.168.1.98:6051/rest/stmt';
// let ws = connect(dsn);
let stmt = stmtConnect(dsn);
let tags = ['California.SanFrancisco', 3];
let multi = [
  [1706786044994, 1706786044995, 1706786044996],
  [10.2, 10.3, 10.4],
  [292, 293, 294],
  [0.32, 0.33, 0.34],
];
// async function connectDatabase(database?: string) {
//   let res;
//   if (database) {
//     res = await ws.Open(database);
//   } else {
//     res = await ws.Open();
//   }
//   console.log(res);
// }

async function connectStmtDatabase(database?: string) {
  let res;
  if (database) {
    res = await stmt.Open(database);
  } else {
    res = await stmt.Open();
  }
  console.log(res);
}

// async function getVersion() {
//   let version = await ws.Version();
//   console.log('version:' + version);
// }

// async function runSql(sql: string) {
//   let queryRes = await ws.Exec(sql);
//   console.log(queryRes);
// }

// async function querySql(sql: string): Promise<WSRows> {
//   let queryRes = await ws.Query(sql);
//   console.log(queryRes);
//   return queryRes;
// }

async function stmtInit(): Promise<boolean> {
  let queryRes = await stmt.Start();
  console.log(queryRes);
  return queryRes;
}

(async () => {
  try {
    await connectStmtDatabase("test");
    await stmtInit();
    await stmt.Prepare('INSERT INTO ? USING test.stmt TAGS (?, ?) VALUES (?, ?, ?, ?)');
    await stmt.SetTableName('d1001');
    await stmt.SetTags(tags);
    await stmt.BindParam(multi);
    await stmt.Batch();
    await stmt.Exec();
    await stmt.End();
  } catch (e) {
    console.error(e);
    stmt.Close();
  }
})();
// (async () => {
//   try {
//     await getVersion();
//     await connectDatabase();
//     await runSql('show databases')
//     await runSql('create database if not exists test KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;')
//     await runSql('CREATE STABLE if not exists test.stmt (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);')
//     await ws.Close();
//     // await runSql('describe meters')
//     await connectStmtDatabase();
//     await stmt.Init();
//     await stmt.Prepare('INSERT INTO ? USING test.stmt TAGS (?, ?) VALUES (?, ?, ?, ?)');
//     await stmt.setTableName('d1001');
//     await stmt.SetTags(tags);
//     await stmt.BindParam(multi);
//     await stmt.Batch();
//     await stmt.Exec();
//     await stmt.Close()

//     // await runSql('INSERT INTO d1001 USING meters TAGS (3, "California.SanFrancisco") VALUES (NOW, 10.2, 219, 0.32)')
//     // let queryRes = await querySql('select * from test.ws');
//     // while (await queryRes.Next()) {
//     //   let result = await queryRes.Scan();
//     //   console.log('queryRes.Scan().then=>');
//     //   console.log(result)
//     // }
//     // queryRes.Close();
//     // while(queryRes.Next()) {
//     //     console.log(queryRes.Scan())
//     // }
//     // queryRes.Close()
//     // await runSql('use test')

//   } catch (e) {
//     console.error(e);
//     ws.Close();
//   }
// })();
