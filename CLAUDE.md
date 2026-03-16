# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Response Language

Think in English, but always provide your final response in Chinese.

## Project Overview

This is the TDengine Node.js connector (`@tdengine/websocket`), a WebSocket-based client library for connecting to TDengine time-series database. It communicates with TDengine through the taosAdapter component's WebSocket API, eliminating the need for native client drivers.

## Working Directory

All development commands must be run from the `nodejs/` subdirectory, not the repository root.

```bash
cd nodejs
```

## Build and Development Commands

**Install dependencies:**
```bash
npm install
```

**Build the project:**
```bash
npm run build
```
This compiles TypeScript to JavaScript using `tsc`. Output goes to `nodejs/lib/`.

**Run all tests:**
```bash
npm test
```
Runs Jest with coverage. Coverage reports are generated in `../coverage/`.

**Run a single test file:**
```bash
npx jest test/bulkPulling/sql.test.ts
```

**Run tests matching a pattern:**
```bash
npx jest --testNamePattern="connection pool"
```

## Testing Requirements

- Tests require a running local TDengine server with `taosd` and `taosAdapter` started
- Tests connect to `localhost` by default
- Each test file typically creates its own database in `beforeAll` and drops it in `afterAll`
- Tests are located in `nodejs/test/bulkPulling/` (all tests)

### Code Change Gate

- Every code change must keep the full test suite passing.
- If any test (except `cloud.tmq.test.ts`) fails, fix the production code first.
- Do not modify tests just to make failures disappear unless the test itself is proven incorrect and explicitly approved.

## Architecture

### Core Modules

**`src/client/`** - WebSocket connection management
- `wsClient.ts`: Low-level WebSocket client wrapper
- `wsConnector.ts`: Connection abstraction with request/response handling
- `wsConnectorPool.ts`: Connection pooling with atomic reference counting

**`src/sql/`** - SQL operations via WebSocket
- `wsSql.ts`: Main SQL interface, entry point for SQL operations
- `wsRows.ts`: Result set handling and row iteration
- `wsProto.ts`: WebSocket protocol message definitions

**`src/stmt/`** - Prepared statement support
- `wsStmt.ts`, `wsStmt1.ts`, `wsStmt2.ts`: Statement preparation and execution (version-specific)
- `wsParams1.ts`, `wsParams2.ts`: Parameter binding for different protocol versions
- `FieldBindParams.ts`: Field binding utilities

**`src/tmq/`** - TDengine Message Queue (TMQ) consumer
- `wsTmq.ts`: TMQ consumer implementation for data subscription
- `config.ts`: TMQ-specific configuration
- `tmqResponse.ts`: TMQ message response handling

**`src/common/`** - Shared utilities
- `config.ts`: `WSConfig` class for connection configuration (user, password, db, url, timeout, token, timezone, retry settings)
- `wsError.ts`: Error types and error handling
- `log.ts`: Winston-based logging with daily rotation (logs to `./logs/app-%DATE%.log`)
- `urlParser.ts`: Multi-host URL parsing with failover support
- `utils.ts`: General utilities including URL masking for logs

### Entry Point

`src/index.ts` exports the public API:
- `sqlConnect(conf: WSConfig)`: Create SQL connection
- `tmqConnect(configMap: Map<string, string>)`: Create TMQ consumer
- `setLogLevel(level: string)`: Configure logging level at runtime
- `destroy()`: Clean up connection pool

### Connection Pooling

The connector uses a singleton connection pool (`WebSocketConnectionPool`) with:
- Atomic reference counting using `SharedArrayBuffer` and `Atomics`
- Connection reuse based on URL (origin + pathname + search)
- Configurable max connections limit
- Automatic cleanup of stale connections

### Configuration

Use `WSConfig` class for SQL connections:
```typescript
const config = new WSConfig(url);
config.setUser('root');
config.setPwd('taosdata');
config.setDb('test_db');
```

### URL Parser

The `urlParser.ts` module supports multi-host URLs for failover scenarios. It can parse URLs with multiple hosts and handle IPv6 addresses.

## Code Conventions

- TypeScript with strict mode enabled
- Target: ES2020, Module: CommonJS
- Use async/await for asynchronous operations
- Errors are logged via Winston and rethrown
- Sensitive data (tokens, passwords) must be masked in logs using `maskUrlForLog()`
- All code changes must be production-ready, with proper error handling, tests, and maintainable design.

## Important Notes

- The connector is designed for TDengine 3.3.2.0 and above
- All WebSocket communication goes through taosAdapter, not directly to taosd
- Statement protocol versions (stmt1 vs stmt2) are determined by TDengine server version
- Connection pooling is critical for performance - connections are reused when possible
