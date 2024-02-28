
require('qingwa')();

import { WSConfig } from '../src/common/config';
import { WSRows } from '../src/sql/wsRows';
import { WsSql } from '../src/sql/wsSql'


let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/ws';
(async () => {
  let wsSql = null;
  let wsRows = null;
  try {
    let conf :WSConfig = new WSConfig(dsn)
    conf.SetDb('power')
    wsSql = await WsSql.Open(conf)
    let version = await wsSql.Version();
    console.log(version);
    let taosResult = await wsSql.Exec('show databases')
    console.log(taosResult);
    
    taosResult = await wsSql.Exec('create database if not exists power KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;');
    console.log(taosResult);

    taosResult = await wsSql.Exec('use power')
    console.log(taosResult);

    taosResult = await wsSql.Exec('CREATE STABLE if not exists meters (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);');
    console.log(taosResult);
  
    taosResult = await wsSql.Exec('describe meters')
    console.log(taosResult);

    taosResult = await wsSql.Exec('INSERT INTO d1001 USING meters TAGS ("California.SanFrancisco", 3) VALUES (NOW, 10.2, 219, 0.32)')
    console.log(taosResult);


    wsRows = await wsSql.Query('select * from meters');
    let meta = wsRows.GetMeta()
    console.log("wsRow:meta:=>", meta);

    while (await wsRows.Next()) {
      let result = await wsRows.GetData();
      console.log('queryRes.Scan().then=>', result);
    }
    wsRows.Close()
   
  } catch (e) {
    console.error(e);
  
  } finally {
    if (wsRows) {
      wsRows.Close();
    }
    if (wsSql) {
        wsSql.Close();
    }
  }
})();
