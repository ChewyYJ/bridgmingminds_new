# Integrated WordBloom

WordBloom is part of the two existing daily activities, not a third task. Daily-plan speaking can select zero to three approved terms, grounded in exact excerpts. The starter catalogue contains nine original definitions/examples and three coherent, original passages. Model output is validated against the catalogue and transcript. The BRIDGE wire contract is `bridgingminds_bridge_v2`, template `bridge-coach-v2`; vocabulary shares the existing feedback request.

Local mode offers at most one clearly labelled, unassessed enrichment match (work together → collaborate). It does not diagnose language errors. Configured-model observations are provisional, not validated ability measurements. Already-known words and low-confidence suggestions are suppressed; at most three new words are scheduled per processing day.

The next unassigned reading selects at most three due terms from one coherent theme. Existing assignments never change when another response arrives, a term is dismissed or WordBloom is paused. If reading came first, the new term waits for the next eligible assignment. Other themes remain scheduled.

Optional reading self-reports adjust deterministic intervals: initial three days; needs practice halves the interval with a one-day minimum; comfortable multiplies by 1.8 rounded up, bounded to 3–60 days. Skipping leaves the interval unchanged. Only the first completion of an assignment records its scheduled exposure. These are self-reports, not pronunciation assessments. Later lexical or model-selected use is stored separately as a provisional candidate; it does not establish spontaneous mastery or advance plants. No vocabulary action grants XP.

Users can dismiss a term, declare it familiar, or pause WordBloom. Familiarity is explicitly self-reported. Private vocabulary records, observations, exposure reservations and processed-attempt markers are included in export and cascade on account deletion. Ownership is enforced by authenticated endpoints. Processed-attempt markers also preserve zero-candidate results across retries.

SQLite creates the tables automatically. Hosted PostgreSQL requires the additive `supabase/migrations/202611120001_wordbloom.sql` before deploying this code. It enables RLS and denies direct client access; no live migration has been executed here.

Still outstanding: real acoustic-provider evidence, proficiency-based interval calibration, a larger level-appropriate catalogue, empirical semantic/use accuracy evaluation and independent vocabulary mastery validation. The starter implementation is not evidence of learning gains or complete phase-1 delivery.

Optional acoustic results now feed [separate provisional pronunciation observations and bounded review scheduling](wordbloom-pronunciation.md). Repeated observations across assigned readings are required before the acoustic policy changes intervals; missing evidence is never a zero. This does not establish vocabulary mastery or validate the provider. Apply the additional vocabulary_pronunciation migration before hosted deployment.
