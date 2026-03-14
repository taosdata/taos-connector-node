import { RetryConfig } from "../../src/client/retryConfig";
import { WebSocketConnector } from "../../src/client/wsConnector";

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
    connector._wsConn = {
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
        connector.reconnectToCurrentAddress = jest.fn(async () => {
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
            "host1:6041",
            "host2:6042",
        ]);
        expect(connector._currentAddressIndex).toBe(1);
    });

    test("keeps retriable string request inflight when send throws", async () => {
        const connector = createBareConnector();
        connector._wsConn.send = jest.fn(() => {
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
        expect(connector._inflightRequests.has(101n)).toBe(true);
        connector.failAllInflightRequests(new Error("cleanup"));
    });

    test("rejects non-retriable string request immediately when send throws", async () => {
        const connector = createBareConnector();
        connector._wsConn.send = jest.fn(() => {
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

    test("keeps retriable binary request inflight when send throws", async () => {
        const connector = createBareConnector();
        connector._wsConn.send = jest.fn(() => {
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
        expect(connector._inflightRequests.has(201n)).toBe(true);
        connector.failAllInflightRequests(new Error("cleanup"));
    });

    test("rejects non-retriable binary request immediately when send throws", async () => {
        const connector = createBareConnector();
        connector._wsConn.send = jest.fn(() => {
            throw new Error("send failed");
        });
        const message = buildBinaryMessage(7n);

        await expect(
            connector.sendBinaryMsg(202n, "fetch", message, false)
        ).rejects.toThrow("send failed");
        expect(connector._inflightRequests.has(202n)).toBe(false);
    });
});
