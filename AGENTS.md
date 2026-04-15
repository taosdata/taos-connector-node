# AGENTS.md — taos-connector-node

Think in English, but always provide your final response in Chinese.

## Build, test, and lint commands

Run all commands from `nodejs/`.

- Install deps: `npm install`
- Build (TypeScript compile): `npm run build`
- Run full tests: `npm run test`
- Run a single test file: `npm run test -- test/common/dsn.test.ts`
- Run one test by name: `npm run test -- -t "deduplicates concurrent reconnect triggers with reconnect lock"`
- Run integration example used in CI: `npm run example`

Test prerequisites from project docs/CI:
- Local `taosd` and `taosAdapter` must be running.
- CI runs on Node.js 16.x and 20.x.

There is currently no dedicated lint script in `nodejs/package.json`.

## High-level architecture

- Public entrypoint: `nodejs/src/index.ts` exposes `sqlConnect`, `tmqConnect`, logging level control, and pool teardown; root `index.ts` re-exports the library surface.
- Connection stack:
  - `WSConfig` + `getDsn()` (`src/common/config.ts`, `src/common/utils.ts`) normalize connection inputs.
  - `parse()` in `src/common/dsn.ts` supports multi-address DSNs and endpoint-aware paths.
  - `WsClient` (`src/client/wsClient.ts`) handles connect/auth/version checks and delegates transport work.
  - `WebSocketConnectionPool` + `WebSocketConnector` (`src/client/wsConnectorPool.ts`, `src/client/wsConnector.ts`) provide pooled sockets, reconnect/failover, and in-flight request replay.
  - `WsEventCallback` (`src/client/wsEventCallback.ts`) is the async request/response registry keyed by req_id/id/action.
- SQL path:
  - `WsSql` (`src/sql/wsSql.ts`) is the high-level SQL API.
  - `WSRows` (`src/sql/wsRows.ts`) streams blocks incrementally.
  - `TaosResult` + `parseBlock()` (`src/common/taosResult.ts`) decode binary protocol blocks into row/meta structures.
- Statement path:
  - `WsSql.stmtInit()` switches between `WsStmt1` and `WsStmt2` based on server version (`compareVersions` + `minStmt2Version`).
  - `WsStmt2` includes explicit network-recovery flow for stmt lifecycle steps.
- TMQ path:
  - `TmqConfig` (`src/tmq/config.ts`) parses config map and builds TMQ/SQL DSNs.
  - `WsConsumer` (`src/tmq/wsTmq.ts`) wraps subscribe/poll/commit and restores subscriptions after reconnect.

## Key repository conventions

- DSN handling is central and non-trivial:
  - Multi-address URLs are first-class (`host1,host2,[::1]`), with host deduplication and cloud-aware default ports.
  - Endpoint determines websocket path (`sql -> ws`, `tmq -> rest/tmq`).
- Pooling identity is normalized:
  - Connection pool keys sort addresses and append endpoint path + SHA-256 auth scope hash (`username/password/token/bearer_token`), so equivalent DSNs share pools while auth contexts stay isolated.
- Reconnect behavior is selective:
  - Retry/backoff comes from DSN params (`retries`, `retry_backoff_ms`, `retry_backoff_max_ms`).
  - Only safe actions are replayed after reconnect (`insert`, `options_connection`, `poll`, `subscribe`, and selected binary op codes).
- Credentials must stay masked in logs:
  - Keep using existing masking helpers (`Dsn.toString()`, `maskSensitiveForLog`, `maskUrlForLog`, `maskTmqConfigForLog`) when adding logs around DSNs/messages/config.
- Test conventions:
  - Jest + `ts-jest`; path aliases are `@src/*` and `@test-helpers/*`.
  - Tests are mostly integration-style and typically create/drop DB resources in `beforeAll`/`afterAll`.

