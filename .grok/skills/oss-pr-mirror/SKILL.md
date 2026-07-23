---
name: oss-pr-mirror
description: >
  Dual-track Orca (and similar) OSS PRs: upstream for real review (stablyai/orca)
  plus fork portfolio mirror (innocarpe/orca) for GitHub exhibition. Use when
  opening an upstream PR, pushing review follow-ups, amending after PR open,
  or the user says "mirror PR", "fork PR", "portfolio PR", "내 레포에도",
  "전시용 PR", "양쪽 PR", "upstream이랑 내 레포", "추가 수정 push", "sync both PRs",
  or runs /oss-pr-mirror. ALWAYS after gh pr create to stablyai/orca AND after
  every subsequent push to that contribution branch.
---

# OSS PR Dual Track (Upstream + Fork Portfolio)

Two PRs, **one branch on the fork**:

```text
local worktree branch
        │
        ▼  git push origin HEAD
innocarpe/orca  branch:fix/...
        │
        ├──► stablyai/orca  PR   (real review / merge)   head = innocarpe:fix/...
        └──► innocarpe/orca PR   (portfolio / exhibition) head = same branch, base = main
```

**Important:** After the first push, **one `git push` to the fork updates both PRs**.  
You do **not** need two different remotes for commit delivery.  
This skill still **must**:

1. Ensure the **fork portfolio PR exists** (create if missing)
2. On every follow-up push, **push + verify both PR heads match**
3. Optionally **comment both PRs** so activity streams show the update

## Defaults

| Role | Value |
|------|--------|
| Upstream | `stablyai/orca` |
| Fork | `innocarpe/orca` |
| Remote | `origin` → fork |
| Author | `innocarpe` |

Location (project skill — **not** `~/.grok`):

- This skill lives at `<repo>/.grok/skills/oss-pr-mirror/`
- Commit it on **fork `main` only**. Do **not** put these files on contribution branches that PR to upstream.
- Worktrees on `fix/*` may not have this tree checked out; invoke scripts via the primary checkout path below.

Local SSOT (gitignore):

- `.../orca/notes/orca-contribution/BOARD.md`
- `.../orca/notes/orca-contribution/HISTORY.md`

Scripts:

```bash
# Primary checkout (fork main has .grok; fix worktrees often do not)
ORCA_PRIMARY="${ORCA_PRIMARY:-$HOME/Projects/OpenSources/orca}"
SKILL_ROOT="$ORCA_PRIMARY/.grok/skills/oss-pr-mirror"
# If the current checkout already has the skill (you're on main):
if [[ -d "$(git rev-parse --show-toplevel)/.grok/skills/oss-pr-mirror" ]]; then
  SKILL_ROOT="$(git rev-parse --show-toplevel)/.grok/skills/oss-pr-mirror"
fi
MIRROR="$SKILL_ROOT/scripts/mirror-upstream-pr.sh"
SYNC="$SKILL_ROOT/scripts/sync-contribution-push.sh"
chmod +x "$MIRROR" "$SYNC"
```

---

## A) First time: open contribution

```bash
# 1) From worktree: commit, then
git push -u origin HEAD

# 2) Upstream PR (real)
gh pr create --repo stablyai/orca --base main --head innocarpe:<branch> ...

# 3) Fork portfolio PR (exhibition) — mandatory
"$MIRROR" <upstream-pr-number>
# or: "$MIRROR" --from-branch
```

Agent checklist:

- [ ] Upstream PR URL
- [ ] Fork portfolio PR URL (`$MIRROR` / create)
- [ ] BOARD + HISTORY updated
- [ ] Tell user **both** URLs

---

## B) After PR open: more commits / review fixes (mandatory every push)

```bash
# From the same worktree / branch:
git add ... && git commit -m "..."

# Push once to fork + verify both PRs share HEAD (+ ensure mirror exists)
"$SYNC"
# with dual activity comment:
"$SYNC" --comment "Address review: tighten Grok background HUD transition test"
```

What `$SYNC` does:

1. `git push -u origin HEAD:<branch>` (fork only — powers **both** PRs)
2. Finds open upstream PR for this branch + author
3. Runs mirror script if fork portfolio PR is missing
4. Prints upstream URL, fork URL, both head SHAs vs local HEAD
5. Optional `--comment` posts the **same** update note on both PRs

### Agent rules for follow-up edits

Whenever you amend code after an Orca upstream PR is open:

1. Commit on the **issue worktree branch** (not primary `main`)
2. Run **`sync-contribution-push.sh`** (not bare `git push` alone)
3. Confirm output shows both PRs at the same SHA
4. If user wants visible chatter on both timelines, pass `--comment "..."`
5. Update `HISTORY.md` with a short “follow-up push” line when non-trivial

Do **not**:

- Push only and forget to check fork mirror still exists
- Open a second upstream PR for the same branch
- Merge the fork portfolio PR into fork `main` before upstream merges

---

## C) PR body edits (optional dual edit)

If you change the **upstream PR description**, mirror key facts onto the fork PR body or post a comment with the delta. Bodies are independent; commits are not.

```bash
# Example: comment both after a meaningful description rewrite
"$SYNC" --no-push --comment "Updated PR description: added Evidence + tradeoffs"
```

---

## D) Lifecycle

| Event | Action |
|-------|--------|
| Open | upstream PR + `$MIRROR` |
| More commits | `$SYNC` (push once) |
| Review reply | commit + `$SYNC --comment "..."` |
| Upstream merged | close fork mirror; `gh repo sync innocarpe/orca --source stablyai/orca` (or UI Sync fork); BOARD/HISTORY `done` |
| Upstream closed | close fork mirror |

---

## Quick reference

```bash
# Status of all dual tracks
"$MIRROR" --list

# Ensure every open upstream PR has a fork mirror
"$MIRROR" --all-open

# After local commits on fix branch
"$SYNC"
"$SYNC" --comment "fix: address CodeRabbit transition-test suggestion"
```

## Anti-patterns

- Thinking upstream and fork need two different push targets for code (they share one branch)
- Skipping `$SYNC` / mirror after follow-up commits
- Force-push without telling user (confirm first if rewriting published history)
- Merging portfolio PRs into fork main early
