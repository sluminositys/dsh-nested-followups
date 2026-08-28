# dsh-nested-followups

[English](README.md) | 中文

**从任意回答分叉，并在任意层级继续分叉。**

这是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
插件，专门处理可持续递归嵌套的隔离追问，而且插件不设层数上限：先从任意回答岔出
一条侧线，再把侧线中任意层级的任意回答作为下一个隔离 fork 点；新回答仍可继续重复
同一操作，需要多少级就分多少级。每一级只继承自己的祖先链，主任务始终是一条干净的线。

[![npm](https://img.shields.io/npm/v/dsh-nested-followups.svg)](https://www.npmjs.com/package/dsh-nested-followups)
[![测试：156 项通过](https://img.shields.io/badge/tests-156%20passing-brightgreen.svg)](tests)
[![DeepSeek Harness：0.1.x](https://img.shields.io/badge/DeepSeek%20Harness-0.1.x-orange.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![在真实 DeepSeek Harness 会话中从不同层级的回答持续创建多级隔离分支](assets/demo.gif)

_录制环境是未经修改的 DeepSeek Harness `0.1.1-rc.2` Web Profile。界面和
Session 都是真实的，后期只添加了说明字幕和鼠标指针。_

> **主任务 → 一级侧问 → 二级侧问 → 三级侧问 → ……**

- **随时岔出一条侧线。** 一级分支拿到的正好是所选回答当时已有的历史。
- **任意层级都能继续分叉。** 每条侧线里的每个回答都能成为新的隔离 fork 点；到了
  下一级还可以重复同一操作，插件不设嵌套层数上限。
- **主任务保持干净。** 分支里问过什么、答过什么，都不会流回主对话。

## 安装

```sh
dsh plugin --profile web add dsh-nested-followups
```

如果 Web Profile 已经在运行，请重启一次。随后照常打开会话，点击顶栏的
**Tree View**。

<details>
<summary>从源码安装</summary>

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

</details>

## 为什么不新开对话或做普通侧栏？

| 做法 | 保留此前相关上下文 | 不污染主任务 | 能否在任意层级继续分叉 | 侧线仍依附根会话 |
| --- | --- | --- | --- | --- |
| 在主对话里继续问 | 是 | 否 | 否 | 不适用 |
| 新开一个对话 | 丢失，或手工复制 | 是 | 否 | 否 |
| 常见的临时侧栏问答 | 视实现而定 | 通常可以 | 通常仍是一条线 | 通常不会 |
| **dsh-nested-followups** | **精确继承祖先链** | **是** | **可以递归重复，不设固定深度** | **是** |

真正的区别不在画布本身，而在于：任意深度的一条回答都可以成为新的隔离 fork 点，
它的后代仍然适用同一规则。树只是这套递归侧线的地图，让它们始终可见、依附于根会话，
也不会把左侧会话列表塞满。

![主任务旁可以从任意层级持续创建隔离侧线](assets/recursive-branching.png)

_图中画出两层嵌套后以省略号继续：后续每一级的每条回答仍然可以执行相同的 fork 操作。_

## 使用方法

1. 照常聊天。DSH 原来的对话、侧边栏、输入框和消息渲染都不改变。
2. 打开 **Tree View**，选中一条早先的助手回答，点击 **Ask follow-up**。新问题会
   在右侧成为独立分支。
3. 在分支最新的回答上点击 **Continue this branch**，会沿当前分支向下追加一轮；
   再点 **Ask follow-up**，则会向右新建一层隔离分支。之后可以在任意后代回答上重复
   **Ask follow-up**，继续生成更多层级。
4. 随时切回 **Chat** 继续主任务。主对话历史里不会出现任何分支消息。

| 动作 | 生长方向 | 对 Session 的影响 |
| --- | --- | --- |
| **Ask follow-up** | 向右 | 在所选回答处新建一个隔离的子 Session |
| **Continue this branch** | 向下 | 在当前分支 Session 中追加下一轮 |

**Continue this branch** 只会出现在分支最新的已完成回答上，主线节点永远不会提供
这个动作，因此“续聊”和“新建分支”不会混在一起。

## 为什么每一级都是真分支

它不是靠提示词要求模型假装看不见后续消息，也不是把互不相关的聊天画一条连线。

- 每一级分支，包括从另一条分支里继续分出的下一级，都是有持久历史的真实
  DeepSeek Harness Session；
- 相同的 fork 规则会递归应用于所有层级，插件不限制嵌套深度；
- 分支的 seed 是截至所选完整回答为止的精确祖先链，边界语义与 DSH 自带的
  Session fork 路径一致；
- 主任务、父级侧线或同级分支里后来出现的消息，只要不在祖先链上，就不会进入新分支；
- 消息不会向上回流父 Session，也不会横向流入同级分支；
- 分支工具在真正执行时受只读限制，不会因为临时追问改坏共享工作区；
- 请求前缀与分叉点处的父 Session 逐字节兼容，模型服务可以继续复用 prefix cache。

## Tree View 里有什么

- 用户消息和助手回答各自一张卡片，主线向下，隔离分支向右；
- 分支内可线性续聊，也可以不限层级地继续分叉；
- 搜索命中折叠内容时，会先展开祖先链再定位；
- Focus、拖动画布、缩放、适配画布和小地图；
- 点位 → 胶囊 → 卡片的渐进展开，以及一键全收；
- 级联删除，并在确认前准确显示分支数和消息数；
- 重启后恢复分支元数据和每个会话自己的视图状态；
- 分支不会出现在普通的左侧会话列表中。

### 渐进折叠

第一次打开时，树以最小形态出现：一条主线，加上每个分支锚点旁的一枚点位。点击
**⊕** 后显示每条分支各自的胶囊，再点击胶囊才恢复消息卡片。下一级锚点仍保持折叠，
因此展开一层不会把所有后代一次性铺满画布。

按住 Alt 点击 **⊕** 或胶囊，可以深度展开全部后代。**Collapse all** 会把所有一级
分支收回点位。蓝色脉冲表示折叠内容仍在生成，红色表示其中有失败；重启后会按会话
恢复布局。

### 分支只读执行

分支与主对话共用工作目录，所以让一个临时问题拥有写权限并不安全。插件会在工具真正
执行时进行检查：读取类操作放行，写入与未知工具默认拒绝。

允许的工具包括 `read`、`read_image`、`glob`、`grep`、`lsp`、`session_*` 查询
工具、`job_list`、`job_output`、`terminal_list`、`terminal_read`、`list_agents`
和 `get_goal`。代码模式的 `run_code` 仍可使用，因为它调用的每个工具都会被逐个
检查。

### 复用模型服务的 prefix cache

分支沿用父 Session 的配置组合，也不会改写工具定义、提示词段落或呈现格式。因此，
分支请求的开头与父 Session 在分叉点处的请求保持相同。支持请求前缀缓存的模型服务
可以直接复用这段上下文，不必重新读取继承来的整段会话。

## 环境要求

| 项目 | 版本 |
| --- | --- |
| DeepSeek Harness | `0.1.x`（已在 `0.1.0-rc.7`、`0.1.0-rc.8` 和 `0.1.1-rc.2` 上验证） |
| Node.js | 22.19 及以上 |
| 包管理器 | pnpm |

## 兼容性说明

当前版本已在未经修改的 `@deepseek-ai/dsh` `0.1.1-rc.2` 上验证，并继续以
`0.1.0-rc.7` 作为兼容下限。DeepSeek Harness 仍处于开发者预览阶段，后续预发布
版本可能需要更新适配器。

**分支目前不能在原生 Chat 里续聊。** DSH 会拒绝从普通对话界面向 subagent-origin
Session 发送用户消息，因此分支的阅读和续聊都在 Tree View 中完成。插件已经预留对
未来宿主能力的探测，但只有 DSH 明确保证消息可投递时才会启用原生续聊。

**分支可能在 DSH 自带的 Subagent 菜单里显示为禁用的诊断行。** 这些行无法选择，
键盘导航会跳过，也不会计入活跃子代理数量。根会话和左侧栏不受影响，分支 Session
仍不会出现在普通会话列表里。

## 卸载

```sh
dsh plugin --profile web remove dsh-nested-followups
```

卸载会移除插件界面和服务，但不会修改主对话，也不会删除已经持久化的分支历史。

## 开发

```sh
pnpm install
pnpm run check
```

`pnpm run check` 会执行静态检查、宿主端与浏览器端类型检查、156 项单元与集成测试、
生产构建、冒烟测试和发布包校验。

| 命令 | 用途 |
| --- | --- |
| `pnpm run lint` | 静态检查 |
| `pnpm run typecheck` | 宿主端、浏览器端和测试类型检查 |
| `pnpm test` | 单元测试与集成测试 |
| `pnpm run build` | 生产构建 |
| `pnpm run check` | 完整发布门禁 |

## 参与贡献

欢迎提交 Issue 和 Pull Request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并在
提交前运行 `pnpm run check`。

## 许可证

[MIT](LICENSE)
