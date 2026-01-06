import { TMQConstants } from "../../src/tmq/constant";
import { WsConsumer } from "../../src/tmq/wsTmq";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { createSTable, insertStable } from "../utils";
import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import logger, { setLevel } from "../../src/common/log";

setLevel("debug");
const stable = "st";
const db = "ws_tmq_test";
const topics: string[] = ["topic_ws_bean"];
// const topic2 = 'topic_ws_bean_2'
// let createTopic = `create topic if not exists ${topic} as select ts, c1, c2, c3, c4, c5, t1 from ${db}.${stable}`
// let createTopic2 = `create topic if not exists ${topic2} as select ts, c1, c4, c5, t1 from ${db}.${stable}`
let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`;
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`;
// let dropTopic2 = `DROP TOPIC IF EXISTS ${topic2};`

let dsn = "ws://root:taosdata@localhost:6041";
let tmqDsn = "ws://localhost:6041";

beforeAll(async () => {
    let conf: WSConfig = new WSConfig(dsn);
    const createDB = `create database if not exists ${db} keep 3650`;
    const dropDB = `drop database if exists ${db}`;
    const useDB = `use ${db}`;

    const stableTags = [
        true,
        -1,
        -2,
        -3,
        BigInt(-4),
        1,
        2,
        3,
        BigInt(4),
        parseFloat((3.1415).toFixed(5)),
        parseFloat((3.14159265).toFixed(15)),
        "varchar_tag_1",
        "nchar_tag_1",
    ];

    const tableValues = [
        [
            BigInt(1656677710000),
            0,
            -1,
            -2,
            BigInt(-3),
            0,
            1,
            2,
            BigInt(3),
            parseFloat((3.1415).toFixed(5)),
            parseFloat((3.14159265).toFixed(15)),
            "varchar_col_1",
            "nchar_col_1",
            true,
            "NULL",
            "POINT (4.0 8.0)",
            "0x7661726332",
        ],
        [
            BigInt(1656677720000),
            -1,
            -2,
            -3,
            BigInt(-4),
            1,
            2,
            3,
            BigInt(4),
            parseFloat((3.1415 * 2).toFixed(5)),
            parseFloat((3.14159265 * 2).toFixed(15)),
            "varchar_col_2",
            "nchar_col_2",
            false,
            "NULL",
            "POINT (3.0 5.0)",
            "0x7661726333",
        ],
        [
            BigInt(1656677730000),
            -2,
            -3,
            -4,
            BigInt(-5),
            2,
            3,
            4,
            BigInt(5),
            parseFloat((3.1415 * 3).toFixed(5)),
            parseFloat((3.14159265 * 3).toFixed(15)),
            "varchar_col_3",
            "nchar_col_3",
            true,
            "NULL",
            "LINESTRING (1.000000 1.000000, 2.000000 2.000000, 5.000000 5.000000)",
            "0x7661726334",
        ],
        [
            BigInt(1656677740000),
            -3,
            -4,
            -5,
            BigInt(-6),
            3,
            4,
            5,
            BigInt(6),
            parseFloat((3.1415 * 4).toFixed(5)),
            parseFloat((3.14159265 * 4).toFixed(15)),
            "varchar_col_4",
            "nchar_col_4",
            false,
            "NULL",
            "POLYGON ((3.000000 6.000000, 5.000000 6.000000, 5.000000 8.000000, 3.000000 8.000000, 3.000000 6.000000))",
            "0x7661726335",
        ],
        [
            BigInt(1656677750000),
            -4,
            -5,
            -6,
            BigInt(-7),
            4,
            5,
            6,
            BigInt(7),
            parseFloat((3.1415 * 5).toFixed(5)),
            parseFloat((3.14159265 * 5).toFixed(15)),
            "varchar_col_5",
            "nchar_col_5",
            true,
            "NULL",
            "POINT (7.0 9.0)",
            "0x7661726335",
        ],
    ];

    const tableCNValues = [
        [
            BigInt(1656677760000),
            0,
            -1,
            -2,
            BigInt(-3),
            0,
            1,
            2,
            BigInt(3),
            parseFloat((3.1415).toFixed(5)),
            parseFloat((3.14159265).toFixed(15)),
            "varchar_列_壹",
            "nchar_列_甲",
            true,
            "NULL",
            "POINT (4.0 8.0)",
            "0x7661726332",
        ],
        [
            BigInt(1656677770000),
            -1,
            -2,
            -3,
            BigInt(-4),
            1,
            2,
            3,
            BigInt(4),
            parseFloat((3.1415 * 2).toFixed(5)),
            parseFloat((3.14159265 * 2).toFixed(15)),
            "varchar_列_贰",
            "nchar_列_乙",
            false,
            "NULL",
            "POINT (3.0 5.0)",
            "0x7661726333",
        ],
        [
            BigInt(1656677780000),
            -2,
            -3,
            -4,
            BigInt(-5),
            2,
            3,
            4,
            BigInt(5),
            parseFloat((3.1415 * 3).toFixed(5)),
            parseFloat((3.14159265 * 3).toFixed(15)),
            "varchar_列_叁",
            "nchar_列_丙",
            true,
            "NULL",
            "LINESTRING (1.000000 1.000000, 2.000000 2.000000, 5.000000 5.000000)",
            "0x7661726334",
        ],
        [
            BigInt(1656677790000),
            -3,
            -4,
            -5,
            BigInt(-6),
            3,
            4,
            5,
            BigInt(6),
            parseFloat((3.1415 * 4).toFixed(5)),
            parseFloat((3.14159265 * 4).toFixed(15)),
            "varchar_列_肆",
            "nchar_列_丁",
            false,
            "NULL",
            "POLYGON ((3.000000 6.000000, 5.000000 6.000000, 5.000000 8.000000, 3.000000 8.000000, 3.000000 6.000000))",
            "0x7661726335",
        ],
        [
            BigInt(1656677800000),
            -4,
            -5,
            -6,
            BigInt(-7),
            4,
            5,
            6,
            BigInt(7),
            parseFloat((3.1415 * 5).toFixed(5)),
            parseFloat((3.14159265 * 5).toFixed(15)),
            "varchar_列_伍",
            "nchar_列_戊",
            true,
            "NULL",
            "POINT (7.0 9.0)",
            "0x7661726335",
        ],
    ];

    let ws = await WsSql.open(conf);
    await ws.exec(dropTopic);
    // await ws.Exec(dropTopic2);
    await ws.exec(dropDB);
    await ws.exec(createDB);
    await ws.exec(useDB);
    await ws.exec(createSTable(stable));
    await ws.exec(createTopic);
    // await ws.Exec(createTopic2);
    let insert = insertStable(tableValues, stableTags, stable);
    let insertRes = await ws.exec(insert);
    insert = insertStable(tableCNValues, stableTags, stable);
    insertRes = await ws.exec(insert);
    await ws.close();
});

describe("TDWebSocket.Tmq()", () => {
    jest.setTimeout(20 * 1000);
    let configMap = new Map([
        [TMQConstants.GROUP_ID, "gId"],
        [TMQConstants.CONNECT_USER, "root"],
        [TMQConstants.CONNECT_PASS, "taosdata"],
        [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
        [TMQConstants.CLIENT_ID, "test_tmq_client"],
        [TMQConstants.WS_URL, tmqDsn],
        [TMQConstants.ENABLE_AUTO_COMMIT, "true"],
        [TMQConstants.AUTO_COMMIT_INTERVAL_MS, "1000"],
        ["session.timeout.ms", "10000"],
        ["max.poll.interval.ms", "30000"],
        ["msg.with.table.name", "true"],
    ]);

    console.log(configMap);

    test("normal connect", async () => {
        let consumer = await WsConsumer.newConsumer(configMap);
        await consumer.close();
    });

    test("connect error", async () => {
        expect.assertions(1);
        let consumer = null;
        let errConfigMap = new Map([
            [TMQConstants.GROUP_ID, "test"],
            [TMQConstants.CONNECT_USER, "root"],
            [TMQConstants.CONNECT_PASS, "test"],
            [TMQConstants.AUTO_OFFSET_RESET, "earliest1"],
            [TMQConstants.CLIENT_ID, "test_tmq_client"],
            [TMQConstants.WS_URL, tmqDsn],
            [TMQConstants.ENABLE_AUTO_COMMIT, "true"],
            [TMQConstants.AUTO_COMMIT_INTERVAL_MS, "1000"],
            ["session.timeout.ms", "10000"],
            ["max.poll.interval.ms", "30000"],
            ["msg.with.table.name", "true"],
        ]);
        try {
            consumer = await WsConsumer.newConsumer(errConfigMap);
            await consumer.subscribe(topics);
        } catch (e: any) {
            console.log(e);
            expect([280, 65535]).toContain(e.code);
        } finally {
            if (consumer) {
                await consumer.close();
            }
        }
    });

    test("normal Subscribe", async () => {
        let consumer = await WsConsumer.newConsumer(configMap);
        await consumer.subscribe(topics);

        let assignment = await consumer.assignment();
        console.log(assignment);
        let counts: number = 0;
        let useTime: number[] = [];
        for (let i = 0; i < 5; i++) {
            let startTime = new Date().getTime();
            let res = await consumer.poll(500);
            let currTime = new Date().getTime();
            useTime.push(Math.abs(currTime - startTime));

            for (let [key, value] of res) {
                console.log(key, value.getMeta());
                let data = value.getData();
                if (data == null || data.length == 0) {
                    break;
                }

                for (let record of data) {
                    console.log("-----===>>", record);
                }
            }
            // await Sleep(100)
        }

        await consumer.seekToBeginning(assignment);

        for (let i = 0; i < 5; i++) {
            let startTime = new Date().getTime();
            let res = await consumer.poll(500);
            let currTime = new Date().getTime();
            useTime.push(Math.abs(currTime - startTime));
            for (let [key, value] of res) {
                console.log(key, value.getMeta());
                let data = value.getData();
                if (data == null || data.length == 0) {
                    break;
                }

                counts += data.length;
            }
            // await Sleep(100)
        }
        let topicArray = await consumer.subscription();
        expect(topics.length).toEqual(topicArray.length);
        for (let index = 0; index < topicArray.length; index++) {
            expect(topics[index]).toEqual(topicArray[index]);
        }

        assignment = await consumer.commit();
        console.log(assignment);
        assignment = await consumer.committed(assignment);
        assignment = await consumer.commitOffsets(assignment);
        console.log(assignment);
        await consumer.unsubscribe();
        await consumer.close();
        console.log("------------->", useTime);
        console.log("------------->", counts);
        expect(counts).toEqual(10);
    });

    test("Topic not exist", async () => {
        let consumer = await WsConsumer.newConsumer(configMap);
        try {
            await consumer.subscribe(["aaa"]);
        } catch (e: any) {
            expect(e.message).toMatch("Topic not exist");
        }
        await consumer.close();
    });

    test("normal seek", async () => {
        let consumer = await WsConsumer.newConsumer(configMap);
        await consumer.subscribe(topics);
        let assignment = await consumer.assignment();
        console.log("------START--------", assignment);

        await consumer.seekToEnd(assignment);
        await consumer.seekToBeginning(assignment);
        await consumer.seekToEnd(assignment);
        assignment = await consumer.assignment();
        console.log("------END--------", assignment);
        for (let i = 0; i < assignment.length; i++) {
            expect(assignment[i].offset).toEqual(assignment[i].end);
        }

        await consumer.unsubscribe();
        await consumer.close();
    });
});

afterAll(async () => {
    const dropDB = `drop database if exists ${db}`;
    let conf: WSConfig = new WSConfig(dsn);
    let ws = await WsSql.open(conf);
    await ws.exec(dropTopic);
    await ws.exec(dropDB);
    await ws.close();
    WebSocketConnectionPool.instance().destroyed();
});
