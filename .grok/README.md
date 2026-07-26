# Multi-agent harness (fork `main` only)

This tree is the **canonical, git-tracked** agent infrastructure for contributing to
`stablyai/orca` from the `innocarpe/orca` fork.

| Surface | Role |
|---------|------|
| [`.grok/agent/orca-contribution.md`](./agent/orca-contribution.md) | Shared contribution workflow (all LLMs) |
| [`.grok/skills/`](./skills/) | Skill packages (Grok native path) |
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

## Install skills (primary)

```bash
# From primary checkout (fork main):
make agent-install
# or:
./.grok/install-agent-skills.sh
```

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
