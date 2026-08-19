# dsh-nested-followups

English | [中文](README.zh.md)

![dsh-nested-followups — a nested follow-up conversation tree for DeepSeek Harness](https://raw.githubusercontent.com/sluminositys/dsh-nested-followups/main/assets/banner.png)

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
that adds a conversation tree to the web interface. Ask a follow-up question
about any earlier answer, and it opens as an isolated branch instead of being
appended to the end of your main conversation.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.7-orange.svg)](https://github.com/deepseek-ai/deepseek-harness)

## The problem it solves

A DeepSeek Harness conversation is linear. When you are part way through an
engineering task and you want to ask what a term in an earlier answer means,
you have two poor options: ask in the main conversation, which mixes an
unrelated question into the task context and keeps sending it with every later
request, or start a new conversation, which loses the context that made the
question worth asking.

This plugin adds a third option. The follow-up becomes a branch that inherits
the conversation up to the answer you asked about, and nothing else. Your main
conversation never sees it.

## Features

- **A tree view of the current conversation.** Every user and assistant message
  is a separate card. The main conversation runs downward; branches grow to the
  right.
- **Follow-up questions at any depth.** A branch answer can be branched from
  again, with no limit on nesting.
- **Genuine context isolation.** Each branch is a real, separate session created
  with the official fork mechanism, not a prompt-level instruction to ignore
  something.
- **Read-only branches.** A branch can read the workspace but cannot modify it,
  so a follow-up can never disturb work in progress in the main conversation.
- **No interference with the standard interface.** The regular chat view, the
  sidebar, and message rendering are unchanged. Branches do not appear in the
  session list.
- **Reuses the model provider's cached context.** A branch sends the same
  request prefix as the main conversation, so it does not pay to re-read the
  inherited history.

## Requirements

| Requirement | Version |
| --- | --- |
| DeepSeek Harness | `0.1.0-rc.7` (unmodified) |
| Node.js | 22.19 or later |
| Package manager | pnpm |

## Installation

This package is not yet published to npm, so install it from source:

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

Restart the DeepSeek Harness web profile if it is already running.

To uninstall:

```sh
dsh plugin --profile web remove dsh-nested-followups
```

Uninstalling removes the plugin's interface and services. It does not modify
your main conversation and does not delete branch history.

## Usage

Open a conversation as usual and select **Tree View** in the conversation
header. Switching between **Chat** and **Tree View** changes only how the
conversation is displayed; no data is copied or converted.

In Tree View:

1. Move the pointer over a completed assistant message and select
   **Ask follow-up**.
2. Type your question. It appears as a card to the right of the answer you
   asked about, and the reply is generated below it.
3. To keep talking within that branch, select **Continue this branch** on its
   most recent answer. To isolate the context one level further, select
   **Ask follow-up** again.
4. Select any card to read the full message. Use search, focus, collapse, the
   overview map, and the zoom controls to navigate larger trees.

Return to **Chat** whenever you want to continue the main task.

### Two actions, two meanings

The difference between the two actions is structural, not just visual:

| Action | Direction | Effect |
| --- | --- | --- |
| **Ask follow-up** | Grows right | Creates a new branch that inherits the conversation up to the selected answer |
| **Continue this branch** | Grows down | Adds the next exchange to the current branch |

**Ask follow-up** never appends to an existing branch, and **Continue this
branch** never creates one. **Continue this branch** appears only on the most
recent completed answer within a branch, never in the main conversation.

### Deleting a branch

Deleting a branch also deletes every branch below it. The confirmation dialog
states how many branches and messages will be removed. Your main conversation
and any sibling branches are unaffected.

## How it works

### Branch isolation

Each branch is a real DeepSeek Harness session created from a completed turn in
its parent. A branch created from answer A2 inherits the conversation from the
beginning through A2. It does not receive anything the main conversation does
afterwards, and the main conversation never receives anything from the branch.
Sibling branches created from the same answer cannot see each other's messages.

Branches are recorded as subagent-origin sessions. This keeps them out of the
session list while preserving their history, so a branch belongs to its main
conversation rather than becoming a separate item you have to manage.

### Read-only execution

A branch runs as a read-only agent: it can inspect the workspace, but it cannot
change anything.

This is enforced when a tool actually runs, not by hiding tools from the model.
The following tools are permitted:

`read`, `read_image`, `glob`, `grep`, `lsp`, the `session_*` query tools,
`job_list`, `job_output`, `terminal_list`, `terminal_read`, `list_agents`, and
`get_goal`.

Everything else is refused, including any tool the plugin does not recognise, so
a newly added tool is never permitted by omission. Code Mode's `run_code` remains
available because each tool a program calls is checked individually, which means
nested write operations are refused one by one.

Read access is deliberate: a follow-up question is often "what does this file
do?". Write access is not, because a branch runs in the same working directory
as the main conversation and could otherwise modify files while a task is still
running.

### Reusing the provider's cached context

The plugin does not alter the request a branch sends. It joins the same preset
the parent session used and leaves tool definitions, prompt sections, and the
presentation format untouched. As a result, the beginning of a branch's request
is byte-for-byte identical to the main conversation's request at the point the
branch was created.

This matters for speed. Model providers cache request prefixes, and tool
definitions sit at the very front of a request. Removing a single tool
definition would change the first bytes and lose the entire cached prefix,
forcing the provider to re-read the whole inherited conversation before it can
produce the first word of the answer. Restricting the visible tool list would
have been simpler to implement and would have given up that saving for no gain
in safety, because hiding a tool and refusing to run it stop the same call.

## Compatibility with DeepSeek Harness 0.1.0-rc.7

This version targets an unmodified `@deepseek-ai/dsh` `0.1.0-rc.7`. Two current
limitations follow from how that release treats subagent-origin sessions.

**Branches cannot be continued from the standard chat view.** DeepSeek Harness
uses the subagent origin marker to decide which component owns a session, and it
rejects messages sent to such a session from the standard chat view. The
standard view can display a branch's history but cannot add to it. This version
therefore has no "open branch in chat" action; reading and continuing branches
both happen in Tree View.

**Branches may be listed in the Subagent menu.** Because the plugin does not
install a subagent descriptor, the built-in Subagent menu inside a conversation
may list branches as disabled rows. These rows cannot be selected, are skipped
during keyboard navigation, and are excluded from the count of active child
agents; the menu and the conversation continue to work normally. Branches still
do not appear in the sidebar session list.

The plugin includes a check for a proposed future DeepSeek Harness capability
that would allow branches to be continued from the standard chat view. It
requires that release to provide both the capability and an explicit guarantee
that user messages can be delivered, so that a partial implementation cannot
silently re-enable a writable interface. Until then, this feature stays
disabled.

## Development

```sh
pnpm install
pnpm run check
```

`pnpm run check` runs linting, type checking for both the host and browser
builds, the test suite, a production build, and package validation.

| Command | Purpose |
| --- | --- |
| `pnpm run lint` | Static analysis |
| `pnpm run typecheck` | Type checking |
| `pnpm test` | Unit and integration tests |
| `pnpm run build` | Production build |
| `pnpm run check` | All of the above, plus package validation |

## Contributing

Issues and pull requests are welcome. Please run `pnpm run check` before
submitting a pull request.

## Project status

The implementation is verified against an unmodified DeepSeek Harness
`0.1.0-rc.7`. DeepSeek Harness is in developer preview, so later releases may
require updates even though this package declares a wider compatibility range.

## License

[MIT](LICENSE)
