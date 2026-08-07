#!/usr/bin/env bash
# Create an upstream contribution PR without attempting upstream label changes.
#
# Contributor tokens can create review PRs on stablyai/orca but cannot mutate
# its labels. This script intentionally rejects --label and never calls a label
# endpoint. Apply the kind label to the fork portfolio PR instead.

set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-stablyai/orca}"
BASE_REF="main"
HEAD_REF=""
TITLE=""
BODY_FILE=""

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

usage() {
  cat <<'USAGE'
create-upstream-pr.sh --head <owner:branch> --title <title> --body-file <path>

Options:
  --repo <owner/repo>   upstream review repository (default: stablyai/orca)
  --base <branch>       base branch (default: main)
  --head <owner:branch> fork owner and branch to review
  --title <title>       English pull request title
  Upstream PRs are intentionally unlabeled; pass --label only to the fork
  mirror script.
  --body-file <path>    English pull request body
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      UPSTREAM_REPO="${2:-}"
      shift 2
      ;;
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --head)
      HEAD_REF="${2:-}"
      shift 2
      ;;
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --label)
      die "upstream PRs are intentionally unlabeled; apply --label to mirror-upstream-pr.sh for the fork PR"
      ;;
    --body-file)
      BODY_FILE="${2:-}"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

need gh
need jq

[[ -n "$UPSTREAM_REPO" ]] || die "--repo requires owner/repo"
[[ "$BASE_REF" =~ ^[A-Za-z0-9._/-]+$ ]] || die "invalid --base branch"
[[ "$HEAD_REF" == *:* ]] || die "--head must use owner:branch syntax"
[[ -n "${HEAD_REF#*:}" ]] || die "--head requires a branch after owner:"
[[ -n "$TITLE" ]] || die "--title is required"
[[ -f "$BODY_FILE" ]] || die "--body-file not found: $BODY_FILE"

ENGLISH_GATE="${GH_PUBLIC_ENGLISH_GATE:-$(command -v gh-public-english-gate || true)}"
[[ -x "$ENGLISH_GATE" ]] || die "missing English public-text gate; set GH_PUBLIC_ENGLISH_GATE"
"$ENGLISH_GATE" --check-text "$TITLE"
"$ENGLISH_GATE" --body-file "$BODY_FILE"

head_branch="${HEAD_REF#*:}"
existing="$(gh pr list --repo "$UPSTREAM_REPO" --head "$head_branch" --state open \
  --json number,url,headRefName --jq '.[0] // empty')"
if [[ -n "$existing" ]]; then
  existing_number="$(jq -r '.number' <<<"$existing")"
  existing_url="$(jq -r '.url' <<<"$existing")"
  die "open upstream PR already exists for ${HEAD_REF}: #${existing_number} ${existing_url}; use the follow-up harness"
fi

create_args=(
  pr create
  --repo "$UPSTREAM_REPO"
  --base "$BASE_REF"
  --head "$HEAD_REF"
  --title "$TITLE"
  --body-file "$BODY_FILE"
)

pr_url="$(gh "${create_args[@]}")" || \
  die "upstream PR creation command failed; the harness will not retry or repair labels"

upstream_meta="$(gh pr view "$pr_url" --repo "$UPSTREAM_REPO" --json number,url,labels)" || \
  die "created upstream PR but could not verify it: ${pr_url}"
jq -e '.labels | type == "array"' <<<"$upstream_meta" >/dev/null || \
  die "created upstream PR returned invalid label metadata: ${pr_url}"

echo "$pr_url"
