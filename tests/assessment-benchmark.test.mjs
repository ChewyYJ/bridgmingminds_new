import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  agreement,
  buildReport,
  runCli,
  validateDataset,
} from "../scripts/benchmark-assessment.mjs";

// Invented numbers verify arithmetic and failure handling, never scorer accuracy.
const score = (value) =>
  value === null
    ? {
        status: "abstained",
        score: null,
        reason: "synthetic insufficient context",
      }
    : { status: "scored", score: value, evidenceValid: true };

function fixture(
  pairs = [
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ],
) {
  return {
    schemaVersion: 1,
    dataset: {
      id: "synthetic-math-fixture",
      kind: "synthetic_demo",
      intendedUse: "Software checks only",
      population: "No real participants",
      language: "en",
      split: "pilot",
      provenance: "Invented integer arrays, not human annotation",
      humanRatingProcess: "independent_before_adjudication",
      adjudication: "Invented reference values for arithmetic tests",
      modes: ["spin_speak"],
      criteria: ["grounded"],
    },
    versions: {
      rubric: "synthetic-rubric",
      promptTemplate: "synthetic-template",
      provider: "none",
      model: "synthetic-model",
      scoringConfig: "math-fixture-v1",
    },
    records: pairs.map(([reference, prediction], index) => ({
      responseId: `response-${index}`,
      participantId: `participant-${index}`,
      promptId: "synthetic-prompt",
      promptFamily: "synthetic-family",
      responseHash: `synthetic-response-${index}`,
      referenceContextHash: "synthetic-context",
      mode: "spin_speak",
      criterion: "grounded",
      humanRatings: [
        { raterId: "rater-a", score: reference },
        { raterId: "rater-b", score: reference },
      ],
      reference: { status: "rated", score: reference },
      prediction: score(prediction),
    })),
  };
}

const group = (input, options = { bootstrapIterations: 0 }) =>
  buildReport(input, options).groups[0];
const near = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `${actual} differs from ${expected}`,
  );

test("four-level arithmetic matches independently calculated QWK and direct errors", () => {
  const result = agreement([
    [1, 1],
    [2, 4],
    [3, 2],
    [4, 3],
  ]);
  // Squared observed difference = 6/4; independent marginals = 2.5.
  near(result.qwk, 0.4);
  assert.equal(result.exact, 0.25);
  assert.equal(result.withinOne, 0.75);
  assert.equal(result.mae, 1);
  assert.equal(result.signedError, 0);
  assert.equal(result.severeErrorRate, 0.25);
  assert.deepEqual(result.confusionMatrix, [
    [1, 0, 0, 0],
    [0, 0, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ]);
});

test("QWK detects systematic offset and reversals despite orderly ratings", () => {
  const shifted = agreement([
    [1, 2],
    [2, 3],
    [3, 4],
  ]);
  near(shifted.qwk, 4 / 7);
  assert.equal(shifted.exact, 0);
  assert.equal(shifted.withinOne, 1);
  assert.equal(shifted.signedError, 1);
  near(
    agreement([
      [1, 4],
      [2, 3],
      [3, 2],
      [4, 1],
    ]).qwk,
    -1,
  );
  assert.equal(
    agreement([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]).qwk,
    1,
  );
});

test("empty, singleton, and constant agreement do not invent perfect QWK", () => {
  const empty = agreement([]);
  assert.equal(empty.n, 0);
  for (const field of [
    "qwk",
    "exact",
    "withinOne",
    "mae",
    "signedError",
    "severeErrorRate",
  ])
    assert.equal(empty[field], null);
  assert.equal(empty.qwkUndefinedReason, "no_numeric_pairs");
  const singleton = agreement([[2, 2]]);
  assert.equal(singleton.exact, 1);
  assert.equal(singleton.qwk, null);
  assert.equal(singleton.qwkUndefinedReason, "fewer_than_two_pairs");
  const constant = agreement([
    [3, 3],
    [3, 3],
    [3, 3],
  ]);
  assert.equal(constant.exact, 1);
  assert.equal(constant.qwk, null);
  assert.equal(constant.qwkUndefinedReason, "zero_expected_disagreement");
  assert.equal(
    agreement([
      [1, 2],
      [1, 2],
    ]).qwk,
    0,
  );
});

test("coverage retains abstentions, missing, invalid, and model N/A while excluding reference N/A and missing", () => {
  const data = fixture(Array.from({ length: 8 }, () => [2, 2]));
  data.records[1].prediction = score(null);
  data.records[2].prediction = {
    status: "missing",
    score: null,
    reason: "No saved output",
  };
  data.records[3].prediction = {
    status: "invalid",
    score: null,
    reason: "Schema failed",
    evidenceValid: false,
  };
  data.records[4].prediction = {
    status: "not_applicable",
    score: null,
    reason: "Model declined criterion",
  };
  data.records[5].reference = {
    status: "not_applicable",
    score: null,
    reason: "Task does not elicit criterion",
  };
  data.records[6].reference = {
    status: "missing",
    score: null,
    reason: "Awaiting adjudication",
  };
  data.records[7].reference = {
    status: "not_applicable",
    score: null,
    reason: "Task does not elicit criterion",
  };
  data.records[7].prediction = {
    status: "not_applicable",
    score: null,
    reason: "Task does not elicit criterion",
  };
  const result = group(data);
  assert.deepEqual(result.coverage, {
    numerator: 1,
    denominator: 5,
    rate: 0.2,
  });
  assert.equal(result.modelVersusAdjudicatedReference.n, 1);
  assert.equal(result.modelVersusAdjudicatedReference.exact, 1);
  assert.equal(result.counts.referenceNotApplicable, 2);
  assert.equal(result.counts.referenceMissing, 1);
  assert.equal(result.counts.scoredOnReferenceNotApplicable, 1);
  assert.equal(result.counts.bothNotApplicable, 1);
  for (const field of [
    "abstainedEligible",
    "predictedNotApplicableEligible",
    "missingEligible",
    "invalidEligible",
  ])
    assert.equal(result.counts[field], 1);
  assert.equal(result.counts.evidenceAudited, 4);
  assert.equal(result.counts.evidenceInvalid, 1);
  assert.equal(result.counts.evidenceNotAudited, 4);
});

test("all unscored or inapplicable outputs have no numeric agreement", () => {
  const data = fixture([
    [1, null],
    [4, null],
  ]);
  let result = group(data);
  assert.equal(result.coverage.rate, 0);
  assert.equal(result.modelVersusAdjudicatedReference.exact, null);
  data.records.forEach((row) => {
    row.reference = {
      status: "not_applicable",
      score: null,
      reason: "Synthetic inapplicability",
    };
    row.prediction = {
      status: "not_applicable",
      score: null,
      reason: "Synthetic inapplicability",
    };
  });
  result = group(data);
  assert.equal(result.coverage.rate, null);
  assert.equal(result.modelVersusAdjudicatedReference.qwk, null);
  assert.equal(result.modelVersusAdjudicatedReference.exact, null);
});

test("raw independent human agreement is separate from the adjudicated reference", () => {
  const data = fixture([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ]);
  data.records.forEach((row) => {
    row.humanRatings[1].score = 5 - row.humanRatings[0].score;
  });
  const result = group(data);
  assert.equal(result.modelVersusAdjudicatedReference.qwk, 1);
  assert.equal(result.humanHuman.raterCount, 2);
  assert.equal(result.humanHuman.pairs.length, 1);
  near(result.humanHuman.pairs[0].agreement.qwk, -1);
  assert.deepEqual(result.humanHuman.pairs[0].raterIds, ["rater-a", "rater-b"]);
  assert.equal(result.humanHuman.pairs[0].jointlyRatedResponses, 4);
});

test("human N/A and missing raters are not converted to numeric zero or consensus", () => {
  const data = fixture([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ]);
  data.records[0].humanRatings[0] = {
    raterId: "rater-a",
    score: null,
    reason: "Not elicited",
  };
  data.records[1].humanRatings = ["rater-a", "rater-b"].map((raterId) => ({
    raterId,
    score: null,
    reason: "Not elicited",
  }));
  data.records[2].humanRatings = [];
  const result = group(data);
  const pair = result.humanHuman.pairs[0];
  assert.equal(pair.jointlyRatedResponses, 3);
  assert.deepEqual(pair.applicability, {
    bothNumeric: 1,
    bothNotApplicable: 1,
    disagree: 1,
  });
  assert.equal(pair.agreement.n, 1);
  assert.equal(pair.agreement.qwk, null);
  assert.equal(result.counts.responsesWithFewerThanTwoIndependentRatings, 1);
});

test("modes/criteria stay separate and declared missing groups remain visible", () => {
  const data = fixture([
    [1, 1],
    [4, 1],
  ]);
  data.dataset.modes.push("debate");
  data.dataset.criteria.push("reasoned");
  data.records[1].mode = "debate";
  data.records[1].criterion = "reasoned";
  const report = buildReport(data, { bootstrapIterations: 0 });
  assert.equal(report.groups.length, 4);
  assert.equal(
    report.groups.find(
      (entry) => entry.mode === "spin_speak" && entry.criterion === "grounded",
    ).modelVersusAdjudicatedReference.mae,
    0,
  );
  assert.equal(
    report.groups.find(
      (entry) => entry.mode === "debate" && entry.criterion === "reasoned",
    ).modelVersusAdjudicatedReference.mae,
    3,
  );
  const empty = report.groups.find(
    (entry) => entry.mode === "spin_speak" && entry.criterion === "reasoned",
  );
  assert.equal(empty.counts.records, 0);
  assert.equal(empty.coverage.rate, null);
  assert.match(empty.warnings[0], /No records/);
});

test("invalid scores, inconsistent status, duplicate annotation, and incompatible versions are rejected", () => {
  for (const invalid of [0, 5, 1.5, "2", false, undefined, NaN, Infinity]) {
    const data = fixture();
    data.records[0].prediction.score = invalid;
    assert.throws(() => validateDataset(data), /integer 1–4 or null/);
    assert.throws(() => agreement([[1, invalid]]), /integers 1–4/);
  }
  const cases = [
    [
      (data) => {
        data.records[0].reference.score = 0;
      },
      /integer 1–4/,
    ],
    [
      (data) => {
        data.records[0].humanRatings[0].score = 4.5;
      },
      /integer 1–4/,
    ],
    [
      (data) => {
        data.records[0].prediction.score = null;
      },
      /status and score disagree/,
    ],
    [
      (data) => {
        data.records[0].prediction = { status: "abstained", score: null };
      },
      /reason/,
    ],
    [
      (data) => {
        data.records[0].reference = { status: "rated", score: null };
      },
      /status and score disagree/,
    ],
    [
      (data) => {
        data.records[0].humanRatings.push({ raterId: "rater-a", score: 1 });
      },
      /duplicate human rater/,
    ],
    [
      (data) => {
        data.records.push(structuredClone(data.records[0]));
      },
      /duplicate response/,
    ],
    [
      (data) => {
        data.records[0].prediction.confidence = "high";
      },
      /unknown field confidence/,
    ],
    [
      (data) => {
        data.versions.rubric = "";
      },
      /nonempty string/,
    ],
  ];
  for (const [change, pattern] of cases) {
    const data = fixture();
    change(data);
    assert.throws(() => validateDataset(data), pattern);
  }
  for (const key of [
    "model",
    "promptTemplate",
    "rubric",
    "provider",
    "scoringConfig",
  ]) {
    const data = fixture();
    data.records[0].versions = { ...data.versions, [key]: "different-version" };
    assert.throws(() => validateDataset(data), /mixed .* versions/);
  }
});

test("same response cannot silently change participant, source, or prompt context across criteria", () => {
  const data = fixture();
  data.dataset.criteria.push("reasoned");
  const duplicate = structuredClone(data.records[0]);
  duplicate.criterion = "reasoned";
  duplicate.referenceContextHash = "different-source";
  data.records.push(duplicate);
  assert.throws(() => validateDataset(data), /conflicting context/);
});

test("missing criterion cells remain visible even when recorded numeric coverage is perfect", () => {
  const data = fixture(
    Array.from({ length: 100 }, (_, index) => [
      (index % 4) + 1,
      (index % 4) + 1,
    ]),
  );
  data.dataset.criteria.push("reasoned");
  data.records.push({
    ...structuredClone(data.records[0]),
    criterion: "reasoned",
  });
  const result = buildReport(data, { bootstrapIterations: 0 }).groups.find(
    (entry) => entry.criterion === "reasoned",
  );
  assert.deepEqual(result.coverage, { numerator: 1, denominator: 1, rate: 1 });
  assert.deepEqual(result.recordCompleteness, {
    numerator: 1,
    denominator: 100,
    rate: 0.01,
  });
  assert.equal(result.counts.missingCriterionRecords, 99);
  assert.match(result.warnings.join(" "), /no row for this criterion/);
  // Missing rows have unknown eligibility; no fabricated null reference or score.
  assert.equal(result.counts.referenceMissing, 0);
});

test("rotating rater pools report only actually co-occurring pairs", () => {
  const data = fixture(Array.from({ length: 500 }, () => [2, 2]));
  data.records.forEach((row, index) => {
    row.humanRatings = [
      { raterId: `unique-${index}-a`, score: 2 },
      { raterId: `unique-${index}-b`, score: 2 },
    ];
  });
  const result = group(data);
  assert.equal(result.humanHuman.raterCount, 1000);
  assert.equal(result.humanHuman.pairs.length, 500);
  assert.ok(
    result.humanHuman.pairs.every((pair) => pair.jointlyRatedResponses === 1),
  );
});

test("annotation and resampling limits fail explicitly before excessive reporting work", () => {
  const tooManyRaters = fixture();
  tooManyRaters.records[0].humanRatings = Array.from(
    { length: 21 },
    (_, index) => ({ raterId: `rater-${index}`, score: 2 }),
  );
  assert.throws(
    () => validateDataset(tooManyRaters),
    /at most 20 human ratings/,
  );
  const tooManyPairGroups = fixture(Array.from({ length: 27 }, () => [2, 2]));
  tooManyPairGroups.records.forEach((row, index) => {
    row.humanRatings = Array.from({ length: 20 }, (_, raterIndex) => ({
      raterId: `rater-${index}-${raterIndex}`,
      score: 2,
    }));
  });
  assert.throws(() => validateDataset(tooManyPairGroups), /5,000 co-occurring/);
  const expensive = fixture(Array.from({ length: 3000 }, () => [2, 2]));
  assert.throws(
    () => buildReport(expensive, { bootstrapIterations: 10000 }),
    /row-resample work limit/,
  );
});

test("seeded intervals are reproducible, respect participant clusters, and expose undefined cases", () => {
  const pairs = Array.from({ length: 48 }, (_, index) => {
    const reference = (index % 4) + 1;
    const prediction =
      index % 5 === 0
        ? null
        : index % 3 === 0
          ? Math.max(1, reference - 1)
          : reference;
    return [reference, prediction];
  });
  const data = fixture(pairs);
  const settings = { bootstrapIterations: 200, seed: 123 };
  const first = group(data, settings).confidenceIntervals;
  const second = group(data, settings).confidenceIntervals;
  assert.deepEqual(first, second);
  data.records.reverse();
  assert.deepEqual(group(data, settings).confidenceIntervals, first);
  assert.equal(first.participantClusters, 48);
  assert.equal(first.intervals.mae.validReplicates, 200);
  assert.equal(first.intervals.mae.reason, null);
  assert.ok(first.intervals.mae.lower < first.intervals.mae.upper);
  assert.ok(
    first.intervals.coverage.lower > 0 && first.intervals.coverage.upper <= 1,
  );
  data.records.forEach((row) => {
    row.participantId = "same-person";
  });
  const clustered = group(data, settings).confidenceIntervals;
  assert.equal(clustered.participantClusters, 1);
  assert.equal(clustered.intervals.mae.lower, null);
  assert.equal(
    clustered.intervals.mae.reason,
    "fewer_than_two_participant_clusters",
  );
});

test("perfect observed results do not acquire zero-width population-certainty intervals", () => {
  const result = group(
    fixture(Array.from({ length: 20 }, (_, i) => [(i % 4) + 1, (i % 4) + 1])),
    { bootstrapIterations: 100, seed: 42 },
  );
  assert.equal(result.modelVersusAdjudicatedReference.exact, 1);
  assert.equal(result.modelVersusAdjudicatedReference.qwk, 1);
  assert.equal(result.confidenceIntervals.intervals.exact.lower, null);
  assert.equal(
    result.confidenceIntervals.intervals.exact.reason,
    "no_resample_variation_not_population_certainty",
  );
  assert.equal(
    result.confidenceIntervals.intervals.severeErrorRate.upper,
    null,
  );
  const constant = group(
    fixture([
      [2, 2],
      [2, 2],
    ]),
    { bootstrapIterations: 100 },
  );
  assert.equal(
    constant.confidenceIntervals.intervals.qwk.reason,
    "undefined_point_estimate",
  );
});

test("sparse QWK bootstrap denominators are surfaced rather than silently dropped", () => {
  const result = group(
    fixture([
      [1, 1],
      [4, 4],
    ]),
    { bootstrapIterations: 200, seed: 7 },
  );
  const interval = result.confidenceIntervals.intervals.qwk;
  assert.ok(interval.validReplicates < 180 && interval.validReplicates > 0);
  assert.equal(interval.reason, "too_many_undefined_replicates");
  assert.equal(interval.lower, null);
});

test("CLI reads local data, preserves input, labels synthetic reports, and has no network transport", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mindgarden-benchmark-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "ratings.json");
  const content = JSON.stringify(fixture());
  writeFileSync(file, content);
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Network must never be used");
  });
  const result = runCli([file, "--bootstrap", "0", "--seed", "9"]);
  assert.equal(result.assessmentStatus, "descriptive_report_only");
  assert.match(result.limitations[0], /SYNTHETIC DEMO ONLY/);
  assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(readFileSync(file, "utf8"), content);
  assert.equal(Object.hasOwn(result, "validated"), false);
  const executable = spawnSync(
    process.execPath,
    ["scripts/benchmark-assessment.mjs", file, "--bootstrap", "0"],
    { encoding: "utf8" },
  );
  assert.equal(executable.status, 0, executable.stderr);
  assert.equal(JSON.parse(executable.stdout).records, 4);
  const failed = spawnSync(
    process.execPath,
    ["scripts/benchmark-assessment.mjs", file, "--calibrated", "1"],
    { encoding: "utf8" },
  );
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /Benchmark error/);
  assert.throws(
    () => runCli(["https://example.invalid/ratings.json"]),
    /ENOENT/,
  );
  assert.throws(() => runCli([file, "--bootstrap", "10001"]), /0–10000/);
  assert.throws(() => runCli([file, "--seed", "-1"]), /nonnegative integers/);
  assert.throws(() => runCli([file, "--seed", "2", "--seed", "3"]), /once/);
});
