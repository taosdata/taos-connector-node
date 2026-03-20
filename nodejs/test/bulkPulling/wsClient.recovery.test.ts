import { w3cwebsocket } from "websocket";
import { WsClient } from "../../src/client/wsClient";
import { WebSocketConnectionPool } from "../../src/client/wsConnectorPool";
import { parse } from "../../src/common/dsn";

function createMockConnector() {
    return {
        readyState: jest.fn(() => w3cwebsocket.OPEN),
        ready: jest.fn(async () => { }),
        setSessionRecoveryHook: jest.fn(),
        sendMsgDirect: jest.fn(async (_message: string) => ({
            msg: { code: 0, message: "" }
        })),
        sendMsg: jest.fn(async () => ({ msg: { code: 0, message: "" } })),
        sendMsgNoResp: jest.fn(async () => { }),
    };
}

describe("WsClient recovery hook", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("passes normalized custom path when using dsn", async () => {
        const dsn = parse("ws://root:taosdata@localhost:6041");
        const connector = createMockConnector();
        const getConnectionSpy = jest
            .spyOn(WebSocketConnectionPool.instance(), "getConnection")
            .mockResolvedValue(connector as any);

        const client = new WsClient(dsn, 4321, "/rest/tmq");
        await client.ready();

        expect(getConnectionSpy).toHaveBeenCalledWith(dsn, "rest/tmq", 4321);
    });

    test("runs custom recovery hook without sql conn recovery on tmq path", async () => {
        const dsn = parse("ws://root:taosdata@localhost:6041");
        const connector = createMockConnector();
        jest
            .spyOn(WebSocketConnectionPool.instance(), "getConnection")
            .mockResolvedValue(connector as any);

        const customRecoveryHook = jest.fn(async () => { });
        const client = new WsClient(dsn, 5000, "/rest/tmq");
        client.setSessionRecoveryHook(customRecoveryHook);
        await client.ready();

        const hookCalls = connector.setSessionRecoveryHook.mock.calls;
        const hook = hookCalls[hookCalls.length - 1]?.[0];
        expect(hook).toBeTruthy();
        await hook();

        expect(connector.sendMsgDirect).not.toHaveBeenCalled();
        expect(customRecoveryHook).toHaveBeenCalledTimes(1);
    });

    test("keeps sql conn recovery and then runs custom recovery on /ws path", async () => {
        const dsn = parse("ws://root:taosdata@localhost:6041");
        const connector = createMockConnector();
        const callOrder: string[] = [];
        connector.sendMsgDirect.mockImplementation(async (message: string) => {
            const action = JSON.parse(message).action;
            callOrder.push(action);
            return { msg: { code: 0, message: "" } };
        });
        jest
            .spyOn(WebSocketConnectionPool.instance(), "getConnection")
            .mockResolvedValue(connector as any);

        const client = new WsClient(dsn, 5000, "/ws");
        (client as any)._connectedDatabase = "db_recovery";
        client.setSessionRecoveryHook(async () => {
            callOrder.push("custom");
        });
        await client.ready();

        const hookCalls = connector.setSessionRecoveryHook.mock.calls;
        const hook = hookCalls[hookCalls.length - 1]?.[0];
        expect(hook).toBeTruthy();
        await hook();

        expect(connector.sendMsgDirect).toHaveBeenCalledTimes(1);
        const firstCall = connector.sendMsgDirect.mock.calls[0] as [string];
        const connMsg = JSON.parse(firstCall[0]);
        expect(connMsg.action).toBe("conn");
        expect(connMsg.args.db).toBe("db_recovery");
        expect(callOrder).toEqual(["conn", "custom"]);
    });
});
