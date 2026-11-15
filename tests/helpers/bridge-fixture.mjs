// Deterministic transport fixture, never a real assessment or production fallback.
export function bridgeFixture(answer, applicable = ["B", "R", "I", "G", "E"], notes = "") {
  const excerpts = (answer.match(/[^.!?\n]+[.!?]/gu) || [answer])
    .map((text) => text.trim())
    .filter(
      (text) =>
        text.length &&
        text.length <= 400 &&
        answer.indexOf(text) === answer.lastIndexOf(text),
    );
  const first = excerpts[0],
    second = excerpts[1] || first;
  if (!first)
    throw new Error("Synthetic BRIDGE fixture needs a unique short excerpt.");
  const result = {
    dimensions: ["B", "R", "I", "D", "G", "E"].map((key) => ({
      key,
      level: applicable.includes(key) ? 3 : null,
      status: applicable.includes(key) ? "assessed" : "not_assessed",
      confidence: "medium",
      evidence_quotes: applicable.includes(key) ? [first] : [],
      strength: "The saved response supplies a concrete point to inspect.",
      improvement: "Explain how your chosen reason supports your point.",
    })),
    feedback: {
      strength: "You state an identifiable point in the saved response.",
      priority_gap: "Explore the connection between the reason and the point.",
      next_question: "How does that reason support your main point?",
      evidence_quotes: [second],
    },
    argument_graph: {
      nodes: [
        {
          id: "claim",
          type: "claim",
          text: first,
          source_quote: first,
          status: "explicit",
          development: "developed",
          note_quote: null,
          confidence: "medium",
          feedback:
            "This is an exact response excerpt in the synthetic fixture.",
        },
        {
          id: "reason",
          type: "reason",
          text: second,
          source_quote: second,
          status: "explicit",
          development: "needs_elaboration",
          note_quote: null,
          confidence: "medium",
          feedback: "Inspect how this excerpt relates to the point.",
        },
        {
          id: "link",
          type: "warrant",
          text: null,
          source_quote: null,
          status: "missing",
          development: null,
          note_quote: null,
          confidence: "low",
          feedback: "What connection could make this reasoning clearer?",
        },
        {
          id: "limit",
          type: "qualifier",
          text: "The idea may depend on the situation.",
          source_quote: null,
          status: "inferred",
          development: null,
          note_quote: null,
          confidence: "low",
          feedback: "A proposed interpretation, not a learner quotation.",
        },
      ],
      edges: [
        { id: "e1", source: "reason", target: "claim", relation: "supports" },
        {
          id: "e2",
          source: "link",
          target: "claim",
          relation: "needs_explanation",
        },
        { id: "e3", source: "limit", target: "claim", relation: "qualifies" },
      ],
    },
    needs_review: false,
    vocabulary_candidates: [],
    productive_uses: [],
  };
  if (notes) {
    result.argument_graph.nodes.push({
      id: "planned",
      type: "reason",
      text: notes,
      source_quote: null,
      note_quote: notes,
      status: "brainstorm_only",
      development: null,
      confidence: "medium",
      feedback: "Explain how this planned point supports the main idea.",
    });
    result.argument_graph.edges.push({
      id: "planned-support",
      source: "planned",
      target: "claim",
      relation: "supports",
    });
  }
  return result;
}
