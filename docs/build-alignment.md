# Alignment with the supplied master build prompt

Reference: [the user's supplied prompt-2.md](reference/master-build-prompt.md), received 11 November 2026. This is a product specification, not evidence that its proposed learning outcomes or BRIDGE scores have been validated. Existing Expo/React Native and Node infrastructure will be retained rather than replaced with the suggested greenfield stack.

## Delivery order and current gaps

1. **Daily engagement foundation:** persisted first qualifying completion per activity/day, server-pinned timezone and receipt, 10/15 XP exactly once, 2/2 secured day and one cosmetic reward, missed-day reset. Preserve historical XP, responses and gardens. Replace the existing reward economy only when both new daily activities are usable.
2. **Read Aloud vertical slice:** immutable curated passage assignments, recording/replay and persisted, explicitly confirmed self-review now exist. Acoustic assessment/provider capability adapter, annotated word feedback and separate sample demo remain outstanding. No acoustic scores are inferred from transcripts.
3. **Spin & Speak + BRIDGE + Thought Maps:** new daily speaking sessions now use the separate six-dimension BRIDGE rubric, curated task applicability and validated explicit/inferred/missing maps. Mobile outline, graph zoom/pan, exact-source inspection and saved revision comparison are implemented. Classic/historical and optional-mode rubrics are preserved; optional-mode BRIDGE rollout and empirical validation remain outstanding.
4. **WordBloom:** bounded contextual candidate extraction, dismissal, immutable reading assignments, adaptive exposure scheduling, separate reading and productive-use evidence. Implemented as a bounded starter catalogue with model-context suggestions, honest local enrichment, next-eligible curated passages, optional self-report intervals, dismissal and separate provisional later-use observations. Acoustic pronunciation evidence and calibrated vocabulary mastery remain outstanding. See [WordBloom implementation](wordbloom.md).
5. **Home/onboarding/progress:** opt-in daily Home now shows exactly two daily activities, one next action, 0/2, 1/2 and 2/2, daily XP and secured/unsecured status. Onboarding accepts a chosen IANA timezone; Profile includes daily status and reading history. The classic plan is retained until explicitly switched, not silently migrated. Full adaptive skill progress remains outstanding.
6. **Garden and learner profile:** daily-plan plants no longer die; watering is free, decorative and does not advance stages. Existing plants, decorative growth and cosmetics are preserved. Calibrated longitudinal skill observations and mastery-driven growth remain outstanding; classic-mode lifecycle remains unchanged until the user opts in.
7. **Quality and release:** core flows in both orders, concurrent/idempotent rewards, midnight and timezone changes, permission denial and provider outages, mobile/desktop visual review, lint/typecheck, privacy/export/deletion, setup and migration documentation.
8. **Extended roadmap:** audit and retain working optional debate/reading modes; advanced coaching, institution roles and billing require real permissions, providers and complete tests before enabling. They must not be presented as built.

## Implementation status

The supplied reference has been preserved verbatim. The existing application remains runnable. The items above are outstanding unless an implementation and its verification are explicitly recorded here. No new daily streak, BRIDGE validity, speech accuracy, WordBloom learning outcome or full-roadmap completion is claimed.

The daily-workout service is now connected to Read Aloud and Spin & Speak for opted-in users. Enrollment atomically changes future reward behaviour, while retaining historical balances and records. It is currently an opt-in self-review learning loop, not the completed phase-1 product or an acoustically assessed Read Aloud release.

### Verified foundation — 11 November 2026

- `server/daily-workout.mjs`: trusted receipt pinning, processed-attempt checks, per-activity XP and one daily cosmetic grant in a transaction; no model-controlled rewards and no low-rating penalty. Exactly two supported activities; optional modes do not qualify.
- SQLite schema and additive PostgreSQL migration `202611110001_daily_workout.sql`: unique day/activity completions and secured days, private server-only tables with RLS and account-deletion cascades. No historical re-scoring or XP resets. The cloud migration has **not** been applied to a connected production database.
- `tests/daily-workout.test.mjs`: both orders, duplicates/concurrency, midnight and timezone changes, persistence/restart, consecutive/missed days, DST/year boundary, failed and meaningless responses, unavailable acoustic results, ownership, low-rating participation credit, transaction rollback, deletion.
- Full backend test run: 211 passed, 3 skipped; lint and TypeScript checks passed. These are software tests using synthetic records, not real speech-provider validation, mobile-device testing or end-to-end verification of a released daily flow.

### Daily-loop implementation — 11–12 November 2026

`server/read-aloud.mjs`, `src/screens/DailyWorkout.tsx` and the `/read-aloud` Expo route implement assignments, optional private recording/replay, saved device drafts, explicit self-review completion, repeat practice and restoration after reload. Read Aloud without a microphone is an explicitly labelled accessibility/provider-unavailable fallback, not demo output or acoustic evaluation. The server never accepts a client score or reward amount.

The worker commits a saved Spin & Speak assessment and daily rewards in the same transaction. A receipt is captured when a valid answer is queued. Job polling can recover delayed local scheduling using the same leases/idempotency controls; a test deliberately delays the worker timer and checks recovery without duplicate XP. Daily-plan optional modes receive no streak or daily XP credit. The classic experience is retained for users who have not enrolled.

Domain/API tests cover both orders, idempotency, lost responses, restart persistence, delayed processing across midnight, ownership, invalid and meaningless submissions, missing recordings, optional-mode exclusion, export, safe gardens after a long absence and unchanged production guest-abuse limits. Browser tests cover both orders, exact 25 XP/one seed, no streak at 1/2, reloads, extra practice, denied microphone, draft restoration, response loss, and recording/upload/replay/restored playback. These tests use real local Express/SQLite, with synthetic browser audio; they do not establish real-device speech quality.

The full browser regression run initially exposed the shared-loopback guest limit and an external NASA destination dependency. The test-only server now isolates its aggregate guest budget, while a dedicated API test verifies the production default remains 30/hour. Publisher navigation checks use destination fixtures rather than depending on external-site availability. No production abuse limits were relaxed.

**Still required:** real acoustic-provider support and locale/device validation, broader optional-mode BRIDGE rollout, adaptive profile and independently supported mastery. The core-default rollout, native device testing, hosted migrations and production verification are not complete. Final verification results are recorded separately; do not infer full-roadmap completion from local tests.

Final slice verification: **220 backend tests passed (3 live-cloud tests skipped), 29 local browser tests passed, 11 simulated-provider browser tests passed, lint/typecheck passed.** See the [verification report](verification-daily-workout.md) for boundary evidence, failure corrections and release limits.

### BRIDGE and Thought Maps — 12 November 2026

Implemented the [versioned BRIDGE contract and mobile-compatible Thought Maps](bridge-assessment.md). Session creation pins the framework for new daily speaking sessions, preserving existing evaluations. Backend validation rejects unsupported quotes, inconsistent ratings/status, broken references, cycles and inferred/missing nodes masquerading as learner quotations. Successful validation and daily reward commit remain atomic. Local mode never produces numerical judgments or an extracted map; the separate sample has no effect on persistence or XP.

The feedback UI exposes one priority card, optional full criteria, interactive graph and accessible outline, selected-source highlighting, original/revised texts and saved maps, private playback and concern reporting. The native-capable SVG/Views implementation replaces the suggested web-only graph engine; this platform trade-off is documented. Final checks passed: **246 backend tests (3 live-cloud tests skipped), 30 local browser tests, 12 simulated-provider browser tests, lint and typecheck**. See the [BRIDGE verification report](verification-bridge.md) for evidence and remaining limits. No full-roadmap completion or scientific validity is claimed.

### WordBloom implementation — 12 November 2026

The integrated speaking-to-reading path is implemented without a third activity or extra rewards. Assigned passages remain immutable in either activity order. New words, exposures and later-use candidates are separate private records, covered by export/deletion and additive cloud migration `202611120001_wordbloom.sql` (not applied live). Current verification and limits are recorded in [the WordBloom report](verification-wordbloom.md); earlier counts above are historical snapshots.

### Optional acoustic assessment — 12 November 2026

The [speech implementation report](speech-assessment.md) describes the continuous Azure adapter, bounded decoder, private recoverable jobs and opt-in mobile feedback. Self-review and acoustic evidence remain separate. Hosted migration, real compressed decoding, live provider/device/locale validation, pronunciation examples, WordBloom acoustic evidence and calibrated mastery are not complete. Offline fixture success does not prove speech accuracy.

### Real recording conversion — 12 November 2026

Real-media testing exposed an end-metadata M4A failure in the original pipe path. The decoder now uses a bounded, owner-only seekable copy for MP4/M4A, disables external references and remote protocols, cleans copies on all terminal paths and removes stale crash copies during maintenance. Eight strict media/API integration checks pass with FFmpeg 7.1; portable privacy/cleanup tests pass as well. The browser acoustic flow also passes with actual browser recording conversion and synthetic provider results. See [the media verification report](verification-speech-media.md). This closes the local compressed-conversion gap for tested formats, not live acoustic validation, native-device validation or the overall roadmap.

### WordBloom pronunciation review — 12 November 2026

The [provisional reading-review policy](wordbloom-pronunciation.md) now connects optional acoustic word observations to WordBloom without an extra activity or provider request. It records separate private provenance, requires repeated same-locale observations across assigned readings, preserves self-report priority and late-processing/idempotency rules, and grants no mastery or rewards. Live calibration and independent transfer remain outstanding; the additive cloud migration has not been applied.

### Daily-access admission gap — resolved locally

The hosted queue previously applied the classic five-practices-per-week reservation to required daily speaking. [Daily speaking admission](daily-access.md) now has a separate bounded evaluation budget, independent optional coaching budget, owned-attempt/receipt validation and the existing global service cap. Optional modes retain their allowance. Unit/API and a dedicated mobile browser gate prove that exhausting optional practice does not block either daily activity, and delayed retry retains the original reward day. Live hosted verification and the broader product gaps remain open.

### Learner practice recommendations — 12 November 2026

[Private, evidence-backed practice recommendations](learner-profile.md) now persist BRIDGE observations, explain a provisional focus using exact source quotes, select a fresh approved prompt, and support pause/dismiss/history import. Focused attempts are marked guided and never grant mastery. Verified with domain/API tests and a full mobile browser journey. Human calibration, independent transfer, mastery-driven growth and remaining roadmap features are not complete.
