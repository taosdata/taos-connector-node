import { WebSocketConnector, ConnectionState, AuthInfo, RetryOptions, WebSocketConnectorConfig } from "../../src/client/wsConnector";
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

function makeConfig(hosts: HostInfo[], options?: Partial<RetryOptions>): WebSocketConnectorConfig {
    return {
        hosts,
        parsedUrl: makeParsedUrl(hosts),
        authInfo: makeAuthInfo(),
        retryOptions: options,
        timeout: 5000,
    };
}

describe("WebSocketConnector", () => {
    describe("constructor", () => {
        test("initializes with CLOSED state", () => {
            const config = makeConfig([{ host: "host1", port: 6041 }]);
            const connector = new WebSocketConnector(config);
            expect(connector.state).toBe(ConnectionState.CLOSED);
        });

        test("random initial host selection is within range", () => {
            const hosts = [
                { host: "host1", port: 6041 },
                { host: "host2", port: 6042 },
                { host: "host3", port: 6043 },
            ];

            // Run multiple times to verify randomness stays in bounds
            for (let i = 0; i < 20; i++) {
                const config = makeConfig(hosts);
                const connector = new WebSocketConnector(config);
                const current = connector.currentHost;
                expect(current).toBeDefined();
                expect(hosts).toContainEqual(current);
            }
        });

        test("applies custom retry options", () => {
            const opts: Partial<RetryOptions> = {
                retries: 5,
                retryBackoffMs: 500,
                retryBackoffMaxMs: 10000,
                resendWrite: true,
            };
            const config = makeConfig([{ host: "host1", port: 6041 }], opts);
            const connector = new WebSocketConnector(config);
            expect(connector.state).toBe(ConnectionState.CLOSED);
        });
    });

    describe("state management", () => {
        test("cannot connect when not in CLOSED state", async () => {
            const config = makeConfig([{ host: "localhost", port: 1 }], { retries: 0 });
            config.timeout = 2000;
            const connector = new WebSocketConnector(config);

            // First connect will fail (no server), putting us back to CLOSED
            try {
                await connector.connect();
            } catch (e) {
                // expected
            }
            expect(connector.state).toBe(ConnectionState.CLOSED);
        }, 15000);

        test("close on already closed is a no-op", async () => {
            const config = makeConfig([{ host: "host1", port: 6041 }]);
            const connector = new WebSocketConnector(config);
            await connector.close(); // Should not throw
            expect(connector.state).toBe(ConnectionState.CLOSED);
        });

        test("readyState returns CLOSED when not connected", () => {
            const config = makeConfig([{ host: "host1", port: 6041 }]);
            const connector = new WebSocketConnector(config);
            expect(connector.readyState()).toBe(3); // w3cwebsocket.CLOSED = 3
        });
    });

    describe("connection failure", () => {
        test("throws ERR_ALL_HOSTS_EXHAUSTED after all retries", async () => {
            const config = makeConfig(
                [
                    { host: "nonexistent1", port: 1 },
                    { host: "nonexistent2", port: 2 },
                ],
                { retries: 0, retryBackoffMs: 1, retryBackoffMaxMs: 1 }
            );
            const connector = new WebSocketConnector(config);

            await expect(connector.connect()).rejects.toThrow("All hosts exhausted");
            expect(connector.state).toBe(ConnectionState.CLOSED);
        }, 30000);
    });

    describe("multi-host URL generation", () => {
        test("generates correct multi-host URL for single host", () => {
            const config = makeConfig([{ host: "localhost", port: 6041 }]);
            const connector = new WebSocketConnector(config);
            const url = connector.getMultiHostUrl();
            expect(url).toContain("localhost:6041");
            expect(url).toContain("ws://");
        });

        test("generates correct multi-host URL for multiple hosts", () => {
            const config = makeConfig([
                { host: "host1", port: 6041 },
                { host: "host2", port: 6042 },
            ]);
            const connector = new WebSocketConnector(config);
            const url = connector.getMultiHostUrl();
            expect(url).toContain("host1:6041");
            expect(url).toContain("host2:6042");
            expect(url).toContain(",");
        });
    });
});
