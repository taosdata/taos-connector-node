import { setLevel } from "@src/common/log";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";
import { WsStmt2 } from "@src/stmt/wsStmt2";
import { compareUint8Arrays, testPassword, testUsername } from "@test-helpers/utils";

setLevel("debug");

const dsn = "ws://localhost:6041";
const stable = "blob_st";
const table = "blob_ct";

function newRootConfig(db?: string): WSConfig {
    const conf = new WSConfig(dsn);
    conf.setUser(testUsername());
    conf.setPwd(testPassword());
    if (db) {
        conf.setDb(db);
    }
    return conf;
}

async function initBlobStable(db: string) {
    const ws = await WsSql.open(newRootConfig());
    try {
        await ws.exec(`drop database if exists ${db}`);
        await ws.exec(`create database if not exists ${db} keep 3650`);
        await ws.exec(
            `create stable if not exists ${db}.${stable} (ts timestamp, data blob) tags (location binary(64), groupId int)`
        );
    } finally {
        await ws.close();
    }
}

async function dropDb(db: string) {
    const ws = await WsSql.open(newRootConfig());
    try {
        await ws.exec(`drop database if exists ${db}`);
    } finally {
        await ws.close();
    }
}

describe("TDWebSocket.Stmt2.BLOB()", () => {
    jest.setTimeout(20 * 1000);

    test("stmt2 bind blob with ArrayBuffer", async () => {
        const db = "stmt2_blob_buffer_test";
        await initBlobStable(db);

        const connector = await WsSql.open(newRootConfig(db));
        let stmt = null;
        try {
            stmt = await connector.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                `insert into ? using ${stable} tags (?, ?) values (?, ?)`
            );
            await stmt.setTableName(table);

            const tagParams = stmt.newStmtParam();
            tagParams.setBinary(["blob_loc"]);
            tagParams.setInt([1]);
            await stmt.setTags(tagParams);

            const blob = new TextEncoder().encode("stmt2_blob_buffer").buffer;
            const bindParams = stmt.newStmtParam();
            bindParams.setTimestamp([BigInt(Date.now())]);
            bindParams.setBlob([blob]);
            await stmt.bind(bindParams);
            await stmt.batch();
            await stmt.exec();

            const result = await connector.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }
            const actual = data[0][0] as ArrayBuffer;
            expect(actual).toBeInstanceOf(ArrayBuffer);
            expect(
                compareUint8Arrays(new Uint8Array(actual), new Uint8Array(blob))
            ).toBe(true);
        } finally {
            if (stmt) {
                await stmt.close();
            }
            await connector.close();
            await dropDb(db);
        }
    });

    test("stmt2 bind blob with string", async () => {
        const db = "stmt2_blob_string_test";
        await initBlobStable(db);

        const connector = await WsSql.open(newRootConfig(db));
        let stmt = null;
        try {
            stmt = await connector.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                `insert into ? using ${stable} tags (?, ?) values (?, ?)`
            );
            await stmt.setTableName(table);

            const tagParams = stmt.newStmtParam();
            tagParams.setBinary(["blob_loc"]);
            tagParams.setInt([1]);
            await stmt.setTags(tagParams);

            const bindParams = stmt.newStmtParam();
            bindParams.setTimestamp([BigInt(Date.now())]);
            bindParams.setBlob(["stmt2_blob_string"]);
            await stmt.bind(bindParams);
            await stmt.batch();
            await stmt.exec();

            const result = await connector.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }
            const actual = data[0][0] as ArrayBuffer;
            const expected = new TextEncoder().encode("stmt2_blob_string");
            expect(actual).toBeInstanceOf(ArrayBuffer);
            expect(
                compareUint8Arrays(new Uint8Array(actual), expected)
            ).toBe(true);
        } finally {
            if (stmt) {
                await stmt.close();
            }
            await connector.close();
            await dropDb(db);
        }
    });

    test("stmt2 bind null blob", async () => {
        const db = "stmt2_blob_null_test";
        await initBlobStable(db);

        const connector = await WsSql.open(newRootConfig(db));
        let stmt = null;
        try {
            stmt = await connector.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                `insert into ? using ${stable} tags (?, ?) values (?, ?)`
            );
            await stmt.setTableName(table);

            const tagParams = stmt.newStmtParam();
            tagParams.setBinary(["blob_loc"]);
            tagParams.setInt([1]);
            await stmt.setTags(tagParams);

            const bindParams = stmt.newStmtParam();
            bindParams.setTimestamp([BigInt(Date.now())]);
            bindParams.setBlob([null]);
            await stmt.bind(bindParams);
            await stmt.batch();
            await stmt.exec();

            const result = await connector.exec(`select data from ${table}`);
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data || data.length === 0) {
                throw new Error("retrieve empty result");
            }
            expect(data[0][0]).toBe("NULL");
        } finally {
            if (stmt) {
                await stmt.close();
            }
            await connector.close();
            await dropDb(db);
        }
    });
});
