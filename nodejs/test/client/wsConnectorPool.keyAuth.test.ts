import { WebSocketConnectionPool } from "@src/client/wsConnectorPool";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";
import { testPassword, testUsername } from "@test-helpers/utils";

afterAll(() => {
    WebSocketConnectionPool.instance().destroyed();
});

describe("Security: pool key must include auth identity", () => {
    test("username/password: different credentials must not share a pool entry", async () => {
        const validDsn = `ws://${testUsername()}:${testPassword()}@localhost:6041`;
        const wrongPasswordDsn = `ws://${testUsername()}:WRONG_PASSWORD_SENTINEL@localhost:6041`;

        const validConn = await WsSql.open(new WSConfig(validDsn));
        expect(validConn.state()).toBeGreaterThan(0);
        await validConn.close();

        await expect(
            WsSql.open(new WSConfig(wrongPasswordDsn))
        ).rejects.toThrow();
    });

    test("same credentials should share a pool entry (sanity check)", async () => {
        const dsn = `ws://${testUsername()}:${testPassword()}@localhost:6041`;

        const conn1 = await WsSql.open(new WSConfig(dsn));
        expect(conn1.state()).toBeGreaterThan(0);
        await conn1.close();

        const conn2 = await WsSql.open(new WSConfig(dsn));
        expect(conn2.state()).toBeGreaterThan(0);
        await conn2.close();
    });
});
