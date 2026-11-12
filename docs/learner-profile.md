# Evidence-backed practice recommendations

Implemented: private persisted BRIDGE criterion observations, a deterministic recommendation policy, fresh approved speaking prompts with a visible focus, user dismissal/pause, explicit history import, export/deletion and mobile Profile controls. This adds no required activity or model request. It grants no mastery, XP or garden stages.

The pilot policy `learner-practice-v1` requires at least two level-1/2 observations among the latest three eligible, distinct prompts for a criterion. It uses model-reported high confidence, exact response evidence and one rubric/template/model comparison group within 90 days. Model confidence is not empirically calibrated reliability. Repeated topics, linked retries, focused sessions, local review and low-confidence feedback cannot supply the repeated-gap pattern. Absence of an assistance flag is not proof of independence.

Goals break priority ties. The next all-topic spin selects an approved prompt outside the eight most recent sessions, preferring questions absent from the recent 100-session history. Explicit categories/prompt choices override this selection. The visible focus is pinned to the session, which is marked guided for future observations. Current exercises are curated beginner questions; proficiency-based difficulty and independent transfer checks remain unfinished.

Dismissal is owned and idempotent, including a lost-response retry. Pause persists. The Profile panel distinguishes a dismissed suggestion from missing evidence. Users may explicitly include up to 100 recent saved BRIDGE responses without rescoring or making another provider call. Earlier attempts remain unchanged. Imported observations keep their original response dates and evaluation versions.

The worker commits feedback, observations and existing rewards atomically. A forced observation-write failure rolled back feedback and rewards; retry recovered. API ownership, malformed evidence, duplicate imports, expiry, model separation and account-deletion cascades are covered by tests. Quotes and feedback remain private to the learner.

SQLite creates `skill_observations` on startup. Hosted deployment requires `supabase/migrations/202611120004_skill_observations.sql` before this code, including export endpoints. It enables RLS and denies direct client access. No live migration or deployment was performed.

Verification: 303 backend tests passed (3 live-cloud checks skipped), 33 local browser cases passed and 16 offline-provider browser cases passed with real media decoding. The new browser case covers sourced recommendation → focused practice → pause/reload/resume → lost-response dismissal retry → model-free history import. Nine focused learner tests were rerun after the final dismissal-status correction; lint/typecheck passed. The full browser suites preceded that final message/status correction. The affected recommendation/pause/dismiss/import journey subsequently passed against a fresh web rebuild (1/1).

Still outstanding: human calibration and helpfulness validation, native/live/cloud verification, broader exercise difficulty and optional-mode rollout, independent transfer and mastery-driven garden growth, and the remaining master roadmap. This implementation does not prove scientific validity or learning gains.
