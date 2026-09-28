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

<!-- shared: resolver -->

## Load the version-matched guide before running Orca commands

```text
ORCA skills get orca-cli
```

<!-- shared: no-guessing -->
