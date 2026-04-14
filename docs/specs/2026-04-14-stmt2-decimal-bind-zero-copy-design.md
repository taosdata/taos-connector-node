# Stmt2 Decimal Bind 零拷贝优化

## 问题

`WsStmt2.bind()` 的 non-full-binding 路径调用 `createInsertBindParamsWithNormalizedDecimalType`，该函数为了将 DECIMAL 列的 `columnType` 解析为实际类型（DECIMAL64），创建了新的 `Stmt2BindParams` 并对**所有列**的行数据执行 `[...params]` 深拷贝。实际只有 DECIMAL64 列需要修改 `columnType`，其余列的拷贝是不必要的开销。

拷贝成本为 O(列数 × 行数)，当数据量较大时成为性能瓶颈。

## 背景

### 类型解析需求

用户通过 `setDecimal()` 绑定 decimal 数据，`columnType` 固定为 `TDengineTypeCode.DECIMAL (17)`。服务端实际列类型可能为：

- `DECIMAL (17)` — 与用户设置一致，无需修改
- `DECIMAL64 (21)` — 需要将 `columnType` 从 17 改为 21

只有 DECIMAL64 列需要类型变更。

### 两条绑定路径

1. **Full-binding**（`getBindCount() === fields.length`，行 220-278）：按行拆分参数，per-row per-column 调用 `resolveDecimalColumnType`。无全量拷贝，但存在重复解析。
2. **Non-full-binding**（行 280-289）：调用 `createInsertBindParamsWithNormalizedDecimalType` 进行全量拷贝 + 类型解析。

### 参数创建方式

- `Stmt2BindParams` 未通过 `index.ts` 导出，用户无法直接实例化
- 所有 params 通过 `stmt.newStmtParam()` 创建，`paramsCount` 始终等于 `fields.length`

## 方案：零拷贝共享引用

### Non-full-binding 路径

重写 `createInsertBindParamsWithNormalizedDecimalType`，消除数据数组拷贝：

1. 创建新 `Stmt2BindParams(colFields.length, precision, colFields)` 作为容器
2. 遍历 `sourceFieldParams`，跳过 undefined 位置
3. 对每个 `FieldBindParams`：
   - **columnType 无需变更**（非 DECIMAL 列，或 DECIMAL 列 field_type 为 DECIMAL）：直接将原始 `FieldBindParams` 引用赋值到新 params 对应位置
   - **columnType 需要变更**（DECIMAL 列 field_type 为 DECIMAL64）：创建新 `FieldBindParams`，`columnType` 设为 `DECIMAL64 (21)`，`params` 数组**共享原始引用**（不执行 `[...params]`）

成本从 O(列数 × 行数) 降到 O(列数)。

### Full-binding 路径

将 `resolveDecimalColumnType` 从 per-row 内循环提升到循环前预计算。

由于 `setTableName` 必须在每行的列遍历之前调用，循环嵌套顺序不能从 row-major 改为 column-major。采用**预计算 resolvedType 数组**的方式，保持原有循环结构：

```typescript
const resolvedTypes = paramsArray._fieldParams.map((fp, j) =>
    this.resolveDecimalColumnType(fp.columnType, this.fields[j].field_type)
);
for (let i = 0; i < paramsCount; i++) {
    // setTableName(...)
    for (let j = 0; j < fields.length; j++) {
        // 使用 resolvedTypes[j] 替代 this.resolveDecimalColumnType(...)
    }
}
```

## 不变量

- 调用者 params 的 `columnType` 不被修改（DECIMAL64 列创建新 FieldBindParams 对象）
- 调用者 params 的数据数组通过共享引用传递（与 main 分支行为一致，非新增风险）
- 现有 `stmt2.decimal.test.ts` 测试全部通过

## 涉及文件

| 文件 | 变更内容 |
|------|---------|
| `src/stmt/wsStmt2.ts` | 重写 `createInsertBindParamsWithNormalizedDecimalType` 为零拷贝；full-binding 循环预计算 resolvedType |

## 测试

现有 `test/stmt/stmt2.decimal.test.ts` 覆盖场景：

- Full-binding insert：DECIMAL 列类型解析为 DECIMAL64
- Non-full-binding insert：DECIMAL 列类型解析为 DECIMAL64
- Query 模式：保持默认 DECIMAL 类型
- 调用者 params 不被修改，可重复使用
- Decimal 边界值、null、负数、科学计数法
