---
name: oss-pr-mirror
description: >
  Dual-track Orca (and similar) OSS PRs: upstream for real review (stablyai/orca)
  plus fork portfolio mirror (innocarpe/orca) for GitHub exhibition. Use when
  opening an upstream PR, rebasing and pushing review follow-ups, amending after PR open,
  or the user says "mirror PR", "fork PR", "portfolio PR", "내 레포에도",
  "전시용 PR", "양쪽 PR", "upstream이랑 내 레포", "추가 수정 push", "sync both PRs",
  or runs /oss-pr-mirror. ALWAYS after create-upstream-pr.sh to stablyai/orca AND after
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

Location (project skill — **not** only `~/.grok`):

- Canonical path: `<repo>/.grok/skills/oss-pr-mirror/`
- Claude Code / Codex: run `<repo>/.grok/install-agent-skills.sh` so this package is linked into `.claude/skills/` and `.agents/skills/` (those dirs are gitignored by upstream).
- Commit harness on **fork `main` only**. Do **not** put these files on contribution branches that PR to upstream.
- Worktrees on `fix/*` may not have `.grok` checked out; invoke scripts via the primary checkout path below.
- Full multi-agent overview: [`.grok/README.md`](../../README.md)

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
CREATE="$SKILL_ROOT/scripts/create-upstream-pr.sh"
SYNC="$SKILL_ROOT/scripts/sync-contribution-push.sh"
PREPARE="$SKILL_ROOT/scripts/prepare-pr-followup.sh"
chmod +x "$CREATE" "$MIRROR" "$PREPARE" "$SYNC"
```

---

## A) First time: open contribution

```bash
# 1) From worktree: commit, then
git push -u origin HEAD

# 2) Upstream PR (real). Contributor PRs are intentionally unlabeled.
"$CREATE" --repo stablyai/orca --base main --head innocarpe:<branch> \
  --title "fix: ..." --body-file /tmp/orca-pr-body.md

# 3) Fork portfolio PR (exhibition) — mandatory
"$MIRROR" --label bug <upstream-pr-number>
# or: "$MIRROR" --label bug --from-branch
```

Agent checklist:

- [ ] **Merge playbook** (`orca-merge-playbook`): focused + preserves + regression evidence in PR body
- [ ] Upstream PR URL
- [ ] Fork portfolio PR URL (`$MIRROR` / create)
- [ ] BOARD + HISTORY (+ PORTFOLIO if merge counts change) updated
- [ ] Tell user **both** URLs

---

## B) After PR open: more commits / review fixes (mandatory every push)

```bash
# From the clean issue worktree, before editing or replying:
"$PREPARE" # or: make pr-followup

# Then make the focused change and validate the rebased tree:
git add ... && git commit -m "..."

# Lease-protected push + verify both PRs share HEAD (+ ensure mirror exists)
"$SYNC"
# with dual activity comment:
"$SYNC" --comment "Address review: tighten Grok background HUD transition test"
```

What `$SYNC` does:

1. Fetches `upstream/main` again and rejects stale preparation/validation
2. Rejects concurrent fork-branch changes against the sealed remote SHA
3. Pushes with exact `--force-with-lease` (fork only — powers **both** PRs)
4. Finds the open upstream PR and ensures the fork mirror exists
5. Prints upstream URL, fork URL, both head SHAs vs local HEAD
6. Optionally posts the **same** update note on both PRs

### Agent rules for follow-up edits

Whenever you amend code after an Orca upstream PR is open:

1. Start clean and run **`prepare-pr-followup.sh` / `make pr-followup`** before editing or replying
2. Keep the change **in scope** (`orca-merge-playbook`: no drive-by expansions while addressing review)
3. Rerun regression and quality checks after the rebase
4. Commit on the **issue worktree branch** (not primary `main`)
5. Run **`sync-contribution-push.sh`** (not bare `git push` alone)
6. Confirm output shows both PRs at the same SHA
7. Prefer **one clear human comment** over `--comment` spam for Sync update noise
8. Update `HISTORY.md` with a short “follow-up push” line when non-trivial

Do **not**:

- Push only and forget to check fork mirror still exists
- Reply/resolve/edit a PR while its branch is behind freshly fetched `upstream/main`
- Test before rebasing and reuse those stale-base results afterward
- Open a second upstream PR for the same branch
- Merge the fork portfolio PR into fork `main` before upstream merges
- Expand PR scope while “just fixing CR”

---

## C) PR body edits (optional dual edit)

If you change the **upstream PR description**, mirror key facts onto the fork PR body or post a comment with the delta. Bodies are independent; commits are not.

```bash
# Comment-only actions are allowed only when the remote branch already contains
# the freshly fetched upstream/main; otherwise prepare, test, and sync first.
"$SYNC" --no-push --comment "Updated PR description: added Evidence + tradeoffs"
```

---

## D) Lifecycle

| Event | Action |
|-------|--------|
| Open | upstream PR + `$MIRROR` |
| More commits | `$PREPARE` → edit/test/commit → `$SYNC` |
| Review reply | `$PREPARE` → edit/test/commit → `$SYNC --comment "..."` |
| Upstream merged | close fork mirror; `gh repo sync innocarpe/orca --source stablyai/orca` (or UI Sync fork); BOARD/HISTORY `done` |
| Upstream closed | close fork mirror |

---

## Quick reference

```bash
# Status of all dual tracks
"$MIRROR" --list

# Ensure every open upstream PR has a labeled fork mirror
"$MIRROR" --label bug --all-open

# Before every open-PR follow-up
"$PREPARE"
# Then edit, test, commit, and sync
"$SYNC"
"$SYNC" --comment "fix: address CodeRabbit transition-test suggestion"
```

## Anti-patterns

- Thinking upstream and fork need two different push targets for code (they share one branch)
- Skipping `$SYNC` / mirror after follow-up commits
- Raw force-push; only the harness's sealed exact `--force-with-lease` is allowed
- Direct upstream `gh pr create`, `gh pr edit`, or REST label mutation; use the
  label-safe `create-upstream-pr.sh` entrypoint
- Creating a fork mirror without a kind label; use `mirror-upstream-pr.sh --label <name> ...`
- Merging portfolio PRs into fork main early
