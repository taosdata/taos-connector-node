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

function newRootConfig(): WSConfig {
    const conf = new WSConfig(dsn);
    conf.setUser(testUsername());
    conf.setPwd(testPassword());
    return conf;
}

describe("TDWebSocket.SQL.BLOB", () => {
    jest.setTimeout(20 * 1000);

    test("insert and query blob with hex string literal", async () => {
        const db = "test_1775805396";
        const ws = await WsSql.open(newRootConfig());
        try {
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database ${db}`);
            await ws.exec(`use ${db}`);
            await ws.exec(`create table t0 (ts timestamp, data blob)`);
            await ws.exec(`insert into t0 values(now, '\\x393866343633')`);

            const result = await ws.exec(`select data from t0`);
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
        } finally {
            try {
                await ws.exec(`drop database if exists ${db}`);
            } finally {
                await ws.close();
            }
        }
    });

    test("insert and query blob with raw string literal", async () => {
        const db = "test_1775805911";
        const ws = await WsSql.open(newRootConfig());
        try {
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database ${db}`);
            await ws.exec(`use ${db}`);
            await ws.exec(`create table t0 (ts timestamp, data blob)`);
            await ws.exec(`insert into t0 values(now, '98f46e')`);

            const result = await ws.exec(`select data from t0`);
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
        } finally {
            try {
                await ws.exec(`drop database if exists ${db}`);
            } finally {
                await ws.close();
            }
        }
    });

    test("insert and query null blob", async () => {
        const db = "test_1775814624";
        const ws = await WsSql.open(newRootConfig());
        try {
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database ${db}`);
            await ws.exec(`use ${db}`);
            await ws.exec(`create table t0 (ts timestamp, data blob)`);
            await ws.exec(`insert into t0 values(now, null)`);

            const result = await ws.exec(`select data from t0`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }

            expect(data[0][0]).toBe("NULL");
        } finally {
            try {
                await ws.exec(`drop database if exists ${db}`);
            } finally {
                await ws.close();
            }
        }
    });
});
