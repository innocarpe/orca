---
name: orca-contribution
description: >
  End-to-end Orca OSS contribution loop for the innocarpe fork: primary+worktree
  layout, SSOT BOARD/HISTORY, free-issue scouting, dual-track PRs (upstream +
  fork portfolio), and worktree cleanup. Use when working on stablyai/orca
  contributions, user says "다음", "free issue", "dual PR", "worktree", "BOARD",
  or any contribution session start on this fork.
---

# Orca contribution (full loop)

## When to use

- Starting or resuming Orca OSS contribution work on the `innocarpe` fork
- User says “다음”, “이슈 찾아”, “dual PR”, “worktree 정리”
- Any agent (Claude Code, Codex, Grok) on this repo without prior session context

## Read first

1. Full workflow: [`.grok/agent/orca-contribution.md`](../../agent/orca-contribution.md)
2. SSOT (absolute):  
   `$ORCA_PRIMARY/notes/orca-contribution/BOARD.md`  
   `$ORCA_PRIMARY/notes/orca-contribution/HISTORY.md`  
   Default `ORCA_PRIMARY=$HOME/Projects/OpenSources/orca`
3. Product rules: root `AGENTS.md`

## Non-negotiables

| Rule | Detail |
|------|--------|
| Primary = main only | Never implement product fixes in primary checkout |
| Worktrees | `…/orca-worktrees/fix-<N>` from **`upstream/main`** |
| Dual PR | upstream `stablyai/orca` + fork portfolio mirror |
| SSOT | BOARD/HISTORY under gitignored `notes/`; update both; never commit |
| Harness on fork main | Do not put `.grok/` harness commits on upstream-bound `fix/*` branches |

## Dual PR commands

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
SKILL="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror"
"$SKILL/scripts/mirror-upstream-pr.sh" <upstream-pr-number>
"$SKILL/scripts/sync-contribution-push.sh"
"$SKILL/scripts/sync-contribution-push.sh" --comment "…"
```

See also skill **`oss-pr-mirror`**.

## Session checklist

- [ ] `pwd` / branch: primary main vs worktree fix branch
- [ ] BOARD → HISTORY restored
- [ ] Work from `upstream/main`-based worktree
- [ ] Tests with correct vitest config
- [ ] Upstream PR + fork mirror URLs reported
- [ ] BOARD/HISTORY updated; worktree removed if clean

## Related skills

- `oss-pr-mirror` — dual-track PR scripts
- `orca-free-issue` — issue scouting + batch implement
- `orca-worktree` — create/remove worktrees safely
