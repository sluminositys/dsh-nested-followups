# dsh-nested-followups

[English](README.md) | 中文

`dsh-nested-followups` 为
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面增加消息级会话树。
用户可以在独立的 Tree View 中查看当前会话，并针对任意历史回复发起多级追问，
而不会把这些追问追加到主会话中。

DSH 原有聊天界面仍是默认视图。插件只使用 DSH 提供的扩展点和服务，不替换原有
会话界面，也不改写原始 session 事件日志。

## 工作方式

Tree View 将每条用户消息和助手回复显示为一张紧凑卡片。主会话保持纵向排列；
从历史回复发起的追问显示在该回复右侧，追问的回答还可以继续产生下一层分支。

每条分支使用独立的 DSH session，并且只继承所选消息之前的历史。主会话后续消息
不会进入分支，分支消息也不会进入主会话。需要长时间交流时，可以把分支打开到
DSH 原有聊天界面中继续。

Tree View 用于：

- 查看主会话及其所有追问分支；
- 针对任意已经完成的历史回复提问；
- 在相互隔离的上下文中继续多级追问；
- 聚焦或折叠大型会话树，并通过小地图定位；
- 在 DSH 原有聊天界面中打开分支。

## 兼容性

当前开发目标为 Web profile 下的 `@deepseek-ai/dsh` `0.1.0-rc.7`。DeepSeek
Harness 仍处于 Developer Preview 阶段，不同候选版本之间的插件接口可能变化。

Node.js 版本要求为 `22.19` 或更高，与当前 DSH 保持一致。

## 从源码安装

本包目前尚未发布到 npm。可以从源码目录安装：

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

如果 DSH Web profile 正在运行，安装后请重新启动。

卸载插件：

```sh
dsh plugin --profile web remove dsh-nested-followups
```

卸载会移除插件界面和配置，但不会改写原始会话日志。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

`pnpm run check` 会依次运行以上检查，并验证发布包结构。

## 项目状态

项目正在开发中。首个稳定版本发布前，数据格式和 DSH 兼容范围可能调整。

## 许可证

[MIT](LICENSE)
