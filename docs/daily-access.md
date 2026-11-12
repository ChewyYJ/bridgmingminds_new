# Daily speaking access and provider budgets

Required daily Spin & Speak no longer consumes or depends on the five-per-week optional/classic AI-practice allowance. Read Aloud self-review remains available independently. This implements the advertised two-activity daily rule without relaxing provider cost limits or awarding duplicate progress.

## Admission rules

The backend reads the authenticated user's persisted daily-plan enrollment and the owned session's SQL mode. Only daily-plan `spin_speak` qualifies. Debate, Read & Reflect and classic-plan practice keep their existing weekly reservation and per-session controls. Existing optional usage/history is retained when enrolling; it is not reset or refunded. A saved classic speaking draft can still become the required daily submission after enrollment, without discarding the learner's answer or changing its historical rubric.

Evaluation admission additionally requires the owned, persisted speaking attempt, matching session and trusted daily submission receipt. The server pins that receipt after validating the answer and before provider admission. A client cannot select the credited date or obtain the exemption by supplying a session label. Duplicate completed/queued jobs return their existing state before making another provider request.

Daily speaking has separate pilot budgets of **12 evaluation requests** and **8 optional coach requests per learner per service day**. Guided questions/drafts cannot spend evaluation requests. Daily requests do not reserve a weekly optional-practice slot. Transcription and optional acoustic allowances remain separate. These are configurable-in-code operational defaults, not paid entitlements or validated learning targets.

The service day resets at midnight Singapore time, matching the existing provider accounting clock. It is separate from the learner's chosen-timezone engagement day, and changing the learner's timezone cannot reset cost counters. A delayed job can retry on a later service day while retaining its original trusted XP/streak day. Rejected admission rolls back counters; it does not silently consume a slot or a daily request.

The existing global daily provider cap, authentication, per-minute/hour limits, job leases, per-attempt provider-failure limit and structured-output validation remain. Usage-cap failures do not consume provider-failure retry attempts. A capacity failure preserves the saved answer and requires an explicit later retry; it does not fabricate feedback, award unprocessed XP or promise a live provider is available. The pre-existing five-provider-failure support limit remains a separate retry control.

No new schema migration is needed: the service uses existing durable `rate_limits`, `practice_usage` and trusted daily-receipt tables. Normal hosted startup still enables usage controls when a provider is configured. Constructor-only `enforceUsageLimits`/`usageClock` options let isolated tests exercise that policy on SQLite with a fully offline provider. They are not request fields or client-controlled settings.

The usage snapshot now labels its scope `optional_and_classic_practice` and reports `dailySpeakingIncluded`, so a zero optional balance is not an assertion that daily speaking is unavailable.

## Verification

Four added unit cases cover seven daily-speaking days after optional exhaustion; independent coaching/evaluation caps under concurrency; restart durability and timezone-change resistance; trusted receipt/session/owner checks; optional-mode exclusion; and global-cap rollback. Two API cases force hosted-style admission with real Express/SQLite and an offline transport. They verify existing draft recovery after enrollment, unchanged optional usage, daily XP idempotency and provider-free duplicate requests. Twelve deliberate outage attempts then exhaust the daily budget; a later-day retry of the same saved job succeeds and secures the original receipt day with exactly 25 total daily XP.

`npm run test:e2e:daily-access` starts a dedicated offline-provider browser gate with hosted-style limits forced on. It actually completes five classic practices, confirms the next optional admission is denied, then uses the mobile UI to enroll and complete Read Aloud and Spin & Speak. It checks the additional 25 XP, unchanged exhausted optional balance, 2/2 after reload, and continued optional-mode limits. The first harness request omitted the required browser Origin header; adding the correct Origin fixed the test harness without changing CSRF protection.

The full backend run passed **294 tests, with 3 optional live-cloud checks skipped**. TypeScript and Expo lint passed. The dedicated browser gate passed. All **15 existing provider browser regression cases passed**, with real FFmpeg decoding enabled and offline assessment fixtures. The new mobile screenshot `screenshots/daily-workout/optional-quota-exhausted-daily-complete.png` was visually inspected. The previously verified local 33-case browser run belongs to the earlier WordBloom slice and was not rerun for this server-only change. These tests do not establish live provider/model quality or deployed PostgreSQL behavior. No paid provider call, hosted migration or deployment was performed.
