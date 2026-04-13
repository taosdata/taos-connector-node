# Stmt2 支持 Decimal 类型写入 — 设计文档

## 背景

参考 [stmt2-support-decimal-write-fs.md](../fs/stmt2-support-decimal-write-fs.md)。

TDengine 的 DECIMAL 类型以 int64 / int128 存储，使用 scale 确定小数点位置。当前 Node.js 连接器的 stmt2 绑定路径不支持 DECIMAL 类型。需要新增 `setDecimal(params: any[])` 方法，以变长字符串形式绑定 decimal 数据，由服务端自动转换为对应精度的 decimal 值。

## 核心设计

### API：统一的 `setDecimal(params: any[])` 方法

提供单一方法 `setDecimal(params: any[])`，接受字符串数组（如 `["1234.5678", "-0.001", "1.23e+5"]`）。类型自动推断逻辑：

- **Insert 模式**：`Stmt2BindParams` 持有 `_fields`（来自 `stmt2_prepare` 响应），从中提取 DECIMAL / DECIMAL64 字段类型，构建一个有序队列。每次调用 `setDecimal()` 从队列中消费一个类型。
- **Query 模式**：服务端不返回 fields 信息，无法自动推断。默认使用 `TDengineTypeCode.DECIMAL`（128-bit），服务端根据实际列类型自行转换。

### 编码方式：变长字符串绑定

FS 文档明确要求："参数绑定请用变长字符串形式的数据进行绑定"。

DECIMAL 值在 stmt2 二进制协议中以 UTF-8 字符串编码（与 VARCHAR 编码路径相同），但 ColumnInfo.type 设置为实际的 DECIMAL64 (21) 或 DECIMAL (17) 类型码。服务端接收字符串后自动转换为 int64 / int128 内部存储格式。

### 数据流

```
用户调用 setDecimal(["1234.56", "-0.001"])
  │
  ├── Insert 模式：从 _decimalFieldTypes 队列中 shift 出实际类型（DECIMAL64 或 DECIMAL）
  ├── Query 模式：默认使用 TDengineTypeCode.DECIMAL
  │
  ▼
addParams(params, "DECIMAL", 0, actualColumnType)
  │
  ▼ encode()
检测 columnType == DECIMAL || DECIMAL64 → 路由到 encodeVarColumns()
  │
  ▼
encodeVarColumns 将字符串编码为 UTF-8 字节，生成 ColumnInfo {
  type: DECIMAL64 或 DECIMAL,
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

在 `StmtBindParams` 基类中新增 `setDecimal` 方法：

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

基类默认使用 `TDengineTypeCode.DECIMAL`，子类可覆写。

### 3. `src/stmt/wsParams2.ts`（Stmt2BindParams）

**构造函数**：提取 decimal 字段类型队列。

```typescript
private _decimalFieldTypes: number[] = [];

constructor(paramsCount?, precision?, fields?) {
    super(precision, paramsCount);
    this._fields = fields || [];
    for (const f of this._fields) {
        if (f.field_type === TDengineTypeCode.DECIMAL ||
            f.field_type === TDengineTypeCode.DECIMAL64) {
            this._decimalFieldTypes.push(f.field_type);
        }
    }
}
```

**覆写 `setDecimal`**：自动推断类型。

```typescript
setDecimal(params: any[]) {
    if (!params || params.length == 0) {
        throw new TaosError(
            ErrorCode.ERR_INVALID_PARAMS,
            "SetDecimalColumn params is invalid!"
        );
    }
    const actualType = this._decimalFieldTypes.length > 0
        ? this._decimalFieldTypes.shift()!
        : TDengineTypeCode.DECIMAL;
    this.addParams(params, "DECIMAL", 0, actualType);
}
```

**`encode()` 方法**：在 `_isVarType` 检查之前，增加 DECIMAL 类型路由。

```typescript
encode(): void {
    // ...existing validation...
    for (let i = 0; i < this._fieldParams.length; i++) {
        let fieldParam = this._fieldParams[i];
        if (!fieldParam) continue;

        if (fieldParam.columnType === TDengineTypeCode.DECIMAL ||
            fieldParam.columnType === TDengineTypeCode.DECIMAL64) {
            // DECIMAL 类型：以变长字符串编码
            this._params.push(
                this.encodeVarColumns(
                    fieldParam.params, fieldParam.dataType,
                    fieldParam.typeLen, fieldParam.columnType
                )
            );
        } else {
            let isVarType = _isVarType(fieldParam.columnType);
            if (isVarType == ColumnsBlockType.SOLID) {
                // ...existing solid type handling...
            } else {
                // ...existing var type handling...
            }
        }
    }
}
```

### 4. `test/stmt/stmt2.decimal.test.ts`（新文件）

集成测试覆盖：

- **DECIMAL64 + DECIMAL 混合绑定**：创建含两种 decimal 列的 stable，通过 stmt2 绑定字符串值并写入，查询验证。
- **NULL 值**：decimal 列绑定 null。
- **负数和科学计数法**：如 `"-1234.5678"`, `"1.23e+5"`。
- **多行绑定**：一次绑定多行 decimal 数据。

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
