# GitHub release copy

Title:

```text
dsh-nested-followups: real session branches for side questions
```

Body:

````markdown
I built this because I kept wanting to ask one small question about an earlier answer without dragging that detour through the rest of an agent session.

The missing option was neither “ask at the bottom” nor “open another chat”. It was: keep the exact context through that answer, fork a real session there, and leave the main task untouched.

![A real DSH session with nested isolated branches](https://raw.githubusercontent.com/sluminositys/dsh-nested-followups/main/assets/demo.gif)

`dsh-nested-followups` now presents that job directly:

- select any completed answer and ask a follow-up to the right;
- continue downward inside the isolated branch;
- branch again at any depth;
- collapse the side trail and return to the unchanged main Chat.

Each branch is a durable DSH session seeded only through its branch point. Branch tools are enforced read-only, sibling contexts remain separate, and the provider-compatible request prefix stays reusable. This is session isolation, not a prompt instruction or a visual-only graph.

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```

Compatibility: unmodified DeepSeek Harness `0.1.0-rc.7` through the currently verified `0.1.1-rc.2` line. See the README for the two known subagent-origin UI limitations.
````
