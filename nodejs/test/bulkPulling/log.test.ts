import logger, { setLevel, redactMessage } from "../../src/common/log";

describe("log level print", () => {
    test("normal connect", async () => {
        logger.info("log level is info");
        logger.debug("log level is debug");
        logger.error("log level is error");

        let isLevel = logger.isLevelEnabled("info");
        expect(isLevel).toEqual(true);

        setLevel("debug");
        logger.debug("log level is debug");
        isLevel = logger.isLevelEnabled("debug");
        expect(isLevel).toEqual(true);

        setLevel("error");
        logger.error("log level is error");
        logger.debug("log level is debug");
        isLevel = logger.isLevelEnabled("error");
        expect(isLevel).toEqual(true);
    });
});

describe("redact message", () => {
    test("redacts password field in JSON-like string", () => {
        const input = '{"password": "secret123"}';
        const output = redactMessage(input);
        expect(output).toBe('{"password": "[REDACTED]"}');
    });

    test("redacts token in query string", () => {
        const input = "https://example.com?token=abcdef123456&other=1";
        const output = redactMessage(input);
        expect(output).toBe(
            "https://example.com?token=[REDACTED]&other=1"
        );
    });

    test("redacts bearer token in query string", () => {
        const input = "https://example.com?bearer_token=abcdef123456&other=1";
        const output = redactMessage(input);
        expect(output).toBe(
            "https://example.com?bearer_token=[REDACTED]&other=1"
        );
    });

    test("is case-insensitive for password key", () => {
        const input = '{"PassWord": "secret123"}';
        const output = redactMessage(input);
        expect(output).toBe('{"PassWord": "[REDACTED]"}');
    });

    test("leaves string without sensitive data unchanged", () => {
        const input = "normal message without secrets";
        const output = redactMessage(input);
        expect(output).toBe(input);
    });

    test("redacts password and token fields on plain object", () => {
        const input = {
            user: "u1",
            password: "secret",
            token: "abc123",
            bearer_token: "def456",
            other: "keep",
        };
        const output = redactMessage(input) as any;

        expect(output.user).toBe("u1");
        expect(output.password).toBe("[REDACTED]");
        expect(output.token).toBe("[REDACTED]");
        expect(output.bearer_token).toBe("[REDACTED]");
        expect(output.other).toBe("keep");
    });

    test("redacts nested objects recursively", () => {
        const input = {
            level1: {
                password: "p1",
                nested: {
                    token: "t1",
                    value: 42,
                },
            },
        };
        const output = redactMessage(input) as any;

        expect(output.level1.password).toBe("[REDACTED]");
        expect(output.level1.nested.token).toBe("[REDACTED]");
        expect(output.level1.nested.value).toBe(42);
    });

    test("redacts objects inside array", () => {
        const input = [
            { password: "p1" },
            { token: "t2", ok: true },
        ];
        const output = redactMessage(input) as any[];

        expect(output[0].password).toBe("[REDACTED]");
        expect(output[1].token).toBe("[REDACTED]");
        expect(output[1].ok).toBe(true);
    });

    test("returns same primitive for non-object/non-string", () => {
        expect(redactMessage(123)).toBe(123);
        expect(redactMessage(null)).toBeNull();
        expect(redactMessage(undefined)).toBeUndefined();
    });

    test("redacts password in ws url user:password@", () => {
        const input = "ws://root:taosdata@localhost:6041/ws";
        const output = redactMessage(input);
        expect(output).toBe("ws://root:[REDACTED]@localhost:6041/ws");
    });

    test("does not change url without credentials", () => {
        const input = "ws://localhost:6041/ws";
        const output = redactMessage(input);
        expect(output).toBe(input);
    });
});
