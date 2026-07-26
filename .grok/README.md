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

## Install (once per clone / after skill updates)

```bash
# From primary checkout (fork main):
./.grok/install-agent-skills.sh
```

This symlinks (or copies) each skill into:

- `.claude/skills/<name>/` — Claude Code project skills
- `.agents/skills/<name>/` — Codex project skills

Both targets are gitignored; re-run after pulling harness updates.

## Fork-main only

Commit harness changes on **fork `main` only**. Never put `.grok/` harness commits on
`fix/*` branches that PR to **upstream** `stablyai/orca`.
