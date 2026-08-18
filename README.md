# dsh-nested-followups

English | [中文](README.zh.md)

`dsh-nested-followups` adds a message-level conversation tree to the
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web interface.
It provides a separate Tree View for examining a conversation and asking nested
follow-up questions without adding those questions to the main conversation.

The ordinary DSH chat remains the default view. The plugin uses DSH extension
points and services; it does not replace the conversation interface or modify
the original session event log.

## How it works

In Tree View, each user message and assistant response is shown as a compact
card. The main conversation remains a vertical sequence. A follow-up started
from a historical response appears to its right, and a follow-up to that answer
can create another nested branch.

Each branch uses an independent DSH session seeded only with the history that
precedes its selected message. Later main-thread messages do not enter the
branch, and branch messages do not enter the main conversation. A branch can be
opened in the standard DSH chat interface when a longer conversation is needed.

Tree View is intended for the following tasks:

- inspect the main conversation and all attached follow-ups;
- ask a question about any completed historical response;
- continue asking nested follow-up questions with isolated context;
- focus or collapse parts of a large tree and navigate with a minimap;
- open a branch in the ordinary DSH chat interface.

## Compatibility

The current development target is `@deepseek-ai/dsh` `0.1.0-rc.7` on the web
profile. DeepSeek Harness is in Developer Preview, so plugin contracts may
change between release candidates.

Node.js `22.19` or later is required, matching the current DSH requirement.

## Installation from source

The package is not currently published to npm. Install it from a checkout:

```sh
git clone https://github.com/sluminositys/dsh-nested-followups.git
cd dsh-nested-followups
pnpm install
pnpm run check
dsh plugin --profile web add .
```

Restart the DSH web profile after installation if it is already running.

To remove the plugin:

```sh
dsh plugin --profile web remove dsh-nested-followups
```

Removing the plugin removes its interface and configuration. It does not
rewrite the original conversation logs.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

`pnpm run check` runs all four checks in sequence and validates the published
package structure.

## Status

This project is under active development. Its data format and DSH compatibility
range may change before the first stable release.

## License

[MIT](LICENSE)
