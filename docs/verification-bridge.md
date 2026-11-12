# BRIDGE and Thought Map verification — 12 November 2026

## Verified story

An opted-in daily learner starts a new speaking session, sees its six BRIDGE criteria, submits their own answer, receives one priority feedback card and a source-grounded map, inspects explicit/inferred/missing nodes, revisits the persisted attempt and compares a linked revision. Invalid output retains the same answer and awards no reward; valid recovery awards the day's 15 speaking XP once.

Classic/historical sessions retain their original rubric. Local coaching supplies no scores or extracted graph; its separate labelled sample is never persisted as learner evidence or awarded progress.

## Final checks

| Check | Result | Scope |
| --- | --- | --- |
| `npm run test:api` | **246 passed, 3 skipped** | 249 domain/API/transport tests. The three opt-in live cloud tests remain skipped; no local tests were disabled. |
| `npm run test:e2e -- --reporter=list,json` | **30 passed, 0 failed/flaky/skipped** | Freshly rebuilt Expo web export, real Express and isolated SQLite. Includes existing practice, audio, account, news, garden and friend-debate regressions plus the new local BRIDGE/sample journey. |
| `npm run test:e2e:ai` | **12 passed** | Offline provider transport with real browser/API/database, including invalid graph → same-answer recovery → exact 15 XP → saved map → linked revision. No paid model requests. |
| `npm run typecheck` | **Passed** | Current TypeScript sources and tests. |
| `npm run lint` | **Passed** | Current source lint checks. |
| Visual review | **Inspected** | Mobile sample/outline and desktop graph screenshots, including exact-source selection and distinct labels for inferred/missing content. |

## Boundary evidence

- **Task → rubric:** curated server prompt metadata selects applicable dimensions. Unit tests confirm stories can omit Reasons/Illustrations/Perspectives, D is forced to N/A when unelicited, and insufficient evidence remains distinct from level 1. New daily sessions persist `assessmentFramework`; historical rubric preservation is verified through the API.
- **Provider → schema:** strict six-dimension output, explicit status/score consistency, bounded text and graph size, no unknown provenance/reward fields. Refusals, truncations, missing completion and invalid JSON remain saved-work failures without automatic paid retries.
- **Answer → evidence:** exact Unicode/UTF-16 quotations and graph spans are checked against the authentic saved text. Assessed criteria and primary judged feedback need evidence. Inferred nodes cannot have quotations or spans; missing nodes have null text and no quotation.
- **Graph → validity:** duplicate IDs, self/duplicate edges, unknown endpoints, cycles, explicit paraphrases and unsupported graphs fail before persistence/reward commit. A bounded DAG layout places nodes without overlap; a corrupt cyclic graph cannot hang the renderer.
- **Failure → recovery:** an API/browser fixture deliberately returns a broken reference. The response remains saved, feedback is absent and XP stays unchanged. Explicit retry recovers the same attempt/job, persists its checked graph and awards 15 XP once. Reload, repeat polling and revisiting the attempt do not make new provider calls or rewards.
- **Map → interaction:** mobile defaults to a complete text outline. Explicit node selection highlights the corresponding source text; inferred/missing selection displays a proposed interpretation/question without an invented learner quotation. Map buttons, keyboard selection, zoom and scroll-to-pan are exercised.
- **Revision → history:** both saved texts and both available maps remain inspectable. No ability gain or mastery is inferred from score changes. Private recording playback and concern reporting remain available in the BRIDGE feedback flow.
- **Privacy → persistence:** map retrieval is owner-scoped and never invokes generation. API tests check cross-account rejection, restart persistence, export and account deletion. New fields use existing attempt JSON, so no additional database migration is required for BRIDGE itself.
- **Local → honesty:** keyword-heavy input never becomes a semantic rating or extracted argument. Browser tests verify the labelled sample does not change the actual evaluation or XP.

## Corrections made during verification

The first new provider-browser test reloaded the new-practice URL instead of revisiting its saved-attempt URL. It now opens the actual persisted attempt before checking restoration and revision. A missing accessible heading on the earlier-map section was added. The provider suite was then rerun against a freshly rebuilt export; its final run passed all 12 cases. No assertions were removed, retries enabled, or tests skipped to obtain a passing result.

The graph was visually refined to centre shorter layout columns and separate relation labels. Its mobile-compatible Views/SVG layout deliberately replaces the web-only React Flow suggestion; see the [implementation contract and platform decision](bridge-assessment.md).

After the full regression, the local BRIDGE browser scenario was extended to submit a real synthetic concern through the new report control and verify its saved/disabled state. That supplementary scenario passed against the same exported application. Its first launch found the test server had already shut down; rerunning with a fresh isolated server passed. The final layout/domain/API checks (26 BRIDGE tests), lint and typecheck were also rerun. The application logic was unchanged by that test-only extension.

## Review artifacts

- [Configured map — desktop](screenshots/bridge/configured-map-desktop.png)
- [Configured outline — mobile](screenshots/bridge/configured-outline-mobile.png)
- [Clearly labelled sample — desktop](screenshots/daily-workout/bridge-sample-map-desktop.png)
- [Clearly labelled sample — mobile](screenshots/daily-workout/bridge-sample-map-mobile.png)

## Limits and remaining goal

These tests establish local software and transport behaviour, not semantic accuracy, scientific validity, actual learning gains, real-provider access or production readiness. Provider outputs/ratings and recorded audio in browser tests are synthetic fixtures. BRIDGE requires independent human calibration before claims of reliable measurement or mastery. Actual iOS/Android audio, gestures and screen-reader behaviour still need device testing.

WordBloom, an acoustic speech provider, adaptive skill observations and independently supported mastery remain unfinished. The full optional-mode BRIDGE rollout, core-default rollout, live cloud migration/verification and the broader master-build roadmap remain open. No goal completion, deployment or production-data change is claimed.
