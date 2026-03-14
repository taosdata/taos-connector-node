import { parse } from "../../src/common/dsn";
import { RetryConfig } from "../../src/client/retryConfig";

describe("RetryConfig", () => {
    test("uses defaults when retry params are not provided", () => {
        const dsn = parse("ws://root:taosdata@localhost:6041");

        const config = RetryConfig.fromDsn(dsn);

        expect(config.retries).toBe(3);
        expect(config.retryBackoffMs).toBe(100);
        expect(config.retryBackoffMaxMs).toBe(10000);
    });

    test("reads retry params from dsn", () => {
        const dsn = parse(
            "ws://root:taosdata@localhost:6041?retries=5&retry_backoff_ms=200&retry_backoff_max_ms=3200"
        );

        const config = RetryConfig.fromDsn(dsn);

        expect(config.retries).toBe(5);
        expect(config.retryBackoffMs).toBe(200);
        expect(config.retryBackoffMaxMs).toBe(3200);
    });

    test("normalizes invalid params to safe defaults", () => {
        const dsn = parse(
            "ws://root:taosdata@localhost:6041?retries=-1&retry_backoff_ms=abc&retry_backoff_max_ms=0"
        );

        const config = RetryConfig.fromDsn(dsn);

        expect(config.retries).toBe(3);
        expect(config.retryBackoffMs).toBe(100);
        expect(config.retryBackoffMaxMs).toBe(10000);
    });

    test("computes exponential backoff and caps at max", () => {
        const config = new RetryConfig(3, 100, 350);

        expect(config.getBackoffDelay(0)).toBe(100);
        expect(config.getBackoffDelay(1)).toBe(200);
        expect(config.getBackoffDelay(2)).toBe(350);
        expect(config.getBackoffDelay(10)).toBe(350);
    });
});
