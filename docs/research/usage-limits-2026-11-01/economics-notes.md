# BridgingMinds usage limits: application controls and economics

Research date: 1 November 2026. This is a proposal, not an implemented allowance or a measured production bill. No credentials, active database, personal recordings or raw application logs were read; no provider calls were purchased. Source inspection and arithmetic supplement the market research.

## What the app currently enforces

| Control | Actual code | Financial implication |
| --- | --- | --- |
| API traffic | `server/app.mjs:197, 564`: default 300 requests/minute/IP; `:674`: 180 requests/minute/user | Burst protection, not a spending allowance. Shared campus/mobile-network IPs need careful handling. |
| Sessions | `server/app.mjs:757`: 30 new sessions/hour/user | Does not bound monthly paid AI use. |
| Assessment | `server/app.mjs:1158–1163`: up to five failed provider attempts per existing assessment; 40 evaluation admissions/hour/user | A fresh answer can create a new job. This is not a daily, monthly or monetary cap. |
| Guided draft | `server/app.mjs:273–274`: 4/minute and 12/hour/user; `server/guided-response.mjs:213–215, 262–270`: successful-result cache for ten minutes, 100 entries; shared identical in-flight requests and 32-request service ceiling | Useful deduplication, but process-local. New notes and expired cache entries can cause another request. |
| Recording and transcription | `server/app.mjs:1362, 1470`: 20 uploads/hour and 20 transcriptions/hour/user | Repeated transcription of the same file is not cached here. Each permitted request can incur a new charge. |
| Request bounds | `server/app.mjs:601, 605`: audio 10 MB and general JSON 48 KB; `:128`: ordinary answer 10,000 characters | Byte/character limits do not guarantee a particular token count or audio duration. |
| Output caps | `server/evaluator.mjs:621, 736`: assessment 3,200 completion tokens, debate 450; `server/guided-response.mjs:160`: draft 2,000 | Real per-call bounds already exist and should remain. Actual billed output can be below these ceilings. |
| Debate length | `server/app.mjs:764`: two or three rounds; `:1267–1295`: one opponent call per user round | Budget for up to **three** opponent replies, not two. |
| Recorder duration | `src/components/AudioInput.tsx:176, 188, 220`: up to 60 seconds per recording | This is a client limit. The server checks declared MIME and minimum bytes (`server/app.mjs:1369–1386`), not decoded duration. An API caller can bypass the client timer. |
| Rate-counter persistence | `server/app.mjs:220, 256–267`: in-memory map | Restarts reset counters; multiple instances have separate counters. |
| Worker claim | `server/app.mjs:1075–1088`: local working set followed by status update | Durable job rows do not yet provide an exclusive database lease; overlapping workers can issue duplicate paid calls. |

No persisted plan entitlement, per-period allowance, monetary usage ledger, provider token reconciliation or global monetary admission control was found in these paths. Existing reward caps govern garden rewards, not provider billing. Unchanged completed evaluations and already-completed debate turns do reuse saved results; preserve those protections.

For scale intuition only: 40 assessments/hour for 24 hours × 30 days would cost approximately **$31.68** at the assumed average Luna assessment size below. Twenty one-minute transcriptions/hour over the same period would cost **$64.80**. These are arithmetic examples, not reachable-load tests or hard maxima: other throttles apply, restarts and multiple accounts can change exposure, and server audio duration is currently unbounded by a minute.

## Verified unit prices and assumed task sizes

Public standard online USD prices, checked on 1 November 2026:

- Luna: $0.10 per million input tokens and $0.50 per million output tokens. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna)
- Terra: $1 per million input tokens and $5 per million output tokens. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
- Transcription: $0.0045 per audio minute. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-transcribe)

No prompt-cache, batch or regional discount is assumed. These text models are cost scenarios; comparative task quality has not been established. Terra requires a supported provider request profile before use. Taxes, exchange rates, payment processing, hosting, storage, support and human evaluation are excluded from the provider figures.

| Paid operation | Assumed input/output tokens | Luna cost | Terra cost |
| --- | ---: | ---: | ---: |
| One assessment | 4,500 / 1,300 | $0.001100 | $0.011000 |
| One opponent reply | 1,500 / 180 | $0.000240 | $0.002400 |
| One annotated draft | 2,000 / 500 | $0.000450 | $0.004500 |
| One minute of transcription | Duration based | $0.004500 | Same separate STT model |

Formula: `input_tokens × input_price / 1,000,000 + output_tokens × output_price / 1,000,000`.

These token assumptions come from the [earlier architecture review](../architecture-2026-11-01/review.md#14-operating-cost-estimates), not observed production usage. That earlier 20-session mixed workload cost **$0.082754 per active user/month**, including twelve audio minutes and 10% additional text-call overhead. It did not assume every session used every optional feature twice. Do not present the two workload models as contradictory prices for identical usage.

## A simple user-visible unit

Proposed **one AI practice** includes the bounded learning loop:

- One initial feedback result and one feedback result on a learner revision.
- One optional annotated draft based on their own notes.
- Up to three opponent replies when the practice is a debate.
- Up to four one-minute transcriptions: three debate turns and one revision; less in other modes.

This preserves the existing maximum debate length. Each component needs a durable, server-owned remaining balance attached to the same practice. Merely opening a prompt does not consume an allowance. Reserve the entitlement at the first paid operation, so the user can finish an admitted practice. The exact completion/expiry policy must be specified before implementation; never release a reservation while its provider request may still be running.

User-authored reflection, hints already included in feedback, reading, saved playback, garden care and friend text conversation do not need a new AI call. Keep these usable after the AI allowance is exhausted. Where a hint is static or already returned, opening it must not burn another credit. Friend audio transcription still has a real cost: either associate it with the same admitted practice or require an explicit separate entitlement. Do not leave an unmetered transcription endpoint outside the bundle.

Distinguish **reopening** from **regenerating**. Reopening an existing result uses no allowance. Repeating an identical request after network trouble reuses its job/result. Changing the answer consumes the included revision; further fresh AI assessments require another clearly disclosed practice allowance. Failed/invalid provider responses should not consume the learner's successful-result allowance, while their actual provider cost must still be recorded and bounded. No unlimited retry/refund loop.

## Allowance candidates and provider cost

Recommended pilot hypothesis, revised following the user's preference: **free five AI practices per week**, with a single visible counter and fixed Monday 00:00 Asia/Singapore reset. A future paid plan could include **60 practices per billing month**, usable when needed, testing S$9.90/month before committing to a price. No daily product quota is necessary; separate concurrency and short burst controls protect the service. Display the actual next reset date/time. Weekly free grants do not accumulate, and the timezone cannot be changed to manufacture a reset. A paid plan's allowance should replace, rather than silently add to, the free weekly allowance unless the commercial promise explicitly says otherwise.

A weekly allowance permits catch-up sessions without a daily product cap. Neither the five-per-week schedule nor the 60-practice figure is validated willingness-to-pay or retention evidence; test the policy with the intended audience before fixing a paid price. The paid allocation is about 2.8 times the free long-run monthly allocation; investigate whether flexibility and actual demand justify purchase rather than assuming conversion. Moving from seven to five reduces full-use grant volume and the corresponding cost scenarios by 28.6%, not necessarily actual observed spending.

For conservative usage planning, every admitted practice below uses all the components above. Add **10% to the entire provider subtotal, including audio**, for unsuccessful calls and recovery. This is a planning allowance, not an enforced worst-case limit.

| Routing scenario | Full bundle, with 10% overhead | Free 5/week, long-run average month | Free allowance in a six-reset-bucket calendar month | Paid 60/billing month |
| --- | ---: | ---: | ---: | ---: |
| Luna for all text | $0.023507 | $0.51107 | $0.70521 | $1.41042 |
| Terra assessments; Luna draft/debate | $0.045287 | $0.98459 | $1.35861 | $2.71722 |
| Terra for all text | $0.056870 | $1.23641 | $1.70610 | $3.41220 |

For Luna: `1.10 × (2 × 0.00110 + 1 × 0.00045 + 3 × 0.00024 + 4 × 0.0045) = $0.023507`.

Long-run average free grant volume is `5 × 365.25 / (7 × 12) ≈ 21.7411 practices/month`. A 31-day calendar month can overlap **six** weekly periods (for example, starting Saturday and ending Monday). With no daily cap, up to **30** grants can be spent within that calendar month. Weekly reset periods are not a 20- or 22-practice monthly hard cap. Sustained maxima across all months differ because allowances are not duplicated at month boundaries.

At **1,000 free users**, all using the complete bundle in every available week, modeled provider costs average approximately **$511.07/month** on Luna or **$984.59/month** with Terra assessments. A six-bucket month can reach **$705.21/$1,358.61** under the same average-call assumptions. This excludes infrastructure and abuse beyond legitimate account grants. Free usage is a deliberate acquisition/education budget; it is not financially free merely because each call is cheap.

At **1,000 paid users** fully consuming 60 bundles, these scenarios are **$1,410.42/$2,717.22/$3,412.20 per month**, before infrastructure and commercial costs. Set the paid price from net receipts after payment/store fees and taxes, expected support and acquisition costs, plus measured usage distribution. Do not choose a subscription price by multiplying token cost alone.

## Expected costs are not hard spending ceilings

The allowance limits the number of learning loops. It does not by itself fix prompt size, recovery attempts or future model prices. Before a provider request, atomically reserve its maximum permitted cost, including the applicable model's input/output/duration ceilings and an explicitly bounded recovery path. Settle using actual provider-reported usage; retain a conservative unresolved reservation when a timeout could already have been billed. A 10% financial assumption cannot safely admit arbitrary retries.

Illustrative **proposed**, not implemented, request profiles:

| Task | Maximum total input tokens, including prompt/schema/context | Output token ceiling |
| --- | ---: | ---: |
| Assessment | 16,000 | 3,200, matching the existing output cap |
| Opponent reply | 12,000 | 450, matching the existing output cap |
| Annotated draft | 12,000 | 2,000, matching the existing output cap |

Validate these candidate input budgets against real prompts, long permitted answers and multilingual text before adopting them. Count with the model's tokenizer; character count is not an exact substitute. If a complete request cannot fit, explain the applicable input limit rather than silently removing a learner's material or task evidence. For audio, authenticate before accepting a large body, validate the actual container/duration, and enforce one minute per admitted recording and four minutes total per practice.

Under those candidate request ceilings, a complete three-round/four-minute bundle has a **base reservation before any recovery** of:

| Routing | Base maximum provider cost under the proposed profiles | 60 bundles before recovery |
| --- | ---: | ---: |
| Luna | $0.030875 | $1.85250 |
| Terra assessments; Luna other text | $0.088475 | $5.30850 |
| Terra throughout | $0.146750 | $8.80500 |

These are mathematically bounded only if every input, output, duration, model price and request-count restriction is actually enforced. Reserve further capacity for an allowed repair/fallback before starting it. Do not market the average-cost table as the maximum bill, or promise a paid allowance that the configured monetary reserve cannot support at its enforced maxima.

## Required enforcement design

1. Keep entitlements and consumption in a persistent transactional ledger keyed to the stable application user, plan period, practice and component. Guest-to-account upgrades preserve the balance; app reinstalls, account switching and server restarts do not reset it. A new anonymous identity is not a trustworthy free-budget boundary.
2. Use a stable idempotency key and input/version hash per operation. Reuse completed assessments, drafts and transcripts. Link worker leases to provider-attempt records so multiple workers cannot intentionally process the same job concurrently. Provider timeout/retry billing can still be at least once.
3. Deduct/reserve before dispatch, commit accepted results once, and reconcile every attempt separately from the learner's visible allowance. Record model, price version, token/duration usage, task, status and IDs without logging private content.
4. Use both per-user limits and a service-wide budget. Reserve the commitments of accepted jobs, not just completed invoices. Alerts are useful but do not stop spending; the server must reject new paid work when its remaining safe budget is exhausted. Configure provider controls too, but verify whether each account setting is a hard stop or only an alert.
5. Keep failure recovery bounded: maximum automatic attempts, deadlines, per-account failure budget and global failure circuit breaker. Successful allowances can be refunded after errors without granting infinite free provider attempts. Do not retry billing/authentication/configuration errors automatically.
6. Use email-verified or institution-backed accounts for recurring free AI. A small guest preview can be separate and globally budgeted; IP limits alone cannot stop repeated account creation and can penalise shared networks. Verification is friction, not proof of one human. Consider risk-based checks without indiscriminate device fingerprinting or collecting sensitive identifiers.
7. Concurrency and request-frequency controls remain distinct from entitlements. Queue admitted work fairly; avoid multiple concurrent AI operations from the same practice. Reject oversized input and malformed media before provider dispatch. Give legitimate users a clear retry/reset message.
8. When allowance is exhausted, keep the answer and non-AI activities available. Explain the balance and reset; no automatic paid overage, hidden credit purchase or reduction of garden resources. Product policy should not cause plants to die solely because an AI quota blocked practice.

## Measurement before finalising price or lowering allowances

Measure accepted-result cost by task/model, full practice cost, audio minutes, failure/retry cost, daily/weekly unique practice counts, quota-hit rate, unfinished admitted practices, new-account abuse, p50/p95/p99 paid-user usage, and retention/learning completion after quota encounters. Compare alternative allowances only with a predeclared experiment and clear user terms. Track outcome quality as well as cost; a cheaper model that triggers confusing feedback and repeated attempts can raise cost per useful result.

No implementation or test claim is made by this note. The prior architecture review's checks remain the recorded code validation for the unchanged application.
