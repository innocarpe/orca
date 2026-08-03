#!/usr/bin/env bash
# Verify that every registered contribution worktree consumes the canonical
# fork-main harness without adding those files to its upstream-bound diff.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMARY="${ORCA_PRIMARY:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
PRIMARY="$(cd "$PRIMARY" && pwd -P)"

die() {
  echo "error: $*" >&2
  exit 1
}

assert_link() {
  local link_path="$1"
  local expected="$2"
  [[ -L "$link_path" ]] || die "expected symlink: $link_path"
  [[ "$(readlink "$link_path")" == "$expected" ]] || \
    die "wrong symlink target: $link_path -> $(readlink "$link_path"), expected $expected"
}

audit_primary() {
  [[ -x "$PRIMARY/.grok/skills/oss-pr-mirror/scripts/prepare-pr-followup.sh" ]] || \
    die "missing follow-up preparation gate in primary"
  assert_link "$PRIMARY/.agents/skills/orca-contribution" "$PRIMARY/.grok/skills/orca-contribution"
  assert_link "$PRIMARY/.agents/skills/oss-pr-mirror" "$PRIMARY/.grok/skills/oss-pr-mirror"
  assert_link "$PRIMARY/.claude/skills/orca-contribution" "$PRIMARY/.grok/skills/orca-contribution"
  assert_link "$PRIMARY/.claude/skills/oss-pr-mirror" "$PRIMARY/.grok/skills/oss-pr-mirror"
  echo "OK primary harness: $PRIMARY"
}

audit_worktree() {
  local worktree="$1"
  local resolved exclude_file overlay_status

  [[ -d "$worktree" ]] || die "worktree path missing: $worktree"
  resolved="$(cd "$worktree" && pwd -P)"
  if [[ "$resolved" == "$PRIMARY" ]]; then
    audit_primary
    return
  fi

  git -C "$resolved" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
    die "not a git worktree: $resolved"
  assert_link "$resolved/.grok" "$PRIMARY/.grok"
  assert_link "$resolved/Makefile" "$PRIMARY/Makefile"
  assert_link "$resolved/codex.md" "$PRIMARY/codex.md"
  assert_link "$resolved/.agents/skills/orca-contribution" "$PRIMARY/.grok/skills/orca-contribution"
  assert_link "$resolved/.agents/skills/oss-pr-mirror" "$PRIMARY/.grok/skills/oss-pr-mirror"
  assert_link "$resolved/.claude/skills/orca-contribution" "$PRIMARY/.grok/skills/orca-contribution"
  assert_link "$resolved/.claude/skills/oss-pr-mirror" "$PRIMARY/.grok/skills/oss-pr-mirror"
  assert_link "$resolved/.claude/rules/orca-contribution.md" "$PRIMARY/.grok/agent/orca-contribution.md"

  exclude_file="$(git -C "$resolved" config --worktree --get core.excludesFile || true)"
  [[ -n "$exclude_file" && -f "$exclude_file" ]] || die "missing worktree-private harness excludes: $resolved"
  overlay_status="$(git -C "$resolved" status --porcelain -- .grok Makefile codex.md .agents .claude)"
  [[ -z "$overlay_status" ]] || die "harness overlays leak into git status: $resolved"
  make -C "$resolved" -n pr-followup >/dev/null

  echo "OK contribution worktree harness: $resolved"
}

if [[ "$#" -gt 0 ]]; then
  for worktree in "$@"; do
    audit_worktree "$worktree"
  done
  exit 0
fi

while IFS= read -r line; do
  case "$line" in
    "worktree "*) audit_worktree "${line#worktree }" ;;
  esac
done < <(git -C "$PRIMARY" worktree list --porcelain)
