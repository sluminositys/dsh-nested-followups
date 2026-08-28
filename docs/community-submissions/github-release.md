# GitHub release copy

Published on the existing [`v0.2.2` release](https://github.com/sluminositys/dsh-nested-followups/releases/tag/v0.2.2).

Title:

```text
dsh-nested-followups: branch again inside any side conversation
```

Body:

````markdown
I built this because I kept wanting to ask one small question about an earlier answer without dragging that detour through the rest of an agent session. Then the side answer would raise another question, and a normal one-level sidebar thread put me back in the same linear-chat problem.

The missing option was neither “ask at the bottom” nor “open another chat”. It was: keep the exact context through an answer, fork a real session there, and let any answer inside that side trail become the next isolated fork point.

![A real DSH session with recursively nested isolated follow-ups](https://raw.githubusercontent.com/sluminositys/dsh-nested-followups/main/assets/demo.gif)

`dsh-nested-followups` does that recursively:

- select any completed answer and ask a side question;
- continue downward inside the isolated side trail;
- branch again from any answer inside it, at any depth;
- collapse the side trail and return to the unchanged main Chat.

Every level is a durable DSH session seeded with exactly its ancestor path. Branch tools are enforced read-only, parent and sibling contexts remain separate, and the provider-compatible request prefix stays reusable. The tree is the map; recursive session isolation is the feature.

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```

Compatibility: unmodified DeepSeek Harness `0.1.0-rc.7` through the currently verified `0.1.1-rc.2` line. See the README for the two known subagent-origin UI limitations.
````
