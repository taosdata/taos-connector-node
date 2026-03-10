import { parseMultiAddressUrl, buildUrlForHost, ParsedMultiAddress } from "../src/common/urlParser";

describe("parseMultiAddressUrl", () => {
    test("single host with all params", () => {
        const result = parseMultiAddressUrl(
            "ws://root:taosdata@localhost:6041?retries=3&retry_backoff_ms=100&retry_backoff_max_ms=1000"
        );
        expect(result.scheme).toBe("ws");
        expect(result.username).toBe("root");
        expect(result.password).toBe("taosdata");
        expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
        expect(result.retries).toBe(3);
        expect(result.retryBackoffMs).toBe(100);
        expect(result.retryBackoffMaxMs).toBe(1000);
        // failover params should be removed from searchParams
        expect(result.searchParams.has("retries")).toBe(false);
        expect(result.searchParams.has("retry_backoff_ms")).toBe(false);
    });

    test("multiple hosts", () => {
        const result = parseMultiAddressUrl(
            "ws://root:taosdata@localhost:6041,localhost:6042,localhost:6043?retries=5"
        );
        expect(result.hosts).toEqual([
            { host: "localhost", port: 6041 },
            { host: "localhost", port: 6042 },
            { host: "localhost", port: 6043 },
        ]);
        expect(result.retries).toBe(5);
    });

    test("IPv6 addresses", () => {
        const result = parseMultiAddressUrl(
            "ws://root:taosdata@[::1]:6041,[2001:db8::1]:6042?retries=2"
        );
        expect(result.hosts).toEqual([
            { host: "::1", port: 6041 },
            { host: "2001:db8::1", port: 6042 },
        ]);
    });

    test("mixed IPv4 and IPv6", () => {
        const result = parseMultiAddressUrl(
            "ws://root:taosdata@192.168.1.1:6041,[::1]:6042,myhost:6043"
        );
        expect(result.hosts).toEqual([
            { host: "192.168.1.1", port: 6041 },
            { host: "::1", port: 6042 },
            { host: "myhost", port: 6043 },
        ]);
    });

    test("wss scheme", () => {
        const result = parseMultiAddressUrl("wss://user:pass@host1:6041");
        expect(result.scheme).toBe("wss");
        expect(result.username).toBe("user");
        expect(result.password).toBe("pass");
    });

    test("default port when omitted", () => {
        const result = parseMultiAddressUrl("ws://root:taosdata@myhost");
        expect(result.hosts).toEqual([{ host: "myhost", port: 6041 }]);
    });

    test("default failover params", () => {
        const result = parseMultiAddressUrl("ws://root:taosdata@localhost:6041");
        expect(result.retries).toBe(5);
        expect(result.retryBackoffMs).toBe(200);
        expect(result.retryBackoffMaxMs).toBe(2000);
    });

    test("with pathname", () => {
        const result = parseMultiAddressUrl("ws://root:taosdata@localhost:6041/mydb");
        expect(result.pathname).toBe("/mydb");
    });

    test("with extra query params preserved", () => {
        const result = parseMultiAddressUrl(
            "ws://root:taosdata@localhost:6041?token=abc&retries=3&timezone=UTC"
        );
        expect(result.searchParams.get("token")).toBe("abc");
        expect(result.searchParams.get("timezone")).toBe("UTC");
        expect(result.searchParams.has("retries")).toBe(false);
        expect(result.retries).toBe(3);
    });

    test("empty URL throws", () => {
        expect(() => parseMultiAddressUrl("")).toThrow();
    });

    test("invalid scheme throws", () => {
        expect(() => parseMultiAddressUrl("http://localhost:6041")).toThrow();
    });

    test("no userinfo", () => {
        const result = parseMultiAddressUrl("ws://localhost:6041?token=abc");
        expect(result.username).toBe("");
        expect(result.password).toBe("");
        expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
    });

    test("IPv6 without port uses default", () => {
        const result = parseMultiAddressUrl("ws://root:taosdata@[::1]");
        expect(result.hosts).toEqual([{ host: "::1", port: 6041 }]);
    });
});

describe("buildUrlForHost", () => {
    test("builds correct URL for IPv4 host", () => {
        const parsed = parseMultiAddressUrl(
            "ws://root:taosdata@localhost:6041,localhost:6042/ws?token=abc"
        );
        const url0 = buildUrlForHost(parsed, 0);
        expect(url0.hostname).toBe("localhost");
        expect(url0.port).toBe("6041");
        expect(url0.username).toBe("root");
        expect(url0.password).toBe("taosdata");
        expect(url0.searchParams.get("token")).toBe("abc");

        const url1 = buildUrlForHost(parsed, 1);
        expect(url1.hostname).toBe("localhost");
        expect(url1.port).toBe("6042");
    });

    test("builds correct URL for IPv6 host", () => {
        const parsed = parseMultiAddressUrl("ws://root:taosdata@[::1]:6041");
        const url = buildUrlForHost(parsed, 0);
        expect(url.hostname).toBe("[::1]");
        expect(url.port).toBe("6041");
    });

    test("preserves pathname", () => {
        const parsed = parseMultiAddressUrl("ws://root:taosdata@localhost:6041/mydb");
        const url = buildUrlForHost(parsed, 0);
        expect(url.pathname).toBe("/mydb");
    });
});
