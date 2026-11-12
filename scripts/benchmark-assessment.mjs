#!/usr/bin/env node
// Offline measurement only. This file never calls a model or changes app state.
import { readFileSync, statSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODES = ["spin_speak", "read_reflect", "debate"];
const CRITERIA = [
  "grounded",
  "reasoned",
  "organised",
  "well_rounded",
  "delivery",
];
const VERSION_KEYS = [
  "rubric",
  "promptTemplate",
  "provider",
  "model",
  "scoringConfig",
];
const METRICS = [
  "qwk",
  "exact",
  "withinOne",
  "mae",
  "signedError",
  "severeErrorRate",
];
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, at) {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${at} must be an object`,
  );
}

function text(value, at) {
  requireValue(
    typeof value === "string" && value.trim().length > 0,
    `${at} must be a nonempty string`,
  );
}

function keys(value, allowed, at) {
  object(value, at);
  for (const key of Object.keys(value))
    requireValue(allowed.includes(key), `${at}: unknown field ${key}`);
}

function score(value, at) {
  requireValue(
    value === null || (Number.isInteger(value) && value >= 1 && value <= 4),
    `${at} must be an integer 1–4 or null`,
  );
}

function stringEnumArray(value, allowed, at) {
  requireValue(
    Array.isArray(value) && value.length > 0,
    `${at} must be a nonempty array`,
  );
  requireValue(
    new Set(value).size === value.length,
    `${at} contains duplicates`,
  );
  value.forEach((entry) =>
    requireValue(
      allowed.includes(entry),
      `${at} contains an unsupported value`,
    ),
  );
}

function versions(value, at) {
  keys(value, VERSION_KEYS, at);
  VERSION_KEYS.forEach((key) => text(value[key], `${at}.${key}`));
}

export function validateDataset(input) {
  keys(input, ["schemaVersion", "dataset", "versions", "records"], "input");
  requireValue(input.schemaVersion === 1, "schemaVersion must be 1");
  const meta = input.dataset;
  keys(
    meta,
    [
      "id",
      "kind",
      "intendedUse",
      "population",
      "language",
      "split",
      "provenance",
      "humanRatingProcess",
      "adjudication",
      "modes",
      "criteria",
    ],
    "dataset",
  );
  for (const field of [
    "id",
    "intendedUse",
    "population",
    "language",
    "provenance",
    "adjudication",
  ])
    text(meta[field], `dataset.${field}`);
  requireValue(
    ["human_rated", "synthetic_demo"].includes(meta.kind),
    "dataset.kind must be human_rated or synthetic_demo",
  );
  requireValue(
    ["pilot", "development", "holdout"].includes(meta.split),
    "dataset.split must be pilot, development, or holdout",
  );
  requireValue(
    meta.humanRatingProcess === "independent_before_adjudication",
    "dataset.humanRatingProcess must declare independent_before_adjudication; the tool cannot verify independence",
  );
  stringEnumArray(meta.modes, MODES, "dataset.modes");
  stringEnumArray(meta.criteria, CRITERIA, "dataset.criteria");
  versions(input.versions, "versions");
  requireValue(Array.isArray(input.records), "records must be an array");
  requireValue(
    input.records.length <= 50000,
    "records exceeds the 50,000-row limit",
  );
  const seen = new Set();
  const responses = new Map();
  let totalAnnotations = 0;
  const coRatingGroups = new Set();
  input.records.forEach((row, index) => {
    const at = `records[${index}]`;
    keys(
      row,
      [
        "responseId",
        "participantId",
        "promptId",
        "promptFamily",
        "responseHash",
        "referenceContextHash",
        "mode",
        "criterion",
        "humanRatings",
        "reference",
        "prediction",
        "versions",
      ],
      at,
    );
    for (const field of [
      "responseId",
      "participantId",
      "promptId",
      "promptFamily",
      "responseHash",
      "referenceContextHash",
    ])
      text(row[field], `${at}.${field}`);
    requireValue(
      meta.modes.includes(row.mode),
      `${at}.mode is not in dataset.modes`,
    );
    requireValue(
      meta.criteria.includes(row.criterion),
      `${at}.criterion is not in dataset.criteria`,
    );
    if (row.versions !== undefined) {
      versions(row.versions, `${at}.versions`);
      for (const key of VERSION_KEYS)
        requireValue(
          row.versions[key] === input.versions[key],
          `${at}: mixed ${key} versions; run separate reports`,
        );
    }
    const identity = JSON.stringify([row.responseId, row.mode, row.criterion]);
    requireValue(
      !seen.has(identity),
      `${at}: duplicate response/mode/criterion`,
    );
    seen.add(identity);
    const context = JSON.stringify([
      row.participantId,
      row.promptId,
      row.promptFamily,
      row.mode,
      row.responseHash,
      row.referenceContextHash,
    ]);
    requireValue(
      !responses.has(row.responseId) ||
        responses.get(row.responseId) === context,
      `${at}: conflicting context for the same responseId`,
    );
    responses.set(row.responseId, context);
    requireValue(
      Array.isArray(row.humanRatings),
      `${at}.humanRatings must be an array`,
    );
    requireValue(
      row.humanRatings.length <= 20,
      `${at}: at most 20 human ratings per record are supported`,
    );
    totalAnnotations += row.humanRatings.length;
    requireValue(
      totalAnnotations <= 200000,
      "Input exceeds the 200,000 human-annotation limit",
    );
    const raters = new Set();
    for (const [ratingIndex, rating] of row.humanRatings.entries()) {
      const ratingAt = `${at}.humanRatings[${ratingIndex}]`;
      keys(rating, ["raterId", "score", "reason"], ratingAt);
      text(rating.raterId, `${ratingAt}.raterId`);
      requireValue(!raters.has(rating.raterId), `${at}: duplicate human rater`);
      raters.add(rating.raterId);
      score(rating.score, `${ratingAt}.score`);
      if (rating.score === null) text(rating.reason, `${ratingAt}.reason`);
      else if (rating.reason !== undefined)
        text(rating.reason, `${ratingAt}.reason`);
    }
    const raterIds = [...raters].sort();
    for (let a = 0; a < raterIds.length; a++) {
      for (let b = a + 1; b < raterIds.length; b++) {
        coRatingGroups.add(
          JSON.stringify([row.mode, row.criterion, raterIds[a], raterIds[b]]),
        );
        requireValue(
          coRatingGroups.size <= 5000,
          "Input exceeds 5,000 co-occurring rater-pair groups; split the study for descriptive reporting",
        );
      }
    }
    keys(row.reference, ["status", "score", "reason"], `${at}.reference`);
    const ref = row.reference;
    requireValue(
      ["rated", "not_applicable", "missing"].includes(ref.status),
      `${at}.reference.status is invalid`,
    );
    score(ref.score, `${at}.reference.score`);
    requireValue(
      (ref.status === "rated") === (ref.score !== null),
      `${at}.reference status and score disagree`,
    );
    if (ref.status !== "rated") text(ref.reason, `${at}.reference.reason`);
    else if (ref.reason !== undefined)
      text(ref.reason, `${at}.reference.reason`);
    keys(
      row.prediction,
      ["status", "score", "reason", "evidenceValid"],
      `${at}.prediction`,
    );
    const pred = row.prediction;
    requireValue(
      ["scored", "abstained", "not_applicable", "missing", "invalid"].includes(
        pred.status,
      ),
      `${at}.prediction.status is invalid`,
    );
    score(pred.score, `${at}.prediction.score`);
    requireValue(
      (pred.status === "scored") === (pred.score !== null),
      `${at}.prediction status and score disagree`,
    );
    if (pred.status !== "scored") text(pred.reason, `${at}.prediction.reason`);
    else if (pred.reason !== undefined)
      text(pred.reason, `${at}.prediction.reason`);
    requireValue(
      pred.evidenceValid === undefined ||
        pred.evidenceValid === null ||
        typeof pred.evidenceValid === "boolean",
      `${at}.prediction.evidenceValid must be boolean or null`,
    );
  });
  return input;
}

/** Fixed four-category ordinal agreement. Rows are reference, columns candidate. */
export function agreement(pairs) {
  requireValue(Array.isArray(pairs), "pairs must be an array");
  const confusionMatrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  let exact = 0;
  let withinOne = 0;
  let absoluteError = 0;
  let signedError = 0;
  let severeError = 0;
  for (const pair of pairs) {
    requireValue(
      Array.isArray(pair) && pair.length === 2,
      "each pair must contain reference and candidate scores",
    );
    for (const value of pair)
      requireValue(
        Number.isInteger(value) && value >= 1 && value <= 4,
        "numeric pairs must contain integers 1–4",
      );
    const [reference, candidate] = pair;
    const difference = candidate - reference;
    const absolute = Math.abs(difference);
    confusionMatrix[reference - 1][candidate - 1]++;
    exact += Number(absolute === 0);
    withinOne += Number(absolute <= 1);
    absoluteError += absolute;
    signedError += difference;
    severeError += Number(absolute >= 2);
  }
  const n = pairs.length;
  let qwk = null;
  let qwkUndefinedReason =
    n === 0 ? "no_numeric_pairs" : n === 1 ? "fewer_than_two_pairs" : null;
  if (n >= 2) {
    const rowTotals = confusionMatrix.map((row) =>
      row.reduce((sum, count) => sum + count, 0),
    );
    const columnTotals = [0, 1, 2, 3].map((column) =>
      confusionMatrix.reduce((sum, row) => sum + row[column], 0),
    );
    let observedDisagreement = 0;
    let expectedDisagreement = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const weight = (r - c) ** 2 / 9;
        observedDisagreement += weight * (confusionMatrix[r][c] / n);
        expectedDisagreement +=
          weight * (rowTotals[r] / n) * (columnTotals[c] / n);
      }
    }
    if (expectedDisagreement === 0)
      qwkUndefinedReason = "zero_expected_disagreement";
    else qwk = 1 - observedDisagreement / expectedDisagreement;
  }
  return {
    n,
    qwk,
    qwkUndefinedReason,
    exact: n ? exact / n : null,
    withinOne: n ? withinOne / n : null,
    mae: n ? absoluteError / n : null,
    signedError: n ? signedError / n : null,
    severeErrorRate: n ? severeError / n : null,
    confusionMatrix,
  };
}

const numericPairs = (rows) =>
  rows
    .filter(
      (row) =>
        row.reference.status === "rated" && row.prediction.status === "scored",
    )
    .map((row) => [row.reference.score, row.prediction.score]);

function modelMetrics(rows) {
  const paired = numericPairs(rows);
  const eligible = rows.filter(
    (row) => row.reference.status === "rated",
  ).length;
  return {
    ...agreement(paired),
    coverage: eligible ? paired.length / eligible : null,
  };
}

function seedHash(seed, key) {
  let hash = seed >>> 0;
  for (const character of key)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash || 0x9e3779b9;
}

function randomGenerator(seed) {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const fractionAbove = position - low;
  return (
    sorted[low] + (sorted[Math.ceil(position)] - sorted[low]) * fractionAbove
  );
}

function bootstrap(rows, evaluate, metricNames, options, key) {
  const byParticipant = new Map();
  // Stable order makes input-row reordering irrelevant to seeded sampling.
  for (const row of [...rows].sort((a, b) =>
    a.responseId.localeCompare(b.responseId),
  )) {
    const cluster = byParticipant.get(row.participantId) ?? [];
    cluster.push(row);
    byParticipant.set(row.participantId, cluster);
  }
  const clusters = [...byParticipant.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, cluster]) => cluster);
  const values = Object.fromEntries(metricNames.map((name) => [name, []]));
  const point = evaluate(rows);
  const rng = randomGenerator(seedHash(options.seed, key));
  if (clusters.length >= 2 && options.bootstrapIterations > 0) {
    for (let i = 0; i < options.bootstrapIterations; i++) {
      const sample = [];
      for (let j = 0; j < clusters.length; j++)
        sample.push(...clusters[Math.floor(rng() * clusters.length)]);
      const metrics = evaluate(sample);
      for (const name of metricNames)
        if (Number.isFinite(metrics[name])) values[name].push(metrics[name]);
    }
  }
  const intervals = {};
  for (const name of metricNames) {
    const distribution = values[name].sort((a, b) => a - b);
    let reason = null;
    if (!options.bootstrapIterations) reason = "disabled";
    else if (!Number.isFinite(point[name])) reason = "undefined_point_estimate";
    else if (clusters.length < 2)
      reason = "fewer_than_two_participant_clusters";
    else if (distribution.length < Math.ceil(options.bootstrapIterations * 0.9))
      reason = "too_many_undefined_replicates";
    else if (distribution[0] === distribution.at(-1))
      reason = "no_resample_variation_not_population_certainty";
    intervals[name] = {
      lower: reason ? null : quantile(distribution, 0.025),
      upper: reason ? null : quantile(distribution, 0.975),
      validReplicates: distribution.length,
      reason,
    };
  }
  return {
    method: "participant_cluster_percentile_bootstrap",
    confidenceLevel: 0.95,
    participantClusters: clusters.length,
    requestedReplicates: options.bootstrapIterations,
    intervals,
  };
}

function humanPairReport(rows, options, groupKey) {
  const raters = [
    ...new Set(
      rows.flatMap((row) => row.humanRatings.map((rating) => rating.raterId)),
    ),
  ].sort();
  // Index pairs that actually co-occur. A rotating rater pool must not cause a
  // scan of every response for every possible pair of global rater IDs.
  const coRated = new Map();
  for (const row of rows) {
    const ids = row.humanRatings.map((rating) => rating.raterId).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = JSON.stringify([ids[i], ids[j]]);
        const entry = coRated.get(key) ?? { a: ids[i], b: ids[j], rows: [] };
        entry.rows.push(row);
        coRated.set(key, entry);
      }
    }
  }
  const pairs = [];
  const entries = [...coRated.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, { a, b, rows: jointlyRated }] of entries) {
    const extract = (row) =>
      [a, b].map(
        (id) => row.humanRatings.find((rating) => rating.raterId === id).score,
      );
    const numeric = (sample) =>
      sample
        .map(extract)
        .filter((pair) => pair.every((value) => value !== null));
    const all = jointlyRated.map(extract);
    pairs.push({
      raterIds: [a, b],
      jointlyRatedResponses: jointlyRated.length,
      applicability: {
        bothNumeric: all.filter((pair) => pair.every((value) => value !== null))
          .length,
        bothNotApplicable: all.filter((pair) =>
          pair.every((value) => value === null),
        ).length,
        disagree: all.filter(
          (pair) => pair.filter((value) => value === null).length === 1,
        ).length,
      },
      agreement: agreement(numeric(jointlyRated)),
      confidenceIntervals: bootstrap(
        jointlyRated,
        (sample) => agreement(numeric(sample)),
        METRICS,
        options,
        `${groupKey}:human:${a}:${b}`,
      ),
    });
  }
  return {
    raterCount: raters.length,
    pairs,
    note: "Independent human pairs only; adjudicated references are not human raters. Pair counts must not be treated as independent response sample sizes.",
  };
}

function groupReport(rows, mode, criterion, options, expectedResponseCells) {
  const eligible = rows.filter((row) => row.reference.status === "rated");
  const countPrediction = (status) =>
    eligible.filter((row) => row.prediction.status === status).length;
  const counts = {
    records: rows.length,
    expectedResponseCriterionCells: expectedResponseCells,
    missingCriterionRecords: expectedResponseCells - rows.length,
    participants: new Set(rows.map((row) => row.participantId)).size,
    promptFamilies: new Set(rows.map((row) => row.promptFamily)).size,
    referenceEligible: eligible.length,
    referenceNotApplicable: rows.filter(
      (row) => row.reference.status === "not_applicable",
    ).length,
    referenceMissing: rows.filter((row) => row.reference.status === "missing")
      .length,
    scoredEligible: countPrediction("scored"),
    abstainedEligible: countPrediction("abstained"),
    predictedNotApplicableEligible: countPrediction("not_applicable"),
    missingEligible: countPrediction("missing"),
    invalidEligible: countPrediction("invalid"),
    scoredOnReferenceNotApplicable: rows.filter(
      (row) =>
        row.reference.status === "not_applicable" &&
        row.prediction.status === "scored",
    ).length,
    bothNotApplicable: rows.filter(
      (row) =>
        row.reference.status === "not_applicable" &&
        row.prediction.status === "not_applicable",
    ).length,
    evidenceAudited: rows.filter(
      (row) => typeof row.prediction.evidenceValid === "boolean",
    ).length,
    evidenceValid: rows.filter((row) => row.prediction.evidenceValid === true)
      .length,
    evidenceInvalid: rows.filter(
      (row) => row.prediction.evidenceValid === false,
    ).length,
    evidenceNotAudited: rows.filter(
      (row) => typeof row.prediction.evidenceValid !== "boolean",
    ).length,
    responsesWithTwoOrMoreIndependentRatings: rows.filter(
      (row) => row.humanRatings.length >= 2,
    ).length,
    responsesWithFewerThanTwoIndependentRatings: rows.filter(
      (row) => row.humanRatings.length < 2,
    ).length,
  };
  const groupKey = `${mode}:${criterion}`;
  const warnings = [];
  if (!rows.length)
    warnings.push(
      "No records for this declared mode/criterion; absence is not success.",
    );
  if (counts.missingCriterionRecords)
    warnings.push(
      "Some known responses have no row for this criterion. Numeric coverage is conditional on recorded reference eligibility, not completeness of the study.",
    );
  if (counts.referenceMissing)
    warnings.push(
      "Missing adjudicated references are excluded from error/coverage denominators and remain visible in counts.",
    );
  if (counts.responsesWithFewerThanTwoIndependentRatings)
    warnings.push(
      "Some responses have fewer than two independent ratings; reference reliability is incomplete.",
    );
  if (counts.evidenceNotAudited)
    warnings.push(
      "Evidence correctness is unaudited for some predictions. Exact-span validity also does not establish semantic relevance.",
    );
  if (counts.evidenceInvalid)
    warnings.push(
      "Evidence validation failures are reported separately; numeric agreement is not sufficient for accepted feedback.",
    );
  if (counts.participants < 30)
    warnings.push(
      "Fewer than 30 participant clusters: this is a descriptive precision warning, not a validated minimum or automatic suppression rule.",
    );
  const eligibleReasons = {};
  for (const row of eligible)
    if (row.prediction.status !== "scored") {
      const key = `${row.prediction.status}: ${row.prediction.reason}`;
      eligibleReasons[key] = (eligibleReasons[key] ?? 0) + 1;
    }
  return {
    mode,
    criterion,
    counts,
    recordCompleteness: {
      numerator: rows.length,
      denominator: expectedResponseCells,
      rate: expectedResponseCells ? rows.length / expectedResponseCells : null,
    },
    modelVersusAdjudicatedReference: agreement(numericPairs(rows)),
    coverage: {
      numerator: counts.scoredEligible,
      denominator: counts.referenceEligible,
      rate: counts.referenceEligible
        ? counts.scoredEligible / counts.referenceEligible
        : null,
    },
    unscoredEligibleReasons: eligibleReasons,
    confidenceIntervals: bootstrap(
      rows,
      modelMetrics,
      [...METRICS, "coverage"],
      options,
      `${groupKey}:model`,
    ),
    humanHuman: humanPairReport(rows, options, groupKey),
    warnings,
  };
}

export function buildReport(input, options = {}) {
  validateDataset(input);
  keys(options, ["bootstrapIterations", "seed"], "options");
  const settings = {
    bootstrapIterations: options.bootstrapIterations ?? 2000,
    seed: options.seed ?? 20261030,
  };
  requireValue(
    Number.isInteger(settings.bootstrapIterations) &&
      settings.bootstrapIterations >= 0 &&
      settings.bootstrapIterations <= 10000,
    "bootstrapIterations must be an integer 0–10000",
  );
  requireValue(
    Number.isInteger(settings.seed) &&
      settings.seed >= 0 &&
      settings.seed <= 0xffffffff,
    "seed must be a uint32 integer",
  );
  const pairRows = input.records.reduce(
    (sum, row) =>
      sum + (row.humanRatings.length * (row.humanRatings.length - 1)) / 2,
    0,
  );
  requireValue(
    (input.records.length + pairRows) * settings.bootstrapIterations <=
      50000000,
    "Requested bootstrap exceeds the 50-million row-resample work limit; reduce --bootstrap or split the study",
  );
  const groups = [];
  for (const mode of input.dataset.modes) {
    const modeRows = input.records.filter((row) => row.mode === mode);
    const expectedResponseCells = new Set(modeRows.map((row) => row.responseId))
      .size;
    for (const criterion of input.dataset.criteria) {
      groups.push(
        groupReport(
          modeRows.filter((row) => row.criterion === criterion),
          mode,
          criterion,
          settings,
          expectedResponseCells,
        ),
      );
    }
  }
  return {
    reportVersion: 1,
    assessmentStatus: "descriptive_report_only",
    dataset: input.dataset,
    versions: input.versions,
    scale: [1, 2, 3, 4],
    options: settings,
    records: input.records.length,
    uniqueResponses: new Set(input.records.map((row) => row.responseId)).size,
    groups,
    limitations: [
      ...(input.dataset.kind === "synthetic_demo"
        ? [
            "SYNTHETIC DEMO ONLY: these ratings are fabricated for software checks, not calibration or validation evidence.",
          ]
        : []),
      "This tool trusts declared annotation provenance; it cannot establish rater independence, construct validity, representativeness, or split integrity.",
      "Agreement is conditional on available numeric pairs. Coverage, missingness, applicability, and evidence failures must be reviewed alongside it.",
      "Participant-cluster bootstrap does not model prompt-family clustering or justify generalization to new tasks; sparse and boundary intervals may be null.",
      "Bootstrap intervals are exploratory, unadjusted for multiple comparisons, and are not a release decision or a human-equivalence test.",
      "No subgroup fairness, ICC, all-rater reliability, learning efficacy, or calibrated-confidence claim is produced.",
    ],
  };
}

export function runCli(args) {
  requireValue(
    args.length > 0 && !args[0].startsWith("--"),
    "Usage: node scripts/benchmark-assessment.mjs ratings.json [--bootstrap 2000] [--seed 20261030]",
  );
  const file = args[0];
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const name = { "--bootstrap": "bootstrapIterations", "--seed": "seed" }[
      args[i]
    ];
    requireValue(
      Boolean(name) &&
        args[i + 1] !== undefined &&
        !Object.hasOwn(options, name),
      "Use each supported option once with a numeric value: --bootstrap, --seed",
    );
    requireValue(
      /^\d+$/.test(args[i + 1]),
      "CLI option values must be nonnegative integers",
    );
    options[name] = Number(args[i + 1]);
  }
  const fileStat = statSync(file);
  requireValue(
    fileStat.isFile() && fileStat.size <= MAX_INPUT_BYTES,
    "Input must be a regular local JSON file no larger than 20 MiB",
  );
  const source = readFileSync(file, "utf8");
  requireValue(
    Buffer.byteLength(source, "utf8") <= MAX_INPUT_BYTES,
    "Input exceeds 20 MiB",
  );
  const report = buildReport(JSON.parse(source), options);
  return {
    ...report,
    inputSha256: createHash("sha256").update(source).digest("hex"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCli(process.argv.slice(2)), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`Benchmark error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
