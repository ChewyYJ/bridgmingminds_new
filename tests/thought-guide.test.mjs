import test from "node:test";
import assert from "node:assert/strict";
import { getThoughtGuide } from "../shared/thought-guide.mjs";

const modes = ["spin_speak", "debate", "read_reflect"];
const tailored = [
  {
    question: "What conclusion do you draw from the trial?",
    placeholder: "Your conclusion",
  },
  {
    question: "How does the observation support that conclusion?",
    placeholder: "Your reasoning",
  },
  {
    question: "What might limit that conclusion?",
    placeholder: "A limit or uncertainty",
  },
];

test("each mode supplies three distinct questions and neutral placeholders for old feedback", () => {
  const guides = modes.map((mode) =>
    getThoughtGuide(mode, { retry_prompt: "Copy this model answer." }),
  );
  assert.equal(new Set(guides.map(JSON.stringify)).size, 3);
  for (const guide of guides) {
    assert.equal(guide.length, 3);
    for (const item of guide) {
      assert.match(item.question, /^(What|How) .+\?$/);
      assert.ok(item.placeholder.length > 0);
      assert.doesNotMatch(
        item.placeholder,
        /for example|e\.g\.|because|therefore|you should|I think/i,
      );
    }
  }
  assert.match(guides[0][0].question, /idea/);
  assert.match(guides[1][1].question, /support.*claim/);
  assert.match(guides[2][0].question, /reading/);
  assert.deepEqual(getThoughtGuide("unknown"), getThoughtGuide("spin_speak"));
  assert.deepEqual(getThoughtGuide("__proto__"), getThoughtGuide("spin_speak"));
});

test("valid tailored guidance is trimmed and copied without changing saved feedback", () => {
  const evaluation = {
    guiding_questions: tailored.map((item) => ({
      question: ` ${item.question} `,
      placeholder: ` ${item.placeholder} `,
    })),
  };
  const snapshot = JSON.stringify(evaluation);
  const guide = getThoughtGuide("spin_speak", evaluation);
  assert.deepEqual(guide, tailored);
  guide[0].question = "Changed locally?";
  assert.equal(JSON.stringify(evaluation), snapshot);
  const fallback = getThoughtGuide("read_reflect");
  fallback[0].placeholder = "Changed locally";
  assert.notEqual(
    getThoughtGuide("read_reflect")[0].placeholder,
    "Changed locally",
  );
});

test("missing or malformed legacy guides fall back as a whole without inventing tailored guidance", () => {
  const invalid = [
    undefined,
    null,
    "example",
    [],
    tailored.slice(0, 2),
    [...tailored, tailored[0]],
    [tailored[0], tailored[0], tailored[2]],
    [{ ...tailored[0], question: "Write this answer." }, ...tailored.slice(1)],
    [{ ...tailored[0], placeholder: " " }, ...tailored.slice(1)],
    [{ ...tailored[0], question: 5 }, ...tailored.slice(1)],
    [
      { ...tailored[0], question: "🌱".repeat(120) + "?" },
      ...tailored.slice(1),
    ],
    [{ ...tailored[0], placeholder: "x".repeat(121) }, ...tailored.slice(1)],
    [{ ...tailored[0], answer: "A model answer" }, ...tailored.slice(1)],
    [null, ...tailored.slice(1)],
  ];
  for (const mode of modes)
    for (const guide of invalid) {
      assert.deepEqual(
        getThoughtGuide(mode, { guiding_questions: guide }),
        getThoughtGuide(mode),
      );
    }
});

test("guide bounds use UTF-16 length consistently with client inputs", () => {
  const bounded = [
    { question: `What ${"x".repeat(234)}?`, placeholder: "🌱".repeat(60) },
    ...tailored.slice(1),
  ];
  assert.equal(bounded[0].question.length, 240);
  assert.deepEqual(
    getThoughtGuide("debate", { guiding_questions: bounded }),
    bounded,
  );
});
