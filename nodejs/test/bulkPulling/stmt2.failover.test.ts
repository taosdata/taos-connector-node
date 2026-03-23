import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { WsStmt2 } from "../../src/stmt/wsStmt2";
import { testPassword, testUsername } from "../helpers/utils";
import { WsProxy, WsProxyEvent } from "../helpers/wsProxy";

function parseTextAction(rawData: Buffer | string): string | null {
    if (typeof rawData !== "string") {
        return null;
    }
    try {
        const msg = JSON.parse(rawData);
        return msg.action || null;
    } catch {
        return null;
    }
}

function parseBinaryAction(rawData: Buffer | string): bigint | null {
    if (typeof rawData === "string" || rawData.byteLength < 24) {
        return null;
    }
    return rawData.readBigInt64LE(16);
}

describe("stmt2 failover", () => {
    jest.setTimeout(120 * 1000);
    const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;

    afterEach(async () => {
        WebSocketConnectionPool.instance().destroyed();
        jest.restoreAllMocks();
    });

    test("single-address stmt2 write failover on bind phase", async () => {
        const dbName = "test_stmt2_fo_bind";
        const baseTs = 1700100000000;
        let wsSql: WsSql | null = null;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let restartTriggered = false;

        const setupConf = new WSConfig(localDsn);
        setupConf.setTimeOut(6000);
        setupSql = await WsSql.open(setupConf);
        try {
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database if not exists ${dbName}`);
            await setupSql.exec(
                `create stable ${dbName}.meters (ts timestamp, current float, voltage int, phase float) tags (location binary(64), groupId int)`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message" || event.direction !== "client_to_upstream") {
                    return;
                }
                if (!event.isBinary) {
                    return;
                }
                // Intercept stmt2_bind binary message (opcode detection via size heuristic)
                // Trigger restart on the first binary message that looks like stmt2_bind
                if (!restartTriggered && event.byteLength > 100) {
                    restartTriggered = true;
                    void control.restart({
                        downtimeMs: 200,
                        reason: "trigger stmt2 bind failover",
                    });
                }
            },
        });

        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                `?retries=10&retry_backoff_ms=30&retry_backoff_max_ms=100`;
            const conf = new WSConfig(dsn);
            conf.setDb(dbName);
            conf.setTimeOut(10000);
            wsSql = await WsSql.open(conf);

            const stmt = await wsSql.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                "INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) (ts, current, voltage, phase) VALUES (?, ?, ?, ?)"
            );
            await stmt.setTableName(`${dbName}.d1001`);

            let params = stmt.newStmtParam();
            params.setVarchar(["SanFrancisco"]);
            params.setInt([1]);
            await stmt.setTags(params);

            let dataParams = stmt.newStmtParam();
            dataParams.setTimestamp([baseTs, baseTs + 1, baseTs + 2]);
            dataParams.setFloat([10.2, 10.3, 10.4]);
            dataParams.setInt([292, 293, 294]);
            dataParams.setFloat([0.32, 0.33, 0.34]);
            await stmt.bind(dataParams);
            await stmt.batch();
            await stmt.exec();

            expect(stmt.getLastAffected()).toEqual(3);
            expect(restartTriggered).toBe(true);

            await stmt.close();

            // Verify data via direct connection
            const verifyConf = new WSConfig(localDsn);
            verifyConf.setTimeOut(6000);
            const verifySql = await WsSql.open(verifyConf);
            try {
                const result = await verifySql.exec(`select count(*) from ${dbName}.meters`);
                const countValue = result.getData()?.[0]?.[0];
                const rowCount = typeof countValue === "bigint" ? Number(countValue) : Number(countValue || 0);
                expect(rowCount).toBe(3);
            } finally {
                await verifySql.close();
            }
        } finally {
            if (wsSql) {
                await wsSql.close();
            }
            await proxy.stop("test cleanup");

            const cleanupConf = new WSConfig(localDsn);
            cleanupConf.setTimeOut(6000);
            cleanupSql = await WsSql.open(cleanupConf);
            try {
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
            }
        }
    });

    test("multi-address stmt2 write failover with 5000 rows", async () => {
        const targetRows = 5000;
        const baseTs = 1700200000000;
        const dbName = "test_stmt2_fo_multi";
        let wsSql: WsSql | null = null;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let writePhase = false;
        let restartCount = 0;

        const setupConf = new WSConfig(localDsn);
        setupConf.setTimeOut(6000);
        setupSql = await WsSql.open(setupConf);
        try {
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database if not exists ${dbName}`);
            await setupSql.exec(
                `create stable ${dbName}.meters (ts timestamp, current float, voltage int, phase float) tags (location binary(64), groupId int)`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxyStates = new Map<string, { restarting: boolean; restarts: number }>();

        const createProxy = async (name: string) => {
            proxyStates.set(name, { restarting: false, restarts: 0 });
            return WsProxy.create({
                host: "127.0.0.1",
                port: 0,
                onEvent: (event, control) => {
                    if (!writePhase) return;
                    if (event.type !== "message" || event.direction !== "client_to_upstream") return;

                    const state = proxyStates.get(name);
                    if (!state || state.restarting) return;
                    if (Math.random() >= 0.003) return;

                    state.restarting = true;
                    state.restarts += 1;
                    restartCount += 1;
                    const downtimeMs = 10 + Math.floor(Math.random() * 60);
                    void control.restart({
                        downtimeMs,
                        reason: `${name} random restart #${state.restarts}`,
                    }).finally(() => {
                        const latestState = proxyStates.get(name);
                        if (latestState) latestState.restarting = false;
                    });
                },
            });
        };

        const proxyA = await createProxy("proxy_a");
        const proxyB = await createProxy("proxy_b");
        const proxyC = await createProxy("proxy_c");

        const randomSpy = jest.spyOn(Math, "random").mockReturnValueOnce(0);
        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}` +
                `@127.0.0.1:${proxyA.getPort()},127.0.0.1:${proxyB.getPort()},127.0.0.1:${proxyC.getPort()}` +
                `?retries=24&retry_backoff_ms=8&retry_backoff_max_ms=25`;
            const conf = new WSConfig(dsn);
            conf.setDb(dbName);
            conf.setTimeOut(10000);
            wsSql = await WsSql.open(conf);

            const batchSize = 50;
            writePhase = true;
            for (let batch = 0; batch < targetRows / batchSize; batch++) {
                const stmt = await wsSql.stmtInit();
                await stmt.prepare(
                    "INSERT INTO meters (ts, tbname, current, voltage, phase, location, groupId) VALUES (?, ?, ?, ?, ?, ?, ?)"
                );

                const timestamps: number[] = [];
                const currents: number[] = [];
                const voltages: number[] = [];
                const phases: number[] = [];
                const tableNames: string[] = [];
                const locations: string[] = [];
                const groupIds: number[] = [];

                for (let i = 0; i < batchSize; i++) {
                    const idx = batch * batchSize + i;
                    timestamps.push(baseTs + idx);
                    tableNames.push("d1001");
                    currents.push(10.0 + (idx % 100) * 0.1);
                    voltages.push(200 + (idx % 100));
                    phases.push(0.3 + (idx % 10) * 0.01);
                    locations.push("SanFrancisco");
                    groupIds.push(1);
                }

                const dataParams = stmt.newStmtParam();
                dataParams.setTimestamp(timestamps);
                dataParams.setVarchar(tableNames);
                dataParams.setFloat(currents);
                dataParams.setInt(voltages);
                dataParams.setFloat(phases);
                dataParams.setVarchar(locations);
                dataParams.setInt(groupIds);
                await stmt.bind(dataParams);
                await stmt.batch();
                await stmt.exec();
                await stmt.close();
            }
            writePhase = false;

            // Verify row count via direct connection
            const verifyConf = new WSConfig(localDsn);
            verifyConf.setTimeOut(6000);
            const verifySql = await WsSql.open(verifyConf);
            try {
                const result = await verifySql.exec(`select count(*) from ${dbName}.meters`);
                const countValue = result.getData()?.[0]?.[0];
                const rowCount = typeof countValue === "bigint" ? Number(countValue) : Number(countValue || 0);
                expect(rowCount).toBe(targetRows);
            } finally {
                await verifySql.close();
            }
            expect(restartCount).toBeGreaterThan(0);
        } finally {
            randomSpy.mockRestore();
            writePhase = false;
            if (wsSql) {
                await wsSql.close();
            }
            await Promise.all([
                proxyA.stop("test cleanup"),
                proxyB.stop("test cleanup"),
                proxyC.stop("test cleanup"),
            ]);

            const cleanupConf = new WSConfig(localDsn);
            cleanupConf.setTimeOut(6000);
            cleanupSql = await WsSql.open(cleanupConf);
            try {
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
            }
        }
    }, 300 * 1000);

    test("stmt2 query failover on result phase", async () => {
        const dbName = "test_stmt2_fo_query";
        let wsSql: WsSql | null = null;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let restartOnResult = false;

        const setupConf = new WSConfig(localDsn);
        setupConf.setTimeOut(6000);
        setupSql = await WsSql.open(setupConf);
        try {
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database if not exists ${dbName}`);
            await setupSql.exec(
                `create stable ${dbName}.meters (ts timestamp, current float, voltage int, phase float) tags (location binary(64), groupId int)`
            );
            // Insert test data
            for (let i = 0; i < 10; i++) {
                await setupSql.exec(
                    `insert into ${dbName}.d1001 using ${dbName}.meters tags('SF', 1) values(${1700300000000 + i}, ${10.0 + i}, ${200 + i}, ${0.3 + i * 0.01})`
                );
            }
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message" || event.direction !== "client_to_upstream") {
                    return;
                }
                // Detect stmt2_exec text message and trigger restart so stmt2_result will fail
                if (!event.isBinary && !restartOnResult) {
                    const action = parseTextAction(event.rawData);
                    if (action === "stmt2_exec") {
                        restartOnResult = true;
                        void control.restart({
                            downtimeMs: 200,
                            reason: "trigger stmt2 result failover",
                        });
                    }
                }
            },
        });

        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                `?retries=10&retry_backoff_ms=30&retry_backoff_max_ms=100`;
            const conf = new WSConfig(dsn);
            conf.setDb(dbName);
            conf.setTimeOut(10000);
            wsSql = await WsSql.open(conf);

            const stmt = await wsSql.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                "select * from meters where ts >= ? and ts <= ?"
            );
            let dataParams = stmt.newStmtParam();
            dataParams.setTimestamp([1700300000000n]);
            dataParams.setTimestamp([1700300000009n]);
            await stmt.bind(dataParams);
            await stmt.exec();
            const wsRows = await stmt.resultSet();
            let nRows = 0;
            while (await wsRows.next()) {
                nRows++;
            }
            expect(nRows).toBe(10);
            expect(restartOnResult).toBe(true);
            await wsRows.close();
            await stmt.close();
        } finally {
            if (wsSql) {
                await wsSql.close();
            }
            await proxy.stop("test cleanup");

            const cleanupConf = new WSConfig(localDsn);
            cleanupConf.setTimeOut(6000);
            cleanupSql = await WsSql.open(cleanupConf);
            try {
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
            }
        }
    });

    test("prepare phase failover", async () => {
        const dbName = "test_stmt2_fo_prepare";
        const baseTs = 1700400000000;
        let wsSql: WsSql | null = null;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let restartTriggered = false;

        const setupConf = new WSConfig(localDsn);
        setupConf.setTimeOut(6000);
        setupSql = await WsSql.open(setupConf);
        try {
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database if not exists ${dbName}`);
            await setupSql.exec(
                `create stable ${dbName}.meters (ts timestamp, current float, voltage int, phase float) tags (location binary(64), groupId int)`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message" || event.direction !== "client_to_upstream") {
                    return;
                }
                // Trigger restart on stmt2_prepare
                if (!event.isBinary && !restartTriggered) {
                    const action = parseTextAction(event.rawData);
                    if (action === "stmt2_prepare") {
                        restartTriggered = true;
                        void control.restart({
                            downtimeMs: 200,
                            reason: "trigger stmt2 prepare failover",
                        });
                    }
                }
            },
        });

        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                `?retries=10&retry_backoff_ms=30&retry_backoff_max_ms=100`;
            const conf = new WSConfig(dsn);
            conf.setDb(dbName);
            conf.setTimeOut(10000);
            wsSql = await WsSql.open(conf);

            const stmt = await wsSql.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);
            await stmt.prepare(
                "INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) (ts, current, voltage, phase) VALUES (?, ?, ?, ?)"
            );
            await stmt.setTableName(`${dbName}.d1001`);

            let params = stmt.newStmtParam();
            params.setVarchar(["SanFrancisco"]);
            params.setInt([1]);
            await stmt.setTags(params);

            let dataParams = stmt.newStmtParam();
            dataParams.setTimestamp([baseTs, baseTs + 1]);
            dataParams.setFloat([10.2, 10.3]);
            dataParams.setInt([292, 293]);
            dataParams.setFloat([0.32, 0.33]);
            await stmt.bind(dataParams);
            await stmt.batch();
            await stmt.exec();

            expect(stmt.getLastAffected()).toEqual(2);
            expect(restartTriggered).toBe(true);

            await stmt.close();
        } finally {
            if (wsSql) {
                await wsSql.close();
            }
            await proxy.stop("test cleanup");

            const cleanupConf = new WSConfig(localDsn);
            cleanupConf.setTimeOut(6000);
            cleanupSql = await WsSql.open(cleanupConf);
            try {
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
            }
        }
    });

    test("rebuild survives double disconnect during recovery", async () => {
        const dbName = "test_stmt2_fo_double";
        const baseTs = 1700500000000;
        let wsSql: WsSql | null = null;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let restartCount = 0;

        const setupConf = new WSConfig(localDsn);
        setupConf.setTimeOut(6000);
        setupSql = await WsSql.open(setupConf);
        try {
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database if not exists ${dbName}`);
            await setupSql.exec(
                `create stable ${dbName}.meters (ts timestamp, current float, voltage int, phase float) tags (location binary(64), groupId int)`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message" || event.direction !== "client_to_upstream") {
                    return;
                }
                // Restart on the first two stmt2_init messages (original + first rebuild attempt)
                if (!event.isBinary) {
                    const action = parseTextAction(event.rawData);
                    if (action === "stmt2_init" && restartCount < 2) {
                        restartCount += 1;
                        void control.restart({
                            downtimeMs: 150,
                            reason: `trigger double disconnect #${restartCount}`,
                        });
                    }
                }
            },
        });

        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                `?retries=10&retry_backoff_ms=30&retry_backoff_max_ms=100`;
            const conf = new WSConfig(dsn);
            conf.setDb(dbName);
            conf.setTimeOut(10000);
            wsSql = await WsSql.open(conf);

            // The first stmtInit call will hit stmt2_init which triggers restarts
            // The failover in init should survive multiple disconnects
            const stmt = await wsSql.stmtInit();
            expect(stmt).toBeInstanceOf(WsStmt2);

            await stmt.prepare(
                "INSERT INTO ? USING meters (location, groupId) TAGS (?, ?) (ts, current, voltage, phase) VALUES (?, ?, ?, ?)"
            );
            await stmt.setTableName(`${dbName}.d1001`);

            let params = stmt.newStmtParam();
            params.setVarchar(["SanFrancisco"]);
            params.setInt([1]);
            await stmt.setTags(params);

            let dataParams = stmt.newStmtParam();
            dataParams.setTimestamp([baseTs, baseTs + 1]);
            dataParams.setFloat([10.2, 10.3]);
            dataParams.setInt([292, 293]);
            dataParams.setFloat([0.32, 0.33]);
            await stmt.bind(dataParams);
            await stmt.batch();
            await stmt.exec();

            expect(stmt.getLastAffected()).toEqual(2);
            expect(restartCount).toBeGreaterThanOrEqual(2);

            await stmt.close();
        } finally {
            if (wsSql) {
                await wsSql.close();
            }
            await proxy.stop("test cleanup");

            const cleanupConf = new WSConfig(localDsn);
            cleanupConf.setTimeOut(6000);
            cleanupSql = await WsSql.open(cleanupConf);
            try {
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
            }
        }
    });
});
