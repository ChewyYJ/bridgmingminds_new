# BridgingMinds — Architectural decision records

Date: 1 November 2026. Status of every record: **recommended, not implemented**. The architecture has been evaluated; model quality, deployment entitlements, capacity and recovery targets still have explicit verification gates. These records preserve the existing product and audience.

Read with the [technical review](review.md), [repository audit](repository-audit.md), [infrastructure evidence](stack-infrastructure.md), [model research](ai-models.md) and [benchmark design](benchmark-design.md). Published vendor capabilities are evidence about available mechanisms, not evidence of BridgingMinds quality or production readiness.

## ADR-001 — Refactor incrementally

- **Context and requirements:** Working practice, recordings, drafts, friend debates and garden state must survive. Ownership, transaction and recovery tests already encode useful behaviour.
- **Alternatives:** Incremental refactor; replacing selected persistence/auth boundaries; full client/server rewrite.
- **Criteria:** Data preservation, regression exposure, team effort, reversibility and resolution of observed risks.
- **Decision:** Incremental refactor with bounded replacement of production persistence, identity and media storage. Keep product flows and API behaviour while extracting modules.
- **Evidence:** The [audit](repository-audit.md) identifies specific operational defects rather than a fundamental UI/framework mismatch; all 149 isolated backend tests passed during this review.
- **Trade-offs:** Temporary adapters and migration work are unavoidable; retaining code also retains debt until it is deliberately removed.
- **Risks:** Changing auth, data and client state together can conceal ownership or recovery regressions. Existing tests do not establish cloud/native readiness.
- **Revisit when:** Measured limitations cannot be addressed behind existing boundaries, or maintaining compatibility demonstrably costs more than an isolated replacement. New framework popularity is insufficient evidence.

## ADR-002 — Keep Expo and React Native

- **Context and requirements:** Mobile-first audio, gestures, accessible controls and web access already share components. The installed major is Expo 57.
- **Alternatives:** Expo/React Native; Next.js/React web; plain React SPA; Flutter.
- **Criteria:** Reuse, native capabilities, maintainability, accessibility, device performance and delivery effort.
- **Decision:** Retain Expo 57, React Native, TypeScript and Expo Router. Gradually replace central catch-all screen selection with explicit route files and split oversized screens outside route modules. Retain platform-specific recording/storage paths.
- **Evidence:** [SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/), the [Expo documentation index](https://docs.expo.dev/llms.txt) and the [current implementation audit](repository-audit.md). No measured rendering bottleneck requires another framework.
- **Trade-offs:** Shared implementation does not remove separate browser and native testing. SSR is not added to the authenticated practice application.
- **Risks:** Web success can mask microphone, backgrounding, secure-storage and accessibility defects on devices; route extraction can break recovery URLs.
- **Revisit when:** Device profiling establishes an unresolvable platform limitation or an explicitly approved distribution change makes native sharing unnecessary.

## ADR-003 — A typed Express modular monolith

- **Context and requirements:** The server is Express/JavaScript, with intertwined HTTP, domain and persistence code. Hosted inference is mainly network I/O.
- **Alternatives:** Node/TypeScript/Express; Fastify; Python/FastAPI; per-route functions; domain microservices.
- **Criteria:** Existing behaviour, type/contract reuse, operational simplicity, latency sources and incremental migration effort.
- **Decision:** Keep Node 24 as the initial runtime baseline and Express 5; introduce TypeScript services/repositories and shared Zod contracts. Organise identity, practice, assessment, jobs, audio, friends, garden and content inside one codebase and deployment artifact.
- **Evidence:** [Repository audit](repository-audit.md) and [backend comparison](stack-infrastructure.md). Changing languages cannot remove hosted-model latency; unbounded reads, synchronous work and concurrency have concrete fixes.
- **Trade-offs:** TypeScript requires a build pipeline and does not validate untrusted input automatically. Express leaves service conventions to the team.
- **Risks:** A superficial file split can preserve coupling. Synchronous crypto/filesystem calls remain blocking until replaced or removed.
- **Revisit when:** A Python-specific processing dependency or independently measured scaling/ownership requirement warrants a bounded worker/service. Do not split services simply to match domain names.

## ADR-004 — Managed PostgreSQL through Supabase

- **Context and requirements:** Data has ownership, membership, ordered turns, rewards and idempotency constraints. Production must survive disposable hosts and overlapping deployments.
- **Alternatives:** Current SQLite with persistent disk; Supabase PostgreSQL; separate managed PostgreSQL; Firebase/Firestore.
- **Criteria:** Transactions/constraints, operational burden, regional availability, portability, migration cost and query patterns.
- **Decision:** Supabase Pro PostgreSQL in the specific Singapore region. Keep authoritative writes behind the server, preserve relational constraints, and use versioned JSONB for payloads that are genuinely documents. Use typed/indexed columns for ownership, status and query keys.
- **Evidence:** [Regions](https://supabase.com/docs/guides/platform/regions), [pricing](https://supabase.com/pricing), existing constraints in the [audit](repository-audit.md). Firestore would require a different read/constraint design without an established benefit.
- **Trade-offs:** This is a query and transaction migration, not a connection-string change. Compute, allocated disk, egress and backups require separate sizing.
- **Risks:** Service-role access bypasses RLS; enforce scoped queries and least privilege. SQLite-only tests can diverge from PostgreSQL semantics, so PostgreSQL integration tests become a release gate.
- **Revisit when:** Procurement, residency, availability or measured costs favour another standard PostgreSQL operator. Reconsider the data model only when access patterns substantively change.

## ADR-005 — Managed identity with stable application IDs

- **Context and requirements:** Custom auth lacks a complete verification/recovery lifecycle; existing guest ownership and local drafts must survive migration.
- **Alternatives:** Extend custom credentials; Supabase Auth; a separate identity provider. For web: browser-readable tokens versus an HttpOnly backend-for-frontend.
- **Criteria:** Recovery/security lifecycle, migration correctness, operator burden, web/native compatibility and minimal token exposure.
- **Decision:** Supabase Auth with a unique mapping to stable application user IDs. Preserve a same-origin HttpOnly/Secure web session boundary through an explicit BFF adapter; retain SecureStore-backed native credentials and tested refresh/revocation. Rotate old sessions at upgrade/cutover.
- **Evidence:** [Supabase auth integration caveats](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [production SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp) and [migration analysis](stack-infrastructure.md). The default browser refresh-token integration is not the proposed HttpOnly-only design.
- **Trade-offs:** BFF session/refresh handling still needs implementation and tests; managed Auth does not eliminate application authorisation.
- **Risks:** Existing scrypt hashes are not a verified compatible import. Use a controlled verification/reset/linking path; guard guest mapping, account switches, refresh races and destructive-action reauthentication.
- **Revisit when:** Institutional SSO, procurement or account lifecycle requirements cannot be met economically. Preserve the identity mapping so a provider change does not change domain ownership.

## ADR-006 — Paid Render Singapore hosting

- **Context and requirements:** Express serves the web export and API, with durable work currently performed by a long-lived process. A small team needs simple operations.
- **Alternatives:** Render; GCP Cloud Run; Vercel; AWS ECS/Fargate/Lambda; Cloudflare Workers.
- **Criteria:** Compatibility with existing execution, region, predictable baseline cost, deployment effort, observability and operational skills.
- **Decision:** Begin with a paid always-on Render Singapore Node service and colocated Supabase region. Serve web/API under one origin. Use the same artifact for a separate worker when measurements justify it. Isolate the project repository/build context before deployment.
- **Evidence:** [Render regions](https://render.com/docs/regions), [pricing](https://render.com/pricing), [comparative regional costs](stack-infrastructure.md). Cloud Run is a credible alternative but request-based background work needs explicit dispatch. AWS App Runner is [closed to new customers](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html).
- **Trade-offs:** Fixed idle compute and cross-provider egress; fewer infrastructure controls than a bespoke cloud deployment.
- **Risks:** A $25 service is not a 10,000-MAU capacity guarantee. Rolling overlap requires job leases and shared limits. Singapore hosting does not imply all AI, email or telemetry stays there.
- **Revisit when:** Load tests, traffic intermittency, team cloud expertise, availability objectives or customer networking requirements make another host materially better. Keep HTTP/container boundaries portable.

## ADR-007 — Private object storage and durable deletion

- **Context and requirements:** Local audio must remain private and expire after 30 days; current cleanup and account deletion can strand files.
- **Alternatives:** Local persistent filesystem; private Supabase Storage; another object store; public media hosting.
- **Criteria:** Ownership enforcement, expiry/deletion reliability, host independence, cost and operational simplicity.
- **Decision:** Private Supabase Storage, authenticated admission, constrained signed uploads, quarantine/finalisation and container/duration/size validation. Issue short-lived playback capabilities only after current ownership/membership checks. Maintain deletion tombstones outside cascading user rows and retry/reconcile physical deletion.
- **Evidence:** [Observed deletion/upload faults](repository-audit.md), [storage and recovery design](stack-infrastructure.md), [database backup scope](https://supabase.com/docs/guides/platform/backups).
- **Trade-offs:** Signed URLs are bearer capabilities until expiry; direct uploads introduce orphan and finalisation paths. Database backup does not back up audio bytes.
- **Risks:** Expiry metadata alone cannot prove bytes were removed. Account deletion must fence in-flight jobs and stop API access/new URLs immediately; issued media URLs can remain usable until expiry or verified object removal. Keep a minimal protected deletion ledger outside the restored snapshot, covering later deletions throughout the backup horizon, and replay it before serving restored data.
- **Revisit when:** Measured traffic or recovery obligations justify a separate object provider/copy. Any additional copy must honour retention/deletion and have an explicit access policy.

## ADR-008 — Deterministic controls and one language call per task

- **Context and requirements:** Assessment, guided drafts and debate require language interpretation; permissions, rewards, evidence checks and persistence do not.
- **Alternatives:** One text model; different models by task; small-first escalation; deterministic/LLM hybrid; multi-step interpretation/critic pipelines; autonomous agents.
- **Criteria:** Meaning preservation, quality evidence, latency, failure surface, cost and auditability.
- **Decision:** Use the deterministic/LLM hybrid. Each language task has a bounded prompt/config and ordinarily one call, followed by deterministic validation. STT is separate. Permit clarification/abstention through the existing flow rather than forcing invented completeness. No autonomous agents or automatic critic pass.
- **Evidence:** [Current prompt/output controls](repository-audit.md), [architecture comparison](review.md) and [benchmark plan](benchmark-design.md). No local experiment demonstrates that extra language passes improve the product sufficiently.
- **Trade-offs:** Rules can verify structure/quotes, not semantic fidelity. Human review remains necessary to qualify models.
- **Risks:** Exact quotations can accompany incorrect interpretations; a polished draft can alter intent. Never let the LLM authorise access, grant rewards or certify learner ability.
- **Revisit when:** Controlled held-out tests show task-specific models or an extra pass outperform a stronger single call after latency, cost and subgroup harms are counted.

## ADR-009 — Conditional model selection and bounded fallback

- **Context and requirements:** The existing OpenAI transport works under mocked contracts, but no comparative BridgingMinds quality benchmark has been completed.
- **Alternatives:** Keep Luna; switch to a larger OpenAI model; Claude/Gemini; hosted open weights; self-hosted GPUs.
- **Criteria:** Meaning preservation and safety gates first; then local language handling, schema success, latency, cost, terms and maintainability.
- **Decision:** Keep `gpt-6-luna` as the implementation baseline and `gpt-transcribe` for transcription. Benchmark Luna, `gpt-6.1-terra`, `claude-haiku-5-5` and the specified Gemini challenger. Terra is the first same-provider fallback candidate, **disabled until qualified**. Cross-provider failover also needs approved data terms and notice/consent design.
- **Evidence:** Official specifications, prices and unresolved policies in [model research](ai-models.md); held-out selection gates in [benchmark design](benchmark-design.md). None is declared the quality winner.
- **Trade-offs:** Qualification takes human effort. Same-provider fallback is simpler but does not protect against a provider-wide outage. Preserve saved work and offer retry/unscored local practice during unresolved outages.
- **Risks:** New model IDs can reject existing parameter heuristics; a lost response can still incur a charge. Use explicit capability profiles, a total deadline/spend cap and at most one eligible recovery attempt. Do not bypass safety refusals by switching providers.
- **Revisit when:** Held-out results, drift, deprecation, pricing, contract terms or measured quota/latency changes warrant a versioned change. Re-test instead of silently changing aliases.

## ADR-010 — PostgreSQL job leases before an external queue

- **Context and requirements:** Saved attempts survive restart, but current process-local claims cannot coordinate workers safely. Completion and rewards must stay atomic.
- **Alternatives:** Local timers; transactional PostgreSQL jobs; Redis-based workers; managed queues/workflows.
- **Criteria:** Recovery semantics, existing infrastructure, bounded concurrency, idempotency and operational effort.
- **Decision:** Persist queued work with lease owner/expiry, retry count, next-run time, version and safe failure codes. Claim transactionally; heartbeat and fence stale completion; reclaim only expired leases. Commit validated result and reward together. Maintain shared user/service quotas and provider spend limits.
- **Evidence:** [Worker/restart findings](repository-audit.md) and [proposed request flow](review.md). PostgreSQL is already selected, and throughput has not justified another service.
- **Trade-offs:** The team owns lease/retry correctness and scheduling fairness. A queue library does not itself supply business idempotency.
- **Risks:** Duplicate provider charges remain possible after uncertain timeouts; do not claim exactly-once external execution. Do not hold DB locks during inference. Deletion/cancellation must fence final writes.
- **Revisit when:** Measured backlog, scheduling requirements, provider concurrency or operational maintenance exceeds this design. Introduce an external queue without changing authoritative domain transactions.

## ADR-011 — Redacted observability and explicit recovery objectives

- **Context and requirements:** Failures, deletion lag and costs need visibility without making private learner content a default log stream.
- **Alternatives:** Host-only logs; OpenTelemetry plus host tools/Sentry; full-content model tracing; a custom monitoring platform.
- **Criteria:** Actionable diagnostics, privacy, operator effort, cost controls and recovery evidence.
- **Decision:** Structured redacted logs, server OpenTelemetry traces/metrics and scrubbed Sentry client errors. Record task/model/version, usage, timing, failure codes and correlation IDs. Alert on failure rate, job age, deletion lag, spend and capacity. Define RPO/RTO and rehearse restoration before rollout.
- **Evidence:** [OpenTelemetry JavaScript status](https://opentelemetry.io/docs/languages/js/), [backup limitations](https://supabase.com/docs/guides/platform/backups), [data-flow risks](review.md).
- **Trade-offs:** Content-free logs can make some quality faults harder to reproduce; use explicitly permitted, protected examples rather than blanket logging. Sampling and vendor quotas limit retention.
- **Risks:** IDs and signed URLs can still be personal data or capabilities. Scrub them appropriately; disable sensitive replay. Daily backups allow a loss window approaching 24 hours; an RTO target is not an achieved restore time.
- **Revisit when:** Required incident response, recovery objectives or traffic exceed included tooling. Add PITR or object recovery only with an explicit policy and tested deletion replay.

## ADR-012 — Shared contracts, evidence-based AI release gates and staged migration

- **Context and requirements:** Existing backend/browser tests are valuable, but mocks cannot establish model quality, device behaviour or PostgreSQL correctness.
- **Alternatives:** Replace the test stack; trust provider benchmarks; introduce a vendor-specific evaluator; retain and extend portable tests and human-labelled cases.
- **Criteria:** Regression detection, reproducibility, meaning preservation, independence, team effort and credential isolation.
- **Decision:** Keep Node tests/Playwright, add shared versioned API schemas, PostgreSQL migration/concurrency tests and native accessibility/audio checks. Design a local provider-neutral runner with sealed human-labelled cases; paid live runs are explicit and budgeted. Gate model changes on hard safety/fidelity checks and measured uncertainty, not a weighted score alone.
- **Evidence:** [Actual check results](repository-audit.md), [benchmark protocol](benchmark-design.md). The current ordinal benchmark is useful scaffolding, not proof of accurate evaluation.
- **Trade-offs:** Human annotation and device testing cost time. CI cannot reproduce every provider/account or network condition.
- **Risks:** Holdout leakage, synthetic-only cases and aggregate scores can hide failures. Keep participant/prompt-family separation, language slices and provenance. Do not relabel mock results as live performance.
- **Revisit when:** Failure evidence identifies missing coverage or dataset shifts invalidate a benchmark; revise/version the test design before comparing new results.

**Migration gate:** Use synthetic rehearsals first, then an authorised protected export; preserve IDs, originals, versions, friend order and reward invariants. Use one authoritative writer at cutover, reconcile before reopening writes, retain backward-compatible schema during overlap, and do not restore an old snapshot over new writes without reconciliation. No production migration, paid benchmark or runtime change was performed as part of these records.
