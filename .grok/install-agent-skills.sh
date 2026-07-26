#!/usr/bin/env bash
# Install project skills from the tracked .grok/skills tree into local discovery
# paths used by Claude Code and Codex CLI.
#
# Upstream gitignores /.claude/skills/ and /.agents/skills/ — those are install
# targets only. Canonical copies stay under .grok/skills/ (fork main).
#
# Usage:
#   ./.grok/install-agent-skills.sh
#   ./.grok/install-agent-skills.sh --copy   # copy instead of symlink
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/.grok/skills"
MODE=symlink

if [[ "${1:-}" == "--copy" ]]; then
  MODE=copy
fi

if [[ ! -d "$SRC" ]]; then
  echo "error: missing $SRC" >&2
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
    # Skills may include scripts/; copy the whole package.
    cp -R "$SRC/$name/." "$dest/"
  else
    ln -s "$SRC/$name" "$dest"
  fi
  echo "  $dest"
}

echo "Installing skills from $SRC (mode=$MODE)"

CLAUDE_SKILLS="$ROOT/.claude/skills"
AGENTS_SKILLS="$ROOT/.agents/skills"

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
echo "  Claude: CLAUDE.md / Claude.md"
echo "  Codex:  AGENTS.md + codex.md / CLAUDE.md fallback"
echo "  Grok:   .grok/skills (native)"
echo "  Workflow SSOT: .grok/agent/orca-contribution.md"
