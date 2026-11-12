# MindGarden response feedback

This document describes classic and historical four-criterion feedback. New daily-plan Spin & Speak sessions use the separate [BRIDGE contract](bridge-assessment.md). Saved sessions and evaluations retain their original framework; enrollment never re-scores history.

MindGarden uses original, **research-informed but unvalidated** analytic rubrics. They describe a particular response, not a person's intelligence, enduring ability or official language level. Garden resources reward participation independently of ratings.

## Criteria by mode

| Mode | Criteria | Version |
| --- | --- | --- |
| Spin & Speak | Support, Reasoning, Clarity, Nuance | `grow-spin-speak-v2` |
| Debate | Support, Reasoning, Clarity, Engagement | `grow-debate-v2` |
| Read & Reflect | Understanding, Interpretation, Clarity, Reflection | `grow-read-reflect-v2` |

The [shared module](../shared/assessment-rubrics.mjs) is the source of the exact original descriptions and four-level anchors. Both the model prompt and the UI consume it. Each criterion may be N/A when the task does not elicit it, necessary context is unavailable or the response cannot support a judgment. Missing evidence is not automatically a low score. Concise answers can meet the highest anchor; length, vocabulary, citation counts and agreement with the model are not quality proxies.

The argument modes draw on argument-quality research and ASRAW's distinction between structure and substance. Reading draws on OECD's understanding, interpretation and evaluation/reflection processes. These are adaptations with original wording, not inherited validation or official instrument scores. See the [research recommendation](research/mindgarden-evaluation-framework.md) and its linked primary evidence.

## Local coaching

Without backend AI credentials, feedback is **Coaching only · no scores**. All dimension levels are null. Deterministic prompts and bounded excerpts help the user review their response; the code does not claim that keywords establish sound reasoning, evidence quality or reading comprehension. Unusable content receives an insufficient-content prompt.

Local debate replies remain topic-specific practice counterpoints with no factual retrieval. No numerical assessment is attached to friend conversations.

## Optional LLM review

Set `OPENAI_API_KEY` only in the backend environment; never in an `EXPO_PUBLIC_` variable. `OPENAI_MODEL` selects the provider model. With credentials, the evaluator receives the saved task, mode-specific rubric, learner answer and available source/conversation context. It returns provisional 1–4 ratings or N/A, exact answer excerpts, a rationale and a next revision.

Reading context is the saved permitted summary and questions, not the full publisher article. Missing source context forces abstention on source-dependent criteria. Outside facts are unverified, not automatically false. Debate context includes bounded role-labelled turns; only the learner answer is scored, with engagement N/A when no opponent-response opportunity exists.

Delivery remains N/A for every text or transcript assessment. Audio upload does not establish audible pacing, intelligibility or pronunciation to a text evaluator. Users can inspect and correct transcripts before requesting feedback.

Provider failures retain the saved answer for retry. Invalid output is not silently replaced with successful-looking AI feedback. Setting credentials enables calls; it does not establish scoring accuracy.

Configured feedback requests use [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) with an explicit array of four criteria. The server still checks every criterion, rating and evidence span. A keyed object containing those same canonical criteria can be converted to the array without changing their content; missing, conflicting or unexpected criteria remain invalid. Unusable output produces a plain-language retry message, not raw schema diagnostics or an automatic extra provider request.

## Guided revision

“Think it through” replaces the prescriptive “Try this” example with three open questions and neutral placeholders: clarify the point, connect its support to the reasoning, then test its limits or implications. New AI feedback tailors these questions to the task and the response's main gap without supplying an answer or prescribing a position. Local coaching and historical feedback use stable mode-specific questions from `shared/thought-guide.mjs`.

Answers to these questions are optional working notes, saved on the device for the current account and attempt. They remain available beside the linked revision editor. They do not overwrite the original answer, become evidence or enter provider requests automatically; the learner decides how to revise the actual response. `guiding_questions` is optional for legacy evaluation compatibility, and `retry_prompt` remains in the stored contract for older clients.

Before feedback, **Get feedback** submits a written response or completed debate directly. **Reflect first** opens a separate optional note. Recordings keep transcript review available, with reflection collapsed unless the learner opens it or has saved a note. Reflection never substitutes for the original response or enters assessment prompts. An existing note is preserved unless the learner explicitly chooses **Skip reflection**. Debate completion is saved before evaluation is queued, allowing a failed request to resume the same attempt.

The guide presents one question at a time with a 1/3–3/3 counter and Back/Next controls. Next is hidden on the final question; Back and the existing revision actions remain available. Both answers and the current question are saved locally, including when a learner skips a blank question. Existing notes without a saved position open at the first question. Revision remains available on every step. An optional Hint control reveals brief guidance for that mode and question stage; hints start closed and close when navigating between questions. They do not fill in answers or make provider requests. No examples are supplied.

After the final question, **Create AI draft** explicitly sends the guiding answers and original response to the configured provider. At least one guiding answer is required. The generated draft preserves the learner's supplied position, including intentional changes in their notes, and improves expression without inventing facts, sources or experiences. For reading, it uses the supplied summary; for debate, it revises the opening. This is a separate coaching aid, not another assessment. It never overwrites the saved response, changes ratings, awards resources or automatically fills a retry answer.

The draft is clearly labeled AI-written, with highlighted phrases and short explanations selected by touch or keyboard. [Strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat) constrain its format; the server resolves unique verbatim quotes to nonoverlapping UTF-16 spans. These checks validate annotation placement, not factual truth or pedagogical accuracy. Drafts and source snapshots are saved on the device by account and attempt. Editing a note marks the draft as out of date; updating requires another explicit action. A local save failure offers a storage-only retry. Without AI credentials, drafting reports that it is unavailable rather than fabricating an AI result.

## Integrity and provenance

Rated criteria require exact evidence spans. The provider copies short, distinctive verbatim quotes; the server locates each quote in the saved answer and supplies JavaScript UTF-16 offsets: `answer.slice(start, end) === quote`. The model does not calculate character positions. Legacy spans that already match are preserved; an incorrect legacy range can be corrected only when its unchanged quote matches exactly once. Missing or ambiguous quotes are rejected without fuzzy matching. Spans must stay inside the saved answer; bounded local excerpts preserve surrogate pairs. Missing/duplicate criteria, invalid levels/types, fabricated quotes and ratings without evidence are rejected. Quote validation proves the quotation exists, not that its interpretation is valid.

The backend assigns mode-specific rubric IDs, prompt template `garden-coach-v5`, provider/model metadata and assessment metadata. The local evaluator is `local-review-prompts-v3`; configured evaluations retain the provider-returned model identifier where available. `assessment.validation_status` is always `unvalidated`. Model self-reported certainty is uncalibrated, not a probability. `overall_score` remains null.

Historical saved evaluations retain their original version and content. New unvalidated evaluations are excluded from numerical comparisons and charts. Legacy comparable model ratings can still be displayed as historical practice ratings, with explicit limits; no chart establishes ability growth. Local ratings are excluded. The analytics API separates sample count from comparison eligibility.

## Validation work remaining

The [research report](research/mindgarden-evaluation-framework.md) specifies the human-rating and held-out model study. The [offline benchmark guide](assessment-benchmark.md) explains the JSON input, metrics and synthetic demo. Human reference ratings must come from actual independent reviewers; the demo is not ground truth and automated tests are not psychometric evidence.

Before stronger claims, establish task alignment and human agreement, assess model–human agreement by mode and criterion, report coverage and uncertainty, investigate subgroup and adversarial errors, and evaluate feedback usefulness. Learning-gain claims require independent transfer-task evidence. No such completed validation study is claimed here. Synthetic live-provider checks diagnose integration behavior only; they do not establish scoring accuracy.
