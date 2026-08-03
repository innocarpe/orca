# Orca OSS contribution harness (innocarpe fork)

Local workflow for any coding agent (Grok, Claude Code, Codex CLI) working on
contributions to **stablyai/orca** from fork **innocarpe/orca**.

This file is **process**, not product code style. Product rules stay in root
[`AGENTS.md`](../../AGENTS.md) (design system, lint, git compatibility, SSH, …).

---

## Layout

```text
/Users/WooseongKim/Projects/OpenSources/
  orca/                              ← PRIMARY hub. Always main. SSOT + fetch only.
    notes/orca-contribution/         ← BOARD.md + HISTORY.md (gitignored /notes/)
    .grok/                           ← this harness (fork main only)
  orca-worktrees/
    fix-<N>/                         ← implement here from upstream/main
```

| Role | Where | Do |
|------|--------|-----|
| Hub | `orca/` on `main` | `git fetch`, SSOT, create/remove worktrees, issue scan |
| Dev | `orca-worktrees/fix-<N>/` | implement, test, commit, push, PR |
| SSOT | primary `notes/orca-contribution/` | **absolute path**; never commit |

Default absolute SSOT paths:

- `/Users/WooseongKim/Projects/OpenSources/orca/notes/orca-contribution/BOARD.md`
- `/Users/WooseongKim/Projects/OpenSources/orca/notes/orca-contribution/HISTORY.md`
- `/Users/WooseongKim/Projects/OpenSources/orca/notes/orca-contribution/PORTFOLIO.md` ← **머지 극대화 · open/merged · 머지 플레이북**

Override with `ORCA_PRIMARY` if the primary checkout moves.

---

## Hard rules

1. **Never implement product fixes on primary `main`.** Primary stays clean.
2. **Create worktrees from `upstream/main`** (fetch first). Fork `origin/main` may lag or hold harness-only commits.
3. **Before every upstream-facing follow-up on an open PR**, run `make pr-followup` from the clean issue worktree. This fetches and rebases onto the latest `upstream/main`; rerun tests after it. Replies, resolves, PR-body edits, and comments are included—not only code pushes.
4. **Dual-track PRs** for every contribution:
   - Upstream review: `gh pr create --repo stablyai/orca --base main --head innocarpe:<branch>`
   - Fork portfolio mirror: `.grok/skills/oss-pr-mirror` (`mirror-upstream-pr.sh`)
5. **After more commits on an open PR:** use `sync-contribution-push.sh` (not bare `git push`). It fails closed if upstream or the fork branch moved after preparation and uses an exact lease for the required rebase rewrite.
6. **Session cold-start:** read BOARD → **PORTFOLIO** → HISTORY. Update SSOT on every state change.
7. **Disk:** after dual PR is open and tree is clean, remove local worktree; keep remote branch. Recreate for review follow-ups.
8. **Prefer `/usr/bin/git`** when shell wrappers break `PATH`.
9. **Do not commit** `notes/`, harness-only files on contribution PR branches, or secrets.
10. **Korean progress reports** for the human user when working in this contribution loop.
11. **Merge-rate north star (not open-count):** every fix/PR/review follow-up should be a **focused fix**, **preserve product/security intent**, and include **regression coverage**.
    - **Skill (all agents):** [`.grok/skills/orca-merge-playbook/SKILL.md`](../skills/orca-merge-playbook/SKILL.md) — load at session start and before every PR.  
    - **Human SSOT mirror:** `notes/orca-contribution/PORTFOLIO.md` § 머지 플레이북 (from maintainer language on #10474).

---

## New issue worktree

**Preferred (harness auto-attached for Grok / Claude / Codex):**

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
cd "$ORCA_PRIMARY"
make worktree-add ISSUE=<N> BRANCH=fix/<short-desc>
cd "$HOME/Projects/OpenSources/orca-worktrees/fix-<N>"
pnpm install   # each worktree needs its own install (Electron/native)
```

Manual equivalent:

```bash
git fetch upstream main
git worktree add -b fix/<short-desc> \
  "$HOME/Projects/OpenSources/orca-worktrees/fix-<N>" \
  upstream/main
make worktree-bootstrap DIR="$HOME/Projects/OpenSources/orca-worktrees/fix-<N>"
```

Bootstrap is **local-only** (git exclude + symlinks). It does not add files to the
`fix/*` commit that PRs to upstream.

Vitest (desktop/shared):

```bash
pnpm exec vitest run --config config/vitest.config.ts <paths>
```

Mobile (needs `mobile/pnpm install`):

```bash
cd mobile && pnpm exec vitest run <paths>
```

---

## Dual-track PR

```bash
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
SKILL="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror"
MIRROR="$SKILL/scripts/mirror-upstream-pr.sh"
SYNC="$SKILL/scripts/sync-contribution-push.sh"
PREPARE="$SKILL/scripts/prepare-pr-followup.sh"
chmod +x "$MIRROR" "$PREPARE" "$SYNC"

# From worktree after commit:
git push -u origin HEAD

gh pr create --repo stablyai/orca --base main --head innocarpe:<branch> \
  --title "..." --body "..."

"$MIRROR" <upstream-pr-number>

# Every later response, before editing/replying:
"$PREPARE" # or: make pr-followup
# edit -> tests -> commit
"$SYNC"
"$SYNC" --comment "Address review: ..."
```

Tell the user **both** URLs (upstream + fork portfolio).

Skill details: [`.grok/skills/oss-pr-mirror/SKILL.md`](../skills/oss-pr-mirror/SKILL.md)

---

## Free-issue cycle (“다음”)

1. Scan open unassigned issues; skip those with competing open PRs or maintainer assignees.
2. Prefer small concrete bugs with anchors + test paths (★☆☆–★★☆).
3. Propose 3–5 candidates; implement only after user picks.
4. Parallel worktrees OK for independent issues.
5. Dual PR each; delete worktrees; update BOARD/HISTORY.

Skill: [`.grok/skills/orca-free-issue/SKILL.md`](../skills/orca-free-issue/SKILL.md)

---

## Worktree hygiene

Skill: [`.grok/skills/orca-worktree/SKILL.md`](../skills/orca-worktree/SKILL.md)

Remove when: dual PR open, working tree clean, remote branch exists, review can recreate worktree.

```bash
cd "$ORCA_PRIMARY"
git worktree remove --force .../orca-worktrees/fix-<N>   # or rm -rf if remove fails
git worktree prune
git branch -D fix/<branch>   # local only; keep origin
```

---

## Product rules (always)

When editing Orca product code, also obey root **AGENTS.md**:

- Design system / STYLEGUIDE
- Concise why-comments only
- No `max-lines` disables
- Concrete file names (no vague `utils`/`helpers`)
- Cross-platform keyboard/paths
- SSH + Git 2.25 compatibility
- GitLab-aware SC, not GitHub-only

---

## Skills install (Claude + Codex + Grok)

```bash
"$ORCA_PRIMARY/.grok/install-agent-skills.sh"
```

Installs into gitignored `.claude/skills/` and `.agents/skills/` for local discovery.  
Grok reads `.grok/skills/` directly (no install required).

| Skill | When |
|-------|------|
| **`orca-merge-playbook`** | **Always** on contribution work — focused / preserves / regression |
| `orca-contribution` | Session start / full loop |
| `oss-pr-mirror` | Dual-track PRs |
| `orca-free-issue` | Free-issue scout (playbook-filtered) |
| `orca-worktree` | Worktree create/remove |
