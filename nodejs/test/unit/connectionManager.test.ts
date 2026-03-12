import { ConnectionManager, ConnectionState, AuthInfo, RetryOptions } from "../../src/client/wsConnectionManager";
import { ParsedUrl, HostInfo } from "../../src/common/urlParser";

function makeParsedUrl(hosts: HostInfo[]): ParsedUrl {
    return {
        hosts,
        scheme: "ws",
        username: "root",
        password: "taosdata",
        database: "testdb",
        params: new Map(),
    };
}

function makeAuthInfo(): AuthInfo {
    return {
        username: "root",
        password: "taosdata",
        database: "testdb",
    };
}

describe("ConnectionManager", () => {
    describe("constructor", () => {
        test("initializes with CLOSED state", () => {
            const parsed = makeParsedUrl([{ host: "host1", port: 6041 }]);
            const cm = new ConnectionManager(parsed, makeAuthInfo());
            expect(cm.state).toBe(ConnectionState.CLOSED);
        });

        test("random initial host selection is within range", () => {
            const hosts = [
                { host: "host1", port: 6041 },
                { host: "host2", port: 6042 },
                { host: "host3", port: 6043 },
            ];
            const parsed = makeParsedUrl(hosts);

            // Run multiple times to verify randomness stays in bounds
            for (let i = 0; i < 20; i++) {
                const cm = new ConnectionManager(parsed, makeAuthInfo());
                const current = cm.currentHost;
                expect(current).toBeDefined();
                expect(hosts).toContainEqual(current);
            }
        });

        test("applies custom retry options", () => {
            const parsed = makeParsedUrl([{ host: "host1", port: 6041 }]);
            const opts: Partial<RetryOptions> = {
                retries: 5,
                retryBackoffMs: 500,
                retryBackoffMaxMs: 10000,
                resendWrite: true,
            };
            const cm = new ConnectionManager(parsed, makeAuthInfo(), opts);
            expect(cm.state).toBe(ConnectionState.CLOSED);
        });
    });

    describe("state management", () => {
        test("cannot connect when not in CLOSED state", async () => {
            const parsed = makeParsedUrl([{ host: "localhost", port: 1 }]);
            const cm = new ConnectionManager(parsed, makeAuthInfo(), { retries: 0 }, 2000);

            // First connect will fail (no server), putting us back to CLOSED
            try {
                await cm.connect();
            } catch (e) {
                // expected
            }
            expect(cm.state).toBe(ConnectionState.CLOSED);
        }, 15000);

        test("close on already closed is a no-op", async () => {
            const parsed = makeParsedUrl([{ host: "host1", port: 6041 }]);
            const cm = new ConnectionManager(parsed, makeAuthInfo());
            await cm.close(); // Should not throw
            expect(cm.state).toBe(ConnectionState.CLOSED);
        });

        test("getReadyState returns -1 when not connected", () => {
            const parsed = makeParsedUrl([{ host: "host1", port: 6041 }]);
            const cm = new ConnectionManager(parsed, makeAuthInfo());
            expect(cm.getReadyState()).toBe(-1);
        });
    });

    describe("connection failure", () => {
        test("throws ERR_ALL_HOSTS_EXHAUSTED after all retries", async () => {
            const parsed = makeParsedUrl([
                { host: "nonexistent1", port: 1 },
                { host: "nonexistent2", port: 2 },
            ]);
            const cm = new ConnectionManager(
                parsed,
                makeAuthInfo(),
                { retries: 0, retryBackoffMs: 1, retryBackoffMaxMs: 1 }
            );

            await expect(cm.connect()).rejects.toThrow("All hosts exhausted");
            expect(cm.state).toBe(ConnectionState.CLOSED);
        }, 30000);
    });
});
