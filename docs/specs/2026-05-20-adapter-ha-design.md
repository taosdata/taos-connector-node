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

参数名以本规格为准，统一使用 `adapter_ha`。参考说明中的 `adapterHA` 不作为本规格支持的参数名；按旧名称配置时不会启用 HA，用户需要迁移为 `adapter_ha`。

## 协议字段

| 场景 | 字段 | 类型 | 规则 |
|---|---|---|---|
| SQL CONN 请求 | `list_instances` | `boolean` | 首次建连且 `adapter_ha=true` 时为 `true`；重连时为 `false` |
| SQL CONN 响应 | `list_instances` | `string[]`（`host:port`） | adapter 返回可用实例列表（可选） |
| TMQ SUBSCRIBE 请求 | `list_instances` | `boolean` | 首次订阅且 `adapter_ha=true` 时为 `true`；重连恢复订阅时为 `false` |
| TMQ SUBSCRIBE 响应 | `list_instances` | `string[]`（`host:port`） | adapter 返回可用实例列表（可选） |

## 数据流

1. 解析 DSN URL，读取 `adapter_ha` 参数。
2. 获取连接时，`WebSocketConnectionPool` 调用 `EndpointClusterManager.resolveCluster(dsn.addresses)` 解析集群归属：
   - 若 seed 端点命中已知集群，返回该集群（不将未命中的 seed 加入集群）。
   - 若全部未命中，新建集群（`id = crypto.randomUUID()`，`endpoints = seeds`）。
   - 若 seed 命中不同集群（冲突），新建独立集群，不补全、不扩展已有集群。
3. 调用 `dsn.mergeInstances(cluster.endpoints)` 将集群已知端点同步到当前 DSN，使连接器从建连开始即可使用完整地址列表做重连/故障转移。
4. 基于集群 `id`（UUID，不因扩容而变化）计算 pool key，保证地址扩容后新旧 key 一致；`WebSocketConnector` 创建时保存同一个 `EndpointCluster` 上下文。
5. 首次连接/订阅时，请求消息中带 `list_instances: true`。
6. 收到响应后提取 `list_instances` 字段。
7. 调用 `Dsn.mergeInstances()` 清洗并合并新实例到当前 DSN。
8. 通过当前 `WebSocketConnector.getCluster()` 取回第 4 步保存的同一个集群，调用 `EndpointClusterManager.expandCluster()` 将新端点注册到该集群，供后续其他连接实例使用。
9. 新实例自动参与后续负载均衡与重连候选。
10. 后续重连/恢复订阅时带 `list_instances: false`，不再重复拉取。
11. 响应中没有 `list_instances` 字段时（旧版 adapter），记录 warn 级别日志提示动态发现不可用，连接正常继续，不做动态扩容。

## 影响范围

- 地址发现影响当前连接的 `Dsn` 实例。不同 `WsSql`/`WsConsumer` 实例各自独立向 adapter 发现。
- `EndpointClusterManager` 为进程级单例，跨实例共享集群映射。后续连接可通过已知集群补全地址列表，无需等待自身 adapter 响应。

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

### `src/common/endpointClusterManager.ts`（新增）

管理 endpoint→cluster 双向映射，为连接池提供稳定的集群身份标识。

**`EndpointCluster` 类：**

```typescript
class EndpointCluster {
    readonly id: string;                        // UUID，创建时固定，扩容后不变
    readonly endpoints: Map<string, Address>;   // key="host:port", value=Address
}
```

**`EndpointClusterManager` 单例：**

核心数据结构：

- `endpointClusterMap: Map<string, EndpointCluster>` — endpoint key（`"host:port"`）→ 所属集群。一个 endpoint 在任一时刻只对应一个集群。

核心方法：

```typescript
class EndpointClusterManager {
    /**
     * 解析 seed 端点的集群归属。始终返回一个集群对象。
     *
     * Case 1: 部分 seed 命中同一集群 → 返回该集群（不将未命中 seed 加入集群）
     * Case 2: 全部 seed 命中同一集群 → 返回该集群
     * Case 3: seed 命中不同集群    → 新建集群（不补全，不扩展已有集群）
     * Case 4: 全部未命中           → 新建集群（id=UUID, endpoints=seeds）
     */
    resolveCluster(seedAddresses: Address[]): EndpointCluster;

    /**
     * 集群扩容。将 adapter 返回的新端点注册到集群。
     * 已存在于该集群的端点跳过；已属于其他集群的端点跳过并记录警告。
     */
    expandCluster(cluster: EndpointCluster, newAddresses: Address[]): void;
}
```

**`resolveCluster` 解析规则示意：**

| seed 命中情况 | 处理 | 返回值 |
|---|---|---|
| 部分命中同一集群 | 不修改集群 | 该集群 |
| 全部命中同一集群 | 不修改集群 | 该集群 |
| 命中不同集群 | 新建集群（seeds） | 新集群 |
| 全部未命中 | 新建集群（seeds） | 新集群 |

### `src/client/wsConnector.ts`

**保存当前集群上下文：**

`WebSocketConnector` 构造函数新增 `cluster` 参数，并以只读字段保存。pool key 仍在创建时固化，cluster 上下文与 pool key 使用同一个 `cluster.id` 来源。

```typescript
class WebSocketConnector {
    private readonly _cluster: EndpointCluster;

    constructor(
        dsn: Dsn,
        poolKey: string,
        timeout: number | undefined | null,
        cluster: EndpointCluster
    ) {
        this._cluster = cluster;
        // ...existing constructor logic...
    }

    getCluster(): EndpointCluster {
        return this._cluster;
    }
}
```

复用连接池中的 connector 时，不重新解析 cluster；直接使用 connector 已保存的 cluster 上下文。由于 pool key 基于 `cluster.id`，同一 pool 内 connector 的 cluster 与 pool key 保持一致。

### `src/client/wsConnectorPool.ts`

**`getPoolKey()` 改为基于集群身份：**

```typescript
private getPoolKey(dsn: Dsn, cluster: EndpointCluster): string {
    const auth = this.buildAuthScope(dsn);
    const path = dsn.path();
    return `${dsn.scheme}://${cluster.id}/${path}#auth=${auth}`;
}
```

地址部分始终使用 `cluster.id`（UUID），扩容后 key 不变。

**`getConnection()` 增加集群解析与地址同步：**

```typescript
async getConnection(dsn: Dsn, timeout: number | undefined | null): Promise<WebSocketConnector> {
    const cluster = EndpointClusterManager.instance().resolveCluster(dsn.addresses);
    dsn.mergeInstances(
        [...cluster.endpoints.values()].map(a => `${a.host}:${a.port}`)
    );
    const poolKey = this.getPoolKey(dsn, cluster);
    // ...existing pool lookup/create logic...
    // 新建 connector 时注入当前 cluster；复用 connector 时保留其原有 cluster。
    return new WebSocketConnector(dsn, poolKey, timeout, cluster);
}
```

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
- 解析 CONN 响应中的 `list_instances`，调用 `this._dsn.mergeInstances()` 合并到 DSN。
- 通过 `this._wsConnector!.getCluster()` 获取 pool 在 `getConnection()` 中解析出的同一个集群，再调用 `EndpointClusterManager.expandCluster()` 注册新端点。
- 新发现的地址记录 info 级别日志。

**`recoverSqlSessionContext()` 显式关闭实例发现：**

重连时传 `listInstances: false`（仅当 `_adapterHA` 为 `true`）。

### `src/tmq/wsTmq.ts`

**`buildSubscribeMessage()` 增加 `listInstances` 参数：**

与 SQL CONN 相同的模式。

**`subscribe()` 处理实例发现：**

- 从 `this._config.dsn?.params.get("adapter_ha")` 读取配置。
- 首次订阅时传 `listInstances: true`。
- 解析 SUBSCRIBE 响应中的 `list_instances`，调用 `this._config.dsn!.mergeInstances()` 合并到 DSN。
- 通过底层 `WsClient` 当前持有的 `WebSocketConnector.getCluster()` 获取 pool 在 `getConnection()` 中解析出的同一个集群，再调用 `EndpointClusterManager.expandCluster()` 注册新端点。

**`recoverSessionContext()` 显式关闭实例发现：**

重连恢复订阅时传 `listInstances: false`。

### 不变更的文件

- `WSConfig` — `adapter_ha` 通过 DSN URL 传入，不需要 config API。
- `TmqConfig` — 从 `dsn.params` 直接读取。

## 向下兼容

- `adapter_ha` 默认为 `false`，不开启时行为完全不变。
- `adapterHA` 不作为兼容别名处理；既有说明或配置中使用该名称的，需要迁移为 `adapter_ha`。
- 开启后如果 adapter 不返回 `list_instances`（旧版），连接正常继续，但会记录 warn 日志提示动态端点发现不可用。
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
- `EndpointClusterManager.resolveCluster()` 场景：
  - Case 1: 部分 seed 命中同一集群 → 返回该集群，不将未命中 seed 加入
  - Case 2: 全部 seed 命中同一集群 → 返回该集群
  - Case 3: seed 命中不同集群 → 新建独立集群
  - Case 4: 全部未命中 → 新建集群（id 为 UUID，endpoints 包含 seeds）
  - 同 seed 多次调用 → 返回同一集群实例
- `EndpointClusterManager.expandCluster()` 场景：
  - 新端点加入集群，cluster.id 不变
  - 重复端点跳过
  - 已属于其他集群的端点跳过并记录警告
- Pool key 稳定性验证：
  - 扩容前后 `getPoolKey()` 返回相同值
  - 不同 DSN 实例命中同一集群时 pool key 一致

### 集成测试 — `test/bulkPulling/adapter-ha.test.ts`

- 开启 `adapter_ha=true` 连接成功，含 `list_instances` 响应时地址被合并
- 开启 `adapter_ha=true` 但 adapter 不返回 `list_instances` 时连接正常
- 未开启 `adapter_ha` 时，消息中不含 `list_instances` 字段
- TMQ 订阅路径的 adapter HA 行为

## 日志

- 新发现实例合并时，记录 info 级别日志，包含新增地址列表。
- 集群创建时，记录 info 级别日志，包含集群 id 和初始端点。
- 集群扩容时，记录 info 级别日志，包含集群 id 和新增端点。
- `expandCluster` 跳过已属于其他集群的端点时，记录 warn 级别日志。
- `adapter_ha` 已开启但 adapter 响应中未包含 `list_instances` 时，记录 warn 级别日志，提示动态 adapter 端点发现不可用。
- 地址信息不涉及敏感数据（仅 host:port），无需脱敏。
