import { WebSocketConnectionPool } from "@src/client/wsConnectorPool";
import { WSConfig } from "@src/common/config";
import { parse, WS_TMQ_ENDPOINT } from "@src/common/dsn";
import { WsSql } from "@src/sql/wsSql";
import { testPassword, testUsername } from "@test-helpers/utils";

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
        const keyA = (pool as any).getPoolKey(dsnA);
        const keyB = (pool as any).getPoolKey(dsnB);
        expect(keyA).toBe(keyB);
    });

    test("isolates connections for different auth identities", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsnUserA = parse("ws://root:taosdata@host1:6041/mydb");
        const dsnUserB = parse("ws://admin:taosdata@host1:6041/mydb");
        const keyA = (pool as any).getPoolKey(dsnUserA);
        const keyB = (pool as any).getPoolKey(dsnUserB);
        expect(keyA).not.toBe(keyB);
    });

    test("isolates connections for different token values", () => {
        const pool = WebSocketConnectionPool.instance();
        const dsnA = parse("ws://host1:6041/mydb?token=token-a");
        const dsnB = parse("ws://host1:6041/mydb?token=token-b");
        const keyA = (pool as any).getPoolKey(dsnA);
        const keyB = (pool as any).getPoolKey(dsnB);
        expect(keyA).not.toBe(keyB);
    });

    test("includes endpoint-derived websocket path in the pool key scope", () => {
        const pool = WebSocketConnectionPool.instance();
        const sqlDsn = parse("ws://root:taosdata@host1:6041/mydb");
        const tmqDsn = parse("ws://root:taosdata@host1:6041/mydb");
        tmqDsn.endpoint = WS_TMQ_ENDPOINT;
        const sqlKey = (pool as any).getPoolKey(sqlDsn);
        const tmqKey = (pool as any).getPoolKey(tmqDsn);
        expect(sqlKey).not.toBe(tmqKey);
    });
});

describe("Security: pool key must include auth identity", () => {
    beforeEach(() => {
        resetPoolSingleton();
    });

    afterEach(() => {
        resetPoolSingleton();
    });

    test("username/password: different credentials must not share a pool entry", async () => {
        const validDsn = `ws://${testUsername()}:${testPassword()}@localhost:6041`;
        const wrongPasswordDsn = `ws://${testUsername()}:WRONG_PASSWORD_SENTINEL@localhost:6041`;

        const validConn = await WsSql.open(new WSConfig(validDsn));
        expect(validConn.state()).toBeGreaterThan(0);
        await validConn.close();

        await expect(WsSql.open(new WSConfig(wrongPasswordDsn))).rejects.toThrow();
    });

    test("same credentials should share a pool entry (sanity check)", async () => {
        const dsn = `ws://${testUsername()}:${testPassword()}@localhost:6041`;

        const conn1 = await WsSql.open(new WSConfig(dsn));
        expect(conn1.state()).toBeGreaterThan(0);
        const connector1 = ((conn1 as any)._wsClient as any)._wsConnector;
        expect(connector1).toBeDefined();
        await conn1.close();

        const conn2 = await WsSql.open(new WSConfig(dsn));
        expect(conn2.state()).toBeGreaterThan(0);
        const connector2 = ((conn2 as any)._wsClient as any)._wsConnector;
        expect(connector2).toBe(connector1);
        await conn2.close();
    });
});
