import { WSConfig } from "../src/common/config";
import { WsSql } from "../src/sql/wsSql";
import { TMQConstants } from "../src/tmq/constant";
import { WsConsumer } from "../src/tmq/wsTmq";

const stable = 'meters';
const db = 'power'
const topics:string[] = ['topic_ws_bean']
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`
let configMap = new Map([
    [TMQConstants.GROUP_ID, "gId"],
    [TMQConstants.CONNECT_USER, "root"],
    [TMQConstants.CONNECT_PASS, "taosdata"],
    [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [TMQConstants.CLIENT_ID, 'test_tmq_client'],
    [TMQConstants.WS_URL, 'ws://192.168.1.95:6051/rest/tmq'],
    [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
    [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);

async function Prepare() {
    let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/ws';
    let conf :WSConfig = new WSConfig(dsn)
    const createDB = `create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`
    const createStable = `CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`
    let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
    const useDB = `use ${db}`
  
    let ws = await WsSql.Open(conf);
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createStable);
    await ws.Exec(createTopic);
    for (let i = 0; i < 10; i++) {
        await ws.Exec(`INSERT INTO d1001 USING ${stable} TAGS ("California.SanFrancisco", 3) VALUES (NOW, ${10+i}, ${200+i}, ${0.32 + i})`)
    }
    ws.Close()
}

(async () => {
    let consumer = null    
    try {
        consumer = await WsConsumer.NewConsumer(configMap);
        await consumer.Subscribe(topics);
        for (let i = 0; i < 5; i++) { 
            let res = await consumer.Poll(500); 
            for (let [key, value] of res) {
                console.log(key, value);
            }
            if (res.size == 0) {
                break;
            }
            await consumer.Commit();
        }
        
        let assignment = await consumer.Assignment()
        console.log(assignment)
        await consumer.SeekToBeginning(assignment)
        
        await consumer.Unsubscribe()
    } catch (e) {
        console.error(e);
    } finally {
        if (consumer) {
           consumer.Close();
        }
    }
})


