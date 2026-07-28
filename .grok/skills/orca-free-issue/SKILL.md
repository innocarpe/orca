---
name: orca-free-issue
description: >
  Scout and implement free Orca GitHub issues (unassigned, no competing PR),
  filtered by the orca-merge-playbook (focused fix, preserves intent, regression
  tests). Use when the user says "다음", "free issue", "이슈 발굴", "5개 찾아",
  or wants another contribution batch on stablyai/orca.
---

# Free-issue cycle

## Goal

Find high-leverage open issues on `stablyai/orca` that this fork can own, then
implement with dual-track PRs that **can actually merge**.

**Always load skill `orca-merge-playbook` first.** Prefer issues that pass all three
gates in one PR. Prefer babysitting existing open PRs over volume when open count
is already high (see `PORTFOLIO.md`).

## Scout

```bash
# Unassigned open issues (sample)
gh issue list --repo stablyai/orca --state open --limit 80 \
  --json number,title,labels,assignees,updatedAt

# Competing PRs
gh pr list --repo stablyai/orca --state open --limit 100 \
  --json number,title,body,author
```

### Prefer

- Unassigned, no open competing PR that closes the same issue
- Concrete bug with file anchors / repro / test path
- ★☆☆–★★☆ scope (hours, not multi-week architecture)
- Cross-platform carefulness (macOS/Linux/Windows, SSH)
- **Merge playbook fit:** one focused behavior; clear “preserves …”; testable regression

### Skip / later

- Maintainer assignee or “I got this” comment from core
- Existing open PR that clearly targets the same fix
- Empty body / unreproducible Discord one-liners
- ★★★ fleet/kernel/infra without clear local fix surface
- Already shipped by our open dual PRs (check HISTORY.md)
- Cannot state Focused / Preserves / Regression in one PR (split or skip)

## Propose → implement

1. Present **3–5** candidates with difficulty + **playbook fit** (focused / preserves / tests).
2. Implement only after user picks (or “전부 해”).
3. One worktree per issue from `upstream/main`.
4. Before commit: re-check `orca-merge-playbook` gates.
5. Tests + commit + dual PR (body includes Focused / Preserves / Evidence) + worktree cleanup + BOARD/HISTORY/PORTFOLIO.

## Batch pattern

Independent issues → parallel worktrees / agents. Shared files → sequential.

## Report (Korean OK)

Table: Issue | summary | upstream PR | fork portfolio PR.
