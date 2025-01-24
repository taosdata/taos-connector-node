<!-- omit in toc -->
# TDengine Node.js Connector
<!-- omit in toc -->

| Github Action Tests                                                                  | CodeCov                                                                                                                           |
|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| ![actions](https://github.com/taosdata/taos-connector-node/actions/workflows/push.yaml/badge.svg) | [![codecov](https://codecov.io/gh/taosdata/taos-connector-node/graph/badge.svg?token=5379a80b-063f-48c2-ab56-09564e7ca777)](https://codecov.io/gh/taosdata/taos-connector-node) |

English | [简体中文](README-CN.md)

<!-- omit in toc -->
## Table of Contents
<!-- omit in toc -->

- [1. Introduction](#1-introduction)
  - [1.1 Node.js Version Compatibility](#11-nodejs-version-compatibility)
  - [1.2 Supported Platforms](#12-supported-platforms)
- [2. Get the Driver](#2-get-the-driver)
- [3. Documentation](#3-documentation)
- [4. Prerequisites](#4-prerequisites)
- [5. Build](#5-build)
- [6. Testing](#6-testing)
  - [6.1 Test Execution](#61-test-execution)
  - [6.2 Test Case Addition](#62-test-case-addition)
  - [6.3 Performance Testing](#63-performance-testing)
- [7. Submitting Issues](#7-submitting-issues)
- [8. Submitting PRs](#8-submitting-prs)
- [9. References](#9-references)
- [10. License](#10-license)

## 1. Introduction

@tdengine/websocket is an efficient connector specially designed by TDengine for Node.js developers. It uses the WebSocket API provided by the taosAdapter component to establish a connection with TDengine, eliminating the dependence on TDengine client drivers and opening up a convenient development path for developers. With this powerful tool, developers can easily build applications for TDengine clusters. Whether it is performing complex SQL write and query tasks, implementing flexible schemaless write operations, or achieving highly real-time subscription functionality, this connector can easily and perfectly meet diverse data interaction needs in all aspects.

### 1.1 Node.js Version Compatibility

Supports Node.js 14 and above.

### 1.2 Supported Platforms

Support all platforms that can run Node.js.

## 2. Get the Driver

Install the Node.js connector using npm.

```shell
npm install @tdengine/websocket
```

## 3. Documentation

- For development examples, see [Developer Guide](https://docs.tdengine.com/developer-guide/), which includes examples of data writing, querying, schemaless writing, parameter binding, and data subscription.
- For other reference information, see [Reference Manual](https://docs.tdengine.com/tdengine-reference/client-libraries/node/), which includes version history, data types, example programs, API descriptions, and FAQs.


## 4. Prerequisites

- Install the Node.js development environment, using version 14 or above. Download link: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
- Install the Node.js connector using npm.
- Install TypeScript 5.3.3 and above using npm.
- TDengine has been deployed locally. For specific steps, please refer to Deploy TDengine, and `taosd` and `taosAdapter` have been started.

## 5. Build

Execute `tsc` to build the project in the 'nodejs' directory.

## 6. Testing

### 6.1 Test Execution

Execute `npm run test` in the project directory to run the tests. The test cases will connect to the local TDengine server and taosAdapter for testing.
After running the tests, the result similar to the following will be printed eventually. If all test cases pass, without any failures or errors.

```text
Test Suites: 8 passed, 8 total
Tests:       1 skipped, 44 passed, 45 total
Snapshots:   0 total
Time:        20.373 s
Ran all test suites.
```

### 6.2 Test Case Addition

All tests are located in the `nodejs/test/bulkPulling` directory of the project. You can add new test files or add test cases in existing test files.
The test cases use the jest framework. Generally, a connection is established and a database is created in the `beforeAll` method, and the database is droped and the connection is released in the `afterAll` method.

### 6.3 Performance Testing

Performance testing is in progress.

## 7. Submitting Issues

We welcome the submission of [GitHub Issue](https://github.com/taosdata/taos-connector-node/issues/new?template=Blank+issue). When submitting, please provide the following information:

- Problem description, is it necessary to present it.
- Nodejs version.
- @tdengine/websocket version.
- Connection parameters (no username or password required).
- TDengine Server Version.

## 8. Submitting PRs

We welcome developers to contribute to this project. When submitting PRs, please follow these steps:

1. Fork this project, refer to ([how to fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo)).
1. Create a new branch from the main branch with a meaningful branch name (`git checkout -b my_branch`). Do not modify the main branch directly.
1. Modify the code, ensure all unit tests pass, and add new unit tests to verify the changes.
1. Push the changes to the remote branch (`git push origin my_branch`).
1. Create a Pull Request on GitHub ([how to create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request)).
1. After submitting the PR, if CI passes, you can find your PR on the [codecov](https://app.codecov.io/gh/taosdata/taos-connector-node/pulls) page to check the test coverage.

## 9. References

- [TDengine Official Website](https://www.tdengine.com/)
- [TDengine GitHub](https://github.com/taosdata/TDengine)

## 10. License

[MIT License](./LICENSE)
