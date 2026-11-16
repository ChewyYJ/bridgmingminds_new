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
  [
    "baseline",
    "measurement",
    "A starting measurement or condition used for later comparison.",
    "The oldest satellite photo gives us a baseline for comparing ice cover.",
    "stretch",
  ],
  [
    "quantify",
    "measurement",
    "Measure or describe how much of something there is using numbers.",
    "We could quantify the ice loss by measuring the area it covers in each photo.",
    "stretch",
  ],
  [
    "fluctuate",
    "measurement",
    "Rise and fall or change irregularly over time.",
    "Bus arrival times can fluctuate throughout the week.",
    "stretch",
  ],
  [
    "substantiate",
    "argument",
    "Support a claim with facts, examples or other evidence.",
    "We can substantiate our claim about noise levels with readings from different classrooms.",
    "stretch",
  ],
  [
    "infer",
    "argument",
    "Reach a conclusion from clues or evidence.",
    "From the wet pavement, I might infer that it rained overnight.",
    "stretch",
  ],
  [
    "articulate",
    "argument",
    "Express a thought or feeling clearly in words.",
    "I want to articulate why the change matters to students.",
    "stretch",
  ],
  [
    "feasible",
    "decisions",
    "Possible to do with the time, resources or skills available.",
    "A one-week trial is feasible with the volunteers we already have.",
    "stretch",
  ],
  [
    "mitigate",
    "decisions",
    "Make a risk or harmful effect less severe.",
    "Adding shade could mitigate the effects of heat at the bus stop.",
    "stretch",
  ],
  [
    "allocate",
    "decisions",
    "Set aside part of a resource for a particular purpose.",
    "The group will allocate ten minutes to each speaker.",
    "stretch",
  ],
  [
    "ergonomics",
    "testing",
    "The study of how to design equipment and spaces so people can use them comfortably, safely and effectively.",
    "The team reviewed the ergonomics of the control panel before choosing a button layout.",
    "advanced",
  ],
  [
    "reproducibility",
    "testing",
    "The extent to which an independent team can obtain similar results using the same method.",
    "Having a second team run the cabin test would help check reproducibility.",
    "advanced",
  ],
  [
    "confounding factor",
    "testing",
    "An outside influence that can distort a comparison because it is linked to both what you are testing and the outcome.",
    "If only one group gets extra practice, that practice could be a confounding factor in a comparison of the two designs.",
    "advanced",
  ],
  [
    "corroborate",
    "inference",
    "Support a report or claim with independent information that agrees with it.",
    "The team checked the time-stamped video to corroborate the observer’s account.",
    "advanced",
  ],
  [
    "extrapolate",
    "inference",
    "Use a known pattern or result to estimate what happens beyond the conditions or range observed.",
    "I’d hesitate to extrapolate from a short cabin trial to an entire mission.",
    "advanced",
  ],
  [
    "generalisability",
    "inference",
    "The extent to which a finding applies to other people, groups or settings.",
    "Testing the controls with people of different heights would help assess the generalisability of the result.",
    "advanced",
  ],
  [
    "counterproductive",
    "consequences",
    "Having the opposite effect to the one intended.",
    "Adding too many confirmation screens could be counterproductive if the user starts clicking through them without reading.",
    "advanced",
  ],
  [
    "disproportionate",
    "consequences",
    "Larger or smaller than is reasonable compared with the cause, need or share involved.",
    "A uniform late fee can have a disproportionate impact on students with less money.",
    "advanced",
  ],
  [
    "disincentivise",
    "consequences",
    "Make an action less attractive by increasing its cost or reducing its benefit.",
    "An extra registration fee could disincentivise families from signing up.",
    "advanced",
  ],
  [
    "on the face of it",
    "qualifying",
    "Judging from an initial impression, before looking at the details.",
    "On the face of it, the room looks empty, but the bookings show that every desk is reserved.",
    "advanced",
  ],
  [
    "with one caveat",
    "qualifying",
    "With one warning or condition that limits how far a statement applies.",
    "I’d recommend working outdoors, with one caveat: we need somewhere to go if it rains.",
    "advanced",
  ],
  [
    "in and of itself",
    "qualifying",
    "Considered on its own, without taking related factors into account.",
    "A long queue, in and of itself, tells us little about the quality of the food.",
    "advanced",
  ],
  [
    "all things being equal",
    "comparing",
    "Assuming the other important conditions are the same.",
    "All things being equal, I’d choose the route with fewer crossings.",
    "advanced",
  ],
  [
    "by the same token",
    "comparing",
    "For the same reason, used to connect a second point supported by the first line of reasoning.",
    "A shorter form saves staff time. By the same token, it makes signing up quicker for families.",
    "advanced",
  ],
  [
    "bear out",
    "comparing",
    "Show that a claim, expectation or account is supported by the results.",
    "The team will wait to see whether the attendance records bear out its prediction.",
    "advanced",
  ],
].map(([id, theme, meaning, example, difficulty = "everyday"]) => ({
  id,
  word: id,
  theme,
  meaning,
  example,
  difficulty,
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
  {
    id: "wordbloom-measurement-v1",
    theme: "measurement",
    title: "Tracking the school garden",
    target: "Pause after each measurement step",
    text: "Before watering the school garden more often, the class records the height of each plant. Those first measurements give them a baseline for later comparison. Each Friday, they measure the same plants so they can quantify how much they have grown. Soil moisture can fluctuate from one day to the next, especially after rain. To keep the comparison fair, the class checks the soil at the same time each morning. After a month, they compare their records before deciding whether to change the watering schedule.",
  },
  {
    id: "wordbloom-argument-v1",
    theme: "argument",
    title: "Making a case for a quieter room",
    target: "Pause between the claim and its support",
    text: "The student council wants to make one room available for quiet study at lunch. First, they articulate the problem: some students find it hard to read in crowded common areas. They use notes from several lunch breaks to substantiate their claim that those areas get noisy. From the number of students who ask about the room, they might infer that there is interest. To see how many would actually use it, they agree to open the room for a week and count visits.",
  },
  {
    id: "wordbloom-decisions-v1",
    theme: "decisions",
    title: "Planning a school fair",
    target: "Give each decision its own phrase",
    text: "The school wants to hold its fair outdoors. The organisers check whether that is feasible with the space and staff they have. They allocate part of the budget to shaded seating so visitors have somewhere to rest. To mitigate the risk of rain interrupting the fair, they reserve two classrooms as backup spaces. They draw a simple map and decide who will update the signs if a stall has to move. A week before the fair, they review the plan as a group.",
  },
  {
    id: "wordbloom-testing-v1",
    theme: "testing",
    title: "Testing a redesigned handle",
    target: "Pause between the test and its results",
    text: "The design team is studying the ergonomics of a new door handle, including how easily people can grip it. They test both handles on doors of the same weight so the weight difference cannot become a confounding factor. Several teams run the same test in different rooms. They compare results to check reproducibility before deciding whether to change the handle across the building.",
  },
  {
    id: "wordbloom-inference-v1",
    theme: "inference",
    title: "From one route to a whole city",
    target: "Pause before the limits of the conclusion",
    text: "A survey suggests one bus route became more reliable after a timetable change. The transport team checks dispatch records to corroborate the reports. They want to know whether they can extrapolate from one route to the wider network. The tested route has fewer traffic lights than most routes, which could limit the generalisability of the finding. The team tests the timetable in another area before proposing a wider change.",
  },
  {
    id: "wordbloom-consequences-v1",
    theme: "consequences",
    title: "Rethinking the lunch queue",
    target: "Pause before each consequence",
    text: "A school proposes a rule that lets students join the lunch queue only when their class is called. The rule could be counterproductive if everyone rushes to the cafeteria at once. It may also have a disproportionate effect on students whose classrooms are far away. Staff consider whether the rule would disincentivise students from buying lunch at school. They try a staggered schedule and ask students what changed.",
  },
  {
    id: "wordbloom-qualifying-v1",
    theme: "qualifying",
    title: "Checking what a survey really means",
    target: "Pause before qualifying each claim",
    text: "On the face of it, a survey suggests students want a longer lunch break. The council shares that impression with one caveat: most responses came from the same year group. A large response count, in and of itself, tells them little about what the rest of the school wants. They ask each year group to run the same short survey before presenting the results.",
  },
  {
    id: "wordbloom-comparing-v1",
    theme: "comparing",
    title: "Comparing two school events",
    target: "Give each comparison its own pause",
    text: "Two clubs want to hold events on the same afternoon. All things being equal, the school favours the activity that can welcome more students. One club argues that smaller groups can give each person more time to speak. By the same token, they say, smaller groups make it easier for a volunteer to notice who needs help. The school will try both formats and see whether the feedback can bear out either claim.",
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
