# Localization Audit

This is the pre-work artifact for migrating Orca to a localized UI. The goal is
to make coverage repeatable: every detected user-facing string is either moved
behind the localization layer or explicitly excluded with a reason.

## Coverage Contract

Coverage means all strings matching the audit scope below are accounted for:

- JSX text rendered in the renderer.
- Accessibility and form attributes such as `aria-label`, `ariaLabel`, `alt`,
  `placeholder`, `title`, `label`, `description`, `subtitle`, and `tooltip`.
- User-facing object metadata such as Settings search `title`, `description`,
  `keywords`, labels, badges, helper text, and tooltips.
- User-facing calls such as `toast.success(...)`, `toast.error(...)`, browser
  `alert(...)`, `confirm(...)`, and `prompt(...)`.

The audit intentionally does not treat these as localization misses unless they
are surfaced directly as UI copy:

- Terminal output, agent output, git output, provider API errors, and shell
  commands.
- File paths, URLs, environment variables, telemetry event names, IDs, and
  protocol names.
- Developer logs, internal diagnostics, test fixtures, and snapshots.
- Brand, provider, model, command, and product names that should remain exact.

## Inventory Command

Generate a machine-readable inventory:

```sh
node config/scripts/audit-localization-coverage.mjs --json --output tmp/localization-candidates.json
```

Generate a reviewable Markdown inventory:

```sh
node config/scripts/audit-localization-coverage.mjs --markdown --output tmp/localization-candidates.md
```

Run the maintained coverage gate:

```sh
pnpm run verify:localization-coverage
```

Sync catalog keys after adding or removing `translate(...)` calls:

```sh
pnpm run sync:localization-catalog
pnpm run sync:localization-extraction
```

The sync command adds missing `en.json` entries from each call's string fallback.
It never edits target catalogs: missing values remain absent for runtime English
fallback, while placeholder mismatches fail until a localization PR fixes or
retires the target value. The legacy free-endpoint bootstrap and whole-catalog
repair scripts intentionally have no package-script entry points.

The extraction sync updates only the committed generated English template. For
an added call it adds the extracted key; for changed fallback copy it records a
fallback difference; and for a removed call it records an orphan. Existing
dispositions are preserved exactly. New differences are written as
`pending-human-classification` and deliberately keep the gate red until a
localization owner replaces each one with a supported disposition and a
key-specific reason. Neither sync command edits a target-language catalog.
When an orphan/drift resolves, manually remove its obsolete disposition; when an
allowlisted candidate count changes, manually update the reviewed count or
remove the entry if the candidate is gone. Snapshot commands preserve those
manual records intentionally and will not erase or silently refresh them.

To mark a translation reviewed in the same localization PR, set its sidecar
state to `reviewed` and add an exact-value entry to
`config/localization-reviewed-corrections.json` with reason
`localization-pr-review` and review evidence `{ provider, changeId, reviewer }`.
The verifier accepts GitHub, GitLab, or another provider and rejects the state
if the evidence is malformed or the reviewed value differs from the catalog.

Run the translation-state and extraction gates with:

```sh
pnpm run verify:localization-catalog
pnpm run verify:localization-extraction
pnpm run verify:localization-main-process
pnpm run localization:status
```

`config/localization-state/<locale>.json` is the versioned review-state source.
`config/localization-extraction/en.json` is deterministic `i18next-cli` proof
output; existing source orphans and inline-default drift have explicit committed
dispositions and any new difference fails CI.

`src/shared/localization-keys.ts` is a Phase 2 extraction/tooling evaluation
artifact. Runtime translation wrappers do not consume it yet; runtime key
typing remains a separately reviewed follow-up rather than an implied gate in
this migration.

The coverage gate compares current candidates against
`config/localization-coverage-allowlist.json`. The committed allowlist is empty:
new candidates fail the check and must be localized or added with a reviewed
reason in the same change.

The script scans `src/renderer/src` by default. That is the primary UI surface.
Use `--source-root src` for a wider audit when checking renderer-adjacent shared
copy, then classify non-renderer findings carefully because many are diagnostics
or external tool text.

## Migration States

Each candidate should end in one of these states:

- `localized`: the component reads the string from the locale catalog.
- `excluded`: the string is intentionally not localized, with a reason from the
  coverage contract.
- `deferred`: the string is user-facing but belongs to a later PR wave.

`deferred` is acceptable for planning, but not for the localization coverage
gate.

## PR Waves

Recommended migration order:

1. Infrastructure, English catalog, language setting, and language selector.
2. Settings shell, Settings search metadata, and Appearance.
3. App shell, sidebars, titlebar, status bar, command surfaces, and global
   dialogs/toasts.
4. Task pages, source control, hosted review, and provider-specific UI.
5. Terminal chrome, onboarding, feature tips, mobile, browser, and remaining
   secondary surfaces.

## Proof Strategy

The final gate should combine three checks:

1. Scanner coverage: no unclassified localizable candidates remain.
2. Catalog correctness: every existing target has state and matching
   interpolation variables; completeness is reported rather than required.
3. Runtime coverage: pseudo-localization and real locale smoke tests show no
   obvious English leftovers or layout clipping in core screens.

Subagent or human review should verify ambiguous exclusions, but the scanner is
the coverage source of truth.
