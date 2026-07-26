@AGENTS.md

@./.grok/agent/orca-contribution.md

# Claude Code — Orca contribution notes

You are contributing via the **innocarpe** fork of **stablyai/orca**.

1. **Product rules** — root `AGENTS.md` (design system, lint, git/SSH compatibility).
2. **Contribution process** — `.grok/agent/orca-contribution.md` (primary + worktrees, dual PR, SSOT).
3. **Skills** — run `./.grok/install-agent-skills.sh` once so project skills appear under `.claude/skills/` (gitignored install path). Canonical sources: `.grok/skills/`.

| Skill | When |
|-------|------|
| `orca-contribution` | Session start / full loop |
| `oss-pr-mirror` | Opening or syncing dual-track PRs |
| `orca-free-issue` | “다음”, free-issue scout/implement |
| `orca-worktree` | Create/remove `orca-worktrees/fix-*` |

**Never** implement product fixes on primary `main`. Use worktrees from `upstream/main`.  
**Never** put harness-only commits on branches that PR to upstream.
