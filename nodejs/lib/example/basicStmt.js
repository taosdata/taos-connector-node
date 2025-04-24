"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../src/common/config");
const src_1 = require("../src");
let db = 'power';
let stable = 'meters';
let numOfSubTable = 10;
let numOfRow = 10;
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
let dsn = 'ws://root:taosdata@localhost:6041';
async function Prepare() {
    let conf = new config_1.WSConfig(dsn);
    let wsSql = await (0, src_1.sqlConnect)(conf);
    await wsSql.exec(`create database if not exists ${db} KEEP 3650 DURATION 10 BUFFER 16 WAL_LEVEL 1;`);
    await wsSql.exec(`CREATE STABLE if not exists ${db}.${stable} (ts timestamp, current float, voltage int, phase float) TAGS (location binary(64), groupId int);`);
    wsSql.close();
}
(async () => {
    let stmt = null;
    let connector = null;
    try {
        await Prepare();
        let wsConf = new config_1.WSConfig(dsn);
        wsConf.setDb(db);
        connector = await (0, src_1.sqlConnect)(wsConf);
        stmt = await connector.stmtInit();
        await stmt.prepare(`INSERT INTO ? USING ${db}.${stable} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`);
        for (let i = 0; i < numOfSubTable; i++) {
            await stmt.setTableName(`d_bind_${i}`);
            let tagParams = stmt.newStmtParam();
            tagParams.setVarchar([`location_${i}`]);
            tagParams.setInt([i]);
            await stmt.setTags(tagParams);
            let timestampParams = [];
            let currentParams = [];
            let voltageParams = [];
            let phaseParams = [];
            const currentMillis = new Date().getTime();
            for (let j = 0; j < numOfRow; j++) {
                timestampParams.push(currentMillis + j);
                currentParams.push(Math.random() * 30);
                voltageParams.push(getRandomInt(100, 300));
                phaseParams.push(Math.random());
            }
            let bindParams = stmt.newStmtParam();
            bindParams.setTimestamp(timestampParams);
            bindParams.setFloat(currentParams);
            bindParams.setInt(voltageParams);
            bindParams.setFloat(phaseParams);
            await stmt.bind(bindParams);
            await stmt.batch();
            await stmt.exec();
            console.log(`d_bind_${i} insert ` + stmt.getLastAffected() + " rows.");
        }
    }
    catch (e) {
        console.error(e);
    }
    finally {
        if (stmt) {
            await stmt.close();
        }
        if (connector) {
            await connector.close();
        }
        (0, src_1.destroy)();
    }
})();
