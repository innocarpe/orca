#!/usr/bin/env bash
# Wire the multi-LLM contribution harness into a worktree WITHOUT making it
# part of an upstream-bound commit.
#
# Strategy:
#   1. Symlink harness assets from ORCA_PRIMARY when missing (upstream worktrees).
#   2. Install Claude/Codex skills into this worktree.
#   3. Write excludes into the *worktree-private* git dir only
#      ($COMMON/worktrees/<id>/info/exclude) — NEVER the shared common exclude,
#      so primary fork main can still commit .grok/ and Makefile.
#
# Usage:
#   bootstrap-worktree.sh [WORKTREE_DIR]
#
# Env:
#   ORCA_PRIMARY  primary checkout with .grok/skills

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }

resolve_primary() {
  if [[ -n "${ORCA_PRIMARY:-}" && -d "${ORCA_PRIMARY}/.grok/skills" ]]; then
    echo "$ORCA_PRIMARY"
    return
  fi
  if [[ -d "$SCRIPT_REPO/.grok/skills" ]]; then
    echo "$SCRIPT_REPO"
    return
  fi
  local default="${HOME}/Projects/OpenSources/orca"
  if [[ -d "$default/.grok/skills" ]]; then
    echo "$default"
    return
  fi
  die "ORCA_PRIMARY not set and no .grok/skills found (expected at $default)"
}

# Worktree-private exclude only (not the shared common exclude).
ensure_worktree_exclude() {
  local git_dir exclude
  git_dir="$(git -C "$WT" rev-parse --git-dir)"
  if [[ "$git_dir" != /* ]]; then
    git_dir="$(cd "$WT" && cd "$git_dir" && pwd)"
  fi

  # Primary checkout uses <repo>/.git — never write harness excludes there.
  local common
  common="$(git -C "$WT" rev-parse --git-common-dir)"
  if [[ "$common" != /* ]]; then
    common="$(cd "$WT" && cd "$common" && pwd)"
  fi
  if [[ "$(cd "$git_dir" && pwd)" == "$(cd "$common" && pwd)" ]]; then
    echo "  skip exclude (this is the primary checkout, not a linked worktree)"
    return 0
  fi

  exclude="$git_dir/info/exclude"
  mkdir -p "$(dirname "$exclude")"

  cat >"$exclude" <<'EOF'
# orca-agent-harness — worktree-private overlay (do not commit into fix/* PRs)
# Source of truth: fork primary .grok/ (innocarpe main only)
.grok
.grok/
/Makefile
/codex.md
.claude/
.agents/
EOF
  echo "  exclude ← $exclude (worktree-private)"
}

link_if_missing() {
  local src="$1"
  local dest="$2"
  [[ -e "$src" ]] || return 0
  if [[ -e "$dest" || -L "$dest" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "  link  $dest → $src"
}

write_claude_rule() {
  local dest="$WT/.claude/rules/orca-contribution.md"
  local src="$PRIMARY/.grok/agent/orca-contribution.md"
  [[ -f "$src" ]] || return 0
  mkdir -p "$(dirname "$dest")"
  rm -f "$dest"
  ln -s "$src" "$dest"
  echo "  rule  $dest"
}

WT="$(cd "${1:-.}" && pwd)"
[[ -d "$WT/.git" || -f "$WT/.git" ]] || die "not a git worktree: $WT"

PRIMARY="$(resolve_primary)"
export ORCA_PRIMARY="$PRIMARY"

echo "bootstrap-worktree"
echo "  worktree: $WT"
echo "  primary:  $PRIMARY"

ensure_worktree_exclude

link_if_missing "$PRIMARY/.grok" "$WT/.grok"
link_if_missing "$PRIMARY/Makefile" "$WT/Makefile"
link_if_missing "$PRIMARY/codex.md" "$WT/codex.md"

write_claude_rule

if [[ -x "$PRIMARY/.grok/install-agent-skills.sh" ]]; then
  ORCA_PRIMARY="$PRIMARY" \
    ORCA_SKILL_INSTALL_ROOT="$WT" \
    bash "$PRIMARY/.grok/install-agent-skills.sh"
else
  die "missing $PRIMARY/.grok/install-agent-skills.sh"
fi

echo "bootstrap-worktree: ok"
echo "  Overlays use worktree-private exclude — invisible to git status / not PR material."
