#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CREATE="$SKILL_DIR/scripts/create-upstream-pr.sh"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$TEST_ROOT/fake-bin"
printf '%s\n' 'English body' >"$TEST_ROOT/body.md"
: >"$TEST_ROOT/gh.log"

cat >"$TEST_ROOT/fake-bin/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"${FAKE_GH_LOG:?}"

if [[ "$1" == "pr" && "$2" == "list" ]]; then
  if [[ "${FAKE_EXISTING:-0}" == "1" ]]; then
    printf '%s\n' '{"number":12978,"url":"https://github.com/stablyai/orca/pull/12978","headRefName":"fix/test"}'
  fi
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "create" ]]; then
  printf '%s\n' 'https://github.com/stablyai/orca/pull/9001'
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "view" ]]; then
  printf '%s\n' '{"number":9001,"url":"https://github.com/stablyai/orca/pull/9001","labels":[{"name":"bug"}]}'
  exit 0
fi

echo "unexpected gh invocation: $*" >&2
exit 1
FAKE_GH
chmod +x "$TEST_ROOT/fake-bin/gh"

cat >"$TEST_ROOT/fake-bin/gh-public-english-gate" <<'FAKE_GATE'
#!/usr/bin/env bash
case "${1:-}" in
  --check-text | --body-file) exit 0 ;;
  *) echo "unexpected English-gate invocation: $*" >&2; exit 1 ;;
esac
FAKE_GATE
chmod +x "$TEST_ROOT/fake-bin/gh-public-english-gate"

run_create() {
  PATH="$TEST_ROOT/fake-bin:$PATH" \
    GH_PUBLIC_ENGLISH_GATE="$TEST_ROOT/fake-bin/gh-public-english-gate" \
    FAKE_GH_LOG="$TEST_ROOT/gh.log" \
    FAKE_EXISTING="${FAKE_EXISTING:-0}" \
    bash "$CREATE" \
      --repo stablyai/orca \
      --base main \
      --head innocarpe:fix/test \
      --title "fix: test" \
      --body-file "$TEST_ROOT/body.md" \
      "$@"
}

if output="$(run_create --label bug 2>&1)"; then
  echo "expected upstream label argument to be rejected" >&2
  exit 1
fi
grep -F "upstream PRs are intentionally unlabeled" <<<"$output" >/dev/null
if [[ -s "$TEST_ROOT/gh.log" ]]; then
  echo "upstream label rejection invoked GitHub" >&2
  exit 1
fi

output="$(run_create 2>&1)"
grep -F 'https://github.com/stablyai/orca/pull/9001' <<<"$output" >/dev/null
grep -F -- 'pr create' "$TEST_ROOT/gh.log" >/dev/null
if grep -F -- '--label' "$TEST_ROOT/gh.log" >/dev/null; then
  echo "upstream PR creation attempted a label mutation" >&2
  exit 1
fi

create_count="$(grep -Fc 'pr create' "$TEST_ROOT/gh.log")"
if output="$(FAKE_EXISTING=1 run_create 2>&1)"; then
  echo "expected existing upstream PR to block duplicate creation" >&2
  exit 1
fi
grep -F "open upstream PR already exists" <<<"$output" >/dev/null
test "$(grep -Fc 'pr create' "$TEST_ROOT/gh.log")" = "$create_count"
if grep -F "pr edit" "$TEST_ROOT/gh.log" >/dev/null; then
  echo "existing PR gate attempted label mutation" >&2
  exit 1
fi

echo "upstream-pr-label-gate: ok"
