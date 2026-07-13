# Localization policy migration disposition

Phase 1 bootstraps translation state without deleting the legacy policy files.
They remain available for Phase 3 equivalence review, but their package-script
entry points are removed so they cannot overwrite reviewed catalogs accidentally.

| Legacy policy source                                                    | Phase 1 representation                                 | Status                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Exact key overrides                                                     | `reviewed` state for the matching locale/key           | Imported; legacy rule retained for audit                |
| Exact English-value overrides                                           | `reviewed` state for every matching identifier         | Imported; legacy rule retained for audit                |
| Search-keyword overrides                                                | `reviewed` state for matching search identifiers       | Imported; legacy rule retained for audit                |
| Native language-picker labels and reviewed main-menu literals           | `reviewed` state                                       | Imported                                                |
| Reviewed follow-up PRs #7422, #8040, and #8219                          | Enumerated in `localization-reviewed-corrections.json` | Imported with commit provenance                         |
| English-only prefixes, do-not-translate literals, URL/protocol literals | Sidecar-only `intentional-english`                     | Duplicate catalog leaves removed                        |
| Byte-equal English without reviewed/preservation provenance             | Derived `untranslated`                                 | Parity filler removed                                   |
| Broad phrase, brand, and spacing rewrites                               | `machine` unless stronger evidence applies             | Not treated as review evidence; rules retained          |
| Free-endpoint bootstrap and whole-catalog repair                        | No normal package-script entry point                   | Retained only for Phase 3 disposition/equivalence audit |

No automatic suggestion service is enabled in Phases 1–2, so terminology policy
remains committed in the legacy data modules until the Phase 3 workflow imports
it. Existing target values that remain in catalogs are byte-for-byte unchanged;
Git history is the rollback artifact for the removed filler/intentional-English
leaves while the runtime catalog format and offline loading paths remain intact.
