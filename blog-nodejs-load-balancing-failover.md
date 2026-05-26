# TDengine Node.js 连接器的负载均衡与 Failover 实现

> 本文基于 `taos-connector-node` 真实代码讲解 Node.js 连接器如何在多 taosadapter 部署场景下实现负载均衡与故障自动恢复，所有示例均可直接运行。

---

## 一、背景

在工业物联网、能源监控、金融时序等场景中，TDengine 通常以集群方式部署，应用通过 **taosadapter** 的 WebSocket 接口接入。典型拓扑如下：

```
Node.js 应用
    │
    ├─── taosadapter-A:6041 ─┐
    ├─── taosadapter-B:6041 ─┼─► TDengine 集群
    └─── taosadapter-C:6041 ─┘
```

这种架构带来两个核心诉求：

1. **负载均衡**：多个 adapter 实例应该均匀承接连接，避免单点过载。
2. **Failover**：当某个 adapter 实例重启或短时不可用时，业务不应中断，连接器应自动切换并恢复。

在 `taos-connector-node` v3.1.x 之前，连接器只支持单地址 DSN，任何 adapter 重启都会导致写入或消费中断，需要人工介入重启应用。新版本从根本上解决了这一问题——不需要改变应用代码，仅通过 DSN 配置即可获得负载均衡与 Failover 能力。

---

## 二、业务价值

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| adapter 实例滚动重启 | 写入中断，需人工重启应用 | 自动切换到可用地址，写入持续 |
| 单实例闪断（< 30s） | 所有 in-flight 请求失败 | 自动重连并重放可恢复请求 |
| 新增 adapter 实例扩容 | 旧连接不感知，流量不均衡 | 最少连接策略，新连接自动分配到空闲实例 |
| TMQ 消费链路抖动 | 消费者停止，需手动重启 | 自动 re-subscribe，消费继续推进 |

核心价值在于：**把"故障事件"降级为"可恢复的短暂波动"**，让业务连续性不再依赖人工干预。

---

## 三、技术细节

### 3.1 多地址 DSN 解析

DSN 解析器（`src/common/dsn.ts`）支持逗号分隔的多主机格式，例如 `ws://user:pass@adapter-a:6041,adapter-b:6041,[::1]:6041/dbname?retries=5`。解析结果保存为地址列表，所有后续选址和重连逻辑都从该列表中取址。

连接池键（pool key）会先对地址列表排序再构建，保证地址顺序不同的等价 DSN 始终命中同一个连接池。认证信息（username/password/token）经 SHA-256 单独哈希后附在 pool key 末尾，使不同认证身份的连接自然隔离，不会误用彼此的池。

### 3.2 最少连接负载均衡

`AddressConnectionTracker`（`src/common/addressConnectionTracker.ts`）是一个进程级单例，追踪每个地址的当前活跃连接数。新建连接或重连选址时，优先选择连接数最少的地址，若多个地址并列最少则随机打散，避免惊群效应。每次 WebSocket `onopen` 时计数 +1，连接关闭时计数 -1，确保计数始终与实际状态同步。

这个机制让流量天然均摊到所有 adapter 实例上，不需要外部负载均衡器介入。

### 3.3 指数退避重试

重试参数通过 DSN query string 传入，连接器从 `retries`、`retry_backoff_ms`、`retry_backoff_max_ms` 三个参数构建退避策略，默认值分别为 `5 / 200ms / 2000ms`。每次失败后等待时间按 `backoff_ms × 2^attempt` 计算，并以 `backoff_max_ms` 封顶。以默认值为例，各次重试间隔依次为：200ms → 400ms → 800ms → 1600ms → 2000ms（上限截断），短暂抖动通常在第一两次重试内即可恢复，不会在业务层产生明显感知。

### 3.4 重连去重（Reconnect Lock）

网络抖动瞬间，`_inflightStore` 中的多个 in-flight 请求可能同时检测到连接断开并触发重连，若不加控制会产生雪崩式并发重连。连接器通过 `_reconnectLock` 将这些并发触发合并：第一个触发者负责创建并持有重连 Promise，后续触发者直接 `await` 同一个 Promise，重连完成后所有等待者一起返回。无论并发多少，整个过程只有一次实际的重连流程在运行。

### 3.5 多地址切换策略

重连时采用两层嵌套策略：外层遍历所有可用地址，内层对当前地址执行最多 `retries` 次退避重试。若当前地址在 `retries` 次之内成功，立即进入会话恢复和请求重放；若耗尽重试仍失败，则将该地址标记为已失败，从剩余地址中再次按最少连接原则选出下一个目标继续尝试。直到所有地址均失败才向上抛出错误，此时已超出所有容错预算。

### 3.6 会话恢复（Session Recovery Hook）

重新建立 WebSocket 连接之后，仅恢复 socket 是不够的——服务端的认证上下文、数据库选择、connection options 都随连接消失了。`WsClient` 通过注册 `SessionRecoveryHook` 实现会话级恢复，这一步是"网络恢复"升级为"业务恢复"的关键：

- **SQL 路径**：重新发送 `conn` 消息（含用户名/密码/目标数据库），若之前通过 `options_connection` 设置了连接级选项，则一并重放，最后调用 `markSessionReady()` 标记会话就绪，后续请求才能正常下发。
- **TMQ 路径**：`WsConsumer` 在每次 `subscribe()` 调用时记录已订阅的 topics 列表，重连后自动重新发送订阅消息，消费循环无需感知任何中断。

### 3.7 In-flight 请求重放

会话恢复完成后，连接器按原始发送顺序（`msgId` 递增）重放 `_inflightStore` 中保留的可重试请求。可重试的操作被严格限定在幂等或安全动作范围内，包括：`insert`、`options_connection`、`poll`、`subscribe` 以及对应的二进制操作码。不在列表中的操作（如 `query`）会在断连瞬间立即失败，交给上层业务显式处理，避免因重复执行产生不可预期的副作用。

---

## 四、实战：配置与使用

### 前置条件

- 已安装 Node.js 16.x 或 20.x
- 已部署并启动 TDengine 和 taosadapter（至少 1 个实例，多实例时按实际地址替换）

```bash
cd nodejs
npm install
```

### 4.1 SQL 写入与查询

```typescript
// example/ha-sql-demo.ts
import { WSConfig, sqlConnect } from "@tdengine/websocket";

async function main() {
    // 多地址 DSN，指定重试参数
    const dsn =
        "ws://root:taosdata@localhost:6041" +
        "?retries=10&retry_backoff_ms=100&retry_backoff_max_ms=2000";

    const conf = new WSConfig(dsn);
    conf.setDb("test");

    const wsSql = await sqlConnect(conf);

    // 建表
    await wsSql.exec(
        "CREATE TABLE IF NOT EXISTS test.sensors " +
        "(ts TIMESTAMP, temperature FLOAT, humidity FLOAT)"
    );

    // 写入数据
    for (let i = 0; i < 10; i++) {
        await wsSql.exec(
            `INSERT INTO test.sensors VALUES(NOW + ${i}s, ${20 + i * 0.5}, ${60 + i})`
        );
    }

    // 查询验证
    const result = await wsSql.query("SELECT COUNT(*) FROM test.sensors");
    const rows = await result.fetchAll();
    console.log("写入行数:", rows.length > 0 ? rows[0][0] : 0);

    await wsSql.close();
}

main().catch(console.error);
```

多 adapter 场景只需修改 DSN 中的地址列表：

```typescript
const dsn =
    "ws://root:taosdata@adapter-a:6041,adapter-b:6041,adapter-c:6041" +
    "?retries=10&retry_backoff_ms=100&retry_backoff_max_ms=2000";
```

连接器会自动选择连接数最少的地址建立 WebSocket，任一 adapter 故障时无缝切换。

### 4.2 TMQ 消费

```typescript
// example/ha-tmq-demo.ts
import { tmqConnect } from "@tdengine/websocket";
import { TMQConstants } from "@tdengine/websocket";

async function main() {
    const tmqConf = new Map<string, string>([
        [TMQConstants.GROUP_ID, `group_ha_demo`],
        [TMQConstants.CLIENT_ID, `client_ha_demo`],
        [TMQConstants.CONNECT_USER, "root"],
        [TMQConstants.CONNECT_PASS, "taosdata"],
        [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
        [TMQConstants.ENABLE_AUTO_COMMIT, "false"],
        [TMQConstants.AUTO_COMMIT_INTERVAL_MS, "1000"],
        [
            TMQConstants.WS_URL,
            // 多地址 + 高重试参数，确保消费链路在 adapter 滚动重启时不中断
            "ws://root:taosdata@localhost:6041" +
            "?retries=60&retry_backoff_ms=50&retry_backoff_max_ms=1000",
        ],
    ]);

    const consumer = await tmqConnect(tmqConf);
    await consumer.subscribe(["topic_sensors"]);

    console.log("开始消费，按 Ctrl+C 停止...");
    let totalRows = 0;
    while (true) {
        const messages = await consumer.poll(500);
        for (const [topic, result] of messages) {
            const rows = result.getData();
            totalRows += rows.length;
            console.log(`[${topic}] 本次消费 ${rows.length} 行，累计 ${totalRows} 行`);
        }
        await consumer.commit();
    }
}

main().catch(console.error);
```

当 adapter 重启时，`WsConsumer` 内部会自动重连，并通过 `recoverSessionContext()` 重新执行订阅，消费循环无需感知任何中断。

### 4.3 重试参数调优建议

| 参数 | 默认值 | 建议 |
|------|--------|------|
| `retries` | 5 | 写入链路 10~20，消费链路 30~60 |
| `retry_backoff_ms` | 200ms | 高频写入场景可调低到 50~100ms |
| `retry_backoff_max_ms` | 2000ms | 不超过业务超时时长的 50% |

---

## 五、验证：测试覆盖的 Failover 场景

仓库中的集成测试（`nodejs/test/client/wsConnector.failover.test.ts`）验证了以下关键路径：

- **多地址切换**：活跃 adapter 不可用后，自动切换到备用地址继续执行。
- **重连去重**：并发触发的多个重连请求只产生一次实际重连，不会造成连接风暴。
- **SQL 会话恢复**：重连后认证上下文与目标数据库自动恢复，无需应用代码干预。
- **TMQ 订阅恢复**：重连后已订阅的 topics 自动重新订阅，消费不停止。

---

## 六、总结

`taos-connector-node` 通过以下五层机制，将 WebSocket 断线从"业务中断事件"变成了"透明恢复的网络波动"：

1. **多地址 DSN**：一行配置声明所有 adapter 地址，无需应用层感知集群拓扑。
2. **最少连接选址**：`AddressConnectionTracker` 实时追踪各地址连接数，新建连接和重连均优先选空闲实例，天然实现负载均衡。
3. **指数退避重试**：通过 DSN 参数灵活控制重试次数和退避节奏，匹配不同业务的容忍时限。
4. **重连去重锁**：`_reconnectLock` 保证并发断线场景下只有一个重连流程运行，避免连接风暴。
5. **会话恢复 + 请求重放**：重连成功后自动重建认证上下文（SQL）或重新订阅（TMQ），并按序重放可重试的 in-flight 请求。

对于生产环境，建议至少部署 2 个 taosadapter 实例，DSN 中配置多地址，并根据实际业务 SLA 调整 `retries` 与退避参数。写入链路同时建议设计幂等主键，以规避极端情况下请求重放导致的重复写入。

---

## 参考资料

- taos-connector-node 仓库：<https://github.com/taosdata/taos-connector-node>
- taosadapter 仓库：<https://github.com/taosdata/taosadapter>
- TDengine 文档 - Node.js 连接器：<https://docs.tdengine.com/reference/connector/node/>
- 核心实现文件：
  - [nodejs/src/common/dsn.ts](nodejs/src/common/dsn.ts) — 多地址 DSN 解析
  - [nodejs/src/common/addressConnectionTracker.ts](nodejs/src/common/addressConnectionTracker.ts) — 最少连接选址
  - [nodejs/src/client/wsConnector.ts](nodejs/src/client/wsConnector.ts) — 重连、退避、请求重放
  - [nodejs/src/client/wsClient.ts](nodejs/src/client/wsClient.ts) — SQL 会话恢复
  - [nodejs/src/tmq/wsTmq.ts](nodejs/src/tmq/wsTmq.ts) — TMQ 订阅恢复
