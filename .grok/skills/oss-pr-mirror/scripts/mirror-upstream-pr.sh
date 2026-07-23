#!/usr/bin/env bash
# Mirror an upstream contribution PR onto the author's fork as a portfolio PR.
# Exhibition only — do not merge these into fork main until upstream is merged.
#
# Usage:
#   mirror-upstream-pr.sh <upstream-pr-number>
#   mirror-upstream-pr.sh --from-branch
#   mirror-upstream-pr.sh --all-open
#   mirror-upstream-pr.sh --list
#
# Env (optional):
#   UPSTREAM_REPO   default: stablyai/orca
#   FORK_REPO       default: innocarpe/orca
#   FORK_BASE       default: main
#   AUTHOR          default: gh api user -q .login

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-stablyai/orca}"
FORK_REPO="${FORK_REPO:-innocarpe/orca}"
FORK_BASE="${FORK_BASE:-main}"
AUTHOR="${AUTHOR:-$(gh api user -q .login)}"

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need gh
need jq

ensure_branch_on_fork() {
  local branch="$1"
  if git ls-remote --heads "git@github.com:${FORK_REPO}.git" "$branch" | grep -q .; then
    return 0
  fi
  if git rev-parse --verify "$branch" >/dev/null 2>&1; then
    git push -u "git@github.com:${FORK_REPO}.git" "HEAD:refs/heads/${branch}"
    return 0
  fi
  die "branch '${branch}' not found on ${FORK_REPO} (push the branch first)"
}

existing_fork_pr_json() {
  local branch="$1"
  gh pr list --repo "$FORK_REPO" --head "$branch" --state open \
    --json number,url --jq '.[0] // empty'
}

build_mirror_body() {
  local upstream_url="$1"
  local issue_md="$2"
  local short="$3"
  cat <<EOF
> **Portfolio mirror** of my contribution to upstream \`${UPSTREAM_REPO}\`.
> Exhibition only — the real review/merge target is **upstream**.

## Upstream

- **PR:** ${upstream_url}
${issue_md}

## Summary

${short}

## Note

- Do **not** merge this into \`${FORK_REPO}\` \`${FORK_BASE}\` until the upstream PR is merged.
- After upstream merges: sync fork from upstream, then close this mirror PR.
- This open PR exists so visitors see in-flight work on this fork's **Pull requests** tab.
EOF
}

create_mirror() {
  local upstream_n="$1"

  local meta
  meta="$(gh pr view "$upstream_n" --repo "$UPSTREAM_REPO" --json number,title,body,headRefName,url,baseRefName,state,author)"
  local author_login
  author_login="$(printf '%s' "$meta" | jq -r '.author.login')"
  if [[ "$author_login" != "$AUTHOR" ]]; then
    die "upstream PR #${upstream_n} author is @${author_login}, expected @${AUTHOR}"
  fi

  local title head_ref upstream_url issue_line short
  title="$(printf '%s' "$meta" | jq -r '.title')"
  head_ref="$(printf '%s' "$meta" | jq -r '.headRefName')"
  upstream_url="$(printf '%s' "$meta" | jq -r '.url')"
  issue_line="$(printf '%s' "$meta" | jq -r '.body // ""' | grep -Eo 'Fixes? #[0-9]+' | head -1 || true)"
  short="$(printf '%s' "$meta" | jq -r '.body // ""' | tr '\n' ' ' | cut -c1-280)"

  ensure_branch_on_fork "$head_ref"

  local existing
  existing="$(existing_fork_pr_json "$head_ref")"
  if [[ -n "$existing" ]]; then
    local num url
    num="$(printf '%s' "$existing" | jq -r '.number')"
    url="$(printf '%s' "$existing" | jq -r '.url')"
    echo "already mirrored: ${FORK_REPO}#${num} -> ${url} (upstream #${upstream_n})"
    printf '%s\n' "$url"
    return 0
  fi

  local issue_md=""
  if [[ -n "$issue_line" ]]; then
    local issue_n="${issue_line##*#}"
    issue_md="- **Issue:** https://github.com/${UPSTREAM_REPO}/issues/${issue_n}"
  fi

  local body_file
  body_file="$(mktemp)"
  build_mirror_body "$upstream_url" "$issue_md" "$short" >"$body_file"

  local mirror_url
  mirror_url="$(
    gh pr create --repo "$FORK_REPO" --base "$FORK_BASE" --head "$head_ref" \
      --title "[upstream #${upstream_n}] ${title}" \
      --body-file "$body_file"
  )"
  rm -f "$body_file"

  echo "created mirror: ${mirror_url}  (upstream #${upstream_n})"
  printf '%s\n' "$mirror_url"
}

list_status() {
  echo "=== open upstream PRs by @${AUTHOR} on ${UPSTREAM_REPO} ==="
  gh pr list --repo "$UPSTREAM_REPO" --author "$AUTHOR" --state open \
    --json number,title,headRefName,url \
    --jq '.[] | "#\(.number)  \(.headRefName)\n  \(.title)\n  \(.url)"'
  echo
  echo "=== open fork portfolio PRs on ${FORK_REPO} ==="
  gh pr list --repo "$FORK_REPO" --state open \
    --json number,title,url \
    --jq '.[] | "#\(.number)  \(.title)\n  \(.url)"'
}

mirror_all_open() {
  local nums
  nums="$(gh pr list --repo "$UPSTREAM_REPO" --author "$AUTHOR" --state open --json number --jq '.[].number')"
  if [[ -z "$nums" ]]; then
    echo "no open upstream PRs by @${AUTHOR}"
    return 0
  fi
  local n
  for n in $nums; do
    create_mirror "$n" || true
    echo
  done
}

mirror_from_branch() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ -n "$branch" && "$branch" != "HEAD" ]] || die "not on a named git branch"
  local n
  n="$(
    gh pr list --repo "$UPSTREAM_REPO" --author "$AUTHOR" --head "$branch" --state open \
      --json number --jq '.[0].number // empty'
  )"
  [[ -n "$n" ]] || die "no open upstream PR for branch '${branch}' by @${AUTHOR} on ${UPSTREAM_REPO}"
  create_mirror "$n"
}

usage() {
  cat <<'USAGE'
mirror-upstream-pr.sh <upstream-pr-number>
mirror-upstream-pr.sh --from-branch
mirror-upstream-pr.sh --all-open
mirror-upstream-pr.sh --list

Env: UPSTREAM_REPO FORK_REPO FORK_BASE AUTHOR
USAGE
}

main() {
  case "${1:-}" in
    "" | -h | --help)
      usage
      exit 0
      ;;
    --list)
      list_status
      ;;
    --all-open)
      mirror_all_open
      ;;
    --from-branch)
      mirror_from_branch
      ;;
    *)
      [[ "$1" =~ ^[0-9]+$ ]] || die "expected PR number, got: $1"
      create_mirror "$1"
      ;;
  esac
}

main "$@"
