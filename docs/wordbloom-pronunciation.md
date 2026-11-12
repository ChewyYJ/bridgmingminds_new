# Provisional WordBloom reading review

WordBloom now records matched reading-pronunciation observations from the existing optional acoustic assessment. It does not add an activity or provider request. Reading self-reports, acoustic observations and later spontaneous-use candidates remain separate records. None grants XP or vocabulary/plant mastery.

## Evidence and scheduling policy

`wordbloom-reading-review-v1` is an explicit pilot heuristic, not a scientifically validated proficiency scale. The code is in `server/vocabulary-pronunciation.mjs`.

A word must belong to the immutable assigned WordBloom passage and have a completed reading exposure. Every scheduled occurrence must have exactly one matching provider word with the exact passage offsets, finite accuracy in 0–100, ASR recognition confidence at least 0.8 and a supported word flag. Missing speech, uncertain matches and incomplete coverage produce `insufficient_evidence` / `not_assessed`, never a zero or negative ability observation. Recognition confidence is not pronunciation confidence; this gate cannot establish fairness or accuracy across accents.

An eligible result is a provisional `review_candidate` when a provider word has accuracy below 70 and a Mispronunciation flag; it is a `stable_reading_candidate` when every scheduled occurrence is at least 85 with no provider flag. Other observations leave the interval unchanged. The stored evidence includes exact passage text, audio timing, provider/SDK/locale, scores, flags, policy version and the IDs contributing to a decision.

Acoustic interval changes require the same candidate outcome in at least two of the last three distinct assigned readings for the same practice locale, including the current reading. A single acoustic result cannot adjust the interval. The first completed acoustic assessment per assignment/locale supplies that assignment's spacing observation; extra attempts retain their own feedback without multiplying spacing evidence. This is reading practice, not independent vocabulary transfer.

Repeated review candidates halve the interval with a one-day minimum. Repeated stable-reading candidates multiply by 1.8, rounded up and bounded to 3–60 days. A current “needs practice” self-report prevents an acoustic recommendation from lengthening the interval. Existing self-report scheduling remains separate; it may already have adjusted the interval. When the acoustic rule changes it, the due date is anchored to the trusted reading completion, not delayed provider arrival.

Evidence from different locales does not combine. Late processing is retained for audit but cannot rewrite a newer completed reading's schedule or public latest observation. Duplicate jobs and retries do not apply the same observation twice. Already-assigned passages remain immutable. Pausing WordBloom or marking a word dismissed/familiar prevents new WordBloom pronunciation records and rescheduling. Familiarity remains a user declaration, not a rating inferred from audio.

## Persistence and UI

`vocabulary_pronunciation` is a separate private table, with ownership, attempt/session/vocabulary references, a unique assignment/locale observation and deletion cascades. The acoustic worker commits its validated result, vocabulary observation and schedule update atomically. A forced observation write failure was tested: no acoustic result or pronunciation observation persisted, the original self-review/rewards remained, and explicit retry recovered the same job.

The acoustic feedback panel explains the WordBloom decision. Profile distinguishes a provisional reading observation from an unassessed latest reading and from productive-use candidates. The UI labels the scheduling rules provisional and explicitly withholds mastery. Export includes the observations and decision provenance; account deletion removes them.

SQLite creates the table on startup. Hosted PostgreSQL requires additive migration `supabase/migrations/202611120003_vocabulary_pronunciation.sql` before deploying this code, including for export endpoints. It enables RLS and denies direct client access. No live cloud migration has been performed.

## Verification and limits

Six domain tests cover repeated observations, idempotency, stable/review intervals, missing/uncertain evidence, fabricated offsets, locale separation, self-report priority, out-of-order processing, opt-out/familiar/dismissed words, ownership and deletion. Three added job/API cases verify atomic persistence/recovery, separate self-reports and rewards, and interval changes across actual server-assigned days. The full backend run passed 288 tests with three optional live-cloud checks skipped; focused tests were rerun after canonicalising saved source text.

Final verification: **288 backend tests passed (3 live-cloud checks skipped), 33 local browser tests passed, all 15 provider browser tests passed with real FFmpeg decoding and offline assessment fixtures, 8 real-media/API checks passed, and typecheck/lint passed without warnings**. The browser scenario follows speaking → scheduled word → actual recording/upload/decoding → separate pronunciation observation → reload/Profile with exactly 25 XP. The mobile screenshot `screenshots/wordbloom/pronunciation-mobile.png` was visually inspected.

The first local browser run passed 31 cases but two garden fixtures used the wrong database because the external runner lacked E2E_DATABASE_PATH. The corrected isolated server uses an e2e.sqlite basename and the runner receives its exact path; the entire 33-case suite then passed. No application code was changed to bypass those assertions. All provider scores in automated tests are synthetic fixtures. Real audio decoding does not validate the acoustic judgment. Live Azure/device/locale calibration, user helpfulness studies, larger varied passages, independently demonstrated vocabulary transfer and the wider product roadmap remain outstanding. These thresholds must be calibrated before claiming proficiency or learning gains.
