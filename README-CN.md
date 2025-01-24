# TDengine Node.js Connector

| Github Action Tests                                                                  | CodeCov                                                                                                                           |
|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| ![actions](https://github.com/taosdata/taos-connector-node/actions/workflows/push.yaml/badge.svg) | [![codecov](https://codecov.io/gh/taosdata/taos-connector-node/graph/badge.svg?token=5379a80b-063f-48c2-ab56-09564e7ca777)](https://codecov.io/gh/taosdata/taos-connector-node) |

[English](README.md) | 简体中文

## 目录

- [TDengine Node.js Connector](#tdengine-nodejs-connector)
  - [目录](#目录)
  - [1. 简介](#1-简介)
    - [1.1 Node.js 版本兼容性](#11-nodejs-版本兼容性)
    - [1.2 支持的平台](#12-支持的平台)
  - [2. 获取驱动](#2-获取驱动)
  - [3. 文档](#3-文档)
  - [4. 前置条件](#4-前置条件)
  - [5. 构建](#5-构建)
  - [6. 测试](#6-测试)
    - [6.1 运行测试](#61-运行测试)
    - [6.2 添加用例](#62-添加用例)
    - [6.3 性能测试](#63-性能测试)
  - [7. 提交 Issue](#7-提交-issue)
  - [8.提交 PR](#8提交-pr)
  - [9. 引用](#9-引用)
  - [10. 许可证](#10-许可证)


## 1. 简介

@tdengine/websocket 是 TDengine 官方专为 Node.js 开发人员精心设计的一款高效连接器，它借助 taosAdapter 组件提供的 WebSocket API 与 TDengine 建立连接，摆脱了对 TDengine 客户端驱动的依赖 ，为开发者开辟了一条便捷的开发路径。凭借这一强大工具，开发人员能够轻松构建面向 TDengine 集群的应用程序。不管是执行复杂的 SQL 写入与查询任务，还是实现灵活的无模式写入操作，亦或是达成对实时性要求极高的订阅功能，这款连接器都能轻松胜任、完美实现，全方位满足多样化的数据交互需求。

### 1.1 Node.js 版本兼容性

支持 Node.js 14 及以上版本。

### 1.2 支持的平台

支持所有能运行 Node.js 的平台。

## 2. 获取驱动

使用 npm 安装 Node.js 连接器

```shell
npm install @tdengine/websocket
```

## 3. 文档

- 开发示例请见[开发指南](https://docs.taosdata.com/develop/)
- 版本历史、TDengine 对应版本以及 API 说明请见[参考手册](https://docs.taosdata.com/reference/connector/node/)

## 4. 前置条件

- 安装 Node.js 开发环境, 使用14以上版本。下载链接： https://nodejs.org/en/download/
- 使用 npm 安装 Node.js 连接器
- 使用 npm 安装 TypeScript 5.3.3 以上版本
- 本地已经部署 TDengine，具体步骤请参考 部署服务端，且已经启动 `taosd` 与 `taosAdapter。`

## 5. 构建

在项目 `nodejs` 目录下执行 `tsc` 构建项目。

## 6. 测试

### 6.1 运行测试

在项目的 `nodejs` 目录下，执行 `npm run test` 命令，即可运行 `test/bulkPulling` 目录中的所有测试用例。这些测试用例将连接本地的 `TDengine` 服务器与 `taosAdapter` 进行相关测试。在终端内将实时输出各测试用例的执行结果。待整个测试流程结束，如果所有用例通过，Failures 和 Errors 都是 0, 并且还会给出相应的覆盖率数据。

```text
[INFO] Results:
[INFO] 
[WARNING] Tests run: 2353, Failures: 0, Errors: 0, Skipped: 16
```

### 6.2 添加用例

所有测试在项目的 `nodejs/test/bulkPulling` 目录下，可以新增加测试文件或者在已有的测试文件中添加用例。用例使用 jest 框架，一般在 `beforeAll` 方法中建立连接和创建数据库，在 `afterAll` 方法中删除数据库和释放连接。

### 6.3 性能测试

性能测试还在开发中。

## 7. 提交 Issue

我们欢迎提交 [Github Issue](https://github.com/taosdata/taos-connector-node/issues/new?template=Blank+issue)。 提交时请说明下面信息：

- 问题描述，是否必现
- Nodejs 版本
- @tdengine/websocket 版本
- 连接参数（不需要用户名密码）
- TDengine 服务端版本

## 8.提交 PR

我们欢迎开发者一起开发本项目，提交 PR 时请参考下面步骤：

1. Fork 本项目，请参考 ([how to fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo))
2. 从 main 分支创建一个新分支，请使用有意义的分支名称 (`git checkout -b my_branch`)。注意不要直接在 main 分支上修改。
3. 修改代码，保证所有单元测试通过，并增加新的单元测试验证修改。
4. 提交修改到远端分支 (`git push origin my_branch`)。
5. 在 Github 上创建一个 Pull Request ([how to create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request))。
6. 提交 PR 后，如果 CI 通过，可以在 [codecov](https://app.codecov.io/gh/taosdata/taos-connector-node/) 页面找到自己分支，看单测覆盖率。

## 9. 引用

- [TDengine 官网](https://www.taosdata.com/)
- [TDengine GitHub](https://github.com/taosdata/TDengine)

## 10. 许可证

[MIT License](./LICENSE)
