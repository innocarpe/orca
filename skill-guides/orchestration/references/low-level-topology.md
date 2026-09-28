# Low-level topology

Load this reference only when `worker-start` cannot express required custom argv
or terminal topology. It is not the normal supervised loop and is never a full
handoff recipe.

For a new worktree intended to hold one worker, inspect its inventory and reuse
the existing idle launcher shell for custom argv. Send only after its screen
confirms an idle shell; never send into an active command or close configured
tabs running real commands. Preserve their ownership and report the exception.

```text
ORCA terminal list --worktree <selector> --include-visual-layouts --json
ORCA terminal read --terminal <handle> --json
ORCA terminal send --terminal <handle> --text "<agent_command>" --enter --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
ORCA terminal read --terminal <handle> --json
ORCA orchestration dispatch --task <task_id> --to <handle> --inject --json
ORCA terminal list --worktree <selector> --include-visual-layouts --json
```

Use `terminal create` only when the inventory has no terminal (`totalCount: 0`)
and no terminal leaf in `visualLayouts`, then continue from the readiness wait
with the returned handle:

```text
ORCA terminal create --worktree <selector> --title <task_name> --command "<agent_command>" --json
```

Dispatch only after the wait reports `satisfied: true` and the ready screen
confirms the requested model/effort. Verify the final `totalCount`, tabs, and
terminal leaves in `visualLayouts`; the default one-worker case retains the
same single tab and handle. `exited` or `screen-unavailable` does not prove a
durable tab was removed. Do not append a worker and clean up its launcher later.

Apply the same reuse rule if an older CLI requires a manual launch. Prefer
agent-first `worker-start` whenever its argv and topology are sufficient.

`dispatch --inject` creates authoritative Task/Dispatch context but deliberately
keeps an operator-created process unsupervised: it creates no supervised worker
resource row. `worker-show`, `worker-read`, and `worker-list` report the lane as
`unsupervised`; `worker-stop` and `worker-abandon` do not close that process, and
settled retain/release take no process action.

Use `worker-start --terminal <handle>` when lifecycle ownership of an existing
agent terminal is required. Never imply that low-level dispatch retroactively
owns a process, never use it to route around the nested-depth limit, and never
use it for an ownership handoff.
