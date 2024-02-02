import { connect } from '../index';
import { WSRows } from '../src/sql/wsRows';

let dsn = 'ws://root:taosdata@192.168.1.98:6051/rest/ws';
let ws = connect(dsn);

async function connectDatabase(database?: string) {
  let res;
  if (database) {
    res = await ws.Open(database);
  } else {
    res = await ws.Open();
  }
  console.log(res);
}

async function getVersion() {
  let version = await ws.Version();
  console.log('version:' + version);
}

async function runSql(sql: string) {
  let queryRes = await ws.Exec(sql);
  console.log(queryRes);
}

async function querySql(sql: string): Promise<WSRows> {
  let queryRes = await ws.Query(sql);
  console.log(queryRes);
  return queryRes;
}

(async () => {
  try {
    await getVersion();
    await connectDatabase();
    await runSql('show databases')
    // await runSql('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;')
    // await runSql('use power')
    // await runSql('show tables')
    // await runSql('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);')
    // await runSql('describe meters')
    // await runSql('INSERT INTO d1001 USING meters TAGS (3, "California.SanFrancisco") VALUES (NOW, 10.2, 219, 0.32)')
    let queryRes = await querySql('select * from test.ws');
    // while (await queryRes.Next()) {
    //   let result = await queryRes.Scan();
    //   console.log('queryRes.Scan().then=>');
    //   console.log(result)
    // }
    queryRes.Close();
    // while(queryRes.Next()) {
    //     console.log(queryRes.Scan())
    // }
    // queryRes.Close()
    // await runSql('use test')
    ws.Close();
  } catch (e) {
    console.error(e);
    ws.Close();
  }
})();
