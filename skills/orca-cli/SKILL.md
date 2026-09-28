---
name: orca-cli
description: >-
  Operate Orca-managed worktrees, folder contexts, terminals, repos, automations, artifacts,
  skill sharing, worktree comments, and Orca's embedded browser through the `orca` CLI. Use
  when the user says "$orca-cli", "Orca worktree", "child worktree", "spawn codex/claude in a
  worktree", "read/wait/send Orca terminal", "handoff" / "handover" / "give this to another
  agent", "Orca browser", "orca artifacts", or "share skills". Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when Orca state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

# Orca CLI

## One worker tab

For a new worktree intended to hold one worker, prefer the agent-first launcher
when it supplies the requested arguments. Otherwise inspect the terminal
inventory and screen, then send the full agent command into the existing idle
launcher shell through the same handle. Custom model/effort arguments do not
justify another tab. Use `terminal create` only when the worktree has no terminal.
This rule also applies to older guides that suggest adding a custom-command tab.
Verify the actual tabs and terminal leaves with `terminal list --include-visual-layouts`;
`exited` or `screen-unavailable` does not prove a tab was removed. Preserve
configured tabs running real commands and report them without sending or closing.

This discovery stub loads the version-matched guide from the Orca executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

## Load the version-matched guide before running Orca commands

```text
ORCA skills get orca-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
