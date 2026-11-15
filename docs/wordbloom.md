# Integrated WordBloom

## My Dictionary and Read & Reflect

Open **Profile → My Dictionary** to revisit words saved from the Spin & Speak sample script. Earlier feedback-based discoveries also appear here. **Read & Reflect** is available from the dictionary and daily Home. It offers one due word at a time using original contexts from the approved catalogue. Contexts alternate on later reviews. First the learner recalls the missing word, then sees the completed example and writes a sentence in a new context.

Correct recall is checked against the target word. Reflections are checked for presence of the target word. Three consecutive correct reviews earn the **Consistent recall** progress label. Correct reviews schedule the next exercise after 1, 7, then 30 days. Missed recall schedules a retry after one day. The recall schedule is stored on the existing dictionary entry and is independent of Read Aloud exposure. A review resumes from the last submitted step.

The first completed review of the learner’s local day earns 5 XP. The existing reward ledger records activity `read_reflect` and a stable completion ID. Progress and the bonus are committed together. The review is available outside the two activities that secure the daily streak. SQLite creates its table automatically. Hosted installations need `202611150001_vocabulary_reviews.sql` for review history and account export.

## Reading exposure and vocabulary discovery

WordBloom is part of the two existing daily activities, not a third task. Daily-plan speaking can select zero to three approved terms, grounded in exact excerpts. The starter catalogue contains nine original definitions/examples and three coherent, original passages. Model output is validated against the catalogue and transcript. The BRIDGE wire contract is `bridgingminds_bridge_v3`, template `bridge-coach-v3`; vocabulary shares the existing feedback request.

Local mode offers at most one clearly labelled, unassessed enrichment match (work together → collaborate). It does not diagnose language errors. Configured-model observations are provisional, not validated ability measurements. Already-known words and low-confidence suggestions are suppressed; at most three new words are scheduled per processing day.

The next unassigned reading selects at most three due terms from one coherent theme. Existing assignments never change when another response arrives, a term is dismissed or WordBloom is paused. If reading came first, the new term waits for the next eligible assignment. Other themes remain scheduled.

Optional reading self-reports adjust deterministic intervals: initial three days; needs practice halves the interval with a one-day minimum; comfortable multiplies by 1.8 rounded up, bounded to 3–60 days. Skipping leaves the interval unchanged. Only the first completion of an assignment records its scheduled exposure. These are self-reports, not pronunciation assessments. Later lexical or model-selected use is stored separately as a provisional candidate; it does not establish spontaneous mastery or advance plants. No vocabulary action grants XP.

Users can dismiss a term, declare it familiar, or pause WordBloom. Familiarity is explicitly self-reported. Private vocabulary records, observations, exposure reservations and processed-attempt markers are included in export and cascade on account deletion. Ownership is enforced by authenticated endpoints. Processed-attempt markers also preserve zero-candidate results across retries.

SQLite creates the tables automatically. Hosted PostgreSQL requires the additive `supabase/migrations/202611120001_wordbloom.sql` before deploying this code. It enables RLS and denies direct client access; no live migration has been executed here.

Still outstanding: real acoustic-provider evidence, proficiency-based interval calibration, a larger level-appropriate catalogue, empirical semantic/use accuracy evaluation and independent vocabulary mastery validation. The starter implementation is not evidence of learning gains or complete phase-1 delivery.

Optional acoustic results now feed [separate provisional pronunciation observations and bounded review scheduling](wordbloom-pronunciation.md). Repeated observations across assigned readings are required before the acoustic policy changes intervals; missing evidence is never a zero. This does not establish vocabulary mastery or validate the provider. Apply the additional vocabulary_pronunciation migration before hosted deployment.
