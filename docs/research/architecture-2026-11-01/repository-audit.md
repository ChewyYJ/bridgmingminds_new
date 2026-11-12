# Repository backend, data, security and verification audit

Reviewed 1 November 2026. This is an evaluation of the current repository, not permission to migrate it or a security certification. It preserves the existing product vision. Source references below use repository paths and current line numbers; deployment recommendations are explicitly separate from observed implementation.

## Scope and evidence

Read the supplied architecture brief, `AGENTS.md`, `package.json`, `README.md`, the server and shared modules, client authentication/storage boundaries, test entrypoints, relevant test cases, and the offline benchmark. Did **not** read credentials, `.env.local`, logs, active databases, stored user records or recordings. Did not start services, run provider requests, mutate runtime data, install dependencies or execute tests during this audit.

The coordinating agent ran the current checks on 1 November: **149/149 backend tests passed; lint and typecheck passed**. Those results establish the tested functional contracts, not penetration-test clearance, production readiness, model accuracy, or native-device reliability. Existing browser suites and historical QA reports were inspected; the complete browser suite was not rerun for this audit.

**Recommendation:** keep the Expo client and Express application boundary, domain rules, immutable practice records, ownership checks, reward ledger, provider validation and regression suites. Refactor the monolithic server into testable services/repositories. Before public deployment, fix physical-media retention/deletion and upload controls, decide production identity/recovery, and add durable job claims, bounded work and observable cost/latency. A managed database/auth/storage migration may reduce operational work; it does not fix these application semantics automatically. A wholesale rewrite is not supported by the evidence.

## What actually exists

| Area | Confirmed implementation | Evidence |
| --- | --- | --- |
| Client | Expo SDK 57, React Native 0.86, React 19, Expo Router; web plus native source. No native release/device result is inferred from this. | `package.json`; `src/app/`; `README.md:114–124` |
| API | Express 5 in a long-lived Node process, serving API and optional static web export. Runtime entrypoint binds all interfaces; TLS is not terminated by this code. | `server/index.mjs:3–21`; `server/static.mjs:1–19` |
| Persistence | Node's synchronous SQLite API, WAL, foreign keys, 5-second busy timeout. Core records use JSON columns; ownership, job and ledger keys have SQL constraints/indexes. | `server/database.mjs:1–38` |
| Identity | Custom guest/email-password accounts, salted scrypt hashes, random bearer/cookie sessions, 30-day expiry. Browser uses an HttpOnly cookie; native token uses SecureStore. | `server/app.mjs:170–187,311–345,615–689`; `src/lib/api.ts:23–32,45–56` |
| Background work | Persisted evaluation-job records, in-process timers and a local working set. No external queue or durable worker lease. | `server/app.mjs:215–220,1075–1178,2109–2114` |
| Audio | Private local files with database ownership, consent gate, 10 MB body limit, five-minute signed playback capabilities and 30-day access expiry. | `server/app.mjs:597–603,1359–1506` |
| AI | One configured OpenAI text model used for assessment, solo-debate replies and optional guided drafts; a separate transcription model. Fixed provider endpoints, strict assessment/draft schemas, exact quoted-text checks. Local mode provides prompts rather than numerical scores. | `server/provider.mjs`; `server/evaluator.mjs:446–580,585–672`; `server/guided-response.mjs:151–204` |
| News | Three fixed RSS sources, bounded parser/fetch, cached metadata, source-specific HTTPS link allowlists. No arbitrary client URL fetch or article-body ingestion. | `server/news.mjs:4–15,25–96,112–232` |
| Tests | Node API/unit tests; serial Chrome Playwright product tests; separate full-stack offline-provider fixture. Assessment statistics are a separate read-only local CLI. | `playwright.config.ts:3–29`; `tests/e2e-ai.config.ts:5–48`; `scripts/benchmark-assessment.mjs:701–749` |

This is a substantial working local MVP. It is not a deployed Supabase application, a serverless backend, a live voice-call system, a validated assessor, or a production operations package. The README correctly describes the local backend and same-backend account synchronization (`README.md:7,43,87–91,159`).

## Controls worth preserving

- **Ownership at the server boundary:** session/attempt lookups include `user_id`, audio requires ownership or explicit friend-room membership, and each friend room requires membership. Private audio is not exposed by static hosting. References: `server/app.mjs:227–239,1405–1459`; `server/friends.mjs:68–79,134–139`; `server/static.mjs:1–19`.
- **Database-backed economic invariants:** unique reward source keys and transactions prevent repeated completion/retry/quest grants; garden actions validate instance identity and idempotency rather than trusting a client's displayed wallet. Preserve these invariants in SQL transactions during any migration. References: `server/database.mjs:15,18,21,42–51`; `server/app.mjs:1005–1109`; `tests/api.test.mjs:279,623`; `tests/garden-care.test.mjs:224,390,420,461`.
- **Safe saved-work boundaries:** failures retain the answer; evaluation and rewards commit together after validation; transcription uses a compare-and-swap update so a late result cannot overwrite a newer correction. Reflection is separate from assessed text. References: `server/app.mjs:908–924,1096–1132,1508–1535`; `tests/provider.test.mjs:759`; `tests/reflection.test.mjs:322`.
- **Friend debate integrity:** unique room-turn indices and per-user request keys, transactions for joins/turns, opposite seats, expected-turn checks, private audio sharing, and removal of the deleting author's text. References: `server/database.mjs:22–24`; `server/friends.mjs:141–157,217–343`.
- **Provider containment:** server-only key usage, fixed HTTPS endpoints, redirects rejected, timeout, safe error categories, no automatic paid retry loop, and an explicit retry budget for evaluations. References: `server/provider.mjs:23–106,130–225`; `server/app.mjs:1150–1177`.
- **Honest assessment scope:** local scores are forced null; delivery is N/A; missing source/opponent opportunity forces relevant N/A; server supplies model/rubric/template provenance and the unvalidated status. Exact quotation is verified against the saved response rather than trusted model offsets. References: `server/evaluator.mjs:133–228,446–580`.
- **Private-by-default guide notes:** ordinary reflection/guide notes are excluded from grading requests; only explicit draft generation sends the three selected guide answers. Draft generation neither overwrites the original response nor grants rewards. References: `server/guided-response.mjs:116–169`; `tests/reflection.test.mjs:322`; `tests/guided-response.test.mjs:157,326`; `tests/provider-flow.spec.ts:729,898`.
- **Isolated test affordances:** configured-provider fixture uses a temporary directory and a strict fake transport, not a real key or forwarded network request. The local fixture forces local coaching. References: `tests/e2e-ai-server.mjs:1–56`; `tests/e2e-ai.config.ts:33–47`; `tests/e2e-server.mjs:5–15`.

## Confirmed risks and gaps, in priority order

Priority means when to address the issue, not a claimed CVSS score. “Before public pilot” is a recommended release gate. No exploitation or user-data exposure was attempted or established.

### Release-blocking repository/build boundary

**Confirmed by the coordinating agent:** running `git rev-parse --show-toplevel` from this project returns `/Users/oliviachew`, not `/Users/oliviachew/Documents/BridgingMinds_v3`. A project-local `.gitignore` excludes local credentials/data and generated outputs (`.gitignore:33–48`), but it does not make the home-directory repository a safe project-wide publish/build context.

**Before CI, remote publication or deployment:** establish a dedicated project repository or an explicitly reviewed project-only source/build context. Never use blanket `git add`, push, home-directory archive or Docker build context. Verify the staged/source manifest and exclusion rules without scanning or publishing unrelated personal files. No broad Git status, remote-history inspection or home-directory content inventory was performed for this audit. This is a development/deployment boundary risk, not evidence that private files have been published.

### 1. Physical audio retention is opportunistic, not a deletion deadline

**Confirmed:** an expired recording is physically removed when it is requested, or during startup. There is no recurring retention worker. A long-running process can keep untouched recordings beyond 30 days. Access checks still reject expired recordings; the README accurately discloses startup/access removal, so this is not a discovered documentation contradiction. It is insufficient if a production privacy policy promises deletion by a fixed deadline.

Evidence: `server/app.mjs:1413–1418,2115–2122`; `README.md:133`.

**Refactor before public pilot:** scheduled lifecycle cleanup with bounded batches, retries, a deletion audit containing identifiers/status rather than content, and a monitored maximum deletion lag. With object storage, use lifecycle rules plus reconciliation; account deletion still needs its own reliable path. Define how backups age out. Add tests for an idle long-running service and cleanup failures; existing restart/access tests do not establish a wall-clock deletion guarantee.

### 2. Account deletion can strand recording files

**Confirmed:** the account and its cascading database rows are deleted in a transaction before file unlink. If unlink fails or the process stops between commit and unlink, the corresponding audio rows are gone and future database-driven cleanup has no paths to retry. The request can fail after account deletion has already happened. Ordinary successful deletion is tested, but this failure mode is not recovered by the code.

Evidence: `server/app.mjs:2066–2079`; foreign-key cascades in `server/database.mjs:11–24`.

**Refactor before public pilot:** create durable deletion work/tombstones in the same transaction, revoke access immediately, perform physical deletion idempotently, then mark completion. Reconcile orphaned objects/files. Do not keep a database transaction open while making remote-storage calls. Fault-inject unlink/object-delete failure and a restart after commit. Also specify device-cache and backup retention separately.

### 3. Upload limits do not verify media and are applied before authentication

**Confirmed:** `/api/audio` buffers up to 10 MB before the authentication middleware runs. The authenticated route checks declared MIME and a minimum of 16 bytes, but does not verify file signature/container or actual duration. `application/octet-stream` is accepted. The browser's 60-second cap is not a server constraint. The process synchronously writes files and synchronously reads them into provider requests. There is an aggregate IP request limit and an authenticated 20-upload/hour limit; neither is a per-account byte/storage budget.

Evidence: middleware order `server/app.mjs:550–605,668–683`; upload `1359–1402`; transcription `1461–1499`; UI limit assertion `tests/audio.spec.ts:305`.

**Risk:** memory/event-loop/disk pressure and avoidable transcription cost from requests that satisfy byte limits but violate the intended recording workflow. This is not evidence of an RCE or public-file exposure.

**Refactor before public pilot:** authenticate before accepting large bodies; stream with byte/time bounds; validate supported container/signature and decoded duration using a constrained, maintained media path; enforce per-user and service storage quotas. Put provider calls behind duration/cost budgets. Preserve private object names and membership checks. If using signed direct uploads, finalize only after ownership, size, format and duration validation; an upload URL alone is not validation.

### 4. Job recovery and solo-debate locking are intentionally single-process

**Confirmed:** worker ownership is a JavaScript `Set`; processing jobs are accepted without a conditional SQL claim; every startup unconditionally changes every `processing` job to `queued`. Timers schedule all queued work without a global concurrency cap. Solo-debate locks are also process-local. The README expressly warns against running two API processes against one database.

Evidence: `server/app.mjs:215–220,1075–1088,1138–1178,1213–1307,2109–2114`; `README.md:43,112,159`.

**Consequence under a second worker/rolling overlap:** duplicated paid requests and conflicting completion/failure updates are possible even though the reward ledger protects against repeated grants. A restart after the provider completed but before the result committed can repeat the provider call; exactly-once reward accounting does not imply exactly-once billing. Startup recovery also schedules an unbounded backlog together.

**Refactor before multi-instance deployment:** atomic queued-to-running claims, lease owner/expiry, heartbeat or bounded execution deadline, conditional completion by the lease owner, bounded concurrency/backpressure, explicit retry policy, and crash/rolling-deploy tests. Store the job and attempt transition transactionally. A single always-on pilot can keep an in-process worker if these semantics and limits are introduced; a separate queue service is not automatically required.

### 5. Abuse and paid-use limits reset with the process

**Confirmed:** request, guest/auth, evaluation/transcription and guided-draft rate buckets live in a local `Map`. Restart resets them; multiple instances each grant their own allowance. The map only prunes expired buckets after its size exceeds 10,000, not a strict bound on active keys. There is no application-wide monetary budget or persisted usage accounting. The guided-draft service does bound in-flight requests to 32 and successful cache entries to 100; evaluation lacks that equivalent concurrency cap.

Evidence: `server/app.mjs:256–279,563–564,618,628,655,1163,1362,1470`; `server/guided-response.mjs:207–215,249–288`.

**Refactor before public pilot:** choose shared/durable abuse counters and daily spend guardrails; distinguish human retry after uncertain provider outcome from guaranteed no-charge retry. Capture task, request identifier, model, token/audio usage when returned, latency, failure class and estimated cost without storing answer content in telemetry. Bound total outstanding work and reject excessive backlog with a recoverable response. Proxy IP handling must be configured for the actual deployment; there is no `trust proxy` configuration in this app, so naïvely adding a reverse proxy can collapse all users into one rate bucket. Do not blindly trust arbitrary forwarded headers.

### 6. Custom authentication has production lifecycle gaps

**Positive confirmed controls:** salted scrypt, timing-safe comparison, high-entropy session tokens stored only as hashes, expiry checks, HttpOnly/SameSite=Strict browser cookies, SecureStore for native tokens, allowed-origin checks and explicit mutation-origin/bearer requirements. These are meaningful controls, not a plaintext-password prototype.

**Confirmed gaps:** no email verification, password recovery/change flow, session-management UI, revoke-all endpoint, or recent-reauthentication gate for account deletion. Registration explicitly discloses email existence. Missing-user login skips the scrypt work used for existing users. Scrypt runs synchronously with implicit Node defaults rather than a stored algorithm/work-factor version. Upgrading a guest issues a new token without invalidating prior tokens for that guest ID; those old tokens remain valid until expiry. Logout revokes the current token only.

Evidence: `server/app.mjs:170–187,329–345,625–689,2066–2079`; `README.md:139`; `src/screens/Settings.tsx:292–339`.

**Interpretation:** these are lifecycle/hardening and availability concerns; no authentication bypass was found in the reviewed owner checks. Retaining a stolen guest token through upgrade is a concrete session-risk condition, not proof a token was stolen. Registered account recovery is a product requirement for a reliable public service.

**Decision before public pilot:** either adopt managed auth with explicit guest-upgrade/account-linking semantics, or own recovery/verification, revocation/rotation, abuse controls and password-hash versioning. Do not rebuild these alongside a database migration by accident. Preserve UUID ownership and test guest upgrade, existing-account login, logout, expiry and in-flight account switching. Never assume a managed auth user ID can simply replace all current foreign keys without a mapping plan.

### 7. The read model grows with the learner's entire history

**Confirmed:** `getState` loads and parses every attempt, computes completed calendar days from all of them, returns all attempts/journal/archive data, and is reused by home/state and garden operations. Polling a pending evaluation refreshes this state. Session/attempt idempotency scans JSON records in application code. Friend room listing fetches all rooms, then member/turn queries per room.

Evidence: `server/app.mjs:469–547,716–718,754–776,842–861,1989–2032`; `src/lib/state.tsx:52–67,161–176`; `server/friends.mjs:81–132`.

**Risk:** payload, parse/serialization time and synchronous database work scale with retained history, regardless of how small the visible screen is. There is no measured threshold proving failure at a particular user count; do not invent one.

**Refactor:** separate compact dashboard/garden state from paginated attempt/history endpoints; fetch details on demand; index idempotency keys as columns; aggregate current-week counts in a bounded query; batch friend summaries. Measure database/query time, response bytes, event-loop delay and p50/p95 at realistic history sizes before selecting capacity. SQLite may serve a small single-host pilot; unbounded queries are still unbounded after moving to Postgres.

### 8. SQLite schema evolution and JSON writes need an explicit migration boundary

**Confirmed:** initialization uses `CREATE TABLE/INDEX IF NOT EXISTS`, without a schema-version/migration registry. Some garden legacy data is normalized and written on read. Profiles, wallets, plots, sessions and attempts contain JSON documents with invariants mostly enforced by application code. The 2,142-line `app.mjs` mixes routes, identity, persistence, economy, media and worker orchestration.

Evidence: `server/database.mjs:5–38`; `server/app.mjs:423–468,469–547,1005–1178`.

**Refactor:** introduce versioned migrations and repository interfaces first. Keep stable transport contracts, domain validators and domain tests while replacing persistence incrementally. Promote ownership, status, timestamps, request keys, lease data and queried dimensions into typed/indexed columns; keep immutable feedback/source snapshots as versioned JSON where appropriate. Do not normalize every feedback sentence into relational tables. Avoid read-time migrations that could race under several instances. Test forward migration, restore, and rollback with synthetic copies before approved user-data migration.

### 9. Device drafts are scoped, not encrypted application storage

**Confirmed:** AsyncStorage contains practice drafts, guide answers and locally cached drafts under account-prefixed keys. Native auth tokens use SecureStore; the content drafts do not. Explicit sign-out/account deletion attempts clear current-owner drafts, but the session-expiry logout path only resets in-memory state. Deletion on another device cannot itself erase offline copies from this device. The client guards against late responses restoring the prior account.

Evidence: `src/lib/api.ts:15–32,101–112`; `src/lib/state.tsx:36–67,138–140`; `src/screens/Settings.tsx:297–300,336–339`.

**Interpretation:** account-prefix isolation prevents ordinary account mix-ups; it is not encryption against someone who can inspect browser/device storage. No cross-account draft disclosure was found in the normal tested flows.

**Refactor/policy:** define draft retention and cleanup on expiry/revocation, account for failed local cleanup, disclose device-only copies, and use platform-appropriate encryption if the agreed sensitivity model requires it. Keep token storage separate. Do not promise server-side account deletion instantly removes content from other offline devices or backups.

### 10. Current validation proves exact text references, not faithful meaning

**Confirmed:** the assessment validator checks schema, criterion identity, allowed levels, provenance, N/A rules and exact response quotations. The guided-draft validator checks schema, well-formed/bounded text and unique non-overlapping annotation quotes within the generated draft. The drafting prompt instructs meaning/position preservation and no invented facts, but there is no independent semantic fidelity verifier. Inputs are framed as untrusted data; that is useful instruction hygiene, not a proof of prompt-injection immunity.

Evidence: `server/evaluator.mjs:133–228,446–580,609–613`; `server/guided-response.mjs:65–107,151–204`; `shared/guided-response.mjs`.

**Keep, then extend evaluation:** retain strict schemas and literal evidence. Add a blinded human benchmark of original-to-draft meaning preservation, unsupported additions, qualifications, ambiguity, concise fragments, Singapore English/code-switching, sensitive statements, and refusal/abstention usefulness. Test injection attempts as behavior, not merely that a system message says to ignore them. The current `language: "en"` provenance is hard-coded (`server/evaluator.mjs:576`); it must not be treated as detected language or multilingual validation.

### 11. Operational evidence is absent from the repository, not disproved at the host

No checked-in deployment definition, CI workflow, backup/restore automation, retention scheduler, structured observability pipeline, load-test harness or schema migration runner was found in the reviewed files. The server entrypoint does not implement TLS, HSTS/CSP deployment policy, shared secrets, production filesystem encryption or alerting. These may exist outside this repository; this audit did not inspect hosting accounts, firewalls, disks, backups, production logs, certificates or provider account settings.

Evidence: `server/index.mjs`; `server/static.mjs`; `server/app.mjs:550–595,2085–2139`; repository configuration inventory; `README.md:145,159–161`.

**Required evidence before release:** reviewed production config, HTTPS and exact origins, trusted-proxy policy, encryption/access boundaries, restore drill with stated RPO/RTO, storage and provider spend alarms, redacted error/latency metrics, incident ownership, and graceful worker shutdown/recovery. The public health endpoint reports configuration and deliberately says `liveVerified: false`; it is not a readiness check of actual provider access or successful background processing (`server/provider.mjs:79–106`; `server/app.mjs:606–613`).

### 12. Dependency findings need path-specific remediation

The coordinating agent's 1 November `npm audit --omit=dev` found **17 affected packages: 6 high, 9 moderate, 2 low, 0 critical**. This is not 17 independent vulnerabilities and not a claim that every advisory is reachable in the API. Confirmed installed paths include Expo Router → `query-string@7.1.3` → `decode-uri-component@0.2.2`, and Expo CLI → `zod@3.25.76`. The backend's direct Zod is **4.6.7**, above the cited `<4.6.6` range. Expo tooling appears in the production dependency tree because Expo is an application dependency; that does not mean Express imports all of it.

**Action:** resolve SDK-compatible advisories against the exact deployed bundle/runtime and retest. Keep malformed-URL rejection at the API/static boundary (`server/app.mjs:550–559`), but do not claim it closes every Router decoding issue. Do not use forceful upgrades/downgrades that break the SDK merely to clear the audit count. The agent did not apply fixes. Treat advisory status as time-sensitive release evidence.

## Keep / refactor / replace decision

| Component | Decision | Why and boundary |
| --- | --- | --- |
| Expo/React Native client and Router | Keep | Existing cross-platform product and substantial browser coverage. Native release/device work remains separate. No backend finding justifies a frontend rewrite. |
| Express API and domain contracts | Keep; extract services | Owner checks, error semantics, immutable attempts and reward contracts are valuable. Split routing, auth, media, jobs, garden and practice orchestration without changing user flows. |
| SQLite for local/offline development | Keep | Useful isolated tests and local operation. Maintain parity tests if production persistence changes. |
| Production database | Conditional migration | Managed Postgres can address managed persistence/backup/multi-instance needs. It does not establish application-level atomicity, efficient queries, correct auth or semantic validity. A single-host pilot remains possible after critical controls. |
| Custom identity | Replace with managed auth if chosen production plan supports guest upgrade; otherwise deliberate hardening | Recovery, verification, revocation and abuse are currently owned by this app. Preserve account mapping and access tests. |
| Local media filesystem | Keep locally; replace for scalable deployment | Private object storage with lifecycle/reconciliation avoids per-host persistence coupling. Retain validated uploads and authorization before issuing playback capabilities. |
| Worker timers / process-local locks | Refactor before scaling | Durable claim/lease semantics and bounded concurrency are mandatory. Add an external queue only when workload/operations justify it. |
| Reward ledger / garden transactions | Keep | Good economic invariants. Port unique keys and transaction guarantees, not just table contents. |
| Provider wrapper | Keep boundary; extend telemetry and task configuration | Fixed transport, sanitized failures and test injection are useful. Do not introduce a model-routing framework before measured model/task evidence. |
| Assessment and generated-draft validators | Keep | Necessary structural and exact-text controls. They do not replace human semantic/educational evaluation. |
| Benchmark CLI and contract tests | Keep; add a separate rewriting/transcription study | Current numerical agreement tooling is meaningful for its declared scale and task, not the new brief's entire benchmark. |
| RSS subsystem | Keep technically; review product rights before commercialization | Fixed bounded feeds are safer than arbitrary URL ingestion. README currently scopes CNA/NPR usage to personal/noncommercial reading (`README.md:59`); public/commercial rights must be settled separately. |

## Verification coverage and its limits

### What the current tests establish

| Area | Concrete existing evidence |
| --- | --- |
| Auth/ownership/export/deletion | `tests/api.test.mjs:356,896,937`; cross-user denial, private audio, cookie/origin/expiry behavior, successful cascading deletion and static-serving boundary. |
| Duplicate requests and economic integrity | `tests/api.test.mjs:279,564,623`; `tests/garden.test.mjs:273`; `tests/garden-care.test.mjs:390,420,461`; `tests/friends.test.mjs:183,586`. |
| Worker/provider failures | `tests/api.test.mjs:517`; `tests/provider.test.mjs:314,349,375,430,490,759,923`; retained answers, retry caps, restart, safe errors and late transcription. These are not multi-worker lease tests. |
| Assessment output boundary | `tests/assessment.test.mjs:349,401,437,475,606,643,701,728`; exact Unicode evidence, strict schema, malformed/refused/truncated output, safe legacy maps. |
| Explicit guided drafts | `tests/guided-response.test.mjs:157,218,273,326,370,410,505,549`; ownership, no reward mutation, cache/in-flight bounds, no-reflection payload, invalid output and account revocation. |
| Friend feature | `tests/friends.test.mjs:94,183,277,331,371,445,523,586,663,722`; `tests/friends.spec.ts:50,452,575`; private sharing, ordering, uncertainty recovery, close/expiry, account isolation and saved drafts. |
| Garden lifecycle | `tests/garden-care.test.mjs`; `tests/garden-lifecycle.spec.ts:144,296,425`; timing, archive/restore/dead state and failed-refresh recovery. |
| Audio and product UI | `tests/audio.spec.ts:27,305,428`; `tests/self-reflection.spec.ts:23`; `tests/product-flow.spec.ts:122,251`; `tests/thought-guide.spec.ts:142`; saved/corrected transcripts, notes, revisions, persistence and account isolation. |
| Full-stack configured-provider path | `tests/provider-flow.spec.ts:169,248,301,384,525,729,898,1265,1437,1582`; real Express/SQLite/browser with synthetic transport, including quote errors, reading/debate, drafting, transcription and friend sharing. |
| News | `tests/news.test.mjs`; `tests/news.spec.ts:11,183`; timestamps/timezones, midnight, no fabricated fallback, bounded RSS and safe links. |
| Motion and returning state | `tests/motion.spec.ts:118,191`; `tests/state.spec.ts:30,103`; `tests/returning.spec.ts:98,251`; reduced motion, day rollover and unvalidated-comparison exclusion. |

The default browser configuration uses one worker and does not establish throughput/concurrent-user capacity (`playwright.config.ts:9–10`). Fake microphone and desktop Chrome prove browser plumbing, not speech-recognition quality, genuine accents/noise, iOS/Android permissions/backgrounding, assistive-technology usability or hardware playback. Historical screenshots and pass counts in `docs/qa-results.md` are dated evidence rather than one current all-platform test result.

There is small documentation drift worth correcting when this evaluation is accepted: `README.md:108` says the build has not been tested against a paid provider account, whereas `docs/ai-setup.md:39` and dated QA entries record bounded synthetic live integration checks. Also, `README.md:112` describes all mismatched quote offsets as rejected, while the current validator safely realigns a unique literal quote. Neither live integration success nor safe realignment establishes semantic accuracy. Use the current source and specifically dated test records when making capability claims.

### What the numerical benchmark actually does

`scripts/benchmark-assessment.mjs` accepts a local, versioned, human-rated dataset and distinguishes synthetic demonstration data. It reports per-mode/per-criterion QWK, exact/within-one agreement, MAE, signed error, severe-error rate, coverage, missing cells/references, applicability and evidence-audit counts; independent human pair agreement is separate from the adjudicated reference. Deterministic participant-cluster bootstrap intervals include undefined/degenerate-case handling. Inputs have score, version, annotation and work bounds. References: lines `17–31,87–183,288–370,399–513,515–627,630–749`; tests `tests/assessment-benchmark.test.mjs:81–594`.

It does **not** call or compare live models, verify annotation provenance, detect cross-file holdout leakage, establish fairness or semantic fidelity, measure model cost/latency, score transcription, prove educational transfer, or validate the product. Its own report discloses these limits (`scripts/benchmark-assessment.mjs:676–696`). No new human study was run in this audit, and this review did not access user responses as benchmark material.

For the architecture brief, extend the evaluation program with consented/synthetic challenge cases and independent human judgments of meaning preservation and unsupported additions. Keep recognition accuracy/semantic transcription errors, draft fidelity, reasoning-feedback usefulness, latency, failure rate and spend as separate metrics. Include fragments, ambiguity, incomplete reasoning, Singapore English, code-switching and sensitive communication. Use paired model outputs against the same cases, blinded review and held-out users/prompt families. Do not select a “best” model from the existing offline mocks or a small successful live integration check.

### Missing critical verification before public operation

1. Fault-injected physical deletion, retention scheduling, orphan reconciliation, and backup/restore drills.
2. Two-process job claims, lease expiry, rolling deployment, failure after provider completion, shutdown during work, and reward/cost accounting under those failures.
3. Upload format/duration rejection, storage budgets, authenticated large-body handling, and load tests with long histories plus pending evaluations.
4. Auth recovery/verification and guest-upgrade session rotation for the chosen identity service; exact reverse-proxy/TLS/secure-cookie deployment behavior.
5. Human semantic/assessment/transcription study and real-device accessibility/audio testing. Existing test fixtures cannot supply that evidence.
6. Reproducible CI with lint/typecheck, current API tests, a bounded browser subset, full release browser coverage, dependency review, migration checks and secret-safe build environments. No pipeline should invoke live paid AI by default.

## Migration sequence that protects existing work

1. **Record current contracts.** Freeze IDs, ownership, source snapshots, separate reflections/guide notes, exact saved text, reward ledger semantics, friend participation and garden instance/timer behavior. Keep the existing API/browser tests as acceptance criteria.
2. **Fix safety semantics before infrastructure.** Add durable deletion work, media admission controls, job leases/backpressure and resource budgets. Add fault tests using isolated data. These changes remain useful on either SQLite or managed Postgres.
3. **Extract persistence boundaries.** Separate identity, practice, jobs, economy/garden, media and friends repositories from HTTP handlers. Introduce versioned migrations. Preserve public response shapes while testing the new store against the existing domain suite.
4. **Approve a mapping and cutover plan.** If moving to managed services, map every existing user ID to the new auth subject, preserve all FK/JSON references, transfer media with an integrity manifest, retain original timestamps/model/rubric/template versions, and reconcile counts/ledger totals. Do not silently re-score historical answers or reset gardens. Password migration needs a deliberate compatibility/reset strategy; do not export hashes into an incompatible format and assume login will work.
5. **Rehearse on synthetic data first.** Test migration, restore and rollback, including interrupted transfer, unavailable storage and an old client talking to the new API. Use one authoritative writer during cutover; uncontrolled dual writes can duplicate rewards or lose revision links.
6. **Measure before broadening.** Establish observable p50/p95, history-size response budgets, queue depth/wait, deletion lag, error rate and cost per task. Then scale instance count with verified claims/shared limits. No user-count capacity guarantee is supported by the present repository alone.

No runtime change, deployment choice or migration was executed as part of this audit.
