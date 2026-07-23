#!/usr/bin/env bash
# Push additional commits on a contribution branch so BOTH PRs stay current:
#   - upstream PR  (stablyai/orca  <-  innocarpe:branch)
#   - fork mirror  (innocarpe/orca  main <- branch)
#
# One push to the fork is enough: both PRs share the same head branch on the fork.
# This script makes that explicit, verifies both PRs, optionally comments both.
#
# Usage:
#   sync-contribution-push.sh                 # push current branch, verify both PRs
#   sync-contribution-push.sh --comment "msg" # also post the same update on both PRs
#   sync-contribution-push.sh --no-push       # verify only (no git push)
#   sync-contribution-push.sh --ensure-mirror # create fork mirror if missing
#
# Env:
#   UPSTREAM_REPO  default: stablyai/orca
#   FORK_REPO      default: innocarpe/orca
#   REMOTE         default: origin
#   AUTHOR         default: gh api user

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-stablyai/orca}"
FORK_REPO="${FORK_REPO:-innocarpe/orca}"
REMOTE="${REMOTE:-origin}"
AUTHOR="${AUTHOR:-$(gh api user -q .login)}"
# Prefer sibling script (project skill under <repo>/.grok/skills/oss-pr-mirror/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIRROR_SCRIPT="${MIRROR_SCRIPT:-$SCRIPT_DIR/mirror-upstream-pr.sh}"

DO_PUSH=1
ENSURE_MIRROR=1
COMMENT_MSG=""

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need gh
need jq
need git

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-push)
      DO_PUSH=0
      shift
      ;;
    --ensure-mirror)
      ENSURE_MIRROR=1
      shift
      ;;
    --no-ensure-mirror)
      ENSURE_MIRROR=0
      shift
      ;;
    --comment)
      COMMENT_MSG="${2:-}"
      [[ -n "$COMMENT_MSG" ]] || die "--comment requires a message"
      shift 2
      ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      die "unknown arg: $1"
      ;;
  esac
done

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ -n "$branch" && "$branch" != "HEAD" ]] || die "not on a named branch"
[[ "$branch" != "main" && "$branch" != "master" ]] || die "refuse to sync from main/master"

if [[ "$DO_PUSH" -eq 1 ]]; then
  # Single source of truth for both PRs: the fork branch.
  git push -u "$REMOTE" "HEAD:refs/heads/${branch}"
  echo "pushed ${branch} -> ${REMOTE} (${FORK_REPO})"
else
  echo "skip push (--no-push)"
fi

sha="$(git rev-parse HEAD)"
short_sha="$(git rev-parse --short HEAD)"
subject="$(git log -1 --pretty=%s)"

upstream_json="$(
  gh pr list --repo "$UPSTREAM_REPO" --author "$AUTHOR" --head "$branch" --state open \
    --json number,url,headRefOid,title --jq '.[0] // empty'
)"
[[ -n "$upstream_json" ]] || die "no open upstream PR on ${UPSTREAM_REPO} for branch ${branch} by @${AUTHOR}"

upstream_n="$(printf '%s' "$upstream_json" | jq -r '.number')"
upstream_url="$(printf '%s' "$upstream_json" | jq -r '.url')"
upstream_head="$(printf '%s' "$upstream_json" | jq -r '.headRefOid')"

if [[ "$ENSURE_MIRROR" -eq 1 ]]; then
  if [[ -x "$MIRROR_SCRIPT" ]]; then
    "$MIRROR_SCRIPT" "$upstream_n" >/dev/null
  else
    echo "warn: mirror script missing at $MIRROR_SCRIPT" >&2
  fi
fi

fork_json="$(
  gh pr list --repo "$FORK_REPO" --head "$branch" --state open \
    --json number,url,headRefOid,title --jq '.[0] // empty'
)"
[[ -n "$fork_json" ]] || die "no open fork portfolio PR on ${FORK_REPO} for branch ${branch} (run mirror-upstream-pr.sh ${upstream_n})"

fork_n="$(printf '%s' "$fork_json" | jq -r '.number')"
fork_url="$(printf '%s' "$fork_json" | jq -r '.url')"
fork_head="$(printf '%s' "$fork_json" | jq -r '.headRefOid')"

echo
echo "=== dual-PR sync status ==="
echo "branch:    ${branch}"
echo "local:     ${short_sha}  ${subject}"
echo "upstream:  ${UPSTREAM_REPO}#${upstream_n}  head=${upstream_head:0:9}"
echo "           ${upstream_url}"
echo "fork:      ${FORK_REPO}#${fork_n}  head=${fork_head:0:9}"
echo "           ${fork_url}"

ok=1
if [[ "$upstream_head" != "$sha" ]]; then
  echo "warn: upstream PR head != local HEAD (may still be propagating)" >&2
  ok=0
fi
if [[ "$fork_head" != "$sha" ]]; then
  echo "warn: fork PR head != local HEAD (may still be propagating)" >&2
  ok=0
fi
if [[ "$upstream_head" == "$fork_head" && "$upstream_head" == "$sha" ]]; then
  echo "OK: both PRs point at the same commit as local HEAD"
fi

if [[ -n "$COMMENT_MSG" ]]; then
  body="$(
    cat <<EOF
### Sync update (\`${short_sha}\`)

${COMMENT_MSG}

- Commit: \`${sha}\`
- Upstream: ${upstream_url}
- Fork portfolio: ${fork_url}
EOF
  )"
  gh pr comment "$upstream_n" --repo "$UPSTREAM_REPO" --body "$body" >/dev/null
  gh pr comment "$fork_n" --repo "$FORK_REPO" --body "$body" >/dev/null
  echo "commented on both PRs"
fi

if [[ "$ok" -ne 1 ]]; then
  exit 2
fi
