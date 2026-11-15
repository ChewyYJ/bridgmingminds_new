// Deliberately separate sample content. Never persisted as learner evidence,
// credited for practice, or passed off as an analysis of the actual answer.
export const THOUGHT_MAP_SAMPLE_TEXT =
  "A shared garden can help neighbours meet. Caring for plants together gives people a reason to talk.";
export const THOUGHT_MAP_SAMPLE_NOTES =
  "A shared garden can help neighbours meet. Share tools.";
const explicit = (id, type, quote, development, feedback) => ({
  id,
  type,
  text: quote,
  quote,
  status: "explicit",
  development,
  confidence: "low",
  source_span: {
    start: THOUGHT_MAP_SAMPLE_TEXT.indexOf(quote),
    end: THOUGHT_MAP_SAMPLE_TEXT.indexOf(quote) + quote.length,
  },
  feedback,
});
export const THOUGHT_MAP_SAMPLE = {
  version: "thought-map-v2",
  comparedNotes: true,
  status: "provisional",
  nodes: [
    explicit(
      "claim",
      "claim",
      "A shared garden can help neighbours meet.",
      "developed",
      "The response names a benefit and explains how shared work could create it.",
    ),
    explicit(
      "reason",
      "reason",
      "Caring for plants together gives people a reason to talk.",
      "needs_elaboration",
      "Describe one task neighbours could do together and what they might talk about.",
    ),
    {
      id: "tools",
      type: "reason",
      text: "Share tools.",
      quote: "Share tools.",
      status: "brainstorm_only",
      note_span: {
        start: THOUGHT_MAP_SAMPLE_NOTES.indexOf("Share tools."),
        end: THOUGHT_MAP_SAMPLE_NOTES.length,
      },
      confidence: "low",
      feedback:
        "Explain how borrowing tools could give neighbours another reason to meet.",
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
    {
      id: "tools-support",
      source: "tools",
      target: "claim",
      relation: "supports",
    },
    {
      id: "explain",
      source: "link",
      target: "reason",
      relation: "needs_explanation",
    },
  ],
};
