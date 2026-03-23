import { WsStmt2 } from "../../src/stmt/wsStmt2";
import * as wsProto from "../../src/stmt/wsProto";

const Step = {
    INIT: 0,
    PREPARE: 1,
    BIND: 2,
    EXEC: 3,
    RESULT: 4,
} as const;

function createMockWsClient() {
    return {
        getState: jest.fn(() => 1),
        connect: jest.fn(async () => { }),
        checkVersion: jest.fn(async () => { }),
        exec: jest.fn(async () => ({
            totalTime: 0,
            msg: {
                code: 0,
                message: "",
                timing: 0,
                stmt_id: 1,
                is_insert: false,
                fields_count: 1,
            },
        })),
        execNoResp: jest.fn(async () => { }),
        sendBinaryMsg: jest.fn(async () => ({
            totalTime: 0,
            msg: {
                code: 0,
                message: "",
                timing: 0,
                stmt_id: 1,
                affected: 0,
            },
        })),
        waitForReady: jest.fn(async () => { }),
        isNetworkError: jest.fn((_err: unknown) => false),
    };
}

function createBareStmt() {
    const wsClient = createMockWsClient();
    const stmt = new (WsStmt2 as any)(wsClient);
    stmt._stmt_id = 1n;
    return {
        stmt,
        wsClient,
    };
}

function makeExecReady(stmt: any): void {
    const tableInfo = {
        getParams: () => ({ ok: true }),
    };
    stmt._currentTableInfo = tableInfo;
    stmt._stmtTableInfoList = [tableInfo];
    stmt._toBeBindTagCount = 0;
    stmt._toBeBindColCount = 0;
    stmt._toBeBindTableNameIndex = undefined;
}

describe("WsStmt2 failover", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("prepare caches sql and rebuilds on network error", async () => {
        const { stmt, wsClient } = createBareStmt();
        const networkError = new Error("socket closed");
        wsClient.isNetworkError.mockReturnValue(true);
        jest.spyOn(stmt, "doPrepare").mockRejectedValueOnce(networkError);
        const rebuildSpy = jest
            .spyOn(stmt, "rebuildContext")
            .mockResolvedValue(undefined);

        const sql = "select * from meters where ts > ?";
        await stmt.prepare(sql);

        expect(stmt._savedSql).toBe(sql);
        expect(rebuildSpy).toHaveBeenCalledWith(Step.PREPARE);
    });

    test("exec caches bind bytes and rebuilds on network error", async () => {
        const { stmt, wsClient } = createBareStmt();
        const networkError = new Error("cannot call send() while not connected");
        const bindBytes = new Uint8Array([1, 2, 3]).buffer;
        makeExecReady(stmt);
        stmt._isInsert = false;
        wsClient.isNetworkError.mockReturnValue(true);
        jest.spyOn(wsProto, "stmt2BinaryBlockEncode").mockReturnValue(bindBytes);
        jest.spyOn(stmt, "doSendBindBytes").mockRejectedValueOnce(networkError);
        jest.spyOn(stmt, "rebuildContext").mockResolvedValue(undefined);
        const cleanupSpy = jest.spyOn(stmt, "cleanup");

        await stmt.exec();

        expect(stmt._savedBindBytes).toBe(bindBytes);
        expect(stmt.rebuildContext).toHaveBeenCalledWith(Step.EXEC);
        expect(cleanupSpy).not.toHaveBeenCalled();
    });

    test("exec only cleans up immediately for insert statements", async () => {
        const bindBytes = new Uint8Array([7, 8, 9]).buffer;

        const insertCtx = createBareStmt();
        const insertStmt = insertCtx.stmt;
        makeExecReady(insertStmt);
        insertStmt._isInsert = true;
        jest.spyOn(wsProto, "stmt2BinaryBlockEncode").mockReturnValue(bindBytes);
        jest.spyOn(insertStmt, "doSendBindBytes").mockResolvedValue(undefined);
        jest.spyOn(insertStmt, "doExec").mockResolvedValue(undefined);
        const insertCleanupSpy = jest.spyOn(insertStmt, "cleanup");
        await insertStmt.exec();
        expect(insertCleanupSpy).toHaveBeenCalledTimes(1);

        const queryCtx = createBareStmt();
        const queryStmt = queryCtx.stmt;
        makeExecReady(queryStmt);
        queryStmt._isInsert = false;
        jest.spyOn(wsProto, "stmt2BinaryBlockEncode").mockReturnValue(bindBytes);
        jest.spyOn(queryStmt, "doSendBindBytes").mockResolvedValue(undefined);
        jest.spyOn(queryStmt, "doExec").mockResolvedValue(undefined);
        const queryCleanupSpy = jest.spyOn(queryStmt, "cleanup");
        await queryStmt.exec();
        expect(queryCleanupSpy).not.toHaveBeenCalled();
    });

    test("resultSet rebuilds on network error and cleans up", async () => {
        const { stmt, wsClient } = createBareStmt();
        const networkError = new Error("connection reset");
        const rebuiltRows = { id: "rebuilt" };
        wsClient.isNetworkError.mockReturnValue(true);
        jest.spyOn(stmt, "doResult").mockRejectedValueOnce(networkError);
        const rebuildSpy = jest
            .spyOn(stmt, "rebuildContext")
            .mockResolvedValue(rebuiltRows);
        const cleanupSpy = jest.spyOn(stmt, "cleanup");

        const result = await stmt.resultSet();

        expect(result).toBe(rebuiltRows);
        expect(rebuildSpy).toHaveBeenCalledWith(Step.RESULT);
        expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });

    test("non-network errors are rethrown without rebuild in prepare", async () => {
        const { stmt, wsClient } = createBareStmt();
        const nonNetworkError = new Error("invalid sql");
        wsClient.isNetworkError.mockReturnValue(false);
        jest.spyOn(stmt, "doPrepare").mockRejectedValueOnce(nonNetworkError);
        const rebuildSpy = jest
            .spyOn(stmt, "rebuildContext")
            .mockResolvedValue(undefined);

        await expect(stmt.prepare("bad sql")).rejects.toThrow("invalid sql");
        expect(rebuildSpy).not.toHaveBeenCalled();
    });

    test("non-network errors are rethrown without rebuild in exec", async () => {
        const { stmt, wsClient } = createBareStmt();
        const bindBytes = new Uint8Array([4, 5, 6]).buffer;
        const nonNetworkError = new Error("invalid bind");
        makeExecReady(stmt);
        stmt._isInsert = false;
        wsClient.isNetworkError.mockReturnValue(false);
        jest.spyOn(wsProto, "stmt2BinaryBlockEncode").mockReturnValue(bindBytes);
        jest.spyOn(stmt, "doSendBindBytes").mockRejectedValueOnce(nonNetworkError);
        const rebuildSpy = jest
            .spyOn(stmt, "rebuildContext")
            .mockResolvedValue(undefined);

        await expect(stmt.exec()).rejects.toThrow("invalid bind");
        expect(rebuildSpy).not.toHaveBeenCalled();
    });

    test("non-network errors are rethrown without rebuild in resultSet", async () => {
        const { stmt, wsClient } = createBareStmt();
        const nonNetworkError = new Error("result failed");
        wsClient.isNetworkError.mockReturnValue(false);
        jest.spyOn(stmt, "doResult").mockRejectedValueOnce(nonNetworkError);
        const rebuildSpy = jest
            .spyOn(stmt, "rebuildContext")
            .mockResolvedValue(undefined);

        await expect(stmt.resultSet()).rejects.toThrow("result failed");
        expect(rebuildSpy).not.toHaveBeenCalled();
    });

    test("rebuildContext replays steps in order to EXEC", async () => {
        const { stmt } = createBareStmt();
        const callOrder: string[] = [];
        stmt._savedSql = "insert into t values(?, ?)";
        stmt._savedBindBytes = new Uint8Array([1, 3, 5]).buffer;
        jest.spyOn(stmt, "doInit").mockImplementation(async () => {
            callOrder.push("init");
        });
        jest.spyOn(stmt, "doPrepare").mockImplementation(async () => {
            callOrder.push("prepare");
        });
        jest.spyOn(stmt, "doSendBindBytes").mockImplementation(async () => {
            callOrder.push("bind");
        });
        jest.spyOn(stmt, "doExec").mockImplementation(async () => {
            callOrder.push("exec");
        });
        jest.spyOn(stmt, "doResult").mockImplementation(async () => {
            callOrder.push("result");
            return { rows: 1 };
        });

        await stmt.rebuildContext(Step.EXEC);

        expect(callOrder).toEqual(["init", "prepare", "bind", "exec"]);
    });

    test("rebuildContext can rebuild to RESULT and return rows", async () => {
        const { stmt } = createBareStmt();
        const rows = { data: [1, 2, 3] };
        stmt._savedSql = "select * from t where ts > ?";
        stmt._savedBindBytes = new Uint8Array([8, 8, 8]).buffer;
        jest.spyOn(stmt, "doInit").mockResolvedValue(undefined);
        jest.spyOn(stmt, "doPrepare").mockResolvedValue(undefined);
        jest.spyOn(stmt, "doSendBindBytes").mockResolvedValue(undefined);
        jest.spyOn(stmt, "doExec").mockResolvedValue(undefined);
        jest.spyOn(stmt, "doResult").mockResolvedValue(rows);

        const result = await stmt.rebuildContext(Step.RESULT);

        expect(result).toBe(rows);
    });

    test("rebuildContext retries when rebuild gets another network error", async () => {
        const { stmt, wsClient } = createBareStmt();
        const networkError = new Error("connection reset");
        stmt._savedSql = "select * from t";
        stmt._savedBindBytes = new Uint8Array([2, 4, 6]).buffer;
        wsClient.isNetworkError.mockImplementation(
            (err: unknown) => err === networkError
        );
        const initSpy = jest
            .spyOn(stmt, "doInit")
            .mockRejectedValueOnce(networkError)
            .mockResolvedValue(undefined);
        const prepareSpy = jest.spyOn(stmt, "doPrepare").mockResolvedValue(undefined);

        await stmt.rebuildContext(Step.PREPARE);

        expect(initSpy).toHaveBeenCalledTimes(2);
        expect(prepareSpy).toHaveBeenCalledTimes(1);
        expect(wsClient.waitForReady).toHaveBeenCalledTimes(2);
    });

    test("rebuildContext throws on non-network error", async () => {
        const { stmt, wsClient } = createBareStmt();
        const nonNetworkError = new Error("permission denied");
        stmt._savedSql = "select * from t";
        stmt._savedBindBytes = new Uint8Array([9, 9, 9]).buffer;
        wsClient.isNetworkError.mockReturnValue(false);
        jest.spyOn(stmt, "doInit").mockRejectedValueOnce(nonNetworkError);

        await expect(stmt.rebuildContext(Step.INIT)).rejects.toThrow(
            "permission denied"
        );
    });
});
