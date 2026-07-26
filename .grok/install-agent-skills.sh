#!/usr/bin/env bash
# Install project skills from the tracked .grok/skills tree into local discovery
# paths used by Claude Code and Codex CLI.
#
# Upstream gitignores /.claude/skills/ and /.agents/skills/ — those are install
# targets only. Canonical copies stay under .grok/skills/ (fork main).
#
# Usage:
#   ./.grok/install-agent-skills.sh
#   ./.grok/install-agent-skills.sh --copy
#   ORCA_SKILL_INSTALL_ROOT=/path/to/worktree ./.grok/install-agent-skills.sh
#
# Env:
#   ORCA_SKILL_INSTALL_ROOT  where to create .claude/skills and .agents/skills
#                            (default: repo that owns this script)
#   ORCA_PRIMARY             optional skill source override
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE=symlink
if [[ "${1:-}" == "--copy" ]]; then
  MODE=copy
fi

# Skill source: prefer primary if set, else the checkout that owns this script.
if [[ -n "${ORCA_PRIMARY:-}" && -d "${ORCA_PRIMARY}/.grok/skills" ]]; then
  SRC="${ORCA_PRIMARY}/.grok/skills"
else
  SRC="$SCRIPT_REPO/.grok/skills"
fi

INSTALL_ROOT="${ORCA_SKILL_INSTALL_ROOT:-$SCRIPT_REPO}"

if [[ ! -d "$SRC" ]]; then
  echo "error: missing skill source $SRC" >&2
  exit 1
fi

install_one() {
  local name="$1"
  local target_root="$2"
  local dest="$target_root/$name"
  mkdir -p "$target_root"
  rm -rf "$dest"
  if [[ "$MODE" == "copy" ]]; then
    mkdir -p "$dest"
    cp -R "$SRC/$name/." "$dest/"
  else
    # Absolute link so worktrees keep working if cwd changes.
    ln -s "$(cd "$SRC/$name" && pwd)" "$dest"
  fi
  echo "  $dest"
}

echo "Installing skills from $SRC (mode=$MODE)"
echo "  install root: $INSTALL_ROOT"

CLAUDE_SKILLS="$INSTALL_ROOT/.claude/skills"
AGENTS_SKILLS="$INSTALL_ROOT/.agents/skills"

echo "Claude Code → $CLAUDE_SKILLS"
for skill_dir in "$SRC"/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  install_one "$name" "$CLAUDE_SKILLS"
done

echo "Codex CLI   → $AGENTS_SKILLS"
for skill_dir in "$SRC"/*/; do
  [[ -f "${skill_dir}SKILL.md" ]] || continue
  name="$(basename "$skill_dir")"
  install_one "$name" "$AGENTS_SKILLS"
done

echo
echo "Done. Entrypoints:"
echo "  Claude: CLAUDE.md + .claude/rules/ (after worktree bootstrap)"
echo "  Codex:  AGENTS.md + codex.md / CLAUDE.md fallback"
echo "  Grok:   .grok/skills"
echo "  Workflow SSOT: .grok/agent/orca-contribution.md"
