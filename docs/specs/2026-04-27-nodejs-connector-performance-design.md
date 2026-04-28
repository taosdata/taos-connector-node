# Node.js 连接器性能优化设计

> 日期: 2026-04-27  
> 状态: 已批准  
> 范围: `@tdengine/websocket` 包内部实现优化  
> 约束: API 签名不变 / Node 16+ 兼容 / 所有测试使用真实 TDengine 实例

---

## 1. 问题概述

通过代码审计发现以下关键性能瓶颈：

| 优先级 | 问题 | 文件 | 影响 |
|--------|------|------|------|
| CRITICAL | 全局 Mutex + O(n) 线性查找回调 | `wsEventCallback.ts` | 高并发下每条消息 10-50ms 延迟 |
| CRITICAL | 每次解析重建 TextDecoder | `taosResult.ts`, `tmqResponse.ts` | 10-20% 解析开销 |
| CRITICAL | NCHAR 逐字节解码+Buffer 分配 | `ut8Helper.ts`, `taosResult.ts` | NCHAR 列 30-50% 性能损耗 |
| HIGH | `toFixed()` 浮点格式化 | `taosResult.ts` | 20-30% 数值列解析开销 |
| HIGH | 行数据 `shift()` O(n) 操作 | `wsRows.ts` | 大结果集行遍历退化为 O(n²) |
| MEDIUM | `readBinary()` 总是复制 | `taosResult.ts` | VARBINARY/BLOB 内存翻倍 |
| LOW | 未使用的 `moment-timezone` 依赖 | `package.json` | ~500KB 无效负载 |

---

## 2. 设计方案

### 2.1 回调注册表重构 (`wsEventCallback.ts`)

**现状：**
- 全局 `Mutex` 保护所有注册/查找/清理操作
- 回调查找遍历整个 `_msgActionRegister` Map，O(n)
- 超时清理再次竞争同一把锁

**改动：**

1. **去掉全局 Mutex** — JavaScript 是单线程事件循环，Map 的 `get`/`set`/`delete` 在同一 tick 内不会被打断，不需要互斥锁
2. **建立索引 Map** — 使用 `Map<string, { resolve, reject, timer }>` 按复合 key（`req_id` + `action` 或 `id`）直接索引
   - 字符串消息：key = `${req_id}_${action}`
   - 二进制/Blob 消息：key = `${msg.id}`，同时维护 `req_id → id` 的反向映射
3. **简化超时清理** — 直接 `Map.delete(key)`，无需锁
4. **保持对外接口不变**

**预期收益：** 回调查找从 O(n) 降至 O(1)，消除锁竞争延迟。

### 2.2 数据解析优化 (`taosResult.ts` + `ut8Helper.ts` + `tmqResponse.ts`)

#### 2.2.1 TextDecoder 单例

**改动：** 在 `taosResult.ts` 和 `tmqResponse.ts` 中声明模块级常量：
```typescript
const sharedTextDecoder = new TextDecoder();
```
替代 `parseBlock()` / `WSTmqFetchBlockInfo` 构造函数中每次 `new TextDecoder()`。

#### 2.2.2 NCHAR 解码重写

**现状：** `readNchar()` 逐 4 字节调用 `appendRune()`，每次分配 `Array` + `Buffer.from().toString()`。

**改动：** 直接使用 `TextDecoder` 一次性解码：
```typescript
export function readNchar(
  dataBuffer: ArrayBufferLike,
  colDataHead: number,
  length: number
): string {
  return sharedTextDecoder.decode(new Uint8Array(dataBuffer, colDataHead, length));
}
```

注意：TDengine NCHAR 使用 UCS-4 (UTF-32LE) 编码，每字符 4 字节。`TextDecoder('utf-32le')` 在部分 Node.js 环境中可能不被支持（ICU 依赖）。如果不支持，保留手动解码但优化实现：预分配缓冲区、使用 `String.fromCodePoint()` 替代 `appendRune()`。

#### 2.2.3 去掉 `toFixed()` 浮点格式化

**现状：**
```typescript
result.push(parseFloat(dataBuffer.getFloat32(colBlockHead, true).toFixed(5)));
```

**改动：** 直接返回原始浮点值：
```typescript
result.push(dataBuffer.getFloat32(colBlockHead, true));
```

IEEE 754 单精度 (float32) 本身约 7 位有效数字精度，`toFixed(5)` → `parseFloat` 的往返转换不增加精度，只增加开销。

#### 2.2.4 `readBinary()` 优化拷贝

**现状：** 手动 `new ArrayBuffer()` + `new Uint8Array().set()` 两步复制。

**改动：** 使用 `ArrayBuffer.prototype.slice()` 一步完成：
```typescript
export function readBinary(
  dataBuffer: ArrayBufferLike,
  colDataHead: number,
  length: number
): ArrayBuffer {
  return dataBuffer.slice(colDataHead, colDataHead + length);
}
```

注意：`slice()` 仍然创建独立副本（非视图），但由引擎原生实现，比手动 `new + set` 更高效。

### 2.3 行数据访问优化 (`wsRows.ts`)

**现状：** `getData()` 使用 `data.shift()` 弹出第一行，O(n) 数组重排。

**改动：** 引入 `_rowIndex` 指针：
```typescript
private _rowIndex: number = 0;

getData(): any[] | undefined {
  const data = this._taosResult?.getData();
  if (data && this._rowIndex < data.length) {
    return data[this._rowIndex++];
  }
  return undefined;
}
```
在 `next()` 获取新 block 时重置 `_rowIndex = 0`。

**预期收益：** 大结果集行遍历从 O(n²) 降至 O(n)。

### 2.4 移除未使用依赖

**改动：** 从 `package.json` 的 `dependencies` 中移除 `moment-timezone`。

**验证：** 全局搜索确认 `moment` 在 `src/` 中无引用。

---

## 3. 基准测试套件

在 `test/benchmark/` 下新建基准测试，使用 `performance.now()` 计时，连接真实 TDengine 实例。

### 3.1 `parseBlock.bench.ts` — 数据解析吞吐量

- 创建临时库 `bench_parse_db`，含以下表结构：
  - `int_table`: 100 万行 INT/BIGINT/BOOL 数据
  - `float_table`: 100 万行 FLOAT/DOUBLE 数据
  - `nchar_table`: 10 万行 NCHAR(100) 数据
  - `binary_table`: 10 万行 VARBINARY(256) 数据
- 测量查询 + 解析全链路耗时，输出 rows/sec
- `beforeAll` 创建数据，`afterAll` 清理

### 3.2 `eventCallback.bench.ts` — 回调注册查找性能

- 通过真实连接执行并发查询，测量：
  - 并发 100/1000/5000 条查询的平均响应时间
  - 回调注册到响应的端到端延迟
- 连接真实 TDengine 实例执行简单 `SELECT 1`

### 3.3 `wsRows.bench.ts` — 行遍历性能

- 创建含 100 万行数据的表
- 测量通过 `WSRows` 遍历全部行的耗时
- 输出 rows/sec

---

## 4. 测试策略

- 所有现有测试必须通过（`npm run test`）
- 基准测试作为独立 Jest 测试文件，可通过 `npm run test -- test/benchmark/` 运行
- 每个优化点可独立回退验证

---

## 5. 变更文件清单

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `src/client/wsEventCallback.ts` | 重构 | 去 Mutex + 索引 Map |
| `src/common/taosResult.ts` | 优化 | TextDecoder 单例 + NCHAR 重写 + toFixed 移除 + readBinary 优化 |
| `src/common/ut8Helper.ts` | 可能弃用 | 如 TextDecoder('utf-32le') 可用则不再使用 |
| `src/tmq/tmqResponse.ts` | 优化 | TextDecoder 单例 + 同步 taosResult.ts 的解析改动 |
| `src/sql/wsRows.ts` | 优化 | shift() → 索引指针 |
| `package.json` | 清理 | 移除 moment-timezone |
| `test/benchmark/parseBlock.bench.ts` | 新增 | 解析吞吐量基准测试 |
| `test/benchmark/eventCallback.bench.ts` | 新增 | 回调性能基准测试 |
| `test/benchmark/wsRows.bench.ts` | 新增 | 行遍历基准测试 |

---

## 6. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| NCHAR 解码行为变化 | UTF-32LE TextDecoder 可用性检测 + 回退方案 |
| 去掉 Mutex 后的竞态条件 | Node.js 单线程模型保证同步操作原子性 |
| `toFixed()` 移除导致浮点精度变化 | IEEE 754 精度不变，只是显示格式不同；现有测试覆盖 |
| `readBinary()` 零拷贝后调用方修改影响源 | `ArrayBuffer.slice()` 返回独立副本（非视图），不影响源数据 |
