# Adapter HA 支持设计规格

## 概述

为 Node.js 连接器增加 adapter 高可用（HA）支持。客户端在首次连接（SQL）或订阅（TMQ）时，向 adapter 请求集群实例列表，将返回的新实例合并到当前端点池，供后续负载均衡和重连使用。

## 背景

参考文档：`docs/fs/adapter-ha.md`。当前连接器已支持多地址 DSN、连接池、负载均衡和自动重连。Adapter HA 在此基础上增加动态实例发现能力——通过 adapter 的 `list_instances` 协议字段，从初始 seed 节点扩展到完整集群。

## 参数

| 参数 | 默认值 | 传入方式 | 说明 |
|---|---|---|---|
| `adapter_ha` | `false` | DSN URL 查询参数 | 开启后，首次连接/订阅时请求实例列表 |

示例 DSN：`ws://root:taosdata@host1:6041,host2:6041/db?adapter_ha=true`

## 协议字段

| 场景 | 字段 | 类型 | 规则 |
|---|---|---|---|
| SQL CONN 请求 | `list_instances` | `boolean` | 首次建连且 `adapter_ha=true` 时为 `true`；重连时为 `false` |
| SQL CONN 响应 | `list_instances` | `string[]`（`host:port`） | adapter 返回可用实例列表（可选） |
| TMQ SUBSCRIBE 请求 | `list_instances` | `boolean` | 首次订阅且 `adapter_ha=true` 时为 `true`；重连恢复订阅时为 `false` |
| TMQ SUBSCRIBE 响应 | `list_instances` | `string[]`（`host:port`） | adapter 返回可用实例列表（可选） |

## 数据流

1. 解析 DSN URL，读取 `adapter_ha` 参数。
2. 首次连接/订阅时，请求消息中带 `list_instances: true`。
3. 收到响应后提取 `list_instances` 字段。
4. 调用 `Dsn.mergeInstances()` 清洗并合并新实例。
5. 新实例自动参与后续负载均衡与重连候选（通过现有的 `Dsn.addresses`）。
6. 后续重连/恢复订阅时带 `list_instances: false`，不再重复拉取。
7. 响应中没有 `list_instances` 字段时（旧版 adapter），连接正常继续，不做动态扩容。

## 影响范围

只影响当前连接的 `Dsn` 实例。不同 `WsSql`/`WsConsumer` 实例各自独立发现。

## 变更文件

### `src/common/dsn.ts`

**新增 `Dsn.mergeInstances()` 方法：**

```typescript
mergeInstances(rawInstances: string[] | undefined | null): Address[] {
    if (!rawInstances || rawInstances.length === 0) {
        return [];
    }
    const existingKeys = new Set(
        this.addresses.map(a => `${a.host}:${a.port}`)
    );
    const newAddresses: Address[] = [];
    for (const raw of rawInstances) {
        if (!raw || raw.trim().length === 0) continue;
        const parsed = tryParseHostPort(raw.trim());
        if (!parsed) continue;
        const key = `${parsed.host}:${parsed.port}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        newAddresses.push(parsed);
    }
    this.addresses.push(...newAddresses);
    return newAddresses;
}
```

**新增 `tryParseHostPort()` 函数：**

从现有 `parseHostList()` 提取单地址解析逻辑。解析失败返回 `null` 而非抛异常。

```typescript
export function tryParseHostPort(raw: string): Address | null
```

支持格式：`host:port`、`host`（使用默认端口）、`[::1]:port`（IPv6）。

### `src/client/wsClient.ts`

**新增 `_adapterHA` 私有字段：**

在构造函数中，参照 `_timezone`/`_userApp` 等参数的处理方式，从 `dsn.params` 读取：

```typescript
private _adapterHA: boolean = false;

// constructor 中：
if (this._dsn.params.has("adapter_ha")) {
    this._adapterHA = this._dsn.params.get("adapter_ha") === "true";
}
```

**`buildConnMessage()` 增加 `listInstances` 参数：**

```typescript
private buildConnMessage(database?: string | null, listInstances?: boolean) {
    return {
        action: "conn",
        args: {
            // ...existing fields...
            ...(listInstances !== undefined && { list_instances: listInstances }),
        },
    };
}
```

**`connect()` 处理实例发现：**

- 首次连接时，`_adapterHA` 为 `true` 则传 `listInstances: true`。
- 解析 CONN 响应中的 `list_instances`，调用 `this._dsn.mergeInstances()`。
- 新发现的地址记录 info 级别日志。

**`recoverSqlSessionContext()` 显式关闭实例发现：**

重连时传 `listInstances: false`（仅当 `_adapterHA` 为 `true`）。

### `src/tmq/wsTmq.ts`

**`buildSubscribeMessage()` 增加 `listInstances` 参数：**

与 SQL CONN 相同的模式。

**`subscribe()` 处理实例发现：**

- 从 `this._config.dsn?.params.get("adapter_ha")` 读取配置。
- 首次订阅时传 `listInstances: true`。
- 解析 SUBSCRIBE 响应中的 `list_instances`，调用 `this._config.dsn!.mergeInstances()`。

**`recoverSessionContext()` 显式关闭实例发现：**

重连恢复订阅时传 `listInstances: false`。

### 不变更的文件

- `WSConfig` — `adapter_ha` 通过 DSN URL 传入，不需要 config API。
- `TmqConfig` — 从 `dsn.params` 直接读取。
- `WebSocketConnector` — 地址变更通过 `Dsn.addresses` 自动生效。
- `WebSocketConnectionPool` — 无需改动。

## 向下兼容

- `adapter_ha` 默认为 `false`，不开启时行为完全不变。
- 开启后如果 adapter 不返回 `list_instances`（旧版），连接正常继续。
- `list_instances` 字段使用 spread 操作符有条件添加，未开启时请求消息中不包含该字段。

## 测试

### 单元测试 — `test/common/adapter-ha.test.ts`

- `Dsn.mergeInstances()` 场景：
  - 空列表 / null / undefined → 不改变 addresses，返回空数组
  - 正常 host:port 列表 → 正确追加，返回新增地址
  - 重复地址过滤（与已有地址和新列表内部去重）
  - 无效格式过滤（空字符串、缺失端口、非法端口等）
  - IPv6 地址支持
- `tryParseHostPort()` 边界情况
- `buildConnMessage()` 中 `list_instances` 字段的生成验证
- `buildSubscribeMessage()` 中 `list_instances` 字段的生成验证

### 集成测试 — `test/bulkPulling/adapter-ha.test.ts`

- 开启 `adapter_ha=true` 连接成功，含 `list_instances` 响应时地址被合并
- 开启 `adapter_ha=true` 但 adapter 不返回 `list_instances` 时连接正常
- 未开启 `adapter_ha` 时，消息中不含 `list_instances` 字段
- TMQ 订阅路径的 adapter HA 行为

## 日志

- 新发现实例合并时，记录 info 级别日志，包含新增地址列表。
- 地址信息不涉及敏感数据（仅 host:port），无需脱敏。
