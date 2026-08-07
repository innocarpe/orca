#!/usr/bin/env bash
# Push additional commits on a contribution branch so BOTH PRs stay current:
#   - upstream PR  (stablyai/orca  <-  innocarpe:branch)
#   - fork mirror  (innocarpe/orca  main <- branch)
#
# One push to the fork is enough: both PRs share the same head branch on the fork.
# This script also enforces the prepare -> validate -> sync contract: every
# follow-up must be rebased onto the latest upstream/main first.
#
# Usage:
#   sync-contribution-push.sh                 # push current branch, verify both PRs
#   sync-contribution-push.sh --comment "msg" # also post the same update on both PRs
#   sync-contribution-push.sh --no-push       # verify only (no git push)
#   sync-contribution-push.sh --ensure-mirror # create fork mirror if missing
#   FORK_LABEL=bug sync-contribution-push.sh  # label a newly created fork mirror
#
# Env:
#   UPSTREAM_REPO  default: stablyai/orca
#   FORK_REPO      default: innocarpe/orca
#   REMOTE         default: origin
#   UPSTREAM_REMOTE default: upstream
#   UPSTREAM_BRANCH default: main
#   AUTHOR         default: gh api user

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-stablyai/orca}"
FORK_REPO="${FORK_REPO:-innocarpe/orca}"
REMOTE="${REMOTE:-origin}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
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
[[ -z "$(git status --porcelain)" ]] || die "worktree must be clean before sync"

upstream_ref="refs/remotes/${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
git fetch "$UPSTREAM_REMOTE" "+refs/heads/${UPSTREAM_BRANCH}:${upstream_ref}"
upstream_sha="$(git rev-parse "$upstream_ref")"
sha="$(git rev-parse HEAD)"
remote_sha="$({ git ls-remote --exit-code --heads "$REMOTE" "refs/heads/${branch}" || true; } | awk 'NR == 1 { print $1 }')"
[[ -n "$remote_sha" ]] || die "remote branch not found: ${REMOTE}/${branch}"

git merge-base --is-ancestor "$upstream_ref" HEAD || \
  die "branch does not contain latest ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} (${upstream_sha}); run prepare-pr-followup.sh, rerun tests, then sync"
[[ -z "$(git rev-list --merges "${upstream_ref}..HEAD")" ]] || \
  die "follow-up history contains merge commits; run prepare-pr-followup.sh and rerun tests"

if [[ "$DO_PUSH" -eq 1 ]]; then
  state_file="$(git rev-parse --git-path orca-pr-followup-state)"
  [[ -f "$state_file" ]] || die "missing follow-up preparation state; run prepare-pr-followup.sh before editing/testing"

  state_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$state_file"
  }

  state_version="$(state_value version)"
  state_branch="$(state_value branch)"
  state_remote="$(state_value remote)"
  expected_remote_sha="$(state_value remote_sha)"
  state_upstream_remote="$(state_value upstream_remote)"
  state_upstream_branch="$(state_value upstream_branch)"
  state_upstream_sha="$(state_value upstream_sha)"
  prepared_head="$(state_value prepared_head)"

  [[ "$state_version" == "1" ]] || die "unsupported or incomplete follow-up preparation state"
  [[ -n "$expected_remote_sha" && -n "$state_upstream_sha" && -n "$prepared_head" ]] || \
    die "incomplete follow-up preparation state"
  [[ "$state_branch" == "$branch" ]] || die "prepared branch changed: expected ${state_branch}, got ${branch}"
  [[ "$state_remote" == "$REMOTE" ]] || die "prepared remote changed: expected ${state_remote}, got ${REMOTE}"
  [[ "$state_upstream_remote" == "$UPSTREAM_REMOTE" && "$state_upstream_branch" == "$UPSTREAM_BRANCH" ]] || \
    die "prepared upstream changed; rerun prepare-pr-followup.sh"
  [[ "$state_upstream_sha" == "$upstream_sha" ]] || \
    die "${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} moved after preparation; rebase again and rerun tests"
  [[ "$expected_remote_sha" == "$remote_sha" ]] || \
    die "${REMOTE}/${branch} moved after preparation; reconcile the remote update before pushing"
  git merge-base --is-ancestor "$prepared_head" HEAD || \
    die "prepared history was rewritten after validation; rerun prepare-pr-followup.sh and tests"

  echo "Public commit subjects:"
  git log "${upstream_ref}..HEAD" --format='%h %s'
  echo

  # Rebase rewrites published history; pin the exact observed remote head so a
  # concurrent maintainer/agent update cannot be overwritten.
  git push --force-with-lease="refs/heads/${branch}:${expected_remote_sha}" \
    -u "$REMOTE" "HEAD:refs/heads/${branch}"
  rm -f "$state_file"
  echo "rebased + lease-protected push ${branch} -> ${REMOTE} (${FORK_REPO})"
else
  [[ "$remote_sha" == "$sha" ]] || die "--no-push requires local HEAD to match ${REMOTE}/${branch}"
  echo "skip push (--no-push)"
fi

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
[[ -n "$fork_json" ]] || die "no open fork portfolio PR on ${FORK_REPO} for branch ${branch} (run mirror-upstream-pr.sh --label <name> ${upstream_n})"

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
