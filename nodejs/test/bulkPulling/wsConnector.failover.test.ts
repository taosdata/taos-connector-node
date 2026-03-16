import { RetryConfig, WebSocketConnector } from "../../src/client/wsConnector";

function createBareConnector(): any {
    const connector = Object.create(WebSocketConnector.prototype) as any;
    connector._timeout = 5000;
    connector._addresses = [
        { host: "host1", port: 6041 },
        { host: "host2", port: 6042 },
    ];
    connector._currentAddressIndex = 0;
    connector._retryConfig = new RetryConfig(1, 1, 8);
    connector._reconnectLock = null;
    connector._isReconnecting = false;
    connector._inflightRequests = new Map();
    connector._inflightRequestOrder = [];
    connector._conn = {
        readyState: 1,
        send: jest.fn(),
        close: jest.fn(),
    };
    return connector;
}

function buildBinaryMessage(action: bigint): ArrayBuffer {
    const buffer = new ArrayBuffer(26);
    const view = new DataView(buffer);
    view.setBigInt64(16, action, true);
    return buffer;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("WebSocketConnector failover and retry", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("deduplicates concurrent reconnect triggers with reconnect lock", async () => {
        const connector = createBareConnector();
        const reconnectImpl = jest.fn(async () => {
            await delay(20);
        });
        connector._doReconnect = reconnectImpl;

        await Promise.all([
            connector.triggerReconnect(),
            connector.triggerReconnect(),
            connector.triggerReconnect(),
        ]);

        expect(reconnectImpl).toHaveBeenCalledTimes(1);
    });

    test("switches to next address after retries are exhausted", async () => {
        const connector = createBareConnector();
        const attempts: string[] = [];
        connector.sleep = jest.fn(async () => { });
        connector.reconnect = jest.fn(async () => {
            const current = connector._addresses[connector._currentAddressIndex];
            const addr = `${current.host}:${current.port}`;
            attempts.push(addr);
            if (addr === "host1:6041") {
                throw new Error("host1 down");
            }
        });

        await connector.attemptReconnect();

        expect(attempts).toEqual([
            "host1:6041",
            "host2:6042",
        ]);
        expect(connector._currentAddressIndex).toBe(1);
    });

    test("triggers reconnect and keeps retriable string request inflight when send throws", async () => {
        const connector = createBareConnector();
        connector.triggerReconnect = jest.fn(() => new Promise<void>(() => { }));
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });

        const pending = connector.sendMsg(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 101,
                },
            }),
            false
        );
        void pending.catch(() => { });

        const state = await Promise.race([
            pending.then(() => "resolved").catch(() => "rejected"),
            delay(20).then(() => "pending"),
        ]);

        expect(state).toBe("pending");
        expect(connector.triggerReconnect).toHaveBeenCalledTimes(1);
        expect(connector._inflightRequests.has(101n)).toBe(true);
        connector.failAllInflightRequests(new Error("cleanup"));
    });

    test("rejects non-retriable string request immediately when send throws", async () => {
        const connector = createBareConnector();
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });

        await expect(
            connector.sendMsg(
                JSON.stringify({
                    action: "query",
                    args: {
                        req_id: 102,
                    },
                }),
                false
            )
        ).rejects.toThrow("send failed");
        expect(connector._inflightRequests.has(102n)).toBe(false);
    });

    test("triggers reconnect and keeps retriable binary request inflight when send throws", async () => {
        const connector = createBareConnector();
        connector.triggerReconnect = jest.fn(() => new Promise<void>(() => { }));
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });
        const message = buildBinaryMessage(6n);

        const pending = connector.sendBinaryMsg(201n, "binary_query", message, false);
        void pending.catch(() => { });

        const state = await Promise.race([
            pending.then(() => "resolved").catch(() => "rejected"),
            delay(20).then(() => "pending"),
        ]);

        expect(state).toBe("pending");
        expect(connector.triggerReconnect).toHaveBeenCalledTimes(1);
        expect(connector._inflightRequests.has(201n)).toBe(true);
        connector.failAllInflightRequests(new Error("cleanup"));
    });

    test("rejects non-retriable binary request immediately when send throws", async () => {
        const connector = createBareConnector();
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });
        const message = buildBinaryMessage(7n);

        await expect(
            connector.sendBinaryMsg(202n, "fetch", message, false)
        ).rejects.toThrow("send failed");
        expect(connector._inflightRequests.has(202n)).toBe(false);
    });

    test("replays inflight string requests in put order when req_id is reinserted", async () => {
        const connector = createBareConnector();
        connector.triggerReconnect = jest.fn(() => new Promise<void>(() => { }));
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });

        const req1Initial = connector.sendMsg(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 301,
                    data: "insert into t values(now, 1)",
                },
            }),
            false
        );
        const req2 = connector.sendMsg(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 302,
                    data: "insert into t values(now, 2)",
                },
            }),
            false
        );
        const req1Reinserted = connector.sendMsg(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 301,
                    data: "insert into t values(now, 3)",
                },
            }),
            false
        );
        void req1Initial.catch(() => { });
        void req2.catch(() => { });
        void req1Reinserted.catch(() => { });

        await delay(20);

        const replaySend = jest.fn();
        connector._conn.send = replaySend;

        await connector.replayRequests();

        const replayedReqIds = replaySend.mock.calls.map(([payload]: [string]) => {
            const parsed = JSON.parse(payload);
            return BigInt(parsed.args.req_id);
        });

        expect(replayedReqIds).toEqual([302n, 301n]);
        connector.failAllInflightRequests(new Error("cleanup"));
    });

    test("replays inflight requests in the same put order", async () => {
        const connector = createBareConnector();
        connector.triggerReconnect = jest.fn(() => new Promise<void>(() => { }));
        connector._conn.send = jest.fn(() => {
            throw new Error("send failed");
        });

        const reqIds = [101, 102, 103, 104];
        for (const reqId of reqIds) {
            const pending = connector.sendMsg(
                JSON.stringify({
                    action: "insert",
                    args: {
                        req_id: reqId,
                        data: `insert into t values(now, ${reqId})`,
                    },
                }),
                false
            );
            void pending.catch(() => { });
        }

        await delay(20);

        const replaySend = jest.fn();
        connector._conn.send = replaySend;

        await connector.replayRequests();

        const replayedReqIds = replaySend.mock.calls.map(([payload]: [string]) => {
            const parsed = JSON.parse(payload);
            return parsed.args.req_id;
        });

        expect(replayedReqIds).toEqual([101, 102, 103, 104]);
        connector.failAllInflightRequests(new Error("cleanup"));
    });
});
