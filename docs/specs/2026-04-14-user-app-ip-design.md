# 支持用户 IP 和 App 设置 — 设计文档

## 概述

为 Node.js 连接器（`@tdengine/websocket`）新增 `user_app`（应用名称）和 `user_ip`（用户 IP）连接选项支持。

参考文档：`docs/fs/taosadapter-connection-options-fs.md`

## 方案

完全对齐现有 `timezone` 的实现模式：

- 在 connect 请求中发送 `app` 和 `ip`
- 在 `WsSql.open()` 中通过 `options_connection` 再次设置
- TMQ subscribe 请求中也包含 `app` 和 `ip`

## 涉及文件及修改

### 1. `nodejs/src/common/config.ts` — WSConfig 扩展

新增私有字段和 getter/setter：

```typescript
private _userApp: string | undefined | null;
private _userIp: string | undefined | null;

public getUserApp(): string | undefined | null { return this._userApp; }
public setUserApp(userApp: string) { this._userApp = userApp; }
public getUserIp(): string | undefined | null { return this._userIp; }
public setUserIp(userIp: string) { this._userIp = userIp; }
```

### 2. `nodejs/src/common/utils.ts` — getDsn() DSN 参数双向同步

在 `getDsn()` 函数中，新增 `user_app` 和 `user_ip` 的双向同步逻辑：

```typescript
const userApp = wsConfig.getUserApp();
if (userApp) {
    dsn.params.set("user_app", userApp);
} else if (dsn.params.has("user_app")) {
    wsConfig.setUserApp(dsn.params.get("user_app") || "");
}

const userIp = wsConfig.getUserIp();
if (userIp) {
    dsn.params.set("user_ip", userIp);
} else if (dsn.params.has("user_ip")) {
    wsConfig.setUserIp(dsn.params.get("user_ip") || "");
}
```

### 3. `nodejs/src/client/wsClient.ts` — Connect 请求

#### 3a. 构造函数中从 DSN params 提取

```typescript
private _userApp?: string | undefined | null;
private _userIp?: string | undefined | null;

// 在构造函数中：
if (this._dsn.params.has("user_app")) {
    this._userApp = this._dsn.params.get("user_app") || undefined;
}
if (this._dsn.params.has("user_ip")) {
    this._userIp = this._dsn.params.get("user_ip") || undefined;
}
```

#### 3b. buildConnMessage() 中包含 app 和 ip

```typescript
private buildConnMessage(database?: string | undefined | null) {
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
        },
    };
}
```

### 4. `nodejs/src/sql/wsSql.ts` — WsSql.open() 中 options_connection 设置

在连接成功、设置 timezone 之后，**无条件**下发 `user_app` 和 `user_ip` 的 options_connection 调用。当值未设置时发送 `null` 清空，防止连接池复用导致旧值残留：

```typescript
let userApp = wsConfig.getUserApp();
await wsSql._wsClient.setOptionConnection(
    TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_APP,
    userApp && userApp.length > 0 ? userApp : null
);
let userIp = wsConfig.getUserIp();
await wsSql._wsClient.setOptionConnection(
    TSDB_OPTION_CONNECTION.TSDB_OPTION_CONNECTION_USER_IP,
    userIp && userIp.length > 0 ? userIp : null
);
```

> **设计考量**：连接池 key 不含 `user_app`/`user_ip`（避免不必要的池碎片化）。因此同一池中复用的连接可能携带前一会话的值。无条件下发 options_connection（有值设值、无值清空）确保每次会话都拥有正确的状态。

**失败策略**：遵循现有 timezone 的 fail-close 模式 — 若 `setOptionConnection` 失败，异常被 `WsSql.open()` 的 try/catch 捕获，连接关闭并向调用方抛出错误。不做降级或重试。

### 5. TMQ 路径

#### 5a. `nodejs/src/tmq/constant.ts` — TMQConstants 新增常量

```typescript
public static USER_APP: string = "user_app";
public static USER_IP: string = "user_ip";
```

#### 5b. `nodejs/src/tmq/config.ts` — TmqConfig 解析

新增字段：

```typescript
userApp: string | null = null;
userIp: string | null = null;
```

在构造函数 switch 中新增 case：

```typescript
case TMQConstants.USER_APP:
    this.userApp = value;
    break;
case TMQConstants.USER_IP:
    this.userIp = value;
    break;
```

如果 config map 未设置（值仍为 `null`）但 DSN query params 中有值，则回退获取。使用 `== null` 判断（覆盖 `null` 和 `undefined`），避免将用户显式传入的空字符串 `""` 误判为"未设置"：

```typescript
if (this.userApp == null && this.dsn?.params.has("user_app")) {
    this.userApp = this.dsn.params.get("user_app") || null;
}
if (this.userIp == null && this.dsn?.params.has("user_ip")) {
    this.userIp = this.dsn.params.get("user_ip") || null;
}
```

#### 5c. `nodejs/src/tmq/wsTmq.ts` — subscribe 请求包含 app 和 ip

在 `buildSubscribeMessage()` 的 args 中，使用条件展开（与 `buildConnMessage()` 保持一致），仅在有效值时发送字段：

```typescript
args: {
    // ... 现有字段 ...
    ...(this._config.userApp && { app: this._config.userApp }),
    ...(this._config.userIp && { ip: this._config.userIp }),
    connector: ConnectorInfo,
}
```

`recoverSessionContext()` 调用 `buildSubscribeMessage()` 重建消息，自动携带 `app` 和 `ip`，无需额外修改。

## Wire Protocol 字段映射

| 用户 API 参数名 | DSN query 参数名 | Wire protocol（JSON 字段名） | options_connection 枚举值 |
|---|---|---|---|
| `setUserApp()` / config map `user_app` | `user_app` | `app` | `TSDB_OPTION_CONNECTION_USER_APP` (3) |
| `setUserIp()` / config map `user_ip` | `user_ip` | `ip` | `TSDB_OPTION_CONNECTION_USER_IP` (2) |

## 用户使用示例

### SQL 路径

```typescript
import { WSConfig, sqlConnect } from '@tdengine/websocket';

// 方式 1：通过 setter
const config = new WSConfig('ws://localhost:6041');
config.setUser('root');
config.setPwd('taosdata');
config.setUserApp('myApp');
config.setUserIp('192.168.1.100');
const wsSql = await sqlConnect(config);

// 方式 2：通过 DSN URL
const config2 = new WSConfig('ws://root:taosdata@localhost:6041?user_app=myApp&user_ip=192.168.1.100');
const wsSql2 = await sqlConnect(config2);
```

### TMQ 路径

```typescript
import { tmqConnect } from '@tdengine/websocket';

// 方式 1：通过 config Map
const configMap = new Map<string, string>();
configMap.set('ws.url', 'ws://localhost:6041');
configMap.set('td.connect.user', 'root');
configMap.set('td.connect.pass', 'taosdata');
configMap.set('group.id', 'myGroup');
configMap.set('user_app', 'myApp');
configMap.set('user_ip', '192.168.1.100');
const consumer = await tmqConnect(configMap);

// 方式 2：通过 DSN URL
const configMap2 = new Map<string, string>();
configMap2.set('ws.url', 'ws://root:taosdata@localhost:6041?user_app=myApp&user_ip=192.168.1.100');
configMap2.set('group.id', 'myGroup');
const consumer2 = await tmqConnect(configMap2);
```

## 不做的事情

- 不在连接器端截断 `app` 名称（由 taosAdapter 服务端处理）
- 不做 IP 格式校验（由 taosAdapter 服务端处理）
- 不修改连接池 key 逻辑（通过无条件下发 options_connection 清空/设置解决状态残留，避免池碎片化）

## 错误处理策略

| 场景 | 行为 |
|---|---|
| `setOptionConnection` 设置 `user_app` 失败 | Fail-close：关闭连接，抛出错误，WsSql.open() 整体失败 |
| `setOptionConnection` 设置 `user_ip` 失败 | 同上 |
| `setOptionConnection` 清空（value: null）失败 | 同上 |
| TMQ subscribe 时 `app`/`ip` 被服务端拒绝 | subscribe 调用失败，错误传播至调用方 |

此策略与现有 `timezone` 的 fail-close 行为一致（`WsSql.open()` 中 try/catch 统一处理）。
