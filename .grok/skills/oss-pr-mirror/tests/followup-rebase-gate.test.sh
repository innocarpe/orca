#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PREPARE="$SKILL_DIR/scripts/prepare-pr-followup.sh"
SYNC="$SKILL_DIR/scripts/sync-contribution-push.sh"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

git init --bare "$TEST_ROOT/upstream.git" >/dev/null
git init --bare "$TEST_ROOT/origin.git" >/dev/null
git init "$TEST_ROOT/seed" >/dev/null
git -C "$TEST_ROOT/seed" config user.name Test
git -C "$TEST_ROOT/seed" config user.email test@example.com
git -C "$TEST_ROOT/seed" commit --allow-empty -m "initial main" >/dev/null
git -C "$TEST_ROOT/seed" branch -M main
git -C "$TEST_ROOT/seed" remote add upstream "$TEST_ROOT/upstream.git"
git -C "$TEST_ROOT/seed" remote add origin "$TEST_ROOT/origin.git"
git -C "$TEST_ROOT/seed" push upstream main >/dev/null
git -C "$TEST_ROOT/seed" push origin main >/dev/null
git --git-dir="$TEST_ROOT/upstream.git" symbolic-ref HEAD refs/heads/main
git --git-dir="$TEST_ROOT/origin.git" symbolic-ref HEAD refs/heads/main

git clone "$TEST_ROOT/origin.git" "$TEST_ROOT/work" >/dev/null
git -C "$TEST_ROOT/work" config user.name Test
git -C "$TEST_ROOT/work" config user.email test@example.com
git -C "$TEST_ROOT/work" remote add upstream "$TEST_ROOT/upstream.git"
git -C "$TEST_ROOT/work" checkout -b fix/test >/dev/null
git -C "$TEST_ROOT/work" commit --allow-empty -m "fix: seed contribution" >/dev/null
git -C "$TEST_ROOT/work" push -u origin fix/test >/dev/null

git -C "$TEST_ROOT/seed" commit --allow-empty -m "upstream advance" >/dev/null
git -C "$TEST_ROOT/seed" push upstream main >/dev/null
git -C "$TEST_ROOT/work" fetch upstream main >/dev/null
git -C "$TEST_ROOT/work" merge --no-ff upstream/main -m "Merge upstream/main into fix/test" >/dev/null

(
  cd "$TEST_ROOT/work"
  REMOTE=origin UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main bash "$PREPARE" >/dev/null
  git merge-base --is-ancestor upstream/main HEAD
  test -z "$(git rev-list --merges upstream/main..HEAD)"
  test -f "$(git rev-parse --git-path orca-pr-followup-state)"
  git commit --allow-empty -m "fix: address review" >/dev/null
)

mkdir -p "$TEST_ROOT/fake-bin"
# These literals become the generated fake-gh script.
# shellcheck disable=SC2016
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  'if [[ "$1" == "pr" && "$2" == "list" ]]; then' \
  '  if [[ " $* " == *" stablyai/orca "* ]]; then' \
  '    printf '\''{"number":1,"url":"https://example.test/upstream/1","headRefOid":"%s","title":"test"}\n'\'' "$(git rev-parse HEAD)"' \
  '  else' \
  '    printf '\''{"number":2,"url":"https://example.test/fork/2","headRefOid":"%s","title":"test"}\n'\'' "$(git rev-parse HEAD)"' \
  '  fi' \
  '  exit 0' \
  'fi' \
  'echo "unexpected gh invocation: $*" >&2' \
  'exit 1' >"$TEST_ROOT/fake-bin/gh"
chmod +x "$TEST_ROOT/fake-bin/gh"

(
  cd "$TEST_ROOT/work"
  PATH="$TEST_ROOT/fake-bin:$PATH" AUTHOR=innocarpe \
    UPSTREAM_REPO=stablyai/orca FORK_REPO=innocarpe/orca \
    REMOTE=origin UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main \
    bash "$SYNC" --no-ensure-mirror >/dev/null
  test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/fix/test | awk 'NR == 1 { print $1 }')"
  test ! -f "$(git rev-parse --git-path orca-pr-followup-state)"
)

(
  cd "$TEST_ROOT/work"
  REMOTE=origin UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main bash "$PREPARE" >/dev/null
  git commit --allow-empty -m "fix: local concurrent follow-up" >/dev/null
)
git clone --branch fix/test "$TEST_ROOT/origin.git" "$TEST_ROOT/racer" >/dev/null
git -C "$TEST_ROOT/racer" config user.name Test
git -C "$TEST_ROOT/racer" config user.email test@example.com
git -C "$TEST_ROOT/racer" commit --allow-empty -m "fix: concurrent remote follow-up" >/dev/null
git -C "$TEST_ROOT/racer" push origin fix/test >/dev/null

if (
  cd "$TEST_ROOT/work"
  PATH="$TEST_ROOT/fake-bin:$PATH" AUTHOR=innocarpe \
    UPSTREAM_REPO=stablyai/orca FORK_REPO=innocarpe/orca \
    REMOTE=origin UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main \
    bash "$SYNC" --no-ensure-mirror >/dev/null 2>&1
); then
  echo "expected concurrent remote update to block sync" >&2
  exit 1
fi

git -C "$TEST_ROOT/work" fetch origin >/dev/null
git -C "$TEST_ROOT/work" reset --hard origin/fix/test >/dev/null
(
  cd "$TEST_ROOT/work"
  rm -f "$(git rev-parse --git-path orca-pr-followup-state)"
)

git -C "$TEST_ROOT/seed" commit --allow-empty -m "upstream advances again" >/dev/null
git -C "$TEST_ROOT/seed" push upstream main >/dev/null
git -C "$TEST_ROOT/work" commit --allow-empty -m "fix: stale follow-up" >/dev/null

if (
  cd "$TEST_ROOT/work"
  PATH="$TEST_ROOT/fake-bin:$PATH" AUTHOR=innocarpe \
    UPSTREAM_REPO=stablyai/orca FORK_REPO=innocarpe/orca \
    REMOTE=origin UPSTREAM_REMOTE=upstream UPSTREAM_BRANCH=main \
    bash "$SYNC" --no-ensure-mirror >/dev/null 2>&1
); then
  echo "expected stale follow-up sync to fail" >&2
  exit 1
fi

echo "followup-rebase-gate: ok"
