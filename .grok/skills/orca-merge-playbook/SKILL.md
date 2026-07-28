---
name: orca-merge-playbook
description: >
  Merge-rate north star for stablyai/orca contributions (innocarpe fork): every
  fix/PR/review follow-up must be a focused fix, preserve product/security
  intent, and include regression coverage. Use when implementing issues, opening
  or revising PRs, addressing CodeRabbit/human review, babysitting open PRs,
  scouting free issues, or when the user mentions merge rate, 머지, focused fix,
  regression test, PR quality, or merge playbook.
---

# Orca merge playbook (merge-rate north star)

**Goal:** raise **merged / submitted**, not open PR volume.  
Live SSOT counts + history: `$ORCA_PRIMARY/notes/orca-contribution/PORTFOLIO.md`  
Default `ORCA_PRIMARY=$HOME/Projects/OpenSources/orca`.

This skill is **binding** for Claude Code, Codex CLI, and Grok Build on this fork.

## Maintainer signal (source of truth)

@brennanb2025 on [stablyai/orca#10474](https://github.com/stablyai/orca/pull/10474#issuecomment-5099367516):

> Thanks for the **focused fix** — the bounded skew tolerance **preserves** the
> signed challenge window, and the **regression coverage** gives us good
> confidence. Merged!

Three words → three gates. Fail any gate → **do not open/expand the PR**; split or skip.

---

## Gate checklist (every change)

Copy into the agent’s working notes before coding and again before `gh pr create` / push.

### 1. Focused fix

| Ask | Pass |
|-----|------|
| Can the change be named in one verb + one object? | e.g. “tolerate host-proof clock skew” |
| One issue / one behavior / one layer? | Yes |
| Any “while here” refactors, drive-bys, extra features? | **Must be No** |
| Diff stays reviewable in one sitting? | Prefer small, single-domain |

**Fail →** split PR, drop drive-bys, or decline scope.

### 2. Preserves intent

| Ask | Pass |
|-----|------|
| What **must not** change (security, API, UX contract)? | One explicit sentence |
| If relaxing a check (timeouts, skew, fallbacks), is the bound **closed**? | e.g. ±30s, not unbounded |
| PR description states preservation? | Required line: “Preserves: …” |

**Fail →** redesign so invariants hold; do not ship open-ended relaxations.

### 3. Regression coverage

| Ask | Pass |
|-----|------|
| At least one test that fails without the fix? | Required for bugfixes |
| Boundary / negative case covered? | Prefer yes (skew edge, last sibling, etc.) |
| Happy-path-only tests? | **Not enough** |

**Fail →** add/extend vitest (or documented manual-only only if untestable—and say why).

---

## When this skill applies

| Moment | Action |
|--------|--------|
| Free-issue scout | Prefer candidates that can pass all 3 gates in one PR |
| Implementation | Scope lock before first commit; refuse scope creep mid-PR |
| CodeRabbit / human review | Address thread **in scope**; no drive-by “improvements” |
| Conflict rebase | Preserve focused intent; do not absorb unrelated main changes into the story |
| PR body | Template below |
| Session prioritization | Babysit mergeable narrow PRs before opening more volume |

---

## PR body minimum (merge-oriented)

```markdown
## Description
<one user-facing sentence>
<one technical sentence>

## Focused fix
- In scope: …
- Out of scope (explicit): …

## Preserves
- …

## Evidence
- Test: `pnpm exec vitest run --config config/vitest.config.ts <path>`
- Before/after or repro: …

## User-regression-tradeoffs
- …

Fixes #<N>
```

---

## Anti-patterns (lower merge probability)

- Multi-feature “cleanup” PRs or large agent/UI rewrites without issue split
- Speculative infra (unproven pacing, broad kill paths) without repro + tests
- CR “heavy lift” stuffed into an unrelated focused PR
- Opening more free issues while ~80+ PRs wait with zero merge pressure relief
- Sync-update spam comments; prefer one clear human comment when needed

---

## Interaction with other harness pieces

| Piece | Role |
|-------|------|
| `orca-contribution` | Full loop; **must load this playbook** at session start |
| `orca-free-issue` | Scout filter = 3 gates |
| `oss-pr-mirror` | Dual PR; body still must include Focused / Preserves / Evidence |
| `PORTFOLIO.md` | Counts, merged list, playbook mirror for humans |
| root `AGENTS.md` | Product rules (still apply) |

---

## Agent self-check before claiming “done”

- [ ] Focused: no unrelated files in diff for “nice to have”
- [ ] Preserves: stated in PR or review reply
- [ ] Regression: test path green (or explicit untestable reason)
- [ ] Dual PR / SSOT updated if this is a contribution session
- [ ] Did **not** prioritize open-count over mergeability
