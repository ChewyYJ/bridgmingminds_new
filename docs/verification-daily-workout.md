# Daily workout verification — 12 November 2026

This is the earlier daily-loop verification snapshot. The subsequent [BRIDGE/Thought Map verification](verification-bridge.md) records the current follow-up implementation and regression results.

## Story and scope

A learner explicitly starts the daily plan from Home, completes Read Aloud self-review and Spin & Speak in either order, sees 0/2 → 1/2 → 2/2, and receives exactly 25 activity XP and one cosmetic seed. A single activity cannot secure the streak. Saved observations, recordings, rewards and existing gardens survive reload and server restart. Optional practice remains available without replacing required activities or duplicating rewards.

Read Aloud is currently an explicitly authorised self-review/accessibility fallback. It is **not acoustic assessment**. Its optional recording can be uploaded privately, replayed and restored; no pronunciation, pacing or prosody scores are produced. The browser audio in tests is synthetic. BRIDGE, Thought Maps, WordBloom and independently calibrated mastery are not implemented by this slice.

## Results against the current implementation

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Backend regression | **220 passed, 3 skipped** | `npm run test:api`; 223 total tests. Skips are the explicitly opt-in live cloud multi-instance/database/audio suites, not suppressed local failures. |
| Local browser regression | **29 passed** | `npm run test:e2e -- --reporter=list,json`; real exported Expo app, Express and isolated SQLite. Completed in 2.9 minutes. |
| Simulated provider browser regression | **11 passed** | `npm run test:e2e:ai`; deliberately offline provider transport, real app and persistence. Verifies request/response/error recovery, not paid model access or semantic scoring accuracy. |
| TypeScript | **Passed** | `npm run typecheck`. |
| Lint | **Passed** | `npm run lint`; Home uses the existing clock hook rather than calling an impure clock during render. |
| Mobile/desktop review | **Inspected** | Screenshots under `docs/screenshots/daily-workout/`; 390×844 mobile and 1440×1000 desktop. Home progress and recorded reading/self-review inspected for wrapping and usable controls. |

## Boundary evidence

| Boundary | Verified behaviour |
| --- | --- |
| UI → API | Browser tests enroll through the real button, select a reading, submit notes/confirmation, select a speaking prompt and submit an authentic answer. No completion/reward API responses are fabricated. |
| API → persistence | Server-owned receipts and unique day/activity records are committed transactionally with rewards; both activity orders produce 25 XP and one seed. Meaningless notes, missing attestation, foreign assignments and missing/foreign recordings are rejected. |
| Processing → day/reward | Delayed speaking evaluation retains the trusted submission day across midnight. Local job polling recovers a deliberately delayed worker timer without duplicate rewards. |
| Persistence → UI | Reload restores 1/2 or 2/2 and the saved reading observation. API tests restart the server against the same temporary database. Extra practice does not add XP. |
| Network failure → recovery | A browser test commits a reading, deliberately loses the HTTP response, then retries and recovers the same saved attempt with only 10 XP. Notes survive a draft reload. |
| Recording lifecycle | Browser test captures synthetic audio, uploads privately, plays it, saves the reading, reloads and obtains a fresh signed playback link. Denied microphone access leaves accessible self-review available. |
| Migration → preservation | API test enrolls a classic learner with 30 earned XP and a grown plant; repeated enrollment preserves balances, plant identity/stage and responses and grants no retroactive daily credit. |
| Garden → safety | API test advances a daily-plan garden across a long break and a restart. Plants remain; free watering does not change XP or growth. Archive/restore works even after the old deadline. |
| Privacy → export/deletion | Export includes reading history, receipt/completion/secured-day records and recording metadata. Domain tests verify account-deletion cascades; existing account/audio isolation/deletion regressions also pass. |

## Issues found and corrected

- The first full browser run exceeded the production guest limit because independent synthetic learners share localhost. Only the isolated test server now receives a larger constructor-supplied budget. A dedicated API test verifies the default still accepts 30 guest sessions/hour and rejects the 31st.
- The NASA destination check depended on live external availability and reached a browser network-error page. The test now checks the real publisher navigation against a destination fixture, as the existing CNA link test does. This does not establish external publisher uptime.
- Queued local feedback could outlast the foreground test wait when background scheduling was delayed. Polling now recovers queued/stale work with the existing lease and duplicate-processing controls. Its dedicated API test deliberately delays the background timer.
- Lint caught an impure clock read in the new Home preview. It was replaced with the existing lifecycle-aware clock hook.

The final full regression run passed after these corrections. No production data was reset, provider requests were paid for, deployment was performed, or live cloud migration was applied.

## Remaining release work

Apply the additive PostgreSQL migration before any hosted rollout; validate the new tables/RLS and multi-instance behaviour against an isolated cloud database. Test iOS/Android recording on actual devices, and implement and validate a real acoustic provider before advertising pronunciation or delivery evaluation. Complete BRIDGE/Thought Maps, WordBloom and adaptive learning/mastery, then test those flows against the master reference. Existing cloud AI request budgets also need review before making this daily plan the default, so required free practice remains available every day.

The overall master-build goal remains incomplete. These results prove this implemented local daily-loop slice and the stated regressions; they do not prove the whole roadmap or guarantee defect-free operation.
