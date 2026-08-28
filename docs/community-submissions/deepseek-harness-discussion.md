# DeepSeek Harness discussion

Category: [Show Your Plugins!](https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins)

Published: [deepseek-ai/deepseek-harness discussion #4938](https://github.com/deepseek-ai/deepseek-harness/discussions/4938)

Title:

```text
DSH | dsh-nested-followups | Branch again inside any side conversation
```

Body:

````markdown
Project: https://github.com/sluminositys/dsh-nested-followups

I kept running into a small but persistent problem in long agent sessions: I wanted to ask what one part of an earlier answer meant, but putting that question in the main chat dragged the detour through every later request. A one-level side thread was not enough either—its answer often raised another question, and that second detour needed its own clean context too.

`dsh-nested-followups` lets any completed assistant answer become an isolated fork point, including answers inside an existing side branch. Each new level is a real child session seeded only with its ancestor path. Nothing flows back to the parent or across to siblings. The Tree View is the map for navigating those recursively nested side conversations; returning to Chat shows the original main session unchanged.

![Real DSH demo](https://raw.githubusercontent.com/sluminositys/dsh-nested-followups/main/assets/demo.gif)

The integration is intentionally additive: the normal DSH chat is unchanged, while Tree View provides DSH-native cards for creating, continuing, nesting, collapsing, and revisiting the side trails. Branches remain attached to the root conversation, stay out of the normal sidebar session list, and use host-side read-only tool enforcement.

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```

Verified on unmodified DSH `0.1.0-rc.7`, `0.1.0-rc.8`, and `0.1.1-rc.2`.

This is an independent community plugin and is not affiliated with or endorsed by DeepSeek.
````
