import { setLevel } from "@src/common/log";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";
import {
    compareUint8Arrays,
    hexToBytes,
    testPassword,
    testUsername,
} from "@test-helpers/utils";

setLevel("debug");

const dsn = "ws://localhost:6041";
const table = "blob_table";

function newRootConfig(): WSConfig {
    const conf = new WSConfig(dsn);
    conf.setUser(testUsername());
    conf.setPwd(testPassword());
    return conf;
}

async function withBlobDb(db: string, run: (ws: WsSql) => Promise<void>) {
    const ws = await WsSql.open(newRootConfig());
    try {
        await ws.exec(`drop database if exists ${db}`);
        await ws.exec(`create database if not exists ${db} keep 3650`);
        await ws.exec(`use ${db}`);
        await ws.exec(
            `create table if not exists ${table} (ts timestamp, data blob)`
        );
        await run(ws);
    } finally {
        try {
            await ws.exec("use information_schema");
            await ws.exec(`drop database if exists ${db}`);
        } finally {
            await ws.close();
        }
    }
}

describe("TDWebSocket.SQL.BLOB()", () => {
    jest.setTimeout(20 * 1000);

    test("insert and query blob with hex string literal", async () => {
        await withBlobDb("sql_blob_hex_test", async (ws) => {
            await ws.exec(`insert into ${table} values(now, '\\x393866343633')`);

            const result = await ws.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }

            const actual = data[0][0] as ArrayBuffer;
            const expected = hexToBytes("393866343633");
            expect(actual).toBeInstanceOf(ArrayBuffer);
            expect(
                compareUint8Arrays(
                    new Uint8Array(actual),
                    new Uint8Array(expected)
                )
            ).toBe(true);
        });
    });

    test("insert and query blob with raw string literal", async () => {
        await withBlobDb("sql_blob_raw_test", async (ws) => {
            await ws.exec(`insert into ${table} values(now, '98f46e')`);

            const result = await ws.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }

            const actual = data[0][0] as ArrayBuffer;
            const expected = new TextEncoder().encode("98f46e");
            expect(actual).toBeInstanceOf(ArrayBuffer);
            expect(
                compareUint8Arrays(new Uint8Array(actual), expected)
            ).toBe(true);
        });
    });

    test("insert and query null blob", async () => {
        await withBlobDb("sql_blob_null_test", async (ws) => {
            await ws.exec(`insert into ${table} values(now, null)`);

            const result = await ws.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }

            expect(data[0][0]).toBe("NULL");
        });
    });
});
