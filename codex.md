@AGENTS.md

@./.grok/agent/orca-contribution.md

# Codex CLI — Orca contribution notes

Codex loads root `AGENTS.md` for product rules. This file (and `CLAUDE.md`) is a
**project_doc fallback** for contribution process on the **innocarpe** fork.

## Process (summary)

| Item | Value |
|------|--------|
| Primary | `$HOME/Projects/OpenSources/orca` — always `main` |
| Worktrees | `$HOME/Projects/OpenSources/orca-worktrees/fix-<N>` from `upstream/main` |
| SSOT | `notes/orca-contribution/BOARD.md` + `HISTORY.md` (gitignored; absolute path) |
| Dual PR | upstream `stablyai/orca` + fork portfolio via `.grok/skills/oss-pr-mirror` |

## Skills

```bash
./.grok/install-agent-skills.sh
```

Installs into `.agents/skills/` (gitignored; Codex project skill discovery).  
Canonical tracked skills: `.grok/skills/*/SKILL.md`.

- `orca-contribution` — full loop
- `oss-pr-mirror` — dual-track PRs
- `orca-free-issue` — scout/implement free issues
- `orca-worktree` — worktree create/cleanup

## Dual PR quick path

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
MIRROR="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror/scripts/mirror-upstream-pr.sh"
SYNC="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror/scripts/sync-contribution-push.sh"

git push -u origin HEAD
gh pr create --repo stablyai/orca --base main --head innocarpe:<branch> ...
"$MIRROR" <upstream-pr-number>
# later:
"$SYNC" --comment "…"
```

Do **not** implement on primary `main`. Do **not** PR harness-only `.grok/` commits to upstream.
