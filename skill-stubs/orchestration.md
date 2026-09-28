# Orca Orchestration

For a new worktree intended to hold one worker, reuse its existing idle launcher
shell for custom agent arguments after inspecting the terminal inventory and
screen. Custom model/effort arguments do not justify another tab, including when
an older guide suggests adding a custom-command tab. Use `terminal create` only
when the worktree has no terminal. Verify actual tabs and terminal leaves with
`terminal list --include-visual-layouts`; `exited` or `screen-unavailable` does not
prove a tab was removed. Preserve configured tabs running real commands and
report them without sending or closing.

This file is a discovery stub, not the usage guide. The full, version-matched Orca
orchestration reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage Orca orchestration whenever you need structured multi-agent coordination: threaded
messages, blocking ask/reply flows, task dispatch, worker_done/escalation waits, task DAGs,
decision gates, coordinator loops, or decomposing work across agents. Use the orca-cli skill
instead for full ownership handoffs ("hand off", "handoff", "handover", "give this to
another agent", "another worktree") when the user did not ask to supervise, monitor, wait
for results, or coordinate a DAG — and for ordinary terminal control, shell commands,
worktree management, and the built-in browser. Coordination requires real Orca runtime
state; never substitute a non-Orca subagent tool.

<!-- shared: resolver -->

## Load the version-matched guide before running Orca commands

```text
ORCA skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop. For a conditional action gate
such as remote placement, uncertain release recovery, or expanded DAG work, load only the
reference that gate names with
`ORCA skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get orchestration --full` and read the named bundled reference before acting.

<!-- shared: no-guessing -->
