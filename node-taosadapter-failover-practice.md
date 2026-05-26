# Node 在 taosadapter 上的 Failover 实战：把“断线重连”做成“业务无感”

在工业数据场景里，真正影响业务的往往不是“偶发断线”，而是断线后的**写入中断、消费停滞、人工补数**。这篇文章基于 `taos-connector-node` 的真实实现与测试用例，拆解 Node 应用如何在 taosadapter 上实现 failover，并把风险控制在业务可接受范围内。

## 1. 场景与目标

典型链路是：**Node 应用 → taosadapter(WebSocket) → TDengine**。  
目标不是“连接不断”，而是：

1. taosadapter 实例重启/短时不可用时，业务请求可自动恢复；
2. SQL 写入、Stmt2、TMQ 消费链路都能持续推进；
3. 尽量避免数据丢失和人工干预。

> taosadapter README 明确了它是 TDengine 与应用之间的桥接层，语言连接器通过 WebSocket 与 TDengine 通信，因此 taosadapter 是关键组件。

## 2. 方案核心：Node 连接器如何做 Failover

### 2.1 多地址 DSN + 最少连接选址

Node 连接器支持多地址 DSN（逗号分隔）：

```text
ws://user:pass@adapter-a:6041,adapter-b:6041,adapter-c:6041
```

内部会维护地址连接计数（`AddressConnectionTracker`），重连时优先选择“当前连接数最少”的地址，避免热点集中到单个 adapter。

### 2.2 重试与指数退避（DSN 可配置）

连接器从 DSN 读取：

- `retries`
- `retry_backoff_ms`
- `retry_backoff_max_ms`

并使用指数退避，默认值是 `5 / 200ms / 2000ms`。这让短抖动场景下的恢复更平滑。

### 2.3 重连去重（Reconnect Lock）

同一时刻可能有多个请求同时触发重连。连接器通过 `_reconnectLock` 合并并发重连，避免“雪崩式重复重连”。

### 2.4 会话恢复（Session Recovery Hook）

重连成功后，连接器不是只恢复 socket，而是恢复**会话上下文**：

- SQL 路径：重新发 `conn`，恢复数据库上下文与 `options_connection`；
- TMQ 路径：基于已订阅 topics 自动 re-subscribe。

这一步是“网络恢复”升级为“业务恢复”的关键。

### 2.5 Inflight 请求重放（按顺序）

连接器会保留可重试请求并在重连后按发送顺序 replay。  
当前可重试动作包括：`insert / options_connection / poll / subscribe`（以及部分二进制操作码）。

这意味着：

- 可重试请求：尽量自动续传；
- 不可重试请求：快速失败，交给上层显式处理。

## 3. 实战配置（可直接复用）

### 3.1 SQL 写入/查询

```ts
import { WSConfig, sqlConnect } from "@tdengine/websocket";

const dsn =
  "ws://root:taosdata@adapter-a:6041,adapter-b:6041,adapter-c:6041" +
  "?retries=24&retry_backoff_ms=8&retry_backoff_max_ms=25";

const conf = new WSConfig(dsn);
conf.setDb("power");
conf.setTimeOut(10000);

const wsSql = await sqlConnect(conf);
await wsSql.exec("insert into t0 values(now, 1)");
```

### 3.2 TMQ 消费

```ts
import { tmqConnect } from "@tdengine/websocket";
import { TMQConstants } from "@tdengine/websocket";

const tmqConf = new Map<string, any>([
  [TMQConstants.GROUP_ID, `g_${Date.now()}`],
  [TMQConstants.CLIENT_ID, `c_${Date.now()}`],
  [TMQConstants.CONNECT_USER, "root"],
  [TMQConstants.CONNECT_PASS, "taosdata"],
  [TMQConstants.AUTO_OFFSET_RESET, "earliest"],
  [TMQConstants.ENABLE_AUTO_COMMIT, false],
  [TMQConstants.AUTO_COMMIT_INTERVAL_MS, 1000],
  [
    TMQConstants.WS_URL,
    "ws://root:taosdata@adapter-a:6041,adapter-b:6041,adapter-c:6041" +
      "?retries=60&retry_backoff_ms=10&retry_backoff_max_ms=40",
  ],
]);

const consumer = await tmqConnect(tmqConf);
await consumer.subscribe(["topic_power"]);
const res = await consumer.poll(1200);
```

## 4. 结果验证：不是“理论可行”，而是“测试可复现”

在仓库 failover 自动化测试中，覆盖了 SQL / Stmt2 / TMQ 三条核心路径：

1. **双地址切换**：活跃代理短时重启（如 800ms downtime）后，能切到下一地址继续执行。  
2. **单地址重连**：同地址硬重启后自动恢复。  
3. **SQL 随机重启压力**：随机重启过程中插入 5000 行，最终 `count(*) = 5000`。  
4. **Stmt2 分阶段故障**：在 `init/prepare/bind/exec/result` 任一阶段注入故障，流程可恢复；随机重启下 5000 行仍完整。  
5. **TMQ 恢复**：恢复订阅上下文并继续 poll；单地址与三地址场景都可消费完 5000 行。

## 5. 业务价值（给交付与运营看的）

- **稳定性**：将“实例重启=业务中断”降级为“短暂抖动后自动恢复”；
- **连续性**：写入与消费链路不中断，告警与看板数据更完整；
- **运维成本**：减少人工重启、补数与故障窗口沟通；
- **可扩展性**：多地址策略天然支持后续扩容与流量分摊。

## 6. 落地清单（上线前建议）

1. 至少部署 2 个 taosadapter 实例，并在 DSN 中配置多地址；
2. 按业务容忍时长调 `retries/backoff`，不要直接照搬默认值；
3. 写入链路优先设计幂等键，降低重放带来的重复写风险；
4. 监控重连次数、切换次数、消费延迟与失败动作分布；
5. 在预发环境做“随机重启演练”（SQL/Stmt2/TMQ 各测一次）。

## 结语

Node 在 taosadapter 上的 failover，不应只被当成“网络容错细节”。它本质上是业务连续性能力：把故障从“中断事件”变成“可恢复波动”。这正是工业数据平台走向生产稳定所必须的基础能力。

---

**参考实现与变更**

- taos-connector-node PR #109: `feat: impl load balancing and failover`  
- taos-connector-node PR #110: `session recovery hooks / TMQ enhancement`  
- taos-connector-node PR #111: `WsStmt2 failover handling`  
- 仓库：<https://github.com/taosdata/taos-connector-node>  
- taosadapter：<https://github.com/taosdata/taosadapter>
