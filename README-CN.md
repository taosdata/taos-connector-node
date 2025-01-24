#  TDengine Node.js Connector

| Github Action Tests                                                                  | CodeCov                                                                                                                           |
|--------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| ![actions](https://github.com/taosdata/taos-connector-node/actions/workflows/push.yaml/badge.svg) | [![codecov](https://codecov.io/gh/taosdata/taos-connector-node/graph/badge.svg?token=5379a80b-063f-48c2-ab56-09564e7ca777)](https://codecov.io/gh/taosdata/taos-connector-node) |

[English](README.md) | 简体中文

## 简介

@tdengine/websocket 是 TDengine 官方专为 Node.js 开发人员精心设计的一款高效连接器，它借助 taosAdapter 组件提供的 WebSocket API 与 TDengine 建立连接，摆脱了对 TDengine 客户端驱动的依赖 ，为开发者开辟了一条便捷的开发路径。凭借这一强大工具，开发人员能够轻松构建面向 TDengine 集群的应用程序。不管是执行复杂的 SQL 写入与查询任务，还是实现灵活的无模式写入操作，亦或是达成对实时性要求极高的订阅功能，这款连接器都能轻松胜任、完美实现，全方位满足多样化的数据交互需求。

### Node.js 版本兼容性

支持 Node.js 14 及以上版本。

### 支持的平台

支持所有能运行 Node.js 的平台。

## 获取驱动

使用 npm 安装 Node.js 连接器

```shell
npm install @tdengine/websocket
```

## 文档

- 开发示例请见[开发指南](https://docs.taosdata.com/develop/)
- 版本历史、TDengine 对应版本以及 API 说明请见[参考手册](https://docs.taosdata.com/reference/connector/node/)

## 开发指南

### 前置条件

- 安装 Node.js 开发环境, 使用14以上版本。下载链接： https://nodejs.org/en/download/
- 使用 npm 安装 Node.js 连接器

### 构建执行

编写示例程序后使用 node xxx.js 即可运行。

### 测试

1. 执行测试前，请确保已安装 `TDengine` 服务端，并且已启动 `taosd` 和 `taosAdapter`，同时保证数据库处于干净无数据的状态。
2. 在项目 `nodejs` 目录下执行 `npm run test` 运行测试，测试会连接到本地的 `TDengine` 服务器与 `taosAdapter` 进行测试。
3. 输出结果 PASS 为测试通过，FAIL 为测试失败，测试结束后会输出覆盖率数据。

## 提交 Issue

我们欢迎提交 [Github Issue](https://github.com/taosdata/taos-connector-node/issues/new?template=Blank+issue)。 提交时请说明下面信息：

- 问题描述，是否必现
- Nodejs 版本
- @tdengine/websocket 版本
- 连接参数（不需要用户名密码）
- TDengine 服务端版本

## 提交 PR
我们欢迎开发者一起开发本项目，提交 PR 时请参考下面步骤：
1. Fork 本项目，请参考 ([how to fork a repo](https://docs.github.com/en/get-started/quickstart/fork-a-repo))
2. 从 main 分支创建一个新分支，请使用有意义的分支名称 (`git checkout -b my_branch`)。注意不要直接在 main 分支上修改。
3. 修改代码，保证所有单元测试通过，并增加新的单元测试验证修改。
4. 提交修改到远端分支 (`git push origin my_branch`)。
5. 在 Github 上创建一个 Pull Request ([how to create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request))。
6. 提交 PR 后，如果 CI 通过，可以在 [codecov](https://app.codecov.io/gh/taosdata/taos-connector-node/) 页面找到自己分支，看单测覆盖率。

## 引用

- [TDengine 官网](https://www.taosdata.com/)
- [TDengine GitHub](https://github.com/taosdata/TDengine)

## 许可证

[MIT License](./LICENSE)




