# Security policy

## Supported versions

This project is in early development and targets DeepSeek Harness
`0.1.0-rc.7`. Fixes are applied to the main branch only.

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/sluminositys/dsh-nested-followups/security/advisories/new)
rather than in a public issue.

Please include the affected version, what an attacker could achieve, and the
steps to reproduce the problem. You can expect an initial response within seven
days.

## Security model

Understanding these boundaries will help you judge whether a behaviour is a
vulnerability or a documented limitation.

### What the plugin guarantees

- **Branches cannot modify anything.** A branch runs as a read-only agent. Tools
  that write files, run commands, or cause external effects are refused when
  they run, and any tool the plugin does not recognise is refused as well.
- **The main conversation is never modified.** The plugin does not write to,
  truncate, or reorder its history.
- **Branch context is genuinely isolated.** Isolation comes from real, separate
  sessions, not from prompt instructions, so it cannot be undone by a model
  ignoring an instruction.
- **Uninstalling is safe.** Removing the plugin does not damage the main
  conversation or delete branch history.

### What it does not guarantee

- **Branches share the main conversation's working directory.** A branch can
  read any file the main conversation can read, including files a task is
  currently writing, so it may observe an incomplete state. The plugin isolates
  conversation context, not files.
- **File state is not versioned.** The plugin does not snapshot or roll back the
  working directory.
- **Branch history is stored like any other session.** Branches are kept out of
  the session list, but their history is stored with the same protection as
  regular sessions and is not separately encrypted.

A way to make a branch modify files, reach the main conversation's context, or
write to the main conversation's history would be a vulnerability. Please report
it.
