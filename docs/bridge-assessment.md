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

The structured provider output is limited to 12 nodes and 24 edges. Node types cover claim, reason, evidence, warrant, backing, qualifier and rebuttal. Edges use supports, explains, challenges, qualifies or needs-explanation relationships.

- **Explicit:** text must equal the exact source quote. The server anchors its span, and tapping the node highlights it in the authentic response.
- **Inferred:** a proposed interpretation with no quotation or source span. It is never labelled as the learner's words.
- **Missing:** null text and no quotation/span; feedback is a proposed gap or question to consider, not fabricated content.

Ordinary backend code checks schema bounds, ID uniqueness, existing endpoints, duplicate/self edges, acyclicity, exact spans and status/text consistency. A nonempty graph requires at least one explicit node. Empty maps are allowed for insufficient interpretable evidence. These checks establish integrity, not semantic correctness of a model's classification or inference.

Maps are stored with the evaluation in the existing attempt JSON so validated feedback, map and daily participation rewards commit atomically. `GET /api/attempts/:id/thought-map` returns only the owner's persisted map and never generates new feedback. Account export includes it; deletion removes it with the attempt. No schema migration is needed for these additional JSON fields.

## UI and platform decision

The feedback screen leads with one strength, one priority gap and one open question, then a retry action. The six-criterion breakdown is optional. The map has zoom controls, scrolling to pan, node selection, exact-source highlighting, an accessible full text outline, textual status labels and a legend. Revisions retain both original texts and, where available, both persisted maps; no skill gain is inferred from score differences.

The master prompt's web-specific React Flow/Dagre suggestion was adapted to the existing Expo/React Native architecture: bounded directed-graph layout in shared JavaScript, native Views/Pressables and the already installed `react-native-svg`. This keeps iOS, Android and web on one implementation without a DOM-only dependency. Mobile defaults to the text outline; the map remains available. Actual device gesture and screen-reader validation remains release work.

Without a provider key, all BRIDGE ratings are null and the map is **not assessed**. Local keywords are never turned into claims, semantic ratings or inferred reasoning. A separate original sample demonstrates graph interaction, explicitly labelled as sample content and never saved as learner evidence or credited as progress.

The existing optional thought-guide notes, private recording playback, linked revision and report-concern flow remain available. Nothing silently rewrites the saved response. Generated drafts remain a separate explicit coaching aid rather than a replacement assessment or automatic answer.

## Verification and remaining work

`tests/bridge.test.mjs` checks rubric bounds/applicability, provider schema and metadata, Unicode anchoring, invalid graphs, inferred/missing integrity, safe failures and layout. `tests/bridge-api.test.mjs` checks atomic failure/recovery, ownership, duplicate reward prevention, restart persistence, export/deletion and historical-rubric preservation. Browser tests exercise local/sample honesty and configured synthetic-provider map inspection, source highlighting, invalid-output recovery and linked revision.

These are software/transport tests, not a human-rating calibration study. Real model scoring reliability, accent/device fairness, meaningful learning outcomes, native device behaviour, the full optional-mode BRIDGE rollout, WordBloom and calibrated mastery remain outstanding. The earlier [daily-loop verification](verification-daily-workout.md) remains a snapshot of that slice; updated BRIDGE results are recorded in the build alignment report.
