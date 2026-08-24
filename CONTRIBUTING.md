# Contributing

Thank you for your interest in this project. Issues and pull requests are
welcome.

## Getting started

```sh
pnpm install
pnpm run check
```

`pnpm run check` runs everything that must pass before a change is merged:
linting, type checking for both the host and browser builds, the test suite, a
production build, and package validation.

To try your changes in DeepSeek Harness:

```sh
dsh plugin --profile web add .
```

Restart the web profile afterwards.

## Requirements

- Node.js 22.19 or later
- pnpm
- DeepSeek Harness `0.1.x` (the development suite currently validates
  `0.1.1-rc.2` and keeps `0.1.0-rc.7` as its compatibility floor)

## Making a change

1. Create a branch for your change.
2. Add or update tests. New behaviour needs a test; a bug fix needs a test that
   fails before the fix.
3. Run `pnpm run check` and make sure it passes.
4. Open a pull request describing what changed and why.

## Design constraints

This plugin is additive. Please keep these constraints in mind, because a change
that breaks one of them will not be accepted:

- **The standard interface stays intact.** The plugin extends DeepSeek Harness
  through its official extension points. It must not modify the standard chat
  view, scan generated CSS class names, or depend on internal browser structures.
- **No patches to DeepSeek Harness.** The plugin must work against an unmodified
  release. Version-specific behaviour belongs in `src/host/adapter/`, which
  isolates it and reports when a capability is missing.
- **The main conversation is never modified.** The plugin must not write to,
  truncate, or reorder the main conversation's history.
- **Branch isolation is structural.** Isolation comes from real, separate
  sessions, never from prompt instructions.
- **Branches stay read-only.** Tool restrictions are enforced when a tool runs.
  Do not implement them by removing tool definitions from the request: that
  changes the request prefix and discards the model provider's cached context.
  See the "How it works" section of the [README](README.md).

## Reporting bugs

Please include your DeepSeek Harness version, your Node.js version, the steps to
reproduce the problem, and what you expected to happen instead.
