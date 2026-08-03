---
name: orca-contribution
description: >
  End-to-end Orca OSS contribution loop for the innocarpe fork: primary+worktree
  layout, SSOT BOARD/HISTORY/PORTFOLIO, merge-rate playbook, free-issue scouting,
  dual-track PRs (upstream + fork portfolio), and worktree cleanup. Use when
  working on stablyai/orca contributions, user says "다음", "free issue", "dual PR",
  "worktree", "BOARD", "머지", or any contribution session start on this fork.
---

# Orca contribution (full loop)

## When to use

- Starting or resuming Orca OSS contribution work on the `innocarpe` fork
- User says “다음”, “이슈 찾아”, “dual PR”, “worktree 정리”, “머지율”
- Any agent (Claude Code, Codex, Grok) on this repo without prior session context

## Read first

1. **Merge-rate north star:** skill **`orca-merge-playbook`** (focused · preserves · regression) — **non-optional**
2. Full workflow: [`.grok/agent/orca-contribution.md`](../../agent/orca-contribution.md)
3. SSOT (absolute):  
   `$ORCA_PRIMARY/notes/orca-contribution/BOARD.md`  
   `$ORCA_PRIMARY/notes/orca-contribution/HISTORY.md`  
   `$ORCA_PRIMARY/notes/orca-contribution/PORTFOLIO.md`  
   Default `ORCA_PRIMARY=$HOME/Projects/OpenSources/orca`
4. Product rules: root `AGENTS.md`

## Non-negotiables

| Rule | Detail |
|------|--------|
| **Merge playbook** | Every fix/PR/review: **focused** + **preserves intent** + **regression tests**. See `orca-merge-playbook`. North star = **merged count**, not open volume. |
| Primary = main only | Never implement product fixes in primary checkout |
| Worktrees | `…/orca-worktrees/fix-<N>` from **`upstream/main`** |
| Fresh follow-up base | Before any open-PR push/reply/resolve/body/comment: `make pr-followup`, then test; sync refuses stale upstream or remote heads |
| Dual PR | upstream `stablyai/orca` + fork portfolio mirror |
| SSOT | BOARD / HISTORY / PORTFOLIO under gitignored `notes/`; update; never commit |
| Harness on fork main | Do not put `.grok/` harness commits on upstream-bound `fix/*` branches |

## Dual PR commands

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
SKILL="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror"
"$SKILL/scripts/mirror-upstream-pr.sh" <upstream-pr-number>

# Every open-PR follow-up, before editing or replying:
make pr-followup
# edit -> test -> commit
"$SKILL/scripts/sync-contribution-push.sh"
"$SKILL/scripts/sync-contribution-push.sh" --comment "…"
```

See also skill **`oss-pr-mirror`**.

## Session checklist

- [ ] `pwd` / branch: primary main vs worktree fix branch
- [ ] Loaded **`orca-merge-playbook`** (3 gates)
- [ ] BOARD → **PORTFOLIO** → HISTORY restored
- [ ] Work from `upstream/main`-based worktree
- [ ] `make worktree-audit` passes before parallel worktree delegation
- [ ] Before every open-PR follow-up, rebased with `make pr-followup`
- [ ] Change passes focused / preserves / regression before PR
- [ ] Tests rerun after the latest-main rebase with the correct vitest config
- [ ] Upstream PR + fork mirror URLs reported
- [ ] BOARD/HISTORY/PORTFOLIO updated; worktree removed if clean

## Related skills

- **`orca-merge-playbook`** — merge-rate gates (always)
- `oss-pr-mirror` — dual-track PR scripts
- `orca-free-issue` — issue scouting + batch implement (filter by playbook)
- `orca-worktree` — create/remove worktrees safely
