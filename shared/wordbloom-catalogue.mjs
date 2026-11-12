// Original definitions, examples and passages. This is an approved starter bank,
// not a claim of exhaustive coverage or official language-level classification.
export const WORDBLOOM_VERSION = "wordbloom-v1";
const words = [
  [
    "collaborate",
    "community",
    "Work with others towards a shared goal.",
    "Neighbours can collaborate on a small garden.",
  ],
  [
    "accessible",
    "community",
    "Designed so that people with different needs can use or reach it.",
    "A wider path can make a shared space more accessible.",
  ],
  [
    "perspective",
    "community",
    "A particular way of seeing or understanding a situation.",
    "Listening can help us understand another person's perspective.",
  ],
  [
    "evidence",
    "reasoning",
    "Information or observations used to support or question a claim.",
    "We should examine the evidence before reaching a conclusion.",
  ],
  [
    "assumption",
    "reasoning",
    "Something taken to be true while reasoning, which may need checking.",
    "The plan depends on the assumption that everyone has time to help.",
  ],
  [
    "trade-off",
    "reasoning",
    "A choice in which gaining one benefit involves giving up another.",
    "The team discussed the trade-off between cost and convenience.",
  ],
  [
    "adapt",
    "practice",
    "Change an approach to suit different needs or conditions.",
    "We can adapt the activity when the space is small.",
  ],
  [
    "clarify",
    "practice",
    "Make an idea or meaning easier to understand.",
    "One concrete example can clarify the main point.",
  ],
  [
    "reliable",
    "practice",
    "Able to be depended on for the purpose being discussed.",
    "Repeating the check can help us judge whether a method is reliable.",
  ],
].map(([id, theme, meaning, example]) => ({
  id,
  word: id,
  theme,
  meaning,
  example,
  difficulty: "everyday",
  version: WORDBLOOM_VERSION,
}));

export function wordBloomCatalogue() {
  return words.map((word) => ({ ...word }));
}
export function wordBloomWord(id) {
  return words.find((word) => word.id === id);
}

export const WORDBLOOM_PASSAGES = [
  {
    id: "wordbloom-community-v1",
    theme: "community",
    title: "Making room for everyone",
    target: "Pause when one idea leads to another",
    text: "A welcoming shared space begins with listening. Neighbours can collaborate on a small project, such as a garden beside a path. Each person brings a different perspective on what the space needs. One may notice a sunny corner, while another thinks about how people move through it. A clear, wider path can make the garden more accessible. The group does not need to agree on every detail at once. Starting with one change gives everyone something concrete to discuss. Together, they can notice what works and decide what to try next.",
  },
  {
    id: "wordbloom-reasoning-v1",
    theme: "reasoning",
    title: "Testing an idea carefully",
    target: "Make the connection between sentences easy to hear",
    text: "Before changing a familiar routine, a group can try a small experiment. First, they should clarify the question they want to answer. They might collect evidence by observing what happens before and after the change. A useful discussion also checks an assumption behind the plan, rather than treating it as a fact. There may be a trade-off between saving time and including more people. No single result will answer every question. By explaining the limits of the experiment, the group can make a careful decision and leave room to learn more.",
  },
  {
    id: "wordbloom-practice-v1",
    theme: "practice",
    title: "Finding a helpful approach",
    target: "Read at a comfortable pace, with space between ideas",
    text: "A useful learning routine leaves room for change. We can adapt an activity when our needs or circumstances are different. Asking a short question may clarify a step that once seemed confusing. If a method appears helpful, trying it again in another setting can show whether it is reliable for that purpose. Some attempts will feel easier than others. That is a reason to notice what happened, rather than judge ourselves from one result. Choosing one small adjustment can make the next attempt more manageable and keep curiosity part of the process.",
  },
];

export function wordSpans(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
