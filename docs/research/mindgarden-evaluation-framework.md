# A research-informed evaluation framework for MindGarden

Evidence review and implementation decision · 30 October 2026

## Decision

Use **original, mode-specific analytic rubrics**, with an LLM reviewing one response against explicit criteria and quoting the learner's text. This is the best fit identified for MindGarden's short practice tasks. It is **not a scientifically validated scoring system yet**. No reviewed framework establishes that an arbitrary LLM can accurately score every unrestricted response.

“Scientific evid# BridgingMinds — Master Build Prompt

> **Purpose:** Give this document to an AI coding agent to design and implement BridgingMinds. Treat it as the product and engineering source of truth. Build a polished, working application, not a collection of static mockups.
>
> **Product tagline:** **Think clearer. Speak better. Grow independently.**
># BridgingMinds — Master Build Prompt

> **Purpose:** Give this document to an AI coding agent to design and implement BridgingMinds. Treat it as the product and engineering source of truth. Build a polished, working application, not a collection of static mockups.
>
> **Product tagline:** **Think clearer. Speak better. Grow independently.**
>
> **Product thesis:** As AI makes it easier to generate polished answers, BridgingMinds uses AI to strengthen people's own critical thinking, articulation, reasoning, and spoken communication—not to replace their thinking.

---

## 0. Operating instructions for the coding agent

1. **Inspect the repository first.** If a project exists, follow its conventions and reuse working infrastructure. If it is empty, scaffold the recommended stack below. Do not overwrite existing functionality without a clear reason.
2. **Implement, don't merely describe.** Build runnable pages, components, backend endpoints, database models, migrations, tests, seed content, and documentation. No dead buttons, decorative controls, fake progress, or unfinished placeholder pages presented as functioning features.
3. **Prioritise the launch MVP end-to-end.** Complete the two daily activities, feedback, personalisation basics, streaks, XP, and garden before tackling advanced multiplayer or content feeds. Work in vertical slices: record → analyse → show feedback → persist → award progress.
4. **Create a premium, original interface.** Duolingo is a reference for approachability, habit formation, delightful feedback, and clarity—not a visual asset, character, palette, or screen to copy. BridgingMinds has its own warm, garden-themed identity.
5. **Keep model judgments bounded and explainable.** The LLM may produce skill observations and recommendations, but the backend alone awards XP, validates mastery, and updates streaks. Never invent speech scores or factual evidence.
6. **Work even without paid API keys.** Offer a clearly labelled **Demo Mode** with pre-recorded/sample passages and deterministic example analysis so the full UI can be reviewed. Do not misrepresent demo results as a real assessment.
7. **Write down assumptions and trade-offs.** Where details remain open, choose reasonable defaults, document them in `README.md`, and continue building. Avoid blocking on minor clarifications.
8. **Security, accessibility and privacy are product requirements.** Protect recordings, control retention, honour accessibility settings, and do not assume a particular English accent is incorrect.

---

## 1. Product positioning and audience

**BridgingMinds is an AI-powered thinking and communication gym** for students and young adults who may have useful ideas but struggle to organise, justify, and express them spontaneously.

### Three differentiation pillars

1. **Habit-forming, enjoyable practice:** A short daily learning ritual plus a garden that rewards consistency and demonstrated growth.
2. **Visual and digestible feedback:** AI-generated Thought Maps show claims, evidence, logical links, and missing pieces instead of overwhelming users with paragraphs of critique.
3. **Cross-activity adaptive practice:** The product recognises recurring weaknesses, prescribes exercises, reduces hints, and measures the ability to apply skills independently to new prompts.

### Key UX promise

A user opens the app, sees **exactly two required daily activities**, completes them in about five minutes, receives encouraging, specific feedback, watches their garden respond, and knows what to practise next.

### Core learning domains

- **Voice:** pronunciation, intelligibility, pacing, pauses, stress, and intonation.
- **Thinking:** claims, logical reasoning, evidence, assumptions, and perspectives.
- **Expression:** coherence, appropriate vocabulary, articulation, and audience awareness.
- **Independence:** successful performance on fresh questions without hints.

---

## 2. Non-negotiable daily engagement model

### Exactly two required daily activities

**A. Read Aloud (target ~2 minutes)**
- Read a short, level-appropriate passage aloud.
- Receive pronunciation, clarity/intelligibility, pacing, and intonation feedback when supported by the selected speech service.
- Highlight relevant words/phrases and offer one bite-sized practice task.
- Adapt subsequent passages to recurring, verified difficulties.
- **Award +10 XP** on the first qualifying completion of this activity on a given local day.

**B. Spin & Speak (target ~3 minutes)**
- Spin a topic wheel to get a question.
- Allow optional brief preparation, then record an original spontaneous response.
- Analyse reasoning, clarity, and delivery; generate a Thought Map and short improvement guidance.
- Offer one optional retry or follow-up question targeting a weakness.
- **Award +15 XP** on the first qualifying completion of this activity on a given local day.

### Final, explicit streak rules

**A daily streak is earned or maintained ONLY when the user completes BOTH Read Aloud AND Spin & Speak on the same local calendar day.** Completing either one alone is **not enough**.

- Show progress as **0/2**, **1/2**, or **2/2** daily activities.
- **0/2:** No daily completion, no streak credit.
- **1/2:** The completed activity earns its XP, but the day is incomplete and the streak is NOT secured.
- **2/2:** Mark the daily workout complete, award total **25 XP**, grant one **daily garden reward**, and secure/extend the streak.
- The reward at 2/2 should be a **cosmetic seed/decor token**, not automatic skill mastery. Do **not** add another XP bonus unless explicitly changed later.
- Extra attempts are always allowed for learning; no repeated XP from repeating the same qualifying activity that day.
- Optional Debate, Read & Reflect, WordBloom, and other activities **do not substitute** for either required daily activity and do not independently secure a streak.
- Use the user's **chosen IANA time zone** and local calendar date as the day boundary; make completion idempotent across retries, refreshes, devices, and concurrent submissions.
- For MVP, no automatic streak freeze. You may design the system to support a later optional grace/freeze feature, but do not enable one implicitly.
- Missing a day breaks the active streak but **does not kill plants, remove earned XP, erase achievements, or shame the user**.

**Qualifying completion:** A legitimately submitted exercise with a persisted attempt and a successful processing outcome (or an explicitly authorised fallback when speech processing is unavailable). Require a minimum meaningful interaction, but do not penalise users for accent, answer quality, or a low score. An unintelligible/empty recording should prompt an accessible retry, not award XP.

### Progress and feedback states

The Home screen must unambiguously distinguish:
- **Practice activity completed** (valid attempt submitted and processed),
- **Daily workout completed** (both required activities), and
- **Skill mastery demonstrated** (separate longitudinal achievement).

Never communicate that the streak is complete at 1/2.

---

## 3. Gamification: The Garden of Minds

**Theme:** *Every thought is a seed. Every improvement helps it grow.*

### One attractive personal garden

A cozy, interactive, living garden with soft depth, small animated plants, rewarding interactions, and graceful transitions. Avoid making users maintain an excessive number of currencies or menus.

Organise plants/areas around skill domains:
- **Voice Garden:** pronunciation, intelligibility, pacing, and prosody.
- **Reasoning Orchard:** clear claims, sound reasons, explanations, and evidence.
- **Articulation Meadow:** coherent and understandable expression.
- **Perspective Forest:** alternative viewpoints, listening, and rebuttals.
- **WordBloom Garden:** appropriate vocabulary and productive word use.

For the MVP, a **single garden canvas with distinct plants** is sufficient. Do not build five elaborate map worlds before verifying the learning loop.

### Separate effort rewards from mastery

**XP:** Measures participation and practice completion; initially 10 for Read Aloud and 15 for Spin & Speak per day. It can unlock purely cosmetic elements and general progress markers. Award through deterministic backend events only.

**Skill growth:** Driven by multiple meaningful evaluations over time, not XP totals or logins. Each plant maps to specific measurable skills and grows through four states:

| Stage | Condition |
| --- | --- |
| Seed | Skill has been introduced or baseline assessed. |
| Sprout | User has undertaken meaningful guided practice. |
| Bud | User shows improvement or reliably strong performance across distinct questions. |
| Bloom | User demonstrates skill independently on multiple unfamiliar prompts across different sessions. |

For an initial pilot, use a configurable, provisional mastery rule such as **at least 3/4 on the relevant rubric dimension in 2 of the last 3 independently completed, distinct attempts**, subject to human calibration. Do not represent this threshold as scientifically validated. Strong beginners can earn mastery without first producing poor results. If AI confidence is insufficient, withhold a mastery change and ask for another attempt.

### Daily reward & quests

- **At 2/2 daily activities**, reward a small cosmetic seed/decor item and a satisfying growth celebration.
- The **two daily activities are the only mandatory quests** in the MVP. Do not add a third mandatory quest.
- Optional side quests may later offer cosmetic items or limited XP, but **never replace the two mandatory activities**.
- Garden item inventory, placed decorations, plant stages, quest state, and reward issuance must persist.
- Deduplicate grant events (e.g. unique key `user_id + local_date + reward_type`).

### Delight without punishment

- Gentle haptics where supported, opt-in sound effects, tasteful confetti, responsive plant animations, and celebratory copy.
- Optional reminders, user-controlled notification frequency, and reduced-motion alternatives.
- No plant death, shame-based streak messages, forced public rankings, or penalising mistakes.
- Social mechanics and friend debates are opt-in later-stage features.

---

## 4. User journey and navigation

### Mobile-first navigation

**Home | Learn | Garden | Progress | Profile**

- **Home:** Today's 2/2 workout, current streak, earned XP, one clear next CTA, selected plant highlight, last improvement insight.
- **Learn:** Required Read Aloud and Spin & Speak plus an **Explore** section for optional modes as they become functional.
- **Garden:** Interactive personal garden with plant growth explanations, rewards, decorations, and skill-linked progress.
- **Progress:** Trends for Voice, Reasoning, Articulation, Vocabulary, and Independent Mastery; view historical attempts and before/after comparisons.
- **Profile/Settings:** Goals, difficulty, chosen time zone, recording privacy/retention, accessibility, reminder preferences, account management.

**Never make the homepage a dense analytics dashboard.** It should answer: *What do I do today? How close am I to finishing? What improved?*

### Onboarding

1. Welcome and concise purpose statement.
2. Choose goals (e.g. clearer speaking, critical thinking, presentations, interviews) and desired challenge level.
3. Set time zone and optionally reminder preferences.
4. Explain microphone permission and what audio is stored.
5. Optional 60-second baseline task; distinguish baseline from true mastery.
6. Introduce the garden and the **two-activity daily rule**.

---

## 5. Feature: Read Aloud

### UX flow

Choose a passage → see estimated reading time → allow microphone access → record with clear waveform/state → replay → submit → process → receive annotated passage and micro-coaching → save/try again → return to daily dashboard.

### Audio analysis

- Browser microphone capture via `getUserMedia` + `MediaRecorder` (or a compatible mobile framework API), with upload validation and graceful denied-permission fallback.
- For reference-text reading, prefer **Azure AI Speech Pronunciation Assessment** (where supported) for word/phoneme-level accuracy and fluency; confirm service capabilities for configured English locale and avoid reporting unavailable prosody fields.
- Compute or extract useful observations: potentially mispronounced words, completeness, pauses, pace, stress and intonation **where technically reliable**.
- Store confidence and provenance for each observation. Distinguish uncertain acoustic feedback from confirmed errors.
- Display word highlights linked to the audio timeline and a tap-to-hear pronunciation example.
- Offer one key improvement, a short targeted drill, and an optional retry.
- Do not infer emotional state, intelligence, confidence or effort solely from pitch or accent.
- Respect Singapore English and other legitimate language varieties. Prioritise intelligibility and user-selected language targets rather than enforcing an arbitrary accent.

### Personalisation

Persist skill observations with passage ID, item difficulty, timestamp, locale and confidence. Require repeated credible observations before marking a recurring weakness. Recommend future passages focused on the identified skill, with periodic transfer checks using unseen text.

---

## 6. Feature: Spin & Speak

### UX flow

Animated topic wheel → selected category and difficulty → optional 10–20-second prep → 45–90-second original response → transcription and separate audio analysis → Thought Map + BRIDGE evaluation → one actionable prompt → optional retry or surprise follow-up.

Topic categories: education, technology, ethics, everyday life, creativity, storytelling, explaining concepts, persuasion, interview/presentation Q&A.

### Question bank

Use a seeded, curated database with metadata: category, difficulty, target skills, Bloom's cognitive demand, estimated response duration, example follow-ups, version and moderation status. AI can propose new questions, but do not automatically publish unreviewed material for all users.

### Processing

1. Persist attempt and audio (with the user's retention choices).
2. Transcribe speech using the speech-to-text provider, preserving timestamps where supported.
3. Evaluate **what was said** using argument parsing and BRIDGE; evaluate **how it was said** from the audio using separate speech metrics.
4. Produce structured feedback with direct transcript evidence and a Thought Map.
5. Generate a tailored follow-up/question **without writing the student's answer for them**.
6. Update the learner's skill profile and suggest a future exercise.

The topic wheel must be genuinely interactive, accessible, and random within eligibility rules—not a fixed animation pretending to choose a topic.

---

## 7. Signature feature: Visual Thought Maps

### Purpose

After open-ended responses, visually display the **main claim, reasons, evidence, implied or missing reasoning links, and relevant objections**. The map should help users see **why** an answer is weak and **how** to improve it.

### Technical pipeline

1. Segment transcript into attributable statements with character offsets and, if available, audio timestamps.
2. Extract Toulmin-inspired components: claim, grounds/evidence, warrant (reasoning link), backing, qualifiers, rebuttal (where appropriate).
3. Produce structured nodes and edges using a constrained output schema.
4. Validate IDs, types, references, source spans, and allowed edge relations in backend code.
5. Mark extracted content as **explicit**, **inferred**, or **missing**. Never quote inferred content as something the user actually said.
6. Flag specific weaknesses: unsupported assertion, weak warrant, unsupported evidence, unclear claim, contradiction, repetition, or relevant unaddressed perspective.
7. Render with **React Flow / XYFlow** and an auto-layout solution (Dagre or ELK), with a list/outline alternative for accessibility and small screens.
8. Support tap-to-expand evidence, transcript highlighting, zoom, accessible legend, and **Attempt 1 vs Attempt 2** comparison.

### Node schema (illustrative)

```ts
type ThoughtNode = {
  id: string;
  type: 'claim' | 'reason' | 'evidence' | 'warrant' | 'qualifier' | 'rebuttal';
  text: string | null;
  status: 'explicit' | 'inferred' | 'missing';
  sourceSpan?: { start: number; end: number };
  confidence?: number;
  feedback?: string;
};

type ThoughtEdge = {
  id: string;
  source: string;
  target: string;
  relation: 'supports' | 'explains' | 'challenges' | 'qualifies' | 'needs_explanation';
};
```

Use colour **plus text/icons** to indicate strong, uncertain, and missing connections. Do not assume every response requires all Toulmin components; a personal story and a formal debate have different expectations.

---

## 8. Evaluation framework: BRIDGE, grounded in established work

### User-facing BRIDGE dimensions

| Dimension | Meaning | Example signal |
| --- | --- | --- |
| **B — Big Idea** | Clear, relevant central message | Identifiable thesis or main point |
| **R — Reasons** | Sound and developed reasoning | Explanations actually support the claim |
| **I — Illustrations** | Relevant examples/evidence | Specific support, appropriately qualified |
| **D — Different Perspectives** | Consideration of alternatives when task-relevant | Fair counterargument or nuance |
| **G — Glue** | Logical organisation and coherence | Connected ideas, meaningful transitions |
| **E — Expression** | Understandable, appropriate delivery | Clear wording, audience fit and speech delivery as relevant |

### Scientific / educational basis

- **Toulmin Model of Argumentation:** Structural extraction and visualisation of claims, grounds, warrants and rebuttals.
- **AAC&U Critical Thinking VALUE Rubric:** Criteria involving evidence, assumptions, positions and conclusions.
- **AAC&U Oral Communication VALUE Rubric:** Organisation, language, central message, supporting material and delivery.
- **Paul–Elder intellectual standards:** Quality checks such as clarity, relevance, accuracy, depth and logic.
- **Hattie & Timperley feedback framework:** Clarify goal, current progress and next step.
- **Claim–Evidence–Reasoning (CER):** Beginner-friendly reasoning scaffolds.
- **Revised Bloom's Taxonomy:** Adjust the cognitive demand of questions.
- **CEFR phonological control descriptors:** Inform cautious, intelligibility-oriented speech feedback.

**Critical scientific honesty:** These are established frameworks, but **BRIDGE is a proposed adaptation, not a validated new scientific instrument**. Do not label numerical scores 'scientifically proven' or claim they are objective. Develop behaviourally anchored 1–4 rubric descriptors, test agreement with trained human raters, and report uncertainty and limitations.

### Scoring rules

- Choose which BRIDGE dimensions are relevant **per exercise**. For example, a 20-second personal story need not be penalised for lacking a rebuttal.
- Provide a 1–4 rating **only when evidence is sufficient**, plus a supporting quote/span and one actionable improvement.
- Otherwise return `not_assessed` / `insufficient_evidence`, not a fabricated zero.
- Separate language quality from factual accuracy; unknown claims must be marked unverified, not false by default.
- Keep judge model and rubric version on every evaluation for later re-scoring and auditing.
- Do not expose raw model chain-of-thought; show concise user-facing rationales tied to their answer.
- Calibrate against a human-scored sample across accents, activity types, and difficulty levels before trusting mastery decisions.

### Feedback UX

Prefer a **single primary improvement card** with:
- One thing done well.
- One specific gap, backed by a visible example from the response.
- One question or small action to help the user improve.
- An optional 'See full breakdown' panel.

---

## 9. Personalised adaptive learning engine

### Unified learner skill profile

Track time-series observations, not permanent labels:

- BRIDGE scores and evidence/confidence by dimension.
- Speech observations by pronunciation/intelligibility, pacing and prosody.
- User goals, topic interests and exercise difficulty.
- Attempts, retries, independent assessments and spaced review state.
- Recent questions to avoid repetition.

### Initial recommendation algorithm

Start with **deterministic rules plus structured AI-generated coaching**, not a complex ML recommender requiring large datasets:

1. Exclude low-confidence observations.
2. Aggregate repeated weaknesses across recent, varied activities.
3. Rank skills by urgency, opportunity for improvement and learning goal.
4. Choose an approved exercise type targeting the highest-priority skill.
5. Select a fresh question with suitable difficulty.
6. Apply an adjustable assistance level: guided hints → follow-up questions → independent attempt.
7. Reassess the skill on a different topic after a delay.

Example: weak supporting evidence in Spin & Speak → optional Read & Reflect evidence exercise → new independent Spin & Speak question → update evidence plant based on validated performance.

### Avoid false personalisation

A single weak answer or poor audio recording is not enough to diagnose an enduring problem. Show users **'We're noticing...'** rather than definitive labels, and let them dismiss irrelevant recommendations.

---

## 10. Optional and later-stage activities (do not block the MVP)

Implement these **only after the core daily loop works**. If not built yet, show an honest roadmap or omit their route; never ship decorative screens that pretend to work.

### Debate With Friends (phase 3)
- Private invite-based rooms, turn state, rebuttals and optional AI opponent.
- Realtime room updates with authoritative server-side turn transitions.
- Transparent judging of claim strength, evidence, relevance, rebuttals and coherence; anonymise ordering where possible, allow ties, and provide evidence-backed explanations.
- Perspective Swap: defend the opposite position.
- AI judging is advisory, not an objective declaration of truth.

### Read & Reflect (phase 2)
- Curated, reputable, dated reading materials with proper attribution and content rights.
- Understand the article; distinguish fact, opinion and assumptions; formulate an independent viewpoint.
- Generate source-grounded follow-up questions and separate comprehension from argument quality.
- Do not fabricate news or reproduce unauthorised copyrighted articles.

### WordBloom (phase 2)
- Context-sensitive vocabulary recommendations from the user's real responses.
- Personal word bank, meaning and usage examples, pronunciation, spaced review.
- 'Say It Three Ways' to adapt language to friends, lecturers and professionals.
- Mastery requires accurate **productive usage** in new responses, not just memorised definitions.

### Additional modes (future)
- Audience Switch, Pressure Lab, Reasoning Detective, Real-Life Missions, MindBridge (intended vs simulated listener interpretation), Before & After Replay, optional friend quests and shared gardens.

---

## 11. Recommended engineering architecture

**If scaffolding from scratch:**

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Motion/Framer Motion; React Flow for maps; Rive/Lottie/CSS animations for garden.
- **Backend:** Python FastAPI with Pydantic models and typed application services.
- **Auth + data:** Supabase Auth, PostgreSQL, private Supabase Storage, row-level security.
- **Speech:** Azure AI Speech for supported pronunciation assessments; a robust speech transcription service for free speaking. Keep provider adapters swappable.
- **Reasoning:** An LLM supporting validated structured outputs; use explicit schema validation and evaluation versioning.
- **Background jobs:** An async task worker or managed job mechanism for long-running audio processing; choose the simplest appropriate option.
- **Analytics/observability:** Instrument product funnels, processing latency, errors and assessment agreement; use privacy-conscious analytics.
- **Tests:** pytest for backend, Vitest/React Testing Library for UI logic, Playwright for end-to-end flows.

### Suggested architecture

```text
Client (Next.js)
  ├── Home: 2 daily activities, streak, XP
  ├── Read Aloud recorder and annotated feedback
  ├── Spin & Speak wheel and response recorder
  ├── Thought Map / BRIDGE feedback
  ├── Garden and progression
  └── Progress and privacy settings
          |
      FastAPI
  ├── Authentication / user settings
  ├── Exercise catalogue / assignment service
  ├── Audio upload and speech analysis adapter
  ├── Transcript and argument extraction pipeline
  ├── BRIDGE evaluation + feedback generator
  ├── Skill profile / recommendation service
  ├── Deterministic streak / XP / mastery / garden service
  └── Async job status / retries / audit records
          |
  PostgreSQL + private object storage
```

Avoid premature microservices, event buses, and large agent frameworks. Keep clean module boundaries so components can be separated later.

### Core persistence entities

- `users`, `user_settings` (time zone, goal, accessibility and retention preferences)
- `exercise_catalog`, `exercise_assignments` (type, content, target skills, version)
- `activity_sessions`, `attempts` (status, transcription, audio reference, timestamps)
- `speech_observations` (metrics, confidence, source, locale)
- `argument_graphs`, `evaluations`, `evaluation_feedback` (structured and versioned)
- `skill_observations`, `skill_mastery` (history and calculated stage)
- `daily_activity_completions`, `daily_streaks`
- `xp_ledger`, `garden_rewards`, `garden_plants`, `garden_inventory`
- `vocabulary_items`, `vocabulary_reviews` (phase 2)
- `debate_rooms`, `debate_turns` (phase 3)

### Required server invariants

- Activity and date uniqueness: `(user_id, local_date, activity_type)` for first qualifying completion.
- Completion only qualifies after processing a legitimate submitted attempt.
- A transaction or idempotent operation awards exactly the qualifying XP once.
- Streak event is granted **iff both daily activity completions exist**.
- At 2/2, issue the cosmetic daily reward once.
- Mastery transitions arise from validated skill observations—not from an LLM directly issuing rewards.
- Sensitive user recordings and evaluations are private by default; enforce server authorization and database row-level security.
- Re-evaluations and resubmissions cannot duplicate XP, streaks, rewards or plant progression.

### Example API surface

```text
GET    /api/home/today
GET    /api/exercises/daily
POST   /api/attempts
POST   /api/attempts/{id}/audio-upload
POST   /api/attempts/{id}/submit
GET    /api/attempts/{id}/status
GET    /api/attempts/{id}/feedback
POST   /api/attempts/{id}/retry
GET    /api/garden
GET    /api/progress
GET    /api/recommendations
PATCH  /api/me/settings
DELETE /api/me/recordings/{recording_id}
```

Use authenticated, idempotent operations and sensible retry/error states. Generate an OpenAPI schema for the backend.

---

## 12. UI / UX quality bar — non-negotiable

**The app must feel like a premium, delightful learning game, NOT a generic SaaS dashboard, school portal, or chatbot.** Quality of interaction and visual design is central to BridgingMinds' positioning.

### Visual language

- Original garden-themed identity: warm ivory backgrounds, fresh greens, nuanced pastel accents, careful contrast, soft shadows, cheerful botanical motifs and consistent design tokens.
- Strong typography, clear hierarchy, generous spacing, rounded shapes and confident, concise microcopy.
- Consistent icons and bespoke plant/seed/growth illustration states. Do not copy Duolingo assets or characters.
- Responsive from compact phones to desktop; prioritise thumb-friendly mobile interactions.
- Avoid overdecorating information-heavy feedback screens.

### Interaction quality

- One dominant next action on Home and clear **0/2 → 1/2 → 2/2** progression.
- Wheel must spin fluidly and resolve to the actual selected topic.
- Recording must show permission, recording, paused, completed, uploading, processing, error, retry and finished states.
- Thought Maps must be readable on a narrow phone, with zoom/pan and a simple outline alternative.
- Garden plants should animate through growth stages, with meaningful feedback and celebratory transitions on 2/2 completion.
- Add motion for purpose, not noise: short microinteractions, optional sound and reduced-motion support.
- Provide skeletons, helpful empty states, clear API error recovery, and offline/poor-network messaging.
- Every interactive control must work. Do not leave inert buttons, false links, mock save states, or fake charts in production.

### Accessibility and inclusive design

- WCAG 2.2 AA as a target: usable contrast, keyboard navigation, visible focus, labelled controls and screen-reader alternatives.
- Captions/transcripts and non-colour indicators for map feedback.
- Adjustable text and considerate recording time limits.
- Recordings, feedback and profile data should remain private unless explicitly shared.
- Consider performance on modest mobile devices and weak connections.

### Recommended app screens

1. **Welcome / Onboarding** — why it matters, baseline goals, privacy.
2. **Home** — daily 2/2 workout, streak, XP, personal encouragement.
3. **Read Aloud** — immersive passage, recorder, word highlights, short feedback.
4. **Spin & Speak** — wheel, prompt, timer, recording, optional retry.
5. **Thinking Feedback** — interactive Thought Map, BRIDGE dimensions, evidence quotes, recommended improvement.
6. **Garden** — warm, animated progress landscape and unlocked items.
7. **Progress** — longitudinal skill changes, mastery evidence, replay history.
8. **Settings** — time zone, reminders, accessibility, privacy and account.

### Definition of design done

Take screenshots or visual previews for common mobile and desktop breakpoints, inspect layout overflow, test complete flows by interacting with the app, and refine any awkward screens. Test light/dark behaviour if both are implemented; avoid a low-quality second theme just to claim support.

---

## 13. Reliability, trust, privacy and scientific validity

- **No overclaims:** BRIDGE is research-informed and **not yet a scientifically validated scoring instrument**. Present model output as coaching feedback, not a diagnosis, objective measure of intelligence, or infallible judge.
- **Evidence attribution:** Tie reasoning feedback to actual response spans. Distinguish explicit statements from model inferences; do not claim a user said text the model generated.
- **Pronunciation fairness:** Evaluate intelligibility and stated targets, not accent similarity alone; validate across intended speaker populations and devices.
- **User privacy:** Clearly disclose recording storage, processing, retention and deletion. Make voice retention optional where feasible; allow users to delete recordings and account data.
- **Security:** Private buckets, signed URLs, auth checks, RLS, rate limiting, MIME/size validation, request IDs, secret management and abuse protection.
- **Model resilience:** Timeouts, retries with caps, structured-output validation, explicit fallback states and no invented success on AI failure.
- **Content moderation:** Apply appropriate content safety to prompts, user-generated text and public/social experiences.
- **Educational evaluation:** Human-rating study to examine rubric agreement, stability across paraphrases/topics, accents and false flags; baseline vs delayed unseen-prompt assessment for actual improvement.
- **Product metrics:** D1/D7 retention, percentage completing 2/2, time to first completed lesson, exercise completion, retry rate, recommendation uptake, mastery transfer and user-reported helpfulness. Do not rely on XP alone.

---

## 14. Delivery roadmap and order of implementation

### Phase 1 — Complete and polished MVP (must build)

1. Repo setup, design system, auth, settings, database, privacy foundations.
2. Beautiful Home screen with **two required activities** and clear streak logic.
3. Read Aloud end-to-end: recording, supported speech feedback, progress persistence.
4. Spin & Speak end-to-end: genuinely interactive topic wheel, recording, transcription, evaluation.
5. Thought Map and BRIDGE feedback with actionable improvement and retries.
6. Rules-based basic recommendations and learner history.
7. XP ledger, idempotent 2/2 streak logic, daily cosmetic reward, simple garden with four growth stages.
8. Progress screens, empty/error/loading states, accessibility and mobile polish.
9. Tests, seeded demo flows, deployment guide and operating instructions.

### Phase 2 — Enrich learning

- Read & Reflect, WordBloom and personalised vocabulary bank.
- More sophisticated skill recommendations and spaced practice.
- Before/after Thought Map comparisons, independent transfer exercises and additional garden rewards.

### Phase 3 — Community and advanced interaction

- Debate With Friends, AI opponent, debate evaluation, friend quests and shared gardens.
- Audience Switch, Pressure Lab, Reasoning Detective and optional community experiences.

**Do not sacrifice Phase 1 quality to claim that Phase 2/3 are complete.** Build the MVP as a coherent product first.

---

## 15. Acceptance criteria — must be demonstrated

The MVP is acceptable only if:

1. A new user can sign up, select a time zone, and complete onboarding.
2. Home initially shows **0/2**, then **1/2** after one completed daily activity, then **2/2** after the other.
3. At **1/2**, XP is awarded for the completed activity, but the **streak remains unsecured**.
4. At **2/2**, the user receives exactly **25 activity XP total** for the two activities, exactly one garden reward, and one secured streak day.
5. Duplicate submissions, refreshes and multiple devices cannot duplicate XP or rewards.
6. Read Aloud can record and return intelligible, appropriately qualified speech feedback; demo output is clearly labelled when a real provider is unavailable.
7. Spin & Speak can select a real topic, record an answer, and show BRIDGE feedback and a Thought Map grounded in that actual answer.
8. Feedback identifies at least one concrete strength and one actionable improvement, without fabricating quotations or sources.
9. The Thought Map is navigable on mobile and has an accessible text/outline version.
10. The learner profile records observed skill patterns and suggests a relevant future exercise.
11. The garden persists across sessions and its growth logic is distinct from XP and streaks.
12. Missing the next day breaks the active streak, but leaves earned garden progress intact.
13. Recording privacy, permission denial, loading, errors and retries work sensibly.
14. Core screens are visually consistent, mobile-responsive, accessible, and include polished functional microinteractions.
15. At least one end-to-end test covers both activity orders: **Read Aloud → Spin & Speak** and **Spin & Speak → Read Aloud**.

---

## 16. Required final deliverables from the coding agent

- Runnable application source code.
- Database schema and migrations, including unique constraints and RLS policies.
- Environment configuration (`.env.example`) with no secrets committed.
- Demo seed data and clear demo-mode labels.
- Setup/deployment instructions in `README.md`.
- Tests for streak/XP idempotency, evaluation-schema validation, permissions and key user journeys.
- Screenshots or screenshots-generation instructions for mobile and desktop review.
- A concise feature checklist identifying what is fully implemented versus intentionally deferred.
- An honest list of speech/API provider limitations, rubric validation caveats and known issues.

---

## Final instruction

**Build BridgingMinds as an engaging, premium, garden-themed learning experience in which BOTH Read Aloud and Spin & Speak are required every day to maintain a streak.** Deliver visual, research-informed feedback that makes thinking understandable; use personalisation to target the next skill; and reserve meaningful garden growth for demonstrated independent learning. Prioritise beautiful, working UX and trustworthy assessment over feature count.

> **Product thesis:** As AI makes it easier to generate polished answers, BridgingMinds uses AI to strengthen people's own critical thinking, articulation, reasoning, and spoken communication—not to replace their thinking.

---

## 0. Operating instructions for the coding agent

1. **Inspect the repository first.** If a project exists, follow its conventions and reuse working infrastructure. If it is empty, scaffold the recommended stack below. Do not overwrite existing functionality without a clear reason.
2. **Implement, don't merely describe.** Build runnable pages, components, backend endpoints, database models, migrations, tests, seed content, and documentation. No dead buttons, decorative controls, fake progress, or unfinished placeholder pages presented as functioning features.
3. **Prioritise the launch MVP end-to-end.** Complete the two daily activities, feedback, personalisation basics, streaks, XP, and garden before tackling advanced multiplayer or content feeds. Work in vertical slices: record → analyse → show feedback → persist → award progress.
4. **Create a premium, original interface.** Duolingo is a reference for approachability, habit formation, delightful feedback, and clarity—not a visual asset, character, palette, or screen to copy. BridgingMinds has its own warm, garden-themed identity.
5. **Keep model judgments bounded and explainable.** The LLM may produce skill observations and recommendations, but the backend alone awards XP, validates mastery, and updates streaks. Never invent speech scores or factual evidence.
6. **Work even without paid API keys.** Offer a clearly labelled **Demo Mode** with pre-recorded/sample passages and deterministic example analysis so the full UI can be reviewed. Do not misrepresent demo results as a real assessment.
7. **Write down assumptions and trade-offs.** Where details remain open, choose reasonable defaults, document them in `README.md`, and continue building. Avoid blocking on minor clarifications.
8. **Security, accessibility and privacy are product requirements.** Protect recordings, control retention, honour accessibility settings, and do not assume a particular English accent is incorrect.

---

## 1. Product positioning and audience

**BridgingMinds is an AI-powered thinking and communication gym** for students and young adults who may have useful ideas but struggle to organise, justify, and express them spontaneously.

### Three differentiation pillars

1. **Habit-forming, enjoyable practice:** A short daily learning ritual plus a garden that rewards consistency and demonstrated growth.
2. **Visual and digestible feedback:** AI-generated Thought Maps show claims, evidence, logical links, and missing pieces instead of overwhelming users with paragraphs of critique.
3. **Cross-activity adaptive practice:** The product recognises recurring weaknesses, prescribes exercises, reduces hints, and measures the ability to apply skills independently to new prompts.

### Key UX promise

A user opens the app, sees **exactly two required daily activities**, completes them in about five minutes, receives encouraging, specific feedback, watches their garden respond, and knows what to practise next.

### Core learning domains

- **Voice:** pronunciation, intelligibility, pacing, pauses, stress, and intonation.
- **Thinking:** claims, logical reasoning, evidence, assumptions, and perspectives.
- **Expression:** coherence, appropriate vocabulary, articulation, and audience awareness.
- **Independence:** successful performance on fresh questions without hints.

---

## 2. Non-negotiable daily engagement model

### Exactly two required daily activities

**A. Read Aloud (target ~2 minutes)**
- Read a short, level-appropriate passage aloud.
- Receive pronunciation, clarity/intelligibility, pacing, and intonation feedback when supported by the selected speech service.
- Highlight relevant words/phrases and offer one bite-sized practice task.
- Adapt subsequent passages to recurring, verified difficulties.
- **Award +10 XP** on the first qualifying completion of this activity on a given local day.

**B. Spin & Speak (target ~3 minutes)**
- Spin a topic wheel to get a question.
- Allow optional brief preparation, then record an original spontaneous response.
- Analyse reasoning, clarity, and delivery; generate a Thought Map and short improvement guidance.
- Offer one optional retry or follow-up question targeting a weakness.
- **Award +15 XP** on the first qualifying completion of this activity on a given local day.

### Final, explicit streak rules

**A daily streak is earned or maintained ONLY when the user completes BOTH Read Aloud AND Spin & Speak on the same local calendar day.** Completing either one alone is **not enough**.

- Show progress as **0/2**, **1/2**, or **2/2** daily activities.
- **0/2:** No daily completion, no streak credit.
- **1/2:** The completed activity earns its XP, but the day is incomplete and the streak is NOT secured.
- **2/2:** Mark the daily workout complete, award total **25 XP**, grant one **daily garden reward**, and secure/extend the streak.
- The reward at 2/2 should be a **cosmetic seed/decor token**, not automatic skill mastery. Do **not** add another XP bonus unless explicitly changed later.
- Extra attempts are always allowed for learning; no repeated XP from repeating the same qualifying activity that day.
- Optional Debate, Read & Reflect, WordBloom, and other activities **do not substitute** for either required daily activity and do not independently secure a streak.
- Use the user's **chosen IANA time zone** and local calendar date as the day boundary; make completion idempotent across retries, refreshes, devices, and concurrent submissions.
- For MVP, no automatic streak freeze. You may design the system to support a later optional grace/freeze feature, but do not enable one implicitly.
- Missing a day breaks the active streak but **does not kill plants, remove earned XP, erase achievements, or shame the user**.

**Qualifying completion:** A legitimately submitted exercise with a persisted attempt and a successful processing outcome (or an explicitly authorised fallback when speech processing is unavailable). Require a minimum meaningful interaction, but do not penalise users for accent, answer quality, or a low score. An unintelligible/empty recording should prompt an accessible retry, not award XP.

### Progress and feedback states

The Home screen must unambiguously distinguish:
- **Practice activity completed** (valid attempt submitted and processed),
- **Daily workout completed** (both required activities), and
- **Skill mastery demonstrated** (separate longitudinal achievement).

Never communicate that the streak is complete at 1/2.

---

## 3. Gamification: The Garden of Minds

**Theme:** *Every thought is a seed. Every improvement helps it grow.*

### One attractive personal garden

A cozy, interactive, living garden with soft depth, small animated plants, rewarding interactions, and graceful transitions. Avoid making users maintain an excessive number of currencies or menus.

Organise plants/areas around skill domains:
- **Voice Garden:** pronunciation, intelligibility, pacing, and prosody.
- **Reasoning Orchard:** clear claims, sound reasons, explanations, and evidence.
- **Articulation Meadow:** coherent and understandable expression.
- **Perspective Forest:** alternative viewpoints, listening, and rebuttals.
- **WordBloom Garden:** appropriate vocabulary and productive word use.

For the MVP, a **single garden canvas with distinct plants** is sufficient. Do not build five elaborate map worlds before verifying the learning loop.

### Separate effort rewards from mastery

**XP:** Measures participation and practice completion; initially 10 for Read Aloud and 15 for Spin & Speak per day. It can unlock purely cosmetic elements and general progress markers. Award through deterministic backend events only.

**Skill growth:** Driven by multiple meaningful evaluations over time, not XP totals or logins. Each plant maps to specific measurable skills and grows through four states:

| Stage | Condition |
| --- | --- |
| Seed | Skill has been introduced or baseline assessed. |
| Sprout | User has undertaken meaningful guided practice. |
| Bud | User shows improvement or reliably strong performance across distinct questions. |
| Bloom | User demonstrates skill independently on multiple unfamiliar prompts across different sessions. |

For an initial pilot, use a configurable, provisional mastery rule such as **at least 3/4 on the relevant rubric dimension in 2 of the last 3 independently completed, distinct attempts**, subject to human calibration. Do not represent this threshold as scientifically validated. Strong beginners can earn mastery without first producing poor results. If AI confidence is insufficient, withhold a mastery change and ask for another attempt.

### Daily reward & quests

- **At 2/2 daily activities**, reward a small cosmetic seed/decor item and a satisfying growth celebration.
- The **two daily activities are the only mandatory quests** in the MVP. Do not add a third mandatory quest.
- Optional side quests may later offer cosmetic items or limited XP, but **never replace the two mandatory activities**.
- Garden item inventory, placed decorations, plant stages, quest state, and reward issuance must persist.
- Deduplicate grant events (e.g. unique key `user_id + local_date + reward_type`).

### Delight without punishment

- Gentle haptics where supported, opt-in sound effects, tasteful confetti, responsive plant animations, and celebratory copy.
- Optional reminders, user-controlled notification frequency, and reduced-motion alternatives.
- No plant death, shame-based streak messages, forced public rankings, or penalising mistakes.
- Social mechanics and friend debates are opt-in later-stage features.

---

## 4. User journey and navigation

### Mobile-first navigation

**Home | Learn | Garden | Progress | Profile**

- **Home:** Today's 2/2 workout, current streak, earned XP, one clear next CTA, selected plant highlight, last improvement insight.
- **Learn:** Required Read Aloud and Spin & Speak plus an **Explore** section for optional modes as they become functional.
- **Garden:** Interactive personal garden with plant growth explanations, rewards, decorations, and skill-linked progress.
- **Progress:** Trends for Voice, Reasoning, Articulation, Vocabulary, and Independent Mastery; view historical attempts and before/after comparisons.
- **Profile/Settings:** Goals, difficulty, chosen time zone, recording privacy/retention, accessibility, reminder preferences, account management.

**Never make the homepage a dense analytics dashboard.** It should answer: *What do I do today? How close am I to finishing? What improved?*

### Onboarding

1. Welcome and concise purpose statement.
2. Choose goals (e.g. clearer speaking, critical thinking, presentations, interviews) and desired challenge level.
3. Set time zone and optionally reminder preferences.
4. Explain microphone permission and what audio is stored.
5. Optional 60-second baseline task; distinguish baseline from true mastery.
6. Introduce the garden and the **two-activity daily rule**.

---

## 5. Feature: Read Aloud

### UX flow

Choose a passage → see estimated reading time → allow microphone access → record with clear waveform/state → replay → submit → process → receive annotated passage and micro-coaching → save/try again → return to daily dashboard.

### Audio analysis

- Browser microphone capture via `getUserMedia` + `MediaRecorder` (or a compatible mobile framework API), with upload validation and graceful denied-permission fallback.
- For reference-text reading, prefer **Azure AI Speech Pronunciation Assessment** (where supported) for word/phoneme-level accuracy and fluency; confirm service capabilities for configured English locale and avoid reporting unavailable prosody fields.
- Compute or extract useful observations: potentially mispronounced words, completeness, pauses, pace, stress and intonation **where technically reliable**.
- Store confidence and provenance for each observation. Distinguish uncertain acoustic feedback from confirmed errors.
- Display word highlights linked to the audio timeline and a tap-to-hear pronunciation example.
- Offer one key improvement, a short targeted drill, and an optional retry.
- Do not infer emotional state, intelligence, confidence or effort solely from pitch or accent.
- Respect Singapore English and other legitimate language varieties. Prioritise intelligibility and user-selected language targets rather than enforcing an arbitrary accent.

### Personalisation

Persist skill observations with passage ID, item difficulty, timestamp, locale and confidence. Require repeated credible observations before marking a recurring weakness. Recommend future passages focused on the identified skill, with periodic transfer checks using unseen text.

---

## 6. Feature: Spin & Speak

### UX flow

Animated topic wheel → selected category and difficulty → optional 10–20-second prep → 45–90-second original response → transcription and separate audio analysis → Thought Map + BRIDGE evaluation → one actionable prompt → optional retry or surprise follow-up.

Topic categories: education, technology, ethics, everyday life, creativity, storytelling, explaining concepts, persuasion, interview/presentation Q&A.

### Question bank

Use a seeded, curated database with metadata: category, difficulty, target skills, Bloom's cognitive demand, estimated response duration, example follow-ups, version and moderation status. AI can propose new questions, but do not automatically publish unreviewed material for all users.

### Processing

1. Persist attempt and audio (with the user's retention choices).
2. Transcribe speech using the speech-to-text provider, preserving timestamps where supported.
3. Evaluate **what was said** using argument parsing and BRIDGE; evaluate **how it was said** from the audio using separate speech metrics.
4. Produce structured feedback with direct transcript evidence and a Thought Map.
5. Generate a tailored follow-up/question **without writing the student's answer for them**.
6. Update the learner's skill profile and suggest a future exercise.

The topic wheel must be genuinely interactive, accessible, and random within eligibility rules—not a fixed animation pretending to choose a topic.

---

## 7. Signature feature: Visual Thought Maps

### Purpose

After open-ended responses, visually display the **main claim, reasons, evidence, implied or missing reasoning links, and relevant objections**. The map should help users see **why** an answer is weak and **how** to improve it.

### Technical pipeline

1. Segment transcript into attributable statements with character offsets and, if available, audio timestamps.
2. Extract Toulmin-inspired components: claim, grounds/evidence, warrant (reasoning link), backing, qualifiers, rebuttal (where appropriate).
3. Produce structured nodes and edges using a constrained output schema.
4. Validate IDs, types, references, source spans, and allowed edge relations in backend code.
5. Mark extracted content as **explicit**, **inferred**, or **missing**. Never quote inferred content as something the user actually said.
6. Flag specific weaknesses: unsupported assertion, weak warrant, unsupported evidence, unclear claim, contradiction, repetition, or relevant unaddressed perspective.
7. Render with **React Flow / XYFlow** and an auto-layout solution (Dagre or ELK), with a list/outline alternative for accessibility and small screens.
8. Support tap-to-expand evidence, transcript highlighting, zoom, accessible legend, and **Attempt 1 vs Attempt 2** comparison.

### Node schema (illustrative)

```ts
type ThoughtNode = {
  id: string;
  type: 'claim' | 'reason' | 'evidence' | 'warrant' | 'qualifier' | 'rebuttal';
  text: string | null;
  status: 'explicit' | 'inferred' | 'missing';
  sourceSpan?: { start: number; end: number };
  confidence?: number;
  feedback?: string;
};

type ThoughtEdge = {
  id: string;
  source: string;
  target: string;
  relation: 'supports' | 'explains' | 'challenges' | 'qualifies' | 'needs_explanation';
};
```

Use colour **plus text/icons** to indicate strong, uncertain, and missing connections. Do not assume every response requires all Toulmin components; a personal story and a formal debate have different expectations.

---

## 8. Evaluation framework: BRIDGE, grounded in established work

### User-facing BRIDGE dimensions

| Dimension | Meaning | Example signal |
| --- | --- | --- |
| **B — Big Idea** | Clear, relevant central message | Identifiable thesis or main point |
| **R — Reasons** | Sound and developed reasoning | Explanations actually support the claim |
| **I — Illustrations** | Relevant examples/evidence | Specific support, appropriately qualified |
| **D — Different Perspectives** | Consideration of alternatives when task-relevant | Fair counterargument or nuance |
| **G — Glue** | Logical organisation and coherence | Connected ideas, meaningful transitions |
| **E — Expression** | Understandable, appropriate delivery | Clear wording, audience fit and speech delivery as relevant |

### Scientific / educational basis

- **Toulmin Model of Argumentation:** Structural extraction and visualisation of claims, grounds, warrants and rebuttals.
- **AAC&U Critical Thinking VALUE Rubric:** Criteria involving evidence, assumptions, positions and conclusions.
- **AAC&U Oral Communication VALUE Rubric:** Organisation, language, central message, supporting material and delivery.
- **Paul–Elder intellectual standards:** Quality checks such as clarity, relevance, accuracy, depth and logic.
- **Hattie & Timperley feedback framework:** Clarify goal, current progress and next step.
- **Claim–Evidence–Reasoning (CER):** Beginner-friendly reasoning scaffolds.
- **Revised Bloom's Taxonomy:** Adjust the cognitive demand of questions.
- **CEFR phonological control descriptors:** Inform cautious, intelligibility-oriented speech feedback.

**Critical scientific honesty:** These are established frameworks, but **BRIDGE is a proposed adaptation, not a validated new scientific instrument**. Do not label numerical scores 'scientifically proven' or claim they are objective. Develop behaviourally anchored 1–4 rubric descriptors, test agreement with trained human raters, and report uncertainty and limitations.

### Scoring rules

- Choose which BRIDGE dimensions are relevant **per exercise**. For example, a 20-second personal story need not be penalised for lacking a rebuttal.
- Provide a 1–4 rating **only when evidence is sufficient**, plus a supporting quote/span and one actionable improvement.
- Otherwise return `not_assessed` / `insufficient_evidence`, not a fabricated zero.
- Separate language quality from factual accuracy; unknown claims must be marked unverified, not false by default.
- Keep judge model and rubric version on every evaluation for later re-scoring and auditing.
- Do not expose raw model chain-of-thought; show concise user-facing rationales tied to their answer.
- Calibrate against a human-scored sample across accents, activity types, and difficulty levels before trusting mastery decisions.

### Feedback UX

Prefer a **single primary improvement card** with:
- One thing done well.
- One specific gap, backed by a visible example from the response.
- One question or small action to help the user improve.
- An optional 'See full breakdown' panel.

---

## 9. Personalised adaptive learning engine

### Unified learner skill profile

Track time-series observations, not permanent labels:

- BRIDGE scores and evidence/confidence by dimension.
- Speech observations by pronunciation/intelligibility, pacing and prosody.
- User goals, topic interests and exercise difficulty.
- Attempts, retries, independent assessments and spaced review state.
- Recent questions to avoid repetition.

### Initial recommendation algorithm

Start with **deterministic rules plus structured AI-generated coaching**, not a complex ML recommender requiring large datasets:

1. Exclude low-confidence observations.
2. Aggregate repeated weaknesses across recent, varied activities.
3. Rank skills by urgency, opportunity for improvement and learning goal.
4. Choose an approved exercise type targeting the highest-priority skill.
5. Select a fresh question with suitable difficulty.
6. Apply an adjustable assistance level: guided hints → follow-up questions → independent attempt.
7. Reassess the skill on a different topic after a delay.

Example: weak supporting evidence in Spin & Speak → optional Read & Reflect evidence exercise → new independent Spin & Speak question → update evidence plant based on validated performance.

### Avoid false personalisation

A single weak answer or poor audio recording is not enough to diagnose an enduring problem. Show users **'We're noticing...'** rather than definitive labels, and let them dismiss irrelevant recommendations.

---

## 10. Optional and later-stage activities (do not block the MVP)

Implement these **only after the core daily loop works**. If not built yet, show an honest roadmap or omit their route; never ship decorative screens that pretend to work.

### Debate With Friends (phase 3)
- Private invite-based rooms, turn state, rebuttals and optional AI opponent.
- Realtime room updates with authoritative server-side turn transitions.
- Transparent judging of claim strength, evidence, relevance, rebuttals and coherence; anonymise ordering where possible, allow ties, and provide evidence-backed explanations.
- Perspective Swap: defend the opposite position.
- AI judging is advisory, not an objective declaration of truth.

### Read & Reflect (phase 2)
- Curated, reputable, dated reading materials with proper attribution and content rights.
- Understand the article; distinguish fact, opinion and assumptions; formulate an independent viewpoint.
- Generate source-grounded follow-up questions and separate comprehension from argument quality.
- Do not fabricate news or reproduce unauthorised copyrighted articles.

### WordBloom (phase 2)
- Context-sensitive vocabulary recommendations from the user's real responses.
- Personal word bank, meaning and usage examples, pronunciation, spaced review.
- 'Say It Three Ways' to adapt language to friends, lecturers and professionals.
- Mastery requires accurate **productive usage** in new responses, not just memorised definitions.

### Additional modes (future)
- Audience Switch, Pressure Lab, Reasoning Detective, Real-Life Missions, MindBridge (intended vs simulated listener interpretation), Before & After Replay, optional friend quests and shared gardens.

---

## 11. Recommended engineering architecture

**If scaffolding from scratch:**

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Motion/Framer Motion; React Flow for maps; Rive/Lottie/CSS animations for garden.
- **Backend:** Python FastAPI with Pydantic models and typed application services.
- **Auth + data:** Supabase Auth, PostgreSQL, private Supabase Storage, row-level security.
- **Speech:** Azure AI Speech for supported pronunciation assessments; a robust speech transcription service for free speaking. Keep provider adapters swappable.
- **Reasoning:** An LLM supporting validated structured outputs; use explicit schema validation and evaluation versioning.
- **Background jobs:** An async task worker or managed job mechanism for long-running audio processing; choose the simplest appropriate option.
- **Analytics/observability:** Instrument product funnels, processing latency, errors and assessment agreement; use privacy-conscious analytics.
- **Tests:** pytest for backend, Vitest/React Testing Library for UI logic, Playwright for end-to-end flows.

### Suggested architecture

```text
Client (Next.js)
  ├── Home: 2 daily activities, streak, XP
  ├── Read Aloud recorder and annotated feedback
  ├── Spin & Speak wheel and response recorder
  ├── Thought Map / BRIDGE feedback
  ├── Garden and progression
  └── Progress and privacy settings
          |
      FastAPI
  ├── Authentication / user settings
  ├── Exercise catalogue / assignment service
  ├── Audio upload and speech analysis adapter
  ├── Transcript and argument extraction pipeline
  ├── BRIDGE evaluation + feedback generator
  ├── Skill profile / recommendation service
  ├── Deterministic streak / XP / mastery / garden service
  └── Async job status / retries / audit records
          |
  PostgreSQL + private object storage
```

Avoid premature microservices, event buses, and large agent frameworks. Keep clean module boundaries so components can be separated later.

### Core persistence entities

- `users`, `user_settings` (time zone, goal, accessibility and retention preferences)
- `exercise_catalog`, `exercise_assignments` (type, content, target skills, version)
- `activity_sessions`, `attempts` (status, transcription, audio reference, timestamps)
- `speech_observations` (metrics, confidence, source, locale)
- `argument_graphs`, `evaluations`, `evaluation_feedback` (structured and versioned)
- `skill_observations`, `skill_mastery` (history and calculated stage)
- `daily_activity_completions`, `daily_streaks`
- `xp_ledger`, `garden_rewards`, `garden_plants`, `garden_inventory`
- `vocabulary_items`, `vocabulary_reviews` (phase 2)
- `debate_rooms`, `debate_turns` (phase 3)

### Required server invariants

- Activity and date uniqueness: `(user_id, local_date, activity_type)` for first qualifying completion.
- Completion only qualifies after processing a legitimate submitted attempt.
- A transaction or idempotent operation awards exactly the qualifying XP once.
- Streak event is granted **iff both daily activity completions exist**.
- At 2/2, issue the cosmetic daily reward once.
- Mastery transitions arise from validated skill observations—not from an LLM directly issuing rewards.
- Sensitive user recordings and evaluations are private by default; enforce server authorization and database row-level security.
- Re-evaluations and resubmissions cannot duplicate XP, streaks, rewards or plant progression.

### Example API surface

```text
GET    /api/home/today
GET    /api/exercises/daily
POST   /api/attempts
POST   /api/attempts/{id}/audio-upload
POST   /api/attempts/{id}/submit
GET    /api/attempts/{id}/status
GET    /api/attempts/{id}/feedback
POST   /api/attempts/{id}/retry
GET    /api/garden
GET    /api/progress
GET    /api/recommendations
PATCH  /api/me/settings
DELETE /api/me/recordings/{recording_id}
```

Use authenticated, idempotent operations and sensible retry/error states. Generate an OpenAPI schema for the backend.

---

## 12. UI / UX quality bar — non-negotiable

**The app must feel like a premium, delightful learning game, NOT a generic SaaS dashboard, school portal, or chatbot.** Quality of interaction and visual design is central to BridgingMinds' positioning.

### Visual language

- Original garden-themed identity: warm ivory backgrounds, fresh greens, nuanced pastel accents, careful contrast, soft shadows, cheerful botanical motifs and consistent design tokens.
- Strong typography, clear hierarchy, generous spacing, rounded shapes and confident, concise microcopy.
- Consistent icons and bespoke plant/seed/growth illustration states. Do not copy Duolingo assets or characters.
- Responsive from compact phones to desktop; prioritise thumb-friendly mobile interactions.
- Avoid overdecorating information-heavy feedback screens.

### Interaction quality

- One dominant next action on Home and clear **0/2 → 1/2 → 2/2** progression.
- Wheel must spin fluidly and resolve to the actual selected topic.
- Recording must show permission, recording, paused, completed, uploading, processing, error, retry and finished states.
- Thought Maps must be readable on a narrow phone, with zoom/pan and a simple outline alternative.
- Garden plants should animate through growth stages, with meaningful feedback and celebratory transitions on 2/2 completion.
- Add motion for purpose, not noise: short microinteractions, optional sound and reduced-motion support.
- Provide skeletons, helpful empty states, clear API error recovery, and offline/poor-network messaging.
- Every interactive control must work. Do not leave inert buttons, false links, mock save states, or fake charts in production.

### Accessibility and inclusive design

- WCAG 2.2 AA as a target: usable contrast, keyboard navigation, visible focus, labelled controls and screen-reader alternatives.
- Captions/transcripts and non-colour indicators for map feedback.
- Adjustable text and considerate recording time limits.
- Recordings, feedback and profile data should remain private unless explicitly shared.
- Consider performance on modest mobile devices and weak connections.

### Recommended app screens

1. **Welcome / Onboarding** — why it matters, baseline goals, privacy.
2. **Home** — daily 2/2 workout, streak, XP, personal encouragement.
3. **Read Aloud** — immersive passage, recorder, word highlights, short feedback.
4. **Spin & Speak** — wheel, prompt, timer, recording, optional retry.
5. **Thinking Feedback** — interactive Thought Map, BRIDGE dimensions, evidence quotes, recommended improvement.
6. **Garden** — warm, animated progress landscape and unlocked items.
7. **Progress** — longitudinal skill changes, mastery evidence, replay history.
8. **Settings** — time zone, reminders, accessibility, privacy and account.

### Definition of design done

Take screenshots or visual previews for common mobile and desktop breakpoints, inspect layout overflow, test complete flows by interacting with the app, and refine any awkward screens. Test light/dark behaviour if both are implemented; avoid a low-quality second theme just to claim support.

---

## 13. Reliability, trust, privacy and scientific validity

- **No overclaims:** BRIDGE is research-informed and **not yet a scientifically validated scoring instrument**. Present model output as coaching feedback, not a diagnosis, objective measure of intelligence, or infallible judge.
- **Evidence attribution:** Tie reasoning feedback to actual response spans. Distinguish explicit statements from model inferences; do not claim a user said text the model generated.
- **Pronunciation fairness:** Evaluate intelligibility and stated targets, not accent similarity alone; validate across intended speaker populations and devices.
- **User privacy:** Clearly disclose recording storage, processing, retention and deletion. Make voice retention optional where feasible; allow users to delete recordings and account data.
- **Security:** Private buckets, signed URLs, auth checks, RLS, rate limiting, MIME/size validation, request IDs, secret management and abuse protection.
- **Model resilience:** Timeouts, retries with caps, structured-output validation, explicit fallback states and no invented success on AI failure.
- **Content moderation:** Apply appropriate content safety to prompts, user-generated text and public/social experiences.
- **Educational evaluation:** Human-rating study to examine rubric agreement, stability across paraphrases/topics, accents and false flags; baseline vs delayed unseen-prompt assessment for actual improvement.
- **Product metrics:** D1/D7 retention, percentage completing 2/2, time to first completed lesson, exercise completion, retry rate, recommendation uptake, mastery transfer and user-reported helpfulness. Do not rely on XP alone.

---

## 14. Delivery roadmap and order of implementation

### Phase 1 — Complete and polished MVP (must build)

1. Repo setup, design system, auth, settings, database, privacy foundations.
2. Beautiful Home screen with **two required activities** and clear streak logic.
3. Read Aloud end-to-end: recording, supported speech feedback, progress persistence.
4. Spin & Speak end-to-end: genuinely interactive topic wheel, recording, transcription, evaluation.
5. Thought Map and BRIDGE feedback with actionable improvement and retries.
6. Rules-based basic recommendations and learner history.
7. XP ledger, idempotent 2/2 streak logic, daily cosmetic reward, simple garden with four growth stages.
8. Progress screens, empty/error/loading states, accessibility and mobile polish.
9. Tests, seeded demo flows, deployment guide and operating instructions.

### Phase 2 — Enrich learning

- Read & Reflect, WordBloom and personalised vocabulary bank.
- More sophisticated skill recommendations and spaced practice.
- Before/after Thought Map comparisons, independent transfer exercises and additional garden rewards.

### Phase 3 — Community and advanced interaction

- Debate With Friends, AI opponent, debate evaluation, friend quests and shared gardens.
- Audience Switch, Pressure Lab, Reasoning Detective and optional community experiences.

**Do not sacrifice Phase 1 quality to claim that Phase 2/3 are complete.** Build the MVP as a coherent product first.

---

## 15. Acceptance criteria — must be demonstrated

The MVP is acceptable only if:

1. A new user can sign up, select a time zone, and complete onboarding.
2. Home initially shows **0/2**, then **1/2** after one completed daily activity, then **2/2** after the other.
3. At **1/2**, XP is awarded for the completed activity, but the **streak remains unsecured**.
4. At **2/2**, the user receives exactly **25 activity XP total** for the two activities, exactly one garden reward, and one secured streak day.
5. Duplicate submissions, refreshes and multiple devices cannot duplicate XP or rewards.
6. Read Aloud can record and return intelligible, appropriately qualified speech feedback; demo output is clearly labelled when a real provider is unavailable.
7. Spin & Speak can select a real topic, record an answer, and show BRIDGE feedback and a Thought Map grounded in that actual answer.
8. Feedback identifies at least one concrete strength and one actionable improvement, without fabricating quotations or sources.
9. The Thought Map is navigable on mobile and has an accessible text/outline version.
10. The learner profile records observed skill patterns and suggests a relevant future exercise.
11. The garden persists across sessions and its growth logic is distinct from XP and streaks.
12. Missing the next day breaks the active streak, but leaves earned garden progress intact.
13. Recording privacy, permission denial, loading, errors and retries work sensibly.
14. Core screens are visually consistent, mobile-responsive, accessible, and include polished functional microinteractions.
15. At least one end-to-end test covers both activity orders: **Read Aloud → Spin & Speak** and **Spin & Speak → Read Aloud**.

---

## 16. Required final deliverables from the coding agent

- Runnable application source code.
- Database schema and migrations, including unique constraints and RLS policies.
- Environment configuration (`.env.example`) with no secrets committed.
- Demo seed data and clear demo-mode labels.
- Setup/deployment instructions in `README.md`.
- Tests for streak/XP idempotency, evaluation-schema validation, permissions and key user journeys.
- Screenshots or screenshots-generation instructions for mobile and desktop review.
- A concise feature checklist identifying what is fully implemented versus intentionally deferred.
- An honest list of speech/API provider limitations, rubric validation caveats and known issues.

---

## Final instruction

**Build BridgingMinds as an engaging, premium, garden-themed learning experience in which BOTH Read Aloud and Spin & Speak are required every day to maintain a streak.** Deliver visual, research-informed feedback that makes thinking understandable; use personalisation to target the next skill; and reserve meaningful garden growth for demonstrated independent learning. Prioritise beautiful, working UX and trustworthy assessment over feature count.
ence” has several meanings here. A framework can identify important aspects of reasoning; trained humans can agree when applying a particular rubric; a model can agree with those humans; and feedback can improve later learning. Those are separate claims requiring separate evidence. The app should claim research-informed coaching now, and pursue validation of its particular tasks, population and intended use before claiming accurate measurement. This follows the intended-use approach in the [AERA/APA/NCME Standards for Educational and Psychological Testing](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf).

| Practice | Recommended foundation | App criteria | What the result describes |
| --- | --- | --- | --- |
| Spin & Speak | Argument-quality research: acceptable, relevant and sufficient support; justified connections between reasons and conclusions | Support, Reasoning, Clarity, Nuance | Content of this answer to this prompt |
| Debate | The same argument-quality foundation, with actual conversational context | Support, Reasoning, Clarity, Engagement | The learner's answer and response to the opponent's actual challenge |
| Read & Reflect | OECD PISA reading processes: understanding, inference, evaluation and reflection | Understanding, Interpretation, Clarity, Reflection | This answer in relation to the provided summary and selected question |

These names and four-point anchors are original product adaptations. They are not official ASRAW, PISA, CEFR, TOEFL or VALUE scales. The exact versioned definitions live in [the shared runtime rubric](../../shared/assessment-rubrics.mjs), so the model and user see the same criteria.

## Why this approach has the strongest fit

A review of **75 studies** found that analytic, task-specific rubrics, exemplars and rater training can improve scoring consistency, while rubric use by itself does not establish validity. That supports explicit criteria and a calibration process, not selecting a famous framework and assuming the problem is solved. [Jönsson and Svingby, 2007](https://researchportal.hkr.se/en/publications/the-use-of-scoring-rubrics-reliability-validity-and-educational-c-2/).

A later meta-analysis found a moderate positive effect of rubric use on academic performance after publication-bias correction, **g = .45**, across 21 studies contributing 54 effects. This supports making criteria useful to learners before and after practice. It is evidence about learning outcomes in those studies, not LLM scoring accuracy. [Panadero et al., 2023](https://link.springer.com/article/10.1007/s10648-023-09823-4).

The decisive argumentation distinction is **quality of support versus presence of structure**. A response can contain “because,” an example and a counterargument while still making a weak inference. Conversely, a brief answer can make a well-supported, appropriately bounded point. The ASRAW research directly addresses structure versus substance; the argument-quality taxonomy provides a useful account of relevance, acceptability and sufficiency. [Stapleton and Wu, 2015](https://doi.org/10.1016/j.jeap.2014.11.006), [Wachsmuth et al., 2017](https://aclanthology.org/E17-1017/).

## Candidates compared

| Candidate | Evidence and fit | Decision for this app |
| --- | --- | --- |
| Toulmin argument structure | A theory of claims, reasons and warrants; not a psychometric test. Element counting misses quality. [Original chapter](https://doi.org/10.1017/CBO9780511840005.007) | Use the support-to-claim connection as an analysis aid; do not score a checklist of components. |
| ASRAW and argument-quality taxonomy | Closely match support, inference and rebuttal. A later ASRAW study reported total consistency ICC .98, but only 31 essays were double-coded, with premarked units and trained human raters. The taxonomy study's overall α .51 concerns its most agreeing pair. [ASRAW study](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.784261/full), [taxonomy paper](https://aclanthology.org/E17-1017.pdf) | Best conceptual basis for argument practice; neither coefficient transfers to MindGarden's brief responses or LLM. |
| AAC&U VALUE | Useful educational coverage of evidence, assumptions and communication. The oral rubric expects a developed presentation and cautions against ordinary short answers. [Original oral rubric](https://teaching.utoronto.ca/wp-content/uploads/Rubric-AACU-Oral-Communication.pdf) | Coverage reference, not wholesale adoption or automatic validation. |
| PISA reading framework | Explicitly covers understanding, inference, evaluation and reflection. Its operational scores depend on standardized tasks and coding procedures. [OECD framework](https://www.oecd.org/content/dam/oecd/en/publications/reports/2019/04/pisa-2018-assessment-and-analytical-framework_d1c359c7/b25efab8-en.pdf) | Best conceptual basis for reading; no PISA score or full-article comprehension claim. |
| CEFR / Cambridge / ETS speaking | Language and oral-performance instruments with task-specific evidence. Pronunciation and prosody require sound; whole-test evidence cannot validate a single text response. [CEFR Companion Volume](https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4), [ETS SpeechRater study](https://files.eric.ed.gov/fulltext/EJ1202795.pdf) | Inform clarity and future audio research. Do not assign language-proficiency or delivery levels from transcripts. |
| Standardized critical-thinking tests | CCTST, Ennis–Weir and newer structured tests use particular items, populations and scoring procedures; some are proprietary or restrict adaptation. [CCTST technical report](https://files.eric.ed.gov/fulltext/ED327549.pdf), [Ennis–Weir author materials](https://criticalthinking.net/test/), [ICTET-A study](https://doi.org/10.5840/inquiryct20241513) | Possible later external comparators under suitable terms; not interchangeable with everyday app prompts. |

The detailed evidence notes distinguish consistency, absolute agreement, correlation and internal consistency; these statistics must not be compared as though they were the same measure. They also identify abstract-only access, small samples, historical test versions and reuse limitations. See [argumentation evidence](argumentation-evidence.md) and [communication/reading evidence](communication-reading-evidence.md).

## How evaluation should work

1. **Disclose criteria before practice.** A collapsed Criteria section shows what this task can elicit. Expectations should not appear only after submission.
2. **Supply the actual task.** The LLM receives the saved prompt, mode, permitted reading summary/questions or bounded role-labelled debate turns, and the learner's answer. Opponent text provides context; it cannot earn the learner credit.
3. **Judge the relevant quality.** Apply original 1–4 descriptions to each observable criterion. A short sufficient answer can meet the highest anchor. Do not use length, advanced vocabulary, citation counts, agreement with the model, accent or personal characteristics as proxies.
4. **Allow N/A.** Missing source material, absent opportunity to answer an opponent, a criterion the prompt does not elicit, or insufficient observable evidence can require abstention. N/A is not level 1. A source-dependent judgment cannot be based on a title alone.
5. **Ground feedback in the saved answer.** Give exact excerpts, an explanation and a useful next revision. The backend verifies quote offsets and schema. This prevents fabricated quotation spans; it cannot prove that the model's interpretation is correct.
6. **Keep boundaries visible.** Reading feedback concerns the supplied summary, not an unseen linked article. Outside factual claims are unverified, not automatically false. Text feedback cannot assess pronunciation, pacing or other audible delivery.
7. **Record the scoring context.** Save rubric, model and prompt-template versions, method and source scope. Preserve historical results. Do not average the ordinal criteria into a purported ability score.

Local mode has no semantic evaluator: it now provides reflection prompts and saved excerpts with **no numerical levels**. With credentials, the existing server-side LLM integration applies the mode rubric and labels ratings provisional. New unvalidated ratings are excluded from numerical progress comparisons; garden rewards remain based on participation.

Friend conversations are currently separate from AI practice and have no automated scoring. This change does not silently start judging friends' private conversations.

## What “accurate” would require

An LLM obeying a schema is not a validated assessor. Published LLM studies show materially different agreement across datasets, topics, models and prompting conditions; their coefficients are not an accuracy estimate for this app. Review the [LLM assessment evidence and validation plan](llm-assessment-validation.md) before choosing a model or making a product claim.

For example, GPT-4 few-shot scoring of 1,710 constrained science/history answers achieved Cohen's κ .70 against a human reference, with human–human κ .75. In a different study of 13,121 essays, GPT-4o zero-shot scoring achieved about 30% exact agreement and weighted κ .437. The tasks, scales and metrics differ: these are illustrations of context dependence, not a model ranking or pooled accuracy rate. [Henkel et al., 2024](https://doi.org/10.1145/3657604.3664693), [Johnson and Zhang, 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11614890/).

The following is a **proposed MindGarden study**, not a completed study or a universal certification standard:

1. Define the claim narrowly: useful feedback about one response. Identify the actual target population and consequences. Separate any later claim about general skill or improvement.
2. Have assessment specialists and representative users review task-to-criterion alignment and original anchors. Create consented examples of concise strong answers, plausible weak reasoning, source misreadings and justified disagreement.
3. Train at least two independent human raters. Preserve their initial judgments and reasons; adjudicate a separate reference. If humans cannot apply a criterion consistently, revise it before tuning a model to it.
4. Split calibration and held-out evaluation by learner and prompt family. Keep retries from the same learner together. Do not tune prompts on the final test set.
5. Compare candidate models and prompt versions on the same held-out responses. Report per-mode/per-criterion quadratic weighted kappa, exact agreement, within-one agreement, mean absolute error, abstention coverage and human–human agreement, with uncertainty intervals. Inspect why they disagree; a single aggregate can conceal weak criteria.
6. Audit repeatability, prompt injection, score changes caused by irrelevant verbosity, reversed political positions, language varieties, transcription errors and N/A decisions. A correct quote is an engineering check; a fair score and useful suggestion need human review.
7. Predefine practical release gates with assessment expertise using intended risk, acceptable error and interval precision. An arbitrary “κ > .8” does not by itself establish validity. Determine sample size from precision and subgroup needs; a small pilot is for refining the study, not certifying the app.
8. Re-evaluate when the rubric, model, prompt or task changes. Any claim of improved skill needs subsequent independently scored transfer tasks, ideally with a comparison condition.

The repository includes an [offline benchmark tool and data contract](../assessment-benchmark.md). Its synthetic fixture demonstrates calculations only. It does not supply human ground truth, run an LLM, or mark the product validated. Live model evaluation still requires configured server credentials; the human study still requires independent raters and consented responses.

## Product wording and scope

Use **“Research-informed feedback”**, **“Provisional AI feedback”**, and **“Coaching only · no scores”** as appropriate. Avoid “scientifically proven accurate,” “validated ability score,” or an official qualification label. Keep the default interface short and place research and limitations in expandable details.

This was a focused review of primary papers, official frameworks, research reports and meta-analyses, not a preregistered exhaustive systematic review. Public availability does not automatically permit commercial reproduction of test items or rubric tables. The implementation uses original wording and links to foundations rather than copying protected scales or claiming endorsement.
