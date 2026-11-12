# BridgingMinds — Master Build Prompt

> **Purpose:** This is the complete product and engineering source of truth for building the BridgingMinds application. Deliver a production-quality, full-stack, mobile-first app—not a mockup, pitch deck, generic template, or collection of disconnected demo pages. Implement the coherent core first, then complete the specified extended experiences in phases. Explicitly report what is built and what remains behind feature flags.
>
> **Product tagline:** **Think clearer. Speak better. Grow independently.**
>
> **Product thesis:** As AI makes it easier to generate polished answers, BridgingMinds uses AI to strengthen people's own critical thinking, articulation, reasoning, and spoken communication—not to replace their thinking.
>
> **Audience:** Begin with Singapore polytechnic, JC, and university students (approximately 16–25), then expand to other students, young professionals, and opt-in institutional deployments.
>
> **Final daily rule:** BOTH Read Aloud **and** Spin & Speak must be completed each local calendar day to earn/continue the streak. Neither alone qualifies.
>
> **Final WordBloom rule:** WordBloom is an *automatic cross-activity system*, **not a third daily task, flashcard feature, or separate mandatory mini-game**. It finds appropriate vocabulary opportunities in Spin & Speak and incorporates selected words into subsequent Read Aloud passages, with adaptive spaced repetition.

---

## 0. Operating instructions for the coding agent

**Full-app scope:** The eventual product includes user onboarding, auth and settings; Read Aloud; Spin & Speak; integrated WordBloom; AI Coach; BRIDGE assessment and interactive Thought Maps; personalised skill recommendations; daily streaks/XP/Skill Garden; progress history; optional Read & Reflect, Debate With Friends/AI, advanced coaching modes; and future freemium subscriptions and school pilots. **Phase labels describe implementation order, not permission to replace later features with fake functionality.**

1. **Inspect the repository first.** If a project exists, follow its conventions and reuse working infrastructure. If it is empty, scaffold the recommended stack below. Do not overwrite existing functionality without a clear reason.
2. **Implement, don't merely describe.** Build runnable pages, components, backend endpoints, database models, migrations, tests, seed content, and documentation. No dead buttons, decorative controls, fake progress, or unfinished placeholder pages presented as functioning features.
3. **Implement in complete vertical slices and cover the whole product roadmap.** Fully complete the daily learning loop, **integrated WordBloom**, AI Coach, Thought Maps, streaks, XP and garden before advanced social and news features. Then build the optional modes behind real permissions/feature flags; do not stop at pretty MVP screens. Work in slices: record → analyse → show feedback → persist → adapt → award progress.
4. **Create a premium, original interface.** Duolingo is a reference for approachability, habit formation, delightful feedback, and clarity—not a visual asset, character, palette, or screen to copy. BridgingMinds has its own warm, garden-themed identity.
5. **Keep model judgments bounded and explainable.** The LLM may produce skill observations and recommendations, but the backend alone awards XP, validates mastery, and updates streaks. Never invent speech scores or factual evidence.
6. **Work even without paid API keys.** Offer a clearly labelled **Demo Mode** with pre-recorded/sample passages and deterministic example analysis so the full UI can be reviewed. Do not misrepresent demo results as a real assessment.
7. **Write down assumptions and trade-offs.** Where details remain open, choose reasonable defaults, document them in `README.md`, and continue building. Avoid blocking on minor clarifications.
8. **Security, accessibility and privacy are product requirements.** Protect recordings, control retention, honour accessibility settings, and do not assume a particular English accent is incorrect.
9. **No synthetic success claims.** Do not invent user counts, learning gains, AI accuracy, academic validation, premium conversion, provider outputs, speech scores, or payment transactions.
10. **Preserve user agency.** AI coaches by asking, reflecting and suggesting; it does not silently replace the student's answer, change a user's intended meaning, or make unsupported psychological claims.

---

## 1. Product positioning and audience

**BridgingMinds is an AI-powered thinking and communication gym** for students and young adults who may have useful ideas but struggle to organise, justify, and express them spontaneously.

### Three differentiation pillars

1. **Habit-forming, enjoyable practice:** A short daily learning ritual plus a garden that rewards consistency and demonstrated growth.
2. **Visual and digestible feedback:** AI-generated Thought Maps show claims, evidence, logical links, and missing pieces instead of overwhelming users with paragraphs of critique.
3. **Cross-activity adaptive practice:** The product recognises recurring weaknesses, prescribes exercises, reduces hints, and measures the ability to apply skills independently to new prompts.

### Key UX promise

A user opens the app, sees **exactly two required daily activities**, completes the speaking/reading practice in about five minutes (plus variable processing/feedback time), receives encouraging and specific feedback, watches their garden respond, and knows what to practise next. WordBloom works automatically between their activities.

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
- Analyse word choice for **WordBloom** and select up to 1–3 genuinely useful new words/phrases when appropriate (zero if none are needed). Save them for future Read Aloud passages.
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

Organise plants/areas around skill domains (not five mandatory modes):
- **Voice Garden:** pronunciation, intelligibility, pacing, and prosody.
- **Reasoning Orchard:** clear claims, sound reasons, explanations, and evidence.
- **Articulation Meadow:** coherent and understandable expression.
- **Perspective Forest:** alternative viewpoints, listening, and rebuttals.
- **WordBloom Garden:** clear, context-appropriate vocabulary, accurate pronunciation in reading, and later natural use in Spin & Speak. WordBloom is integrated into the two daily activities; it is not a standalone daily exercise.

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

- **Home:** Today's 2/2 workout, current streak, earned XP, one clear next CTA, selected plant highlight, last improvement insight. Show a "both required" message during 1/2 progress; never show secured streak then.
- **Learn:** Required Read Aloud and Spin & Speak plus an **Explore** section for genuinely implemented optional modes (Debate, Read & Reflect, later challenges). WordBloom is automatic and has no standalone mandatory mode.
- **Garden:** Interactive personal garden with plant growth explanations, rewards, decorations, and skill-linked progress.
- **Progress:** Trends for Voice, Reasoning, Articulation, WordBloom vocabulary exposure, and Independent Mastery; view historical attempts and before/after comparisons.
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

### Personalisation and WordBloom integration

Persist skill observations with passage ID, item difficulty, timestamp, locale and confidence. Require repeated credible observations before marking a recurring weakness. Recommend future passages focused on the identified skill, with periodic transfer checks using unseen text.

**Crucial:** Compose or select the next reading passage using *eligible WordBloom words derived from previous Spin & Speak responses* as well as any verified pronunciation targets. Highlight the words unobtrusively and show optional meanings, example context, and pronunciation when tapped. Do not require an extra WordBloom task. A reading passage should remain natural, pedagogically appropriate, and short enough for the target two-minute activity. Do not cram a word into irrelevant sentences just to satisfy a scheduling rule. Preserve a fallback curated passage if generated content fails validation.

When a user completes Spin & Speak *after* Read Aloud, schedule the new words for the **next** eligible Read Aloud. If they Spin & Speak first and the day's passage has not yet been generated or started, the words may appear that day; never mutate an already-assigned or partially completed passage. The product must work in either activity order.

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
7. Pass transcript, context, and vocabulary observations to **WordBloom**; select at most 1–3 useful words for future Read Aloud and provide a small, optional "Words to discover" preview. Do not call a separate required vocabulary activity.

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

### WordBloom — integrated foundation feature, NOT a separate daily activity (phase 1)

**Core promise:** The student learns new words almost effortlessly through the existing two required daily activities. Spin & Speak surfaces contextual vocabulary opportunities; subsequent Read Aloud passages naturally include those words, then revisit them through spaced repetition.

**Exact workflow:**
1. After every valid Spin & Speak answer, identify wording that is vague, unnecessarily repetitive, incorrect in context, or could be more precise. Do **not** label everyday/simple English as bad or suggest fancy synonyms for their own sake.
2. Recommend **0–3 context-appropriate words or short expressions**. If the response is already clear, recommend zero or one optional enrichment term; do not force three.
3. For each proposed word, store its intended meaning, original excerpt, suggested use, type of improvement, difficulty, student goal, and a confidence flag. Permit users to dismiss inappropriate suggestions.
4. Insert newly introduced words into the **next eligible Read Aloud passage**, naturally, with optionally tappable definitions; the user practises saying the words in context, with no third exercise to complete.
5. Reintroduce selected words in later Read Aloud passages using **adaptive spaced repetition** (e.g., illustrative spaced intervals after initial exposure such as several days later; not hard-coded Day 2/4/8). If pronunciation repeatedly causes difficulty, review sooner; if it is intelligible, lengthen the interval. If a word is forced into unnatural context, skip and reschedule.
6. If a student later uses a word naturally in Spin & Speak, record **productive-use evidence** separately from read-aloud pronunciation. Merely reading a word correctly does not establish independent vocabulary mastery.
7. Feed vocabulary observations into the unified learner profile and **WordBloom Garden**. Garden growth reflects credible cumulative learning, not automatic appearance of new words.

**User experience:** After Spin & Speak, optionally display a tiny "WordBloom discovered" chip. In Read Aloud, show a subtle leaf highlight and a tap-to-see meaning. Do not surface flashcards, quizzes, a separate required tab, or an extra daily activity. A passive list of encountered words within Progress may be available, but it is not the main feature.

**Technical scheduling:** Use records such as `vocabulary_items`, `user_vocabulary`, `vocabulary_exposures`, `word_review_schedule`. Statuses: `suggested`, `scheduled`, `introduced`, `review_due`, `familiar`, `dismissed`. Track `reading_pronunciation_evidence` and `spontaneous_productive_use_evidence` separately. Deduplicate candidate words and avoid reintroducing an already-familiar word as new. Preserve passage assignment versions so retries and concurrent requests don't silently change content.

**Acceptance:** (a) Spin & Speak with vague expression yields relevant suggestion; (b) later Read Aloud naturally includes selected word; (c) repeated review can recur without an extra screen; (d) confident or uninterested users aren't flooded with recommendations; (e) both exercise orders work; (f) word frequency adapts to observed proficiency; (g) users can dismiss a suggestion and it stops reappearing.

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
- `vocabulary_items`, `user_vocabulary`, `vocabulary_exposures`, `word_review_schedule` (**integrated into phase 1**; optionally add a minimal read-only word history in Progress)
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
4. Spin & Speak end-to-end: genuinely interactive topic wheel, recording, transcription, evaluation, and WordBloom candidate extraction.
5. Thought Map and BRIDGE feedback with actionable improvement and retries.
6. Rules-based basic recommendations, learner history, and **WordBloom insertion into subsequent Read Aloud passages with adaptive scheduled reviews**.
7. XP ledger, idempotent 2/2 streak logic, daily cosmetic reward, simple garden with four growth stages.
8. Progress screens, empty/error/loading states, accessibility and mobile polish.
9. Tests, seeded demo flows, deployment guide and operating instructions.

### Phase 2 — Enrich learning

- Read & Reflect; richer WordBloom analytics and optional vocabulary history (WordBloom itself is already integrated in phase 1).
- More sophisticated skill recommendations and spaced practice (building on WordBloom already integrated in phase 1).
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
10a. WordBloom automatically selects 0–3 genuinely useful words from Spin & Speak and places them into an upcoming Read Aloud passage in natural context, with repeat exposures over time. No additional WordBloom task or streak requirement exists.
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

## 17. AI Coach implementation contract — what to analyse, how to score, what to return

The AI Coach is **one persistent learning system shared by every mode**. It has two distinct assessment pipelines, an adaptive coach, and a versioned learner-profile store. It is not an unbounded chat agent making opaque judgments.

### 17.1 Read Aloud analysis (acoustic, not LLM guesswork)

**Inputs:** `user_id`, assigned passage ID/version, reference text, recording URL, speech locale, time zone, session ID, past high-confidence pronunciation observations.

1. Validate media duration, encoding, size, permissions, and passage assignment.
2. Use the speech assessment provider to compare audio to the provided reference text. Persist provider version and supported metrics only.
3. Extract word/phoneme observations, completeness, approximate rate, pauses, and if available reliable prosodic markers. Treat provider scores as observations, not a measure of intelligence.
4. Identify **one concrete actionable improvement** grounded in a word or pause from the recording. Show a positive observation too.
5. Update speech history only when confidence is adequate, and schedule the next passage for difficulty and WordBloom exposure.
6. Highlight specific word spans and permit playback of the user's recording alongside an optional, clearly identified reference voice.
7. Handle noisy audio, skipped words, microphone denial, inability to align, unsupported locale, or partial provider failure without fabricating results.

**Important:** A generic transcription model by itself cannot reliably rate pronunciation or intonation; acoustic assessment requires appropriate signal-level tools and evaluation. Do not call all regional accent differences errors.

### 17.2 Spin & Speak analysis (reasoning + delivery)

**Inputs:** prompt ID, prompt category, response goal, requested speaking duration, audio recording, transcript with aligned timestamps (if supported), learner history, rubric version.

1. Transcribe the authentic response; confirm enough meaningful content exists for evaluation.
2. Extract explicit claims, reasons, examples, implicit/missing warrants and **task-relevant** perspectives using a structured Toulmin-inspired graph. The extraction must have `source_span`/evidence references to the actual transcript where feasible.
3. Validate graph schema, node IDs, allowed edges, inferred versus explicit content, and source spans in ordinary code.
4. Decide which BRIDGE dimensions are applicable for that prompt (e.g. `D` optional for a personal anecdote, usually applicable for a formal debate).
5. Evaluate applicable dimensions using clear behaviourally anchored 1–4 descriptors. Return `not_assessed` when too short, ambiguous, or outside criteria. Do not assign fake precision or compute a universal intelligence score.
6. Provide **one strength, one priority gap, one suggested question/action**. Show concise examples quoted from actual transcript spans.
7. Independently analyse speaking delivery *from audio*, not just the transcript, where measurement is supportable.
8. Suggest an optional retry/follow-up without supplying a complete replacement answer. Re-score the retry and compare evidence.
9. Feed stable, repeated skill observations into the learner profile. Pass word-choice observations to WordBloom.

### 17.3 BRIDGE rubric implementation

| Dimension | 1 — Emerging | 2 — Developing | 3 — Effective | 4 — Strong |
|---|---|---|---|---|
| B: Big Idea | Main idea hard to identify | Position partly clear or broad | Clear relevant central point | Clear, precise, consistently focused |
| R: Reasons | Reasons absent or disconnected | Reasons present but superficial | Relevant and explained reasons | Well-developed logical reasoning with key links |
| I: Illustrations | Needed support missing | Generic or weak support | Relevant example/evidence | Specific, appropriate, well-explained support |
| D: Different Perspectives | Relevant alternative ignored | Alternative mentioned only | Alternative considered fairly | Alternative addressed with nuance and relevance |
| G: Glue | Hard to follow | Some links but fragmented | Coherent ordering and transitions | Clear progression where each point supports the whole |
| E: Expression | Meaning frequently unclear | Mostly understandable with vagueness | Clear and appropriate language | Precise, audience-aware and effective expression |

These are **provisional** descriptors to be validated and improved. They should never claim published validity. Do not automatically give 1 for a skipped/not-applicable dimension; mark it `not_assessed`.

**Important disciplinary boundaries:** Toulmin describes argument *structure*; Paul–Elder and AAC&U criteria inform *quality*. A complete-looking graph does not prove the argument is correct. Evaluating delivery is a separate acoustic task. Bloom's Revised Taxonomy is for designing prompts, **not a score for intelligence**.

### 17.4 AI response JSON contract (illustrative)

```json
{
  "attempt_id": "uuid",
  "evaluation_version": "bridge-v0.1",
  "model_id": "configured-provider-model",
  "task_type": "spin_and_speak",
  "transcript": "AI can be useful because it saves time.",
  "dimensions": [
    {
      "id": "B",
      "score": 3,
      "status": "assessed",
      "evidence": [{"start": 0, "end": 16}],
      "rationale": "The main position is identifiable."
    },
    {
      "id": "D",
      "score": null,
      "status": "not_assessed",
      "evidence": [],
      "rationale": "This prompt did not require opposing perspectives."
    }
  ],
  "argument_graph": {
    "nodes": [
      {"id": "n1", "type": "claim", "text": "AI can be useful", "status": "explicit", "source_span": {"start": 0, "end": 16}},
      {"id": "n2", "type": "reason", "text": "it saves time", "status": "explicit", "source_span": {"start": 28, "end": 41}},
      {"id": "n3", "type": "warrant", "text": null, "status": "missing"}
    ],
    "edges": [
      {"id": "e1", "source": "n2", "target": "n1", "relation": "supports"},
      {"id": "e2", "source": "n3", "target": "n2", "relation": "needs_explanation"}
    ]
  },
  "strength": "You expressed a clear opinion.",
  "priority_gap": "You have not explained why saving time improves learning.",
  "next_question": "How might saving time change a student's understanding?",
  "confidence": "medium",
  "speech_delivery": {"available": false, "metrics": null},
  "wordbloom_candidates": [
    {"word": "beneficial", "reason": "More precise in this context", "status": "suggested"}
  ]
}
```

The example is *schema guidance*; never use its data as real user output. Validate every field with Pydantic and use bounded retry logic to repair invalid structured responses.

### 17.5 Feedback methodology

Adapt Hattie & Timperley's principles into a friendly three-step coaching card:
- **Goal:** "A strong answer explains why its evidence supports the main point."
- **Where you are:** "You have a clear opinion and one reason, but the link is unclear."
- **Next step:** "Explain how saving time improves understanding, then try again."

Use short, encouraging, specific feedback. Never label users as unintelligent, shy, incapable, or psychologically deficient. Allow users to challenge or dismiss an incorrect AI observation; log corrections for improving evaluation quality.

---

## 18. Full-feature specifications beyond the initial daily loop

These belong to **the whole app**. Implement them once the core daily loop and data foundations are solid, and only expose features that actually work. They are *optional modes* and **never substitute for the two required streak activities**.

### 18.1 Read & Reflect

- Curated current affairs, science, technology, civic and education topics, with topic filters and difficulty levels.
- Ingest via permitted/contracted news APIs or publisher feeds; store source title, URL, publication date, attribution, content rights and verification date. Do not scrape/paywall-bypass or reproduce unauthorised article text.
- Generate and validate comprehension, claim/evidence, bias/assumption, perspective and independent reflection questions grounded in permitted article content.
- Evaluate comprehension independently from personal argument quality; a user can understand an article while disagreeing with it.
- For factual claims, distinguish `supported_by_source`, `contradicted_by_source` and `not_established`; don't treat unsourced as automatically false.
- Let the user respond by text or voice when supported, receive Thought Map and short BRIDGE feedback, and add trustworthy skill observations to the same profile.
- Support reading preferences, bookmarking and content reporting; show the article's date and publisher.

### 18.2 Debate With Friends / AI

- Invitation link, private room, topic, selected side, round timer, fair turn order, reconnect and leave state; backend must authoritatively enforce rooms and turns.
- Rounds: openings → rebuttals → optional cross-examination → closings → rubric-based coach evaluation.
- Score appropriate argument dimensions with **evidence-backed** rationale, not a single unaccountable "AI winner" prompt. Allow ties, uncertain outcomes and a shared feedback mode.
- Reduce judge position bias by anonymising identities, balancing turn opportunities, and testing order sensitivity. Don't claim that an AI verdict is objective truth.
- Enable **Perspective Swap**: users argue the opposing side or consider a stronger alternative argument.
- Maintain safety/report/block capabilities and avoid displaying private audio to other users without consent.
- Optional friendly rewards are cosmetics/participation-linked, not rankings of students' inherent intelligence or speaking ability.

### 18.3 Advanced coaching modes

- **Audience Switch:** Respond to one concept for a friend, lecturer, employer, or younger learner; evaluate context-appropriate explanation, not only fancy vocabulary.
- **Pressure Lab:** Practise surprise follow-ups, presentations, interviews, and real-time questions; ensure manageable difficulty and opt-out.
- **Reasoning Detective:** Spot unsupported claims, hidden assumptions, and logical gaps in provided examples, with explanations of why an argument is weak.
- **MindBridge:** Simulate a listener's interpretation of the student's answer; ask student to confirm whether it matches their intention, then coach the communication gap. Label simulated interpretations as subjective, never as verified mind-reading.
- **Before / After Replay:** Compare transcripts and maps for successive attempts, including what changed and what remained unclear.
- **Real-Life Missions:** Optional offline communication goals with user self-reflection; do not demand recording other people.
- **Community Gardens and Friend Quests:** Opt-in cooperative activity milestones, friends privacy, block/report, no mandatory social comparison.

### 18.4 Teacher / school pilot mode (institutional phase)

- Organisation and educator roles, class groups, teacher-assigned approved exercise collections, privacy-controlled aggregate analytics, and optional student progress sharing with proper consent.
- No automatically exposed student raw recordings, individual coaching histories, or inferred traits to teachers. Give users/guardians the relevant controls where required.
- Verify institution isolation with tenant-aware authorization and row-level security; support per-seat licensing and administrative billing.
- Do not claim objective grading of students based only on experimental BRIDGE AI outputs; keep educators in control of high-stakes evaluation.

---

## 19. Adaptive recommendations and learning-loop algorithms

### Separate three kinds of progress

1. **Engagement state** — 0/2, 1/2, 2/2 today; streak; activity XP; cosmetic rewards.
2. **Skill observation state** — activity-specific performance with evidence, rubric/provider version, reliability metadata and confidence.
3. **Mastery state** — robust patterns across multiple, varied and ideally *unassisted* attempts; drives plant growth, not daily activity counts.

### Beginner recommendation approach

```python
# Illustrative domain logic — actual code should use typed records and test fixtures.
for skill in eligible_skills:
    recent = high_confidence_observations(skill, last_n=8)
    if len(recent) < 2:
        continue  # insufficient evidence for a stable weakness
    priority = gap_estimate(recent) * goal_relevance(skill) * due_for_review(skill)

next_target = select_highest_priority_skill()
next_exercise = choose_curated_exercise(
    skill=next_target,
    difficulty=estimated_appropriate_difficulty(),
    excluding_recent_topics=True,
)
```

The AI may propose a follow-up question; **server logic chooses eligible exercise type, skill target, daily requirements and rewards**. Maintain explicit logs: "recommended because evidence support was weak in two recent answers." Allow user goal overrides and a browse-all mode.

### WordBloom scheduling detail

```text
Spin & Speak transcript
  → detect a specific vocabulary opportunity
  → select 0–3 useful words (avoid meaningless inflation)
  → save as scheduled vocabulary, with meaning and original context
  → choose next not-yet-started Read Aloud passage
  → incorporate selected words naturally and mark first exposure
  → reschedule for later passages (adaptive spaced repetition)
  → measure reading pronunciation and optional spontaneous later use
  → lengthen intervals as performance becomes stable
```

For the first implementation, use a deterministic interval scheduler with a low daily word cap and a maximum review quota per passage. Tune intervals using review outcomes. Don't have the LLM decide the exact calendar schedule or immediately grant vocabulary mastery. A word's *meaning*, *pronunciation*, and *productive spontaneous use* are distinct observations.

### Independent transfer tests

Periodically use an unseen, similarly challenging question without hints to assess transfer. Compare rubric dimensions while adjusting for prompt difficulty; report directional progress rather than spurious precise improvement percentages. Give transparent uncertainty if only a few samples are available.

---

## 20. Monetisation, growth and product analytics

### B2C freemium business model

- **Free:** Account, both compulsory daily activities, streak, basic feedback, limited Thought Map detail, WordBloom integration, core garden, basic progress history. **Never paywall a required activity necessary for the advertised daily streak.**
- **Plus (subscription):** More optional practice attempts, extended feedback breakdowns, advanced progress insights and replay, enhanced personalised programmes, premium garden themes and optional advanced modes. These should add depth, not remove necessary learning capabilities from Free.
- **Institutional B2B:** School pilots with curated exercise sets, optional privacy-preserving teacher views, seat-based pricing and accessibility controls.
- Pricing is **not validated**. Configure plans and prices rather than hardcoding a claimed market price. If payment provider is connected, use server-verified webhooks, idempotent entitlements, cancellation/grace handling and a clear billing portal.
- No ads or manipulative streak pressure as a core revenue strategy; especially important if users include minors.

### Product analytics events (privacy-preserving)

`onboarding_started`, `onboarding_completed`, `read_aloud_started`, `read_aloud_submitted`, `read_aloud_feedback_viewed`, `spin_started`, `spin_submitted`, `thought_map_opened`, `feedback_retried`, `wordbloom_suggested`, `wordbloom_first_exposure`, `wordbloom_review_exposure`, `daily_workout_completed`, `streak_day_earned`, `garden_reward_claimed`, `skill_mastery_awarded`, `trial_started`, `subscription_activated`.

Primary metrics: D1/D7/D30 retention; % of users who complete 2/2; time to completed daily workout; speech/job success rate; WordBloom exposure retention; repeated participation; delayed independent assessment improvement; helpfulness ratings; cost per completed session; free→paid conversion. **Do not confuse growth in XP with growth in ability.**

### Quality and experimentation

Treat this as testable hypotheses: Short practice improves habit formation; visual feedback improves understanding; adaptive selection improves progress; a two-task streak may affect retention positively or negatively. Use opt-in pilots and A/B tests where ethically appropriate; **do not claim these are proven BridgingMinds outcomes** until you measure them. Avoid dark patterns and fear-based notifications.

---

## 21. Production data model and APIs: additional detail

Use UUIDs as primary keys; store server timestamps in UTC and daily streak/calendar keys separately with an immutable chosen timezone snapshot for that day. Authorise all user-owned rows and objects; never trust a client-supplied `user_id`, XP, score, skill stage, date or entitlement.

### Key relational fields and constraints

| Entity | Essential data / constraints |
|---|---|
| `users` / `user_settings` | Auth ID, goal, locale, time zone, preferred microphone language, privacy and notification settings |
| `exercise_catalog` | Type, curated content/version, target skill, difficulty, publication status, reference passage or question |
| `exercise_assignments` | User, local date, assigned type, immutable passage/topic version, started state |
| `attempts` | User, assignment, audio object ref, transcript, upload receipt, attempt ordinal, processing state, server timestamps |
| `evaluations` | Attempt, rubric version, provider/model ID, structured scores, rationale spans, confidence, validity |
| `thought_maps` | Attempt/evaluation, versioned validated nodes/edges, transcript span alignment |
| `skill_observations` | User, evidence attempt, skill, score, confidence, activity type, difficulty, independent/assisted flag |
| `skill_mastery` | User, skill, stage, contributing observation IDs, last assessed timestamp |
| `daily_activity_completions` | UNIQUE `(user_id, local_date, activity_type)` for the two daily types |
| `daily_streaks` | Daily secured event UNIQUE `(user_id, local_date)`; current/longest streak derived/reconciled |
| `xp_ledger` | Immutable reason, origin event, amount, UNIQUE idempotency key |
| `garden_plants` / `garden_rewards` | Skill/plant, growth stage, inventory/cosmetics, UNIQUE daily award grant |
| `user_vocabulary` | Word, meaning/context, source response, first exposure and review scheduling status |
| `vocabulary_exposures` | Passage assignment, word, timestamp, reading outcome and optional spontaneous-use evidence |
| `debate_rooms` / `debate_turns` | Room participant access, server-controlled turn state, moderation/report fields |
| `content_sources` / `articles` | Publisher rights, attribution, source URL/date, approved content, generated prompt versions |
| `subscriptions` / `entitlements` | Provider customer ID, webhook-event idempotency, active feature plan |
| `organisations` / `memberships` | Tenant roles, scope-limited teacher/school access |

### Additional endpoints

```text
POST   /api/auth/onboarding
GET    /api/me/learner-profile
GET    /api/read-aloud/assignment
GET    /api/spin/topic-wheel
POST   /api/attempts/{id}/transcription-retry
GET    /api/attempts/{id}/thought-map
POST   /api/attempts/{id}/feedback-correction
GET    /api/wordbloom/summary        # optional read-only progress, NOT required exercise
PATCH  /api/wordbloom/{word_id}      # dismiss / opt out
GET    /api/quests/today
GET    /api/garden/inventory
POST   /api/garden/decorations/place
GET    /api/articles
POST   /api/reflections
POST   /api/debates
POST   /api/debates/{id}/join
POST   /api/debates/{id}/turns
GET    /api/debates/{id}/results
GET    /api/billing/entitlements
POST   /api/billing/checkout
POST   /api/billing/webhook
POST   /api/account/export
DELETE /api/account
```

### Streak transaction pseudocode

```python
def complete_activity(user_id, activity, attempt_id, server_received_at):
    # Date is pinned from user setting + trusted server receipt and immutable day key.
    day = resolve_assigned_local_day(user_id, attempt_id, server_received_at)
    with database.transaction():
        assert valid_processed_attempt(user_id, activity, attempt_id)
        inserted = insert_unique_daily_completion(user_id, day, activity)
        if inserted:
            award_xp_once(user_id, day, activity, amount=(10 if activity == 'read_aloud' else 15))
        if both_daily_activities_completed(user_id, day):
            if secure_streak_day_once(user_id, day):
                issue_daily_cosmetic_reward_once(user_id, day)
    # Plant mastery is calculated separately from completion/XP.
```

At midnight and time-zone changes, use the pinned assignment day and server receipt rules (not a client-forged timestamp); delayed AI processing must not rob a legitimate on-time submission of its day. Reconcile concurrent submissions transactionally. A valid attempt failed by a provider outage should enter a retryable pending state, with transparent UX and recovery rather than fabricated success.

---

## 22. Interaction design checklist and visual craft requirements

Aim for the polish of a highly rated consumer learning app, not an admin dashboard. Build an **original brand**, using Duolingo only as reference for UX patterns and lesson cadence, never for copyrighted art, mascot, UI copying, or identical reward animations.

### Suggested design direction

- **Aesthetic:** Botanical, optimistic, calm, youthful, polished, slightly whimsical; restrained and trustworthy rather than childish.
- **Palette direction:** warm ivory `#FFF9F1`, leaf green `#66A87E`, deep evergreen `#244C3B`, soft peach `#F5B7A5`, gentle lavender `#D9CDF7`, warm gold `#EBC66E`. Treat these as starting design tokens; meet contrast requirements.
- **Typography:** A contemporary, highly legible sans-serif; hierarchy through weight and spacing rather than tiny labels. Never bundle proprietary font files without licences.
- **Interaction:** Rounded tactile cards, purposeful motion, illustrated garden states, visible focus, immediate input acknowledgement, resilient offline/error/retry states.
- **Premium feel:** Consistent graphic language, purposeful empty space, beautiful onboarding, contextual illustrations, non-generic microcopy, accessible audio visualization.

### Main home journey

```text
Open app
  → Friendly greeting + streak status (never falsely marked secure)
  → Prominent 'Today's Mind Workout' 0/2 / 1/2 / 2/2
  → Read Aloud (2 min) + Spin & Speak (3 min) cards
  → One primary CTA: continue unfinished activity
  → Small preview: what skill is currently growing
  → On completing second required task: 2/2 success + garden reward reveal
  → Optional: view Thought Map, progress, garden, extended activities
```

### Screens to visually review at common breakpoints

- Entry, onboarding, microphone consent, initial calibration.
- Daily dashboard: 0/2, 1/2, 2/2, XP, streak not yet secured versus secured.
- Read Aloud: passage, progress, word hover/tap, accessible recording wave, word-level feedback, retries.
- Spin & Speak: wheel, selection, countdown, microphone, question and follow-up, result.
- Thought Map: expanded reasoning graph on desktop; collapsible/simplified graph plus list on mobile; missing warrants shown as explicitly *proposed* nodes.
- AI Coach: a concise primary insight and 'Try again' action, expandable rubric for users who want detail.
- WordBloom in context: "New word to notice" in the Read Aloud passage, not a separate required page.
- Garden: beautifully arranged responsive scene, selectable plants, growth-stage animation and reward inventory.
- Progress: short trend charts with uncertainty, ability to inspect past attempts and independent challenges.
- Explore: only genuinely implemented Debate and Read & Reflect modes visible as active.
- Account: recording privacy, retention, export/delete, notifications and accessible controls.

### Non-negotiable UX acceptance

- Touch targets minimum recommended 44px; no microscopic controls on mobile.
- All actions backed by working routes and persistent state; no decorative fake CTA.
- Meaningful skeletons and retry states when speech or LLM feedback takes time.
- `prefers-reduced-motion` honoured; sound and haptics optional.
- Screen-reader accessible transcript-based alternative to graph-only feedback; colours never convey the sole distinction.
- Recording permission denial handled gracefully, with explanation and retry.
- Good performance on an average phone and weak internet; compress audio responsibly and defer heavy animations.
- Screenshots/visual regression review on small phones, larger phones, tablets and desktop; fix clipping, overlap and awkward copy.

---

## 23. Test plan and independent validation

### Unit/integration tests

- 0/2 → 1/2 → 2/2 transition; both exercise orders; streak is **not** secured by one activity.
- XP 10 + 15 = 25 exactly once per local day; retry is free practice, not duplicate XP; grant cosmetic reward at 2/2 once.
- Consecutive days extend streak; missed day breaks current streak but does not delete cosmetics or mastery.
- Race condition when both requests finish simultaneously; time-zone changes, midnight boundaries, network retries, service outages.
- WordBloom 0/1/2/3 candidate selection; no forced synonyms; correct first exposure in next eligible Read Aloud; spaced review; dismiss prevents resurfacing; reading before speaking versus speaking before reading; late changes do not mutate assigned passage.
- Unavailable speech provider returns honest partial status and no fake metrics; retries recover; raw speech never sent to unauthorised services.
- Argument graph structure: no broken edges, no orphan node references, correct span alignment, inferred and missing nodes labelled.
- BRIDGE scoring: not-applicable and insufficient-evidence handling, evidence-backed rationales, stable versions; roleplay and story not penalised for absent rebuttals.
- Safe access to recordings, data export/deletion, row-level security and cross-account isolation.
- Teacher and friend access respect permissions and opt-in.
- Premium billing webhooks verified and idempotent; plan downgrade does not block required free daily practice.

### User testing

Start with a small pilot of students and use parallel human evaluations on sampled responses. Ask whether users can understand their Thought Maps and whether recommended changes are useful. Compare baseline versus delayed *unfamiliar* prompts to test for meaningful improvement; do not present unverified BRIDGE scores as scientific ground truth. Evaluate across relevant English accents and recording devices.

### Definition of finished

Deliver working demoable core flows, full implementation for any enabled advanced mode, seed data, environment setup, tests, README, deployment instructions, screen recordings/screenshots where possible, known limitations and feature flags. **Never claim the entire roadmap has been completed if later phases are pending.**

---

## Final instruction

**Build BridgingMinds as an engaging, premium, garden-themed learning experience in which BOTH Read Aloud and Spin & Speak are required every day to maintain a streak.** WordBloom is seamlessly integrated: find context-appropriate words from spontaneous responses, incorporate them into subsequent Read Aloud passages, and revisit them through spaced repetition. Deliver visual, research-informed feedback that makes thinking understandable; use personalisation to target the next skill; and reserve meaningful garden growth for demonstrated independent learning. Prioritise beautiful, working UX and trustworthy assessment over feature count.
