#!/usr/bin/env bash
# Rebase an open contribution branch onto the latest upstream/main before any
# upstream-facing follow-up. Records the exact remote/base SHAs so the later
# sync can use a race-safe force-with-lease and reject stale validation.

set -euo pipefail

REMOTE="${REMOTE:-origin}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need git

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ -n "$branch" && "$branch" != "HEAD" ]] || die "not on a named branch"
[[ "$branch" != "main" && "$branch" != "master" ]] || die "refuse to prepare main/master"
[[ -z "$(git status --porcelain)" ]] || die "worktree must be clean before follow-up preparation"

state_file="$(git rev-parse --git-path orca-pr-followup-state)"
rm -f "$state_file"

remote_sha="$({ git ls-remote --exit-code --heads "$REMOTE" "refs/heads/${branch}" || true; } | awk 'NR == 1 { print $1 }')"
[[ -n "$remote_sha" ]] || die "remote branch not found: ${REMOTE}/${branch}"

git fetch "$REMOTE" "+refs/heads/${branch}:refs/remotes/${REMOTE}/${branch}"
git fetch "$UPSTREAM_REMOTE" "+refs/heads/${UPSTREAM_BRANCH}:refs/remotes/${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"

local_sha="$(git rev-parse HEAD)"
if [[ "$local_sha" != "$remote_sha" ]] && ! git merge-base --is-ancestor "$remote_sha" HEAD; then
  die "local branch does not contain current ${REMOTE}/${branch}; recreate or reconcile before rebasing"
fi

upstream_ref="refs/remotes/${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
upstream_sha="$(git rev-parse "$upstream_ref")"
before_sha="$local_sha"

# Flatten prior upstream merge commits once; otherwise an already-current branch
# would keep the merge-shaped review diff even though this workflow requires rebase.
merge_commits="$(git rev-list --merges "${upstream_ref}..HEAD")"
if [[ -n "$merge_commits" ]]; then
  git rebase --force-rebase "$upstream_ref"
else
  git rebase "$upstream_ref"
fi

after_sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$upstream_ref" HEAD || die "rebase did not include ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
[[ -z "$(git rev-list --merges "${upstream_ref}..HEAD")" ]] || die "follow-up history still contains merge commits"
[[ -z "$(git status --porcelain)" ]] || die "worktree is not clean after rebase"

state_dir="$(dirname "$state_file")"
state_tmp="${state_file}.tmp.$$"
mkdir -p "$state_dir"
printf '%s\n' \
  'version=1' \
  "branch=${branch}" \
  "remote=${REMOTE}" \
  "remote_sha=${remote_sha}" \
  "upstream_remote=${UPSTREAM_REMOTE}" \
  "upstream_branch=${UPSTREAM_BRANCH}" \
  "upstream_sha=${upstream_sha}" \
  "prepared_head=${after_sha}" >"$state_tmp"
mv "$state_tmp" "$state_file"

echo "prepared PR follow-up"
echo "  branch:          ${branch}"
echo "  remote expected: ${remote_sha}"
echo "  upstream base:   ${upstream_sha} (${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH})"
echo "  before:          ${before_sha}"
echo "  after:           ${after_sha}"
echo
echo "Public commit subjects:"
git log "${upstream_ref}..HEAD" --format='%h %s'
echo
echo "Next: make the focused change, rerun regression/quality checks, commit, then run sync-contribution-push.sh."
