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
    "bridgingminds_bridge_v2",
  );
  assert.match(captured.messages[0].content, /untrusted data/);
  assert.deepEqual(JSON.parse(captured.messages[1].content).ANSWER, text);
  assert.equal(captured.max_completion_tokens, 6000);
});

test("an invalid optional graph cannot erase otherwise validated first-try feedback", async (t) => {
  const raw = bridgeFixture(text);
  raw.argument_graph.edges.push({ id: "bad", source: "missing-id", target: "missing-id", relation: "supports" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] }));
  const result = await evaluateBridge(attempt, session, { apiKey: "offline-fixture" });
  assert.equal(result.provider, "openai");
  assert.equal(result.feedback.strength, raw.feedback.strength);
  assert.deepEqual(result.thought_map.nodes, []);
  assert.match(result.verification_flags[0], /map could not be validated/);
  raw.feedback.evidence_quotes = ["This quote was invented."];
  await assert.rejects(evaluateBridge(attempt, session, { apiKey: "offline-fixture" }));
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
