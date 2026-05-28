# Cluster 类型设计：将地址数组提升为集群概念

**日期:** 2026-05-28
**状态:** 已审核

## 问题陈述

当前 `ClusterRegistry` 使用 `Map<string, readonly Address[]>` 存储集群信息，集群身份通过冻结数组的引用相等性隐式判断。这存在以下问题：

1. 集群没有显式身份标识（ID），不利于日志追踪和调试
2. 无法将集群 ID 用于连接池 key，导致 HA 模式下 pool key 生成依赖地址排序拼接
3. 引用相等性判断脆弱，不如显式 ID 比较清晰

## 设计方案

### 1. Cluster 类

在 `clusterRegistry.ts` 中新增 `Cluster` 类：

```typescript
export class Cluster {
    readonly id: string;                    // UUID，创建后不变
    private _addresses: readonly Address[];

    constructor(addresses: Address[]) {
        this.id = crypto.randomUUID();
        this._addresses = Cluster.freezeAddresses(addresses);
    }

    get addresses(): readonly Address[] {
        return this._addresses;
    }

    addAddresses(newAddresses: Address[]): void {
        const merged = mergeAddresses([...this._addresses], newAddresses);
        this._addresses = Cluster.freezeAddresses(merged);
    }

    private static freezeAddresses(addrs: Address[]): readonly Address[] {
        return Object.freeze(
            addrs.map(a => Object.freeze(new Address(a.host, a.port)))
        );
    }
}
```

**设计决策：**

- `id` 使用 `crypto.randomUUID()` 生成（Node.js 16+ 原生支持），创建后不可变
- `addresses` 保持冻结快照语义，与现有行为一致
- `addAddresses()` 使用现有 `mergeAddresses` 函数合并去重，支持端点发现后动态扩展地址列表
- 同一集群多次更新地址时 UUID 保持不变

### 2. ClusterRegistry 改造

`endpointToCluster` 值类型从 `readonly Address[]` 变为 `Cluster`。

#### 新增方法：`getOrCreateCluster(seeds): Cluster | null`

供 `WebSocketConnectionPool.getPoolKey()` 调用：

- 如果 seeds 中所有匹配地址均指向同一个已知集群 → 返回该集群（不修改其地址列表）
- 如果 seeds 中的地址跨越多个已知集群 → 返回 `null`，打 warn 日志，调用方回退到地址拼接方式
- 如果没有匹配 → 创建新 Cluster，映射 seed 地址，返回

#### 修改方法：`registerCluster(addresses)` → 返回 `Cluster`

端点发现后调用：

- 查找已有集群（通过地址重叠） → 调用 `addAddresses()` 扩展 → 更新映射 → 返回
- 未找到 → 创建新集群 → 返回

#### `expandEndpoints(seeds)` 行为不变

- 跨集群判断从引用相等 (`matchedCluster !== cluster`) 改为 `matched.id !== cluster.id`
- 对外返回值和语义完全不变

### 3. Pool Key 生成改造

`WebSocketConnectionPool.getPoolKey(dsn)` 变更：

```
if (dsn.isAdapterHA()):
    cluster = ClusterRegistry.instance().getOrCreateCluster(dsn.addresses)
    if (cluster !== null):
        pool key = "${scheme}://${cluster.id}/${path}#auth=${authHash}"
    else:
        // seeds 跨集群，回退到地址拼接方式
        pool key = 排序地址拼接方式
else:
    pool key = 现有的排序地址拼接方式（不变）
```

**时序保证：**

1. 第一个 HA 连接：`getPoolKey()` → `getOrCreateCluster([seed1])` → 创建 Cluster(uuid-1) → pool key 含 uuid-1
2. 端点发现：`mergeDiscoveredEndpoints` → `registerCluster([seed1, node2, node3])` → 找到 uuid-1 → 扩展地址
3. 第二个连接：`getPoolKey()` → `getOrCreateCluster([seed1])` → 找到 uuid-1 → pool key 一致 → 可复用连接池

### 4. 删除 `_failoverAddresses`，直接使用 `dsn.addresses`

**决策：** 删除 `WebSocketConnector` 中的 `_failoverAddresses` 字段，端点扩展和发现直接修改 `dsn.addresses`。

**改造逻辑：**
- 构造函数中删除 `_failoverAddresses` 的初始化拷贝
- `expandEndpoints` 的结果直接写回 `dsn.addresses`
- `mergeDiscoveredEndpoints` 中合并结果直接更新 `dsn.addresses`
- 所有引用 `_failoverAddresses` 的地方改为 `this._dsn.addresses`

**影响分析：**
- HA 模式 pool key 基于 cluster ID，不受 `dsn.addresses` 变化影响
- 非 HA 模式下 `mergeDiscoveredEndpoints` 直接 return（不修改地址），pool key 不受影响
- 跨集群回退到地址拼接的场景属于异常情况，可接受 pool key 变化作为兜底行为
- `WsClient.ready()` 再次获取连接时使用扩展后的地址，实际上是有益的

### 5. 调用方影响

| 文件 | 改动范围 |
|------|---------|
| `clusterRegistry.ts` | 新增 `Cluster` 类；改造 `ClusterRegistry`（新增 `getOrCreateCluster`，`registerCluster` 返回 `Cluster`，`expandEndpoints` 用 ID 比较） |
| `wsConnectorPool.ts` | `getPoolKey()` 在 HA 模式下使用 cluster ID；导入 `ClusterRegistry` |
| `wsConnector.ts` | 删除 `_failoverAddresses`，所有引用改为 `this._dsn.addresses`；`expandEndpoints` 和 `mergeDiscoveredEndpoints` 的结果直接写回 `dsn.addresses` |
| `clusterRegistry.test.ts` | 适配 `Cluster` 类型；新增 `getOrCreateCluster` 和 `addAddresses` 测试 |

### 6. 不变的部分

- `Address` 类、`Dsn` 类、`mergeAddresses`、`parseDiscoveredEndpoints` 均不变
- 非 HA 连接的 pool key 生成逻辑不变
- `expandEndpoints` 的对外行为和返回值不变
- 现有的凭据脱敏机制不变

### 7. 测试计划

**适配现有测试：**
- `endpointToCluster` 值验证改为通过 `cluster.addresses` 访问
- 冻结语义验证保持
- `wsConnector` 相关测试中删除 `_failoverAddresses` 引用

**新增测试用例：**
1. `getOrCreateCluster` 对已有集群返回相同 UUID
2. `getOrCreateCluster` 对全新地址创建新 UUID
3. `registerCluster` 复用已有 Cluster UUID 并通过 `addAddresses` 扩展地址
4. `addAddresses` 正确合并去重
5. 跨集群判断使用 `cluster.id` 而非引用相等
6. HA 模式 pool key 包含 cluster UUID
7. 非 HA 模式 pool key 保持地址排序拼接
8. 删除 `_failoverAddresses` 后 `dsn.addresses` 正确更新
