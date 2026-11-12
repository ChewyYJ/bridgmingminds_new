# Stack, infrastructure and operating-cost review

Research date: 1 November 2026. Currency: USD, excluding taxes. Audience: a small team serving students and early-career adults in Singapore. This is a proposed production architecture, not a claim that cloud deployment or native release has already happened. No runtime code, credentials, cloud accounts or user data were changed for this review.

## Recommendation

Keep **Expo 57 / React Native / Expo Router**, keep **Node.js and Express**, and turn the existing server into a **TypeScript modular monolith**. Deploy an always-on Node service in **Render Singapore**, with **Supabase Pro in Singapore** for PostgreSQL, managed authentication and private audio storage. Preserve the current same-origin web API and cookie boundary. Keep the worker in the same codebase; use transactional PostgreSQL job claims, then run a separate worker process when isolation or throughput warrants it.

This recommendation prioritises preservation of working product behaviour and a small operational surface. It does not claim Render is the cheapest at every traffic level. Cloud Run is the strongest alternative for a team already comfortable with GCP IAM, container delivery and request-driven job dispatch. Rewriting the UI in Next.js or Flutter, or the API in Python, would not solve the current persistence, account recovery or worker-durability gaps.

The modelled recurring infrastructure floor, including production email but excluding AI, is about **$70/month at 30–100 MAU**, **$71 at 500**, **$79 at 1,000**, and **$223 at 10,000** with twelve months of retained history. These are pricing calculations, not measured capacity guarantees. A more operationally provisioned 10,000-user scenario is about **$425/month**, described separately below.

## What is actually present

| Area | Repository evidence | Consequence |
| --- | --- | --- |
| Client | `package.json`: Expo `~57.0.31`, React 19.2.3, React Native 0.86.3, TypeScript, React Native Web, Expo Audio, SVG, Reanimated | A substantial universal UI exists. Preserve its audio, gestures, accessibility, reduced-motion and native branches. |
| Routing | `main` is `expo-router/entry`; `src/app/_layout.tsx` provides the shell. Index and catch-all routes re-export `App.tsx`; the latter switches on pathname and pushes routes | Expo Router is installed and used, but route ownership remains centralised. Extract real route files incrementally, preserving URLs and state recovery. |
| Web | `app.json` uses `web.output: single`; `server/index.mjs` serves the export through `server/static.mjs` | An SPA and API can share an origin. SSR is not required for the authenticated practice experience. |
| API | Express 5.3, ESM `.mjs`, Zod; most routes and domain operations live in `server/app.mjs` | Keep Express; split domains and repositories before changing infrastructure. TypeScript is an incremental migration, not the current server implementation. |
| Database | `server/database.mjs` uses synchronous `node:sqlite`, WAL, foreign keys and transactions | Valid for a local/single-node pilot; not shared storage for multiple disposable instances. A PostgreSQL migration requires query/transaction work, not a connection-string swap. |
| Invariants | Unique reward sources, unique attempt jobs, friend-room turn indices/request keys, garden-operation keys | These protections must survive migration. Managed infrastructure cannot replace application idempotency. |
| Authentication | Custom scrypt password hashing and opaque server sessions; browser cookies, native bearer stored through SecureStore | Production verification/recovery and auth migration need explicit design. Do not replace the web boundary with localStorage tokens by accident. |
| Audio | Local filesystem plus database metadata; transcription constructs multipart FormData in `server/app.mjs` | Move bytes to a private bucket. The worker still sends audio bytes to STT unless a provider explicitly supports fetching a signed URL. |
| Local work | Owner-scoped AsyncStorage drafts and extensive practice/friend recovery paths | Preserve ownership keys and cross-account guards; do not upload private thought-guide notes merely because a cloud database exists. |
| Operations | No deployment manifest or `eas.json` found in the inspected project configuration | Production deploy, backup restore and native release remain work to do. Existing tests are useful evidence of behaviour, not proof of cloud capacity or native-device coverage. |

The Expo version and [matching SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) were checked alongside the [documentation index](https://docs.expo.dev/llms.txt). Expo explicitly supports self-hosting and third-party hosting of web exports; its recommended EAS host is an option, not a requirement to rewrite the current server. [Expo web deployment](https://docs.expo.dev/guides/publishing-websites/)

## Frontend and server alternatives

These are engineering judgments about this repository and team, not benchmark rankings.

| Choice | Useful strengths here | Cost or limitation here | Decision |
| --- | --- | --- | --- |
| Expo / React Native / Router | Existing reusable mobile UI, recording, secure native storage, SVG garden and gestures; web pilot and native path share implementation | Browser semantics and native devices still need separate verification; catch-all routing and large screens need modularisation | **Keep.** Make route files explicit and retain platform-specific audio code. |
| Next.js / React web | Strong fit for public content, metadata, server rendering and web-only acquisition pages | Would not provide the native client automatically; replacing RN screens duplicates or rewrites much of the product | Optional small marketing/content surface later. No practice-app rewrite. [Next.js docs](https://nextjs.org/docs) |
| Plain React web | Straightforward DOM and browser tooling | Gives up the current native sharing advantage without fixing backend reliability | Consider only if the product deliberately becomes web-only after validation. |
| Flutter | Viable mobile and interactive web toolkit | Dart migration and component, recorder, gesture, persistence and test rewrites; no identified required feature that Expo cannot provide | Do not migrate. Flutter itself distinguishes app-like web experiences from document-centric web content. [Flutter web FAQ](https://docs.flutter.dev/platform-integration/web/faq) |
| Node + TypeScript + Express | Existing code, Zod/shared contracts and tests; provider calls are predominantly network I/O | Synchronous password hashing and SQLite currently block the event loop; the server is too concentrated | **Keep Express and modularise.** Move to async DB access; managed auth removes password-verification work from this process. |
| FastAPI | Python typing and ecosystem; good if future research needs Python-specific processing | Requires a second language/runtime or full rewrite; moving network calls to Python does not make the model respond faster | Add a bounded Python worker only when a concrete library requires it. FastAPI still needs restarts, replication and process/memory planning. [Deployment concepts](https://fastapi.tiangolo.com/deployment/concepts/) |
| Stateless functions | Scale down when idle; convenient preview deployments | Existing filesystem, process-local counters and polling worker cannot simply be copied into functions | A valid deployment model after externalising state and dispatching durable jobs. Not a reason to rewrite framework or domain logic. |

Suggested modules: identity, practice/sessions, assessment/provider adapters, jobs, audio, friend rooms, garden/rewards, journal and content. Each has a service boundary and repository interface inside one deployable application. Keep one shared schema package for API validation and client types. Do not add microservices, Kubernetes, a vector database or Redis merely because the app uses AI. Add a shared rate limiter only when multiple API replicas make process-local limits insufficient; PostgreSQL can cover modest initial limits and job claims.

## Database, storage and authentication choices

| Option | Fit | Decision |
| --- | --- | --- |
| PostgreSQL + Supabase | Relational transactions and constraints match rewards, attempts, ownership, friend turns and deletion. One provider offers database, identity and private object storage | **Preferred.** Keep authoritative writes through the application. Use JSONB for versioned feedback payloads and typed/indexed columns for ownership, timestamps, status and idempotency. |
| Firebase Auth + Firestore | Managed identity, offline/mobile integration and realtime listeners are useful | Firestore can implement transactions, but the present relational constraints need redesign. Read/index/listener billing requires access-pattern modelling; MAU alone cannot price it. Existing REST/offline drafts do not require a Firestore rewrite. |
| SQLite on one persistent host | Smallest immediate change and excellent local development fit | Single-node availability, disk backup/restore, write contention and multi-instance jobs remain the team's responsibility. A paid persistent disk is not a recovery plan. Keep for local development or an explicitly disposable pilot. |
| Plain managed PostgreSQL + separate auth/object providers | Portable, with independent vendor choice; more integrations and billing surfaces | Revisit if institutional procurement, availability or data-transfer requirements rule out Supabase. |

Firebase's published free quotas include 50,000 Identity Platform MAU for ordinary auth; phone SMS is separately priced. Firestore Standard offers one free database with 1GiB, 50,000 reads/day and 20,000 writes/day, then location-dependent metering. Backups/PITR are not free-tier features. These are component allowances, not a forecast that the whole Firebase app costs zero. [Firebase pricing](https://firebase.google.com/pricing), [Firestore pricing](https://cloud.google.com/firestore/pricing)

Select Supabase's **specific Singapore region `ap-southeast-1`**, not merely a broad APAC preference. Co-location reduces an avoidable region mismatch, but same city does not mean free cross-provider traffic, a private connection or complete Singapore-only processing. Telemetry, support and downstream AI processing require a separate data-flow review. [Supabase regions](https://supabase.com/docs/guides/platform/regions), [data residency and transfers](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)

### Preserve the auth boundary deliberately

For web, retain a same-origin backend-for-frontend: the browser holds a Secure, HttpOnly, SameSite cookie; the server handles identity verification and refresh, and checks Origin/CSRF on mutations. Keep private responses and `Set-Cookie` responses out of shared caches. A dedicated server-side Supabase client must be scoped to a request/session, not a global mutable user client. Managed Supabase Auth does not automatically make existing Express sessions safe.

The usual `@supabase/ssr` cookie integration is a different design: its browser client needs access to refresh tokens and the documentation does not promise HttpOnly cookies. Do not copy that example while claiming to retain an HttpOnly-only browser boundary. Choose and test the BFF adapter explicitly. Native should retain SecureStore-backed credentials, revocation handling and foreground refresh; OAuth, if introduced, needs PKCE/deep-link verification. [Supabase server-side auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

Existing hashes are custom scrypt; documented Supabase imports support bcrypt/argon2. Do not bulk-copy these hashes into a bcrypt column. Plan a verified account migration/reset or a carefully bounded first-login migration, preserve user-ID/guest ownership mappings, revoke old sessions at cutover, and test drafts/history/friend rooms before launch. [Supabase migration guidance](https://supabase.com/kb/guides/migrate-from-auth0)

Configure production SMTP, verified sending domain and recovery redirects. Supabase's built-in sender is explicitly for exploration and restricts recipients; it is not the production email service. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

### Audio and jobs

Issue short-lived signed upload/download URLs only after ownership checks. Use random server-assigned keys, bounded MIME/size validation, upload finalisation and orphan cleanup. Only a successful, explicit friend-turn attachment should grant the other participant playback access. Signing a URL must not broaden room access. Recheck deletion/expiry on new URLs; a signed URL remains a bearer capability until expiry.

A PostgreSQL job row should hold status, attempt/version, lease owner/expiry, bounded retry count, next-run time and safe failure codes. Claim work transactionally and release/expire leases on shutdown. Persist validated evaluation and reward-ledger changes together. A crashed worker can repeat execution; business writes must remain idempotent. Do not promise exactly-once external AI billing: if a request completed remotely but the response was lost, application idempotency cannot necessarily recover the provider charge.

## Hosting comparison and current official prices

Prices checked on the research date; discounts, trial/startup credits and commitments are excluded unless stated. Alternatives are not priced as if they were identical workloads: actual CPU, busy-instance seconds, concurrent requests and egress are not yet measured.

| Host | Current relevant units | Fit for this application |
| --- | --- | --- |
| **Render Singapore** | Paid service `0.5c-512mb` $7/month; `1c-2g` $25; `2c-4g` $85. Hobby workspace $0, one operator; Pro workspace $25, unlimited members and autoscaling. Public egress $0.15/GB beyond Hobby 5 GB or Pro 25 GB | **Preferred launch host.** Runs the existing Node server and a durable worker continuously, with ordinary shutdown handling. Same-origin static export/API and regional workers avoid a platform-specific job dispatch migration at launch. |
| **GCP Cloud Run, Singapore** | Request-based active CPU $0.0000336/vCPU-second; memory $0.0000035/GiB-second; $0.40/million requests. Instance-based service CPU $0.0000216/vCPU-second and memory $0.0000024/GiB-second | Strong alternative, particularly with GCP expertise. Request billing/scale-to-zero needs jobs dispatched as authenticated requests/tasks; an arbitrary background loop after returning a response is unsuitable. Always-allocated compute changes the economics. |
| **Vercel Pro, Singapore** | $20 platform/month includes one deploying seat, $20 usage credit and the lowest Flat Rate CDN tier. Additional deploying seats $20. Regional Fluid CPU $0.16/hour, memory $0.0133/GB-hour; service requests $0.65/million | Good for web+API deployments and durable queue/workflow integration. Existing database/filesystem/worker still need adaptation. A Next.js rewrite is not required merely to deploy Express. |
| **AWS ECS/Fargate, Singapore** | Linux x86: $0.05056/vCPU-hour +$0.00553/GB-hour. ALB $0.0252/hour +$0.008/LCU-hour. ECS Express Mode has no separate service fee; underlying resources are billed | Greater infrastructure control; more IAM, networking, registry, logging and billing decisions. Appropriate when an AWS operator or institutional requirements justify it. **App Runner is closed to new customers.** |
| **Cloudflare Workers + storage** | Workers paid minimum $5/month includes 10M requests / 30M CPU-ms; excess $0.30/million requests and $0.02/million CPU-ms. R2 Standard $0.015/GB-month beyond 10 GB, free internet egress, metered operations | Very attractive request/asset economics. Node compatibility does not make local SQLite/files or the current worker durable; requires adapting execution and data access. APAC R2 location hints are not a Singapore residency guarantee. |

Sources for this table: [Render pricing](https://render.com/pricing), [Render plan features](https://render.com/docs/platform-features-by-plan), [Render bandwidth](https://render.com/docs/outbound-bandwidth), [Render regions](https://render.com/docs/regions); [Cloud Run pricing](https://cloud.google.com/run/pricing), [billing/CPU lifecycle](https://docs.cloud.google.com/run/docs/configuring/billing-settings); [Vercel Pro](https://vercel.com/docs/plans/pro-plan), [Singapore regional rates](https://vercel.com/docs/pricing/regional-pricing/sin1); [AWS Singapore ECS price catalogue](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-1/index.json), [ALB catalogue](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-southeast-1/index.json), [App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html); [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 location rules](https://developers.cloudflare.com/r2/reference/data-location/).

The Google pricing page's default selection is not Singapore. Singapore numbers above were checked in its embedded regional table. A continuously allocated Cloud Run service with 1 vCPU + 2 GiB for 730 hours is **$69.38 before free-tier credits, networking, builds, registry and logging**, compared with Render's $25 service. This is an always-on comparison only. Request-based Cloud Run can be much cheaper for a sparse, properly dispatched workload, and multiple concurrent I/O requests can share one instance's allocated resources. Measure busy-instance time rather than multiplying each overlapping request's wall time independently.

AWS Fargate 1 vCPU + 2 GB for 730 hours is **$44.98 compute**; one ALB adds **$18.40 fixed** before LCUs, IPs, network, registry, logging and database. This is not an all-in AWS quote. Public price catalogue publication dates checked: ECS 19 October 2026; ALB 11 September 2026. App Runner's official announcement says no new customers from 30 April 2026, so it is excluded as a new-deployment recommendation.

Vercel's current Pro documentation includes 1M CDN requests / 1 TB transfer in its lowest Flat Rate CDN tier in addition to the usage credit. Do not apply an older pure-credit network model. Regional transfer prices apply where usage is actually metered outside the selected CDN arrangement. No overall Vercel monthly estimate is defensible from MAU alone without CPU, memory and origin-traffic measurements.

Render Hobby is a **workspace plan**, not synonymous with a free/sleeping compute instance. Its published feature matrix allows paid web services/workers. The inspected pricing, [terms](https://render.com/terms) and [AUP](https://render.com/acceptable-use) contain no non-commercial-only Hobby restriction; a solo operator can therefore budget paid compute on Hobby. That is a reading of published terms, not a special vendor approval. Add Pro when a second operator, automatic scaling or operational features are needed. Never share the one operator's login to avoid team pricing.

## Reproducible infrastructure cost model

### Workload and units

These assumptions are estimates supplied for planning, not telemetry from the application:

- N monthly active users, each completing 20 sessions/month including retries.
- 60% audio × 20 sessions × 1 minute = 12 minutes/user/month, using the current 60-second recording UI cap; at 96 kbps this is 8.64 MB/user retained for 30 days.
- Session text/metadata 30 KB × 20 × 12 months = 7.2 MB raw/user; double for indexes/overhead gives 14.4 MB/user at month 12.
- Each retained recording has 2 playbacks plus 1 STT download: storage egress 25.92 MB/user/month.
- Render sends 15 MB/user/month in compressed static/JSON responses, plus 8.64 MB to the STT provider: 23.64 MB/user/month.
- Ongoing auth email 0.5 messages/user/month. Initial invitations/verification and recovery spikes are additional.

Tables use decimal MB/GB for transparency with the shared workload. Vendors can meter GiB, provisioned disk and billing-month averages differently; reserve disk headroom and reconcile invoices to measured bytes. One minute is the current UI cap, not a measured average or a verified server-enforced duration limit: validate duration and account quotas before relying on it as a spend bound. The history model assumes the same cohort is active for a year. If past/churned accounts retain history, **current MAU understates retained data**; use total retained attempts. A growing cohort may instead have less than twelve months per user. Backups are additional copies, not part of the 2× primary-database allowance.

| MAU | Sessions/month | DB at month 12 GB | Audio stored GB | Storage audio egress GB/month | Render egress GB/month | Ongoing auth emails |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | 600 | 0.432 | 0.2592 | 0.7776 | 0.7092 | 15 |
| 100 | 2,000 | 1.44 | 0.864 | 2.592 | 2.364 | 50 |
| 500 | 10,000 | 7.2 | 4.32 | 12.96 | 11.82 | 250 |
| 1,000 | 20,000 | 14.4 | 8.64 | 25.92 | 23.64 | 500 |
| 10,000 | 200,000 | 144 | 86.4 | 259.2 | 236.4 | 5,000 |

This network model assumes direct signed client uploads and playbacks, so those audio downloads are not also charged as Render playback egress. STT is a distinct transfer: object→worker incurs storage egress, and worker→provider incurs Render egress. If the chosen STT API can fetch the URL directly, remove 8.64 MB/user from Render. API database query results, backups, provider text payloads, retries, friend recordings beyond this workload and admin traffic are not fully represented; they require measurement/allowance. At 10k, each extra 100 GB of uncached Supabase egress costs $9, or Render egress $15 after included amounts.

### Unit ledger for the preferred stack

| Component | Official unit/allowance used |
| --- | --- |
| Render web/API | One `1c-2g` at $25/month; no persistent disk once audio and DB are external |
| Supabase organisation | Pro $25/month includes $10 compute credit; 100k auth MAU, 8 GB DB disk, 100 GB file storage, 250 GB uncached egress |
| Supabase compute | Micro ~$10; Small ~$15; Medium ~$60; Large ~$110 per month. One credit applies across the organisation, not one per extra project |
| Supabase overages | Disk $0.125/GB-month beyond 8 GB; objects $0.0213/GB-month beyond 100 GB; uncached egress $0.09/GB beyond 250 GB |
| Auth email | Resend Pro $20/month includes 50k transactional emails, then $0.90/1k; no daily cap |
| Initial monitoring | OpenTelemetry instrumentation/library $0, host logs/basic metrics included; Sentry Developer $0 for one operator, within its quota |
| Database backup | Supabase Pro daily backups retained 7 days included; this does not include stored audio bytes |

[Supabase pricing](https://supabase.com/pricing), [compute and disk sizing](https://supabase.com/docs/guides/platform/compute-and-disk), [billing/credits](https://supabase.com/docs/guides/platform/billing-on-supabase), [Resend machine-readable pricing](https://resend.com/pricing.md), [Sentry pricing](https://sentry.io/pricing/), [Render log retention](https://render.com/docs/logging), [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).

Supabase's recommended database sizes are Micro 10 GB, Small 50 GB, Medium 100 GB and Large 200 GB. Hence this twelve-month scenario selects Micro through 500 users, Small at 1,000 and Large at 10,000. This is a storage-based planning rule, not a throughput measurement. Compute is not automatically upgraded. Query tuning, indexes and connection-pool behaviour should be assessed before buying a larger tier.

### Metered floor, separate from capacity allowances

All columns include one paid always-on Render service and paid production SMTP. One sole operator is assumed. No startup credits, annual prepayment discounts, cached-storage discounts, separate worker, redundant API instance, object backup or PITR add-on is assumed.

| Monthly USD | 30 | 100 | 500 | 1,000 | 10,000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Render API/web | 25.00 | 25.00 | 25.00 | 25.00 | 25.00 |
| Render workspace | 0 | 0 | 0 | 0 | 0 |
| Supabase plan+compute after credit | 25.00 | 25.00 | 25.00 | 30.00 | 125.00 |
| DB disk over 8 GB | 0 | 0 | 0 | 0.80 | 17.00 |
| Audio storage over 100 GB | 0 | 0 | 0 | 0 | 0 |
| Storage audio egress over 250 GB | 0 | 0 | 0 | 0 | 0.83 |
| Render egress over 5 GB | 0 | 0 | 1.02 | 2.80 | 34.71 |
| Auth MAU overage | 0 | 0 | 0 | 0 | 0 |
| Production SMTP | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 |
| Included logs/initial monitoring | 0 | 0 | 0 | 0 | 0 |
| Daily DB backups | included | included | included | included | included |
| **Modelled floor** | **70.00** | **70.00** | **71.02** | **78.60** | **222.54** |

Formula: 25 + SupabasePlanCompute + 20 + max(0,0.0144N−8)×0.125 + max(0,0.00864N−100)×0.0213 + max(0,0.02592N−250)×0.09 + max(0,0.02364N−5)×0.15. Sum unrounded components before rounding totals.

A smaller tightly capped pilot can use Render's $7 compute and subtract $18; that is a memory/throughput tradeoff, not the recommended default for handling audio buffers and authentication. Resend Free subtracts $20 while staying below 3k emails/month and 100/day, but a campus signup or password-reset spike can hit the daily limit even at low MAU. Do not describe this as equivalent production mail capacity.

### Operational configurations to budget and validate

The following is a possible purchasing plan, not a claim these user counts force those tiers. Advance only when measurements or recovery requirements justify it.

| MAU | Additional provision over the floor | Indicative total/month |
| ---: | --- | ---: |
| 30 / 100 | None; one process initially runs API and leased jobs; paid auth email and daily restore procedure | $70 |
| 500 | Separate $7 worker; provision 10 GB DB instead of 7.2 GB (within Micro's recommended sizing) | $78.27 |
| 1,000 | $7 worker; Render Pro $25 for team/ops; Sentry Team $26 annual-equivalent; provision 20 GB DB; Pro's larger bandwidth allocation removes the modelled egress overage | $134.50 |
| 10,000 | Two $25 API replicas plus one $25 worker; Render Pro $25; Sentry Team $26 annual-equivalent; 180 GB provisioned DB; seven-day PITR ~$100; Pro bandwidth allowance | $425.04 |

At 10k this allocates $75 host compute, $25 workspace, $125 database plan/compute, $21.50 disk, $0 audio storage overage, $0.83 storage audio egress, $31.71 Render egress, $20 email, $26 monitoring and $100 PITR. Sentry's $26 is billed annually ($312/year), not a monthly invoice quote. Its default prepaid events are bounded; select event sampling and a hard spending policy. OpenTelemetry is an instrumentation standard, not free unlimited telemetry storage. Disable sensitive response/audio bodies and session replay by default.

Render Pro scaling is an optional operational purchase; fixed replicas also cost money when idle. Set upper limits, provider-concurrency caps and queue-age alerts. Supabase database upgrades can incur downtime and do not follow API autoscaling automatically. A 10k audience is not 10k simultaneous requests. Load-test the likely campus burst and provider rate limits, and measure p95 API latency, job age, worker RSS, connections and DB I/O before presenting a capacity claim.

Separate staging adds another project/service, even on the same plan: for example a $7 Render service plus ~$10 Supabase Micro compute once the organisation's existing credit is consumed, before its traffic. Free/local synthetic staging may suffice initially; production data must not be copied into public previews.

### Backup and recovery costs that are easy to omit

Daily database backups give a potential recovery-point gap of roughly a day; restore duration must be tested. Supabase PITR is an optional ~$100/month for seven days and requires at least Small compute. Project deletion also deletes its backups. Database snapshots contain storage metadata, **not audio objects**. [Backup documentation](https://supabase.com/docs/guides/platform/backups)

For the initial pilot, explicitly accept the difference between recoverable transcript/history and temporary recording bytes; do not claim complete audio backup. If accidental recording deletion must be recoverable, an optional encrypted 30-day copy in a separate Singapore S3 bucket costs $0.025/GB-month plus $0.005/1k PUTs, before transfer/recovery. At 10k: 86.4 GB × $0.025 = $2.16, 120k monthly files × $0.005/1k = $0.60, and another 86.4 GB of Supabase egress = $7.776 once the existing allowance is exhausted: **$10.536 unrounded, or $10.54/month incremental**. It is not included in either total. Deletes/expiry must propagate to backups under the documented retention policy; do not retain a supposedly deleted recording indefinitely. [Official Singapore S3 price catalogue](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-1/index.json)

An off-provider database export is another optional copy, not free because the primary has backups. One uncompressed month 12 raw export at 10k is roughly 72 GB: about $1.80/month S3 storage plus $6.48 transfer if its Supabase egress allowance is already exhausted. Multiple retained snapshots multiply storage; repeated full exports multiply transfer. Test restoration into an isolated environment and reconcile schema, ownership, reward-ledger uniqueness and audio manifests.

The deletion ledger must survive independently of the snapshot being restored. Restoring only a ledger from that snapshot misses deletions requested afterward and can resurrect accounts or recordings. Retain the minimal deletion identifiers durably for at least the recoverable backup horizon; before exposing a restored environment, replay the current ledger, including every post-snapshot deletion, across database records and object copies. Do not serve the restored data until that reconciliation completes.

### Native distribution and development costs, excluded from web totals

EAS Free includes 15 Android and 15 iOS builds, lower-priority queues and updates for 1k installations. Starter is $19/month, includes $45 build credit and 3k updated installations; Production is $199/month with larger allowances. An ordinary app MAU is not necessarily an EAS updated installation. [EAS plans](https://expo.dev/pricing)

For a modest update workload within bandwidth/build allowances, Starter costs $19 at the first four audience sizes and $54 at 10k installations downloading an update: 19 + (10,000−3,000)×$0.005. Extra update users include 40 MiB each; excess bandwidth is $0.10/GiB. Extra builds depend on platform/resource class: documented medium Android $1, medium iOS $2, large iOS $4 before credit. Do not buy the $199 plan solely because MAU reaches 10k. [EAS usage billing](https://docs.expo.dev/billing/usage-based-pricing/)

Apple Developer Program is $99/year, with local-currency/eligibility variations; Google Play registration is $25 once. These are account fees, not transaction commissions, review guarantees or substitutes for device testing. [Apple enrollment](https://developer.apple.com/programs/enroll/), [Google Play registration](https://support.google.com/googleplay/android-developer/answer/6112435)

Domains, CI overages, paid content rights, analytics/event storage beyond included quotas, app-store/payment commissions, support labour, tax, security review and incident response are excluded. They should not be disguised as a universal percentage of cloud spend. Engineering and on-call time are likely more consequential than a $10 difference between hosting plans, but no labour estimate was measured here.

## Migration sequence and decision gates

1. Freeze current API contracts and invariants. Split modules/repositories while keeping responses and recovery flows unchanged. Preserve original text, revision links, local notes, consent and deterministic reward rules.
2. Build a repeatable SQLite→PostgreSQL migration for synthetic staging, including IDs, JSON payload versions, timestamps and foreign/unique keys. Verify row counts, ownership, balances and malformed legacy records. Define rollback before touching production data.
3. Externalise audio and introduce upload-finalisation, expiry/deletion and signed-access tests. Move transcription to a durable cancellable job if needed; recording playback must remain available while processing fails.
4. Implement auth verification/reset and the explicit BFF/native adapters. Test old-account/guest migration, account switching, logout, refresh races and local draft isolation. No browser-only token-storage shortcut.
5. Implement PostgreSQL worker leasing and deployment shutdown/reclaim behaviour. Test crashed jobs and lost responses with no duplicate rewards; cap paid provider attempts independently of UI retries.
6. Create a minimal reproducible deployment configuration, secret rotation instructions, database migrations, health/readiness checks, structured redacted logs and alerts. Run a backup restore and API/browser workflows against staging before a small invited cohort.
7. Add separate worker/replicas only after shared rate limiting and job leases are proven. Validate native builds on physical iOS/Android devices before presenting native readiness. Provision EAS only when that distribution is actually used.

Keep the decisions reversible: standard PostgreSQL, private object-storage adapter, Express HTTP contract, provider adapters and a portable container. Reconsider Cloud Run when traffic is very intermittent or the team has GCP expertise; reconsider AWS when customer procurement/network requirements justify the extra operational surface; reconsider a dedicated web frontend when public searchable content becomes a separate product need. No such trigger currently requires replacing the app.
