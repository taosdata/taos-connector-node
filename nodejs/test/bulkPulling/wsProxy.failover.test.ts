import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { WSConfig } from "../../src/common/config";
import { WsSql } from "../../src/sql/wsSql";
import { testPassword, testUsername } from "../helpers/utils";
import { WsProxy, WsProxyEvent } from "../helpers/wsProxy";

function parseBinaryAction(rawData: Buffer | string): bigint | null {
    if (typeof rawData === "string" || rawData.byteLength < 24) {
        return null;
    }
    return rawData.readBigInt64LE(16);
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
});
