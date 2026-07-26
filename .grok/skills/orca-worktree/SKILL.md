---
name: orca-worktree
description: >
  Create and clean Orca contribution git worktrees under orca-worktrees/, always
  based on upstream/main. Use when starting a fix branch, finishing a dual PR,
  or freeing disk after node_modules-heavy worktrees.
---

# Orca worktree hygiene

## Create

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
WT_ROOT="${ORCA_WORKTREES:-$HOME/Projects/OpenSources/orca-worktrees}"
ISSUE=10633
BRANCH="fix/skill-freshness-attention-dialog"

cd "$ORCA_PRIMARY"
git fetch upstream main
git worktree add -b "$BRANCH" "$WT_ROOT/fix-$ISSUE" upstream/main
cd "$WT_ROOT/fix-$ISSUE"
pnpm install
```

Mobile tests also need:

```bash
cd mobile && pnpm install
```

## Never

- Implement on primary `main`
- Base worktree on stale fork `origin/main` when it diverges (harness-only commits)
- Share `node_modules` across Electron worktrees (broken native deps)

## Remove after dual PR

When: PR open, tree clean, remote branch pushed, OK to recreate for review.

```bash
cd "$ORCA_PRIMARY"
git worktree remove --force "$WT_ROOT/fix-$ISSUE" || rm -rf "$WT_ROOT/fix-$ISSUE"
git worktree prune
git branch -D "$BRANCH"   # local only
# keep origin/$BRANCH
```

PATH quirks: use `/usr/bin/git` and `/bin/rm` if wrappers break.

## Recreate for review follow-up

```bash
git fetch origin
git worktree add "$WT_ROOT/fix-$ISSUE" "origin/$BRANCH"
cd "$WT_ROOT/fix-$ISSUE" && pnpm install
```

## Dual push after fixes

```bash
"$ORCA_PRIMARY/.grok/skills/oss-pr-mirror/scripts/sync-contribution-push.sh" \
  --comment "Address review: …"
```
