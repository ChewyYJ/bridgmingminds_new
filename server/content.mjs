import { createHash } from 'node:crypto';

// Original practice prompts. The server, never the wheel animation, selects a prompt.
const spinPrompts = [
  ['tech-attention', 'Technology', 'What is one way technology could help us protect our attention?', 'Choose a familiar example. Explain a benefit, a trade-off, and who might be affected.'],
  ['tech-ai-learning', 'Technology', 'When can an AI assistant help someone learn, and when might it get in the way?', 'Separate doing a task quickly from understanding how to do it yourself.'],
  ['tech-design', 'Technology', 'What makes an app genuinely useful rather than simply engaging?', 'Use a concrete example and explain how you would measure usefulness.'],
  ['science-uncertainty', 'Science', 'Why can changing your mind be a strength in science?', 'Distinguish changing a conclusion because of new evidence from changing it without a reason.'],
  ['science-experiment', 'Science', 'How would you test whether a new study technique helps you remember more?', 'Consider what to compare, what to measure, and what might bias your result.'],
  ['science-news', 'Science', 'What would you check before sharing a surprising science headline?', 'Think about the source, the study design, and what the headline leaves out.'],
  ['society-library', 'Society', 'What is one role a public library could play beyond lending books?', 'Consider who benefits, what it costs, and a possible limitation.'],
  ['society-listening', 'Society', 'What does it mean to listen well to someone you disagree with?', 'Give a specific example without assuming that listening requires agreement.'],
  ['society-shared-space', 'Society', 'How could your neighbourhood make shared spaces more welcoming?', 'Choose one achievable change and explain whose needs it might meet.'],
  ['culture-traditions', 'Culture', 'Can a tradition change and still remain meaningful?', 'Explain your view with an example and consider a different perspective.'],
  ['culture-stories', 'Culture', 'How can a story help us understand an unfamiliar experience?', 'Consider both the insight a story offers and the limits of a single story.'],
  ['culture-museums', 'Culture', 'What makes a museum exhibit memorable?', 'Connect your example to what visitors might learn or question.'],
  ['environment-waste', 'Environment', 'What is one practical way to reduce food waste in a household?', 'Explain how your idea could work and what might make it difficult.'],
  ['environment-parks', 'Environment', 'How should a city balance green space with other uses of land?', 'Name a trade-off and explain how you would make the decision.'],
  ['environment-repair', 'Environment', 'What would make repairing an item easier than replacing it?', 'Consider cost, convenience, skills, and who could help.'],
  ['business-feedback', 'Business', 'What makes feedback useful at work?', 'Explain how specific evidence and a next step could improve an example.'],
  ['business-flexibility', 'Business', 'How could a team decide whether flexible working hours are helping?', 'Consider different roles and more than one measure of success.'],
  ['business-success', 'Business', 'What should a small business measure besides revenue?', 'Pick one measure, explain its value, and acknowledge a limitation.'],
];

const debatePrompts = [
  ['debate-ai', 'Technology', 'Schools should allow AI assistants for homework when students explain how they used them.', 'Consider learning, access, privacy, and how teachers could assess independent understanding. No particular stance is expected.'],
  ['debate-research', 'Science', 'Publicly funded research papers should be freely available to everyone.', 'Consider public access, research costs, publishing work, and practical ways to fund quality review.'],
  ['debate-libraries', 'Society', 'Public libraries should prioritise shared learning spaces over expanding book collections.', 'Consider different community needs and the trade-offs involved in a limited budget.'],
  ['debate-museums', 'Culture', 'Public museums should make their permanent collections free to visit.', 'Consider access, funding, conservation, and alternative ways to support museums.'],
  ['debate-repair', 'Environment', 'Manufacturers should make everyday electronics easier for customers to repair.', 'Consider waste, cost, safety, product design, and the needs of smaller manufacturers.'],
  ['debate-workweek', 'Business', 'More organisations should trial a shorter working week without reducing pay.', 'Consider service coverage, workload, productivity, and whether the same arrangement suits every role.'],
];

const perspectivePrompts = new Set(['tech-attention', 'tech-ai-learning', 'society-library', 'culture-traditions', 'culture-stories', 'environment-waste', 'environment-parks', 'business-flexibility', 'business-success']);
export const prompts = [
  ...spinPrompts.map(([id, category, question, context]) => ({ id, mode: 'spin_speak', question, category, context, difficulty: 'beginner', bridgeDimensions: perspectivePrompts.has(id) ? ['B','R','I','D','G','E'] : ['B','R','I','G','E'] })),
  ...debatePrompts.map(([id, category, question, context]) => ({ id, mode: 'debate', question, category, context, difficulty: 'beginner' })),
];

// Curated reading, not a live news feed. Dates are the original publication dates;
// no publication time is invented when the publisher supplies only a date.
// Summaries/questions are original editorial writing; source articles are linked,
// not republished. No source images or full article text are bundled.
const readingCatalogue = [
  {
    id: 'webb-atmosphere',
    title: 'What can a distant planet teach us about evidence?',
    source: 'NASA',
    sourceUrl: 'https://science.nasa.gov/missions/webb/nasas-webb-hints-at-possible-atmosphere-surrounding-rocky-exoplanet/',
    publishedAt: '2024-05-08',
    category: 'Science',
    summary: 'NASA reported that observations from the James Webb Space Telescope suggest gases may surround the hot rocky planet 55 Cancri e. The measurements are consistent with an atmosphere containing carbon monoxide or carbon dioxide. This is evidence to investigate, rather than proof that the planet is habitable.',
    questions: [
      'Understand: What did the observations suggest, and what did they not establish?',
      'Examine: Why is the word “may” useful when communicating this finding?',
      'Consider another view: What additional observation could strengthen or challenge the explanation?',
    ],
    readMinutes: 3,
  },
  {
    id: 'ai-in-learning',
    title: 'Keeping people at the centre of AI in education',
    source: 'UNESCO',
    sourceUrl: 'https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research',
    publishedAt: '2023-09-07',
    category: 'Technology',
    summary: 'UNESCO published guidance on using generative AI in education and research. It calls for a human-centred approach, with policy planning and the development of people’s capabilities alongside the technology. The central learning question is how a tool can support a person’s understanding and agency.',
    questions: [
      'Understand: What does a human-centred approach to educational AI mean to you?',
      'Examine: What evidence would show that a tool improves understanding rather than only task completion?',
      'Consider another view: How might a student’s needs differ from a teacher’s or a parent’s?',
    ],
    readMinutes: 3,
  },
  {
    id: 'social-connection',
    title: 'Connection is about more than the number of people we know',
    source: 'World Health Organization',
    sourceUrl: 'https://www.who.int/news-room/questions-and-answers/item/social-connection',
    publishedAt: '2025-06-30',
    category: 'Society',
    summary: 'WHO describes social connection through three aspects: the structure of relationships, the support people exchange, and the quality of their interactions. These distinctions show why a count of contacts alone cannot describe a person’s social experience. The source also distinguishes social isolation from loneliness.',
    questions: [
      'Understand: How do relationship structure, support, and quality differ?',
      'Examine: Why might counting social contacts leave out important information?',
      'Consider another view: How could a community initiative support different preferences for connection?',
    ],
    readMinutes: 3,
  },
  {
    id: 'living-heritage',
    title: 'Keeping traditions alive through change and exchange',
    source: 'UNESCO',
    sourceUrl: 'https://www.unesco.org/en/articles/unesco-celebrates-20-years-living-heritage-adding-55-new-inscriptions-its-list',
    publishedAt: '2023-12-08',
    category: 'Culture',
    summary: 'At its December 2023 committee meeting, UNESCO added 55 cultural practices across its living-heritage lists and register. The announcement emphasised how knowledge and practices pass between people and generations. It also highlighted shared nominations across countries and the role of communities in safeguarding their heritage.',
    questions: [
      'Understand: How does living heritage differ from a historic building or object?',
      'Examine: What might be lost if preservation focused only on recording a tradition?',
      'Consider another view: How could a tradition adapt while remaining meaningful to its community?',
    ],
    readMinutes: 3,
  },
  {
    id: 'food-waste',
    title: 'Small habits, a much bigger food-waste question',
    source: 'UN Environment Programme',
    sourceUrl: 'https://www.unep.org/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report',
    publishedAt: '2024-03-27',
    category: 'Environment',
    summary: 'UNEP’s 2024 Food Waste Index report estimated that households wasted more than one billion meals a day in 2022. The report considers waste at household, food-service, and retail levels. Its findings invite questions about both individual habits and the wider systems that shape how food is bought, used, and discarded.',
    questions: [
      'Understand: Which year do the reported household estimates describe?',
      'Examine: What would you need to measure to know whether a food-waste initiative works?',
      'Consider another view: How could retailers and households share responsibility without assuming equal control?',
    ],
    readMinutes: 3,
  },
  {
    id: 'working-time',
    title: 'Rethinking the shape of a working week',
    source: 'International Labour Organization',
    sourceUrl: 'https://www.ilo.org/publications/working-time-and-work-life-balance-around-world',
    publishedAt: '2023-01-06',
    category: 'Business',
    summary: 'An ILO report examines both the length of working hours and how work schedules are arranged. It finds that working longer than people would prefer is associated with poorer reported work-life balance. The report discusses reduced hours and flexible arrangements while drawing attention to differences in workers’ circumstances.',
    questions: [
      'Understand: How is the number of working hours different from the arrangement of those hours?',
      'Examine: Why does an association alone not show that one change will help every worker?',
      'Consider another view: What would a fair trial need to consider for roles with fixed service hours?',
    ],
    readMinutes: 3,
  },
];

export const articles = readingCatalogue.map(article => ({
  ...article,
  license: 'Original editorial summary and questions; source article linked only. Publisher retains rights to its content.',
  summaryType: 'Original editorial summary',
  questionsType: 'App-authored reflection questions',
  ingestedAt: '2026-10-13T12:33:25.000Z',
  contentHash: createHash('sha256').update(JSON.stringify({ sourceUrl: article.sourceUrl, publishedAt: article.publishedAt, summary: article.summary, questions: article.questions })).digest('hex'),
}));
