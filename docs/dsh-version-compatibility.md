# DSH version compatibility

## Installation tracks

| Exact DSH target | Plugin source | Policy |
| --- | --- | --- |
| `0.1.0-rc.7` through `0.1.1-rc.2` | npm `dsh-nested-followups@0.2.3` | Legacy host support retained |
| `0.2.1-rc.5` | npm `dsh-nested-followups@0.2.3` | Current development target |
| `0.2.1-alpha.1` | Same package | Reporter runtime from issue #1 |
| `0.2.2-alpha.2` | Same package | Additional alpha matrix; Node >=24.9 |

Version `0.2.3` packages the current compatibility adapters for npm installation,
with matching GitHub tag `v0.2.3`. The old npm `0.2.2` artifact is unchanged and
remains available for legacy rollback. Unlisted host versions are not individually
verified just because a dependency range permits installation.

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
  npm `0.2.3` includes those adapters and the corrected compatibility declaration.
  Install `dsh-nested-followups@0.2.3` explicitly if a catalog still selects the
  older `0.2.2` artifact.

The two failure paths are reproduced in an isolated Windows Unicode-named
DSH_HOME. A locally packed artifact of the fixed source installs successfully
through the official `0.2.1-rc.5` CLI without a compatibility exemption.
The resulting isolated Web profile starts on loopback, returns HTTP 200, and
advertises the plugin client in its boot manifest. No live model request or
packaged Desktop UI is exercised by this smoke check.

## Web and official Desktop

Follow the [English installation instructions](../README.md#install) or
[中文安装说明](../README.zh.md#安装).

Web uses `dsh plugin --profile web add dsh-nested-followups@0.2.3`. Official Desktop uses the same Web
client plugin contract (`dsh.client.platform: "web"`), but a separate
`desktop` profile. No native window, Electron IPC, or `dsh-app://` navigation
is needed by this plugin.

For a supported Desktop version, initialize the app once, install its bundled CLI with
**Manage dsh Command…**, fully quit it, then run
`dsh plugin --profile desktop add dsh-nested-followups@0.2.3` and reopen the app.
Use `.` from a built checkout only when installing local source.
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

## rc.5 installation regression (2026-11-04)

The target remains **DSH `0.2.1-rc.5`**, not the newer alpha channel. The npm
`0.2.3` package already contains the rc.5 adapters; no host exemption, core patch,
or another plugin version is required for this installation failure.

Issue #3 can still reproduce immediately after publication, even when the npm
`latest` tag points to the fixed version:

| Official rc.5 CLI, isolated Web profile | Resolved package | Result |
| --- | --- | --- |
| `add dsh-nested-followups@latest` | `0.2.2` | Host rejects its old compatibility range and rolls back |
| Same request, fresh profile, explicit official npm registry | `0.2.2` | Same rejection; not explained by a registry mirror alone |
| `add dsh-nested-followups@0.2.3` | `0.2.3` | Installs without a host compatibility exemption |

The test ran while `0.2.3` was less than a day old. pnpm 11 defaults to a
1440-minute `minimumReleaseAge`; an explicit version request in its default
non-strict mode adds a package-version-specific `minimumReleaseAgeExclude` entry.
The successful install recorded exactly `dsh-nested-followups@0.2.3`. It did not
turn off the profile's general supply-chain or lifecycle checks.
As a control, reducing only the release-age threshold to one hour in another
disposable test process made the same official-registry `@latest` request resolve
to `0.2.3`. No user's profile or global setting was changed for that experiment.
See the [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0#security--build-defaults).

Use the exact-version commands in the README. Do **not** use `allow-version` to
force the old `0.2.2` package onto rc.5. The installer chooses the package before
this plugin loads, so changing the plugin's runtime code cannot fix an earlier
package-resolution decision. Likewise, a plugin-market page showing `0.2.2`
does not by itself establish which package a subsequent install will resolve.

The rc.5 client-entry tests now use real Cordis lifecycles and the public
`SlotCore`, rather than only rendering the toggle component in isolation. They
exercise Remote mount/namespace readiness, the shared conversation view store,
late slot declarations, missing-store degradation, failed mounts, and cleanup of
slots, dictionaries, controllers, connection handlers, and the Remote mount.
The Remote transport and browser-only rendering primitives are test doubles;
these tests do not claim to be a packaged Desktop end-to-end run.

The rc.5 full gate passes **238 tests in 34 files**, including lint, TypeScript,
build, package smoke checks, and publint. In a separate real Chromium run, the
registry-installed `0.2.3` client opens Tree View and renders all six fixture
messages, restores the six cards after a page reload, and switches back to native
Chat. No page or console errors were recorded. No live model request is needed
for that activation check; a packaged Desktop window was not exercised.

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

Release `0.2.3` keeps the unfinished Context Preview control hidden until its
reading panel exists. Its data-model tests remain, but it is not a user-facing
feature of this release. The published package contains prebuilt Host and client
entries; normal npm installation does not compile the Git checkout.

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

- npm `0.2.3` 同时包含旧版宿主和当前 `0.2.1-rc.5`、已验证 alpha 版本的适配。
  不再要求从 Git 安装；`0.2.2` 保留用于旧版回退。
- 桌面端不需要重新实现界面，但要用其自带 CLI 装进 `desktop` Profile；
  普通 `web` 安装不会自动带过去。使用桌面端自带命令安装 npm `0.2.3` 即可。
- 同一份源码在上表四个版本中各通过 234 项测试及完整检查。桌面安装包尚未做端到端验证。
- 正常使用推荐安装 npm `0.2.3`。只有 Git 直接安装仍受 pnpm 的构建脚本授权约束；
  开发时可以克隆、构建后安装本地目录，插件不会修改用户的授权名单。
- 新版的会话格式由 DSH 负责迁移，插件不改写日志，也不负责降级。
