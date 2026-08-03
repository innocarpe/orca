---
name: orca-worktree
description: >
  Create and clean Orca contribution git worktrees under orca-worktrees/, always
  based on upstream/main. Use when starting a fix branch, finishing a dual PR,
  or freeing disk after node_modules-heavy worktrees.
---

# Orca worktree hygiene

## Create (always bootstrap agent harness)

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
cd "$ORCA_PRIMARY"

# Preferred: upstream worktree + multi-LLM harness in one step
make worktree-add ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog

cd "$HOME/Projects/OpenSources/orca-worktrees/fix-10633"
pnpm install
```

`make worktree-add` runs `bootstrap-worktree.sh`, which:

- Symlinks primary `.grok` / `Makefile` / `codex.md` when missing
- Installs Claude + Codex skills into this worktree
- Adds **local git exclude** so overlays never enter a `fix/*` PR
- Fails unless the canonical links, local excludes, and `pr-followup` target pass audit

Re-bootstrap an existing worktree:

```bash
make worktree-bootstrap DIR=../orca-worktrees/fix-10633
make worktree-audit
```

Run `make worktree-audit` before assigning parallel agents. It checks every
registered worktree and fails if any Claude/Codex/Grok surface is copied, stale,
missing, or visible in an upstream-bound Git diff.

Mobile tests also need:

```bash
cd mobile && pnpm install
```

## Never

- Implement on primary `main`
- Create worktrees with raw `git worktree add` and skip bootstrap (Claude/Codex lose harness)
- Base worktree on stale fork `origin/main` when it diverges (harness-only commits)
- Share `node_modules` across Electron worktrees (broken native deps)
- Commit harness overlays on contribution branches

## Remove after dual PR

When: PR open, tree clean, remote branch pushed, OK to recreate for review.

```bash
cd "$ORCA_PRIMARY"
make worktree-rm ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog
# keeps origin/$BRANCH
```

PATH quirks: use `/usr/bin/git` and `/bin/rm` if wrappers break.

## Recreate for review follow-up

```bash
git fetch origin
git worktree add "$WT_ROOT/fix-$ISSUE" "origin/$BRANCH"
make -C "$ORCA_PRIMARY" worktree-bootstrap DIR="$WT_ROOT/fix-$ISSUE"
cd "$WT_ROOT/fix-$ISSUE"
make pr-followup
pnpm install
```

`make pr-followup` always fetches and rebases onto the latest `upstream/main`.
Run it before editing or posting any public review response. If it conflicts,
resolve or abort the rebase before touching the review request.

## Dual push after fixes

```bash
# After make pr-followup -> edit -> tests -> commit:
"$ORCA_PRIMARY/.grok/skills/oss-pr-mirror/scripts/sync-contribution-push.sh" \
  --comment "Address review: …"
```

The sync gate fetches `upstream/main` again. If upstream moved after testing, it
refuses the push; rerun `make pr-followup` and the affected checks.
