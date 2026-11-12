# AI model and provider architecture evidence

**Researched: 1 November 2026.** Audience: students and early-career adults in Singapore. Scope: the existing MindGarden/BridgingMinds application's evaluation, debate, optional guided rewriting, and transcription. Official documentation and public USD API prices were checked; no model requests, credentials, user records, or account settings were accessed. No runtime changes were made. Prices exclude tax, foreign exchange, hosting, storage, and support. Recommendations are hypotheses for a product-specific benchmark, not measured rankings.

## Decision proposed

Keep `gpt-6-luna` with `gpt-transcribe` as the **current implementation baseline**, while testing `claude-haiku-5-5` as the independent-provider challenger. Test `gpt-6.1-terra` as the next more capable OpenAI candidate, and `gpt-6.1-sol` plus `claude-sonnet-5-5` as higher-cost quality references. The existing integration and low marginal price justify retaining the baseline until evidence shows a meaningful improvement; they do not establish its scoring validity or superiority.

Use **deterministic validation plus one text-model call per task**, with a separate transcription model. Do not add a multi-agent critique chain, automatic judge-of-judge pass, retrieval, or a second model to every short response without an observed failure that the extra call resolves. Meaning preservation, helpfulness, faithful source use, and equitable treatment of Singapore English are the decision criteria. Coding leaderboards and broad reasoning benchmarks do not answer those questions.

Keep manual transcription and the explicitly unscored local coach available when providers are absent or fail. Cross-provider failover should be a separately approved, disclosed capability with tested adapters, compatible privacy terms, and bounded spending. There is no interchangeable-provider mechanism today.

## What is actually implemented

Line references reflect the source inspected on this date.

| Path | Current behavior | Architecture implication |
|---|---|---|
| `server/provider.mjs:3–21` | One text model and one STT model; defaults Luna and `gpt-transcribe`; explicit legacy allowlists. | Good small scope. No task-specific text routing or other provider exists. |
| `server/provider.mjs:79–96` | Non-secret status distinguishes configuration from connection; `liveVerified:false`. | Do not label a configured account “connected” or its balance/model access verified. |
| `server/provider.mjs:108–115` | Always sends `temperature` and `max_completion_tokens`; adds `reasoning_effort:none` only for names starting `gpt-6-`. | A model-name swap to GPT-6.1 is insufficient; see compatibility below. |
| `server/provider.mjs:128–151` | Fixed official OpenAI host, endpoint allowlist, redirect rejection, 35-second timeout, sanitized errors, no automatic retry. | Useful privacy and cost safeguards. No regional endpoint, streaming, provider failover, or generic transport adapter. |
| `server/evaluator.mjs:608–640` | v5 mode-specific rubric, strict output schema, 3 guiding questions, source/task boundaries, server-anchored exact quotes; 3,200 completion-token cap, temperature 0. | Preserve these domain rules independently of transport. Schema validity is not semantic correctness. |
| `server/evaluator.mjs:729–770` | Debate receives proposition, learner position and turns; 450-token cap, temperature .5, 25-second timeout. Reply only checked as a bounded string. | **Concrete gap:** unlike assessment and guided drafting, this path does not explicitly reject refusal or a truncated `finish_reason`. Test and handle these before stronger reasoning models. |
| `server/guided-response.mjs:118–203` | Opt-in draft uses original response and 3 guide answers, bounded relevant context, 2–5 exact annotations, 2,000-token cap, temperature .3; explicit refusal/incomplete checks. | Keep draft generation separate from assessment and preserve the user's position. Private self-reflection and unrelated recordings are not included. |
| `server/guided-response.mjs:222–296` | Bounded success cache and in-flight deduplication keyed by owner/attempt/content. | Keep these protections across adapters; a second provider must not bypass them. |
| `server/app.mjs:1461–1500` | STT sends file plus model; consumes plain `text`; manual fallback without a key. | No language hints, word timing, pronunciation diagnosis, or disfluency analysis. Changing STT alone does not implement those features. |

The inspected `.env.example` configures only server-side OpenAI credentials/models. All proposed non-OpenAI models require implementation and tests. This review did not inspect any secret environment file.

## Current production candidates and public unit prices

USD per **one million tokens**, standard online service and short prompts, unless stated otherwise. Cache column means **cache-read input**; a dash means unverified/unpublished, not free. Context limits are provider-described windows, not permission to fill them: this app's inputs are much smaller. Output maximum is a platform ceiling, not a recommended budget.

| Provider / exact API ID | Input | Output | Cache read | Published context / output ceiling | Position in decision |
|---|---:|---:|---:|---|---|
| OpenAI `gpt-6-luna` | $0.10 | $0.50 | $0.01 | 1,050,000 / 128,000 | Existing low-cost baseline. [Model](https://developers.openai.com/api/docs/models/gpt-6-luna) |
| OpenAI `gpt-6.1-terra` | $1.00 | $5.00 | $0.05 | 1,050,000 / 128,000 | Stronger candidate; requires request profile. [Model](https://developers.openai.com/api/docs/models/gpt-6.1-terra) |
| OpenAI `gpt-6.1-sol` | $2.00 | $10.00 | $0.10 | 1,050,000 / 128,000 | Quality-reference candidate; reasoning required. [Model](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| Anthropic `claude-haiku-5-5` | $0.10 | $0.50 | $0.01 | 1M / 128,000 | Same short-context rates as Luna, independent provider. [Prices](https://platform.claude.com/docs/en/about-claude/pricing), [model](https://platform.claude.com/docs/en/models/haiku-5-5/overview) |
| Anthropic `claude-sonnet-5-5` | $2.00 | $10.00 | $0.10 | 1M / 128,000 | Higher-cost quality reference. [Model](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [prices](https://platform.claude.com/docs/en/about-claude/pricing) |
| Google `gemini-3.5-flash-lite` | $0.30 | $2.50 | $0.03 | 1,048,576 input / 65,536 output | Stable July 2026; low-cost multimodal challenger. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [prices](https://ai.google.dev/gemini-api/docs/pricing) |
| Google `gemini-3.8-flash` | $0.75 | $3.75 | $0.075 | 1,048,576 input / 65,536 output | Stable September 2026; promotional rates through 31 Dec 2026. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [prices](https://ai.google.dev/gemini-api/docs/pricing) |
| Google `gemini-4-argon` | $2.00 | $10.00 | $0.10 | Verify dedicated limits before implementation | Current stable flagship; introductory rates through 30 Nov 2026. Not needed in first benchmark. [Catalogue](https://ai.google.dev/gemini-api/docs/models), [prices](https://ai.google.dev/gemini-api/docs/pricing) |
| Together `openai/gpt-oss-120b` | $0.15 | $0.60 | — | 131,072 context; hosted output cap unverified | Open-weight hosted comparator; not the OpenAI API. [Active catalogue](https://docs.together.ai/docs/serverless/models) |
| Together `deepseek-ai/DeepSeek-V4.1-Flash-1017` | $0.30 | $1.20 | $0.006 | 1M context; hosted output cap unverified | Current hosted challenger; released 16 Oct 2026. [Provider model page](https://www.together.ai/models/deepseek-v4-1-flash-1017) |

OpenAI's current larger catalogue includes `gpt-6-astra` at $10/$50 input/output. It is unnecessary as a default for short practice feedback; higher price is not evidence of greater educational value. Batch/Flex pricing can reduce suitable asynchronous work, but a learner waiting for feedback needs a separately measured latency decision. [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

Important price conditions:

- Haiku's listed tier applies up to 100,000 input tokens; above that, rates are $0.50 input/$2.50 output/$0.05 cache read. Its 5-minute/1-hour cache writes cost $0.125/$0.20; Sonnet writes $2.50/$4.00. Identical text need not tokenize identically across providers. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Gemini 3.8 Flash becomes $1.50/$7.50/$0.15 on 1 Jan 2027. Argon becomes $4/$20/$0.20 on 1 Dec 2026. Flash-Lite cache storage is $1/M tokens/hour; Flash 3.8 storage is currently $0.50, then $1. Output billing includes thinking tokens. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)
- OpenAI's >272K input tier increases prices; there is no reason for this app to reach it. Terra's 30-minute/12-hour cache writes are $1.25/$2.50; Sol's are $2.50/$5.00. Regional service has additional pricing. [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

These are currently documented IDs, not guaranteed account entitlements. An alias is not a reproducibility promise: retain actual response model, provider, prompt/rubric versions, request settings, and date in experiment records. Do not mistake a knowledge-cutoff date for a release date. The application's existing legacy text overrides shut down on **14 Jan 2027**, and listed legacy transcription overrides on **26 Feb 2027**. [Official deprecations](https://developers.openai.com/api/docs/deprecations)

## Compatibility: an adapter must preserve the product contract

**OpenAI.** Current Luna supports strict JSON Schema and streaming and can use reasoning `none`. Terra 6.1 also supports `none`; Sol 6.1 does not. With reasoning enabled, current guidance requires removing sampling parameters including `temperature`. Merely adding Terra/Sol IDs to the allowlist would leave the existing name-prefix check wrong; adding Sol with `none` would also be wrong. Use explicit model capability profiles, not name heuristics. Chat Completions remains available for these text-only tasks; migration to Responses is not a prerequisite. [Latest-model parameter guidance](https://developers.openai.com/api/docs/guides/latest-model)

Keep the existing strict schema and application checks. Structured Outputs constrains format; it does not prove faithful quotes, sound reasoning, or truthful feedback. Refusal and token-limit interruption remain distinct failures. Server-derived offsets, exact substring checks, unique keys, N/A logic and schema validation should remain authoritative. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

**Anthropic.** Use a provider-native Messages adapter: `system`, `messages`, `max_tokens`, typed content blocks, and `output_config.format` with JSON Schema. Streaming is supported, but complete and validate the output before committing it. Its schema subset does not enforce every bound used by this app; keep all application-level limits and reject invalid output. First schema compilation can add latency. Do not embed learner data in schema enums/descriptions. [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Haiku 5.5 requires omitting `temperature`, `top_p`, and `top_k`, and rejects final assistant-message prefill even with thinking disabled. Select text blocks by type rather than treating the first block as the final answer. Tune thinking explicitly and measure its cost. [Migration guide](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide)

**Gemini.** Use its documented structured-output interface rather than assume the OpenAI wire format. It supports JSON Schema subsets and streaming, but string-length constraints are not enforced by the model interface. Retain server checks, response/refusal handling, usage accounting and tests against the actual selected endpoint. [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Gemini 3.8 Flash accepts thinking levels low/medium/high; `minimal` is invalid. Start with the lowest supported setting as an experiment, not an asserted quality-equivalent optimization. [Model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)

**Hosted open weights.** Together offers JSON-schema output and an OpenAI-compatible interface, but compatibility is not identical parameter semantics. Confirm per-model reasoning controls, output budgets, stream termination, usage counters and schema coverage. [Structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)

`gpt-oss-120b` is Apache-2.0 licensed and supports configurable reasoning and structured output; OpenAI documents it fitting on an H100. This establishes a possible self-hosting path, not economical, low-latency mobile delivery. [Official model](https://developers.openai.com/api/docs/models/gpt-oss-120b)

Together lists the DeepSeek candidate as MIT-licensed and uses integer reasoning effort 1–100, unlike this app's string `none`. Verify the original weight license and deployment restrictions before self-hosting. The advertised large output allowance is not appropriate for a 120-word debate reply. [Hosted specification](https://www.together.ai/models/deepseek-v4-1-flash-1017)

At this workload, hosted inference is the provisional choice. Self-hosting introduces GPU idle time, capacity planning, patching, abuse protection, serving failures and operational labor. A low published token price or downloadable model does not establish lower total cost. No GPU throughput experiment was performed.

## Transcription choices and Singapore-language uncertainty

| Candidate | Verified public price / contract | Relevance |
|---|---|---|
| OpenAI `gpt-transcribe` | $0.0045/audio minute; completed-file and streaming transcription, contextual/keyword hints and code-switch support. [Model](https://developers.openai.com/api/docs/models/gpt-transcribe) | Already integrated. Add carefully bounded hints only if an accent/code-switch test demonstrates benefit; retain transcript review. |
| Google `gemini-3.5-transcribe` | $2/M audio input tokens plus $12/M text output; Google's illustrative conversion totals approximately $0.005/minute, not a fixed all-in minute rate. [Prices](https://ai.google.dev/gemini-api/docs/pricing) | Stable file transcription; up to 1 hour, or 30 minutes with word timestamps/diarization. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) |
| Deepgram `nova-3`, `language=multi` | Current retrieved pricing table: $0.0092/min multilingual and $0.0077/min monolingual; channel/add-on charges apply. **Do not use these as a verified prerecorded quote without confirming the table's selected mode.** [Prices](https://deepgram.com/pricing) | Official documentation supports 55-language code-switching and optional language hints. An independent STT benchmark candidate. [Language prompting](https://developers.deepgram.com/docs/nova-3-language-prompting) |

Deepgram's language table includes English, Mandarin, Malay and Tamil; that is not validation on Singapore speakers or mixed Singlish speech. Its model overview specifically recommends Nova-2 for filler identification, so do not assume its newest model provides the best disfluency capture. [Model/language coverage](https://developers.deepgram.com/docs/models-languages-overview)

No inspected source establishes comparative accuracy for this application's Singapore students, colloquial grammar, locally meaningful particles, names, code-switching or phone microphones. Test clean and noisy recordings from consenting target users, including English with Mandarin/Malay/Tamil switching, and measure both word error rate and **meaning-critical errors** (negation, numbers, names, position changes). For any future filler feature, measure preservation of fillers separately: a polished transcript can silently remove them. ASR confidence and phoneme recognition are not a validated pronunciation score. Keep content assessment independent of accent/dialect and expose transcript correction before evaluation.

## Privacy, residency and fallback boundaries

| Provider path | Verified control / uncertainty | Required decision |
|---|---|---|
| Current OpenAI API | API content is not used for training by default. Chat Completions generally has 30-day abuse-monitoring retention; audio transcription has no listed abuse/application-state retention. ZDR has eligibility requirements. Singapore regional endpoint supports storage but **not in-region inference**; non-US residency requires additional approvals/terms. Responses has different state defaults. [Data controls](https://developers.openai.com/api/docs/guides/your-data) | Current global host must not be described as Singapore-resident. Verify model/endpoint/contract eligibility; do not switch APIs and accidentally add stored state. |
| Direct Anthropic API | Its technical page says conversation content is not retained by default except covered models, while the linked commercial policy says inputs/outputs are deleted within 30 days, with exceptions. [Technical policy](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), [commercial policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) | Treat this as unresolved public-document inconsistency. Obtain the applicable contractual policy; do not promise ZDR. |
| Anthropic geography | Native API lists `inference_geo: global` or `us`; workspace storage geography currently `us`; US inference costs 1.1×. Partner cloud deployments use their own location controls. [Residency](https://platform.claude.com/docs/en/manage-claude/data-residency) | Broad APAC marketing is insufficient evidence of Singapore inference for this exact direct API/model. |
| Gemini Developer API | Paid service is not used for product improvement; free-tier behavior differs. Limited abuse-monitoring retention remains. Stronger enterprise/ZDR requirements point to the managed cloud platform and its contracts. [Data-retention guide](https://ai.google.dev/gemini-api/docs/zdr) | Use paid terms; independently verify selected model and region on Vertex/managed cloud if Singapore residency is required. Exact retention duration was not established here. |
| Together | Prompt/output storage is **on by default**; training is a separate opt-in, off by default. Organization ZDR requires disabling prompt storage and disables passthrough models; account metadata remains. [ZDR](https://docs.together.ai/docs/zero-data-retention) | Configure before sending learner content. Global API is not a Singapore residency promise. US-only inference is separately priced 1.25× for supported models and does not by itself cover storage/logging. [Geo-specific service](https://docs.together.ai/docs/serverless/geo-specific-inference) |
| Deepgram | Model-improvement participation and retention are default; `mip_opt_out=true` provides request-content ZDR. Regional endpoints plus opt-out constrain processing; global routing does not. [Data policy](https://developers.deepgram.com/trust-security/your-data) | Explicit opt-out and applicable region/contract checks are necessary before a pilot. No Singapore endpoint was verified. |

Research recommendation: maintain a documented subprocessor list and provider-specific data flow. Do not silently send a failed response to a new company or a less restrictive region. Model fallback must pass both a quality gate and the application's consent/contract policy. Limit requests to necessary task context; do not add private journal/self-reflection/audio when text alone suffices. Privacy-safe operational records should contain request/job IDs, model, status, duration, usage and a known reason code—not raw prompts, audio or full provider bodies. Applicable Singapore legal obligations need a separate legal/privacy review; this is a technical comparison.

## Cost calculations for the agreed workload

Assumed per active user/month: 20 evaluations at 4,500 input/1,300 output; six debate calls at 1,500/180; six guided drafts at 2,000/500; 10% additional text-call allowance. Total **122,100 input and 33,088 output tokens**. Audio assumes **60% × 20 sessions × 1 minute = 12 minutes**, costing **$0.054** with the current STT price. One minute is the current recording UI cap, not an observed average duration. No cache hits or batch discounts are assumed.

These are arithmetic scenarios using the prices above, not measured production bills. Tokenizers, reasoning-token usage, schema overhead and actual retry rates may change totals. An output ceiling is not the number of billed tokens; an interrupted request may still incur charges.

| Text candidate | One evaluation | One debate call | One guided draft | Monthly text | Text + current STT |
|---|---:|---:|---:|---:|---:|
| Luna / Haiku 5.5 short tier | $0.001100 | $0.000240 | $0.000450 | $0.028754 | $0.082754 |
| Terra 6.1 | $0.011000 | $0.002400 | $0.004500 | $0.287540 | $0.341540 |
| Sol 6.1 / Sonnet 5.5 | $0.022000 | $0.004800 | $0.009000 | $0.575080 | $0.629080 |
| Gemini 3.5 Flash-Lite | $0.004600 | $0.000900 | $0.001850 | $0.119350 | $0.173350 |
| Gemini 3.8 Flash, current promotion | $0.008250 | $0.001800 | $0.003375 | $0.215655 | $0.269655 |
| Gemini 3.8 Flash, Jan 2027 | $0.016500 | $0.003600 | $0.006750 | $0.431310 | $0.485310 |
| Together GPT-OSS 120B | $0.001455 | $0.000333 | $0.000600 | $0.038168 | $0.092168 |
| Together DeepSeek V4.1 Flash 1017 | $0.002910 | $0.000666 | $0.001200 | $0.076336 | $0.130336 |

Formula: `monthlyText = 122100 × inputPrice / 1e6 + 33088 × outputPrice / 1e6`. Cache-write premiums, cache storage, residency premiums, hidden reasoning output, taxes, abuse and idle infrastructure are excluded. Recalculate from actual usage counters before pricing a subscription.

| Active users/month | Luna + current STT | Terra + current STT | Sol + current STT |
|---:|---:|---:|---:|
| 30 | $2.48 | $10.25 | $18.87 |
| 100 | $8.28 | $34.15 | $62.91 |
| 500 | $41.38 | $170.77 | $314.54 |
| 1,000 | $82.75 | $341.54 | $629.08 |
| 10,000 | $827.54 | $3,415.40 | $6,290.80 |

At the baseline rate, transcription represents roughly 65% of the modeled provider bill. Therefore reducing redundant audio transcription and preserving reviewed transcripts may matter more than chasing slightly cheaper text tokens. This does **not** justify shortening user practice or substituting lower-quality ASR.

## Routing options and recommendation

| Pattern | Benefit | Cost/risk | Decision |
|---|---|---|---|
| One text model for every task | Simple operations and attribution | May not win every task | Keep initially; benchmark each task separately. |
| Task-specific text models | Can improve a demonstrated weak task | More contracts, profiles, monitoring and variation | Adopt only where task-specific gains survive blinded evaluation. |
| Small model then larger fallback | Can recover availability/quality failures | Duplicate spending; unclear semantic confidence; privacy change | Permit bounded, explicitly approved fallback for known eligible failures. Do not route by uncalibrated model confidence. |
| Deterministic rules + LLM | Reliable limits, ownership, evidence anchoring, source boundaries | Cannot establish semantic truth on its own | Recommended foundation; much already exists. |
| Multi-step generator/critic/judge | May improve a difficult structured task | Latency, correlated errors, compounded cost | Experimental only; compare against a stronger single call. |

No official page supplies this application's Singapore-region P50/P95 latency, cold-schema delay, account rate limits or error rate. These remain unknown until measured with authorized calls. Published context windows and vendor “fast” descriptions do not establish interactive UX. Preserve saved work on timeouts, and distinguish provider availability from task quality. Do not add invisible retry loops to hide an unmeasured failure rate.

## Minimal validation and adoption plan

This is a proposed experiment, not completed validation.

1. Freeze task inputs, rubric/schema/template version, context rules and fixed draft-preservation rules. Build a held-out set with consenting or synthetic Singapore-relevant content, including short strong responses, dialect variation, neutral political viewpoints, reading-summary scope traps, opening-only debate revisions, incomplete notes, instruction injection, repeated quotes, emoji and ambiguous language.
2. Run a first comparison of Luna, Haiku 5.5 and Terra 6.1; add Sol/Sonnet only if cheaper candidates miss meaningful gates. Test each candidate's actual supported parameters and compare a low-reasoning profile separately from its default. Keep model identities blind to human reviewers.
3. Use independent trained human reference ratings and adjudication for assessment; separate agreement with humans from user preference for polished prose. For drafting, prioritize preservation of stance, no invented facts/experiences, useful structure and annotation accuracy. For debate, assess relevance, genuine engagement, one useful question, civility and factual restraint. A model should not judge itself as the sole source of truth.
4. Record schema/refusal/truncation rate, exact-span failure, invented-support rate, meaningful stance changes, task completion, cost per **accepted** result, and latency from Singapore with cold and warm caches. Repeat a subset to estimate variance; temperature zero is not a determinism guarantee. Keep confidence intervals and subgroup counts visible rather than manufacture a precise leaderboard from tiny samples.
5. Compare STT independently on consented phone recordings: meaning-critical errors, correction effort, code-switch preservation, noise and accent cohorts. Content assessment should use reviewed transcripts, so ASR errors are not silently converted into thinking scores.
6. Require no critical meaning/privacy violations in the held-out release set, all structural invariants passing, and an explicit error budget before a small opt-in pilot. Agree quantitative quality/latency thresholds with the product owner before seeing results. Do not present a passing pilot as universal scientific validation.
7. Add non-content telemetry and per-provider/model spend limits, then roll out a small percentage with a kill switch. Preserve historical model/template labels and separate comparisons across incompatible versions. Revalidate after model retirement, alias change, prompt modification or a new language cohort.

## Priorities before adding providers

**First:** keep the existing baseline; instrument token usage, failure categories and accepted-result latency without logging learner content; add the debate refusal/truncation handling noted above. Run the representative benchmark before selecting a replacement.

**Second:** introduce small explicit capability profiles and a transport boundary, preserving existing schemas, exact evidence anchoring, attempt ownership, cache isolation and reward transactions. Add Terra 6.1 compatibility tests before allowing that override. Only add a second provider after privacy terms and cross-provider handling are agreed.

**Third:** evaluate task-specific improvements and STT hints. Consider a clarification outcome for guided drafting when notes are too sparse, rather than forcing expansion; this is a future product/schema decision, not something the current response contract already expresses. Keep learner revisions separate from assessment evidence.

**Defer:** vector databases, long-term inferred learner profiles, autonomous tools, self-hosted GPU infrastructure, multi-agent judging, pronunciation scoring, and universal proficiency claims. None is necessary to validate the current short-response learning loop, and none is supplied merely by choosing a larger model.

### Unresolved evidence

Account-specific access and rate tiers; exact production Singapore latency; native model-quality differences on this cohort; applicable provider contracts and regional model availability; Anthropic's conflicting retention wording; Deepgram's selected-mode prerecorded price; open-weight deployment output caps; tokenizer/reasoning/caching effects on actual spend. These should remain explicit unknowns until verified, not assumptions hidden inside the recommendation.
