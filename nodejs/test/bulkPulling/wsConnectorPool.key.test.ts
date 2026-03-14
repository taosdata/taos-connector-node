import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { parse } from "../../src/common/dsn";

function resetPoolSingleton() {
    const PoolClass = WebSocketConnectionPool as any;
    if (PoolClass._instance) {
        PoolClass._instance.destroyed();
        PoolClass._instance = undefined;
    }
}

describe("WebSocketConnectionPool key generation", () => {
    beforeEach(() => {
        resetPoolSingleton();
    });

    afterEach(() => {
        resetPoolSingleton();
    });

    test("normalizes address order when generating pool key", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsnA = parse(
            "ws://root:taosdata@host2:6042,host1:6041/mydb?timezone=UTC&token=abc"
        );
        const dsnB = parse(
            "ws://root:taosdata@host1:6041,host2:6042/mydb?token=abc&timezone=UTC"
        );

        const keyA = (pool as any).getPoolKey(dsnA, "ws");
        const keyB = (pool as any).getPoolKey(dsnB, "ws");

        expect(keyA).toBe(keyB);
    });

    test("isolates connections for different auth identities", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsnUserA = parse("ws://root:taosdata@host1:6041/mydb");
        const dsnUserB = parse("ws://admin:taosdata@host1:6041/mydb");

        const keyA = (pool as any).getPoolKey(dsnUserA, "ws");
        const keyB = (pool as any).getPoolKey(dsnUserB, "ws");

        expect(keyA).not.toBe(keyB);
    });

    test("isolates connections for different token values", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsnA = parse("ws://host1:6041/mydb?token=token-a");
        const dsnB = parse("ws://host1:6041/mydb?token=token-b");

        const keyA = (pool as any).getPoolKey(dsnA, "ws");
        const keyB = (pool as any).getPoolKey(dsnB, "ws");

        expect(keyA).not.toBe(keyB);
    });

    test("includes websocket path in the pool key scope", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsn = parse("ws://root:taosdata@host1:6041/mydb");

        const sqlKey = (pool as any).getPoolKey(dsn, "ws");
        const tmqKey = (pool as any).getPoolKey(dsn, "rest/tmq");

        expect(sqlKey).not.toBe(tmqKey);
    });
});
