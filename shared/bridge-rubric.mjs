export const BRIDGE_VERSION = "bridge-v1";
export const BRIDGE_KEYS = Object.freeze(["B", "R", "I", "D", "G", "E"]);

const criteria = [
  {
    key: "B",
    label: "Big Idea",
    description: "A clear central message that addresses this task.",
    levels: [
      "The central message is difficult to identify in an answer that calls for one.",
      "A relevant message can be found, but its scope or intended point is unclear.",
      "The central message is clear, relevant and appropriately bounded.",
      "The answer develops a precise central message with consistent focus and an appropriate scope.",
    ],
  },
  {
    key: "R",
    label: "Reasons",
    description:
      "An explanation that makes a justified connection between support and the central message.",
    levels: [
      "The needed connection is absent, circular or inconsistent with the answer's own reasoning.",
      "A plausible reason is offered, but an important link or assumption is unexplained.",
      "The explanation connects relevant reasons to the message coherently.",
      "The connection is well justified and handles any material assumption or exception needed for the conclusion.",
    ],
  },
  {
    key: "I",
    label: "Illustrations",
    description:
      "Relevant examples or evidence that sufficiently support the scope of the point; outside facts remain unverified.",
    levels: [
      "Support invited by this task is missing or unrelated to the point.",
      "An example or detail is offered, but its relevance or limits are unclear.",
      "A relevant example or available evidence supports the point within its stated limits.",
      "Well-chosen, specific support is explained and is sufficient for a carefully bounded point.",
    ],
  },
  {
    key: "D",
    label: "Different Perspectives",
    description:
      "Fair consideration of a relevant alternative or limitation only when this particular exercise calls for it.",
    levels: [
      "A material alternative required by the task is ignored or misrepresented.",
      "An alternative is mentioned without explaining how it bears on the point.",
      "A relevant alternative is represented fairly and connected to the answer.",
      "The answer weighs a relevant alternative and explains a justified qualification, concession or response.",
    ],
  },
  {
    key: "G",
    label: "Glue",
    description:
      "A coherent progression of ideas; there is no required essay template or number of connectors.",
    levels: [
      "The relationship between the answer's ideas is difficult to follow.",
      "Some ideas connect, but fragmentation or repetition obscures the progression.",
      "The order and connections make the answer easy to follow.",
      "Each relevant part contributes to a clear, purposeful progression without distracting repetition.",
    ],
  },
  {
    key: "E",
    label: "Expression",
    description:
      "Understandable wording suited to the task and audience. This text criterion does not rate pronunciation, accent or vocal delivery.",
    levels: [
      "The intended meaning is frequently unclear from the wording.",
      "The message is mostly understandable, with vagueness that affects the point.",
      "The wording is clear and appropriate for the task and audience.",
      "Precise, audience-appropriate wording communicates the intended meaning effectively, including when simple language is sufficient.",
    ],
  },
];

export function getBridgeRubric() {
  return JSON.parse(
    JSON.stringify({
      id: BRIDGE_VERSION,
      title: "BRIDGE · response coaching",
      criteria,
      foundations: [
        {
          title: "Toulmin: claims, grounds and warrants (structural reference)",
          url: "https://doi.org/10.1017/CBO9780511840005.007",
        },
        {
          title:
            "AAC&U VALUE rubrics: critical thinking and oral communication (coverage reference)",
          url: "https://www.aacu.org/initiatives/value-initiative/value-rubrics",
        },
        {
          title: "Elder & Paul: clarity, relevance and reasoning standards",
          url: "https://www.criticalthinking.org/pages/universal-intellectual-standards/527",
        },
        {
          title: "Hattie & Timperley: goals, feedback and next steps",
          url: "https://doi.org/10.3102/003465430298487",
        },
        {
          title:
            "Wachsmuth et al.: relevance, acceptability and sufficiency of arguments",
          url: "https://aclanthology.org/E17-1017/",
        },
      ],
      limitations: [
        "BRIDGE is an original research-informed adaptation. This rubric and its AI ratings have not been validated.",
        "Ratings describe one response. They are not intelligence, general ability, language-proficiency or mastery scores.",
        "Not assessed and insufficient evidence are different from a low rating. Short, well-supported answers can meet the highest anchor.",
        "A complete-looking argument map does not establish truth or sound reasoning. Inferences and proposed missing links are not quotations.",
        "Expression assesses wording only. Acoustic delivery, pronunciation and accent are not assessed from text.",
      ],
    }),
  );
}

// Curated task metadata is authoritative; never infer applicability from answer
// keywords or require a rebuttal on every task. Older generic prompts default
// to five content criteria, with D not assessed until explicitly elicited.
export function bridgeApplicability(prompt = {}) {
  const selected = prompt.bridgeDimensions || ["B", "R", "I", "G", "E"];
  if (
    !Array.isArray(selected) ||
    new Set(selected).size !== selected.length ||
    selected.some((key) => !BRIDGE_KEYS.includes(key))
  )
    throw new TypeError("Invalid curated BRIDGE applicability.");
  return [...selected];
}
