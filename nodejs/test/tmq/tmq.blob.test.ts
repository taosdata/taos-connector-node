import { setLevel } from "@src/common/log";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";
import { TMQConstants } from "@src/tmq/constant";
import { WsConsumer } from "@src/tmq/wsTmq";
import { compareUint8Arrays, testPassword, testUsername } from "@test-helpers/utils";

setLevel("debug");

const dsn = "ws://localhost:6041";
const tmqDsn = "ws://localhost:6041";

function newRootConfig(): WSConfig {
    const conf = new WSConfig(dsn);
    conf.setUser(testUsername());
    conf.setPwd(testPassword());
    return conf;
}

describe("TDWebSocket.TMQ.BLOB()", () => {
    jest.setTimeout(20 * 1000);

    test("consume blob data as ArrayBuffer", async () => {
        const db = "tmq_blob_test";
        const table = "blob_table";
        const topic = "topic_blob_test";
        const groupId = "blob_group_id";
        const payload = "tmq_blob_payload";
        const expected = new TextEncoder().encode(payload);

        let consumer: WsConsumer | null = null;
        const ws = await WsSql.open(newRootConfig());

        try {
            await ws.exec(`drop topic if exists ${topic}`);
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database if not exists ${db} keep 3650`);
            await ws.exec(`use ${db}`);
            await ws.exec(
                `create table if not exists ${table} (ts timestamp, data blob)`
            );
            await ws.exec(
                `create topic if not exists ${topic} as select data from ${db}.${table}`
            );
            await ws.exec(`insert into ${table} values(now, '${payload}')`);

            const configMap = new Map<string, string>([
                [TMQConstants.GROUP_ID, groupId],
                [TMQConstants.CONNECT_USER, testUsername()],
                [TMQConstants.CONNECT_PASS, testPassword()],
                [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
                [TMQConstants.CLIENT_ID, "tmq_blob_client"],
                [TMQConstants.WS_URL, tmqDsn],
                [TMQConstants.ENABLE_AUTO_COMMIT, "true"],
                [TMQConstants.AUTO_COMMIT_INTERVAL_MS, "1000"],
                ["session.timeout.ms", "10000"],
                ["max.poll.interval.ms", "30000"],
            ]);

            consumer = await WsConsumer.newConsumer(configMap);
            await consumer.subscribe([topic]);

            let actual: ArrayBuffer | null = null;
            for (let i = 0; i < 10 && !actual; i++) {
                const res = await consumer.poll(500);
                for (const [, value] of res) {
                    const data = value.getData();
                    if (!data || data.length === 0) {
                        continue;
                    }
                    if (data[0][0] instanceof ArrayBuffer) {
                        actual = data[0][0];
                        break;
                    }
                }
            }

            expect(actual).toBeTruthy();
            if (!actual) {
                throw new Error("consume empty blob message");
            }
            expect(
                compareUint8Arrays(new Uint8Array(actual), expected)
            ).toBe(true);
        } finally {
            if (consumer) {
                await consumer.unsubscribe();
                await consumer.close();
            }
            await ws.exec(`drop topic if exists ${topic}`);
            await ws.exec(`drop database if exists ${db}`);
            await ws.close();
        }
    });
});
