# Adapter HA (High Availability) — Node.js Connector Design

## 概述

为 Node.js 连接器添加 taosAdapter 高可用支持。当启用 `adapter_ha=true` 时，客户端在首次连接时向 adapter 请求所有活跃实例列表，动态扩展连接器的地址列表，实现自动故障转移和负载均衡。

参考实现：[taos-connector-jdbc PR #321](https://github.com/taosdata/taos-connector-jdbc/pull/321)

## 功能范围

本期实现 4 项核心能力（暂不包含后台健康检查）：

| # | 能力 | 说明 |
|---|------|------|
| 1 | 端点发现 | 首次连接时通过 `list_instances=true` 获取所有 adapter 实例 |
| 2 | 端点合并 | 将发现的新端点动态合并到连接器地址列表 |
| 3 | 全局集群注册 | 事件循环级 ClusterRegistry 单例，让新连接自动复用已知集群 |
| 4 | 重连时抑制发现 | 重连恢复时不携带 `list_instances`，避免重复发现 |

覆盖路径：SQL 和 TMQ 两条路径均支持。

## 配置

通过 DSN 参数启用：

```
ws://root:taosdata@host1:6041/db?adapter_ha=true
```

- 参数名：`adapter_ha`
- 默认值：`false`（未设置时不启用任何 HA 逻辑）
- 与现有 DSN 参数命名风格一致（下划线分隔，如 `retry_backoff_ms`）

## 架构设计

### 方案选择

选择**方案 A：轻量级集成**——在现有组件上做最小化修改，新增一个轻量的 `ClusterRegistry` 单例。

理由：
- Node.js 连接器的 `WebSocketConnector` 已内置多地址 failover（`attemptReconnect()` 遍历地址列表），只需扩展地址列表
- 改动量最小（~3 个现有文件 + 1 个新文件），风险最低
- Pool 逻辑完全不变

### 整体数据流

```
1. WsClient.connect() / WsConsumer.subscribe()
   ├── 构建消息时检查 dsn.isAdapterHA()
   │   ├── 首次连接: 添加 list_instances: true
   │   └── 重连恢复: 不添加 list_instances（字段不出现）
   ├── 发送消息，获取响应
   └── 响应包含 list_instances: ["host2:6041", "host3:6041"]
       ├── 解析新端点 → 去重 → 合并到 connector._failoverAddresses
       └── 注册到 ClusterRegistry 全局单例

2. 后续新连接 (new WebSocketConnector())
   ├── 构造时从 ClusterRegistry 查询已知集群
   ├── 扩展 _failoverAddresses（独立副本，不修改 DSN）
   └── connector 内部拥有完整地址列表用于 failover
```

### 关键设计决策：种子地址不可变，failover 地址独立扩展

**问题**：当前代码中 `WsClient._dsn` 和 `WebSocketConnector._dsn` 是同一个引用（wsClient.ts:35 → wsConnectorPool.ts:113 → wsConnector.ts:181）。如果直接修改 `_dsn.addresses`，会污染 Pool 的 key 计算（wsConnectorPool.ts:48-56），导致 `ready()` 等方法再次调用 `getConnection(this._dsn)` 时生成不同的 pool key，找不到原有 connector。

**方案**：Connector 维护独立的 `_failoverAddresses: Address[]`，与 `_dsn.addresses` 解耦：

```
DSN.addresses (不可变种子地址)          Connector._failoverAddresses (可扩展副本)
────────────────────────────          ───────────────────────────────────────
用于 Pool key 计算                →   用于 failover / selectLeastConnectedAddress
始终保持用户传入的原始值                构造时从 DSN 深拷贝，之后独立扩展
WsClient / Pool 共享引用安全          Connector 独占，不影响外部
```

- `_dsn` 视为只读，Connector 不修改其 `addresses` 字段
- `_failoverAddresses` 在构造时从 `_dsn.addresses` 深拷贝初始化
- 所有地址遍历逻辑（`attemptReconnect`、`selectLeastConnectedAddress`、`buildUrl`）改用 `_failoverAddresses`
- 端点发现后扩展 `_failoverAddresses`，不影响 `_dsn`

### 发现生命周期与拓扑刷新语义

**发现时机**：

| 场景 | 是否发现 | 说明 |
|------|---------|------|
| SQL 首次 `connect()` | ✅ | `list_instances: true` |
| TMQ 首次 `subscribe()` | ✅ | `list_instances: true` |
| 断线后重连恢复（`recoverSqlSessionContext` / `recoverSessionContext`）| ❌ | 省略 `list_instances` |
| 新建 Connector（相同种子地址） | ✅ 从缓存 | 从 ClusterRegistry 扩展，无网络请求 |

**拓扑变化处理**：

本期设计中，端点列表在首次连接后即固定，不会主动刷新。这与 Java PR #321 行为一致。

已知限制：如果 adapter 集群在连接生命周期内发生拓扑变化（新增/下线节点），当前连接器不会感知。仅当创建全新连接且连接到已更新拓扑的 adapter 时，才能获取新列表。

后续增强方向（不在本期范围）：
- 周期性重新发现（定时器触发带 `list_instances: true` 的心跳）
- 提供手动刷新 API（`connector.refreshEndpoints()`）

## 详细设计

### 1. DSN 扩展 (`src/common/dsn.ts`)

```typescript
// Dsn 类新增方法
isAdapterHA(): boolean {
  return this.params.get("adapter_ha") === "true";
}
```

新增工具函数：

```typescript
/**
 * 解析 adapter 返回的实例列表。
 *
 * 端点格式契约：
 * - IPv4: "host:port"（例: "192.168.1.1:6041"、"node1:6041"）
 * - IPv6: "[host]:port"（例: "[::1]:6041"、"[fe80::1]:6041"）
 * - 端口缺失时使用 DSN 默认端口（普通服务 6041、云服务 443）
 * - 纯 IPv6 不带括号（如 "::1:6041"）视为无效格式
 *
 * 错误处理：
 * - 空字符串 / 纯空白 → 跳过，不记录日志
 * - 无法解析的格式 → logger.warn("Adapter HA: ignoring invalid endpoint: {raw}") → 跳过
 * - 端口不是有效数字 → 同上
 *
 * @returns 新的 Address 数组（深拷贝），调用方可安全修改
 */
export function parseDiscoveredEndpoints(instances: string[]): Address[];

/**
 * 合并地址列表，按 host:port 去重。
 * 将 discovered 中不存在于 existing 的地址追加到末尾。
 *
 * @returns 新数组（不修改任何入参），包含深拷贝的 Address 对象
 */
export function mergeAddresses(existing: Address[], discovered: Address[]): Address[];
```

### 2. ClusterRegistry 单例 (`src/client/clusterRegistry.ts`)

**作用域**：单事件循环（即单个 Node.js 主线程或单个 Worker Thread）内的单例。与 `WebSocketConnectionPool` 使用相同的 `static _instance` 模式。若应用使用 `worker_threads`，每个 Worker 拥有独立的 ClusterRegistry 实例，发现结果不会跨 Worker 共享。

```typescript
export class ClusterRegistry {
  private static _instance?: ClusterRegistry;
  // 每个已知地址的 "host:port" 字符串 → 它所属集群的冻结地址列表
  private endpointToCluster: Map<string, readonly Address[]> = new Map();

  static instance(): ClusterRegistry;

  /**
   * 注册集群：所有地址互相指向同一个冻结的地址快照。
   *
   * 不可变约束：
   * - 入参 addresses 被深拷贝后冻结（Object.freeze），内部持有的引用不可被外部修改
   * - Address 对象同样被深拷贝，切断与调用方的引用关系
   */
  registerCluster(addresses: Address[]): void {
    const snapshot: Address[] = addresses.map(a => new Address(a.host, a.port));
    Object.freeze(snapshot);
    for (const addr of snapshot) {
      this.endpointToCluster.set(`${addr.host}:${addr.port}`, snapshot);
    }
  }

  /**
   * 用种子地址查询已知集群，返回合并后的地址列表。
   *
   * 多集群检测：如果 seeds 中的地址分属不同已知集群，视为配置错误，
   * 记录 warn 日志并返回 seeds 的深拷贝（不扩展），避免将不同集群的端点混合。
   *
   * @returns 新数组（深拷贝），调用方可安全修改。
   *          如果无已知集群匹配，返回 seeds 的深拷贝。
   */
  expandEndpoints(seeds: Address[]): Address[] {
    let matchedCluster: readonly Address[] | null = null;

    for (const seed of seeds) {
      const cluster = this.endpointToCluster.get(`${seed.host}:${seed.port}`);
      if (!cluster) continue;

      if (matchedCluster === null) {
        matchedCluster = cluster;
      } else if (matchedCluster !== cluster) {
        // 种子地址分属不同集群 → 配置错误，拒绝扩展
        logger.warn(
          "Adapter HA: seed addresses span multiple known clusters, " +
          "skipping expansion. Ensure all seeds belong to the same cluster."
        );
        return seeds.map(a => new Address(a.host, a.port));
      }
    }

    if (matchedCluster) {
      return mergeAddresses(seeds, [...matchedCluster]);
    }
    return seeds.map(a => new Address(a.host, a.port));
  }
}
```

### 3. WebSocketConnector 变更 (`src/client/wsConnector.ts`)

**新增独立 failover 地址列表**：

```typescript
// 新增字段
private _failoverAddresses: Address[];

constructor(dsn: Dsn, poolKey: string, timeout?: number | null) {
  // ... 现有逻辑 ...
  this._poolKey = poolKey;
  this._dsn = dsn;  // 只读引用，不修改其 addresses

  // 深拷贝 DSN 地址作为 failover 地址列表（与 _dsn.addresses 解耦）
  this._failoverAddresses = dsn.addresses.map(a => new Address(a.host, a.port));

  // 如果启用 adapter HA，从 ClusterRegistry 扩展 failover 地址
  if (dsn.isAdapterHA()) {
    const expanded = ClusterRegistry.instance().expandEndpoints(this._failoverAddresses);
    if (expanded.length > this._failoverAddresses.length) {
      logger.info(
        `Adapter HA: expanded seed endpoints from registry, ` +
        `${this._failoverAddresses.length} → ${expanded.length}`
      );
      this._failoverAddresses = expanded;
    }
  }

  this._currentAddress = this.selectLeastConnectedAddress();
  // ...
}
```

**failover 逻辑全部改用 `_failoverAddresses`**：

```typescript
// attemptReconnect() 中：
// 原: const totalAddresses = this._dsn.addresses.length;
// 改: const totalAddresses = this._failoverAddresses.length;

// selectLeastConnectedAddress() 中：
// 原: const candidates = this._dsn.addresses.filter(...)
// 改: const candidates = this._failoverAddresses.filter(...)
```

**新增合并方法**：

```typescript
/**
 * 合并发现的端点到 _failoverAddresses，然后注册到全局 ClusterRegistry。
 *
 * 顺序语义：先更新本地 failover 地址，再注册全局。
 * 如果全局注册失败（理论上不会，Map.set 不抛异常），本 connector 仍可使用扩展后的地址列表。
 * 后续新 connector 可能无法从 registry 获取完整列表，但不影响已有连接的 failover 能力。
 */
mergeDiscoveredEndpoints(instances: string[]): void {
  if (!this._dsn.isAdapterHA() || !instances || instances.length === 0) {
    return;
  }
  const discovered = parseDiscoveredEndpoints(instances);
  const merged = mergeAddresses(this._failoverAddresses, discovered);
  if (merged.length > this._failoverAddresses.length) {
    const newCount = merged.length - this._failoverAddresses.length;
    this._failoverAddresses = merged;                         // 步骤1: 更新本地
    ClusterRegistry.instance().registerCluster(merged);       // 步骤2: 注册全局
    logger.info(`Adapter HA: discovered ${newCount} new endpoint(s), total ${merged.length}`);
  }
}
```

### 4. WsClient 变更 (`src/client/wsClient.ts`)

**buildConnMessage 添加 list_instances**：

```typescript
private buildConnMessage(database?: string | null, listInstances?: boolean) {
  return {
    action: "conn",
    args: {
      req_id: ReqId.getReqID(),
      user: safeDecodeURIComponent(this._dsn.username),
      password: safeDecodeURIComponent(this._dsn.password),
      db: database,
      connector: ConnectorInfo,
      ...(this._timezone && { tz: this._timezone }),
      ...(this._userApp && { app: this._userApp }),
      ...(this._userIp && { ip: this._userIp }),
      ...(this._bearerToken && { bearer_token: this._bearerToken }),
      ...(listInstances !== undefined && { list_instances: listInstances }),
    },
  };
}
```

**connect() 处理 list_instances 响应**：

```typescript
async connect(database?: string | null): Promise<void> {
  const listInstances = this._dsn.isAdapterHA() ? true : undefined;
  const connMsg = this.buildConnMessage(database, listInstances);
  // ... 现有连接逻辑 ...

  let result = await this._wsConnector.sendMsg(JSON.stringify(connMsg));
  if (result.msg.code == 0) {
    this._connectedDatabase = normalizedDatabase;
    this._wsConnector.markSessionReady();

    // 新增：处理 adapter HA 端点发现
    if (result.msg.list_instances) {
      this._wsConnector.mergeDiscoveredEndpoints(result.msg.list_instances);
    }
    return;
  }
  // ... 现有错误处理 ...
}
```

**recoverSqlSessionContext() 不携带 list_instances**：

```typescript
private async recoverSqlSessionContext(): Promise<void> {
  // 不传 listInstances 参数 → 消息中不出现 list_instances 字段 → 不触发重新发现
  const connMsg = this.buildConnMessage(
    this.normalizeConnectedDatabase(this._connectedDatabase)
  );
  // ... 原有逻辑不变 ...
}
```

### 5. WsClient 新增公开方法

WsConsumer 需要访问 adapter HA 状态和合并端点。添加两个代理方法，避免暴露内部 `_dsn` 和 `_wsConnector`：

```typescript
// WsClient 新增
isAdapterHA(): boolean {
  return this._dsn.isAdapterHA();
}

mergeDiscoveredEndpoints(instances: string[]): void {
  this.getWsConnector().mergeDiscoveredEndpoints(instances);
}
```

### 6. WsConsumer 变更 (`src/tmq/wsTmq.ts`)

**buildSubscribeMessage 添加 list_instances**：

```typescript
private buildSubscribeMessage(topics: Array<string>, reqId?: number, listInstances?: boolean) {
  return {
    action: TMQMessageType.Subscribe,
    args: {
      // ... 现有字段 ...
      ...(listInstances !== undefined && { list_instances: listInstances }),
    },
  };
}
```

**subscribe() 处理响应**：

```typescript
async subscribe(topics: Array<string>, reqId?: number): Promise<void> {
  // ... 参数校验 ...
  const listInstances = this._wsClient.isAdapterHA() ? true : undefined;
  let queryMsg = this.buildSubscribeMessage(topics, reqId, listInstances);
  // 使用 bSqlQuery=false 获取原始响应，以访问 list_instances 字段
  const result = await this._wsClient.exec(JSON.stringify(queryMsg), false);

  // 新增：处理 adapter HA 端点发现
  if (result?.msg?.list_instances) {
    this._wsClient.mergeDiscoveredEndpoints(result.msg.list_instances);
  }

  this._topics = [...topics];
}
```

**recoverSessionContext() 不携带 list_instances**：

```typescript
private async recoverSessionContext(): Promise<void> {
  // 不传 listInstances 参数 → 不触发重新发现
  const msg = this.buildSubscribeMessage(this._topics!);
  await this._wsClient.sendMsgDirect(JSON.stringify(msg), false);
}
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/common/dsn.ts` | 修改 | `isAdapterHA()` 方法 + `parseDiscoveredEndpoints()` + `mergeAddresses()` |
| `src/client/clusterRegistry.ts` | **新增** | 进程级集群注册表单例（冻结存储 + 深拷贝返回） |
| `src/client/wsConnector.ts` | 修改 | 新增 `_failoverAddresses` 字段 + 构造时扩展 + `mergeDiscoveredEndpoints()` + failover 逻辑改用 `_failoverAddresses` |
| `src/client/wsClient.ts` | 修改 | `buildConnMessage` 添加 `list_instances` + `connect()` 处理响应 + 新增 `isAdapterHA()`/`mergeDiscoveredEndpoints()` 代理方法 |
| `src/tmq/wsTmq.ts` | 修改 | `buildSubscribeMessage` 添加 `list_instances` + `subscribe()` 处理响应 |

## 端点格式契约

### adapter 返回格式

| 类型 | 格式 | 示例 |
|------|------|------|
| IPv4 主机名 | `hostname:port` | `"node1:6041"` |
| IPv4 地址 | `ip:port` | `"192.168.1.1:6041"` |
| IPv6 地址 | `[ip]:port` | `"[::1]:6041"`、`"[fe80::1%25eth0]:6041"` |
| 缺省端口 | `hostname` 或 `[ip]` | `"node1"`、`"[::1]"` |

### 解析规则

1. 空字符串 / 纯空白：静默跳过
2. 以 `[` 开头：按 IPv6 格式解析 `[host]:port`；找不到 `]:` 分隔符视为缺省端口（取 `]` 之前为 host）
3. 否则按最后一个 `:` 分割为 `host:port`
4. 端口缺失：使用 `getDefaultPortForHost(host)` 确定默认端口（普通 6041、云服务 443）
5. 端口不是 1-65535 范围内的整数：记录 warn，跳过
6. 解析成功的每个端点生成独立的 `new Address(host, port)` 实例

### 日志行为

- 跳过无效端点时统一格式：`logger.warn("Adapter HA: ignoring invalid endpoint: {raw}")`
- 不抛异常，不中断对其余端点的解析

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| `list_instances` 返回空数组或 null | 忽略，不扩展，正常使用原有地址 |
| 单个端点格式无法解析 | warn 日志，跳过该端点，继续处理其余 |
| 所有发现端点都是已知的 | 不触发任何操作 |
| adapter 不支持 `list_instances` 协议 | 连接正常，响应中无此字段，忽略即可 |
| 发现的端点连不上 | 不在发现阶段验证；由 reconnect failover 逻辑处理 |
| 全局注册失败 | 理论上不会发生（Map.set 不抛异常）；即使发生，本 connector 仍有扩展后的本地地址可用于 failover |
| 种子地址跨多个已知集群 | warn 日志，拒绝扩展，返回原始种子地址深拷贝（与 Java `expandEndpointsIfKnown` 行为对齐） |

## 测试策略

### 单元测试

| 测试用例 | 文件 |
|---------|------|
| `Dsn.isAdapterHA()` 解析 `adapter_ha=true/false/缺省` | `test/common/dsn.test.ts` |
| `parseDiscoveredEndpoints()` 解析 host:port | `test/common/dsn.test.ts` |
| `parseDiscoveredEndpoints()` 解析 IPv6 `[::1]:6041` | `test/common/dsn.test.ts` |
| `parseDiscoveredEndpoints()` 缺省端口使用默认值 | `test/common/dsn.test.ts` |
| `parseDiscoveredEndpoints()` 跳过无效格式并记录 warn | `test/common/dsn.test.ts` |
| `mergeAddresses()` 去重、追加、空输入 | `test/common/dsn.test.ts` |
| `mergeAddresses()` 返回深拷贝，不修改入参 | `test/common/dsn.test.ts` |
| `ClusterRegistry.registerCluster()` 注册后 freeze、不可被外部修改 | `test/client/clusterRegistry.test.ts` |
| `ClusterRegistry.expandEndpoints()` 返回深拷贝 | `test/client/clusterRegistry.test.ts` |
| `ClusterRegistry.expandEndpoints()` 无匹配返回种子副本 | `test/client/clusterRegistry.test.ts` |
| `ClusterRegistry.expandEndpoints()` 种子跨多集群时拒绝扩展并 warn | `test/client/clusterRegistry.test.ts` |
| 多轮发现：SQL 发现 [A,B]，TMQ 发现 [A,B,C]，registry 最终包含 [A,B,C] | `test/client/clusterRegistry.test.ts` |
| 交叉发现：两个独立 connector 各自发现后，第三个 connector 从 registry 获取完整列表 | `test/client/clusterRegistry.test.ts` |
| `_failoverAddresses` 与 `_dsn.addresses` 独立性（修改前者不影响后者） | `test/client/wsConnector.test.ts` |
| Pool key 不变性：`mergeDiscoveredEndpoints()` 后 `getPoolKey()` 返回值与构造时一致 | `test/client/wsConnector.test.ts` |

### 集成测试

| 测试用例 | 条件 |
|---------|------|
| SQL 连接带 `adapter_ha=true`，验证不影响正常功能 | 需要 taosd + taosAdapter |
| TMQ subscribe 带 `adapter_ha=true`，验证不影响正常功能 | 需要 taosd + taosAdapter |

完整端点发现集成测试需要多 adapter 实例部署，属于 CI/CD 环境测试范畴。

## 与 Java 实现的差异

| 维度 | Java | Node.js |
|------|------|---------|
| 全局注册 | RebalanceManager（含负载均衡/健康检查） | ClusterRegistry（事件循环级单例，仅集群缓存，冻结存储 + 深拷贝返回） |
| 地址存储 | 直接修改 connectionParam.endpoints | 独立 _failoverAddresses，DSN 不可变 |
| 重连抑制 | 显式 `list_instances: false` | 省略字段（undefined → 不序列化） |
| 并发安全 | `synchronized` | 单线程事件循环，天然安全 |
| Pool 影响 | 多 WSClient per endpoint | Pool key 不变，仅 connector 内部扩展 |
| slaveCluster 互斥 | adapterHa + slaveCluster → 禁用发现 | Node.js 无 slaveCluster，无需处理 |
| 拓扑刷新 | 仅首次连接/subscribe 时发现 | 同 Java，本期不实现主动刷新 |
| 健康检查 | BgHealthCheck 指数退避 | 本期不实现 |
