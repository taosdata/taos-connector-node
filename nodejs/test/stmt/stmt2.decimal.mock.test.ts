import { FieldBindType, TDengineTypeCode } from "@src/common/constant";
import { StmtFieldInfo } from "@src/stmt/wsProto";
import { Stmt1BindParams } from "@src/stmt/wsParams1";
import { Stmt2BindParams } from "@src/stmt/wsParams2";
import { WsStmt2 } from "@src/stmt/wsStmt2";

function createMockWsClient() {
    return {
        getState: jest.fn(() => 1),
        connect: jest.fn(async () => { }),
        checkVersion: jest.fn(async () => { }),
        exec: jest.fn(async () => ({ totalTime: 0, msg: { code: 0, message: "", timing: 0, stmt_id: 1 } })),
        execNoResp: jest.fn(async () => { }),
        sendBinaryMsg: jest.fn(async () => ({ totalTime: 0, msg: { code: 0, message: "", timing: 0, stmt_id: 1 } })),
        waitForReady: jest.fn(async () => { }),
        isNetworkError: jest.fn((_err: unknown) => false),
        getReconnectRetries: jest.fn(() => 5),
    };
}

function createInsertFields(): StmtFieldInfo[] {
    return [
        {
            name: "tbname",
            field_type: TDengineTypeCode.VARCHAR,
            precision: 0,
            scale: 0,
            bytes: 0,
            bind_type: FieldBindType.TAOS_FIELD_TBNAME,
        },
        {
            name: "location",
            field_type: TDengineTypeCode.VARCHAR,
            precision: 0,
            scale: 0,
            bytes: 0,
            bind_type: FieldBindType.TAOS_FIELD_TAG,
        },
        {
            name: "gid",
            field_type: TDengineTypeCode.INT,
            precision: 0,
            scale: 0,
            bytes: 0,
            bind_type: FieldBindType.TAOS_FIELD_TAG,
        },
        {
            name: "d64",
            field_type: TDengineTypeCode.DECIMAL64,
            precision: 0,
            scale: 0,
            bytes: 0,
            bind_type: FieldBindType.TAOS_FIELD_COL,
        },
        {
            name: "v",
            field_type: TDengineTypeCode.INT,
            precision: 0,
            scale: 0,
            bytes: 0,
            bind_type: FieldBindType.TAOS_FIELD_COL,
        },
    ];
}

function createBareStmt(fields: StmtFieldInfo[], isInsert: boolean = true) {
    const stmt = new (WsStmt2 as any)(createMockWsClient());
    stmt._stmt_id = 1n;
    stmt.fields = fields;
    stmt._isInsert = isInsert;
    stmt._toBeBindTableNameIndex = 0;
    stmt._toBeBindTagCount = fields.filter(
        (f) => f.bind_type === FieldBindType.TAOS_FIELD_TAG
    ).length;
    stmt._toBeBindColCount = fields.filter(
        (f) => f.bind_type === FieldBindType.TAOS_FIELD_COL
    ).length;
    return stmt;
}

describe("Stmt2 decimal bind behavior (mock)", () => {
    test("stmt1 setDecimal should throw unsupported error", () => {
        const params = new Stmt1BindParams();
        expect(() => {
            params.setDecimal(["1.2300"]);
        }).toThrow("setDecimal is not supported in stmt1, please use stmt2 instead!");
    });

    test("stmt2 setDecimal should reject non-string values", () => {
        const params = new Stmt2BindParams();
        expect(() => {
            params.setDecimal([]);
        }).toThrow("SetDecimalColumn params is invalid!");

        expect(() => {
            params.setDecimal([123]);
        }).toThrow("SetDecimalColumn params is invalid!");
    });

    test("stmt2 setDecimal should be encoded as variable-length data", () => {
        const params = new Stmt2BindParams();
        params.setDecimal(["1.2300", null, "-0.0001"]);
        params.encode();
        const cols = params.getParams();
        expect(cols.length).toBe(1);
        expect(cols[0].type).toBe(TDengineTypeCode.DECIMAL);
        expect(cols[0]._haveLength).toBe(1);
        expect(cols[0]._rows).toBe(3);
    });

    test("bind should override DECIMAL to real column decimal type in full-binding insert", async () => {
        const fields = createInsertFields();
        const stmt = createBareStmt(fields, true);
        const params = new Stmt2BindParams(fields.length, 13, fields);

        params.setVarchar(["d0"]);
        params.setVarchar(["beijing"]);
        params.setInt([1]);
        params.setDecimal(["123.456700"]);
        params.setInt([10]);

        await stmt.bind(params);

        const tableInfo = stmt._stmtTableInfo.get("d0");
        const colParams = tableInfo?.getParams();
        expect(colParams?._fieldParams?.length).toBe(2);
        expect(colParams?._fieldParams?.[0].columnType).toBe(
            TDengineTypeCode.DECIMAL64
        );
    });

    test("bind should override DECIMAL to real column decimal type in non-full-binding insert", async () => {
        const fields = createInsertFields();
        const stmt = createBareStmt(fields, true);
        const params = new Stmt2BindParams();

        params.setDecimal(["-0.000001"]);
        params.setInt([11]);

        await stmt.bind(params);

        const bindParams = stmt._currentTableInfo.getParams();
        expect(bindParams?._fieldParams?.[0].columnType).toBe(
            TDengineTypeCode.DECIMAL64
        );
        expect(bindParams?._fieldParams?.[1].columnType).toBe(
            TDengineTypeCode.INT
        );
    });

    test("query mode should keep DECIMAL default type", async () => {
        const fields = createInsertFields();
        const stmt = createBareStmt(fields, false);
        const params = new Stmt2BindParams();
        params.setDecimal(["99.0001"]);

        await stmt.bind(params);

        const bindParams = stmt._currentTableInfo.getParams();
        expect(bindParams?._fieldParams?.[0].columnType).toBe(
            TDengineTypeCode.DECIMAL
        );
    });
});
