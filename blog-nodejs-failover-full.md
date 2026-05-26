# TDengine Node.js 连接器负载均衡与 Failover：从实现到实战

> 在工业数据场景里，真正影响业务的往往不是"偶发断线"，而是断线后的写入中断、消费停滞与人工补数。本文基于 `taos-connector-node` 的真实实现与测试用例，完整拆解 Node.js 连接器如何在 taosadapter 上实现负载均衡与 Failover——既讲清楚"怎么做的"，也给出"怎么用"。

---

## 1. 背景与目标

TDengine 在工业物联网、能源监控、金融时序等场景中通常以集群方式部署，应用通过 **taosadapter** 的 WebSocket 接口接入。典型链路是：

```
Node.js 应用
    │
    ├─── taosadapter-A:6041 ─┐
    ├─── taosadapter-B:6041 ─┼─► TDengine 集群
    └─── taosadapter-C:6041 ─┘
```

taosadapter 是 TDengine 与应用之间的桥接层，语言连接器通过 WebSocket 与之通信。当只有单个 adapter 或应用只配置单地址时，任何 adapter 重启都会导致写入中断或消费停滞，必须人工介入。

这种架构带来两个核心诉求：

1. **负载均衡**：多个 adapter 实例应均匀承接连接，避免单点过载。
2. **Failover**：adapter 实例重启或短时不可用时，业务请求应自动恢复，SQL 写入、Stmt2 参数化写入、TMQ 消费链路都能持续推进。

目标不是"连接永不断"，而是：**把故障从"中断事件"变成"可恢复波动"，尽量避免数据丢失和人工干预。**

在 `taos-connector-node` 新版本中，这些能力已内置在连接器内部——不需要改变应用代码，仅通过 DSN 配置即可获得负载均衡与 Failover 能力。

---

## 2. 业务价值

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| adapter 实例滚动重启 | 写入中断，需人工重启应用 | 自动切换到可用地址，写入持续 |
| 单实例闪断（< 30s） | 所有 in-flight 请求失败 | 自动重连并重放可恢复请求 |
| 新增 adapter 实例扩容 | 旧连接不感知，流量不均衡 | 最少连接策略，新连接自动分配到空闲实例 |
| TMQ 消费链路抖动 | 消费者停止，需手动重启 | 自动 re-subscribe，消费继续推进 |

从交付与运维视角看：

- **稳定性**：将"实例重启 = 业务中断"降级为"短暂抖动后自动恢复"；
- **连续性**：写入与消费链路不中断，告警与看板数据更完整；
- **运维成本**：减少人工重启、补数与故障窗口沟通；
- **可扩展性**：多地址策略天然支持后续扩容与流量分摊。

---

## 3. 技术方案：连接器内部如何实现

整个方案由七个机制协同工作，覆盖"选址 → 连接 → 断线检测 → 重连 → 恢复 → 重放"全链路。

### 3.1 多地址 DSN + 连接池隔离

Node 连接器的 DSN 解析器支持逗号分隔的多主机格式：

```text
ws://user:pass@adapter-a:6041,adapter-b:6041,[::1]:6041/dbname?retries=5
```

解析结果保存为地址列表，所有后续选址和重连逻辑都从该列表中取址。

连接池键（pool key）会先对地址列表**排序**再构建，保证地址顺序不同的等价 DSN 始终命中同一个连接池。认证信息（username/password/token）经 SHA-256 单独哈希后附在 pool key 末尾，使不同认证身份的连接自然隔离，不会误用彼此的池。

### 3.2 最少连接选址

`AddressConnectionTracker` 是一个进程级单例，追踪每个地址的当前活跃连接数。新建连接或重连选址时，优先选择连接数最少的地址；若多个地址并列最少，则随机打散，避免惊群效应。每次 WebSocket `onopen` 时计数 +1，连接关闭时计数 -1，确保计数始终与实际状态同步。

这个机制让流量天然均摊到所有 adapter 实例上，不需要外部负载均衡器介入。

### 3.3 指数退避重试（DSN 可配置）

连接器从 DSN 读取三个参数来构建退避策略：

- `retries`（默认 5）
- `retry_backoff_ms`（默认 200ms）
- `retry_backoff_max_ms`（默认 2000ms）

每次失败后等待时间按 `backoff_ms × 2^attempt` 计算，并以 `backoff_max_ms` 封顶。以默认值为例，各次重试间隔依次为：200ms → 400ms → 800ms → 1600ms → 2000ms（上限截断）。短暂抖动通常在前一两次重试内即可恢复，不会在业务层产生明显感知。

### 3.4 重连去重（Reconnect Lock）

网络抖动瞬间，多个 in-flight 请求可能同时检测到连接断开并触发重连，若不加控制会产生雪崩式并发重连。连接器通过 `_reconnectLock` 将这些并发触发合并：第一个触发者负责创建并持有重连 Promise，后续触发者直接 `await` 同一个 Promise，重连完成后所有等待者一起返回。无论并发多少，整个过程只有一次实际的重连流程在运行。

### 3.5 多地址切换策略

重连时采用两层嵌套策略：外层遍历所有可用地址，内层对当前地址执行最多 `retries` 次退避重试。若当前地址在 `retries` 次之内成功，立即进入会话恢复和请求重放；若耗尽重试仍失败，则将该地址标记为已失败，从剩余地址中再次按最少连接原则选出下一个目标继续尝试。直到所有地址均失败才向上抛出错误，此时已超出所有容错预算。

### 3.6 会话恢复（Session Recovery Hook）

重新建立 WebSocket 连接之后，仅恢复 socket 是不够的——服务端的认证上下文、数据库选择、connection options 都随连接消失了。连接器通过注册 `SessionRecoveryHook` 实现会话级恢复，这一步是"网络恢复"升级为"业务恢复"的关键：

- **SQL 路径**：重新发送 `conn` 消息（含用户名/密码/目标数据库），若之前通过 `options_connection` 设置了连接级选项，则一并重放，最后标记会话就绪，后续请求才能正常下发。
- **TMQ 路径**：`WsConsumer` 在每次 `subscribe()` 调用时记录已订阅的 topics 列表，重连后自动重新发送订阅消息，消费循环无需感知任何中断。

### 3.7 In-flight 请求重放

会话恢复完成后，连接器按原始发送顺序重放保留的可重试请求。可重试的操作被严格限定在幂等或安全动作范围内：`insert`、`options_connection`、`poll`、`subscribe` 以及对应的二进制操作码。不在列表中的操作（如 `query`）会在断连瞬间立即失败，交给上层业务显式处理，避免因重复执行产生不可预期的副作用。

这意味着：可重试请求尽量自动续传；不可重试请求快速失败，交给上层显式处理。

---

## 4. 实战配置

### 前置条件

- 已安装 Node.js 16.x 或 20.x
- 已部署并启动 TDengine 和 taosadapter（至少 1 个实例，多实例时按实际地址替换）

```bash
npm install @tdengine/websocket
```

### 4.1 SQL 写入与查询

```typescript
import { WSConfig, sqlConnect } from "@tdengine/websocket";

async function main() {
    // DSN 中配置多地址与重试参数
    const dsn =
        "ws://root:taosdata@adapter-a:6041,adapter-b:6041,adapter-c:6041" +
        "?retries=10&retry_backoff_ms=100&retry_backoff_max_ms=2000";

    const conf = new WSConfig(dsn);
    conf.setDb("power");
    conf.setTimeOut(10000);

    const wsSql = await sqlConnect(conf);

    // 建库建表
    await wsSql.exec("CREATE DATABASE IF NOT EXISTS power");
    await wsSql.exec(
        "CREATE TABLE IF NOT EXISTS power.sensors " +
        "(ts TIMESTAMP, temperature FLOAT, humidity FLOAT)"
    );

    // 写入数据——即使中途 adapter 重启，insert 作为可重试操作会自动重放
    for (let i = 0; i < 100; i++) {
        await wsSql.exec(
            `INSERT INTO power.sensors VALUES(NOW + ${i}s, ${20 + i * 0.1}, ${60 + i % 20})`
        );
    }

    // 查询验证
    const result = await wsSql.query("SELECT COUNT(*) AS cnt FROM power.sensors");
    const rows = await result.fetchAll();
    console.log("写入行数:", rows[0][0]);

    await wsSql.close();
}

main().catch(console.error);
```

单 adapter 场景同样适用，DSN 中只写一个地址即可：

```typescript
const dsn = "ws://root:taosdata@localhost:6041?retries=10&retry_backoff_ms=100&retry_backoff_max_ms=2000";
```

### 4.2 TMQ 消费

```typescript
import { tmqConnect } from "@tdengine/websocket";
import { TMQConstants } from "@tdengine/websocket";

async function main() {
    const tmqConf = new Map<string, string>([
        [TMQConstants.GROUP_ID, "group_ha_demo"],
        [TMQConstants.CLIENT_ID, "client_ha_demo"],
        [TMQConstants.CONNECT_USER, "root"],
        [TMQConstants.CONNECT_PASS, "taosdata"],
        [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
        [TMQConstants.ENABLE_AUTO_COMMIT, "false"],
        [TMQConstants.AUTO_COMMIT_INTERVAL_MS, "1000"],
        [
            TMQConstants.WS_URL,
            // 消费链路建议更高 retries，确保 adapter 滚动重启时不中断
            "ws://root:taosdata@adapter-a:6041,adapter-b:6041,adapter-c:6041" +
            "?retries=60&retry_backoff_ms=50&retry_backoff_max_ms=1000",
        ],
    ]);

    const consumer = await tmqConnect(tmqConf);
    await consumer.subscribe(["topic_power"]);

    console.log("开始消费...");
    let totalRows = 0;
    while (true) {
        const messages = await consumer.poll(500);
        for (const [topic, result] of messages) {
            const rows = result.getData();
            totalRows += rows.length;
            console.log(`[${topic}] 本次 ${rows.length} 行，累计 ${totalRows} 行`);
        }
        await consumer.commit();
    }
}

main().catch(console.error);
```

当 adapter 重启时，`WsConsumer` 内部自动重连，通过 Session Recovery Hook 重新执行订阅。上层消费循环中的 `poll()` 会在重连完成后继续返回新数据，无需任何额外处理。

### 4.3 重试参数调优

| 参数 | 默认值 | 建议 | 说明 |
|------|--------|------|------|
| `retries` | 5 | 写入 10~20，消费 30~60 | 消费链路容忍更长中断 |
| `retry_backoff_ms` | 200ms | 高频写入可降至 50~100ms | 首次重试延迟 |
| `retry_backoff_max_ms` | 2000ms | 不超过业务超时的 50% | 退避上限 |

核心原则：按业务容忍时长调参数，不要照搬默认值。消费场景可以接受更长恢复窗口，写入场景则需要更快重试。

---

## 5. 结果验证

以下是仓库 failover 自动化测试中覆盖的场景，不是"理论可行"，而是"测试可复现"：

### SQL 路径

1. **双地址切换**：活跃 adapter 短时重启（如 800ms downtime）后，自动切到下一地址继续执行。
2. **单地址重连**：同地址硬重启后自动恢复。
3. **随机重启压力**：随机重启过程中插入 5000 行，最终 `count(*) = 5000`，一行不少。

### Stmt2 路径

4. **分阶段故障注入**：在 `init / prepare / bind / exec / result` 任一阶段注入故障，流程可恢复。
5. **随机重启 + 参数化写入**：5000 行全部完整写入。

### TMQ 路径

6. **订阅恢复**：重连后自动恢复订阅上下文并继续 poll。
7. **多地址消费**：单地址与三地址场景都可消费完 5000 行。

### 连接层

8. **重连去重**：并发触发的多个重连请求只产生一次实际重连，不会造成连接风暴。
9. **会话恢复**：重连后认证上下文与目标数据库自动恢复，无需应用代码干预。

---

## 6. 落地建议（上线前清单）

1. **多实例部署**：至少部署 2 个 taosadapter 实例，并在 DSN 中配置多地址。
2. **参数调优**：按业务容忍时长调 `retries / backoff`，写入与消费分别设置。
3. **幂等设计**：写入链路优先设计幂等键（如时间戳 + 设备 ID），降低重放带来的重复写风险。
4. **监控覆盖**：监控重连次数、地址切换次数、消费延迟与失败动作分布。
5. **演练验证**：在预发环境做"随机重启演练"——SQL / Stmt2 / TMQ 各跑一次，确认恢复符合预期。

---

## 7. 总结

`taos-connector-node` 通过七层机制协同工作，将 WebSocket 断线从"业务中断事件"变成了"透明恢复的网络波动"：

| 层次 | 机制 | 解决的问题 |
|------|------|-----------|
| 选址 | 多地址 DSN 解析 | 一行配置声明所有 adapter 地址 |
| 均衡 | 最少连接选址 | 流量均摊，不需要外部 LB |
| 重试 | 指数退避 | 匹配不同业务的容忍时限 |
| 防雪崩 | Reconnect Lock | 并发断线只产生一次重连 |
| 切换 | 多地址遍历 | 当前地址不可用时自动换下一个 |
| 恢复 | Session Recovery Hook | 重建认证/数据库上下文/订阅 |
| 续传 | In-flight 请求重放 | 可重试请求自动续传 |

对于生产环境，核心建议只有三条：**多实例部署、按 SLA 调参、写入设计幂等**。做到这三点，Node 应用在 taosadapter 上的负载均衡与 Failover 就是开箱即用的——把故障从"中断事件"变成"可恢复波动"，这正是工业数据平台走向生产稳定所必须的基础能力。

---

## 参考资料

- taos-connector-node 仓库：<https://github.com/taosdata/taos-connector-node>
- taosadapter 仓库：<https://github.com/taosdata/taosadapter>
- TDengine 文档 - Node.js 连接器：<https://docs.tdengine.com/reference/connector/node/>
- 相关 PR：
  - PR #109: `feat: impl load balancing and failover`
  - PR #110: `session recovery hooks / TMQ enhancement`
  - PR #111: `WsStmt2 failover handling`
