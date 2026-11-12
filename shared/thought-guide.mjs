const defaults = {
  spin_speak: [
    {
      question: "What is the main idea you want to express?",
      placeholder: "Your main idea",
    },
    {
      question: "What makes that idea convincing to you?",
      placeholder: "Your reasons or observations",
    },
    {
      question: "What might change or limit your view?",
      placeholder: "Limits or other possibilities",
    },
  ],
  debate: [
    {
      question: "What claim are you defending in this debate?",
      placeholder: "Your claim",
    },
    {
      question: "How does your support connect to that claim?",
      placeholder: "Your support and reasoning",
    },
    {
      question: "What could challenge or qualify your position?",
      placeholder: "An alternative or a limit",
    },
  ],
  read_reflect: [
    {
      question: "What idea from the reading matters for your answer?",
      placeholder: "A relevant idea from the reading",
    },
    {
      question: "How does that idea support your interpretation?",
      placeholder: "The connection you see",
    },
    {
      question: "What further thought or implication does it raise for you?",
      placeholder: "Your reflection or an open question",
    },
  ],
};

function validQuestion(item) {
  return (
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    Object.keys(item).length === 2 &&
    typeof item.question === "string" &&
    item.question.length <= 240 &&
    item.question.trim().length > 1 &&
    item.question.trim().endsWith("?") &&
    typeof item.placeholder === "string" &&
    item.placeholder.length <= 120 &&
    item.placeholder.trim().length > 0
  );
}

/** Presentation guidance only: it never changes scores or interprets answers. */
export function getThoughtGuide(mode, evaluation) {
  const candidate = evaluation?.guiding_questions;
  const valid =
    Array.isArray(candidate) &&
    candidate.length === 3 &&
    candidate.every(validQuestion) &&
    new Set(candidate.map((item) => item.question.trim())).size === 3;
  const selected = valid
    ? candidate
    : Object.prototype.hasOwnProperty.call(defaults, mode)
      ? defaults[mode]
      : defaults.spin_speak;
  // Plain copies work on both Node and Hermes and cannot mutate saved feedback
  // or the shared fallback when a caller edits its own draft.
  return selected.map(({ question, placeholder }) => ({
    question: question.trim(),
    placeholder: placeholder.trim(),
  }));
}
