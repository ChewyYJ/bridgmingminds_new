// Deliberately separate sample content. Never persisted as learner evidence,
// credited for practice, or passed off as an analysis of the actual answer.
export const THOUGHT_MAP_SAMPLE_TEXT =
  "A shared garden can help neighbours meet. Caring for plants together gives people a reason to talk.";
const explicit = (id, type, quote) => ({
  id,
  type,
  text: quote,
  quote,
  status: "explicit",
  confidence: "low",
  source_span: {
    start: THOUGHT_MAP_SAMPLE_TEXT.indexOf(quote),
    end: THOUGHT_MAP_SAMPLE_TEXT.indexOf(quote) + quote.length,
  },
  feedback: "This is an exact excerpt from the sample, not your response.",
});
export const THOUGHT_MAP_SAMPLE = {
  version: "thought-map-v1",
  status: "provisional",
  nodes: [
    explicit("claim", "claim", "A shared garden can help neighbours meet."),
    explicit(
      "reason",
      "reason",
      "Caring for plants together gives people a reason to talk.",
    ),
    {
      id: "limit",
      type: "qualifier",
      text: "The benefit may depend on who can take part.",
      status: "inferred",
      confidence: "low",
      feedback:
        "A proposed interpretation for discussion. These words are not in the sample.",
    },
    {
      id: "link",
      type: "warrant",
      text: null,
      status: "missing",
      confidence: "low",
      feedback:
        "What makes those conversations useful to neighbours? This is a proposed question, not a learner quotation.",
    },
  ],
  edges: [
    { id: "support", source: "reason", target: "claim", relation: "supports" },
    { id: "qualify", source: "limit", target: "claim", relation: "qualifies" },
    {
      id: "explain",
      source: "link",
      target: "claim",
      relation: "needs_explanation",
    },
  ],
};
