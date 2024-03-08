
import { TMQConstants } from "../../src/tmq/constant";
import { WsConsumer } from "../../src/tmq/wsTmq";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { createSTable, insertStable } from "../utils";
const stable = 'st';
const db = 'ws_tmq_test'
const topics:string[] = ['topic_ws_bean']
// const topic2 = 'topic_ws_bean_2'
// let createTopic = `create topic if not exists ${topic} as select ts, c1, c2, c3, c4, c5, t1 from ${db}.${stable}`
// let createTopic2 = `create topic if not exists ${topic2} as select ts, c1, c4, c5, t1 from ${db}.${stable}`
let createTopic = `create topic if not exists ${topics[0]} as select * from ${db}.${stable}`
let dropTopic = `DROP TOPIC IF EXISTS ${topics[0]};`
// let dropTopic2 = `DROP TOPIC IF EXISTS ${topic2};`
beforeAll(async () => {
    let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/ws';
    let conf :WSConfig = new WSConfig(dsn)
    const createDB = `create database if not exists ${db} keep 3650`
    const dropDB = `drop database if exists ${db}`
    const useDB = `use ${db}`
    
    const stableTags = [true, -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_tag_1', 'nchar_tag_1']
    
    const tableValues = [
        [BigInt(1656677710000), 0, -1, -2, BigInt(-3), 0, 1, 2, BigInt(3),  parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_col_1', 'nchar_col_1', true, 'NULL'],
        [BigInt(1656677720000), -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_col_2', 'nchar_col_2', false, 'NULL'],
        [BigInt(1656677730000), -2, -3, -4, BigInt(-5), 2, 3, 4, BigInt(5), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.14159265 * 3).toFixed(15)), 'varchar_col_3', 'nchar_col_3', true, 'NULL'],
        [BigInt(1656677740000), -3, -4, -5, BigInt(-6), 3, 4, 5, BigInt(6), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.14159265 * 4).toFixed(15)), 'varchar_col_4', 'nchar_col_4', false, 'NULL'],
        [BigInt(1656677750000), -4, -5, -6, BigInt(-7), 4, 5, 6, BigInt(7), parseFloat((3.1415 * 5).toFixed(5)), parseFloat((3.14159265 * 5).toFixed(15)), 'varchar_col_5', 'nchar_col_5', true, 'NULL'],
    ]
    
    const tableCNValues = [
        [BigInt(1656677760000), 0, -1, -2, BigInt(-3), 0, 1, 2, BigInt(3), parseFloat(3.1415.toFixed(5)), parseFloat(3.14159265.toFixed(15)), 'varchar_列_壹', 'nchar_列_甲', true, 'NULL'],
        [BigInt(1656677770000), -1, -2, -3, BigInt(-4), 1, 2, 3, BigInt(4), parseFloat((3.1415 * 2).toFixed(5)), parseFloat((3.14159265 * 2).toFixed(15)), 'varchar_列_贰', 'nchar_列_乙', false, 'NULL'],
        [BigInt(1656677780000), -2, -3, -4, BigInt(-5), 2, 3, 4, BigInt(5), parseFloat((3.1415 * 3).toFixed(5)), parseFloat((3.14159265 * 3).toFixed(15)), 'varchar_列_叁', 'nchar_列_丙', true, 'NULL'],
        [BigInt(1656677790000), -3, -4, -5, BigInt(-6), 3, 4, 5, BigInt(6), parseFloat((3.1415 * 4).toFixed(5)), parseFloat((3.14159265 * 4).toFixed(15)), 'varchar_列_肆', 'nchar_列_丁', false, 'NULL'],
        [BigInt(1656677800000), -4, -5, -6, BigInt(-7), 4, 5, 6, BigInt(7), parseFloat((3.1415 * 5).toFixed(5)), parseFloat((3.14159265 * 5).toFixed(15)), 'varchar_列_伍', 'nchar_列_戊', true, 'NULL'],
    ]
   
    let ws = await WsSql.Open(conf);
    await ws.Exec(dropTopic);
    // await ws.Exec(dropTopic2);
    await ws.Exec(dropDB);
    await ws.Exec(createDB);
    await ws.Exec(useDB);
    await ws.Exec(createSTable(stable));
    await ws.Exec(createTopic);
    // await ws.Exec(createTopic2);
    let insert = insertStable(tableValues, stableTags, stable)
    let insertRes = await ws.Exec(insert)
    insert = insertStable(tableCNValues, stableTags, stable)
    insertRes = await ws.Exec(insert)
    ws.Close()
})


describe('TDWebSocket.Tmq()', () => {
    jest.setTimeout(20 * 1000)
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


    test('normal connect', async() => {
        // let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/tmq';
        // configMap.set(TMQConstants.WS_URL, dsn)
        let consumer = await WsConsumer.NewConsumer(configMap);
        consumer.Close();
    });

    test('connect error', async() => {
        expect.assertions(1)
        let consumer = null;
        let errConfigMap = new Map([
            [TMQConstants.GROUP_ID, "test"],
            [TMQConstants.CONNECT_USER, "root"],
            [TMQConstants.CONNECT_PASS, "test"],
            [TMQConstants.AUTO_OFFSET_RESET, "earliest1"],
            [TMQConstants.CLIENT_ID, 'test_tmq_client'],
            [TMQConstants.WS_URL, 'ws://192.168.1.95:6051/rest/tmq'],
            [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
            [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000']
        ]);
        try {
            consumer = await WsConsumer.NewConsumer(errConfigMap);
            await consumer.Subscribe(topics);
        }catch(e :any){
            expect(e.message).toMatch('fail')
        }finally{
            if(consumer) {
                consumer.Close()
            }
        }
    })

    test('normal Subscribe', async() => {
        
        // let dsn = 'ws://root:taosdata@192.168.1.95:6051/rest/tmq';
        // configMap.set(TMQConstants.WS_URL, dsn)
        let consumer = await WsConsumer.NewConsumer(configMap);
        await consumer.Subscribe(topics);

        let assignment = await consumer.Assignment()
        console.log(assignment)
        let counts:number[]=[0, 0]
        let useTime:number[] = [];
        for (let i = 0; i < 5; i++) { 
            let startTime = new Date().getTime();
            let res = await consumer.Poll(500);
            let currTime = new Date().getTime();
            useTime.push(Math.abs(currTime - startTime));
            for (let [key, value] of res) {
                let data = value.GetData()
                if (data) {
                    counts[0] += data.length;
                }
            }
            if (res.size == 0) {
                break;
            }

            // await Sleep(100)
        }

        await consumer.SeekToBeginning(assignment)

        for (let i = 0; i < 5; i++) { 
            let startTime = new Date().getTime();
            let res = await consumer.Poll(500);
            let currTime = new Date().getTime();
            useTime.push(Math.abs(currTime - startTime));
            for (let [key, value] of res) {
                let data = value.GetData()
                if (data) {
                    counts[1] += data.length;
                }
            }
            if (res.size == 0) {
                break;
            }
            // await Sleep(100)
        }
        assignment = await consumer.Commit();
        console.log(assignment)
        assignment = await consumer.Commited(assignment)
        console.log(assignment)
        await consumer.Unsubscribe()
        consumer.Close();
        console.log("------------->", useTime)
        console.log("------------->", counts)
        expect(counts).toEqual([10, 10])
    });

    test('Topic not exist', async() => {
        let consumer = await WsConsumer.NewConsumer(configMap);
        try {
             await consumer.Subscribe(["aaa"]);
        }catch(e:any) {
            expect(e.message).toMatch("Topic not exist");
        }
        consumer.Close();
    });

    test('normal seek', async() => {
        let consumer = await WsConsumer.NewConsumer(configMap);
        await consumer.Subscribe(topics);
        let assignment = await consumer.Assignment()
        console.log("------START--------",assignment)

        await consumer.SeekToEnd(assignment)
        await consumer.SeekToBeginning(assignment)
        await consumer.SeekToEnd(assignment)
        assignment = await consumer.Assignment()
        console.log("------END--------",assignment)
        for (let i = 0; i< assignment.length; i++) {
            expect(assignment[i].offset).toEqual(assignment[i].end)
        }
        
        await consumer.Unsubscribe()
        consumer.Close();
    });

})