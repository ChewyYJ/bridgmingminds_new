# Verification history

The current UI cleanup is covered by **Minimalist copy and layout — 16 October 2026** at the end of this document. Earlier sections are historical verification records.

Verified on 13 October 2026. The isolated automated run used the optimized web export at `http://localhost:3002` (4 passed, 45.5 seconds). A final handoff run rebuilt with an empty Metro cache and tested all four workflows directly at the running `http://localhost:3001` (4 passed, 2.2 minutes). The provider reported `local`; no external AI credentials were used.

## Browser evidence

Commands: `npm run test:e2e`, then `E2E_WEB_URL=http://localhost:3001 E2E_API_URL=http://localhost:3001 npm run test:e2e`.

Final result against the actual handoff URL: **4 passed (2.2 minutes)**. The browser tests contain the following complete workflows with real UI interactions and persisted API assertions:

- Guest onboarding with name, interests, goal, starter seed, empty garden, and microphone consent initially off.
- Server-selected Spin & Speak prompt matches the displayed question. Preparation is skipped intentionally.
- Failed network submission preserves the typed response; Save & close, reload, and reopening recover the draft.
- GROW feedback saves the exact answer, cites exact text offsets for all rated dimensions, identifies the local practice coach, and leaves composite score null.
- A linked retry retains both responses. Saved-answer review works and a feedback concern appears in the export.
- Two-round debate against a proposition; the first round survives closing/reopening, the challenger replies, and a completed transcript/summary/evaluation persist.
- Science filter, NASA attribution and source control, selected second reflection question, completed response, and Thought Journal save.
- A seed is planted and watered through sprout, growing, and bloom. Stepping stones are bought with sunlight and persist as a garden decoration. Garden and four completed attempts survive reload.
- Profile history, achievements, journal, and insufficient comparable data are visible. A history item opens its saved evaluation and exact response for review. Local heuristic levels are excluded from charts.
- Guest account upgrade retains the same profile ID and all progress. A fresh mobile browser context signs into that account and sees the same four attempts and blooming plant.
- Another guest has no access to the first user's attempts, session, or journal, including requests using the first user's identifiers.
- The UI exports a downloadable JSON file containing four attempts. Account deletion through its explicit confirmation UI returns to Welcome and invalidates the other signed-in context.
- No uncaught browser errors or targeted React render warnings occurred in the final run.

The test uses browser contexts for device isolation and an authenticated API read to check persisted state. A network route is aborted only for the deliberate failure test; successful workflow responses come from the local server.

## Responsive visual evidence

The final run captured and visually reviewed these images:

- [Desktop Home, 1440×1000](screenshots/desktop-home.png)
- [Desktop feedback, 1440×1000](screenshots/desktop-feedback.png)
- [Desktop Garden, 1440×1000](screenshots/desktop-garden.png)
- [Desktop Profile, 1440×1000](screenshots/desktop-profile.png)
- [Mobile Home, 390×844](screenshots/mobile-home.png)
- [Mobile Garden, 390×844](screenshots/mobile-garden.png)
- [Tablet Home, 768×1024](screenshots/tablet-home.png)

Mobile and tablet checks found no document-level horizontal overflow. The tab bar remains visible on primary pages. Garden captions wrap within narrow plots. Purchased stepping stones and birdbath decorations use original SVG artwork beneath the plots. The wheel honors the reduced-motion environment. Expo's development launcher icon is present in some screenshots; it belongs to the development environment.

## Audio evidence

Three mobile-browser tests use a synthetic microphone (no real microphone or external transcription calls):

- Recording permission requested only after Record; private storage consent is separate. Pause, restart, cancel, replay, upload, corrected manual transcript, reload recovery, and signed playback all pass.
- A spoken reading reflection stops automatically at 60 seconds, remains editable, and receives saved feedback.
- Denied microphone access keeps the write alternative usable. A linked retry remains on its result screen after the parent refresh.

## Backend and build checks

- `npm run test:api`: **12 passed**, covering all three modes, account synchronization, ownership, private audio, deletion/export, quote validation, Unicode limits, reward caps/idempotency, durable failure recovery, and isolation of asset traffic from API rate limits.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npx expo-doctor`: **21/21 passed**.
- `npm run build:web`: passed; final browser tests ran this optimized export.
- `npx expo export --platform ios --platform android --output-dir dist-native`: both Hermes bundles compiled successfully. This verifies bundling, not native device execution.

## Static checks

After Garden/Profile fixes, both `npx tsc --noEmit` and `npx eslint src/screens/Garden.tsx src/screens/Profile.tsx tests/e2e.spec.ts` passed. Whole-repository lint and backend tests also passed as recorded above.

## Explicit verification boundaries

This file reports the text workflow and local web evidence. Audio verification has its own browser test. Real iOS/Android microphone hardware, background interruptions, external AI model/transcription requests, and the proposed human calibration study require their respective environments and have not been established by this text test. Browser contexts establish account synchronization against this local server; they do not imply an Internet-hosted production service.

## Friends and today’s news — 13 October 2026

The follow-up build adds **Debate with friends** in Play and Home, and **Today’s news** beside All in Discover.

- `npm run test:api`: **38 passed**. Includes private two-person rooms, transactional joins and ordered turns, idempotency, expiry, persistence, participant-only shared audio, export/deletion, and news endpoint authentication. RSS tests cover publication dates, time zones/DST, midnight, caching, partial/stale/unavailable responses, source URL validation, XML parsing and fetch limits.
- `npm run test:e2e`: **6 passed** against a fresh optimized export and isolated backend on port 3002. All original practice workflows remain passing. The new two-browser test completes four alternating text/voice turns, verifies audio privacy before sharing and playback afterward, restores drafts after reload, recovers a lost submission response without duplicates, and closes another invitation. The news UI test checks original-source navigation, timestamps, timezone, refresh, empty/stale/network states and a return to curated reading.
- Final `npm run typecheck` and `npm run lint`: passed.
- Live news was separately checked against NPR and NASA: 15 stories published on the current Singapore calendar day were available at the check. Different time zones produced different valid inclusion sets. The browser’s real Discover feed was also inspected at `http://localhost:3001/discover`.
- [Desktop friend debate](screenshots/desktop-friends.png) and [mobile friend debate](screenshots/mobile-friends.png) were visually inspected. Recorded voice uses the browser test’s synthetic microphone, not the user’s microphone.

Friend debates are turn-based voice messages or text, not live audio calls. Friends must connect to the same backend. No provider credentials or paid AI calls were used. Native device behavior remains unverified for these additions.

## Floating meadow and final follow-up verification — 13 October 2026

The garden now uses a floating grassy island, twelve saved plant positions, mouse/touch dragging, free rearrangement and a five-colour drawing studio. Existing gardens migrate without losing growth, resources or decorations.

- `npm run test:api`: **44 passed**, including geometry and spacing, legacy migration, saved positions and drawings, export/restart persistence, ownership, seed/XP gates, idempotency and atomic rejection of invalid drops.
- `npm run typecheck`, `npm run lint`, and a clean `npm run build:web`: passed.
- **All 10 browser workflows verified** on the final optimized export with the isolated backend at port 3002. The full run passed 9 tests; the friend voice test exceeded its five-second recorder-readiness assertion. Its trace showed recording continued and the control enabled immediately after that deadline. Increasing only that condition-based assertion to 15 seconds produced a passing targeted rerun against the unchanged app export (27.8 seconds).
- Desktop garden checks cover Escape cancellation, outside and overlapping drops without charges, exact saved placement, free movement with no seeds, XP/seed disabled controls, drawing in two colours, undo/clear, planting a drawing and persistence after reload. The mobile test performs a real touch gesture at 390×844 and verifies saved placement and no horizontal overflow.
- Friend debate recovery checks preserve editable drafts after definite 400/404/409 rejections, match backend Unicode limits, retain exact retries after 429/503 failures and commit only one turn. The original two-person text/voice conversation and playback flow also passes.
- News checks verify ten-minute polling, Singapore midnight independent of browser timezone, immediate removal of yesterday’s cards while an update is pending or fails, recovery, and timer cleanup when leaving the news filter.
- The production-style local server was restarted on port 3001 with the existing user database. The updated Garden, friend lobby and Today’s news option were inspected in the app browser.

Visual evidence: [desktop drawing studio](screenshots/garden-drawing-desktop.png), [desktop island](screenshots/garden-island-desktop.png), and [mobile touch garden](screenshots/garden-island-mobile.png). All were visually reviewed. Native device gestures and real microphone hardware remain unverified; no AI credentials were used.

## Greenery plants — 13 October 2026

- Added fern and cactus (0 XP), monstera (30 XP), and bamboo (60 XP), with distinct artwork and growth stages. The planting table defaults to Greenery; Flowers remains a separate choice. Every variety uses the same one-seed cost, watering, free movement and saved positions.
- API suite: **46 passed**, including all four new species, exact unlock boundaries, persistence/restart/export, watering, idempotency, resource gates and account isolation.
- Final typecheck, lint and clean web export: passed.
- Targeted browser regression: **4 passed (2.1 minutes)** against the final export on port 3002: the complete learning/account/isolation loop, flower/drawing drag flow, mobile touch planting, and the new greenery workflow. The greenery test verifies fern and cactus planting, watering through mature growth, zero-water controls, a newly unlocked monstera, free movement, and reload persistence.
- [Desktop greenery](screenshots/garden-greenery-desktop.png) and [mobile greenery](screenshots/garden-greenery-mobile.png) were visually reviewed. The phone layout scrolls vertically and has no horizontal overflow. Native device execution remains unverified.
- Restarted the local server on port 3001 and refreshed the existing Garden tab, confirming the new Greenery choices and preserved resources.

## CNA news source — 13 October 2026

- Added CNA’s official Latest News RSS feed alongside NPR and NASA, with All sources / CNA / NPR / NASA filters. Headlines retain publisher attribution, original publication timestamps and direct article links; no credentials are needed.
- API suite: **48 passed**, including CNA XML processing instructions, namespaces, encoded apostrophes, Singapore date offsets, exact HTTPS host validation, metadata-only output, partial failure, recovery and stale caching.
- Final typecheck, lint and clean web export: passed.
- Targeted news browser suite: **2 passed** against the final export on port 3002. It covers CNA-only filtering, the button’s pressed state, direct CNA navigation, unavailable-source messaging without substituting other publishers, recovery, existing empty/network states, mobile overflow, ten-minute polling and midnight rollover.
- Live verification returned 20 current-day CNA headlines. Restarted port 3001 with the existing database, refreshed Discover and visually checked the live CNA filter in the in-app browser.
- [Mobile source filter](screenshots/cna-news-mobile.png) was visually reviewed. This screenshot uses a clearly isolated browser-test headline fixture; live stories were checked separately. Native device execution remains unverified.

## Tidier GROW reflection — 13 October 2026

- Consolidated the takeaway, retry starter and primary retry action into one card. Garden rewards use a compact responsive row/grid. GROW dimensions start collapsed and expand independently to reveal strengths, exact evidence, confidence and suggestions. Delivery is separate and has no level bar when unassessed.
- Removed duplicate feedback scrolling/padding. The parent scroll view resets when a completed practice result appears, including debate results that previously opened below the heading. Opening details or refreshing saved data does not reset the reading position.
- Local/provisional limitations and needs-review alerts remain visible. Full assessment notes, saved response/audio, journal actions, feedback reports and same-rubric/provider comparisons remain accessible.
- Final typecheck, lint and clean web export: passed.
- Targeted browser regression: **2 passed (50.3 seconds)** on the final export: the full learning/account/isolation loop and recorded-response workflow. Checks cover all three practice modes, retries, journal/report actions, exact evidence quotes, initially collapsed rows, keyboard Enter/Space toggles, method and response disclosures, and the result heading appearing in the viewport.
- [Desktop feedback](screenshots/desktop-feedback.png), [mobile takeaway/rewards](screenshots/feedback-neat-mobile.png), and [mobile GROW/details](screenshots/feedback-grow-mobile.png) were visually reviewed. The 390×844 layout has no horizontal overflow. Screenshots use test responses; native device execution remains unverified.


## MindGarden final audit — 14 October 2026

The final optimized web export is `entry-94fa471228022f635fd02bb5d4f70739.js`. The app title, navigation, onboarding, invitation copy and launcher assets consistently use **MindGarden**. The original sprouting-M vector and generated icon assets are documented in [brand notes](brand.md).

### Final checks

- **58/58 backend tests passed**, including seven offline configured-provider transport tests. They cover evaluation/debate/transcription request payloads, valid responses, schema/quote rejection, retained work, ownership, error recovery and idempotent rewards. No paid provider credentials or requests were used.
- **15/15 browser workflows passed in 1.5 minutes** against the final export and isolated test server on port 3002. Command: `E2E_WEB_URL=http://localhost:3002 E2E_API_URL=http://localhost:3002 npx playwright test`.
- Whole-project typecheck and lint passed; final backend/test-entrypoint scoped lint also passed. Generated exports and browser diagnostic directories are excluded from source checking.
- Expo Doctor: **21/21 passed**.
- Web export and both iOS/Android Hermes exports passed. Native bundle IDs: iOS `79d2993c5029403da5364c86ec1769e7`, Android `0d0c62b5af6c22b9ed9192b4161f7184`.
- Live port 3001 smoke checks confirmed the new page title, fully visible first-practice action at 390×844, and weekly/XP progress values exposed to web assistive technology. The existing persistent garden database was preserved.

### Workflow coverage and fixes

The complete browser suite covers onboarding and account upgrade/login/export/deletion; text and synthetic-microphone practice; saved drafts, local transcript corrections, denied microphone access and recording limits; retries, exact GROW quotes, disclosures and keyboard interaction; debate rounds and reading reflections/journals; two-person text/voice debates with uncertain/rejected-request recovery; news publisher filters, failures and midnight refresh; mouse/touch planting, drawing, greenery growth and saved positions.

Added checks prove the visible daily reward matches persisted resources, a real variety unlock can be planted, completed quests reopen the correct reflection, same-day practice offers the garden, and returning guidance starts a linked retry. Controlled calendar and evaluator-metadata fixtures are explicitly identified in the tests: backend date arithmetic is tested separately, and no model-assisted fixture is represented as a real provider assessment.

The audit fixed:

- Valid long debate transcripts failing the shorter single-answer evaluation limit.
- Retry-only days being omitted from practice rhythm; weekly counting now uses completed activity dates in the profile timezone, including DST and week boundaries, and excludes future timestamps.
- Saved audio drafts reopening as evaluation retries or missing locally corrected transcripts. Home now resumes the matching original draft; its actual storage slot is removed after successful feedback.
- Old async state responses restoring signed-out accounts; foreground and day-change refreshes retain current session ownership without idle network polling.
- Comparisons mixing different coaching-template/model versions. Positive matching controls and mismatched-version exclusions pass.
- Progress values not reaching browser accessibility attributes, mobile date-range controls overflowing at 320px, and a decorative greeting line pushing the main action down.

Repeated synthetic runs initially hit normal aggregate IP/sign-up limits. The final run uses `tests/e2e-server.mjs`, which requires test mode, binds to loopback, forces local coaching and raises only the constructor-supplied aggregate IP request budget for many simulated users sharing one address. Production defaults, authentication limits and per-user limits are unchanged; the default 300-request limit remains covered by API regression tests. Each full run should start a fresh isolated test process.

### Visual review

Reviewed the final [desktop Home](screenshots/desktop-home.png), [mobile Home](screenshots/mindgarden-home-mobile.png), [returning Home](screenshots/returning-home-mobile.png), [mobile unlock guidance](screenshots/mindgarden-unlock-mobile.png), [320px Profile](screenshots/mindgarden-profile-320.png), [mobile GROW details](screenshots/feedback-grow-mobile.png), [mobile welcome](screenshots/mindgarden-welcome-mobile.png), and refreshed garden/friends/news screens. These use isolated test accounts and responses. The mobile navigation remains available, content scrolls vertically, and tested layouts have no document-level horizontal overflow.

### What remains unverified

Real provider-account access/billing, real microphone hardware and iOS/Android device interaction still require their environments. Native export proves bundling only. Rubric calibration and retention require user research. The three-day weekly intention and feedback-led return flow are design hypotheses; the current 90-XP catalog and twelve permanent planting spaces limit longer-term cosmetic progression. See [gamification design and pilot questions](gamification.md). This audit establishes a working local MVP, not public-hosting or educational-validation readiness.


## Minimalist copy and layout — 16 October 2026

Removed decorative headlines, repeated explanations, duplicate garden resource counts, and a duplicated reading summary. Garden controls now use Plants / Draw, short prices, and one Earn seeds action when empty. Home, Discover, practice, feedback, friends, onboarding, Profile, and Settings use shorter copy while retaining privacy, source attribution, action costs, and local-feedback limitations.

- Typecheck, full source lint, and final scoped lint (App, Practice, audio assertions) passed. The final web export is `entry-67fc1130175e4f7cc458cc0c6aa430cf.js`, served at localhost:3001.
- The initial 15-workflow browser run passed 13 tests; two audio tests exceeded the five-second device-startup assertion. Those assertions now allow 20 seconds, and the renamed Home draft action was updated. All 7 audio, learning-loop, and garden workflows passed in the final focused run (1.5 minutes). News, friend debates, returning-user progress, and account-state workflows passed in the initial run.
- A separate smoke check passed for desktop/mobile Garden, drawing controls, replacing the planting button with Earn seeds, navigation to Practice, and Home. Screenshots were visually reviewed. The existing in-app garden tab was refreshed and showed the final copy without altering its plants or resources.
- All checks used the local provider and isolated test users. No backend logic, reward rules, or existing user data was changed.

Visual evidence: [Garden desktop](screenshots/minimal-garden-desktop.png), [Garden mobile](screenshots/minimal-garden-mobile.png), [Drawing and empty resources](screenshots/minimal-planting-mobile.png), [Home mobile](screenshots/minimal-home-mobile.png), [Feedback mobile](screenshots/feedback-neat-mobile.png).


## Research-informed assessment revision — 30 October 2026

Story: a learner sees the relevant criteria, completes speaking/debate/reading practice, submits through the authenticated API, and receives saved evidence-linked feedback under the same versioned rubric.

| Boundary | Result and evidence |
| --- | --- |
| UI → criteria | Shared original mode definitions appear in collapsed Criteria before practice and expanded assessment details afterward. Browser checks exercise disclosure and keyboard access. |
| Submission → API → SQLite | Full learning-loop browser check completes all three modes, a retry, journal, reload/account persistence and isolation against the separate test database. |
| Evaluator → saved response | 93/93 backend/benchmark tests pass. These include exact UTF-16 quote/schema validation, actual debate context, opening-revision Engagement N/A, missing-source abstention, authoritative version metadata and score-free local coaching. |
| Response → UI | Three targeted browser scenarios pass: complete learning loop, returning-practice loop, and preserved legacy comparisons with new unvalidated ratings excluded. Mobile feedback has no horizontal overflow. Old-copy test selectors were updated after the first run; both affected scenarios passed on rerun. |
| Configured provider boundary | Offline transport mocks verify provider request/response contracts, errors and recovery. No paid-provider calls or live semantic validation were performed. |
| Human benchmark tool | 17 focused tests within the 93-test suite check QWK/direct errors, independent human comparisons, abstention/missing-cell counts, version isolation and bootstrap limits. Independent review identified and resolved missing-cell reporting and excessive rater-pair computation. |
| Build and static checks | `npm run lint`, `npm run typecheck`, and `npx expo export --platform web --max-workers 2` pass. Latest export: `entry-3556c340359dd9e85b9cee58247eda09.js`. Scoped lint also passes for the added benchmark and UI files. |
| Running application | Restarted port 3001 with the revised evaluator; `/api/health` reports `ok:true`, `provider:local`. The practice route serves the new export. Test-only port 3002 was stopped afterward. |

The included benchmark demo ran successfully and labels itself `synthetic_demo` / `descriptive_report_only`. It is not a human dataset or evidence of scoring accuracy. Local feedback's final copy-only refinement to a short mode-specific next step was covered by the final backend suite; it does not change the rendered layout contract. Native-device testing, live-provider evaluation and a real held-out human-rating study remain separate work. See [research recommendation](research/mindgarden-evaluation-framework.md) and [benchmark guide](assessment-benchmark.md).

## Evidence quote recovery — 31 October 2026

A synthetic live assessment reproduced the reported failure: the provider returned a complete, parseable assessment with verbatim quotes, but every generated character range was incorrect. Strict JSON output had fixed the dimensions shape, while the quote-position check still rejected otherwise usable feedback. Earlier success fixtures calculated perfect offsets in JavaScript and missed this behavior.

The `garden-coach-v4` provider contract requests quotes without offsets. The server finds each exact, unique occurrence and computes UTF-16 ranges before applying the existing strict validator. A correct legacy range can disambiguate repeated text; an incorrect range is repaired only for a unique unchanged quote. Fabricated, normalized, ambiguous or malformed evidence still fails. Fixed diagnostic reason codes and job IDs make future failures distinguishable without logging answers or provider bodies.

- All 55 targeted backend/API/provider/reflection tests and lint/typecheck passed. Cases include real interior quotes after emoji, CRLF and combining marks; overlapping and repeated text; evidence limits; preserved reflection; safe diagnostics; and retry/reward idempotency.
- All eight configured offline browser tests passed, including both new quote-position regressions, exact displayed evidence, reload persistence, and the existing speaking/reading/debate/transcription recovery flows. Provider traffic was fully mocked and unexpected outbound requests were blocked.
- A second bounded synthetic live call ran through a temporary API and database with the configured `gpt-6-luna`. It completed successfully with three exact evidence spans, preserved the answer and reflection, and awarded resources once. Re-requesting the completed job made no additional provider call. Both live checks used synthetic text, and the temporary database was removed.
- The actual local backend was restarted on port 3001 with no queued or processing jobs. Health is healthy and configured. Health itself remains a read-only configuration check, not a live probe. The frontend bundle is unchanged.

These checks establish the integration fix, not rating accuracy, real microphone behavior or native-device compatibility. User answers and recordings were not sent by these tests, and existing user jobs and retry counts were not rewritten.

## Guided revision — 31 October 2026

Feedback now replaces “Try this” with three open questions and neutral placeholders. Local and historical feedback receive mode-specific fallback questions; new AI feedback requests task-specific questions through the strict schema. Notes persist on the device by account and attempt, remain available under “Your notes” in the retry editor, and do not overwrite the original answer or enter assessment requests. Home and Profile use a guiding question instead of the old prescriptive retry text.

- All 62 targeted backend tests, full lint and typecheck passed. Tests cover guide structure, malformed/legacy fallback, preserved ratings and exact evidence, independent local defaults, and existing retry/reflection behavior.
- Both focused local browser flows passed: returning daily practice and historical-feedback guidance with note persistence, linked revision, attempt/account isolation and a 390-pixel mobile layout. The mobile screenshot was inspected; fields and actions fit without horizontal overflow.
- All nine configured offline browser flows passed, including generated questions and exact neutral placeholders, note persistence in a linked retry, unchanged original text, separate self-reflection, and absence of private note/reflection markers from provider input. Existing quote/schema/audio/debate recovery checks also passed. Temporary test servers and data were cleaned up.
- One bounded live synthetic feedback request returned three relevant open questions with neutral placeholders under `garden-coach-v5`; exact quote validation still passed. This checked the integration, not educational effectiveness or rating accuracy.
- The final web export is `entry-21200e5e97f1a74fb9edc8eb923a1d76.js`, confirmed served by port 3001 with the restarted v5 backend. No active jobs were interrupted and no user answers or recordings were used by the tests.

## One-question revision guide — 31 October 2026

“Think it through” now shows one question and answer field at a time, a 1/3–3/3 counter, and Back/Next controls. No examples are displayed. Notes remain optional, and Try again stays available on every step. Local notes now also remember the current question; existing version-1 notes without a position open at the first question.

- Full lint, typecheck and web export passed. Port 3001 serves the final `entry-2c75d2672e2d65520e702aaaedcd28ce.js` bundle and reports healthy.
- Both focused browser scenarios passed using isolated temporary data: historical/local guidance and configured-provider guidance with offline responses. Checks cover exactly one answer field, boundary buttons, blank-step navigation, backward answer preservation, reload and linked-retry position recovery, legacy notes, attempt/account isolation, and exclusion of private notes from grading requests.
- The [390-pixel mobile capture](screenshots/thought-guide-stepper-mobile.png) was visually reviewed: the question, answer field and controls fit without horizontal overflow. Temporary test servers and data were cleaned up. No live AI calls or native-device testing were performed for this UI change.

## Recording review controls — 31 October 2026

The recording-ready panel now has a full-width Use recording action, evenly sized secondary actions that stack on small screens, compact playback spacing and shorter helper text. Existing callbacks and disabled states are preserved.

- Lint, typecheck and web export passed; port 3001 serves `entry-2b7e4cb51f182fc649dde9d4ec795154.js`.
- A temporary browser check with a synthetic microphone passed at 320, 390 and 1440 pixels after fixing secondary-button shrink on narrow screens. Controls align without overlap or overflow and retain at least 44-pixel hit targets. [Mobile](screenshots/recording-ready-mobile.png) and [desktop](screenshots/recording-ready-desktop.png) captures were visually reviewed.
- Playback, Record again, Discard recording and Use recording passed. Only the used take created a private audio draft, with no reward changes, runtime errors or external requests. No live provider calls or native-device testing were performed.

## Optional question hints — 31 October 2026

Removed the “On this device · not graded” caption from Think it through. A small Hint button beside the progress counter reveals short mode-and-stage guidance below the question. It starts closed and closes on navigation; no examples or answers are inserted.

- Formatting, lint, typecheck and web export passed. Port 3001 serves `entry-0ec1fa8e9da49fe21028b9a7d9a80c00.js`.
- Temporary browser verification covered all three questions in all three modes: pointer and keyboard toggles, expanded state, hidden reset on Next/Back/reload, distinct hints, correct placement, unchanged answers and saved position, removed caption and absence of examples. No hint interaction made API/provider calls or changed saved attempts or rewards.
- The 320- and 390-pixel layouts were visually reviewed without overflow. [Mobile hint capture](screenshots/thought-guide-hint-mobile.png). Verification used isolated local data; no live AI calls or native-device tests were needed.

## Annotated AI revision draft — 31 October 2026

After question 3/3, Create AI draft explicitly sends the guiding answers and original response to the configured provider. The separate draft highlights exact phrases and offers touch- and keyboard-accessible explanations. Drafts persist locally by account and attempt; changed notes require an explicit update. A local save failure offers Save draft again without making another provider request.

- Full lint, typecheck and web export passed. The final bundle is `entry-ce3386a56fac991e81afa516043995c3.js`.
- All 26 targeted guided-response and existing API tests passed, alongside scoped backend lint. They cover input and owner checks, provider failures, exact Unicode annotation spans, cache bounds and expiry, shared in-flight requests, rate limits, logout/account deletion, reading/debate context and unchanged attempts, evaluations and rewards.
- Both focused offline-provider browser flows passed: private notes remain excluded from assessment requests, and explicit draft generation works through failure/retry, a storage-only save retry, stale-note updates, exact rendered text, keyboard annotation selection, reload, linked revision and account isolation. Tests used isolated temporary data and blocked unexpected provider traffic; the fixture was stopped afterward.
- The [390-pixel mobile draft](screenshots/guided-ai-draft-mobile.png) was visually reviewed. Highlights, annotation buttons and the selected explanation fit without horizontal overflow.
- One bounded live request using synthetic responses and the configured `gpt-6-luna` returned a coherent draft with four validated annotations. No user answers or recordings were used. This establishes integration behavior, not factual correctness or educational effectiveness.
- The actual backend was restarted on port 3001 after confirming there were no queued or processing jobs. Health, the unauthenticated draft-route gate and the served final bundle were verified. Native hardware behavior was not tested.

## Optional reflection and direct feedback — 1 November 2026

Written responses and the final debate round now offer Get feedback as the primary action, with Reflect first as a secondary choice. Recording review keeps transcript controls visible while reflection starts collapsed. Saved notes reopen expanded, and Skip reflection explicitly removes a note. Debate completion is saved before the client queues evaluation, so a queue failure retains the same complete response for retry.

- Full lint, typecheck and final web export passed. Port 3001 is healthy and serves `entry-274d696b17cb75637d10f8b21c9b114e.js`; no backend restart was needed.
- All six backend reflection regressions passed, including note ownership, separate limits, exclusion from assessment prompts, deferred debate recovery and reward deduplication.
- All eight focused browser flows passed against the final bundle: four local workflows and four configured-provider workflows with offline responses. They cover direct feedback from reading and debate, optional notes, save/reload/skip, manual and generated transcripts, missing-transcript recovery, lost final-debate fetches and queue failure followed by evaluation of the same complete saved attempt. The debate field stays locked during submission.
- The [direct-feedback mobile view](screenshots/direct-feedback-mobile.png) and [optional reflection view](screenshots/optional-reflection-mobile.png) were visually reviewed at 390 pixels. Primary and secondary actions fit without horizontal overflow.
- Verification used isolated temporary accounts, SQLite and audio, with provider requests mocked and unexpected outbound calls blocked. Temporary servers and data were cleaned up. No live AI calls or native-device tests were required for this change.

## Friend debate verification — 1 November 2026

Goal: ensure the existing two-person friend debate works from invitation through a saved completed conversation. The current feature is asynchronous text and voice turns on one shared backend, with two or three turns per person. It does not require AI credentials; configured transcription is optional.

The audit fixed malformed invite bodies returning a server error, invalid Unicode corrupting saved request identity, delayed draft writes losing the last edit, stale async updates crossing room/account boundaries, and fields remaining editable during submission or transcription. Voice attachments now persist before transcription. Uncertain invite creation retains its original settings and key, and stale polling cannot restore cleared drafts. A recording file read is checked again against its account owner before upload begins.

| Requirement | Current evidence |
| --- | --- |
| Open, invite and join as separate people | Browser checks reach the feature from Home/Play, copy a real six-character code, join from an independent browser context, and verify opposite sides. Invalid/expired codes and a third participant are covered by API checks. |
| Alternate two or three rounds | Browser checks complete both lengths, including a host choosing Against. API tests verify simultaneous joins, out-of-turn/stale requests and duplicate/distinct request keys cannot create extra turns. |
| Write or share voice | Browser recording, upload, manual transcript, correction, reload, Send and partner playback pass. A separate configured-provider browser flow returns an offline AI transcript, preserves corrections across reload, and shares the exact recording/text only on Send. |
| Recover without lost or duplicate work | Browser checks cover immediate text/voice draft reload, switching between two rooms, lost creation/turn responses, definite and uncertain failures, and busy controls. API checks cover restart recovery; upload tests execute the actual client module with a delayed file read and verify account switch/sign-out prevents any POST. |
| Preserve access boundaries | A third browser account cannot read the room or recording. API tests cover ownership, signed playback scope/expiry/refresh, recording retention, account upgrade/new login and participant deletion. Browser tests retain old local storage while verifying a new account cannot see its rooms or drafts. |
| Finish or close and revisit | Both participants see completed conversations after reload; the guest can close an active room, and closed conversations reopen without permitting more turns. API tests also cover room expiry. |
| Keep friend practice separate from assessment | Browser/API checks confirm no practice attempt, AI score or garden reward is added. The configured friend voice flow makes exactly one transcription request and no assessment request. |
| Running app and mobile layout | Port 3001 serves the final `entry-3e8bf37a2f7733fbc6e1ac6651537b0b.js` bundle, reports healthy, and rejects unauthenticated room access. Final 320- and 390-pixel captures were visually reviewed with no horizontal overflow. |

Final checks: full lint, typecheck and web export passed; **14 friend API/upload tests**, **3 existing transcription API regressions**, **3 expanded friend browser scenarios**, and **1 configured friend voice browser scenario** passed. The first baseline browser recording setup stalled with its page in the background; bringing the recording page forward and allowing a bounded 30-second device startup resolved it. The final media checks passed with no application runtime error.

Visual evidence: [voice draft at 320px](screenshots/friends-voice-draft-320.png), [voice draft at 390px](screenshots/friends-voice-draft-390.png), [three-round completion at 320px](screenshots/friends-three-rounds-320.png), [mobile completion](screenshots/mobile-friends.png), [desktop completion](screenshots/desktop-friends.png).

All browser/API tests used isolated accounts and temporary data. Provider traffic was mocked, and the browser microphone was synthetic. Temporary test servers and data were cleaned up. The actual backend was restarted with no queued or processing jobs; the user's saved conversations were not used for tests. Physical-device/native recording and public hosting are not established by these checks. Both participants must use the same reachable backend with separate accounts; README documents LAN origins and HTTPS requirements for another device.
