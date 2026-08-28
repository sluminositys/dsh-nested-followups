# Reddit post

Title:

```text
I built a DSH plugin so one side question does not pollute the rest of an agent session
```

Body:

````markdown
I kept running into a stupidly small problem in long coding-agent sessions.

The agent would explain a plan, I would not understand one term in an old answer, and I would ask about it in the main chat. That temporary detour then became part of the context for every request after it. Opening a new chat kept the main task clean, but I had to copy the relevant history and manage another loose session.

So I built `dsh-nested-followups` for DeepSeek Harness.

It lets you pick any completed answer and ask a follow-up from that exact point. The follow-up is a real child session, not a prompt trick. It inherits the parent only through the selected answer, cannot write to the shared workspace, and does not feed anything back into the main conversation. You can continue inside the branch or branch from it again, and the whole thing remains visible as a message-level tree attached to the root session.

Demo: https://github.com/sluminositys/dsh-nested-followups#readme

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```

It is currently tested against unmodified DSH 0.1.x release candidates. I am especially interested in whether the distinction between Continue (down) and Ask follow-up (right) feels obvious in the demo.
````

Do not cross-post this unchanged. Add one sentence at the top that responds to
the destination community's rules or recurring discussion, and remove the
feedback question if self-promotion is restricted.
