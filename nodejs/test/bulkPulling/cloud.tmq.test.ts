
import { TMQConstants } from "../../src/tmq/constant";
import { WsConsumer } from "../../src/tmq/wsTmq";
import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import logger, { setLevel } from "../../src/common/log"

beforeAll(async () => {
 
})


describe('TDWebSocket.Tmq()', () => {
    jest.setTimeout(20 * 1000)
    
    test('normal connect', async() => {
        const url = `wss://${process.env.TDENGINE_CLOUD_URL}?token=${process.env.TDENGINE_CLOUD_TOKEN}`;
        // const TDENGINE_CLOUD_URL = 'wss://gw.cloud.taosdata.com?token=1eb78307be0681ac2fc07c2817ba8a9719641fb9';
        const topic = 'chenyu';
        const topics = [topic];
        const groupId = 'group1';
        const clientId = 'client1';
        let configMap = new Map([
        [TMQConstants.GROUP_ID, groupId],
        [TMQConstants.CLIENT_ID, clientId],
        [TMQConstants.AUTO_OFFSET_RESET, 'earliest'],
        [TMQConstants.WS_URL, url],
        [TMQConstants.ENABLE_AUTO_COMMIT, 'true'],
        [TMQConstants.AUTO_COMMIT_INTERVAL_MS, '1000'],
        ])
        
        setLevel("debug");
        // create consumer
        let consumer = await WsConsumer.newConsumer(configMap);
        console.log(
        `Create consumer successfully, host: ${url}, groupId: ${groupId}, clientId: ${clientId}`
        );
        // subscribe
        await consumer.subscribe(topics);
        console.log(`Subscribe topics successfully, topics: ${topics}`);
        let res = new Map();
        while (res.size == 0) {
        // poll
        res = await consumer.poll(1000);
        for (let [key, value] of res) {
            // Add your data processing logic here
            console.log(`data: ${key} ${value}`);
        }
        // commit
        await consumer.commit();
        }

        // seek
        let assignment = await consumer.assignment();
        await consumer.seekToBeginning(assignment);
        console.log('Assignment seek to beginning successfully');

        // clean
        await consumer.unsubscribe();
        await consumer.close();
        
    });
})

afterAll(async () => {
    WebSocketConnectionPool.instance().destroyed()
})