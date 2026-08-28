# Awesome-list submissions

## awesome-dsh-plugin/awesome-dsh-plugin

Target: <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>

Add `data/plugins/sluminositys__dsh-nested-followups.yml`:

```yaml
url: https://github.com/sluminositys/dsh-nested-followups
name: sluminositys/dsh-nested-followups
category: session
description:
  en: Branch from any completed answer into an isolated session, then continue or nest it in a message-level conversation tree.
  zh: 从任意已完成回答创建隔离 Session，并在消息级会话树中继续或嵌套分支。
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

The repository declares `dsh.bundle`, ships built artifacts, has a real message-level Tree View, and is tested against unmodified DSH 0.1.x release candidates. The entry deliberately describes session isolation and nesting without making security-review or quality claims.
````

Before submitting, run the directory's required generator and checks:

```sh
npm ci
node scripts/generate-readme.mjs
```

## ZeroPointRepo/awesome-dsh-plugins

Target: <https://github.com/ZeroPointRepo/awesome-dsh-plugins>

Suggested category: `Reshape the interface`.

````markdown
- **Branch from an earlier answer without contaminating the main session** with
  [dsh-nested-followups](https://github.com/sluminositys/dsh-nested-followups) by
  [sluminositys](https://github.com/sluminositys). Creates real, read-only nested sessions and keeps them in one message-level tree. 16★, MIT.

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
