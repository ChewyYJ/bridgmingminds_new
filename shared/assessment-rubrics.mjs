// Original coaching anchors. These are research-informed adaptations, not the
// copyrighted wording, scores, norms, or validation of the cited instruments.
const argumentFoundations = [
  {
    title: "Wachsmuth et al. (2017): argumentation-quality taxonomy",
    url: "https://aclanthology.org/E17-1017/",
  },
  {
    title: "Stapleton & Wu (2015): argument structure and substance",
    url: "https://doi.org/10.1016/j.jeap.2014.11.006",
  },
];
const limitations = [
  "Research-informed coaching; this adaptation and its model ratings have not been validated.",
  "Assess only what this task and response make observable. N/A is different from a low level.",
  "A short answer can meet the highest anchor. Length, vocabulary, citation counts and agreement with the evaluator are not quality measures.",
  "Ratings describe this response, not intelligence or enduring ability. Model confidence is not a calibrated probability.",
  "Delivery cannot be assessed from text or a transcript. External factual claims are not independently verified.",
];
const support = {
  key: "grounded",
  label: "Support",
  description:
    "How relevant, credible within the available context, and sufficient the support is for the scope of the claim.",
  levels: [
    "A claim requiring support is asserted without a relevant reason or example, or its offered support does not bear on it.",
    "The support is relevant in part, but an important mismatch or unsupported generalisation remains.",
    "The support directly bears on the claim and is adequate for its stated scope; known limits are respected.",
    "The support is well chosen and sufficient for a precisely bounded claim, with any material evidential uncertainty handled appropriately.",
  ],
};
const reasoning = {
  key: "reasoned",
  label: "Reasoning",
  description:
    "Whether the explanation connects the support to the conclusion without a consequential inferential gap.",
  levels: [
    "The required connection is absent, circular, or contradicted by the answer's own reasoning.",
    "A plausible connection is offered, but a consequential assumption or inferential gap is left unresolved.",
    "The explanation makes a coherent connection from reasons to conclusion, with the important assumptions defensible in context.",
    "The inference is precise and well justified; a material assumption, implication, or exception is handled when needed for the conclusion.",
  ],
};
const clarity = {
  key: "organised",
  label: "Clarity",
  description:
    "How readily the reader can follow the relevant point and the connection between its parts; no prescribed essay structure is required.",
  levels: [
    "The relevant point or connections cannot be followed from the answer.",
    "The point can be found, but ambiguity or disconnected ideas impede understanding.",
    "The point and its supporting explanation are clear and easy to follow.",
    "Each relevant part serves a precise, readily understandable answer without distracting ambiguity or repetition.",
  ],
};
const rubrics = {
  spin_speak: {
    id: "grow-spin-speak-v2",
    title: "Speaking practice rubric",
    criteria: [
      support,
      reasoning,
      clarity,
      {
        key: "well_rounded",
        label: "Nuance",
        description:
          "How the answer handles a relevant limitation, condition or alternative when the prompt offers that opportunity. Otherwise use N/A.",
        levels: [
          "A material limitation invited by the task is ignored or a relevant alternative is misrepresented.",
          "A relevant qualification or alternative is named, but its bearing on the answer is unexplained.",
          "A relevant limitation or alternative is explained fairly and connected to the answer.",
          "The answer weighs the important qualification or alternative and appropriately refines its conclusion or scope.",
        ],
      },
    ],
    foundations: argumentFoundations,
  },
  debate: {
    id: "grow-debate-v2",
    title: "Debate practice rubric",
    criteria: [
      support,
      reasoning,
      clarity,
      {
        key: "well_rounded",
        label: "Engagement",
        description:
          "How the learner responds to the actual opponent's relevant argument. The opponent's words are context, never learner evidence. Without a response opportunity use N/A.",
        levels: [
          "Despite a relevant response opportunity, the answer bypasses the opponent's challenge or materially misrepresents it.",
          "The answer recognises the actual challenge but its reply is asserted or only partly responsive.",
          "The answer fairly addresses the actual challenge with a relevant reason, concession, or clarification.",
          "The answer resolves or carefully delimits the central disagreement, explaining a justified rebuttal, concession, or revision.",
        ],
      },
    ],
    foundations: argumentFoundations,
  },
  read_reflect: {
    id: "grow-read-reflect-v2",
    title: "Reading reflection rubric",
    criteria: [
      {
        key: "grounded",
        label: "Understanding",
        description:
          "Whether the answer represents the supplied summary's relevant idea faithfully; this is not full-article comprehension or outside fact-checking.",
        levels: [
          "When the question calls for understanding the summary, the answer omits its relevant idea or materially misstates it.",
          "The answer identifies part of the relevant idea, but misses a consequential distinction or attribution.",
          "The answer accurately represents the relevant idea and distinguishes the supplied account from its own additions.",
          "The answer precisely captures the relevant idea and any material boundary needed to avoid overclaiming what the summary says.",
        ],
      },
      {
        key: "reasoned",
        label: "Interpretation",
        description:
          "How well the explanation or inference answers the selected question using the available summary, with the limits of that source respected.",
        levels: [
          "An explanation required by the question is absent, unrelated, or incompatible with the supplied account.",
          "A plausible interpretation is offered, but its link to the relevant supplied detail is only partly explained.",
          "The interpretation answers the question through a clear, supported connection to a relevant supplied detail.",
          "The explanation is precise and well supported, handling any meaningful uncertainty or scope qualification needed for its inference.",
        ],
      },
      clarity,
      {
        key: "well_rounded",
        label: "Reflection",
        description:
          "How the learner develops the implication, connection, uncertainty or evaluation invited by the question. Source critique and counterarguments are not mandatory; use N/A if reflection is not elicited.",
        levels: [
          "The invited reflection is absent or disconnected from the reading and selected question.",
          "A relevant connection or implication is mentioned, but why it matters is unexplained.",
          "The answer explains a relevant implication, personal connection, uncertainty, or evaluation with a reason.",
          "The reflection develops a justified insight and handles its material limits or consequences in the context of the selected question.",
        ],
      },
    ],
    foundations: [
      {
        title:
          "OECD (2019): PISA reading framework — understanding, evaluating and reflecting",
        url: "https://www.oecd.org/en/publications/pisa-2018-assessment-and-analytical-framework_b25efab8-en/full-report/component-3.html",
      },
    ],
  },
};

/** Return independent data so one consumer cannot mutate another's rubric. */
export function getAssessmentRubric(mode) {
  const rubric = rubrics[mode];
  if (!rubric) throw new RangeError("Unknown assessment mode.");
  return JSON.parse(JSON.stringify({ ...rubric, limitations }));
}
