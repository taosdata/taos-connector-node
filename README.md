# TDengine Node.js Connector

| Github Action Tests                                                                  | CodeCov                                                                                                                           |
|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| ![actions](https://github.com/taosdata/taos-connector-node/actions/workflows/push.yaml/badge.svg) | [![codecov](https://codecov.io/gh/taosdata/taos-connector-node/graph/badge.svg?token=5379a80b-063f-48c2-ab56-09564e7ca777)](https://codecov.io/gh/taosdata/taos-connector-node) |

English | [简体中文](README-CN.md)

## Table of Contents

- [TDengine Node.js Connector](#tdengine-nodejs-connector)
  - [Table of Contents](#table-of-contents)
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

Install the Node.js connector using npm

```shell
npm install @tdengine/websocket
```

## 3. Documentation

- For development examples, see the [Developer Guide](https://docs.tdengine.com/developer-guide/).
- For version history, TDengine version compatibility, and API documentation, see
  the [Reference Manual](https://docs.tdengine.com/tdengine-reference/client-libraries/node/).

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
After running the tests, the result similar to the following will be printed eventually. If all test cases pass, both Failures and Errors will be 0.

```text
[INFO] Results:
[INFO] 
[WARNING] Tests run: 2353, Failures: 0, Errors: 0, Skipped: 16
```

### 6.2 Test Case Addition

All tests are located in the `nodejs/test/bulkPulling` directory of the project. You can add new test files or add test cases in existing test files.
The test cases use the jest framework. Generally, a connection is established and a database is created in the `beforeAll` method, and the database is droped and the connection is released in the `afterAll` method.

### 6.3 Performance Testing

Performance testing is in progress.

## 7. Submitting Issues

We welcome submitting [Github Issue](https://github.com/taosdata/taos-connector-node/issues/new?template=Blank+issue). Please provide the following information when submitting:

- Problem description, is it necessary to present it
- Nodejs version
- @tdengine/websocket version
- Connection parameters (no username or password required)
- TDengine Server Version

## 8. Submitting PRs

We welcome developers to develop this project together. When submitting a PR, please refer to the following steps:

1. Fork this project, please refer to [how to fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
2. Create a new branch from the main branch using a meaningful branch name (`git checkout -b my-branch`). Be careful not to modify directly on the main branch.
3. Modify the code to ensure that all unit tests pass, and add new unit tests to verify the modifications.
4. Submit modifications to the remote branch (`git push origin my-branch`).
5. Create a Pull Request on Github ([how to create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request)).
After submitting the PR, if the CI is approved, it can be done in [codecov](https://app.codecov.io/gh/taosdata/taos-connector-node/) Find your own branch on the page and check the coverage rate of individual tests.

## 9. References

- [TDengine Official Website](https://tdengine.com/)
- [TDengine GitHub](https://github.com/taosdata/TDengine)

## 10. License

[MIT License](./LICENSE)
