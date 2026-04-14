import { WebSocketConnectionPool } from "@src/client/wsConnectorPool";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";
import { Stmt2BindParams } from "@src/stmt/wsParams2";
import { WsStmt2 } from "@src/stmt/wsStmt2";
import { testNon3360, testPassword, testUsername } from "@test-helpers/utils";

describe("TDWebSocket.Stmt2.DECIMAL", () => {
    jest.setTimeout(20 * 1000);

    testNon3360("stmt2 bind decimal64/decimal with null, negative and scientific notation", async () => {
        const conf = new WSConfig("ws://localhost:6041");
        conf.setUser(testUsername());
        conf.setPwd(testPassword());
        const ws = await WsSql.open(conf);
        const db = "test_1776150084";
        const tsBase = Date.now();
        let stmt: any = null;

        try {
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database ${db}`);
            await ws.exec(`use ${db}`);
            await ws.exec(
                "create stable stb (" +
                "ts timestamp, dec64 decimal(18, 6), dec128 decimal(30, 10), c1 int) " +
                "tags (location binary(64), gid int)"
            );

            stmt = await ws.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare("insert into ? using stb tags (?, ?) values (?, ?, ?, ?)");
            await stmt.setTableName("d0");

            const tagParams = stmt.newStmtParam();
            tagParams.setBinary(["beijing"]);
            tagParams.setInt([1]);
            await stmt.setTags(tagParams);

            const bindParams = new Stmt2BindParams();
            bindParams.setTimestamp([
                BigInt(tsBase),
                BigInt(tsBase + 1),
                BigInt(tsBase + 2),
                BigInt(tsBase + 3),
            ]);
            bindParams.setDecimal([
                "9876.123456",
                "-0.000654",
                "1.23e+2",
                null,
            ]);
            bindParams.setDecimal([
                "123456.7890123456",
                "-0.0009876543",
                "5.55e-2",
                null,
            ]);
            bindParams.setInt([1, 2, 3, 4]);
            await stmt.bind(bindParams);
            await stmt.batch();
            await stmt.exec();
            expect(stmt.getLastAffected()).toBe(4);

            const result = await ws.exec("select dec64, dec128, c1 from d0");
            const data = result.getData();
            expect(data).toBeTruthy();
            if (!data) {
                throw new Error("retrieve empty result");
            }
            expect(data.length).toBe(4);

            expect(data[0][0]).toBe("9876.123456");
            expect(data[0][1]).toBe("123456.7890123456");
            expect(data[0][2]).toBe(1);

            expect(data[1][0]).toBe("-0.000654");
            expect(data[1][1]).toBe("-0.0009876543");
            expect(data[1][2]).toBe(2);

            expect(data[2][0]).toBe("123.000000");
            expect(data[2][1]).toBe("0.0555000000");
            expect(data[2][2]).toBe(3);

            expect(data[3][0]).toBe("NULL");
            expect(data[3][1]).toBe("NULL");
            expect(data[3][2]).toBe(4);
        } finally {
            if (stmt) {
                await stmt.close();
            }
            try {
                await ws.exec(`drop database if exists ${db}`);
            } finally {
                await ws.close();
            }
        }
    });

    testNon3360("stmt2 query bind supports decimal parameters", async () => {
        const conf = new WSConfig("ws://localhost:6041");
        conf.setUser(testUsername());
        conf.setPwd(testPassword());
        const ws = await WsSql.open(conf);
        const db = "test_1776151034";
        const tsBase = 1700000000000;
        let queryStmt: any = null;
        let rows: any = null;

        try {
            await ws.exec(`drop database if exists ${db}`);
            await ws.exec(`create database ${db}`);
            await ws.exec(`use ${db}`);
            await ws.exec(
                "create table ctb (" +
                "ts timestamp, dec64 decimal(18, 6), dec128 decimal(30, 10), c1 int)"
            );
            await ws.exec(
                "insert into ctb values" +
                ` (${tsBase}, "1.100000", "11.1111111111", 10)` +
                ` (${tsBase + 1}, "2.200000", "22.2222222222", 20)` +
                ` (${tsBase + 2}, "3.300000", "33.3333333333", 30)`
            );

            queryStmt = await ws.stmtInit();
            expect(queryStmt).toBeInstanceOf(WsStmt2);
            await queryStmt.prepare("select dec64, dec128, c1 from ctb where dec64 >= ?");
            const queryParams = new Stmt2BindParams();
            queryParams.setDecimal(["2.0"]);
            await queryStmt.bind(queryParams);
            await queryStmt.exec();

            rows = await queryStmt.resultSet();
            const queryData: Array<Array<any>> = [];
            while (await rows.next()) {
                const row = rows.getData();
                if (row) {
                    queryData.push([...row]);
                }
            }

            expect(queryData.length).toBe(2);
            expect(queryData[0][0]).toBe("2.200000");
            expect(queryData[0][1]).toBe("22.2222222222");
            expect(queryData[0][2]).toBe(20);
            expect(queryData[1][0]).toBe("3.300000");
            expect(queryData[1][1]).toBe("33.3333333333");
            expect(queryData[1][2]).toBe(30);
        } finally {
            if (rows) {
                await rows.close();
            }
            if (queryStmt) {
                await queryStmt.close();
            }
            try {
                await ws.exec(`drop database if exists ${db}`);
            } finally {
                await ws.close();
            }
        }
    });
});

afterAll(() => {
    WebSocketConnectionPool.instance().destroyed();
});
