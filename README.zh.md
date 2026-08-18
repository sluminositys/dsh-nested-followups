# dsh-nested-followups

[English](README.md) | 中文

`dsh-nested-followups` 为
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面增加消息级会话树。
你可以从一条已完成回答创建隔离分支，在分支里继续深挖，同时让主会话保持原样。

插件只做增量扩展：DSH 原生 Chat 仍是默认视图，原始 Session 日志仍是唯一事实源，
安装插件不需要修改或补丁 DeepSeek Harness 核心。

## 交互模型

Tree View 把每条用户消息和助手消息分别显示成卡片。主会话向下生长，追问分支向右
生长。

两个动作具有严格不同的语义：

- **创建子分支（Ask follow-up）**：从选中的已完成 assistant 消息创建新分支，
  向右生长，只继承到该安全回合边界为止的历史。
- **继续当前分支（Continue this branch）**：向当前分支追加下一轮，向下生长；
  只出现在分支最新的已完成 assistant 消息上，主线永远不显示该动作。

这种区别不仅体现在文案和外观上，也落实在数据结构中：Continue 不会新建分支，
Ask follow-up 不会向当前分支追加消息。

Tree View 还提供完整消息详情、搜索、聚焦、折叠、平移、缩放、适应画布和小地图。
这些控件只改变展示状态，不改变会话数据。

## 隔离与纯聊天执行

每条分支都是一个真实 DSH Session，并从经过验证的完整回合边界获得 seed。主会话
后续消息不会进入分支，分支消息不会进入主会话，兄弟分支之间也不会交换新增回合。

分支 prompt 由插件 Host 侧直接提交。无论首次创建还是冷恢复，Branch Agent 都会
被强制放入纯聊天作用域：

- 强制使用 native 工具呈现，禁用 Code Mode；
- 全局工具 allowlist 为空；
- 最终执行 guard 拒绝其他插件后来注册的任何局部工具；
- prompt 最终组装时再次移除任何绕过注册期控制的工具 schema。

因此分支不能执行命令、读写文件或调用工具。插件不会安装 rc.7 的 subagent
descriptor，也不会安装 `report` 工具。

## DeepSeek Harness rc.7 行为

当前目标是未修改的 `@deepseek-ai/dsh` `0.1.0-rc.7`。

Branch Session 使用可持久化的 `origin: "subagent"` 标记。它可以让分支不出现在
workspace/session 总览中，同时保留完整日志。rc.7 也把该标记作为 ownership fence：
原生 Chat 可以读取分支日志，但会拒绝向分支发送 prompt。因此当前版本不提供
**Open Branch** 动作；完整阅读和全部分支续聊都在 Tree View 中完成。

rc.7 内置的 Subagent 菜单可能把没有 descriptor 的分支显示成禁用的诊断行。
这是 Root Session 内部的视觉泄漏：诊断行不可交互，也不参与键盘导航；但菜单入口的
后代数量仍可能计入带有该 origin 标记的分支。

插件在独立 adapter 中为未来上游的
`startChatOnlyContinuableAtBoundary` 能力保留了探测位。只有命名方法和明确的 v1
原生用户投递声明同时存在时才启用，避免仅支持创建的 API 误开可写原生界面。在这
两个条件满足之前，原生分支续聊保持禁用。

## 从源码安装

本包目前尚未发布到 npm。

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

如果 DSH Web profile 已经运行，请在安装后重启。

卸载插件：

```sh
dsh plugin --profile web remove dsh-nested-followups
```

卸载只会注销插件 UI 和服务，不会改写 Root Session，也不会自动删除 Branch Session
日志。

## 开发

```sh
pnpm install
pnpm run check
```

`check` 会运行 lint、Host 与 Client 类型检查、单元/集成测试、生产构建和发布包校验。

Node.js 要求为 22.19 或更高，与 rc.7 一致。

## 项目状态

项目正在开发中。DeepSeek Harness 仍处于 Developer Preview，候选版本之间的 adapter
契约可能变化。

## 许可证

[MIT](LICENSE)
