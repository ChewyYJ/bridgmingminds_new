// Shared, versioned tournament rules. These are coaching anchors, not a
// validated measurement of ability, accent, identity or factual correctness.
export const DEBATE_VERSION = 'debate-v1';
export const DEBATE_STAGES = [
  { id: 'opening', label: 'Opening', seconds: 60, instruction: 'State your position and explain one reason or example.' },
  { id: 'rebuttal', label: 'Rebuttal', seconds: 75, instruction: 'Address the opponent’s actual argument. You can rebut, qualify or concede with a reason.' },
  { id: 'closing', label: 'Closing', seconds: 30, instruction: 'Summarise your strongest reason and what the exchange clarified.' },
];
// Curated civic-policy background, checked against the linked official sources.
// Motions and arguments are original practice prompts, not official positions.
export const SINGAPORE_DEBATE_TOPICS = [
  { id: 'sg-inclusive-housing', title: 'New Singapore housing precincts should prioritise shared community facilities.',
    context: 'URA describes plans for a mix of housing types and community-centred towns that encourage interaction. Weigh shared facilities against the land left for other uses, access across ages and incomes, maintenance and how residents would be consulted.',
    category: 'Housing', forReason: 'Shared facilities can give residents with different needs a practical reason to meet and use the same spaces.', againstReason: 'The best use of limited land may differ between precincts, and new facilities also require maintenance and accessible connections.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'URA — Inclusive and Close-Knit Towns', url: 'https://www.ura.gov.sg/land-planning/long-term-plan/space-for-our-dreams-exhibition/live/inclusive-and-close-knit-towns/' }] },
  { id: 'sg-street-space', title: 'Singapore should convert more neighbourhood road space into bus-priority and walking routes.',
    context: 'LTA describes repurposing suitable road space for footpaths, cycling, bus priority and community uses, with feedback from residents and businesses. Weigh travel access, deliveries, accessibility and how a trial should be evaluated.',
    category: 'Transport', forReason: 'Giving more space to buses and pedestrians can make shared travel and neighbourhood access more practical.', againstReason: 'A change can shift traffic or affect deliveries, so some neighbourhoods may need different designs or smaller trials.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'LTA — (Re)Purpose for the People', url: 'https://www.lta.gov.sg/content/ltagov/en/who_we_are/statistics_and_publications/Connect/roadrepurposing.html' }] },
  { id: 'sg-neighbourhood-greenery', title: 'Singapore estate upgrades should prioritise shade trees and neighbourhood parks.',
    context: 'The Singapore Green Plan includes expanding green spaces and access to parks. Debate a hypothetical estate upgrade where greenery leaves less space for other amenities, considering heat, recreation, maintenance and residents with different needs.',
    category: 'Climate', forReason: 'Accessible greenery can make outdoor areas more inviting and give residents shared places to spend time.', againstReason: 'Residents may urgently need other amenities, and greenery should be planned alongside upkeep, access and competing uses.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'Singapore Green Plan 2030 — Our Targets', url: 'https://www.greenplan.gov.sg/targets/' }] },
  { id: 'sg-ai-human-review', title: 'Singapore organisations should require human approval for consequential AI-agent decisions.',
    context: 'IMDA’s agentic AI governance guidance, updated in May 2026, discusses risk limits, human accountability and oversight. Debate approval before decisions that significantly affect people, considering who can review them, appeals, workload and useful automation.',
    category: 'AI governance', forReason: 'A meaningful human checkpoint can make responsibility clearer and give affected people a route to question a consequential decision.', againstReason: 'Approval can become a routine tick-box exercise; risk-based controls and careful audits may work better for some tasks.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'IMDA — Updated Model AI Governance Framework for Agentic AI', url: 'https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/factsheets/2026/updated-model-ai-governance-framework-for-agentic-ai' }] },
  { id: 'sg-media-literacy', title: 'Singapore schools should dedicate regular lessons to checking online claims.',
    context: 'NLB’s S.U.R.E. courseware teaches information and digital media literacy through checking sources, understanding, research and evaluation. Debate dedicated lessons comparing multiple sources, considering curriculum time, practical exercises, fast-changing media and skills beyond memorising rules.',
    category: 'Media literacy', forReason: 'Regular practice can give learners a repeatable way to compare claims and explain why a source deserves trust.', againstReason: 'Embedding these skills across subjects may connect them to real questions more effectively than a separate lesson.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'NLB — S.U.R.E. School Courseware', url: 'https://www.nlb.gov.sg/main/site/sure-elevated/for-schools/sc-advanced-level' }] },
  { id: 'sg-hawker-apprenticeships', title: 'Singapore should prioritise paid apprenticeships in public support for hawker culture.',
    context: 'NEA describes hawker culture as a shared community practice and highlights passing culinary skills and knowledge between generations. Debate paid apprenticeships for new hawkers, considering livelihoods, mentoring time, food affordability and whether apprenticeships address the main barriers.',
    category: 'Hawker heritage', forReason: 'Paid learning time can help new hawkers gain practical skills while recognising the work of experienced mentors.', againstReason: 'Training alone may not make a stall sustainable; support may also need to address operating conditions and different routes into the trade.',
    region: 'Singapore', contextReviewedAt: '2026-11-16', sources: [{ title: 'NEA — Hawker Culture', url: 'https://www.nea.gov.sg/our-services/hawker-management/programmes-and-grants/hawker-culture' }] },
];
export const DEBATE_TOPICS = [
  { id: 'school-gardens', title: 'Every school should offer a student garden.', context: 'Consider learning, shared space, maintenance and different access needs.', category: 'Community', forReason: 'A shared garden can turn a lesson into a practical activity.', againstReason: 'Schools need flexibility when space, maintenance time or access is limited.' },
  { id: 'homework-choice', title: 'Students should choose between different homework formats.', context: 'Consider learning goals, fairness, accessibility and how understanding is checked.', category: 'Learning', forReason: 'Different formats can let learners explain the same idea in a way they can access.', againstReason: 'A shared format can make expectations clearer and work easier to compare fairly.' },
  { id: 'library-spaces', title: 'Libraries should dedicate more space to group learning.', context: 'Consider quiet reading, community activities, limited space and different visitors.', category: 'Community', forReason: 'Group spaces give people somewhere to exchange ideas and learn together.', againstReason: 'Quiet reading space is also a limited resource that some visitors cannot find elsewhere.' },
  { id: 'repair-devices', title: 'Everyday electronic devices should be easier to repair.', context: 'Consider waste, cost, safety and practical design trade-offs.', category: 'Environment', forReason: 'Repair can extend the useful life of something people already own.', againstReason: 'Repair-friendly design still needs to account for safety and practical production limits.' },
  { id: 'museum-access', title: 'Public museums should offer free entry to permanent collections.', context: 'Consider access, conservation, funding and alternatives to ticket income.', category: 'Culture', forReason: 'Free entry can remove a barrier to shared cultural learning.', againstReason: 'Museums still need reliable resources to care for collections and visitors.' },
  { id: 'shared-play', title: 'Communities should reserve more outdoor space for unstructured play.', context: 'Consider different ages, accessibility, safety and competing uses of public space.', category: 'Community', forReason: 'Flexible play space can accommodate many kinds of shared activity.', againstReason: 'Communities also need space for quiet use, travel and organised activities.' },
  ...SINGAPORE_DEBATE_TOPICS,
];
export const DEBATE_OPPONENTS = [
  { id: 'mina', name: 'Mina', title: 'The curious listener', difficulty: 'beginner', style: 'One clear counterpoint and a gentle question.', collection: 'girl', description: 'Practise explaining your reasons in a calm exchange.' },
  { id: 'leo', name: 'Leo', title: 'The practical challenger', difficulty: 'intermediate', style: 'Tests examples, trade-offs and workable conditions.', collection: 'boy', description: 'Connect your claim to a concrete example and its limits.' },
  { id: 'ari', name: 'Ari', title: 'The careful questioner', difficulty: 'advanced', style: 'Examines assumptions and fairly compares alternatives.', collection: 'girl', description: 'Refine a position while addressing its strongest challenge.' },
];
export const DEBATE_BOSS = {
  id: 'chair-lin', name: 'Chair Lin', title: 'The policy chair', difficulty: 'advanced', collection: 'girl', boss: true, fictional: true,
  style: 'A professional, calm policy discussion: test the actual proposal against implementation, affected groups, opportunity cost and a fair alternative. Ask one precise challenge at a time; acknowledge sound concessions. Never demand obscure facts or use personal attacks.',
  description: 'A fictional final-round chair, not a public official. Defend a workable Singapore policy proposal while weighing who benefits, who bears costs and what could change your mind.',
};
export const TOURNAMENT_OPPONENTS = [DEBATE_OPPONENTS[0], DEBATE_OPPONENTS[1], DEBATE_BOSS];
export const DEBATE_CRITERIA = [
  { key: 'relevance', label: 'Relevance', anchor: 'Responds to this proposition and the actual exchange.' },
  { key: 'claim_clarity', label: 'Claim clarity', anchor: 'Makes a precise, understandable position, including an appropriate qualification.' },
  { key: 'reasoning', label: 'Reasoning', anchor: 'Explains why the reason supports the claim without a material inferential gap.' },
  { key: 'evidence', label: 'Evidence / examples', anchor: 'Uses a relevant example or support with an honest scope; invented statistics are not support.' },
  { key: 'rebuttal', label: 'Rebuttal quality', anchor: 'Fairly responds to an actual opposing argument with a reason, justified concession or revision.' },
  { key: 'coherence', label: 'Coherence', anchor: 'Connects the relevant parts so the case can be followed without repetition or a prescribed essay format.' },
];
export const DEBATE_RULES = {
  version: DEBATE_VERSION, title: 'Singapore Civic Cup', rounds: 3, tieMargin: 2,
  scale: '0–4 per criterion; six equally weighted criteria for each side.',
  outcome: 'A total difference of at most 2 points is a draw. Incomplete or low-confidence judging is an uncertain draw, never an automatic loss.',
  progression: 'A judged win advances. A draw can be replayed in the same round. A loss ends this run; start a new run to try again.',
  local: 'Without an AI provider, practice uses an explicitly labelled rule-based challenger and unscored reflection. Tournament progression is unavailable.',
  timers: 'Suggested speaking guides only. Pause freely; timeouts and technical failures never decide a match.',
  limitations: 'Response-level coaching, not a validated ability score. Accent, identity, verbosity and agreement are not scored. Delivery is not judged from a transcript. External facts are not independently verified.',
};

export function decideDebateOutcome(criteria, uncertain = false) {
  const valid = Array.isArray(criteria) && criteria.length === DEBATE_CRITERIA.length &&
    DEBATE_CRITERIA.every(({ key }) => criteria.filter(item => item.key === key).length === 1) &&
    criteria.every(item => ['user', 'ai'].every(side => Number.isInteger(item[side]?.score) && item[side].score >= 0 && item[side].score <= 4 && ['medium', 'high'].includes(item[side].confidence)));
  if (!valid || uncertain) return { outcome: 'draw', uncertain: true, totals: { user: null, ai: null }, explanation: 'The judge could not establish a sufficiently supported comparison. This is an uncertain draw; no loss or competitive advancement is recorded.' };
  const totals = { user: criteria.reduce((sum, item) => sum + item.user.score, 0), ai: criteria.reduce((sum, item) => sum + item.ai.score, 0) };
  const difference = totals.user - totals.ai;
  const outcome = Math.abs(difference) <= DEBATE_RULES.tieMargin ? 'draw' : difference > 0 ? 'win' : 'loss';
  return { outcome, uncertain: false, totals, explanation: `The six equally weighted criteria total ${totals.user} for your case and ${totals.ai} for the opponent. ${outcome === 'draw' ? 'The difference is within the 2-point draw margin.' : 'The difference exceeds the 2-point draw margin.'} This describes this exchange, not your ability or the truth of either position.` };
}
