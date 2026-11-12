# BridgingMinds — Usage limits and spending controls

**Researched 1 November 2026. Recommendation only; no application limits, pricing or billing settings were changed.**

## Decision

Give learners a clear allowance of **AI practices**, and enforce a separate monetary budget inside the backend. A practice should cover the existing improvement loop, including one revision, rather than charge separately for every button. Keep reading, writing, reflection, saved results and ordinary peer practice available when the AI allowance runs out.

Start an invited pilot with **5 AI practices per week** for a verified free account, revised from seven following the user's preference. Test **60 practices per billing month** as a future paid entitlement, with **S$9.90/month** as the price hypothesis from the business-model discussion. These are proposed pilot settings, not market-proven conversion or learning targets. Sixty is about 2.8 times the free monthly average; willingness to pay for that difference must still be tested. Do not launch an unlimited or lifetime AI promise. Finalise pricing after the model benchmark, observed consumption and willingness-to-pay work.

The current app has hourly request throttles, but **no durable weekly/monthly entitlement or monetary spend ledger**. Those throttles alone cannot bound a month's bill, and their process-local counters reset on restart. Details are in the [implementation and economics notes](economics-notes.md).

## What other apps actually do

The following are public policies, not observations of hidden enforcement, unit economics or Singapore checkout screens.

| App | Verified policy | Useful lesson |
| --- | --- | --- |
| **Yoodli** | Five lifetime free sessions; Pro permits ten roleplays per week; Advanced advertises unlimited roleplays. Its FAQ defines a counted session as longer than 30 seconds. [Pricing](https://yoodli.ai/pricing) | Define the charged unit clearly. A weekly allowance is a direct precedent in communication coaching. |
| **Talkpal** | Basic chat is limited to ten minutes daily; Premium advertises unlimited practice. Its terms prohibit repeated trials, duplicate accounts and automated abuse. [Pricing](https://talkpal.ai/pricing/), [terms](https://talkpal.ai/terms-and-conditions/) | Voice minutes and account controls work together; published unlimited access does not disclose the provider's cost model. |
| **Speak** | Premium allows up to three Made For You generated lessons daily; Premium Plus removes that limit. This is a specific generation limit, not a cap on all speaking or curriculum. [Plan comparison](https://help.speak.com/en/articles/5358417-what-s-the-difference-between-premium-and-premium-plus) | Limit new AI computation while preserving other learning activities. |
| **Grammarly** | Its generative-writing support page lists 100 prompts/month on Free, 1,000 on legacy Premium and 2,000 on Pro and several other plans. Users can inspect remaining prompts and refill timing. [Allowance](https://support.grammarly.com/hc/en-us/articles/17776038294285-Error-message-You-re-out-of-prompts), [counter/reset explanation](https://support.grammarly.com/hc/en-us/articles/17775763102989-How-many-generative-AI-prompts-do-I-have) | A visible balance and exact reset reduce ambiguity. Keep feature scopes explicit: Grammarly separately documents a 1,000/day desktop AI Chat limit, so there is no single quota covering every surface. [AI Chat](https://support.grammarly.com/hc/en-us/articles/32955241736973-AI-Chat-in-Grammarly-for-Windows-and-Mac-user-guide) |
| **Claude** | Most paid plans combine five-hour and weekly usage windows; consumption varies with model, effort and context. Optional prepaid usage credits allow continued use, with configurable spending limits. [Limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work), [extra usage](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) | Separate short-term capacity protection from longer-term entitlement. Extra spend should require an explicit setting. |
| **Duolingo** | Its documented Energy system recharges in about a day; refills can use ads or gems, and mistake review does not consume energy. The page describes a system under testing, not uniform availability. [Energy](https://blog.duolingo.com/duolingo-energy/) | Learn from preserving review. BridgingMinds should not tie AI spend to answer correctness or garden survival. |
| **Orai** | Offers a seven-day trial and markets paid unlimited practice, including a lifetime purchase. No numerical ordinary-use ceiling was verified. [Pricing](https://orai.com/pricing/) | An unlimited offer is a commercial choice, not evidence that our recurring costs will be covered. |

[Additional speech-app notes](competitor-notes.md) cover ELSA, Poised, trial/cancellation details and source caveats. No numerical hidden fair-use ceiling was verified for the unlimited speech products. Their real usage distributions, negotiated model prices and margins are not public in the inspected evidence.

Two broader examples show why the implementation should support more than one type of limit without copying their interface complexity:

- Lovable combines daily grants with a monthly ceiling on its free build allowance, while distinguishing build, chat and app-running consumption. Its current documentation lists five free daily build credits, capped at 30 monthly. [Credits](https://docs.lovable.dev/introduction/credits-and-usage)
- Notion separates model-selected Standard credits from user-selected-model credits, with administrator-controlled extra spend. The new system started for new workspaces on 19 October 2026 and is scheduled for existing workspaces on **2 November**, after this research date. Do not describe it as already universal today. [Notion credits](https://www.notion.com/help/manage-your-ai-credits)

These policies establish common approaches. They do not prove a particular cap improves learning, retention or conversion.

## Which approach fits this app

| Approach | Benefit | Problem here | Decision |
| --- | --- | --- | --- |
| Display tokens or dollars per action | Closely follows supplier cost | Difficult to predict and understand; adds clutter to a student practice flow | Keep internal |
| A separate credit for each feedback, draft and hint | Straightforward event counting | Can discourage revision and produce several counters for one learning activity | Avoid initially |
| Daily fixed allowance | Encourages a recurring visit | Inflexible for students who practise more on weekends; daily motivation is not evidence of daily learning need | Prefer a flexible weekly free allowance |
| Minutes only | Easy for speaking products | Does not bound typed prompts, drafts, repeated evaluation or expensive model routing | Bound audio inside the practice unit |
| Bundled AI practices | Predictable and tied to the existing activity | Must define scope and enforce all endpoints consistently | **Preferred** |
| Unlimited/fair use | Simple marketing | Unbounded cost promise or unclear restrictions; difficult before observing the heavy-use tail | Do not launch with it |

## Proposed pilot policy

| User/action | Proposed rule |
| --- | --- |
| Guest | Explore and practise without paid AI; show a sample feedback result. Sign in and verify before receiving a renewable AI allowance. This is an intentional proposed change to guest access. |
| Verified free account | Five new AI practices per week; reset Monday 00:00 Asia/Singapore, with an explicit local date/time in the UI. No rollover. |
| Future paid account | Sixty new AI practices per billing month, replacing the free grant. Reset on the billing-cycle boundary; no rollover initially, stated before purchase. |
| Account upgrade/downgrade | No duplicate free/paid grant. Define the upgrade credit explicitly and reconcile existing reservations; downgrades retain paid access until the paid period ends. |
| New AI practice | Before recording, offer a short-lived atomic admission reservation (for example five minutes) with an idempotent practice ID, rather than a balance check that can race another device. Show its expiry. Opening or writing alone is not charged. The first paid AI operation converts it into the admitted practice reservation; if an unused reservation expires, preserve the draft and recheck availability before dispatch. |
| Included improvement | Initial feedback plus one revision/re-evaluation of that same practice; one optional annotated draft. Guiding answers and self-reflection remain optional. |
| Solo debate | Include the existing up-to-three AI opponent replies. A new unrelated topic or another debate is a new practice. |
| Recording | Preserve the 60-second maximum per clip and enforce it on the server. Permit up to four accepted transcriptions/files, tied to the three debate turns and one revision, and four minutes total; ordinary practices use less. Bound failed attempts separately. Reusing the same transcript does not transcribe again. |
| Further attempts | Explain before running another charged practice. Do not silently consume an extra allowance for a regenerate button. |
| Service failure | No second allowance for an eligible retry. Release reservations that never deliver usable AI work once no call is in flight. After useful work is delivered, restore only the failed component's bounded recovery entitlement, preserving completed steps. Abandoning after usable AI assistance does not create free restarts. |
| Refund accounting | Exactly one adjustment per original failure/operation. A full refund cancels unused component entitlement; return the unit to its original period. If that period has expired, issue one bounded replacement for the undelivered work, expiring after seven days, linked to the original event and unable to mint further replacements. Repeated failures escalate to support/service recovery, not fresh full bundles. Monetary reservations for uncertain billed calls remain until reconciled. |
| Retry cost | Bounded attempts and internal failure budget still apply. Failed requests can cost us money even when they cost the learner no allowance. |
| Rollover boundary | An admitted practice retains its reserved included steps for a stated completion window, proposed 24 hours. Resetting the visible allowance must not cancel it or lose its spend reservation. |
| At the limit | Keep saved answers, existing feedback, reading, writing, reflection and manual/local practice available. Save work for later AI feedback. |
| Peer discussion | Sending a normal text turn does not consume AI. Optional transcription or AI evaluation does. Each participant spends only their own allowance; no automatic AI calls because someone else posted. |
| Garden | Keep seeds/water/XP separate from the AI allowance. Ensure existing non-AI practice can support garden care. Reaching a spending limit must not force a payment to protect plants. |

These are proposed maximum entitlements, not a requirement that a learner perform every step. Feedback and revisions retain the existing task/meaning safeguards; buying more practices does not buy a better rating.

If an AI-generated hint would introduce another model call, include a bounded number in the bundle and its cost model before enabling it. Existing hints/guide navigation should not automatically trigger fresh inference. Likewise, any future pronunciation analysis needs its own verified audio cost; it is not covered merely by transcription pricing.

Do not add automatic overage charges initially. A prepaid practice pack is a possible later option if legitimate users repeatedly hit the allowance; show the exact quantity, price, expiry and refund conditions before purchase. S$9.90/month is a proposed subscription experiment, not a launched or validated price; no pack price is selected.

## Spending implications

This model deliberately assumes a much heavier practice than the prior architecture report: **two assessments, one draft, three opponent replies and four full transcription minutes**. It adds a **10% allowance across all provider costs** for failures/recovery. Text volume assumptions are 4,500/1,300 input/output tokens per assessment, 2,000/500 per draft and 1,500/180 per opponent reply. These are planning estimates, not hard maximum token counts.

The source rates and arithmetic are documented in [economics notes](economics-notes.md) and the [earlier official model research](../architecture-2026-11-01/ai-models.md). The model-quality benchmark has not been run; the cheaper model is not assumed to be equally accurate.

| Text-model policy | One fully used bundle | Five bundles/week, average calendar month | Thirty bundles in a possible calendar month | Paid sixty bundles/month |
| --- | ---: | ---: | ---: | ---: |
| Luna for text | US$0.0235 | US$0.51 | US$0.71 | US$1.41 |
| Terra for assessments; Luna for other text | US$0.0453 | US$0.98 | US$1.36 | US$2.72 |
| Terra for all text | US$0.0569 | US$1.24 | US$1.71 | US$3.41 |

The average column uses about 21.7411 practices/month (five per week over a 365.25-day year). A calendar month can overlap **six weekly allocation periods**, allowing up to 30 starts; five per week is not a hard 20 or 22 per month. Relative to seven per week, full-use grant volume and the corresponding provider-cost scenarios decrease by about 28.6%; this is arithmetic, not a prediction of actual consumption or conversion. In-flight work carried across reset boundaries adds accounting considerations, so actual financial protection must use reservations and spend controls.

These figures are **provider-only**, not a subscription price, guaranteed bill ceiling or total gross-margin calculation. They exclude hosting, storage, email, support, payments/tax, native distribution and model changes. Most ordinary one-minute practices should use less than this full bundle; retries, larger inputs or routing can cost more. Backend output/context limits, verified duration and a budget ledger—not an average-cost table—provide the financial boundary. For example, the candidate enforced input/output profiles in the economics note would reserve **$8.81 for sixty all-Terra bundles before recovery**, versus the $3.41 estimate above. Those maximum profiles still need validation before adoption.

Scale matters: 10,000 free users each consuming 30 full bundles would cost about **US$7,052** in Luna/STT provider fees in that scenario, before infrastructure. Under the Terra-assessment mix it is about **US$13,586**. A generous per-user allowance does not make an unlimited number of free users affordable. Use an invited pilot or funded signup capacity until the free-tier subsidy is sustainable; do not promise every registered user a paid-compute grant that the aggregate budget cannot support.

## Backend protection required

Use three distinct controls, even though the learner sees one main balance:

1. **Entitlement:** persisted per account and period, plus practice reservations and a unique event ledger. Every provider endpoint checks it. Guest upgrades, reinstalling, retries and concurrent requests must not reset or duplicate it.
2. **Admission and abuse:** one paid provider operation in flight per learner, while optional unfinished revisions do not block starting another practice; bounded jobs/turns/files/bytes/duration/context/output; endpoint and global concurrency limits; account verification and proportionate suspicious-activity checks. School networks share IPs, so IP alone must not define a learner's quota. Keep identity/privacy proportional; avoid invasive fingerprinting as a default.
3. **Money:** actual usage and conservative outstanding cost reservations, with separate free/paid/failure pools and a service-wide daily/monthly ceiling. Before admitting a practice, reserve enough for its bounded included operations and eligible retry path. Before each call, check the exact token/model/duration budget and settle actual usage afterward. Unknown bills from timed-out calls remain reserved until reconciled. Duplicate requests return the existing job/result.

A reservation formula is input-token upper bound × input price + maximum billed output (including applicable reasoning) × output price + duration upper bound × STT price, summed over permitted calls and bounded retries. This requires explicit model profiles and provider accounting. Prices and model changes must be versioned, and all provider keys/paths must fall under the same control. An application ceiling cannot prevent unmetered external use of a leaked or separately used key.

At 50%, 80% and 95% of an operator-approved budget, alert and forecast exhaustion. When a pool cannot safely admit more work, stop admitting new work there; retain the resources reserved for work already admitted. Keep non-AI use available and communicate the actual reason. Do not secretly downgrade assessment quality to stretch a paid user's promised entitlement. If legitimate demand exceeds budget, restrict new free enrollment or fund more capacity rather than repeatedly cancelling valid sessions.

Provider settings are a second defence. OpenAI's current documentation supports project/organisation hard spend enforcement, but says enforcement is not instantaneous; alerts alone do not stop requests. Configure the available hard stop and model restrictions, keep headroom for reporting delay, and verify the actual account settings. They are not a replacement for our own admission ledger. [Official spend controls](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)

Provider dashboards, account limits and credentials were not inspected or changed during this research.

## Minimal interface

Use one quiet counter near AI practice, with details behind an information button:

> **5 AI practices left** · Resets Monday

The expanded detail can explain: “One practice includes feedback and one revision.” A secondary detail lists the draft, debate and recording boundaries. Show the exact reset timestamp in Settings and on a limit message.

At exhaustion:

> **You’ve used this week’s AI practices.**
> More on Monday. Your answer is saved.
>
> Continue practising · View plans

Only show “View plans” after a real paid plan exists. Use a separate truthful message for a temporary service budget pause or provider outage; do not say the user's allowance is exhausted when it is not. Warn before the final remaining practice, not while a recording is underway. Reopening saved feedback, reviewing a transcript and reading guidance must not consume another unit.

## Pilot and implementation order

Run an invited four-week pilot with published settings, then review usage before raising or monetising allowances. This is a proposed experiment, not proof that four weeks establishes long-term retention.

Measure weekly usage distribution, p50/p95/max provider cost per completed practice, audio minutes, retry/abandonment rates, cap-hit timing, whether blocked users return, and how often genuine learners need more than five. Break down by task and model; do not log raw recordings or thoughts just to measure cost. Examine accessibility and educational harms, including whether the cap interrupts retries or makes garden care unavailable.

Implement in this order when coding resumes:

1. Persist actual provider usage, model/rate version and failure categories; fix server-side audio duration validation.
2. Add entitlement and money reservations with atomic concurrency/idempotency tests.
3. Route every assessment, draft, debate and transcription call through admission checks; preserve existing reward and transcript safeguards.
4. Add the single counter, reset display, preflight check and failure-credit rules.
5. Test week/month boundaries, account upgrades, pending practices, expired reservations, duplicate clicks, two workers, outages, exhausted budget and account deletion.
6. Configure independent provider safeguards and run the small invited pilot. Choose paid pricing and possible packs using measured consumption and demand.

No billing feature or limit was implemented in this research. The selected numbers are deliberately adjustable policy, while the ledger and bounded-work rules are essential engineering controls.
