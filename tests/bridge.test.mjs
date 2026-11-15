import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBridge,
  validateBridge,
  BRIDGE_RESPONSE_FORMAT,
} from "../server/bridge-evaluator.mjs";
import {
  bridgeApplicability,
  getBridgeRubric,
} from "../shared/bridge-rubric.mjs";
import { layoutThoughtMap } from "../shared/thought-map-layout.mjs";
import {
  THOUGHT_MAP_SAMPLE,
  THOUGHT_MAP_SAMPLE_TEXT,
} from "../shared/thought-map-sample.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";

const text =
  "🌱 A shared garden can help neighbours meet. Caring for it gives people a reason to talk.";
const attempt = { id: "bridge-fixture", text, mode: "spin_speak" };
const session = {
  prompt: {
    question: "How could a garden help a community?",
    bridgeDimensions: ["B", "R", "I", "G", "E"],
  },
};
const validate = (raw) =>
  validateBridge(raw, attempt, session, "offline-model-snapshot", "openai");

test("BRIDGE has six original four-level criteria, guarded task applicability and explicit research limits", () => {
  const rubric = getBridgeRubric();
  assert.deepEqual(
    rubric.criteria.map((criterion) => criterion.key),
    ["B", "R", "I", "D", "G", "E"],
  );
  assert.ok(
    rubric.criteria.every((criterion) => criterion.levels.length === 4),
  );
  assert.match(rubric.limitations.join(" "), /not been validated/);
  assert.deepEqual(bridgeApplicability({ bridgeDimensions: ["B", "G", "E"] }), [
    "B",
    "G",
    "E",
  ]);
  assert.throws(() => bridgeApplicability({ bridgeDimensions: ["B", "B"] }));
  assert.throws(() =>
    bridgeApplicability({ bridgeDimensions: ["intelligence"] }),
  );
  rubric.criteria[0].levels[0] = "corrupted";
  assert.notEqual(getBridgeRubric().criteria[0].levels[0], "corrupted");
  const format = BRIDGE_RESPONSE_FORMAT.json_schema;
  assert.equal(format.strict, true);
  assert.equal(format.schema.additionalProperties, false);
  assert.equal(format.schema.properties.dimensions.minItems, 6);
  assert.equal(format.schema.properties.dimensions.maxItems, 6);
});

test("quotes and graph spans are anchored to the actual Unicode answer, with provenance owned by the server", () => {
  const result = validate(bridgeFixture(text));
  assert.equal(result.rubric_version, "bridge-v1");
  assert.equal(result.model_version, "offline-model-snapshot");
  assert.equal(result.overall_score, null);
  for (const dimension of result.dimensions)
    for (const span of dimension.evidence_spans)
      assert.equal(text.slice(span.start, span.end), span.quote);
  for (const node of result.thought_map.nodes) {
    if (node.status === "explicit")
      assert.equal(
        text.slice(node.source_span.start, node.source_span.end),
        node.quote,
      );
    else assert.equal(node.source_span, undefined);
  }
  assert.equal(
    result.thought_map.nodes.find((node) => node.id === "link").text,
    null,
  );
  assert.equal(
    result.thought_map.nodes.find((node) => node.id === "limit").quote,
    undefined,
  );
  assert.equal(
    result.dimensions.find((dimension) => dimension.key === "D").level,
    null,
  );
});

test("unelicited dimensions are forced to N/A; insufficient evidence is distinct from level 1", () => {
  const raw = bridgeFixture(text, ["B", "R", "I", "D", "G", "E"]);
  raw.dimensions.find((dimension) => dimension.key === "I").level = null;
  raw.dimensions.find((dimension) => dimension.key === "I").status =
    "insufficient_evidence";
  const result = validate(raw);
  assert.equal(
    result.dimensions.find((dimension) => dimension.key === "D").status,
    "not_assessed",
  );
  assert.equal(
    result.dimensions.find((dimension) => dimension.key === "I").status,
    "insufficient_evidence",
  );
  assert.equal(
    result.dimensions.find((dimension) => dimension.key === "B").level,
    3,
  );
  const story = validateBridge(
    raw,
    attempt,
    { prompt: { bridgeDimensions: ["B", "G", "E"] } },
    "offline",
    "openai",
  );
  assert.ok(
    story.dimensions
      .filter((dimension) => ["R", "I", "D"].includes(dimension.key))
      .every((dimension) => dimension.level === null),
  );
});

test("map separates planning evidence, spoken development, and suggestions", () => {
  const planningNotes = "🌱 Share tools with neighbours.";
  const note = "Share tools with neighbours.";
  const raw = bridgeFixture(text, undefined, note);
  const result = validateBridge(raw, { ...attempt, planningNotes }, session, "offline", "openai");
  const map = result.thought_map;
  assert.equal(map.version, "thought-map-v2");
  assert.equal(map.topic, session.prompt.question);
  assert.equal(map.comparedNotes, true);
  assert.equal(map.nodes[0].development, "developed");
  assert.equal(map.nodes[1].development, "needs_elaboration");
  assert.equal(map.nodes[2].status, "missing");
  const planned = map.nodes.find((node) => node.id === "planned");
  assert.equal(planned.status, "brainstorm_only");
  assert.equal(planned.source_span, undefined);
  assert.equal(planningNotes.slice(planned.note_span.start, planned.note_span.end), note);
  assert.throws(() => validate(raw), { code: "assessment_invalid_response" });
  assert.throws(
    () => validateBridge(raw, { ...attempt, text: text + " SHARE TOOLS WITH NEIGHBOURS!", planningNotes }, session, "offline", "openai"),
    { code: "assessment_invalid_response" },
  );
});

test("live evaluation keeps exact excerpts and omits unsafe branches and cycles", () => {
  const note = "Share tools with neighbours.";
  const raw = bridgeFixture(text, undefined, note);
  const [claim, reason, gap] = raw.argument_graph.nodes;
  claim.text = "A summary of the claim.";
  claim.note_quote = "This was never planned.";
  reason.source_quote = "This was never said.";
  gap.text = "This cannot be attributed to the learner.";
  raw.argument_graph.edges.push(
    { id: "a", source: "claim", target: "planned", relation: "qualifies" },
    { id: "b", source: "planned", target: "claim", relation: "supports" },
  );
  const result = validateBridge(
    raw,
    { ...attempt, planningNotes: note },
    session,
    "offline",
    "openai",
    { allowPartial: true },
  );
  assert.ok(result.dimensions.some(({ level }) => level !== null));
  const map = result.thought_map;
  assert.equal(map.validationIncomplete, true);
  assert.deepEqual(map.nodes.map(({ id }) => id), ["claim", "limit", "planned"]);
  assert.equal(map.nodes[0].text, claim.source_quote);
  assert.equal(map.nodes[0].note_span, undefined);
  assert.equal(map.nodes[2].text, note);
  assert.deepEqual(map.edges.map(({ id }) => id), ["e3", "planned-support"]);

  claim.source_quote = "Another fabricated quote.";
  const noEvidence = validateBridge(
    raw,
    { ...attempt, planningNotes: note },
    session,
    "offline",
    "openai",
    { allowPartial: true },
  );
  assert.deepEqual(noEvidence.thought_map.nodes, []);
  assert.equal(noEvidence.thought_map.validationIncomplete, true);
  assert.deepEqual(noEvidence.feedback, result.feedback);
});

test("invalid optional vocabulary cannot discard a valid map or retain fabricated usage", () => {
  const raw = bridgeFixture(text);
  const excerpt = raw.argument_graph.nodes[0].source_quote;
  const candidate = {
    word_id: "collaborate",
    source_quote: excerpt,
    reason: "Try this word for working together.",
    improvement_type: "optional_enrichment",
    confidence: "high",
  };
  raw.vocabulary_candidates = [
    { ...candidate, source_quote: "Fabricated quotation." },
    candidate,
    candidate,
  ];
  raw.productive_uses = [
    { word_id: "collaborate", source_quote: excerpt, confidence: "high" },
  ];
  const result = validateBridge(raw, attempt, session, "offline", "openai", { allowPartial: true });
  assert.equal(result.thought_map.nodes.length, 4);
  assert.equal(result.thought_map.validationIncomplete, undefined);
  assert.deepEqual(result.wordbloom.candidates.map(({ wordId }) => wordId), ["collaborate"]);
  assert.deepEqual(result.wordbloom.uses, []);
});

test("local mode never turns keywords into ratings, claims or inferred reasoning", async () => {
  const answer = {
    ...attempt,
    text: "Because therefore however evidence example claim qualifier rebuttal.",
  };
  const result = await evaluateBridge(answer, session, { apiKey: "" });
  assert.ok(result.dimensions.every((dimension) => dimension.level === null));
  assert.deepEqual(result.thought_map.nodes, []);
  assert.deepEqual(result.thought_map.edges, []);
  assert.equal(result.thought_map.status, "not_assessed");
  assert.equal(result.provider, "local");
});

for (const [name, mutate] of [
  [
    "invented quote",
    (raw) => {
      raw.dimensions[0].evidence_quotes = ["Never said by the learner."];
    },
  ],
  [
    "rating without evidence",
    (raw) => {
      raw.dimensions[0].evidence_quotes = [];
    },
  ],
  [
    "duplicate criterion",
    (raw) => {
      raw.dimensions[1].key = "B";
    },
  ],
  [
    "status-score mismatch",
    (raw) => {
      raw.dimensions[0].status = "not_assessed";
    },
  ],
  [
    "injected provenance",
    (raw) => {
      raw.model_version = "trusted";
    },
  ],
  [
    "duplicate node ID",
    (raw) => {
      raw.argument_graph.nodes[1].id = "claim";
    },
  ],
  [
    "unknown edge endpoint",
    (raw) => {
      raw.argument_graph.edges[0].target = "ghost";
    },
  ],
  [
    "cycle",
    (raw) => {
      raw.argument_graph.edges.push({
        id: "cycle",
        source: "claim",
        target: "reason",
        relation: "supports",
      });
    },
  ],
  [
    "self edge",
    (raw) => {
      raw.argument_graph.edges[0].target = "reason";
    },
  ],
  [
    "duplicate edge",
    (raw) => {
      raw.argument_graph.edges.push({
        ...raw.argument_graph.edges[0],
        id: "duplicate",
      });
    },
  ],
  [
    "inferred quotation",
    (raw) => {
      raw.argument_graph.nodes[3].source_quote = "Invented as a quotation.";
    },
  ],
  [
    "missing node with fabricated text",
    (raw) => {
      raw.argument_graph.nodes[2].text = "They said this.";
    },
  ],
  [
    "explicit paraphrase",
    (raw) => {
      raw.argument_graph.nodes[0].text = "A paraphrased claim.";
    },
  ],
  [
    "unsupported empty-evidence map",
    (raw) => {
      raw.argument_graph.nodes = raw.argument_graph.nodes.slice(2);
      raw.argument_graph.edges = [];
    },
  ],
])
  test(`BRIDGE rejects ${name} with a safe saved-work error`, () => {
    const raw = bridgeFixture(text);
    mutate(raw);
    assert.throws(
      () => validate(raw),
      (error) =>
        error.code === "assessment_invalid_response" &&
        !error.message.includes("Never said"),
    );
  });

test("layout has bounded, non-overlapping nodes and exact demo spans; corrupt graphs cannot hang layout", () => {
  const layout = layoutThoughtMap(THOUGHT_MAP_SAMPLE);
  assert.ok(layout);
  assert.equal(layout.centre.x + layout.centre.width / 2, layout.width / 2);
  assert.ok(layout.positions.some((position) => position.x < layout.centre.x));
  assert.ok(layout.positions.some((position) => position.x > layout.centre.x));
  assert.equal(layout.positions.find((position) => position.id === "link").parent, "reason");
  for (const position of layout.positions) {
    assert.ok(
      position.x >= 0 &&
        position.y >= 0 &&
        position.x + position.width <= layout.width &&
        position.y + position.height <= layout.height,
    );
    for (const other of layout.positions.filter(
      (item) => item.id !== position.id,
    ))
      assert.ok(
        position.x + position.width <= other.x ||
          other.x + other.width <= position.x ||
          position.y + position.height <= other.y ||
          other.y + other.height <= position.y,
      );
  }
  for (const node of THOUGHT_MAP_SAMPLE.nodes.filter(
    (item) => item.status === "explicit",
  ))
    assert.equal(
      THOUGHT_MAP_SAMPLE_TEXT.slice(
        node.source_span.start,
        node.source_span.end,
      ),
      node.quote,
    );
  const cyclic = structuredClone(THOUGHT_MAP_SAMPLE);
  cyclic.edges.push({
    id: "bad",
    source: "claim",
    target: "reason",
    relation: "supports",
  });
  assert.equal(layoutThoughtMap(cyclic), null);
});

test("provider transport separates instructions from user data and validates actual response metadata", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let captured;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    captured = JSON.parse(options.body);
    return Response.json({
      model: "offline-response-snapshot",
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(bridgeFixture(text)) },
        },
      ],
    });
  };
  const result = await evaluateBridge(attempt, session, {
    apiKey: "offline-fixture-key",
  });
  assert.equal(result.model_version, "offline-response-snapshot");
  assert.equal(
    captured.response_format.json_schema.name,
    "bridgingminds_bridge_v3",
  );
  assert.match(captured.messages[0].content, /untrusted data/);
  assert.deepEqual(JSON.parse(captured.messages[1].content).ANSWER, text);
  assert.equal(captured.max_completion_tokens, 6000);
});

for (const [label, response, reason] of [
  ["refusal", { choices: [{ message: { refusal: "Synthetic refusal" } }] }, "provider_refusal"],
  ["truncation", { choices: [{ finish_reason: "length", message: { content: "{}" } }] }, "output_incomplete"],
  ["missing completion", { choices: [] }, "missing_completion"],
  ["invalid JSON", { choices: [{ finish_reason: "stop", message: { content: "not json" } }] }, "invalid_json"],
]) test(`BRIDGE ${label} stays a retryable saved-work failure with one provider call`, async (t) => {
  const original = global.fetch; let calls = 0;
  t.after(() => { global.fetch = original; });
  global.fetch = async () => { calls++; return Response.json(response); };
  await assert.rejects(evaluateBridge(attempt, session, { apiKey: "offline-test-key" }), (error) => error.code === "assessment_invalid_response" && error.assessmentReason === reason);
  assert.equal(calls, 1);
});
