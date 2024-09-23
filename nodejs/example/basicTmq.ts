import { WSConfig } from "../src/common/config";
import { TMQConstants } from "../src/tmq/constant";
import { destroy, setLogLevel, sqlConnect, tmqConnect } from "../src";

const stable = 'meters';
const db = 'power18'
const topics:string[] = ['topic_ws_map']
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`
let configMap = new Map([
    [TMQConstants.GROUP_ID, "gId_7"],
    [TMQConstants.CONNECT_USER, "root"],
    [TMQConstants.CONNECT_PASS, "taosdata"],
    [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [TMQConstants.CLIENT_ID, 'test_tmq_client'],
    [TMQConstants.WS_URL, 'ws://192.168.1.98:6041'],
    [TMQConstants.ENABLE_AUTO_COMMIT, 'false'],
    [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);
let dsn = 'ws://root:taosdata@192.168.1.98:6041';
async function Prepare() {
    let conf :WSConfig = new WSConfig(dsn)
    const createDB = `create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`
    const createStable = `CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`
    let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
    const useDB = `use ${db}`

    let ws = await sqlConnect(conf);
    await ws.exec(createDB);
    await ws.exec(useDB);
    await ws.exec(createStable);
    await ws.exec(createTopic);
    for (let i = 0; i < 10; i++) {
        await ws.exec(`INSERT INTO d1001 USING ${stable} (location, groupId) TAGS ("California.SanFrancisco", 3) VALUES (NOW, ${10+i}, ${200+i}, ${0.32 + i})`)
    }
    ws.close()
    
}

(async () => {
    let consumer = null
    try {
        setLogLevel("debug")
        await Prepare()
        consumer = await tmqConnect(configMap);
        await consumer.subscribe(topics);
        for (let i = 0; i < 5; i++) {
            let res = await consumer.poll(500);
            console.log(res.getTopic(), res.getMeta());
            let data = res.getData();
            if (data) {
                for (let record of data ) {
                    console.log(record)
                }                
            }

            // await consumer.commit();
        }

        let assignment = await consumer.assignment()
        console.log(assignment)
        await consumer.seekToBeginning(assignment)
        assignment = await consumer.assignment()
        for(let i in assignment) {
            console.log("seek after:", assignment[i])
        }
        await consumer.unsubscribe()
    } catch (e) {
        console.error(e);
    } finally {
        if (consumer) {
           await consumer.close();
        }
        destroy()
    }
})();


