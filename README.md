#  TDengine Node.js Connector

| Github Action Tests                                                                  | CodeCov                                                                                                                           |
|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| ![actions](https://github.com/taosdata/taos-connector-node/actions/workflows/push.yaml/badge.svg) | [![codecov](https://codecov.io/gh/taosdata/taos-connector-node/graph/badge.svg?token=5379a80b-063f-48c2-ab56-09564e7ca777)](https://codecov.io/gh/taosdata/taos-connector-node) |

English | [简体中文](README-CN.md)

1. [Introduction](#introduction)
    - [Node.js Version Compatibility](#nodejs-version-compatibility)
    - [Supported Platforms](#supported-platforms)
1. [Get the Driver](#get-the-driver)
1. [Documentation](#documentation)
1. [Prerequisites](#prerequisites)
1. [Build](#build)
1. [Testing](#testing)
1. [Submitting Issues](#submitting-prs)
1. [Submitting PRs](#submitting-prs)
1. [References](#references)
1. [License](#license)

## Introduction

@tdengine/websocket is an efficient connector specially designed by TDengine for Node.js developers. It uses the WebSocket API provided by the taosAdapter component to establish a connection with TDengine, eliminating the dependence on TDengine client drivers and opening up a convenient development path for developers. With this powerful tool, developers can easily build applications for TDengine clusters. Whether it is performing complex SQL write and query tasks, implementing flexible schemaless write operations, or achieving highly real-time subscription functionality, this connector can easily and perfectly meet diverse data interaction needs in all aspects.

### Node.js Version Compatibility

Supports Node.js 14 and above.

### Supported Platforms

Support all platforms that can run Node.js.

## Get the Driver

Install the Node.js connector using npm

```shell
npm install @tdengine/websocket
```

## Documentation

- For development examples, see the [Developer Guide](https://docs.tdengine.com/developer-guide/).
- For version history, TDengine version compatibility, and API documentation, see
  the [Reference Manual](https://docs.tdengine.com/tdengine-reference/client-libraries/node/).

## Prerequisites

- Install the Node.js development environment, using version 14 or above. Download link: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
- Install the Node.js connector using npm
- Install TypeScript 5.3.3 and above using npm
- TDengine has been deployed locally. For specific steps, please refer to Deploy TDengine, and `taosd` and `taosAdapter` have been started.

## Build

Execute `tsc` to build the project in the 'nodejs' directory.

## Testing

1. Before conducting the test, please ensure that the TDengine server is installed, `taosd` and `taosAdapter` are started, and the database is in a clean and data free state.
2. Execute 'npm run test' in the 'nodejs' directory of the project to run the test. The test will connect to the local TDengine server and taosAdapter for testing.
3. The output result PASS indicates that the test passed, FAIL indicates that the test failed, and coverage data will be output after the test is completed.

## Submitting Issues

We welcome submitting [Github Issue](https://github.com/taosdata/taos-connector-node/issues/new?template=Blank+issue). Please provide the following information when submitting:

- Problem description, is it necessary to present it
- Nodejs version
- @tdengine/websocket version
- Connection parameters (no username or password required)
- TDengine Server Version

## Submitting PRs

We welcome developers to develop this project together. When submitting a PR, please refer to the following steps:

1. Fork this project, please refer to [how to fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
2. Create a new branch from the main branch using a meaningful branch name (`git checkout -b my-branch`). Be careful not to modify directly on the main branch.
3. Modify the code to ensure that all unit tests pass, and add new unit tests to verify the modifications.
4. Submit modifications to the remote branch (`git push origin my-branch`).
5. Create a Pull Request on Github ([how to create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request)).
After submitting the PR, if the CI is approved, it can be done in [codecov](https://app.codecov.io/gh/taosdata/taos-connector-node/) Find your own branch on the page and check the coverage rate of individual tests.


## References

- [TDengine Official Website](https://tdengine.com/)
- [TDengine GitHub](https://github.com/taosdata/TDengine)

## License

[MIT License](./LICENSE)
