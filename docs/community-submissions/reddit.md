# Reddit post

Title:

```text
I built a DSH plugin so one side question does not pollute the rest of an agent session
```

Body:

````markdown
I kept running into a stupidly small problem in long coding-agent sessions.

The agent would explain a plan, I would not understand one term in an old answer, and I would ask about it in the main chat. That temporary detour then became part of the context for every request after it. A sidebar thread only moved the problem: its answer could raise another question, but I still had only one linear side conversation.

So I built `dsh-nested-followups` for DeepSeek Harness.

It lets you pick any completed answer and ask a follow-up from that exact point. More importantly, every answer produced at every later depth can become another independent fork point; the same rule keeps repeating without a plugin-defined nesting limit. Every level is a real child session—not a prompt trick—with only its ancestor context. It cannot write to the shared workspace, does not feed back into a parent or sibling, and remains attached to the root session. The tree is how you navigate the result, not the point of the plugin.

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
