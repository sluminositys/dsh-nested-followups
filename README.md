# dsh-nested-followups

English | [中文](README.zh.md)

`dsh-nested-followups` adds a message-level conversation tree to the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI. It
lets you branch from a completed answer, explore that question in an isolated
conversation, and keep the main conversation unchanged.

The plugin is additive. Standard DSH Chat remains the default view, existing
session logs remain the source of truth, and installing the plugin requires no
patches to DeepSeek Harness.

## Interaction model

Tree View renders each user and assistant message as a separate card. The main
conversation grows downward, while follow-up branches grow to the right.

Two actions have deliberately different meanings:

- **Ask follow-up** creates a new child branch from the selected completed
  assistant message. It grows to the right and receives only the history up to
  that safe turn boundary.
- **Continue this branch** appends the next turn to the current branch. It grows
  downward, appears only on the latest completed assistant message of a branch,
  and never appears on the main conversation.

The distinction is structural as well as visual: Continue never creates a new
branch, and Ask follow-up never appends to the current branch.

Tree View also provides message details, search, focus, collapse, pan, zoom,
fit-to-view, and a minimap. These controls only change presentation state.

## Isolation and chat-only execution

Every branch is a real DSH session seeded at a validated completed-turn
boundary. Later main-thread messages do not enter the branch, branch messages
do not enter the main conversation, and sibling branches do not share their new
turns.

Branch prompts are submitted by the plugin on the Host side. On both initial
creation and cold resume, the branch Agent is forced into a chat-only scope:

- native tool presentation is selected, so Code Mode is unavailable;
- the global tool allowlist is empty;
- a final execution guard rejects any scope-local tool contributed later; and
- prompt assembly strips any tool schema that escaped registration-time controls.

Branches therefore cannot run commands, read or write files, or call tools.
The plugin does not install the rc.7 subagent descriptor or `report` tool.

## DeepSeek Harness rc.7 behavior

The current target is `@deepseek-ai/dsh` `0.1.0-rc.7`, unmodified.

Branch sessions use the durable `origin: "subagent"` marker. This keeps them
out of the workspace/session overview while preserving their logs. rc.7 also
uses that marker as an ownership fence: native Chat may display a branch log,
but it rejects attempts to send a prompt to that branch. For that reason this
version does not expose an **Open Branch** action; complete reading and all
branch continuation happen inside Tree View.

rc.7's built-in Subagent menu may show descriptor-less branches as disabled
diagnostic rows. This is a cosmetic leak inside the owning root session. The
rows are non-interactive and excluded from keyboard navigation. The built-in
menu trigger may still include origin-classified branches in its descendant
total.

An isolated adapter probe is reserved for a future upstream
`startChatOnlyContinuableAtBoundary` capability. It requires both the named
method and an explicit v1 native-user-delivery advertisement, so a creation-only
API cannot accidentally enable a writable native surface. Until both exist,
native branch continuation remains intentionally disabled.

## Installation from source

The package is not currently published to npm.

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

Restart the DSH web profile if it is already running.

To remove the plugin:

```sh
dsh plugin --profile web remove dsh-nested-followups
```

Removal unregisters the plugin UI and services. It does not rewrite the root
conversation or automatically delete branch session logs.

## Development

```sh
pnpm install
pnpm run check
```

`check` runs linting, Host and Client type checks, unit/integration tests, the
production build, and package publication validation.

Node.js 22.19 or later is required, matching rc.7.

## Status

This project is under active development. DeepSeek Harness is in Developer
Preview, so adapter contracts may change between release candidates.

## License

[MIT](LICENSE)
