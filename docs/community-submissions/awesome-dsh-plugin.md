# Awesome-list submissions

## awesome-dsh-plugin/awesome-dsh-plugin

Target: <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>

Submitted: [awesome-dsh-plugin/awesome-dsh-plugin#3619](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/3619)

Add `data/plugins/sluminositys__dsh-nested-followups.yml`:

```yaml
url: https://github.com/sluminositys/dsh-nested-followups
name: sluminositys/dsh-nested-followups
category: session
description:
  en: Branch from any completed answer, then branch again from answers inside the side trail while the main session stays untouched.
  zh: 从任意已完成回答创建隔离侧线，再从侧线回答继续分叉，主会话始终不受影响。
```

PR title:

```text
Add sluminositys/dsh-nested-followups
```

PR body:

````markdown
Adds `sluminositys/dsh-nested-followups` under Session Management.

The plugin is installable from npm with:

```sh
dsh plugin --profile web add dsh-nested-followups
```

Any completed answer can become an isolated session fork point, including answers inside an existing side trail. Each nested level inherits only its ancestor path, while the main session remains untouched. The Tree View is the navigation surface for those recursive follow-ups.

The repository declares `dsh.bundle`, ships built artifacts, and is tested against unmodified DSH 0.1.x release candidates. The entry deliberately describes behavior without making security-review or quality claims.
````

Before submitting, run the directory's required generator and checks:

```sh
npm ci
node scripts/generate-readme.mjs
```

## ZeroPointRepo/awesome-dsh-plugins

Target: <https://github.com/ZeroPointRepo/awesome-dsh-plugins>

Submitted: [ZeroPointRepo/awesome-dsh-plugins#5](https://github.com/ZeroPointRepo/awesome-dsh-plugins/pull/5)

Suggested category: `Reshape the interface`.

PR body:

````markdown
Adds `dsh-nested-followups` to **Reshape the interface**.

This DSH plugin lets a user branch from any completed answer and then branch again from answers inside the side conversation. Every level is a real, read-only session with only its ancestor context; the main task stays untouched. Tree View keeps the recursive side trail attached to its root conversation.

Install:

```sh
dsh plugin --profile web add dsh-nested-followups
```
````

````markdown
- **Branch again from answers inside a side conversation** with
  [dsh-nested-followups](https://github.com/sluminositys/dsh-nested-followups) by
  [sluminositys](https://github.com/sluminositys). Every level is a real,
  read-only session with its own inherited context; the main task remains
  untouched and the Tree View keeps the recursive trail attached. 16★, MIT.

  <details>
  <summary>Install</summary>

  ```sh
  dsh plugin --profile web add dsh-nested-followups
  ```

  </details>
````

Refresh the star count immediately before submitting; it is the only volatile
field in this draft.

## dshworks/awesome-dsh-plugins

Target: <https://github.com/dshworks/awesome-dsh-plugins>

This registry already sweeps the `dsh-plugin` topic and npm. Prefer allowing its
discovery queue to pick up the newly updated upstream metadata. If it remains
absent after the next sweep, submit a manual `data/plugins.json` entry with:

- repository: `https://github.com/sluminositys/dsh-nested-followups`
- npm: `dsh-nested-followups`
- verifiedAgainst: `0.1.1-rc.2`
- lastVerified: the actual verification date
- status: `verified`
- evidence: `package.json#dsh.bundle`

Do not claim a newer DSH version until `pnpm run check` has run against it.
