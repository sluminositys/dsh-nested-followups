# DSH version compatibility

## Installation tracks

| Exact DSH target | Plugin source | Policy |
| --- | --- | --- |
| `0.1.0-rc.7` through `0.1.1-rc.2` | npm `dsh-nested-followups@0.2.2` | Existing published artifact |
| `0.2.1-rc.5` | `main` or `dsh-0.2` | Current development target; source only |
| `0.2.1-alpha.1` | Same source | Reporter runtime from issue #1 |
| `0.2.2-alpha.2` | Same source | Additional alpha matrix; Node >=24.9 |

The npm artifact is **not** replaced by pulling a source branch. No new npm
version, tag, or GitHub Release is produced by this adaptation. Unlisted host
versions are not individually verified just because a dependency range permits
installation.

The manifest declares `engines.dsh` and matching DSH peer ranges. DSH's preflight
uses `includePrerelease: true`; upper bounds therefore use `-0` to exclude the
next line's previews as well as its releases. In particular, `0.2.0-rc.1` and
`0.3.0-alpha.1` are not accidentally admitted by an earlier range arm.

## Installation failures (#1 and #3)

- **#1 — Git prepare authorization:** the direct default-branch Git install
  reproduces `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` on current DSH/pnpm. Git
  packages must run this package's `prepare` build. Clone the source, build it,
  and install the local directory as documented in the README, or explicitly
  approve only the exact Git package key printed by pnpm. The plugin does not
  modify the profile's `allowBuilds` or disable lifecycle protection. The
  reporter's older CLI supplied no detailed pnpm log, so its exact internal
  failure is not claimed as proven solely from that generic message.
- **#3 — old npm artifact:** registry `dsh-nested-followups@0.2.2` still declares
  DSH `<0.2.0` and is rejected by `0.2.1-rc.5` before installation. The source
  manifest now declares the current host range; the source fixes are shared by
  `main` and `dsh-0.2` rather than being stranded on a non-default branch.
  This does **not** update the immutable npm artifact or the registry's `latest`
  tag. A separately approved npm release is still required for market users.

The two failure paths are reproduced in an isolated Windows Unicode-named
DSH_HOME. A locally packed artifact of the fixed source installs successfully
through the official `0.2.1-rc.5` CLI without a compatibility exemption.
The resulting isolated Web profile starts on loopback, returns HTTP 200, and
advertises the plugin client in its boot manifest. No live model request or
packaged Desktop UI is exercised by this smoke check.

## Web and official Desktop

Follow the [English installation instructions](../README.md#install) or
[中文安装说明](../README.zh.md#安装).

Web uses `dsh plugin --profile web add .`. Official Desktop uses the same Web
client plugin contract (`dsh.client.platform: "web"`), but a separate
`desktop` profile. No native window, Electron IPC, or `dsh-app://` navigation
is needed by this plugin.

For a supported Desktop version, initialize the app once, install its bundled CLI with
**Manage dsh Command…**, fully quit it, then run
`dsh plugin --profile desktop add .` from the built checkout and reopen the app.
An npm-installed CLI cannot manage the Desktop profile. Web and Desktop share
supported product data, not plugin installations, activation, or lockfiles.

Sources: [Desktop runtime/profile ownership](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/apps/desktop/README.md#bundled-command-runtime),
[0.2.1-rc.5 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.5),
[0.2.2-alpha.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2).

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

Explicit `reasoningEffort` is inherited along with the fork-boundary route;
adapter-defaulted effort remains implicit. The 0.2.2 test composition mounts
the official native executor separately, then exercises its real batch API and
the same read-only guard. Production continues to inherit its source preset;
no executor is added as a hard plugin dependency or to the prompt schema.

## Verification record (2026-11-03)

The same source passes the full `pnpm run check` gate on all four matrices:

| Exact DSH target | Tests | Notes |
| --- | --- | --- |
| `0.1.1-rc.2` | 234 in 33 files | Cordis `4.0.1`, loader `1.0.4` |
| `0.2.1-alpha.1` | 234 in 33 files | Issue #1 host generation |
| `0.2.1-rc.5` | 234 in 33 files | Development lockfile; Cordis `4.0.5`, loader `1.0.6` |
| `0.2.2-alpha.2` | 234 in 33 files | Matching native-executor dev dependency for real execution tests |

The gate includes lint, Host/Client/test TypeScript checks, tests, build, ESM
smoke checks, and publint. The tests cover isolated first turns and Continue,
nested seeds, read-only tool denial, unchanged assembled prefixes, and reasoning
effort. The manifest tests mirror DSH's prerelease-aware install policy.

These are automated compatibility checks and CLI installation checks, not a
packaged Desktop or live-provider end-to-end demonstration. The earlier Web
browser verification is recorded separately below.

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

- 老版 DSH 可继续用已发布的 npm `0.2.2`；当前 `0.2.1-rc.5` 及已验证的 alpha
  版本用 `main` 或 `dsh-0.2` 源码。本次同步默认分支，不发布新包。
- 桌面端不需要重新实现界面，但要用其自带 CLI 装进 `desktop` Profile；
  普通 `web` 安装不会自动带过去。
- 同一份源码在上表四个版本中各通过 234 项测试及完整检查。桌面安装包尚未做端到端验证。
- Git 直接安装受 pnpm 的构建脚本授权约束；推荐克隆、构建后安装本地目录。
  npm `latest` 仍是旧包，必须另行发布才能修复市场中的 npm 安装路径。
- 新版的会话格式由 DSH 负责迁移，插件不改写日志，也不负责降级。
