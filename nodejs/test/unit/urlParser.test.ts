import {
    parseMultiHostUrl,
    buildHostUrl,
    extractRetryOptions,
    HostInfo,
    ParsedUrl,
} from "../../src/common/urlParser";

describe("urlParser", () => {
    describe("parseMultiHostUrl", () => {
        test("single host with port", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
        });

        test("single host with database", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041/power");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("power");
        });

        test("multiple hosts", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041,host2:6042,host3:6043/mydb"
            );
            expect(result.hosts).toHaveLength(3);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
            expect(result.hosts[2]).toEqual({ host: "host3", port: 6043 });
            expect(result.database).toBe("mydb");
        });

        test("IPv6 address in brackets", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@[::1]:6041,host2:6042/db"
            );
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "[::1]", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
        });

        test("multiple IPv6 addresses", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@[::1]:6041,[fe80::1]:6042"
            );
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "[::1]", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "[fe80::1]", port: 6042 });
        });

        test("wss scheme", () => {
            const result = parseMultiHostUrl("wss://root:taosdata@localhost:6041");
            expect(result.scheme).toBe("wss");
        });

        test("query parameters", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041/db?retries=5&retry_backoff_ms=300&timezone=UTC"
            );
            expect(result.params.get("retries")).toBe("5");
            expect(result.params.get("retry_backoff_ms")).toBe("300");
            expect(result.params.get("timezone")).toBe("UTC");
        });

        test("deduplicates hosts", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041,host2:6042,host1:6041"
            );
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
        });

        test("no user info", () => {
            const result = parseMultiHostUrl("ws://host1:6041?token=mytoken");
            expect(result.username).toBe("");
            expect(result.password).toBe("");
            expect(result.hosts).toEqual([{ host: "host1", port: 6041 }]);
            expect(result.params.get("token")).toBe("mytoken");
        });

        test("username only (no password)", () => {
            const result = parseMultiHostUrl("ws://root@host1:6041");
            expect(result.username).toBe("root");
            expect(result.password).toBe("");
        });

        test("empty URL throws", () => {
            expect(() => parseMultiHostUrl("")).toThrow("URL must not be empty");
        });

        test("invalid scheme throws", () => {
            expect(() => parseMultiHostUrl("http://host:6041")).toThrow("Invalid URL scheme");
        });

        test("unclosed IPv6 bracket throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@[::1:6041")
            ).toThrow("Unclosed bracket");
        });

        test("invalid port throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:abc")
            ).toThrow("Invalid port");
        });

        test("port out of range throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:70000")
            ).toThrow("Invalid port");
        });

        test("host without port uses default 6041", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@myhost");
            expect(result.hosts).toEqual([{ host: "myhost", port: 6041 }]);
        });

        test("complex URL with all features", () => {
            const result = parseMultiHostUrl(
                "ws://user:p%40ss@host1:6041,host2:6042,[::1]:6043/testdb?retries=5&retry_backoff_ms=100&retry_backoff_max_ms=5000&resend_write=true&token=abc"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("user");
            expect(result.password).toBe("p%40ss");
            expect(result.hosts).toHaveLength(3);
            expect(result.database).toBe("testdb");
            expect(result.params.get("retries")).toBe("5");
            expect(result.params.get("token")).toBe("abc");
        });
    });

    describe("buildHostUrl", () => {
        test("builds single host URL with /ws path", () => {
            const parsed: ParsedUrl = {
                hosts: [{ host: "host1", port: 6041 }],
                scheme: "ws",
                username: "root",
                password: "taosdata",
                database: "mydb",
                params: new Map([["timezone", "UTC"]]),
            };
            const url = buildHostUrl(parsed, parsed.hosts[0]);
            expect(url.origin).toBe("ws://host1:6041");
            expect(url.pathname).toBe("/ws");
            expect(url.username).toBe("root");
            expect(url.password).toBe("taosdata");
            expect(url.searchParams.get("timezone")).toBe("UTC");
        });

        test("excludes retry params from URL", () => {
            const parsed: ParsedUrl = {
                hosts: [{ host: "host1", port: 6041 }],
                scheme: "ws",
                username: "root",
                password: "taosdata",
                database: "",
                params: new Map([
                    ["retries", "5"],
                    ["retry_backoff_ms", "200"],
                    ["timezone", "UTC"],
                ]),
            };
            const url = buildHostUrl(parsed, parsed.hosts[0]);
            expect(url.searchParams.has("retries")).toBe(false);
            expect(url.searchParams.has("retry_backoff_ms")).toBe(false);
            expect(url.searchParams.get("timezone")).toBe("UTC");
        });

        test("adds extra params", () => {
            const parsed: ParsedUrl = {
                hosts: [{ host: "host1", port: 6041 }],
                scheme: "wss",
                username: "",
                password: "",
                database: "",
                params: new Map(),
            };
            const extras = new Map([["token", "abc123"]]);
            const url = buildHostUrl(parsed, parsed.hosts[0], extras);
            expect(url.searchParams.get("token")).toBe("abc123");
            expect(url.protocol).toBe("wss:");
        });
    });

    describe("extractRetryOptions", () => {
        test("extracts all retry params", () => {
            const params = new Map([
                ["retries", "5"],
                ["retry_backoff_ms", "300"],
                ["retry_backoff_max_ms", "5000"],
                ["resend_write", "true"],
            ]);
            const opts = extractRetryOptions(params);
            expect(opts.retries).toBe(5);
            expect(opts.retryBackoffMs).toBe(300);
            expect(opts.retryBackoffMaxMs).toBe(5000);
            expect(opts.resendWrite).toBe(true);
        });

        test("returns empty object for no params", () => {
            const opts = extractRetryOptions(new Map());
            expect(opts.retries).toBeUndefined();
            expect(opts.retryBackoffMs).toBeUndefined();
        });

        test("resend_write false values", () => {
            expect(
                extractRetryOptions(new Map([["resend_write", "false"]])).resendWrite
            ).toBe(false);
            expect(
                extractRetryOptions(new Map([["resend_write", "0"]])).resendWrite
            ).toBe(false);
        });
    });
});
