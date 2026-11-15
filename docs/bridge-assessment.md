# BRIDGE response coaching and Thought Maps

## Scope and research boundary

New **daily-plan Spin & Speak sessions** use `bridge-v1`. Classic speaking sessions, historical evaluations, Debate and Read & Reflect retain their existing task-specific rubrics. A session records its framework at creation; profile changes and retries do not silently change its rubric. This is an incremental rollout, not completion of the master build prompt.

BRIDGE is an original, research-informed **unvalidated** adaptation. Its 1–4 descriptions are not official instrument wording, norms or established app scoring accuracy. The exact shared definitions are in `shared/bridge-rubric.mjs`, consumed by both model prompting and the criteria UI.

| Foundation | Role in this implementation | Limit |
| --- | --- | --- |
| [Toulmin](https://doi.org/10.1017/CBO9780511840005.007) | Structural labels for claims, grounds, warrants, backing, qualifications and rebuttals in the map | A graph's structure does not establish truth or soundness. |
| [AAC&U VALUE](https://www.aacu.org/initiatives/value-initiative/value-rubrics) | Coverage reference for message, support, organisation, language, alternatives and reasoning | Its oral rubric concerns developed presentations; its evidence cannot validate arbitrary short answers or this model. The official site returned 403 during this implementation review; the original oral rubric was also available through [DePaul's institutional copy](https://resources.depaul.edu/teaching-commons/teaching-guides/feedback-grading/rubrics/Documents/aacu-value-rubrics/OralCommunication.pdf). No rubric table is reproduced. |
| [Elder & Paul](https://www.criticalthinking.org/pages/universal-intellectual-standards/527) | Questions about clarity, relevance and logical connections | These are conceptual standards, not a validated app instrument. |
| [Hattie & Timperley](https://doi.org/10.3102/003465430298487) | Feedback focused on the task, current evidence and one next question | The app has not established learning gains from this UI. |
| [Wachsmuth et al.](https://aclanthology.org/E17-1017/) | Quality of support and reasoning, beyond counting argument elements | Published research does not automatically validate this adapted rubric or LLM ratings. |

The six dimensions are **Big Idea, Reasons, Illustrations, Different Perspectives, Glue and Expression**. Expression rates wording and audience fit only. Pronunciation, accent, intelligibility, pacing and prosody require separate acoustic assessment and remain unassessed here. External facts are marked unverified; lack of a source does not automatically make a claim false.

## Applicability and ratings

The backend's curated prompt metadata declares applicable dimensions. The reviewer cannot change that list. `D` is only elicited for reviewed tasks that call for an alternative, trade-off or limitation. A story can use `B/G/E` without being penalised for absent argument components; the question catalogue still needs its full roadmap expansion.

Each of the six returned dimensions has a score of 1–4 or null, an explicit `assessed`, `not_assessed` or `insufficient_evidence` status, a concise strength/next step and exact answer evidence. Null is not zero. Model certainty is an uncalibrated label. No overall score is calculated, and these ratings do not grant XP, a mastery stage or an ability label.

Every assessed dimension and the primary judged feedback require an exact, uniquely occurring quotation from the saved answer. The server locates UTF-16 character spans; the model supplies short quotes rather than offsets. Ambiguous, altered, missing or malformed evidence fails validation. Unknown fields cannot inject provenance or awards. The actual model response identifier, rubric and template are supplied by server code.

## Thought Map contract

The topic in the centre follows Novak and Cañas’s idea of a focus question. Branches use Toulmin roles to show where a reason, example or warrant belongs. Claim–Evidence–Reasoning offers a simpler coaching sequence for short answers. For narrative or reflective prompts, BRIDGE applicability controls which gaps are relevant. [Novak and Cañas, IHMC](https://cmap.ihmc.us/docs/theory-of-concept-maps.php) · [Toulmin](https://doi.org/10.1017/CBO9780511840005.007) · [McNeill and colleagues](https://public.websites.umich.edu/~krajcik/Papers/McNeill_et_al_JLS_2006.pdf)

The `thought-map-v2` graph permits up to 12 nodes and 24 edges. The centre is the actual prompt. Claim, reason, evidence, warrant, backing, qualifier and rebuttal nodes connect through supports, explains, challenges, qualifies or needs-explanation links.

- **Green · Well developed.** A clear contribution supported by a verbatim response excerpt.
- **Yellow · Needs elaboration.** An idea present in the response that needs more explanation, an example or a clearer link. Includes an actionable next step.
- **Red · Suggested gap.** A relevant missing link, example or alternative perspective. Includes a guiding question or next step.
- **Blue · Planned, left unsaid.** A clear idea anchored in the planning notes with no equivalent in the complete response. Includes a way to bring it into a later response.
- **Neutral.** Tentative AI interpretations and saved older response nodes whose development was never classified.

The current integration saves optional typed prep notes as `planningNotes` on the attempt before recording or text submission. The AI compares meaning across notes and the saved response while BRIDGE scores use response evidence. Exact response and note excerpts are validated separately. The model may cite both sources for a shared idea. If a response contains a partial version of an idea, the node is yellow. The server checks for an exact normalized match before accepting a blue node. Semantic equivalence and quality remain provisional model judgments. With no notes, the map uses the response alone. Post-response self-reflection and guiding-question notes are separate inputs.

Ordinary backend code checks schema bounds, ID uniqueness, existing endpoints, duplicate/self edges, acyclicity, exact spans and status/text consistency. A nonempty graph requires at least one explicit node. Empty maps are allowed for insufficient interpretable evidence. These checks establish integrity, not semantic correctness of a model's classification or inference.

If the model returns an invalid branch or connection, the evaluator keeps the remaining verifiable graph and shows that the map is incomplete. Quoted node text is taken directly from the saved source. When no verifiable response node remains, the sample map is available alongside any BRIDGE feedback that independently passed validation.

WordBloom entries are checked independently for unique terms and exact response evidence. Invalid suggestions or usage observations are omitted before vocabulary progress is recorded.

Maps are stored with the evaluation in the existing attempt JSON so validated feedback, map and daily participation rewards commit atomically. `GET /api/attempts/:id/thought-map` returns only the owner's persisted map and never generates new feedback. Account export includes it; deletion removes it with the attempt. No schema migration is needed for these additional JSON fields.

## UI and platform decision

The feedback screen leads with one strength, one priority gap and one open question, then a retry action. The six-criterion breakdown is optional. The map uses a wide canvas with branches on both sides of the topic, curved connectors, zoom, source inspection, a text outline and visible status labels. The outline retains every argument relation. Revisions reuse the original planning snapshot and keep the original and revised responses and maps independently inspectable.

The master prompt's web-specific React Flow/Dagre suggestion was adapted to the existing Expo/React Native architecture: bounded directed-graph layout in shared JavaScript, native Views/Pressables and the already installed `react-native-svg`. This keeps iOS, Android and web on one implementation without a DOM-only dependency. Mobile defaults to the text outline; the map remains available. Actual device gesture and screen-reader validation remains release work.

Without a provider key, all BRIDGE ratings are null and the map is **not assessed**. Local keywords are never turned into claims, semantic ratings or inferred reasoning. A separate original sample demonstrates graph interaction, explicitly labelled as sample content and never saved as learner evidence or credited as progress.

Planning notes are submitted with the response to the configured evaluation provider when AI is enabled. They are stored with the owned attempt and included in account export and deletion. When the shared whiteboard is ready, use its readable text as the planning snapshot. Its layout coordinates and drawings are outside the current evaluator contract.

## Verification and remaining work

`tests/bridge.test.mjs` checks rubric bounds/applicability, provider schema and metadata, Unicode anchoring, invalid graphs, inferred/missing integrity, safe failures and layout. `tests/bridge-api.test.mjs` checks atomic failure/recovery, ownership, duplicate reward prevention, restart persistence, export/deletion and historical-rubric preservation. Browser tests exercise local/sample honesty and configured synthetic-provider map inspection, source highlighting, invalid-output recovery and linked revision.

These are software/transport tests, not a human-rating calibration study. Real model scoring reliability, accent/device fairness, meaningful learning outcomes, native device behaviour, the full optional-mode BRIDGE rollout, WordBloom and calibrated mastery remain outstanding. The earlier [daily-loop verification](verification-daily-workout.md) remains a snapshot of that slice; updated BRIDGE results are recorded in the build alignment report.
