# 多地址负载均衡和故障转移设计文档

**日期**: 2026-03-13
**作者**: Claude (Brainstorming Session)
**状态**: 待审查

## 1. 概述

本设计为 TDengine Node.js WebSocket Connector 添加多地址负载均衡和自动故障转移功能，提升系统的高可用性和容错能力。

### 1.1 目标

- 支持配置多个 TDengine 服务器地址
- 首次连接时随机选择地址，实现负载分散
- 连接失败时自动故障转移到其他地址
- 连接断开后自动重连并恢复请求
- 对上层 API 完全透明
- 保持向后兼容性

### 1.2 非目标

- 本期不处理 TMQ（数据订阅）和 STMT2（参数绑定）的故障转移
- 不实现加权负载均衡
- 不实现健康检查和主动探测

## 2. 架构设计

### 2.1 整体架构

```
用户代码
    ↓
WsSql / WsTmq (不变)
    ↓
WsClient (轻微改动：传递 DSN 字符串)
    ↓
WebSocketConnectionPool (改动：DSN 解析，逻辑端点 key)
    ↓
WebSocketConnector (核心改动：多地址管理、故障转移)
    ↓
w3cwebsocket (底层 WebSocket)
```

### 2.2 关键设计决策

1. **地址选择策略**: 首次随机选择，失败后顺序轮询
2. **重试配置**: 支持 `retries`（每个地址重试次数）、`retry_backoff_ms`（初始退避延迟）、`retry_backoff_max_ms`（最大退避延迟）
3. **连接池 key**: 基于规范化的地址列表（排序后的字符串）
4. **请求重试**:
   - Inflight 请求：根据 action 类型过滤（`insert`、`query`、`CheckServerStatus`、`OptionsConnection`，二进制 action 4/5/6/10）
   - 重连期间新请求：阻塞等待重连完成或失败
5. **作用域**: 本期只处理 SQL 操作

### 2.3 配置方式

用户可以通过 DSN 字符串配置多地址：

```typescript
// 多地址配置
const config = new WSConfig('ws://root:taosdata@host1:6041,host2:6042,host3:6043/db?retries=3&retry_backoff_ms=100&retry_backoff_max_ms=10000');

// 单地址（向后兼容）
const config = new WSConfig('ws://root:taosdata@localhost:6041/db');
```

## 3. 核心组件设计

### 3.1 RetryConfig 类

封装重试配置参数：

```typescript
class RetryConfig {
    retries: number;              // 每个地址的重试次数，默认 3
    retryBackoffMs: number;       // 初始退避延迟（毫秒），默认 100
    retryBackoffMaxMs: number;    // 最大退避延迟（毫秒），默认 10000

    // 计算指数退避延迟：min(retryBackoffMs * 2^attempt, retryBackoffMaxMs)
    getBackoffDelay(attempt: number): number {
        const delay = this.retryBackoffMs * Math.pow(2, attempt);
        return Math.min(delay, this.retryBackoffMaxMs);
    }

    static fromDsn(dsn: Dsn): RetryConfig {
        return {
            retries: parseInt(dsn.params.get('retries') || '3'),
            retryBackoffMs: parseInt(dsn.params.get('retry_backoff_ms') || '100'),
            retryBackoffMaxMs: parseInt(dsn.params.get('retry_backoff_max_ms') || '10000')
        };
    }
}
```

### 3.2 WebSocketConnector 增强

#### 3.2.1 新增属性

```typescript
class WebSocketConnector {
    private _addresses: Address[];           // 所有可用地址
    private _currentAddressIndex: number;    // 当前使用的地址索引
    private _retryConfig: RetryConfig;       // 重试配置
    private _scheme: string;                 // ws 或 wss
    private _token: string | null;           // token 认证（如果有）
    private _isReconnecting: boolean;        // 是否正在重连
    private _reconnectPromise: Promise<void> | null; // 重连 Promise，用于并发控制
    private _inflightRequests: Map<bigint, InflightRequest>; // 进行中的请求
    private _poolKey: string;                // 连接池 key
    // ... 现有属性
}
```

#### 3.2.2 请求数据结构

```typescript
interface InflightRequest {
    reqId: bigint;
    message: string | ArrayBuffer;
    resolve: (value: any) => void;
    reject: (error: any) => void;
}
```

#### 3.2.3 构造函数

```typescript
constructor(dsn: Dsn, timeout?: number) {
    this._addresses = dsn.addresses;
    this._currentAddressIndex = this.selectRandomIndex(); // 首次随机选择
    this._retryConfig = RetryConfig.fromDsn(dsn);
    this._scheme = dsn.scheme;
    this._token = dsn.params.get('token') || null;
    this._poolKey = this.generatePoolKey(dsn);

    // 使用当前地址创建 WebSocket 连接
    const url = this.buildWebSocketUrl('ws'); // SQL 使用 'ws' 路径
    this._wsURL = new URL(url);
    // ... 创建连接
}

private buildWebSocketUrl(path: string): string {
    const addr = this._addresses[this._currentAddressIndex];
    const addrStr = `${addr.host}:${addr.port}`;

    if (this._token) {
        return `${this._scheme}://${addrStr}/${path}?token=${this._token}`;
    } else {
        return `${this._scheme}://${addrStr}/${path}`;
    }
}
```

### 3.3 故障转移逻辑

#### 3.3.1 连接断开检测

```typescript
// 当 WebSocket 连接关闭时触发
private async _onclose(e: ICloseEvent) {
    logger.warn(`WebSocket connection closed: ${e.code} ${e.reason}`);

    // 只有非正常关闭才触发重连（网络错误等）
    // 1000 = 正常关闭，1001 = 端点离开
    if (e.code !== 1000 && e.code !== 1001) {
        await this.triggerReconnect();
    }
}

// 当 WebSocket 连接错误时触发
private async _onerror(err: Error) {
    logger.error(`WebSocket connection error: ${err.message}`);

    // 网络错误触发重连
    await this.triggerReconnect();
}
```

#### 3.3.2 重连逻辑（带并发控制）

**并发问题分析**：
在异步场景下，`_onerror` 和 `_onclose` 可能几乎同时触发，导致以下竞态条件：
- 第一个调用者检查 `_isReconnecting` 为 false
- 在设置 `_isReconnecting = true` 之前，第二个调用者也完成了检查
- 结果：创建多个重连Promise，浪费资源且可能导致状态混乱

**解决方案**：
使用 `_reconnectLock` Promise 实现原子性的重连控制，利用 Promise 的单次 resolve 特性作为轻量级锁。

```typescript
class WebSocketConnector {
    private _isReconnecting: boolean = false;
    private _reconnectLock: Promise<void> | null = null;  // 重连锁
    // ... 其他属性
}

// 触发重连（带并发控制）
private async triggerReconnect(): Promise<void> {
    // 原子性地获取或创建重连Promise
    if (!this._reconnectLock) {
        this._reconnectLock = this._doReconnect();
    }

    try {
        await this._reconnectLock;
    } finally {
        // 只有当前Promise完成时才清空
        if (this._reconnectLock === this._reconnectLock) {
            this._reconnectLock = null;
        }
    }
}

// 执行实际的重连逻辑
private async _doReconnect(): Promise<void> {
    this._isReconnecting = true;
    try {
        await this.attemptReconnect();
        await this.replayRequests();
    } finally {
        this._isReconnecting = false;
    }
}

// 尝试重连到其他地址
private async attemptReconnect(): Promise<void> {
    const totalAddresses = this._addresses.length;

    // 遍历所有地址（从当前地址开始）
    for (let i = 0; i < totalAddresses; i++) {
        // 对当前地址进行重试
        for (let retry = 0; retry <= this._retryConfig.retries; retry++) {
            try {
                logger.info(`Reconnecting to ${this.getCurrentAddress()}, attempt ${retry + 1}`);

                await this.reconnectToCurrentAddress();

                // 重连成功，返回（状态更新在 _doReconnect 的 finally 中）
                logger.info(`Reconnection successful to ${this.getCurrentAddress()}`);
                return;

            } catch (err) {
                logger.warn(`Reconnect failed: ${err.message}`);

                if (retry < this._retryConfig.retries) {
                    // 指数退避
                    const delay = this._retryConfig.getBackoffDelay(retry);
                    await this.sleep(delay);
                }
            }
        }

        // 当前地址所有重试都失败，切换到下一个地址
        if (i < totalAddresses - 1) {
            this._currentAddressIndex = (this._currentAddressIndex + 1) % totalAddresses;
            logger.info(`Switching to next address: ${this.getCurrentAddress()}`);
        }
    }

    // 所有地址都尝试失败
    const error = new TDWebSocketClientError(
        ErrorCode.ERR_WEBSOCKET_CONNECTION_FAIL,
        'Failed to reconnect to any available address'
    );
    this.failAllInflightRequests(error);
    throw error;
}
```

**关键改进点**：
1. **原子性保证**：使用 `_reconnectLock` Promise 作为锁，确保只有一个重连流程在执行
2. **状态管理**：将状态更新集中在 `_doReconnect()` 的 try-finally 中，确保状态一致性
3. **错误处理**：重连失败时抛出错误，由 `_doReconnect()` 的 finally 块确保 `_isReconnecting` 被正确重置
4. **请求重放时机**：先完成重连，再重放请求，最后才更新状态为非重连中

### 3.4 请求重试机制

#### 3.4.1 可重试 action 判断

```typescript
// 判断 action 是否可重试
private isRetriableAction(action: string): boolean {
    const retriableActions = [
        'insert',
        'query',
        'CheckServerStatus',
        'OptionsConnection'
    ];
    return retriableActions.includes(action);
}

// 判断二进制请求的 action 是否可重试
private isRetriableBinaryAction(action: bigint): boolean {
    const retriableActions = [4n, 5n, 6n, 10n];
    return retriableActions.includes(action);
}
```

#### 3.4.2 发送消息时记录 inflight 请求（乐观发送策略）

**TOCTOU问题分析**：
在等待重连成功后和调用 `send()` 之间存在时间窗口，连接可能在此期间断开。这是WebSocket的固有特性，无法完全消除。

**解决方案**：
采用"乐观发送 + 重连兜底"策略：
- 可重试请求：先加入 `_inflightRequests`，发送失败后由重连机制重放
- 不可重试请求：发送失败立即拒绝Promise

```typescript
async sendMsg(message: string, register: Boolean = true) {
    let msg = JSON.parse(message);

    // 等待重连完成
    if (this._reconnectLock) {
        await this._reconnectLock;
    }

    return new Promise((resolve, reject) => {
        const reqId = msg.args.req_id;

        // 可重试的请求先注册到 inflight
        if (this.isRetriableAction(msg.action)) {
            this._inflightRequests.set(reqId, {
                reqId,
                message,
                resolve,
                reject
            });
        }

        // 注册回调
        if (register) {
            WsEventCallback.instance().registerCallback(
                {
                    action: msg.action,
                    req_id: msg.args.req_id,
                    timeout: this._timeout,
                    id: msg.args.id === undefined ? msg.args.id : BigInt(msg.args.id),
                },
                (result) => {
                    this._inflightRequests.delete(reqId);
                    resolve(result);
                },
                (error) => {
                    this._inflightRequests.delete(reqId);
                    reject(error);
                }
            );
        }

        // 乐观发送，失败由 catch 处理
        try {
            this._wsConn.send(message);
        } catch (err) {
            // 发送失败，如果不可重试则立即拒绝
            if (!this.isRetriableAction(msg.action)) {
                this._inflightRequests.delete(reqId);
                if (register) {
                    WsEventCallback.instance().unregisterCallback(reqId);
                }
                reject(err);
            }
            // 可重试的请求保留在 inflight，等待重连后重放
        }
    });
}
```

**关键改进点**：
1. **先注册后发送**：可重试请求先加入 `_inflightRequests`，确保重连时能重放
2. **乐观发送**：直接调用 `send()`，失败由 catch 捕获
3. **分类处理**：可重试请求依赖重连机制，不可重试请求立即失败
4. **接受现实**：承认TOCTOU无法完全避免，通过重连机制保证最终一致性

#### 3.4.3 重连成功后重放请求

```typescript
private async replayRequests(): Promise<void> {
    logger.info(`Replaying requests after reconnection`);

    // 重发 inflight 请求
    const inflightRequests = Array.from(this._inflightRequests.values());
    for (const req of inflightRequests) {
        try {
            this._wsConn.send(req.message);
            logger.debug(`Replayed inflight request`);
        } catch (err) {
            logger.error(`Failed to replay inflight request: ${err.message}`);
            req.reject(err);
            this._inflightRequests.delete(req.reqId);
        }
    }
}

private failAllInflightRequests(error: Error): void {
    // 失败所有 inflight 请求
    for (const req of this._inflightRequests.values()) {
        req.reject(error);
    }
    this._inflightRequests.clear();
}
```

### 3.5 连接池改动

#### 3.5.1 连接池 key 生成

```typescript
class WebSocketConnectionPool {
    // 连接池 key 生成：基于规范化的地址列表
    private getPoolKey(dsn: Dsn): string {
        // 将地址列表排序后生成唯一 key
        const sortedAddrs = [...dsn.addresses]
            .sort((a, b) => `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`))
            .map(addr => `${addr.host}:${addr.port}`)
            .join(',');

        // 包含 scheme, 地址列表, database, 关键参数
        const params = new URLSearchParams();
        if (dsn.params.has('token')) {
            params.set('token', dsn.params.get('token')!);
        }
        if (dsn.params.has('timezone')) {
            params.set('timezone', dsn.params.get('timezone')!);
        }

        const db = dsn.database || '';
        const paramStr = params.toString();

        return `${dsn.scheme}://${sortedAddrs}/${db}${paramStr ? '?' + paramStr : ''}`;
    }

    async getConnection(dsn: Dsn, timeout: number | undefined | null): Promise<WebSocketConnector> {
        const poolKey = this.getPoolKey(dsn);
        // ... 现有逻辑，使用 poolKey 而非 URL

        return new WebSocketConnector(dsn, timeout);
    }
}
```

#### 3.5.2 并发控制

**现有实现**：
连接池已使用 `async-mutex` 保护并发访问，确保：
1. 多个并发请求不会创建重复连接
2. 连接的获取、释放、清理都是线程安全的
3. 使用 `Atomics` 进行原子引用计数

```typescript
import { Mutex } from "async-mutex";

const mutex = new Mutex();

async getConnection(url: URL, timeout: number | undefined | null): Promise<WebSocketConnector> {
    const unlock = await mutex.acquire();
    try {
        // 检查连接池
        // 创建新连接
        // 更新引用计数
    } finally {
        unlock();
    }
}
```

**多地址改造注意事项**：
- 保持现有的 `Mutex` 并发控制机制
- Pool key 从单个 URL 改为规范化的地址列表
- 连接复用逻辑保持不变

### 3.6 上层集成改动

#### 3.6.1 WsClient 改动

```typescript
class WsClient {
    private _wsConnector?: WebSocketConnector;
    private _timeout?: number | undefined | null;
    private _timezone?: string | undefined | null;
    private _dsn: Dsn;  // 新增：保存解析后的 DSN
    private static readonly _minVersion = "3.3.2.0";
    private _version?: string | undefined | null;
    private _bearerToken?: string | undefined | null;

    constructor(url: string, timeout?: number | undefined | null) {
        // 解析 DSN
        this._dsn = parse(url);
        this._timeout = timeout;

        // 验证认证信息
        this.checkAuth();

        // 从 DSN params 提取 timezone 和 bearer_token
        if (this._dsn.params.has("timezone")) {
            this._timezone = this._dsn.params.get("timezone") || undefined;
        }
        if (this._dsn.params.has("bearer_token")) {
            this._bearerToken = this._dsn.params.get("bearer_token") || undefined;
        }
    }

    private checkAuth() {
        const hasToken = this._dsn.params.has("token") || this._dsn.params.has("bearer_token");
        if (!hasToken) {
            if (!(this._dsn.username || this._dsn.password)) {
                throw new WebSocketInterfaceError(
                    ErrorCode.ERR_INVALID_AUTHENTICATION,
                    `invalid url, provide non-empty "token" or "bearer_token", or provide username/password`
                );
            }
        }
    }

    async connect(database?: string | undefined | null): Promise<void> {
        // 传递 DSN 而非 URL
        this._wsConnector = await WebSocketConnectionPool.instance().getConnection(
            this._dsn,
            this._timeout
        );
        // ... 现有逻辑
    }
}
```

## 4. 错误处理

### 4.1 新增错误码

```typescript
export enum ErrorCode {
    // ... 现有错误码
    ERR_ALL_ADDRESSES_FAILED = 0x9001,  // 所有地址都连接失败
    ERR_RECONNECT_TIMEOUT = 0x9002,     // 重连超时
    ERR_INVALID_DSN = 0x9003,           // 无效的 DSN 格式
}
```

### 4.2 错误场景

1. **DSN 解析失败**: 在 `parse()` 函数中抛出 `ERR_INVALID_DSN`
2. **所有地址连接失败**: 在 `attemptReconnect()` 中抛出 `ERR_ALL_ADDRESSES_FAILED`
3. **重连期间新请求**: 阻塞等待重连完成，重连失败时抛出连接错误
4. **连接池满**: 现有的 `ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT` 处理

## 5. 测试策略

### 5.1 单元测试

#### DSN 解析测试
- 单地址、多地址
- IPv4、IPv6
- 带/不带认证
- 查询参数解析
- 边界情况：空地址列表、重复地址、无效端口、格式错误

#### RetryConfig 测试
- 指数退避计算
- 边界值：零重试、负值、溢出保护

#### 连接池测试
- 连接复用
- 最大连接数限制
- 过期连接清理
- Pool key 规范化

### 5.2 集成测试

#### 故障转移场景
- 第一个地址不可用，切换到第二个
- 所有地址都不可用
- 故障转移保持数据库上下文
- 重试次数耗尽

#### 重连场景
- 连接断开时的自动重连
- 重连期间的请求阻塞等待
- 并发重连控制
- 重连到不同地址

#### 请求重试场景
- 可重试 action（insert、query 等）
- 不可重试 action 立即失败
- 二进制请求重试
- 混合可重试和不可重试请求

#### 负载均衡场景
- 随机初始地址选择分布
- 失败后的轮询顺序

#### 边界和压力测试
- 单地址向后兼容
- 大量地址（100+）
- 快速连接/断开
- 长时间运行多次故障转移
- 网络分区恢复

#### 认证和配置测试
- Token 认证故障转移
- Bearer token 认证
- Timezone 配置保持
- 自定义重试参数

#### 错误处理测试
- 发送时连接错误
- 重连后异常响应
- 部分消息发送时断开

### 5.3 性能测试
- 故障转移延迟
- 重连开销
- 连接池竞争

## 6. 向后兼容性

- 单地址 URL 配置继续工作
- 现有 API 不变
- 连接池行为在单地址场景下保持一致
- 默认重试参数确保合理的开箱即用体验

## 7. 实施计划

### 阶段 1: 核心功能
1. 实现 RetryConfig 类
2. 增强 WebSocketConnector（多地址、故障转移）
3. 更新连接池（DSN 支持、pool key 生成）
4. 修改 WsClient（DSN 解析）

### 阶段 2: 请求重试
1. 实现 inflight 请求跟踪
2. 实现重连期间请求阻塞等待
3. 实现请求重放逻辑
4. Action 过滤机制

### 阶段 3: 测试和优化
1. 单元测试
2. 集成测试
3. 性能测试
4. 文档更新

## 8. 未来扩展

- TMQ 和 STMT2 的故障转移支持
- 加权负载均衡
- 主动健康检查
- 连接质量监控和指标
- 智能地址选择（基于延迟、错误率）
