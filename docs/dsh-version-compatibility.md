# DSH version compatibility

This document records which DeepSeek Harness line to use, how to install the
plugin for that line, and where the compatibility boundary lives in the code.

## Supported tracks

| DSH line | Install | Validation | Release policy |
| --- | --- | --- | --- |
| `0.1.0-rc.7` through `0.1.1-rc.2` | npm `dsh-nested-followups@0.2.2` | Stable matrix; `0.1.1-rc.2` is the development baseline | Published |
| `0.1.2-alpha.x` | Source branch `compat/dsh-0.1.2-alpha` | Preview matrix; verified on `0.1.2-alpha.4` | Git source only |
| Stable `0.1.2` | Not yet supported as a stable contract | Revalidate after the exact release exists | Next plugin version and npm release |

The alpha branch intentionally keeps package version `0.2.2`. A package
version change would imply an npm release, which is deferred until DSH's new
contract is stable.

## User installation

Stable release-candidate line:

```sh
dsh plugin --profile web add dsh-nested-followups@0.2.2
```

Alpha source line:

```sh
git clone --branch compat/dsh-0.1.2-alpha --single-branch https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
corepack pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.4 plugin --profile web add .
corepack pnpm dlx @deepseek-ai/dsh@0.1.2-alpha.4 web
```

The profile records a `link:` dependency on the checkout. Rebuild after every
pull. Pinning the CLI in both commands prevents an older globally installed
DSH binary from composing the wrong profile.

## Contract bridge

| Capability | rc contract | `0.1.2-alpha` contract | Plugin boundary |
| --- | --- | --- | --- |
| Read live events | `session.events` | `session.snapshotEvents()` | `src/host/adapter/session-compat.ts` |
| Read fork cut | `header.seedLength` | `header.isSeeded` plus `session.inheritedEventCount` | `src/host/adapter/session-compat.ts` |
| Read persisted fork cut | `meta.seedLength` | `meta.isSeeded` plus inspection `inheritedEventCount` | `src/host/adapter/session-compat.ts` |
| Create fork-equivalent branch | `meta.seedLength` | `meta.isSeeded: true` plus create option `inheritedEventCount` | `src/host/adapter/visibility.ts` and `session-fork.ts` |
| Conversation view store | exported `ChatStore` | renamed/split `ConversationStore` | structural bridge in `src/client/compat.ts` |
| Markdown labels | `codeLabels` | `labels` | compatibility wrapper in `ConversationTreeCanvas.tsx` |

The rest of the tree, branch, persistence, and read-only execution code uses
one internal vocabulary. No DSH package is patched, no DOM is scanned, and no
event log is rewritten.

## Verification gate

Before updating this compatibility claim:

1. Run `pnpm run check` with the stable development dependency set.
2. In a disposable worktree, install the exact alpha DSH package set and run
   the same gate. Both matrices currently contain 27 test files and 162 tests.
3. Build from the normal stable dependency set, install that checkout into an
   isolated alpha profile with `dsh plugin --profile web add .`, and boot the
   alpha Web UI.
4. Confirm the profile dependency is `link:<checkout>`, the boot manifest
   contains both plugin entries, and the browser reports no warning or error.

On 2026-09-02 this full procedure passed for `0.1.1-rc.2` and
`0.1.2-alpha.4` using an unmodified DSH host.

## 中文摘要

- DSH `0.1.0-rc.7` 到 `0.1.1-rc.2`：继续安装 npm `0.2.2`。
- DSH `0.1.2-alpha.x`：只从 `compat/dsh-0.1.2-alpha` 分支安装源码；当前实测版本是
  `0.1.2-alpha.4`。
- 不给 DSH 打补丁；同一套插件源码在适配器边界兼容两代 Session 与 Client 契约。
- alpha 阶段不升级插件版本、不发布 npm。等 DSH `0.1.2` 正式版发布后，针对正式
  契约重新验证，再发布插件的下一个正式版本。
