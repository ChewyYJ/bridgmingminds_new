# Offline assessment benchmark

This tool measures agreement in **supplied ratings**. It makes no network calls, reads no AI credentials, writes no application/database state, and does not enable a validation flag. It cannot establish construct validity, genuine human independence, fairness, or learning outcomes. The [research and proposed study plan](research/llm-assessment-validation.md) explains the evidence needed for those claims.

No human-rated validation dataset has been collected as part of this implementation. The included [synthetic example](examples/assessment-synthetic-demo.json) is invented solely to demonstrate the file format. Its scores, people, raters, hashes, and audit results are not evidence of model accuracy.

## Run it

Use the project's Node runtime from the project directory:

```bash
node scripts/benchmark-assessment.mjs docs/examples/assessment-synthetic-demo.json --bootstrap 2000 --seed 20261030
node scripts/benchmark-assessment.mjs /absolute/private/path/real-ratings.json --bootstrap 2000 --seed 20261030 > /absolute/private/path/report.json
node --test tests/assessment-benchmark.test.mjs
```

The first command is a software demonstration. The second reads a real, locally supplied study file if one exists; shell redirection saves the report. The script itself only reads the input and prints JSON to stdout. Invalid input prints an error to stderr and exits 1, without a partial report. A URL is not fetched. Limits are 20 MiB and 50,000 rows per file; bootstrap iterations are 0–10,000, default 2,000; seed is an unsigned 32-bit integer. `--bootstrap 0` disables intervals.

To bound reporting work, there are at most 20 human ratings per row, 200,000 human annotations, and 5,000 distinct mode/criterion/rater-pair groups per input. Only pairs that actually co-occur are indexed. Requested iterations multiplied by (record count plus the sum of co-rating pairs per row) must not exceed 50 million; reduce iterations or split the study if this work limit is reached. These are computational limits, not statistical sample-size recommendations.

## Input contract, version 1

Use one JSON object with `schemaVersion: 1`, `dataset`, `versions`, and `records`. Unknown fields are rejected so an unsupported confidence value or version override cannot silently change the interpretation. Do not include participant names, email addresses, answers, secret keys, or raw model output. Store the private annotation dataset separately; use pseudonyms and context hashes here.

`dataset` requires:

| Field                                   | Meaning                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                                    | Stable study/export identifier.                                                                                       |
| `kind`                                  | `human_rated` or `synthetic_demo`. The report prominently marks synthetic data.                                       |
| `intendedUse`, `population`, `language` | Actual scope; a claim in metadata is not independently verified by the tool.                                          |
| `split`                                 | `pilot`, `development`, or `holdout`. Calling a file “holdout” does not prove it was kept independent.                |
| `provenance`                            | How actual responses and annotations were collected. Do not relabel generated examples as human data.                 |
| `humanRatingProcess`                    | Must be `independent_before_adjudication`. This declaration is a study responsibility, not a software-certified fact. |
| `adjudication`                          | Describe how separate reference decisions were obtained.                                                              |
| `modes`                                 | Nonempty unique subset of `spin_speak`, `read_reflect`, `debate`.                                                     |
| `criteria`                              | Nonempty unique subset of `grounded`, `reasoned`, `organised`, `well_rounded`, `delivery`.                            |

Each nonempty string in `versions` is required: `rubric`, `promptTemplate`, `provider`, `model`, and `scoringConfig`. Use actual persisted versions and a configuration hash/identifier covering relevant request parameters and scoring-code version. Prefer an actual model snapshot over a moving alias when available; retain the evaluation date in private study provenance. The tool cannot discover the provider's hidden version behind an alias.

**Current production rubrics have different version IDs by mode. Export a separate input and report for each production mode**, retaining its actual rubric ID. A single multi-mode file is appropriate only for a deliberately coherent study using one shared rubric version; it must not erase the different production IDs. A synthetic multi-mode math fixture is not production calibration.

Each record represents **one response × one criterion**:

```json
{
  "responseId": "response-017",
  "participantId": "participant-009",
  "promptId": "prompt-12",
  "promptFamily": "source-inference",
  "responseHash": "actual SHA-256 of the frozen response",
  "referenceContextHash": "actual SHA-256 of the frozen task and supplied source context",
  "mode": "read_reflect",
  "criterion": "grounded",
  "humanRatings": [
    { "raterId": "rater-01", "score": 2 },
    { "raterId": "rater-02", "score": 3 },
    { "raterId": "rater-03", "score": 2 }
  ],
  "reference": { "status": "rated", "score": 2 },
  "prediction": { "status": "scored", "score": 2, "evidenceValid": true }
}
```

These sample values illustrate syntax only. They must be replaced with actual study observations, not copied into a “calibration” file. Hash fields are required identifiers; the tool cannot verify them without the private source data and currently validates nonempty strings rather than cryptographic preimages. For real studies, produce the hashes from immutable saved inputs.

- `humanRatings` contains raw, independently assigned ratings, **before** adjudication. Each `raterId` appears at most once in a record. Scores are integers 1–4 or `null`; a null requires a nonempty `reason` and denotes human N/A. Omit a missing rater from the array; do not invent its score. An empty array is accepted but reported as incomplete reliability evidence.
- `reference` is separate from those raw ratings. `status: rated` requires an integer 1–4. `not_applicable` and `missing` require `score: null` and a reason. A missing adjudication is distinct from a criterion that the task does not elicit.
- `prediction.status` is `scored`, `abstained`, `not_applicable`, `missing`, or `invalid`. Only `scored` accepts an integer 1–4; every other status requires null and a reason. Record schema/transport/validation failures as `invalid` or `missing`, not a fabricated low score. Keep any rejected raw score in the private audit trail, outside this normalized file.
- `prediction.evidenceValid` is optional: true/false for an audited evidence check, null or omitted when unaudited. Describe the audit in study provenance. A false audit remains visible even if the prediction contains a numeric score; numerical agreement does not cancel that failure. A quote's existence is distinct from whether it supports the feedback.
- Optional record-level `versions` must contain exactly the same five values as the file. Different versions are rejected; run separate reports. Prompt identity can legitimately vary within a study, but one response ID cannot silently change its participant, mode, prompt family, prompt ID, or context hashes across criteria.

Every declared mode × criterion appears in the report, including empty groups. For each known response in a mode, the tool expects one cell for each declared criterion: `recordCompleteness` and `missingCriterionRecords` expose absent rows separately from numeric coverage. Include explicit N/A or missing rows when applicable. Entire responses absent from the file cannot be detected. Duplicate response/mode/criterion rows are rejected. Do not duplicate retries as independent responses from new people: keep participant identity stable. This tool does not join development and holdout files or check cross-file leakage; check participant and prompt-family splits before running it.

## Report interpretation

`assessmentStatus` is always `descriptive_report_only`. It is **not** an app validation status. The report includes input SHA-256, study metadata, versions, fixed scale, seed, and per-group results, with no pooled “overall ability” metric.

`modelVersusAdjudicatedReference` includes:

- `n`: number of pairs with both numeric reference and numeric prediction.
- `qwk`: quadratic weighted Cohen κ on the fixed 1–4 categories, using disagreement weight `(reference − prediction)² / 9`. Do not compare coefficients between studies without their rating distributions and design.
- `exact` and `withinOne`: proportions among comparable numeric pairs.
- `mae`: mean absolute level error; `signedError`: mean **prediction minus reference**, so positive means over-scoring.
- `severeErrorRate`: proportion differing by at least two levels.
- `confusionMatrix`: reference levels 1–4 in rows, prediction levels 1–4 in columns.

`coverage` has numeric predictions on eligible reference-rated rows as numerator, **all** reference-rated rows as denominator. Abstained, model-N/A, missing, and invalid predictions stay in that denominator. Reference-N/A and missing-reference rows are counted separately. Both-N/A is never perfect numeric agreement. The report explicitly counts scoring an inapplicable criterion, audited/failed/unaudited evidence, and responses lacking two independent ratings. A never-recorded response cannot be detected; reconcile rows against a study manifest.

`humanHuman.pairs` reports each actual rater pair on their overlapping responses, separately from model–reference results. It includes numeric agreement and applicability disagreements. The adjudicated reference is not added as another human rater. Pair samples overlap, so do not add their counts and call them independent observations. With many rotating raters, pairwise groups can be sparse; use additional suitable all-rater analysis outside this initial tool. Human signed error is second listed rater minus first, not error against a truth standard.

## Undefined values and uncertainty

All no-pair metrics are null. For one numeric pair, direct proportions/errors are descriptive but QWK is null by policy. Identical constant scores have exact agreement 1 yet QWK is null because expected disagreement is zero. Negative QWK is retained. Numeric ratings outside 1–4, strings, NaN, and fractional scores are rejected rather than coerced.

Intervals are seeded, two-sided 95% percentile bootstrap intervals. **Participants**, including their repeated responses within the group, are resampled as clusters. Human-pair intervals resample the jointly rated participant clusters. Input ordering does not change the seeded samples. The current tool does not model prompt-family clustering, stratified sampling weights, multiple comparisons, or direct paired non-inferiority against humans. It is a descriptive starting point, not the complete release analysis.

The report returns null interval bounds and a reason when:

- intervals were disabled;
- the point estimate is undefined;
- fewer than two participant clusters are available;
- fewer than 90% of requested replicates produce a finite estimate;
- bootstrap samples produce no variation, including an apparently perfect sample.

The 90% policy exposes unstable denominators; it is a conservative software policy, not a published sufficiency rule. Valid replicate counts are always shown. All-zero observed errors cannot justify a zero population error bound through an empirical bootstrap; use an appropriate rare-event/boundary analysis in the actual study. The fewer-than-30-participant warning is likewise a descriptive caution, not a validity threshold. Even larger samples can be inadequate, especially after splitting by mode, criterion, or subgroup.

Subgroup analyses, absolute-agreement ICC, multi-rater ordinal reliability, calibrated confidence, and prospective learning studies are deliberately **not computed** by this version. Do not infer them from a successful report. An assessment statistician should choose the remaining methods, sample sizes, acceptable losses, and interval strategy before final holdout evaluation.

## Verified software behavior

`tests/assessment-benchmark.test.mjs` checks independent hand-calculated QWK/error examples, reversed and shifted ratings, empty/constant/singleton cases, coverage and N/A, independent human-pair separation, incompatible metadata, invalid inputs, seeded clustering, sparse/bootstrap boundary handling, and local CLI behavior. These are synthetic software tests, not empirical validation of an LLM or the rubric.
