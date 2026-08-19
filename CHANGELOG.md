# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-19

### Added

- Collapse v2 with three progressive levels: one anchor-group dot, one capsule
  per branch, and the existing full message-card group.
- Sticky per-tree collapse state, partial sibling expansion, Alt-click deep
  expansion, a Collapse all action, and a 20 px bottom-edge collapse target.
- Folded activity indicators for streaming and failed descendants, including
  accessible labels and reduced-motion fallbacks.

### Changed

- Search now opens every folded ancestor before locating a result, and the
  minimap reflects dot and capsule geometry.
- The old `+N nodes` badge is replaced by a capsule with branch path, first
  question summary, child-branch count, full subtree message count, and the
  existing cascading delete action.

## [0.1.0] - 2026-08-19

First release, targeting DeepSeek Harness `0.1.0-rc.7`. Published to npm as
[`dsh-nested-followups`](https://www.npmjs.com/package/dsh-nested-followups).

### Added

- Tree View: a conversation tree that renders each user and assistant message
  as a separate card, reachable from a toggle in the conversation header.
- **Ask follow-up**: creates an isolated branch from a completed answer using
  the official session fork mechanism. Branches can be nested without limit.
- **Continue this branch**: adds the next exchange to an existing branch,
  available only on that branch's most recent completed answer.
- Branch deletion, cascading to all nested branches, with a confirmation dialog
  that reports how many branches and messages will be removed.
- Text selection anchors, so a follow-up can quote a specific passage of an
  answer.
- Tree navigation: search, focus, collapse, pan, zoom, fit to view, and an
  overview map.
- Full recovery of trees, branches, and anchors after a restart.

### Security

- Branches run as read-only agents. Read tools are permitted; every other tool,
  including any tool the plugin does not recognise, is refused when it runs.
  Branches share the main conversation's working directory and cannot modify it.

### Notes

- Branches are recorded as subagent-origin sessions, which keeps them out of
  the session list while preserving their history.
- A branch sends the same request prefix as the main conversation, so the model
  provider's cached prefix is reused rather than re-read.
- Continuing a branch from the standard chat view is not available on
  `0.1.0-rc.7`. See the compatibility section of the [README](README.md).
