import { WsClient } from "@src/client/wsClient";
import { TSDB_OPTION_CONNECTION } from "@src/common/constant";
import { WSConfig } from "@src/common/config";
import { WsSql } from "@src/sql/wsSql";

function mockOpenDependencies() {
    jest.spyOn(WsClient.prototype, "connect").mockResolvedValue(undefined);
    jest.spyOn(WsClient.prototype, "checkVersion").mockResolvedValue(undefined);
    jest.spyOn(WsSql.prototype, "exec").mockResolvedValue({} as any);
    jest.spyOn(WsClient.prototype, "close").mockResolvedValue(undefined);
    return jest
        .spyOn(WsClient.prototype, "setOptionConnection")
        .mockResolvedValue(undefined);
}

describe("WsSql.open connection options", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("sets user_app and user_ip when provided", async () => {
        const setOptionConnectionSpy = mockOpenDependencies();
        const config = new WSConfig("ws://root:taosdata@localhost:6041");
        config.setUserApp("myApp");
        config.setUserIp("192.168.1.100");

        const wsSql = await WsSql.open(config);
        await wsSql.close();

        expect(setOptionConnectionSpy).toHaveBeenCalledWith(
            TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_APP,
            "myApp"
        );
        expect(setOptionConnectionSpy).toHaveBeenCalledWith(
            TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_IP,
            "192.168.1.100"
        );
    });

    test("clears user_app and user_ip when not provided", async () => {
        const setOptionConnectionSpy = mockOpenDependencies();
        const config = new WSConfig("ws://root:taosdata@localhost:6041");

        const wsSql = await WsSql.open(config);
        await wsSql.close();

        expect(setOptionConnectionSpy).toHaveBeenCalledWith(
            TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_APP,
            null
        );
        expect(setOptionConnectionSpy).toHaveBeenCalledWith(
            TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_IP,
            null
        );
    });
});
