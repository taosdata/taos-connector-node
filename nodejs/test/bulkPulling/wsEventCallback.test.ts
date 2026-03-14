import { OnMessageType, WsEventCallback } from "../../src/client/wsEventCallback";

function resetCallbackRegistry() {
    const CallbackClass = WsEventCallback as any;
    CallbackClass._msgActionRegister = new Map();
}

describe("WsEventCallback lifecycle", () => {
    beforeEach(() => {
        resetCallbackRegistry();
    });

    afterEach(() => {
        resetCallbackRegistry();
        jest.restoreAllMocks();
    });

    test("clears timeout when callback is matched", async () => {
        const callback = WsEventCallback.instance();
        const resolve = jest.fn();
        const reject = jest.fn();
        const clearSpy = jest.spyOn(global, "clearTimeout");

        await callback.registerCallback(
            {
                action: "insert",
                req_id: 11n,
                timeout: 2000,
            },
            resolve,
            reject
        );

        await callback.handleEventCallback(
            {
                action: "insert",
                req_id: 11n,
            },
            OnMessageType.MESSAGE_TYPE_STRING,
            {
                action: "insert",
                req_id: 11n,
                code: 0,
            }
        );

        expect(resolve).toHaveBeenCalledTimes(1);
        expect(reject).not.toHaveBeenCalled();
        expect(clearSpy).toHaveBeenCalled();
        expect((WsEventCallback as any)._msgActionRegister.size).toBe(0);
    });

    test("unregisterCallback removes entry and clears its timeout", async () => {
        const callback = WsEventCallback.instance();
        const resolve = jest.fn();
        const reject = jest.fn();
        const clearSpy = jest.spyOn(global, "clearTimeout");

        await callback.registerCallback(
            {
                action: "options_connection",
                req_id: 22n,
                timeout: 2000,
                id: 22n,
            },
            resolve,
            reject
        );

        await callback.unregisterCallback(22n);

        expect(clearSpy).toHaveBeenCalled();
        expect((WsEventCallback as any)._msgActionRegister.size).toBe(0);
    });
});
