---
name: orca-free-issue
description: >
  Scout and implement free Orca GitHub issues (unassigned, no competing PR).
  Use when the user says "다음", "free issue", "이슈 발굴", "5개 찾아", or wants
  another contribution batch on stablyai/orca.
---

# Free-issue cycle

## Goal

Find high-leverage open issues on `stablyai/orca` that this fork can own, then
implement with dual-track PRs.

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

### Skip / later

- Maintainer assignee or “I got this” comment from core
- Existing open PR that clearly targets the same fix
- Empty body / unreproducible Discord one-liners
- ★★★ fleet/kernel/infra without clear local fix surface
- Already shipped by our open dual PRs (check HISTORY.md)

## Propose → implement

1. Present **3–5** candidates with difficulty + why.
2. Implement only after user picks (or “전부 해”).
3. One worktree per issue from `upstream/main`.
4. Tests + commit + dual PR + worktree cleanup + BOARD/HISTORY.

## Batch pattern

Independent issues → parallel worktrees / agents. Shared files → sequential.

## Report (Korean OK)

Table: Issue | summary | upstream PR | fork portfolio PR.
