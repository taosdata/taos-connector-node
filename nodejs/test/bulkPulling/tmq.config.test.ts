import { TmqConfig } from "../../src/tmq/config";
import { TMQConstants } from "../../src/tmq/constant";
import { testPassword, testUsername } from "../utils";

describe("TmqConfig - td.connect.token", () => {
    const baseUrl = "ws://localhost:6041";

    test("token field is null when CONNECT_TOKEN not provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_USER, testUsername()],
            [TMQConstants.CONNECT_PASS, testPassword()],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.token).toBeNull();
    });

    test("token field is set when CONNECT_TOKEN is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.token).toBe("mytoken123");
    });

    test("bearer_token is appended to url when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url).toContain("bearer_token=mytoken123");
    });

    test("bearer_token is appended to sql_url when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.sql_url).toContain("bearer_token=mytoken123");
    });

    test("sql_url contains /ws path when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.sql_url).toContain("/ws");
    });

    test("url contains /rest/tmq path when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url).toContain("/rest/tmq");
    });

    test("bearer_token not set on urls when token is not provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_USER, testUsername()],
            [TMQConstants.CONNECT_PASS, testPassword()],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url).not.toContain("bearer_token");
        expect(cfg.sql_url).not.toContain("bearer_token");
    });

    test("CONNECT_TOKEN constant value is td.connect.token", () => {
        expect(TMQConstants.CONNECT_TOKEN).toBe("td.connect.token");
    });
});
