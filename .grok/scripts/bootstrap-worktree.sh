#!/usr/bin/env bash
# Wire the multi-LLM contribution harness into a worktree WITHOUT making it
# part of an upstream-bound commit.
#
# Strategy:
#   1. Symlink harness assets from ORCA_PRIMARY when missing (upstream worktrees).
#   2. Install Claude/Codex skills into this worktree.
#   3. Hide overlays via *worktree-private* core.excludesFile
#      (requires extensions.worktreeConfig — enabled locally in this clone).
#      Never write to the shared common exclude (that would hide .grok on primary).
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

# Per-worktree ignore file so overlays never appear in git status / accidental add.
ensure_worktree_excludes() {
  local git_dir common excl
  git_dir="$(git -C "$WT" rev-parse --git-dir)"
  if [[ "$git_dir" != /* ]]; then
    git_dir="$(cd "$WT" && cd "$git_dir" && pwd)"
  fi
  common="$(git -C "$WT" rev-parse --git-common-dir)"
  if [[ "$common" != /* ]]; then
    common="$(cd "$WT" && cd "$common" && pwd)"
  fi

  # Primary checkout shares common==git-dir — never attach worktree excludes there.
  if [[ "$(cd "$git_dir" && pwd)" == "$(cd "$common" && pwd)" ]]; then
    echo "  skip worktree excludes (primary checkout)"
    return 0
  fi

  # Local clone setting only (not committed) — needed for git config --worktree.
  git -C "$WT" config --file "$common/config" extensions.worktreeConfig true

  excl="$git_dir/info/orca-agent.exclude"
  mkdir -p "$(dirname "$excl")"
  cat >"$excl" <<'EOF'
# orca-agent-harness — worktree-private (do not commit into fix/* PRs)
# Source of truth: fork primary .grok/ (innocarpe main)
.grok
.grok/
/Makefile
/codex.md
.claude/
.agents/
EOF
  git -C "$WT" config --worktree core.excludesFile "$excl"
  echo "  excludesFile ← $excl"
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

ensure_worktree_excludes

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

AUDIT="$PRIMARY/.grok/scripts/audit-worktree-harness.sh"
if [[ -x "$AUDIT" ]]; then
  ORCA_PRIMARY="$PRIMARY" bash "$AUDIT" "$WT"
else
  die "missing executable harness audit: $AUDIT"
fi

echo "bootstrap-worktree: ok"
echo "  Harness overlays are worktree-private (git status clean; not PR material)."
