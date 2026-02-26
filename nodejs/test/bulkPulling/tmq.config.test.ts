import { TmqConfig } from "../../src/tmq/config";
import { TMQConstants } from "../../src/tmq/constant";

describe("TmqConfig - td.connect.token", () => {
    const baseUrl = "ws://localhost:6041";

    test("token field is null when CONNECT_TOKEN not provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_USER, "root"],
            [TMQConstants.CONNECT_PASS, "taosdata"],
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

    test("bearer_token is appended to url search params when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url?.searchParams.get("bearer_token")).toBe("mytoken123");
    });

    test("bearer_token is appended to sql_url search params when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.sql_url?.searchParams.get("bearer_token")).toBe("mytoken123");
    });

    test("sql_url pathname is /ws when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.sql_url?.pathname).toBe("/ws");
    });

    test("url pathname is /rest/tmq when token is provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_TOKEN, "mytoken123"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url?.pathname).toBe("/rest/tmq");
    });

    test("bearer_token not set on urls when token is not provided", () => {
        const configMap = new Map([
            [TMQConstants.WS_URL, baseUrl],
            [TMQConstants.CONNECT_USER, "root"],
            [TMQConstants.CONNECT_PASS, "taosdata"],
            [TMQConstants.GROUP_ID, "g1"],
        ]);
        const cfg = new TmqConfig(configMap);
        expect(cfg.url?.searchParams.has("bearer_token")).toBe(false);
        expect(cfg.sql_url?.searchParams.has("bearer_token")).toBe(false);
    });

    test("CONNECT_TOKEN constant value is td.connect.token", () => {
        expect(TMQConstants.CONNECT_TOKEN).toBe("td.connect.token");
    });
});
