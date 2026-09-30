# DSH version compatibility

## Installation tracks

| Exact DSH target | Plugin source | Policy |
| --- | --- | --- |
| `0.1.0-rc.7` through `0.1.1-rc.2` | npm `dsh-nested-followups@0.2.2` | Existing published artifact |
| `0.2.0-rc.2` | `compat/dsh-0.2` | Git source only; package version remains `0.2.2` |
| `0.1.2-alpha.4` | Earlier `compat/dsh-0.1.2-alpha` branch | Historical preview; not the current development target |

The npm artifact is **not** replaced by pulling a source branch. No new npm
version, tag, or GitHub Release is produced by this adaptation. Unlisted host
versions are not individually verified just because a dependency range permits
installation.

## Web and official Desktop

Follow the [English installation instructions](../README.md#install) or
[中文安装说明](../README.zh.md#安装).

Web uses `dsh plugin --profile web add .`. Official Desktop uses the same Web
client plugin contract (`dsh.client.platform: "web"`), but a separate
`desktop` profile. No native window, Electron IPC, or `dsh-app://` navigation
is needed by this plugin.

For Desktop `0.2.0-rc.2`, initialize the app once, install its bundled CLI with
**Manage dsh Command…**, fully quit it, then run
`dsh plugin --profile desktop add .` from the built checkout and reopen the app.
An npm-installed CLI cannot manage the Desktop profile. Web and Desktop share
supported product data, not plugin installations, activation, or lockfiles.

Sources: [Desktop runtime/profile ownership](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/apps/desktop/README.md#bundled-command-runtime),
[0.2.0-rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2).

## Contract bridge

| Capability | Legacy rc | Current 0.2 | Plugin boundary |
| --- | --- | --- | --- |
| Live history | `session.events` | `snapshotEvents()` | `host/adapter/session-compat.ts` |
| Fork cut | Header `seedLength` | `isSeeded` + `inheritedEventCount` | `session-compat.ts`, `visibility.ts` |
| Cold history | `readFrom`, `listSnapshots` | `open(id, 'read')` + handle `read/close`, `list` | `session-compat.ts` |
| Live answer | Durable `assistant/chunk` | Process-local `agent/assistant-stream` | `assistant-stream.ts`, `tree-service.ts` |
| Tool result correlation | First content block | Message-level `toolCallId` / `isError` | `host/projection.ts` |
| Strict Remote codecs | `schema` | Lazy `create()` factory | `remote-descriptors.ts` |
| Native icons / user text | Size-named icons, `MessageText` | Weight-named icons, `projectUserText` | `client/primitives-compat.tsx` |
| Conversation views | `ChatStore` | Shared `ConversationStore` | `client/compat.ts` |

Handles always open with **read** access, and close in `finally`, including on
failure. They never compete for the Agent's write ownership. Live frames are
held separately from the durable log; missing revisions discard partial output
instead of inventing it. Final logged answers remain authoritative.

Newer DSH can synthesize closing records when forking an open turn. This plugin
does **not** use that behavior: follow-ups still require the selected turn to
be complete, and `OPEN_TURN` remains the adapter's rejection code. Completed
prefixes and invalid-boundary classifications are tested against official
`SessionStore.fork`. No event log, request assembly, tool schema, or prompt is
rewritten. Read-only restrictions remain execution-time guards.

## Verification record (2026-09-30)

- DSH `0.2.0-rc.2` / Cordis `4.0.4`: full `pnpm run check` passed.
- Legacy DSH `0.1.1-rc.2` / Cordis `4.0.1`: the same source passed the full
  gate in a separate checkout. Both matrices contain 220 tests in 33 files.
- An isolated `0.2.0-rc.2` Web profile accepts a `link:` installation and boots
  the plugin without modifying the user's regular profile. A fixture session
  renders six message cards; the header toggle, native Chat return, follow-up
  composer, and view restoration after page reload are checked in the browser.
- No live model call or packaged Desktop run was made during this smoke check.
  First-turn, Continue, nesting, and read-only behavior are covered by automated
  tests, not claimed as a recorded model-backed Desktop demonstration.
- Packaged official Desktop has **not** received an end-to-end test here.
  Sharing the Web renderer is architectural evidence, not a substitute for
  testing its installed runtime and native window.

For maintenance, use disposable checkouts with all `@deepseek-ai/dsh-*`
development dependencies pinned to one exact target. Do not mix host generations
inside a profile, or test against the user's active sessions. Re-run the full
gate, then check real plugin activation, view switching, branch creation,
Continue, nested branching, streamed output, reload, and read-only tool denial.

DSH owns migration of its session formats. This plugin neither migrates nor
downgrades them. Back up your DSH data before changing host versions; preserving
the plugin's metadata does not make a newer DSH log readable by an older host.

## 中文摘要

- 老版 DSH 继续用已发布的 npm `0.2.2`；当前 `0.2.0-rc.2` 用
  `compat/dsh-0.2` 源码，不发布新包、不改主分支。
- 桌面端不需要重新实现界面，但要用其自带 CLI 装进 `desktop` Profile；
  普通 `web` 安装不会自动带过去。
- 同一份源码已通过新版和 `0.1.1-rc.2` 的完整检查。桌面安装包尚未做端到端验证。
- 新版的会话格式由 DSH 负责迁移，插件不改写日志，也不负责降级。
