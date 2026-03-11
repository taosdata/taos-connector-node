import {
    parseMultiHostUrl,
    buildHostUrl,
    extractRetryOptions,
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
            expect(result.params.size).toBe(0);
        });

        test("single host with database", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041/power");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("power");
            expect(result.params.size).toBe(0);
        });

        test("multiple hosts", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041,host2:6042,host3:6043/mydb"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(3);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
            expect(result.hosts[2]).toEqual({ host: "host3", port: 6043 });
            expect(result.database).toBe("mydb");
            expect(result.params.size).toBe(0);
        });

        test("IPv6 address in brackets", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@[::1]:6041,host2:6042/db"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "[::1]", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
            expect(result.database).toBe("db");
            expect(result.params.size).toBe(0);
        });

        test("multiple IPv6 addresses", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@[::1]:6041,[fe80::1]:6042"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "[::1]", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "[fe80::1]", port: 6042 });
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("wss scheme", () => {
            const result = parseMultiHostUrl("wss://root:taosdata@localhost:6041");
            expect(result.scheme).toBe("wss");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("query parameters", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041/db?retries=5&retry_backoff_ms=300&timezone=UTC"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "host1", port: 6041 }]);
            expect(result.database).toBe("db");
            expect(result.params.get("retries")).toBe("5");
            expect(result.params.get("retry_backoff_ms")).toBe("300");
            expect(result.params.get("timezone")).toBe("UTC");
        });

        test("deduplicates hosts", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@host1:6041,host2:6042,host1:6041"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(2);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("no user info", () => {
            const result = parseMultiHostUrl("ws://host1:6041?token=mytoken");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("");
            expect(result.password).toBe("");
            expect(result.hosts).toEqual([{ host: "host1", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.get("token")).toBe("mytoken");
        });

        test("username only (no password)", () => {
            const result = parseMultiHostUrl("ws://root@host1:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("");
            expect(result.hosts).toEqual([{ host: "host1", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("host without port uses default 6041", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@myhost");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "myhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("complex URL with all features", () => {
            const result = parseMultiHostUrl(
                "ws://user:p%40ss@host1:6041,host2:6042,[::1]:6043/testdb?retries=5&retry_backoff_ms=100&retry_backoff_max_ms=5000&resend_write=true&token=abc"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("user");
            expect(result.password).toBe("p%40ss");
            expect(result.hosts).toHaveLength(3);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6042 });
            expect(result.hosts[2]).toEqual({ host: "[::1]", port: 6043 });
            expect(result.database).toBe("testdb");
            expect(result.params.get("retries")).toBe("5");
            expect(result.params.get("retry_backoff_ms")).toBe("100");
            expect(result.params.get("retry_backoff_max_ms")).toBe("5000");
            expect(result.params.get("resend_write")).toBe("true");
            expect(result.params.get("token")).toBe("abc");
        });

        // Additional normal test cases
        test("empty password with colon", () => {
            const result = parseMultiHostUrl("ws://root:@localhost:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("database with special characters", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041/test_db-123");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("test_db-123");
            expect(result.params.size).toBe(0);
        });

        test("empty database path with slash", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041/");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("multiple hosts without ports use default", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@host1,host2,host3");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(3);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6041 });
            expect(result.hosts[2]).toEqual({ host: "host3", port: 6041 });
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("IPv6 without port uses default", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@[::1]");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "[::1]", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("scheme is case insensitive", () => {
            const result = parseMultiHostUrl("WS://root:taosdata@localhost:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("WSS scheme is case insensitive", () => {
            const result = parseMultiHostUrl("WSS://root:taosdata@localhost:6041");
            expect(result.scheme).toBe("wss");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("single query parameter", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041?token=abc123");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(1);
            expect(result.params.get("token")).toBe("abc123");
        });

        test("database with query parameters", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:6041/mydb?timezone=UTC");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("mydb");
            expect(result.params.get("timezone")).toBe("UTC");
        });

        test("full IPv6 address (not abbreviated)", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "[2001:0db8:85a3:0000:0000:8a2e:0370:7334]", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("full IPv6 address without port uses default", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@[2001:0db8:85a3:0000:0000:8a2e:0370:7334]:");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "[2001:0db8:85a3:0000:0000:8a2e:0370:7334]", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("no username only password", () => {
            const result = parseMultiHostUrl("ws://:pass@localhost:6041");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("");
            expect(result.password).toBe("pass");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("no username only password with database", () => {
            const result = parseMultiHostUrl("ws://:taosdata@localhost:6041/mydb");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("mydb");
            expect(result.params.size).toBe(0);
        });

        test("empty port uses default 6041", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@host1:");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "host1", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("IPv4 with empty port uses default 6041", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@127.0.1.0:");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "127.0.1.0", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("multiple hosts with empty ports use default", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@host1:,host2:,127.0.0.1:");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(3);
            expect(result.hosts[0]).toEqual({ host: "host1", port: 6041 });
            expect(result.hosts[1]).toEqual({ host: "host2", port: 6041 });
            expect(result.hosts[2]).toEqual({ host: "127.0.0.1", port: 6041 });
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        // Boundary test cases
        test("port boundary - minimum valid port 1", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:1");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 1 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("port boundary - maximum valid port 65535", () => {
            const result = parseMultiHostUrl("ws://root:taosdata@localhost:65535");
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 65535 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("very long username", () => {
            const longUsername = "a".repeat(100);
            const result = parseMultiHostUrl(`ws://${longUsername}:pass@localhost:6041`);
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe(longUsername);
            expect(result.password).toBe("pass");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("very long password", () => {
            const longPassword = "p".repeat(100);
            const result = parseMultiHostUrl(`ws://user:${longPassword}@localhost:6041`);
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("user");
            expect(result.password).toBe(longPassword);
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("many hosts", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@h1:6041,h2:6042,h3:6043,h4:6044,h5:6045,h6:6046,h7:6047,h8:6048"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toHaveLength(8);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(0);
        });

        test("many query parameters", () => {
            const result = parseMultiHostUrl(
                "ws://root:taosdata@localhost:6041?p1=v1&p2=v2&p3=v3&p4=v4&p5=v5"
            );
            expect(result.scheme).toBe("ws");
            expect(result.username).toBe("root");
            expect(result.password).toBe("taosdata");
            expect(result.hosts).toEqual([{ host: "localhost", port: 6041 }]);
            expect(result.database).toBe("");
            expect(result.params.size).toBe(5);
            expect(result.params.get("p1")).toBe("v1");
            expect(result.params.get("p5")).toBe("v5");
        });

        // Exception test cases
        test("empty URL throws", () => {
            expect(() => parseMultiHostUrl("")).toThrow("URL must not be empty");
        });

        test("whitespace only URL throws", () => {
            expect(() => parseMultiHostUrl("   ")).toThrow("URL must not be empty");
        });

        test("invalid scheme throws", () => {
            expect(() => parseMultiHostUrl("http://host:6041")).toThrow("Invalid URL scheme");
        });

        test("missing scheme throws", () => {
            expect(() => parseMultiHostUrl("root:taosdata@host:6041")).toThrow("Invalid URL scheme");
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

        test("port zero throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:0")
            ).toThrow("Invalid port");
        });

        test("negative port throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:-1")
            ).toThrow("Invalid port");
        });

        test("port with spaces throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:60 41")
            ).toThrow("Invalid port");
        });

        test("IPv6 with unclosed bracket in middle of host list throws", () => {
            expect(() =>
                parseMultiHostUrl("ws://root:taosdata@host1:6041,[::1:6042,host2:6043")
            ).toThrow("Unclosed bracket");
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
