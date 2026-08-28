# DeepSeek Harness discussion

Category: [Show Your Plugins!](https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins)

Title:

```text
DSH | dsh-nested-followups | Ask side questions in isolated conversation branches
```

Body:

````markdown
Project: https://github.com/sluminositys/dsh-nested-followups

I kept running into a small but persistent problem in long agent sessions: I wanted to ask what one part of an earlier answer meant, but putting that question in the main chat dragged the detour through every later request. Opening another conversation avoided that, but lost the exact context and cluttered the session list.

`dsh-nested-followups` adds a Tree View to the existing DSH conversation. Pick any completed assistant answer and ask a follow-up there. The plugin creates a real child session seeded only through that answer, shows it to the right of the main line, and lets the branch continue or branch again. Returning to Chat shows the original main session unchanged.

![Real DSH demo](https://raw.githubusercontent.com/sluminositys/dsh-nested-followups/main/assets/demo.gif)

The integration is intentionally additive: a conversation-header Tree View, DSH-native message cards and tokens, session event-log projection, durable branch metadata, and host-side read-only tool enforcement. Branches remain attached to the root conversation and stay out of the normal sidebar session list.

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```

Verified on unmodified DSH `0.1.0-rc.7`, `0.1.0-rc.8`, and `0.1.1-rc.2`.

This is an independent community plugin and is not affiliated with or endorsed by DeepSeek.
````
