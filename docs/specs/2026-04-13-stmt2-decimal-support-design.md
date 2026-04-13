# Stmt2 支持 Decimal 类型写入 — 设计文档

## 背景

参考 [stmt2-support-decimal-write-fs.md](../fs/stmt2-support-decimal-write-fs.md)。

TDengine 的 DECIMAL 类型以 int64 / int128 存储，使用 scale 确定小数点位置。当前 Node.js 连接器的 stmt2 绑定路径不支持 DECIMAL 类型。需要新增 `setDecimal(params: any[])` 方法，以变长字符串形式绑定 decimal 数据，由服务端自动转换为对应精度的 decimal 值。

## 核心设计

### API：统一的 `setDecimal(params: any[])` 方法

提供单一方法 `setDecimal(params: any[])`，接受字符串数组（如 `["1234.5678", "-0.001", "1.23e+5"]`）。

**类型分两阶段确定：**

1. **`setDecimal` 阶段**：始终使用 `TDengineTypeCode.DECIMAL`（128-bit）作为默认类型存入 `FieldBindParams`。
2. **`bind()` 阶段**：在 `WsStmt2.bind()` 的全绑定路径中，根据 `this.fields[j].field_type` 将 DECIMAL 覆写为实际的 DECIMAL64 (21) 或 DECIMAL (17)。

**注意：stmt2 bind 仅支持全绑定模式**（`paramsArray.getBindCount() == this.fields.length`）。在全绑定路径中，索引 `j` 一一对应 `this.fields[j]` 和 `paramsArray._fieldParams[j]`，类型覆写直接且可靠。

**各场景行为：**

- **Insert 模式**：`bind()` 全绑定路径中通过 `this.fields[j].field_type` 覆写 columnType。
- **Query 模式**：服务端不返回 fields，无法覆写。保持默认 `TDengineTypeCode.DECIMAL`，由服务端根据实际列类型转换。

### Stmt1 不支持

`setDecimal` 在基类 `StmtBindParams` 中定义为抛出不支持异常。仅 `Stmt2BindParams` 覆写为有效实现。`Stmt1BindParams` 继承基类的默认抛错行为。

### 编码方式：变长字符串绑定

FS 文档明确要求："参数绑定请用变长字符串形式的数据进行绑定"。

DECIMAL 值在 stmt2 二进制协议中以 UTF-8 字符串编码（与 VARCHAR 编码路径相同），但 ColumnInfo.type 设置为实际的 DECIMAL64 (21) 或 DECIMAL (17) 类型码。服务端接收字符串后自动转换为 int64 / int128 内部存储格式。

### 数据流

```
用户调用 setDecimal(["1234.56", "-0.001"])
  │
  ▼
addParams(params, "DECIMAL", 0, TDengineTypeCode.DECIMAL)
  → 存入 FieldBindParams { columnType: DECIMAL }
  │
  ▼ stmt.bind(bindParams)  — 全绑定模式
WsStmt2.bind() 根据 this.fields[j].field_type 覆写 decimal 类型：
  ├── Insert 模式：this.fields[j].field_type → 覆写 columnType 为 DECIMAL64 或 DECIMAL
  └── Query 模式：无 fields，保持 DECIMAL
  │
  ▼ encode()
检测 columnType == DECIMAL || DECIMAL64 → 路由到 encodeVarColumns()
  │
  ▼
encodeVarColumns 将字符串编码为 UTF-8 字节，生成 ColumnInfo {
  type: DECIMAL64 或 DECIMAL (已覆写),
  data: UTF-8 encoded string bytes,
  _haveLength: 1,  // 变长格式，包含每行长度
}
  │
  ▼
stmt2BinaryBlockEncode 打包到二进制协议帧 → 发送到服务端
```

## 变更文件

### 1. `src/common/constant.ts`

补充 DECIMAL 类型常量：

```typescript
// TDengineTypeName 新增
17: "DECIMAL",
21: "DECIMAL64",

// TDengineTypeLength 新增（内部存储尺寸，用于读取路径一致性）
[TDengineTypeCode.DECIMAL]: 16,
[TDengineTypeCode.DECIMAL64]: 8,
```

### 2. `src/stmt/wsParamsBase.ts`

在 `StmtBindParams` 基类中新增 `setDecimal` 方法（默认抛错，仅 stmt2 覆写）：

```typescript
setDecimal(params: any[]) {
    throw new TaosError(
        ErrorCode.ERR_UNSUPPORTED_TDENGINE_TYPE,
        "setDecimal is not supported in stmt1, please use stmt2 instead!"
    );
}
```

Stmt1BindParams 继承此默认行为，直接报错。

### 3. `src/stmt/wsParams2.ts`（Stmt2BindParams）

**覆写 `setDecimal`**：始终使用 DECIMAL 作为默认类型。

```typescript
setDecimal(params: any[]) {
    if (!params || params.length == 0) {
        throw new TaosError(
            ErrorCode.ERR_INVALID_PARAMS,
            "SetDecimalColumn params is invalid!"
        );
    }
    this.addParams(params, "DECIMAL", 0, TDengineTypeCode.DECIMAL);
}
```

**`encode()` 方法**：在 `_isVarType` 检查之前，增加 DECIMAL 类型路由。

```typescript
if (fieldParam.columnType === TDengineTypeCode.DECIMAL ||
    fieldParam.columnType === TDengineTypeCode.DECIMAL64) {
    this._params.push(
        this.encodeVarColumns(
            fieldParam.params, fieldParam.dataType,
            fieldParam.typeLen, fieldParam.columnType
        )
    );
}
```

### 4. `src/stmt/wsStmt2.ts`（WsStmt2）

**在 `bind()` 全绑定路径中覆写 decimal 类型**：

```typescript
// Insert 全绑定路径（paramsArray.getBindCount() == this.fields.length）
// 在处理每个 fieldParam 时：
if (fieldParam.columnType === TDengineTypeCode.DECIMAL &&
    this.fields[j].field_type !== undefined) {
    fieldParam.columnType = this.fields[j].field_type;
}
```

索引 `j` 同时对应 `this.fields[j]` 和 `paramsArray._fieldParams[j]`，映射关系直接可靠。

### 5. `test/stmt/stmt2.decimal.test.ts`（新文件）

集成测试覆盖：

- **DECIMAL64 + DECIMAL 混合写入**：创建含两种 decimal 列的 stable，通过 stmt2 绑定字符串值并写入，查询验证。
- **NULL 值**：decimal 列绑定 null。
- **负数和科学计数法**：如 `"-1234.5678"`, `"1.23e+5"`。
- **多行绑定**：一次绑定多行 decimal 数据。
- **Decimal 查询绑定**：通过 stmt2 prepare + bind 查询含 decimal 条件的数据，验证结果。

测试用例模式参考 `test/sql/decimal.test.ts` 和 `test/stmt/stmt2.type.test.ts`。

## 约束和限制

1. DECIMAL 类型**仅支持普通列**，暂不支持 tag 列。
2. 参数绑定**仅支持字符串**格式，不支持 number / BigInt。
3. 小数点前数据溢出 → 服务端报错 `TSDB_CODE_DECIMAL_OVERFLOW`。
4. 小数点后数据溢出 → 服务端四舍五入（注意：四舍五入可导致进位溢出）。
5. Query 模式下默认使用 DECIMAL (128-bit) 类型码，依赖服务端根据实际列类型转换。

## 不变更的部分

- **读取/解码路径**：`taosResult.ts` 中的 DECIMAL / DECIMAL64 解码逻辑已完整实现，无需修改。
- **TMQ 消费路径**：`tmqResponse.ts` 中的 decimal 解码已实现。
- **Stmt1 路径**：本次仅涉及 stmt2，stmt1 不变更。
- **`_isVarType()` 函数**：不修改，DECIMAL 在读取路径中仍作为 SOLID 类型处理。
