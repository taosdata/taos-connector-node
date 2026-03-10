import { WebSocketConnector } from "../src/client/wsConnector";

describe("WebSocketConnector", () => {
    test("constructor initializes with parsed multi-address", () => {
        const connector = new WebSocketConnector(
            "ws://root:taosdata@host1:6041,host2:6042,host3:6043?retries=2&retry_backoff_ms=100",
            5000
        );
        expect(connector).toBeDefined();
        expect(connector.getParsed().hosts.length).toBe(3);
        expect(connector.isConnected()).toBe(false);
        expect(connector.getInflightCount()).toBe(0);
    });

    test("getCurrentUrl returns valid URL", () => {
        const connector = new WebSocketConnector(
            "ws://root:taosdata@localhost:6041,localhost:6042",
            5000
        );
        const url = connector.getCurrentUrl();
        expect(url.protocol).toBe("ws:");
        expect(url.username).toBe("root");
        expect(["6041", "6042"]).toContain(url.port);
    });

    test("trackRequest and completeRequest", () => {
        const connector = new WebSocketConnector(
            "ws://root:taosdata@localhost:6041",
            5000
        );

        connector.trackRequest("req1", {
            id: "req1",
            type: "text",
            message: '{"action":"test"}',
            resolve: () => {},
            reject: () => {},
            register: true,
        });
        expect(connector.getInflightCount()).toBe(1);

        connector.completeRequest("req1");
        expect(connector.getInflightCount()).toBe(0);
    });

    test("close clears inflight requests", () => {
        const connector = new WebSocketConnector(
            "ws://root:taosdata@localhost:6041",
            5000
        );

        connector.trackRequest("req1", {
            id: "req1",
            type: "text",
            message: '{"action":"test"}',
            resolve: () => {},
            reject: () => {},
            register: true,
        });
        expect(connector.getInflightCount()).toBe(1);

        connector.close();
        expect(connector.getInflightCount()).toBe(0);
    });
});
