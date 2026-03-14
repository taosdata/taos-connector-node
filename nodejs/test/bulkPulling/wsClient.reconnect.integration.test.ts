type SocketBehavior = {
    disconnectOnActions?: string[];
    emitErrorBeforeClose?: boolean;
    openFails?: boolean;
};

type SendLogEntry = {
    socketId: number;
    action: string;
    raw: string;
};

function createMockWebsocketState() {
    let behaviors: SocketBehavior[] = [];
    let sendLog: SendLogEntry[] = [];
    let socketCounter = 0;

    class FakeWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        readyState = FakeWebSocket.CONNECTING;
        url: string;
        id: number;
        onopen?: () => void;
        onclose?: (event: { code: number; reason: string }) => void;
        onerror?: (err: Error) => void;
        onmessage?: (event: { data: string }) => void;
        _binaryType?: string;
        private readonly behavior: SocketBehavior;

        constructor(url: string) {
            this.url = url;
            this.id = ++socketCounter;
            this.behavior = behaviors.shift() || {};
            setTimeout(() => {
                if (this.behavior.openFails) {
                    this.readyState = FakeWebSocket.CLOSED;
                    this.onerror?.(new Error("open failed"));
                    this.onclose?.({ code: 1006, reason: "open failed" });
                    return;
                }
                this.readyState = FakeWebSocket.OPEN;
                this.onopen?.();
            }, 0);
        }

        send(data: string | ArrayBuffer): void {
            if (typeof data !== "string") {
                throw new Error("binary is not supported in this fake");
            }
            const parsed = JSON.parse(data);
            const action = parsed.action || "";
            sendLog.push({ socketId: this.id, action, raw: data });

            if (this.behavior.disconnectOnActions?.includes(action)) {
                this.readyState = FakeWebSocket.CLOSED;
                if (this.behavior.emitErrorBeforeClose) {
                    this.onerror?.(new Error("simulated disconnection"));
                }
                this.onclose?.({
                    code: 1006,
                    reason: "simulated disconnection",
                });
                throw new Error("simulated disconnection");
            }

            setTimeout(() => {
                const reqId = parsed?.args?.req_id;
                this.onmessage?.({
                    data: JSON.stringify({
                        action,
                        req_id: reqId,
                        code: 0,
                        message: "ok",
                    }),
                });
            }, 0);
        }

        close(): void {
            this.readyState = FakeWebSocket.CLOSED;
            this.onclose?.({ code: 1000, reason: "normal close" });
        }
    }

    return {
        FakeWebSocket,
        reset() {
            behaviors = [];
            sendLog = [];
            socketCounter = 0;
        },
        setBehaviors(nextBehaviors: SocketBehavior[]) {
            behaviors = [...nextBehaviors];
        },
        getSendLog() {
            return [...sendLog];
        },
        getSocketCount() {
            return socketCounter;
        },
    };
}

var mockWebsocketState: ReturnType<typeof createMockWebsocketState>;

jest.mock("websocket", () => ({
    w3cwebsocket: (() => {
        mockWebsocketState = createMockWebsocketState();
        return mockWebsocketState.FakeWebSocket;
    })(),
}));

import { parse } from "../../src/common/dsn";
import { WsClient } from "../../src/client/wsClient";
import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { TSDB_OPTION_CONNECTION } from "../../src/common/constant";
import { WsEventCallback } from "../../src/client/wsEventCallback";

function resetPoolSingleton() {
    const PoolClass = WebSocketConnectionPool as any;
    if (PoolClass._instance) {
        PoolClass._instance.destroyed();
        PoolClass._instance = undefined;
    }
}

function resetEventCallbacks() {
    (WsEventCallback as any)._msgActionRegister = new Map();
}

describe("WsClient reconnect integration", () => {
    beforeEach(() => {
        mockWebsocketState.reset();
        resetPoolSingleton();
        resetEventCallbacks();
        jest.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        mockWebsocketState.reset();
        resetEventCallbacks();
        resetPoolSingleton();
    });

    test("recovers conn/options context before replaying inflight insert", async () => {
        mockWebsocketState.setBehaviors([
            { disconnectOnActions: ["insert"] },
            {},
        ]);

        const dsn = parse(
            "ws://root:taosdata@host1:6041,host2:6042/mydb?timezone=UTC&retries=0&retry_backoff_ms=1"
        );
        const client = new WsClient(dsn, 1000);
        await client.connect("mydb");
        await client.setOptionConnection(
            TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_TIMEZONE,
            "UTC"
        );

        const pending = client.exec(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 999001,
                    data: "insert into t values(now, 1)",
                },
            }),
            false
        );

        await expect(pending).resolves.toBeDefined();

        const secondSocketActions = mockWebsocketState
            .getSendLog()
            .filter((entry) => entry.socketId === 2)
            .map((entry) => entry.action);

        expect(secondSocketActions[0]).toBe("conn");
        expect(secondSocketActions[1]).toBe("options_connection");
        expect(secondSocketActions[2]).toBe("insert");
        expect(mockWebsocketState.getSocketCount()).toBe(2);

        await client.close();
    });

    test("deduplicates reconnect when both onerror and onclose are raised", async () => {
        mockWebsocketState.setBehaviors([
            {
                disconnectOnActions: ["insert"],
                emitErrorBeforeClose: true,
            },
            {},
        ]);

        const dsn = parse(
            "ws://root:taosdata@host1:6041,host2:6042/mydb?retries=0&retry_backoff_ms=1"
        );
        const client = new WsClient(dsn, 1000);
        await client.connect("mydb");

        const pending = client.exec(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 999002,
                    data: "insert into t values(now, 2)",
                },
            }),
            false
        );
        await expect(pending).resolves.toBeDefined();

        expect(mockWebsocketState.getSocketCount()).toBe(2);
        await client.close();
    });

    test("rejects retriable inflight request when all reconnect attempts fail", async () => {
        mockWebsocketState.setBehaviors([
            { disconnectOnActions: ["insert"] },
            { openFails: true },
            { openFails: true },
        ]);

        const dsn = parse(
            "ws://root:taosdata@host1:6041,host2:6042/mydb?retries=0&retry_backoff_ms=1"
        );
        const client = new WsClient(dsn, 200);
        await client.connect("mydb");

        const pending = client.exec(
            JSON.stringify({
                action: "insert",
                args: {
                    req_id: 999003,
                    data: "insert into t values(now, 3)",
                },
            }),
            false
        );

        await expect(pending).rejects.toThrow(
            "Failed to reconnect to any available address"
        );

        await client.close();
    });
});
