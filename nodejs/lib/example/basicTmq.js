"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../src/common/config");
const constant_1 = require("../src/tmq/constant");
const src_1 = require("../src");
const stable = 'meters';
const db = 'power';
const topics = ['topic_ws_map'];
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`;
let configMap = new Map([
    [constant_1.TMQConstants.GROUP_ID, "gId_11"],
    [constant_1.TMQConstants.CONNECT_USER, "root"],
    [constant_1.TMQConstants.CONNECT_PASS, "taosdata"],
    [constant_1.TMQConstants.AUTO_OFFSET_RESET, "earliest"],
    [constant_1.TMQConstants.CLIENT_ID, 'test_tmq_client11'],
    [constant_1.TMQConstants.WS_URL, 'ws://192.168.1.95:6041'],
    [constant_1.TMQConstants.ENABLE_AUTO_COMMIT, 'false'],
    [constant_1.TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
]);
let dsn = 'ws://root:taosdata@192.168.1.95:6041';
async function Prepare() {
    let conf = new config_1.WSConfig(dsn);
    const createDB = `create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`;
    const createStable = `CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`;
    let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`;
    const useDB = `use ${db}`;
   
    let ws = await (0, src_1.sqlConnect)(conf);
    await ws.exec(createDB);
    await ws.exec(useDB);
    await ws.exec(createStable);
    await ws.exec(createTopic);
    console.log(conf)
    for (let i = 0; i < 10; i++) {
        await ws.exec(`INSERT INTO d1001 USING ${stable} (location, groupId) TAGS ("California.SanFrancisco", 3) VALUES (NOW + ${i}a, ${10 + i}, ${200 + i}, ${0.32 + i})`);
    }
    await ws.close();
    console.log("perpare end!");
}
(async () => {
    let consumer = null;
    try {
        (0, src_1.setLogLevel)("debug");
        await Prepare();
        consumer = await (0, src_1.tmqConnect)(configMap);
        await consumer.subscribe(topics);
        for (let i = 0; i < 5; i++) {
            let res = await consumer.poll(100);
            for (let [key, value] of res) {
                console.log(key, value.getMeta());
                let data = value.getData();
                if (data) {
                    console.log(data.length);
                }
            }
            // await consumer.commit();
        }
        // let assignment = await consumer.assignment()
        // console.log(assignment)
        // await consumer.seekToBeginning(assignment)
        // assignment = await consumer.assignment()
        // for(let i in assignment) {
        //     console.log("seek after:", assignment[i])
        // }
        await consumer.unsubscribe();
    }
    catch (e) {
        console.error(e);
    }
    finally {
        if (consumer) {
            await consumer.close();
        }
        (0, src_1.destroy)();
    }
})();
