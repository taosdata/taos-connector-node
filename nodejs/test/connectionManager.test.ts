import { parseMultiAddressUrl, buildUrlForHost } from "../src/common/urlParser";
import { ConnectionManager } from "../src/client/wsConnectionManager";

describe("ConnectionManager", () => {
    test("constructor initializes with random index", () => {
        const parsed = parseMultiAddressUrl(
            "ws://root:taosdata@host1:6041,host2:6042,host3:6043?retries=2&retry_backoff_ms=100"
        );
        const mgr = new ConnectionManager(parsed, 5000);
        expect(mgr).toBeDefined();
        expect(mgr.getParsed()).toBe(parsed);
        expect(mgr.isConnected()).toBe(false);
        expect(mgr.getConnector()).toBeNull();
        expect(mgr.getInflightCount()).toBe(0);
    });

    test("getCurrentUrl returns valid URL", () => {
        const parsed = parseMultiAddressUrl(
            "ws://root:taosdata@localhost:6041,localhost:6042"
        );
        const mgr = new ConnectionManager(parsed, 5000);
        const url = mgr.getCurrentUrl();
        expect(url.protocol).toBe("ws:");
        expect(url.username).toBe("root");
        expect(["6041", "6042"]).toContain(url.port);
    });

    test("trackRequest and completeRequest", () => {
        const parsed = parseMultiAddressUrl("ws://root:taosdata@localhost:6041");
        const mgr = new ConnectionManager(parsed, 5000);
        
        mgr.trackRequest("req1", {
            id: "req1",
            type: "text",
            message: '{"action":"test"}',
            resolve: () => {},
            reject: () => {},
            register: true,
        });
        expect(mgr.getInflightCount()).toBe(1);

        mgr.completeRequest("req1");
        expect(mgr.getInflightCount()).toBe(0);
    });

    test("close clears inflight requests", async () => {
        const parsed = parseMultiAddressUrl("ws://root:taosdata@localhost:6041");
        const mgr = new ConnectionManager(parsed, 5000);
        
        mgr.trackRequest("req1", {
            id: "req1",
            type: "text",
            message: '{"action":"test"}',
            resolve: () => {},
            reject: () => {},
            register: true,
        });
        expect(mgr.getInflightCount()).toBe(1);

        await mgr.close();
        expect(mgr.getInflightCount()).toBe(0);
    });
});
