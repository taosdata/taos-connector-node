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
| 3 | 全局集群注册 | 进程级 ClusterRegistry 单例，让新连接自动复用已知集群 |
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
- Node.js 连接器的 `WebSocketConnector` 已内置多地址 failover（`attemptReconnect()` 遍历 `dsn.addresses`），只需扩展地址列表
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
       ├── 解析新端点 → 去重 → 合并到 connector.dsn.addresses
       └── 注册到 ClusterRegistry 全局单例

2. 后续新连接 (new WebSocketConnector())
   ├── 构造时从 ClusterRegistry 查询已知集群
   ├── 扩展 dsn.addresses
   └── connector 内部拥有完整地址列表用于 failover
```

### 关键设计决策：Pool Key 不变

地址扩展只发生在 Connector 层，不影响 Pool：

```
Pool 层（不变）                        Connector 层（地址扩展）
─────────                             ──────────────────────
Pool key 始终基于用户原始 DSN    →    Connector 内部地址列表包含所有已知端点
"ws://hostA:6041/ws#auth=xxx"         dsn.addresses = [hostA, hostB, hostC]
                                      ↑ 扩展来源:
                                      1. 构造时: ClusterRegistry.expand(seeds)
                                      2. 连接后: list_instances 响应合并
```

- `WebSocketConnectionPool.getConnection()` 逻辑不变
- Pool key 始终基于用户传入 DSN 的原始地址
- Connector 的 `_poolKey` 在构造时确定，不受地址扩展影响
- 地址扩展只影响 connector 内部的 `attemptReconnect()` failover 行为

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
// 解析 adapter 返回的实例列表
export function parseDiscoveredEndpoints(instances: string[]): Address[] {
  // 支持 "host:port" 和 "[ipv6]:port" 格式
  // 跳过无效格式，记录 warn 日志
}

// 合并地址列表，按 host:port 去重
export function mergeAddresses(existing: Address[], discovered: Address[]): Address[] {
  // 将 discovered 中不存在于 existing 的地址追加到末尾
}
```

### 2. ClusterRegistry 单例 (`src/client/clusterRegistry.ts`)

```typescript
export class ClusterRegistry {
  private static _instance?: ClusterRegistry;
  private endpointToCluster: Map<string, Address[]> = new Map();

  static instance(): ClusterRegistry;

  // 注册集群：所有地址互相指向同一个完整列表
  registerCluster(addresses: Address[]): void {
    const snapshot = [...addresses];
    for (const addr of snapshot) {
      this.endpointToCluster.set(`${addr.host}:${addr.port}`, snapshot);
    }
  }

  // 用种子地址查询已知集群，返回合并后的地址列表
  expandEndpoints(seeds: Address[]): Address[] {
    for (const seed of seeds) {
      const cluster = this.endpointToCluster.get(`${seed.host}:${seed.port}`);
      if (cluster) {
        return mergeAddresses(seeds, cluster);
      }
    }
    return seeds;
  }
}
```

### 3. WebSocketConnector 变更 (`src/client/wsConnector.ts`)

**构造时扩展地址**：

```typescript
constructor(dsn: Dsn, poolKey: string, timeout?: number | null) {
  // ... 现有逻辑 ...

  // 新增：如果启用 adapter HA，从 ClusterRegistry 扩展地址
  if (dsn.isAdapterHA()) {
    const expanded = ClusterRegistry.instance().expandEndpoints(dsn.addresses);
    if (expanded.length > dsn.addresses.length) {
      this._dsn.addresses = expanded;
      logger.info(`Adapter HA: expanded seed endpoints from registry, ${dsn.addresses.length} → ${expanded.length}`);
    }
  }

  this._currentAddress = this.selectLeastConnectedAddress();
  // ...
}
```

**新增合并方法**：

```typescript
// 供 WsClient/WsConsumer 调用
mergeDiscoveredEndpoints(instances: string[]): void {
  if (!this._dsn.isAdapterHA() || !instances || instances.length === 0) {
    return;
  }
  const discovered = parseDiscoveredEndpoints(instances);
  const merged = mergeAddresses(this._dsn.addresses, discovered);
  if (merged.length > this._dsn.addresses.length) {
    this._dsn.addresses = merged;
    ClusterRegistry.instance().registerCluster(merged);
    logger.info(`Adapter HA: discovered ${discovered.length} endpoint(s), merged to ${merged.length} total`);
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
  // 不传 listInstances 参数 → 消息中不出现 list_instances 字段
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
  // 不传 listInstances 参数
  const msg = this.buildSubscribeMessage(this._topics!);
  await this._wsClient.sendMsgDirect(JSON.stringify(msg), false);
}
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/common/dsn.ts` | 修改 | `isAdapterHA()` 方法 + `parseDiscoveredEndpoints()` + `mergeAddresses()` |
| `src/client/clusterRegistry.ts` | **新增** | 进程级集群注册表单例 |
| `src/client/wsConnector.ts` | 修改 | 构造时扩展地址 + `mergeDiscoveredEndpoints()` 方法 |
| `src/client/wsClient.ts` | 修改 | `buildConnMessage` 添加 `list_instances` + `connect()` 处理响应 + 新增 `isAdapterHA()`/`mergeDiscoveredEndpoints()` 代理方法 |
| `src/tmq/wsTmq.ts` | 修改 | `buildSubscribeMessage` 添加 `list_instances` + `subscribe()` 处理响应 |

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| `list_instances` 返回空数组或 null | 忽略，不扩展，正常使用原有地址 |
| 单个端点格式无法解析 | warn 日志，跳过该端点，继续处理其余 |
| 所有发现端点都是已知的 | 不触发任何操作 |
| adapter 不支持 `list_instances` 协议 | 连接正常，响应中无此字段，忽略即可 |
| 发现的端点连不上 | 不在发现阶段验证；由 reconnect failover 逻辑处理 |

## 测试策略

### 单元测试

| 测试用例 | 文件 |
|---------|------|
| `Dsn.isAdapterHA()` 解析 `adapter_ha=true/false/缺省` | `test/common/dsn.test.ts` |
| `parseDiscoveredEndpoints()` 解析 host:port、IPv6、无效格式 | `test/common/dsn.test.ts` |
| `mergeAddresses()` 去重、追加、空输入 | `test/common/dsn.test.ts` |
| `ClusterRegistry` 注册、扩展、无匹配返回原样 | `test/client/clusterRegistry.test.ts` |

### 集成测试

| 测试用例 | 条件 |
|---------|------|
| SQL 连接带 `adapter_ha=true`，验证不影响正常功能 | 需要 taosd + taosAdapter |
| TMQ subscribe 带 `adapter_ha=true`，验证不影响正常功能 | 需要 taosd + taosAdapter |

完整端点发现集成测试需要多 adapter 实例部署，属于 CI/CD 环境测试范畴。

## 与 Java 实现的差异

| 维度 | Java | Node.js |
|------|------|---------|
| 全局注册 | RebalanceManager（含负载均衡/健康检查） | ClusterRegistry（仅集群缓存） |
| 重连抑制 | 显式 `list_instances: false` | 省略字段（undefined → 不序列化） |
| 并发安全 | `synchronized` | 单线程事件循环，天然安全 |
| Pool 影响 | 多 WSClient per endpoint | Pool key 不变，仅 connector 内部扩展 |
| slaveCluster 互斥 | adapterHa + slaveCluster → 禁用发现 | Node.js 无 slaveCluster，无需处理 |
| 健康检查 | BgHealthCheck 指数退避 | 本期不实现 |
