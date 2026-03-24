import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { testPassword, testUsername } from "../helpers/utils";
import { WsProxy, WsProxyEvent, WsProxyMessageEvent } from "../helpers/wsProxy";

interface StageCase {
    name: string;
    shouldRestart: (event: WsProxyEvent) => boolean;
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

function parseBinaryAction(rawData: Buffer | string): bigint | null {
    if (typeof rawData === "string" || rawData.byteLength < 24) {
        return null;
    }
    return rawData.readBigInt64LE(16);
}

function asClientToUpstreamMessage(event: WsProxyEvent): WsProxyMessageEvent | null {
    if (event.type !== "message") {
        return null;
    }
    if (event.direction !== "client_to_upstream") {
        return null;
    }
    return event;
}

const stageCases: StageCase[] = [
    {
        name: "init",
        shouldRestart: (event) => {
            const messageEvent = asClientToUpstreamMessage(event);
            return !!messageEvent &&
                parseJsonAction(messageEvent.rawData) === "stmt2_init";
        },
    },
    {
        name: "prepare",
        shouldRestart: (event) => {
            const messageEvent = asClientToUpstreamMessage(event);
            return !!messageEvent &&
                parseJsonAction(messageEvent.rawData) === "stmt2_prepare";
        },
    },
    {
        name: "bind",
        shouldRestart: (event) => {
            const messageEvent = asClientToUpstreamMessage(event);
            return !!messageEvent &&
                messageEvent.isBinary &&
                parseBinaryAction(messageEvent.rawData) === 9n;
        },
    },
    {
        name: "exec",
        shouldRestart: (event) => {
            const messageEvent = asClientToUpstreamMessage(event);
            return !!messageEvent &&
                parseJsonAction(messageEvent.rawData) === "stmt2_exec";
        },
    },
    {
        name: "result",
        shouldRestart: (event) => {
            const messageEvent = asClientToUpstreamMessage(event);
            return !!messageEvent &&
                parseJsonAction(messageEvent.rawData) === "stmt2_result";
        },
    },
];

describe("stmt2 failover with ws proxy", () => {
    jest.setTimeout(180 * 1000);

    afterEach(async () => {
        WebSocketConnectionPool.instance().destroyed();
        jest.restoreAllMocks();
    });

    test.each(stageCases)(
        "single-address reconnect recovers stmt2 when network error happens at $name stage",
        async ({ name, shouldRestart }) => {
            const dbName = `test_1774332664_${name}`;
            const tableName = "t0";
            const baseTs = 1700100000000;
            const localDsn = `ws://${testUsername()}:${testPassword()}@127.0.0.1:6041`;
            let setupSql: WsSql | null = null;
            let cleanupSql: WsSql | null = null;
            let wsSql: WsSql | null = null;
            let stmt: any = null;
            let wsRows: any = null;
            let restartTriggered = false;
            let clientConnectedCount = 0;
            let matchedStageMessageCount = 0;
            let rowCount = 0;

            setupSql = await WsSql.open(new WSConfig(localDsn));
            try {
                await setupSql.exec(`drop database if exists ${dbName}`);
                await setupSql.exec(`create database ${dbName}`);
                await setupSql.exec(`create table ${dbName}.${tableName}(ts timestamp, c1 int)`);
                await setupSql.exec(
                    `insert into ${dbName}.${tableName} values` +
                    ` (${baseTs}, 1) (${baseTs + 1}, 2) (${baseTs + 2}, 3)`
                );
            } finally {
                await setupSql.close();
                setupSql = null;
            }

            const proxy = await WsProxy.create({
                host: "127.0.0.1",
                port: 0,
                onEvent: (event, control) => {
                    if (event.type === "client_connected") {
                        clientConnectedCount += 1;
                    }
                    if (restartTriggered) {
                        return;
                    }
                    if (!shouldRestart(event)) {
                        return;
                    }
                    matchedStageMessageCount += 1;
                    restartTriggered = true;
                    void control.restart({
                        downtimeMs: 200,
                        reason: `trigger stmt2 ${name} failover`,
                    });
                },
            });

            try {
                const dsn =
                    `ws://${testUsername()}:${testPassword()}@127.0.0.1:${proxy.getPort()}` +
                    `?retries=20&retry_backoff_ms=15&retry_backoff_max_ms=80`;
                const conf = new WSConfig(dsn);
                conf.setDb(dbName);
                conf.setTimeOut(10000);
                wsSql = await WsSql.open(conf);

                stmt = await wsSql.stmtInit();
                await stmt.prepare(
                    `select ts, c1 from ${tableName} where ts >= ? and ts <= ? order by ts`
                );
                const params = stmt.newStmtParam();
                params.setTimestamp([BigInt(baseTs)]);
                params.setTimestamp([BigInt(baseTs + 2)]);
                await stmt.bind(params);
                await stmt.exec();
                wsRows = await stmt.resultSet();

                while (await wsRows.next()) {
                    const data = wsRows.getData();
                    expect(data).toBeTruthy();
                    rowCount += 1;
                }

                expect(matchedStageMessageCount).toBe(1);
                expect(restartTriggered).toBe(true);
                expect(clientConnectedCount).toBeGreaterThanOrEqual(2);
                expect(rowCount).toBe(3);
            } finally {
                if (wsRows) {
                    try {
                        await wsRows.close();
                    } catch (_err) {
                        // ignore cleanup error
                    }
                    wsRows = null;
                }
                if (stmt) {
                    try {
                        await stmt.close();
                    } catch (_err) {
                        // ignore cleanup error
                    }
                    stmt = null;
                }
                if (wsSql) {
                    await wsSql.close();
                    wsSql = null;
                }
                await proxy.stop("test cleanup");

                cleanupSql = await WsSql.open(new WSConfig(localDsn));
                try {
                    await cleanupSql.exec(`drop database if exists ${dbName}`);
                } finally {
                    await cleanupSql.close();
                    cleanupSql = null;
                }
            }
        }
    );
});
