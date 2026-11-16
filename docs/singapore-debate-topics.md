# Singapore Civic Cup: content and source audit

The cup uses six original civic-policy practice motions grounded in official Singapore background material. The source review date is **16 November 2026**. This is a curated briefing bank, not a live news feed. A motion is a proposal to debate; it does not assert that Singapore has adopted it or that its source endorses either side.

Each topic includes `region: "Singapore"`, `contextReviewedAt: "2026-11-16"` and a `sources` array with the official title and URL. No statistics, claimed policy outcomes or current officeholders were invented. Context describes the published initiative; the suggested arguments are original reasoning prompts. Learners can defend either position.

| Topic ID | Practice question | Background verified | Source date shown |
| --- | --- | --- | --- |
| `sg-inclusive-housing` | Prioritise shared community facilities in new housing precincts? | URA discusses mixing housing types and planning community-centred towns. [URA: Inclusive and Close-Knit Towns](https://www.ura.gov.sg/land-planning/long-term-plan/space-for-our-dreams-exhibition/live/inclusive-and-close-knit-towns/) | Updated 1 July 2026 |
| `sg-street-space` | Convert more neighbourhood road space to bus priority and walking? | LTA describes suitable road-space changes and consultation with residents, commuters and businesses. [LTA: (Re)Purpose for the People](https://www.lta.gov.sg/content/ltagov/en/who_we_are/statistics_and_publications/Connect/roadrepurposing.html) | Posted 26 May 2023 |
| `sg-neighbourhood-greenery` | Prioritise trees and parks over some competing estate amenities? | The Green Plan includes green-space expansion and access to parks. Targets are treated as targets, not achieved results. [Singapore Green Plan 2030: Our Targets](https://www.greenplan.gov.sg/targets/) | Updated 31 March 2026 |
| `sg-ai-human-review` | Require human approval for consequential AI-agent decisions? | IMDA's updated framework discusses limits on risks and human accountability, oversight and training. The motion is a discussion of design choices, not a statement of a legal requirement. [IMDA: Updated Model AI Governance Framework for Agentic AI](https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/factsheets/2026/updated-model-ai-governance-framework-for-agentic-ai) | Dated/updated 20 May 2026 |
| `sg-media-literacy` | Dedicate regular school lessons to checking claims across sources? | NLB provides S.U.R.E. information and digital-media literacy courseware. No claim is made about current mandatory curriculum time. [NLB: School Courseware](https://www.nlb.gov.sg/main/site/sure-elevated/for-schools/sc-advanced-level) | No publication/update date stated in the reviewed content; accessed 16 November 2026 |
| `sg-hawker-apprenticeships` | Prioritise paid apprenticeships in support for hawker culture? | NEA describes hawker culture's community role and the importance of passing skills between generations. The paid-apprenticeship priority is a proposed motion, not a reported new scheme. [NEA: Hawker Culture](https://www.nea.gov.sg/our-services/hawker-management/programmes-and-grants/hawker-culture) | Page footer updated 3 June 2024 |

IMDA's full May 2026 factsheet was available in the official search-indexed page response; a subsequent direct page request displayed a JavaScript access challenge. The dated source text was cross-checked against the [official January 2026 framework factsheet](https://www.imda.gov.sg/-/media/imda/files/news-and-events/media-releases/2026/01/factsheet-model-ai-governance-framework-for-agentic-ai.pdf). No access challenge was bypassed.

## Opponents and API contract

Street practice includes Mina, Leo, Ari, Safiya, Daniel and Kai. Each new tournament is **one match against Chair Lin**. Chair Lin (`chair-lin`) is a fictional policy chair, not a public official or a representation of a real person. The shared character uses the existing girl avatar collection. The interface supplies the professional outfit; no new sprite ownership or player inventory entitlement is implied by an NPC's appearance.

The chair asks about implementation, affected groups, opportunity cost and alternatives. The tone stays calm, age-appropriate and focused on the argument. Difficulty does not change the six equally weighted judge criteria or reward agreement with a policy or the opponent.

`GET /api/debate/catalog` adds:

- `tournamentTopics`: the six Singapore topic objects.
- `tournamentOpponents`: Chair Lin only. `rules.rounds` is 1 for new cups.
- `boss`: the Chair Lin object, including `boss: true` and `fictional: true`.

Existing `topics` includes all earlier topics plus the Singapore bank. `opponents` contains six street NPCs. A practice request may use `opponentId: "chair-lin"` with a Singapore topic. With no provider key it remains rule-based, unscored local practice; it cannot grant a competitive win or start a tournament.

New competitive cups require a Singapore topic. An old request ID still returns its saved run. Saved runs keep their title, topic context and bracket; advancing a pre-change Common Ground Cup continues to Ari, rather than silently substituting Chair Lin. New and resumed rounds copy the saved topic and opponent snapshot, so a later content update cannot change an ongoing run's brief.

AI requests receive the dated background, but do not fetch source pages during a match. Opponent and judge instructions prohibit treating links as live fact checks or asserting facts beyond the brief. The judge still validates exact saved-turn evidence; the server alone calculates the outcome. A final boss win completes the cup only after validated judging. Technical errors and uncertain comparisons never become an automatic loss or a fabricated victory.

## Verification

The focused Node 24 debate/API suite covers a complete mocked single-boss challenge, rejection/recovery of unsupported judging evidence, draw replay against the same boss, reward idempotency after restart, a full saved legacy three-match run, official-source metadata, local boss practice with no provider calls, and existing account/audio ownership checks. No paid AI request or live fact-checking call is needed by the test suite.
