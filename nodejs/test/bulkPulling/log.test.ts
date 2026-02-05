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
        const input = '{"user":"root","password":"taosdata"}';
        const output = redactMessage(input);
        expect(output).toBe('{"user":"root","password":"[REDACTED]"}');
    });

    test("redacts case-insensitive  password field in JSON-like string", () => {
        const input = '{"user":"root","PassWord":"taosdata"}';
        const output = redactMessage(input);
        expect(output).toBe('{"user":"root","PassWord":"[REDACTED]"}');
    });

    test("redacts token in query string", () => {
        const input = "ws://localhost:6041?token=abc123&x=1";
        const output = redactMessage(input);
        expect(output).toBe("ws://localhost:6041?token=[REDACTED]&x=1");
    });

    test("redacts bearer_token in query string", () => {
        const input = "ws://localhost:6041?bearer_token=abc123&x=1";
        const output = redactMessage(input);
        expect(output).toBe("ws://localhost:6041?bearer_token=[REDACTED]&x=1");
    });

    test("redacts password in ws url user:password@", () => {
        const input = "ws://root:taosdata@localhost:6041";
        const output = redactMessage(input);
        expect(output).toBe("ws://root:[REDACTED]@localhost:6041");
    });

    test("redacts password in ws url :password@", () => {
        const input = "ws://:taosdata@localhost:6041";
        const output = redactMessage(input);
        expect(output).toBe("ws://:[REDACTED]@localhost:6041");
    });

    test("does not change url without credentials", () => {
        const input = "ws://localhost:6041";
        const output = redactMessage(input);
        expect(output).toBe(input);
    });

    test("does not change string without sensitive data", () => {
        const input = "normal log message without secrets";
        const output = redactMessage(input);
        expect(output).toBe(input);
    });

    test("returns same primitive for non-object/non-string", () => {
        expect(redactMessage(123)).toBe(123);
        expect(redactMessage(null)).toBeNull();
        expect(redactMessage(undefined)).toBeUndefined();
    });
});
