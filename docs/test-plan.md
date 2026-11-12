# End-to-end verification plan

The release slice is: a new user onboards, completes Spin & Speak, Debate Garden, and Read & Reflect, receives transparent feedback, grows a plant, and sees saved practice in Profile. The selected deployment is a local Node/SQLite backend with optional server-side AI credentials.

## Automated gates

Run the repository's backend test command, Expo lint, TypeScript checking, and Playwright browser tests after implementation. Record actual commands and results in the implementation handoff; this document is a plan and must not be read as proof that any test passed.

| Area | Evidence required |
| --- | --- |
| Onboarding | Guest and account routes; 2–5 interests; selected goal; initial seed and empty plot; no microphone permission on page load. |
| Server-selected practice | Displayed question equals the persisted server selection; 15-second preparation can be skipped. |
| Spin & Speak | Typed response submits, evidence quotes match it exactly, linked retry is saved independently, feedback identifies local/model provider and limits. |
| Debate | Side selection, 2–3 rounds, respectful relevant challenges, final feedback, retry or opposite-side option; refresh preserves saved turns. |
| Read & Reflect | Filterable curated cards show publisher/date/source link; summary and questions have distinct labels; reflection evaluates and can be journaled once. |
| Garden | Plant an empty plot; water through growth stages and mature care; 24-hour warning and 48-hour expiry; living-plant archive/restore pauses care; dead plants clear or replant; insufficient resources fail safely; decoration is cosmetic. |
| Rewards | Network duplicates cannot double award; daily cap and content replay rules work independently of evaluation score; retry reward is bounded. |
| Profile | Attempts, details, corrected text, evidence, retry relation, journals, achievements; modes are separate; insufficient comparable data is explicit. |
| Persistence | Reload and re-authenticate preserve account garden and history; a fresh browser context can sign into the same backend account. |
| Isolation | A second account cannot read another user's attempts, sessions, media, journal, jobs, export, or garden through guessed identifiers. |
| Failure | Offline/failed calls show actionable errors; local drafts survive reload; saved submissions survive evaluation failures; retry does not duplicate turns/rewards. |
| Account controls | Guest can upgrade; export includes owned data; account deletion clears personal records and media, invalidates tokens, and returns to welcome. |
| Provider boundary | No credentials are required in local mode; configured model request is server-side; malformed schemas/quotes fail; no secret enters the client build. |
| Content | All six sources are verified; stable publication dates, attribution, direct links, original summaries, and content hashes are retained. |

## Assessment verification

Check that the shared mode-specific criteria appear before practice and in expanded feedback; new local feedback contains no numerical ratings; model feedback is visibly provisional. Exact answer quotes must survive schema validation; supplied summaries and real role-labelled opponent turns must reach the mocked provider. Missing sources or response opportunities force relevant N/A outcomes. Text delivery stays N/A, metadata is assigned by the server, and newly unvalidated ratings never enter comparisons or charts. Preserve legacy saved results and version-isolated historical display.

`tests/assessment.test.mjs` and offline provider fixtures verify scoring contracts. `tests/assessment-benchmark.test.mjs` verifies metric mathematics and invalid input handling. Neither produces a validated model. Use the [benchmark guide](assessment-benchmark.md) with independent human ratings for the separate empirical study.

## Garden lifecycle browser fixtures

`tests/garden-lifecycle.spec.ts` covers real planting, mature watering, archive/restore, dead-drawing recovery and the zero-water practice action. It checks persisted state, a preview of the actual garden on desktop and mobile, and horizontal overflow. A controlled browser clock verifies that the open Garden screen changes from thirsty to dead without a reload. A failed post-mutation refresh must retain the saved result, then yield to a later successful foreground refresh showing another device's care. API writes still use the real server clock.

The expiry and resource setup edits only each test's newly created guest in an isolated SQLite database. This suite requires the loopback test server on port 3002 and an existing `data/e2e.sqlite`; set `E2E_DATABASE_PATH` to the same isolated `e2e*.sqlite` file used by that server if using another test database. The helper refuses other filenames, remote hosts, and users without its test-only display-name prefix. It never opens the member's application database. These fixtures do not establish 48 hours of real-world device behavior; backend deadline and migration tests cover the deterministic timing rules separately.

## Audio checks

Browser coverage can use a fake microphone to test permission-triggered recording, a 60-second limit, pause/resume, restart, cancel, playback, manual transcript correction, and evaluation. The local coach must clearly explain that transcription needs configured server credentials and allow manual transcription. Transcription failures must retain the recording and allow retry.

Native device verification is separate from web testing. On iOS and Android, verify actual microphone permissions (deny and allow), audio playback, backgrounding behavior, interrupted sessions, keyboard avoidance, safe areas, and files uploaded with the device's real MIME type. A browser test does not prove these native behaviors.

## Accessibility and responsive review

Inspect 390×844 mobile and 1440×1000 desktop screenshots. Check legible contrast, no clipped headings or horizontal overflow, touch targets of about 44 points, visible errors/loading states, labelled controls, navigation order, reduced motion, timer text, and keyboard access to complete the learning loop. Run with reduced motion to confirm animation is not required to understand prompt selection or garden growth.

## Scientific and production limits

The prototype rubric has not completed a human-rating study. No test here demonstrates psychometric validity, accent fairness, factual verification beyond supplied context, or long-term skill improvement. An external model cannot be tested end to end without configured credentials. A production service also needs hosting/TLS, operational monitoring, backup and restore procedures, appropriate retention and consent review, provider cost controls, and a real-user pilot. Keep these limits distinct from passing local software tests.
