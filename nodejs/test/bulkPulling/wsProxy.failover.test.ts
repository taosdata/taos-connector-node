import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { TMQConstants } from "../../src/tmq/constant";
import { WsConsumer } from "../../src/tmq/wsTmq";
import { testPassword, testUsername } from "../helpers/utils";
import { WsProxy, WsProxyEvent } from "../helpers/wsProxy";

function parseBinaryAction(rawData: Buffer | string): bigint | null {
    if (typeof rawData === "string" || rawData.byteLength < 24) {
        return null;
    }
    return rawData.readBigInt64LE(16);
}

function parseJsonAction(rawData: Buffer | string): string | null {
    if (typeof rawData !== "string") {
        return null;
    }
    try {
        const parsed = JSON.parse(rawData);
        return typeof parsed.action === "string" ? parsed.action : null;
    } catch (_err) {
        return null;
    }
}

describe("ws proxy failover", () => {
    jest.setTimeout(120 * 1000);

    afterEach(async () => {
        WebSocketConnectionPool.instance().destroyed();
        jest.restoreAllMocks();
    });

    test("switches to next address when active proxy restarts with downtime", async () => {
        let restartTriggered = false;
        let proxyBHadActivity = false;
        let wsSql: WsSql | null = null;

        const proxyA = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message") {
                    return;
                }
                if (event.direction !== "client_to_upstream" || !event.isBinary) {
                    return;
                }

                const action = parseBinaryAction(event.rawData);
                if (action === 6n && !restartTriggered) {
                    restartTriggered = true;
                    void control.restart({
                        downtimeMs: 800,
                        reason: "trigger dual-address failover",
                    });
                }
            },
        });

        const proxyB = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event: WsProxyEvent) => {
                if (event.type === "client_connected") {
                    proxyBHadActivity = true;
                    return;
                }
                if (
                    event.type === "message" &&
                    event.direction === "client_to_upstream"
                ) {
                    proxyBHadActivity = true;
                }
            },
        });

        const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}` +
                `@127.0.0.1:${proxyA.getPort()},127.0.0.1:${proxyB.getPort()}` +
                `?retries=5&retry_backoff_ms=20&retry_backoff_max_ms=20`;
            const conf = new WSConfig(dsn);
            conf.setTimeOut(6000);
            wsSql = await WsSql.open(conf);

            const result = await wsSql.exec("select server_version()");
            expect(result).toBeTruthy();
            expect(restartTriggered).toBe(true);
            expect(proxyBHadActivity).toBe(true);
        } finally {
            randomSpy.mockRestore();
            if (wsSql) {
                await wsSql.close();
            }
            await proxyA.stop("test cleanup");
            await proxyB.stop("test cleanup");
        }
    });

    test("reconnects to same address after single proxy hard restart", async () => {
        let restartCount = 0;
        let wsSql: WsSql | null = null;

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message") {
                    return;
                }
                if (event.direction !== "client_to_upstream" || !event.isBinary) {
                    return;
                }

                const action = parseBinaryAction(event.rawData);
                if (action === 6n && restartCount === 0) {
                    restartCount += 1;
                    void control.restart({
                        downtimeMs: 120,
                        reason: "trigger single-address reconnect",
                    });
                }
            },
        });

        try {
            const dsn =
                `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                `?retries=6&retry_backoff_ms=30&retry_backoff_max_ms=60`;
            const conf = new WSConfig(dsn);
            conf.setTimeOut(6000);
            wsSql = await WsSql.open(conf);

            const result = await wsSql.exec("select server_version()");
            expect(result).toBeTruthy();
            expect(restartCount).toBe(1);
        } finally {
            if (wsSql) {
                await wsSql.close();
            }
            await proxy.stop("test cleanup");
        }
    });

    test(
        "keeps all 5000 rows with single-address random proxy restarts during inserts",
        async () => {
            const targetRows = 5000;
            const baseTs = 1700000000000;
            const dbName = "test_1773988174";
            const tableName = "t0";
            let wsSql: WsSql | null = null;
            let setupSql: WsSql | null = null;
            let cleanupSql: WsSql | null = null;
            let writePhase = false;
            let restartInFlight = false;
            let restartCount = 0;
            let forwardedInsertFrames = 0;

            const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
            const setupConf = new WSConfig(localDsn);
            setupConf.setTimeOut(6000);
            setupSql = await WsSql.open(setupConf);
            try {
                await setupSql.exec(`drop database if exists ${dbName}`);
                await setupSql.exec(`create database if not exists ${dbName}`);
            } finally {
                await setupSql.close();
                setupSql = null;
            }

            const proxy = await WsProxy.create({
                host: "127.0.0.1",
                port: 0,
                onEvent: (event, control) => {
                    if (!writePhase || restartInFlight) {
                        return;
                    }
                    if (event.type !== "message") {
                        return;
                    }
                    if (event.direction !== "client_to_upstream" || !event.isBinary) {
                        return;
                    }

                    const action = parseBinaryAction(event.rawData);
                    if (action !== 6n) {
                        return;
                    }

                    forwardedInsertFrames += 1;
                    if (Math.random() < 0.003) {
                        restartInFlight = true;
                        restartCount += 1;
                        const downtimeMs = 10 + Math.floor(Math.random() * 60);
                        void control.restart({
                            downtimeMs,
                            reason: `random restart #${restartCount}`,
                        }).finally(() => {
                            restartInFlight = false;
                        });
                    }
                },
            });

            try {
                const dsn =
                    `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                    `?retries=30&retry_backoff_ms=5&retry_backoff_max_ms=20`;
                const conf = new WSConfig(dsn);
                conf.setDb(dbName);
                conf.setTimeOut(10000);
                wsSql = await WsSql.open(conf);
                await wsSql.exec(`create table ${tableName}(ts timestamp, c1 int)`);

                writePhase = true;
                for (let i = 0; i < targetRows; i++) {
                    await wsSql.exec(
                        `insert into ${tableName} values(${baseTs + i}, ${i})`
                    );
                }
                writePhase = false;

                const countResult = await wsSql.exec(
                    `select count(*) from ${tableName}`
                );
                const countValue = countResult.getData()?.[0]?.[0];
                const rowCount = typeof countValue === "bigint"
                    ? Number(countValue)
                    : Number(countValue || 0);

                expect(rowCount).toBe(targetRows);
                expect(forwardedInsertFrames).toBeGreaterThanOrEqual(targetRows);
                expect(restartCount).toBeGreaterThan(0);
            } finally {
                writePhase = false;
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
                    cleanupSql = null;
                }
            }
        },
        300 * 1000
    );

    test(
        "keeps all 5000 rows with three-address random proxy restarts during inserts",
        async () => {
            const targetRows = 5000;
            const baseTs = 1700010000000;
            const dbName = "test_1773989170";
            const tableName = "t0";
            const proxyStates = new Map<string, { forwarded: number; restarting: boolean; restarts: number }>();
            let wsSql: WsSql | null = null;
            let setupSql: WsSql | null = null;
            let cleanupSql: WsSql | null = null;
            let writePhase = false;

            const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
            const setupConf = new WSConfig(localDsn);
            setupConf.setTimeOut(6000);
            setupSql = await WsSql.open(setupConf);
            try {
                await setupSql.exec(`drop database if exists ${dbName}`);
                await setupSql.exec(`create database if not exists ${dbName}`);
            } finally {
                await setupSql.close();
                setupSql = null;
            }

            const createRandomRestartProxy = async (name: string) => {
                proxyStates.set(name, {
                    forwarded: 0,
                    restarting: false,
                    restarts: 0,
                });
                return WsProxy.create({
                    host: "127.0.0.1",
                    port: 0,
                    onEvent: (event, control) => {
                        if (!writePhase) {
                            return;
                        }
                        if (event.type !== "message") {
                            return;
                        }
                        if (event.direction !== "client_to_upstream" || !event.isBinary) {
                            return;
                        }

                        const action = parseBinaryAction(event.rawData);
                        if (action !== 6n) {
                            return;
                        }

                        const state = proxyStates.get(name);
                        if (!state) {
                            return;
                        }
                        state.forwarded += 1;
                        if (state.restarting) {
                            return;
                        }
                        if (Math.random() >= 0.003) {
                            return;
                        }

                        state.restarting = true;
                        state.restarts += 1;
                        const downtimeMs = 80 + Math.floor(Math.random() * 120);
                        void control
                            .restart({
                                downtimeMs,
                                reason: `${name} random restart #${state.restarts}`,
                            })
                            .finally(() => {
                                const latestState = proxyStates.get(name);
                                if (latestState) {
                                    latestState.restarting = false;
                                }
                            });
                    },
                });
            };

            const proxyA = await createRandomRestartProxy("proxy_a");
            const proxyB = await createRandomRestartProxy("proxy_b");
            const proxyC = await createRandomRestartProxy("proxy_c");

            try {
                const dsn =
                    `ws://${testUsername()}:${testPassword()}` +
                    `@127.0.0.1:${proxyA.getPort()},127.0.0.1:${proxyB.getPort()},127.0.0.1:${proxyC.getPort()}` +
                    `?retries=24&retry_backoff_ms=8&retry_backoff_max_ms=25`;
                const conf = new WSConfig(dsn);
                conf.setDb(dbName);
                conf.setTimeOut(10000);
                wsSql = await WsSql.open(conf);
                await wsSql.exec(`create table ${tableName}(ts timestamp, c1 int)`);

                writePhase = true;
                for (let i = 0; i < targetRows; i++) {
                    await wsSql.exec(
                        `insert into ${tableName} values(${baseTs + i}, ${i})`
                    );
                }
                writePhase = false;

                const countResult = await wsSql.exec(
                    `select count(*) from ${tableName}`
                );
                const countValue = countResult.getData()?.[0]?.[0];
                const rowCount = typeof countValue === "bigint"
                    ? Number(countValue)
                    : Number(countValue || 0);

                const totalForwarded = Array.from(proxyStates.values()).reduce(
                    (sum, state) => sum + state.forwarded,
                    0
                );
                const totalRestarts = Array.from(proxyStates.values()).reduce(
                    (sum, state) => sum + state.restarts,
                    0
                );

                expect(rowCount).toBe(targetRows);
                expect(totalForwarded).toBeGreaterThanOrEqual(targetRows);
                expect(totalRestarts).toBeGreaterThan(0);
            } finally {
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
                    cleanupSql = null;
                }
            }
        },
        300 * 1000
    );

    test("tmq failover recovers subscribe context and replays inflight poll", async () => {
        const dbName = "test_1774096925";
        const tableName = "t0";
        const topicName = "topic_1774096925";
        const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let consumer: WsConsumer | null = null;
        let restartTriggered = false;
        let proxyBHadActivity = false;

        setupSql = await WsSql.open(new WSConfig(localDsn));
        try {
            await setupSql.exec(`drop topic if exists ${topicName}`);
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database ${dbName}`);
            await setupSql.exec(`create table ${dbName}.${tableName}(ts timestamp, c1 int)`);
            await setupSql.exec(`insert into ${dbName}.${tableName} values(now - 1s, 1) (now, 2)`);
            await setupSql.exec(`create topic ${topicName} as select * from ${dbName}.${tableName}`);
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxyA = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message") {
                    return;
                }
                if (event.direction !== "client_to_upstream") {
                    return;
                }
                const action = parseJsonAction(event.rawData);
                if (action === "poll" && !restartTriggered) {
                    restartTriggered = true;
                    void control.restart({
                        downtimeMs: 350,
                        reason: "trigger tmq poll failover",
                    });
                }
            },
        });

        const proxyB = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event: WsProxyEvent) => {
                if (event.type === "client_connected") {
                    proxyBHadActivity = true;
                    return;
                }
                if (
                    event.type === "message" &&
                    event.direction === "client_to_upstream"
                ) {
                    proxyBHadActivity = true;
                }
            },
        });

        const tmqConf = new Map<string, any>([
            [TMQConstants.GROUP_ID, `g_${Date.now()}`],
            [TMQConstants.CLIENT_ID, `c_${Date.now()}`],
            [TMQConstants.CONNECT_USER, testUsername()],
            [TMQConstants.CONNECT_PASS, testPassword()],
            [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
            [TMQConstants.ENABLE_AUTO_COMMIT, false],
            [TMQConstants.AUTO_COMMIT_INTERVAL_MS, 1000],
            [TMQConstants.WS_URL,
            `ws://${testUsername()}:${testPassword()}` +
            `@127.0.0.1:${proxyA.getPort()},127.0.0.1:${proxyB.getPort()}` +
            `?retries=6&retry_backoff_ms=20&retry_backoff_max_ms=60`
            ],
        ]);
        const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);

        try {
            consumer = await WsConsumer.newConsumer(tmqConf);
            await consumer.subscribe([topicName]);

            let rows = 0;
            for (let i = 0; i < 8 && rows === 0; i++) {
                const res = await consumer.poll(800);
                for (const [, value] of res) {
                    const data = value.getData();
                    rows += data?.length || 0;
                }
            }

            expect(restartTriggered).toBe(true);
            expect(proxyBHadActivity).toBe(true);
            expect(rows).toBeGreaterThan(0);
        } finally {
            if (consumer) {
                try {
                    await consumer.unsubscribe();
                } catch (_err) {
                    // ignore cleanup error
                }
                await consumer.close();
            }
            await Promise.all([
                proxyA.stop("test cleanup"),
                proxyB.stop("test cleanup"),
            ]);
            randomSpy.mockRestore();

            cleanupSql = await WsSql.open(new WSConfig(localDsn));
            try {
                await cleanupSql.exec(`drop topic if exists ${topicName}`);
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
                cleanupSql = null;
            }
        }
    }, 180 * 1000);

    test("tmq single-address reconnect resumes poll and consumes all 5000 rows", async () => {
        const targetRows = 5000;
        const batchSize = 1000;
        const baseTs = 1700020000000;
        const dbName = "test_1774186545";
        const tableName = "t0";
        const topicName = "topic_1774186545";
        const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let consumer: WsConsumer | null = null;
        let pollRequestCount = 0;
        let restartInFlight = false;
        let restartCount = 0;

        setupSql = await WsSql.open(new WSConfig(localDsn));
        try {
            await setupSql.exec(`drop topic if exists ${topicName}`);
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database ${dbName}`);
            await setupSql.exec(`create table ${dbName}.${tableName}(ts timestamp, c1 int)`);

            for (let start = 0; start < targetRows; start += batchSize) {
                const end = Math.min(start + batchSize, targetRows);
                const values: string[] = [];
                for (let i = start; i < end; i++) {
                    values.push(`(${baseTs + i}, ${i})`);
                }
                await setupSql.exec(
                    `insert into ${dbName}.${tableName} values ${values.join(" ")}`
                );
            }
            await setupSql.exec(
                `create topic ${topicName} as select * from ${dbName}.${tableName}`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const proxy = await WsProxy.create({
            host: "127.0.0.1",
            port: 0,
            onEvent: (event, control) => {
                if (event.type !== "message") {
                    return;
                }
                if (event.direction !== "client_to_upstream") {
                    return;
                }
                const action = parseJsonAction(event.rawData);
                if (action !== "poll") {
                    return;
                }

                pollRequestCount += 1;
                if (restartInFlight) {
                    return;
                }

                const shouldRestart = Math.random() < 0.18 ||
                    (restartCount === 0 && pollRequestCount >= 1);
                if (!shouldRestart) {
                    return;
                }

                restartInFlight = true;
                restartCount += 1;
                const downtimeMs = 20 + Math.floor(Math.random() * 90);
                void control.restart({
                    downtimeMs,
                    reason: `random poll restart #${restartCount}`,
                }).finally(() => {
                    restartInFlight = false;
                });
            },
        });

        const tmqConf = new Map<string, any>([
            [TMQConstants.GROUP_ID, `g_${Date.now()}`],
            [TMQConstants.CLIENT_ID, `c_${Date.now()}`],
            [TMQConstants.CONNECT_USER, testUsername()],
            [TMQConstants.CONNECT_PASS, testPassword()],
            [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
            [TMQConstants.ENABLE_AUTO_COMMIT, false],
            [TMQConstants.AUTO_COMMIT_INTERVAL_MS, 1000],
            [TMQConstants.WS_URL,
            `ws://${testUsername()}:${testPassword()}` +
            `@127.0.0.1:${proxy.getPort()}` +
            `?retries=60&retry_backoff_ms=10&retry_backoff_max_ms=40`
            ],
        ]);

        try {
            consumer = await WsConsumer.newConsumer(tmqConf);
            await consumer.subscribe([topicName]);

            let consumedRows = 0;
            const deadline = Date.now() + 120 * 1000;
            while (Date.now() < deadline && consumedRows < targetRows) {
                const res = await consumer.poll(1200);
                for (const [, value] of res) {
                    const data = value.getData();
                    consumedRows += data?.length || 0;
                }
            }

            expect(pollRequestCount).toBeGreaterThan(0);
            expect(restartCount).toBeGreaterThan(0);
            expect(consumedRows).toBe(targetRows);
        } finally {
            if (consumer) {
                try {
                    await consumer.unsubscribe();
                } catch (_err) {
                    // ignore cleanup error
                }
                await consumer.close();
            }
            await proxy.stop("test cleanup");

            cleanupSql = await WsSql.open(new WSConfig(localDsn));
            try {
                await cleanupSql.exec(`drop topic if exists ${topicName}`);
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
                cleanupSql = null;
            }
        }
    }, 300 * 1000);

    test("tmq three-address failover resumes poll and consumes all 5000 rows", async () => {
        const targetRows = 5000;
        const batchSize = 1000;
        const baseTs = 1700021000000;
        const dbName = "test_1774187557";
        const tableName = "t0";
        const topicName = "topic_1774187557";
        const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
        let setupSql: WsSql | null = null;
        let cleanupSql: WsSql | null = null;
        let consumer: WsConsumer | null = null;
        let totalPollRequestCount = 0;
        let totalRestartCount = 0;
        const proxyStates = new Map<string, { pollRequests: number; restarts: number; restartInFlight: boolean }>();

        setupSql = await WsSql.open(new WSConfig(localDsn));
        try {
            await setupSql.exec(`drop topic if exists ${topicName}`);
            await setupSql.exec(`drop database if exists ${dbName}`);
            await setupSql.exec(`create database ${dbName}`);
            await setupSql.exec(`create table ${dbName}.${tableName}(ts timestamp, c1 int)`);

            for (let start = 0; start < targetRows; start += batchSize) {
                const end = Math.min(start + batchSize, targetRows);
                const values: string[] = [];
                for (let i = start; i < end; i++) {
                    values.push(`(${baseTs + i}, ${i})`);
                }
                await setupSql.exec(
                    `insert into ${dbName}.${tableName} values ${values.join(" ")}`
                );
            }
            await setupSql.exec(
                `create topic ${topicName} as select * from ${dbName}.${tableName}`
            );
        } finally {
            await setupSql.close();
            setupSql = null;
        }

        const createPollRestartProxy = async (name: string) => {
            proxyStates.set(name, {
                pollRequests: 0,
                restarts: 0,
                restartInFlight: false,
            });
            return WsProxy.create({
                host: "127.0.0.1",
                port: 0,
                onEvent: (event, control) => {
                    if (event.type !== "message") {
                        return;
                    }
                    if (event.direction !== "client_to_upstream") {
                        return;
                    }
                    const action = parseJsonAction(event.rawData);
                    if (action !== "poll") {
                        return;
                    }

                    const state = proxyStates.get(name);
                    if (!state) {
                        return;
                    }

                    state.pollRequests += 1;
                    totalPollRequestCount += 1;
                    if (state.restartInFlight) {
                        return;
                    }

                    const shouldRestart = Math.random() < 0.18 ||
                        (totalRestartCount === 0 && totalPollRequestCount >= 1);
                    if (!shouldRestart) {
                        return;
                    }

                    state.restartInFlight = true;
                    state.restarts += 1;
                    totalRestartCount += 1;
                    const downtimeMs = 20 + Math.floor(Math.random() * 90);
                    void control.restart({
                        downtimeMs,
                        reason: `${name} random poll restart #${state.restarts}`,
                    }).finally(() => {
                        const latest = proxyStates.get(name);
                        if (latest) {
                            latest.restartInFlight = false;
                        }
                    });
                },
            });
        };

        const proxyA = await createPollRestartProxy("proxy_a");
        const proxyB = await createPollRestartProxy("proxy_b");
        const proxyC = await createPollRestartProxy("proxy_c");

        const tmqConf = new Map<string, any>([
            [TMQConstants.GROUP_ID, `g_${Date.now()}`],
            [TMQConstants.CLIENT_ID, `c_${Date.now()}`],
            [TMQConstants.CONNECT_USER, testUsername()],
            [TMQConstants.CONNECT_PASS, testPassword()],
            [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
            [TMQConstants.ENABLE_AUTO_COMMIT, false],
            [TMQConstants.AUTO_COMMIT_INTERVAL_MS, 1000],
            [TMQConstants.WS_URL,
            `ws://${testUsername()}:${testPassword()}` +
            `@127.0.0.1:${proxyA.getPort()},127.0.0.1:${proxyB.getPort()},127.0.0.1:${proxyC.getPort()}` +
            `?retries=60&retry_backoff_ms=10&retry_backoff_max_ms=40`
            ],
        ]);

        try {
            consumer = await WsConsumer.newConsumer(tmqConf);
            await consumer.subscribe([topicName]);

            let consumedRows = 0;
            const deadline = Date.now() + 120 * 1000;
            while (Date.now() < deadline && consumedRows < targetRows) {
                const res = await consumer.poll(1200);
                for (const [, value] of res) {
                    const data = value.getData();
                    consumedRows += data?.length || 0;
                }
            }

            expect(totalPollRequestCount).toBeGreaterThan(0);
            expect(totalRestartCount).toBeGreaterThan(0);
            expect(consumedRows).toBe(targetRows);
        } finally {
            if (consumer) {
                try {
                    await consumer.unsubscribe();
                } catch (_err) {
                    // ignore cleanup error
                }
                await consumer.close();
            }
            await Promise.all([
                proxyA.stop("test cleanup"),
                proxyB.stop("test cleanup"),
                proxyC.stop("test cleanup"),
            ]);

            cleanupSql = await WsSql.open(new WSConfig(localDsn));
            try {
                await cleanupSql.exec(`drop topic if exists ${topicName}`);
                await cleanupSql.exec(`drop database if exists ${dbName}`);
            } finally {
                await cleanupSql.close();
                cleanupSql = null;
            }
        }
    }, 300 * 1000);
});
