import { TMQConstants } from "@src/tmq/constant";
import { WsConsumer } from "@src/tmq/wsTmq";

function createConfigMap(): Map<string, any> {
    return new Map<string, any>([
        [TMQConstants.WS_URL, "ws://root:taosdata@localhost:6041"],
        [TMQConstants.GROUP_ID, "g1"],
    ]);
}

describe("WsConsumer adapter ha", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("buildSubscribeMessage includes list_instances when requested", () => {
        const consumer = new (WsConsumer as any)(createConfigMap());
        const msg = consumer.buildSubscribeMessage(["t1"], 1, true);

        expect(msg.action).toBe("subscribe");
        expect(msg.args.list_instances).toBe(true);
    });

    test("buildSubscribeMessage omits list_instances by default", () => {
        const consumer = new (WsConsumer as any)(createConfigMap());
        const msg = consumer.buildSubscribeMessage(["t1"], 2);

        expect(msg.action).toBe("subscribe");
        expect(msg.args.list_instances).toBeUndefined();
    });

    test("subscribe requests endpoint discovery once when adapter_ha is enabled", async () => {
        const consumer = new (WsConsumer as any)(createConfigMap());
        const wsClient = {
            isAdapterHA: jest.fn(() => true),
            exec: jest.fn(async () => ({
                msg: {
                    code: 0,
                    list_instances: ["host2:6042", "host3:6043"],
                },
            })),
            mergeDiscoveredEndpoints: jest.fn(),
            sendMsgDirect: jest.fn(),
            setSessionRecoveryHook: jest.fn(),
        };
        consumer._wsClient = wsClient;

        await consumer.subscribe(["topic_a"], 101);

        expect(wsClient.exec).toHaveBeenCalledTimes(1);
        const [payload, bSqlQuery] = wsClient.exec.mock.calls[0] as any[];
        const msg = JSON.parse(payload as string);
        expect(msg.args.list_instances).toBe(true);
        expect(bSqlQuery).toBe(false);
        expect(wsClient.mergeDiscoveredEndpoints).toHaveBeenCalledWith([
            "host2:6042",
            "host3:6043",
        ]);
    });

    test("subscribe omits endpoint discovery when adapter_ha is disabled", async () => {
        const consumer = new (WsConsumer as any)(createConfigMap());
        const wsClient = {
            isAdapterHA: jest.fn(() => false),
            exec: jest.fn(async () => ({ msg: { code: 0 } })),
            mergeDiscoveredEndpoints: jest.fn(),
            sendMsgDirect: jest.fn(),
            setSessionRecoveryHook: jest.fn(),
        };
        consumer._wsClient = wsClient;

        await consumer.subscribe(["topic_b"], 102);

        const [payload, bSqlQuery] = wsClient.exec.mock.calls[0] as any[];
        const msg = JSON.parse(payload as string);
        expect(msg.args.list_instances).toBeUndefined();
        expect(bSqlQuery).toBe(false);
        expect(wsClient.mergeDiscoveredEndpoints).not.toHaveBeenCalled();
    });

    test("recoverSessionContext re-subscribes without list_instances", async () => {
        const consumer = new (WsConsumer as any)(createConfigMap());
        const wsClient = {
            sendMsgDirect: jest.fn(async () => ({ msg: { code: 0 } })),
            setSessionRecoveryHook: jest.fn(),
        };
        consumer._wsClient = wsClient;
        consumer._topics = ["topic_recover"];

        await consumer.recoverSessionContext();

        const [payload, bSqlQuery] = wsClient.sendMsgDirect.mock.calls[0] as any[];
        const msg = JSON.parse(payload as string);
        expect(msg.action).toBe("subscribe");
        expect(msg.args.list_instances).toBeUndefined();
        expect(bSqlQuery).toBe(false);
    });
});
