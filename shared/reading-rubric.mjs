export const READING_RUBRIC_VERSION = "reading-evaluation-v1";
export const READING_CRITERIA = Object.freeze([
  {
    key: "pronunciation",
    label: "Pronunciation",
    hint: "Clear, understandable words",
    icon: "message-circle",
  },
  {
    key: "fluency",
    label: "Fluency & pace",
    hint: "A steady pace and natural pauses",
    icon: "activity",
  },
  {
    key: "intonation",
    label: "Intonation",
    hint: "Pitch and rhythm that carry meaning",
    icon: "trending-up",
  },
  {
    key: "word_stress",
    label: "Word stress",
    hint: "Emphasis on syllables and key words",
    icon: "volume-2",
  },
  {
    key: "completeness",
    label: "Completeness",
    hint: "How closely you read the passage",
    icon: "check-circle",
  },
]);
export const READING_FOUNDATION = {
  title: "CEFR phonological control",
  url: "https://www.coe.int/en/web/common-european-framework-reference-languages/phonological-competence",
  note: "Research-informed practice feedback, not a CEFR level or certified assessment. Clear meaning matters more than matching an accent.",
};
