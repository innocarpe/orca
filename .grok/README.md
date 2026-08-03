# Multi-agent harness (fork `main` only)

This tree is the **canonical, git-tracked** agent infrastructure for contributing to
`stablyai/orca` from the `innocarpe/orca` fork.

| Surface | Role |
|---------|------|
| [`.grok/agent/orca-contribution.md`](./agent/orca-contribution.md) | Shared contribution workflow (all LLMs) |
| [`.grok/skills/orca-merge-playbook/`](./skills/orca-merge-playbook/) | **Merge-rate north star** (focused · preserves · regression) |
| [`.grok/skills/`](./skills/) | Skill packages (Grok native path; install → Claude/Codex) |
| [`install-agent-skills.sh`](./install-agent-skills.sh) | Install skills into Claude Code + Codex discovery paths |

## Why not only `.claude/skills` / `.agents/skills`?

Upstream `.gitignore` already ignores:

```gitignore
/.claude/skills/
/.agents/skills/
```

So those directories are **local install targets**, not the source of truth.
Canonical copies live under **`.grok/skills/`** (tracked on fork `main`).

## Agent entrypoints

| Agent | Loads |
|-------|--------|
| **Grok Build** | `.grok/skills/*/SKILL.md` + project instructions |
| **Claude Code** | root `CLAUDE.md` / `Claude.md` → `@AGENTS.md` + contribution doc; skills via install into `.claude/skills/` |
| **Codex CLI** | root `AGENTS.md` (product rules) + fallback `CLAUDE.md` / `codex.md` (see `~/.codex/config.toml` `project_doc_fallback_filenames`); skills via install into `.agents/skills/` |

## Skills (all three agents)

| Skill | Claude / Codex / Grok |
|-------|------------------------|
| **`orca-merge-playbook`** | Load **before any fix/PR/review** — merge-rate gates from #10474 maintainer language |
| `orca-contribution` | Full session loop + SSOT |
| `oss-pr-mirror` | Dual-track PRs |
| `orca-free-issue` | Scout (playbook-filtered) |
| `orca-worktree` | Worktree hygiene |

## Install skills (primary)

```bash
# From primary checkout (fork main):
make agent-install
# or:
./.grok/install-agent-skills.sh
```

Re-run after adding/editing skills so Claude (`.claude/skills/`) and Codex (`.agents/skills/`)
pick up symlinks. Grok reads `.grok/skills/` directly.

## Every open-PR follow-up starts from current upstream

From the clean issue worktree, run this before editing, replying, resolving,
changing the PR body, or posting a status comment:

```bash
make pr-followup
# edit -> rerun tests -> commit
.grok/skills/oss-pr-mirror/scripts/sync-contribution-push.sh
```

Preparation records the exact fork head and freshly fetched `upstream/main`.
Sync fetches again and fails closed if either moved, then uses an exact
`--force-with-lease` and verifies both PR heads.

## Worktrees always get the harness

Upstream-based worktrees do **not** contain fork `.grok` history. Use the Makefile
so every worktree is bootstrapped without polluting `fix/*` PR diffs:

```bash
# Create from upstream/main + wire Claude/Codex/Grok harness (local exclude)
make worktree-add ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog

# Existing worktree
make worktree-bootstrap DIR=../orca-worktrees/fix-10633

# Remove (keeps remote branch)
make worktree-rm ISSUE=10633 BRANCH=fix/skill-freshness-attention-dialog
```

What bootstrap does (see `.grok/scripts/bootstrap-worktree.sh`):

1. Symlinks `.grok`, `Makefile`, `codex.md` from primary when missing
2. Adds **local git exclude** so those overlays never show in `git status` / cannot be accidental `git add` PR noise
3. Installs skills into that worktree’s `.claude/skills` + `.agents/skills`
4. Claude project rule: `.claude/rules/orca-contribution.md` (does not rewrite tracked `CLAUDE.md`)

## Fork-main only

Commit harness changes on **fork `main` only**. Never put `.grok/` harness commits on
`fix/*` branches that PR to **upstream** `stablyai/orca`.
