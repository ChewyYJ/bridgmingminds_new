# Role 3 implementation

Implemented on top of `origin/person2akadakshaa`, with the latest `c31ed0c` merged into `person3/feature-trying-out` on 16 November 2026 (merge `7d57729`). The earlier Role 3 implementation remains in `54322f4`; the original safety stash remains. Nothing was pushed or deployed.

## Product surfaces

The app retains Dakshaa's Expo Router, authentication, responsive shell, DM Sans typography and shared design tokens. Main navigation is **Home, Play, Discover, Debate, Profile** on mobile and desktop. The shared header shows Coins. Home retains the daily learning hub with an added equipped-avatar card; Play and Discover retain their existing learning content. Debate replaces Homeland, and Profile opens avatar customisation with secondary links to learning progress and settings.

| Route | Behavior |
| --- | --- |
| `/` | Existing daily challenge hub and activities, plus equipped chibi, overall level/XP and avatar, food and achievements links |
| `/play` | Existing practice cards and friends-debate entry |
| `/discover` | Existing reading categories, articles and news feed |
| `/profile` | Adult and chibi previews, seven categories, three choices per gender/category, owned/locked filters, Coin-priced purchases, alternate earned unlocks, palettes and server-saved equipment |
| `/progress` | Existing practice ratings, learning history, dictionary, learner profile and milestones |
| `/food` | Ramen, onigiri and bento, price/fullness confirmation, atomic feeding, food-specific chibi animations, optional care/reminders |
| `/achievements` | Actual earned milestones and progress toward locked achievements |
| `/debate` | Left/right adult walking, reduced motion, three street opponents, preparation, spoken/written turns, recovery, results and history |
| `/tournament` | Dedicated Singapore Civic Cup lobby, three-round bracket, fictional final boss Chair Lin, topic setup, rewards, saved-run resume and match history |

Saved links remain compatible: `/avatar` opens Profile's wardrobe; `/garden`, `/homeland` and `/debate-street` open Debate; `/daily-practice` opens Home. Vocabulary-review and dictionary return links now point to `/progress`.

The asset lab remains available for development review. It does not replace account inventory or bypass ownership checks. Adult avatars use idle/blink and walking; the other reactions use the legless chibi variant. The existing 42 approved modular designs and separate boy/girl collections are reused. [Scene provenance and exact ImageGen prompt](role3-art.md), [avatar documentation](avatar-modular.md), [food assets](avatar-food-assets.md).

## Economy and migration

The user delegated reward rates and requested retiring garden mechanics. [Economy and cosmetic purchase policy](gamification-economy-v1.md) documents the chosen rates, eligibility, daily caps, milestones, prices and preservation rules. `shared/gamification.mjs` is the source of truth; screens do not choose award amounts or prices. Current configuration ID is `economy-cosmetic-purchases-v2`.

- Daily Practice: 2 Coins + 15 XP. Read Aloud: 3 Coins. Read & Reflect: 3 Coins + 15 XP. Debate: 3 Coins + 15 XP, up to two rewarded completions daily. Vocabulary retains 5 XP for its eligible daily review.
- Every food costs 5 Coins. Fullness is capped at 100; a full avatar cannot be charged for another meal. Replaying a successful purchase returns its original receipt.
- The 28 nonstarter cosmetics cost 120–400 Coins. Hats cost 120/180/240; paid tops 160/220; jackets 280/400; bottoms 180/240; shoes 200/280; accessories 140/300/360. Both collections use the same category/tier prices. All 14 starter items remain free and owned. Existing ownership and activity-based unlocks remain intact.
- Clothing purchases grant ownership; equipping is a separate action. Previewing does not spend Coins. A confirmation shows the server price and balance. Repeated purchase requests cannot charge twice, and a different request for an already-owned item costs zero. There are no real-money purchases.
- Each 100 XP advances a level. The first three-day streak adds 2 Coins; the first seven-day streak adds 5 Coins + 10 XP.
- Seeds convert once to Coins at 1:1. The original wallet, Water, Sunlight and XP baseline are archived, not destroyed. Trusted historical daily streak dates are retained. New users begin at zero Coins.
- Active APIs/UI use Coins. `/api/garden/*` transactions return 410 and `/garden` opens Debate. Historical garden source/data remain for compatibility/export, with no active garden economy or navigation entry.
- Care starts off. When enabled, fullness declines by six points/day; pausing care pauses decay. Low fullness never blocks learning or removes progress. Reminders are optional in-app messages, not push notifications.

## Contracts and persistence

`server/gamification.mjs` owns balances, receipts, progression, inventory, equipment and food transactions. The private reward adapters validate owned successful learning completions or receive trusted server completion events. Person 1's Daily Workout and Person 2's reflection/vocabulary paths call these adapters inside the existing transaction. There is no client reward-minting endpoint.

Authenticated routes: `GET /api/gamification`, `PUT /api/avatar/equipment`, `POST /api/avatar/purchase`, `PATCH /api/avatar/care`, `POST /api/food/purchase`. The allowed-origin CORS preflight includes PUT for Expo web. Same-origin and permitted cross-origin clients still require the existing authentication and request protections.

Cosmetic purchases accept only `{itemId, requestId}`. The response contains the current state, item, Coins spent and saved transaction ID. Debit, ownership and receipt commit in one account-locked transaction. Conflicting request IDs, caller-supplied prices and insufficient balances are rejected. Receipts use the existing Coin ledger; catalog metadata upgrades to version 2 without rewriting inventory, equipment, balances or legacy conversion records.

SQLite installs additive tables at startup. PostgreSQL has the matching migration at `supabase/migrations/202611150002_gamification.sql`; it must be applied through the project's normal cloud migration process before cloud deployment. This work did not apply a live cloud migration. Account export includes the new records; account deletion cascades to them.

Debate data uses owned, versioned session payloads in the existing sessions table. `shared/debate.mjs` defines topics, opponents, stages, judge criteria and deterministic outcome rules. `server/ai-debate.mjs` manages persisted turns, leases, recovery, tournaments and completion rewards. `server/debate-judge.mjs` isolates opponent generation from judging and verifies cited evidence against exact saved text.

## Debate behavior

Three user stages are opening, rebuttal and closing. Each spoken turn retains its private recording and reviewed transcript. Typed participation is also available. Optional timers can pause and never cause a network-related loss. Accepted turns survive reload; explicit recovery reuses saved work rather than duplicating requests or rewards.

New tournaments use the **Singapore Civic Cup** topic bank and the fictional final boss Chair Lin. Six policy motions have dated official-source background; earlier practice topics and street NPCs remain available. Saved older cups preserve their original title, topic and bracket. [Singapore content, source dates, boss contract and compatibility tests](singapore-debate-topics.md).

The dedicated `/tournament` lobby presents the cup, current motion, a single start/resume action, and expandable rounds, rewards and setup panels. Chair Lin is a fictional policy chair whose prompts focus on evidence, implementation and trade-offs. A separate boss practice action remains available in local mode; it cannot produce a competitive win or advance the cup.

The compact match layout keeps both chibi portraits, completed-turn bars, the motion, an optional timer and the latest opponent reply together. Recording and reviewed text entry sit below the arena; earlier turns expand on demand. The result card shows a celebrating chibi and victory treatment only for a verified win, with actual saved Coin/XP rewards and newly unlocked items. Criterion feedback and evidence expand separately. Local practice uses an explicit unscored completion state, and reopening a result never grants another reward.

With a configured provider, a separate judge evaluates both sides for relevance, claim clarity, reasoning, examples/evidence, rebuttal and coherence. The server validates the schema and exact evidence excerpts, then computes totals and outcome. Ties or uncertain comparisons replay the same tournament round; wins advance, and a loss ends that run while preserving history. Three wins complete the cup. A run has a bounded replay limit. Only verified competitive wins qualify for performance unlocks. Scores are provisional AI feedback, not validated measures of ability.

With no API key, the full practice loop uses an explicitly labelled rule-based opponent and unscored reflection. Completion rewards work; competitive judging, win unlocks, tournament advancement and automatic transcription require a working provider. The UI never fabricates a win. A configured provider failure keeps the submitted turn/recording and offers recovery instead of silently substituting local feedback.

History can be reopened or deleted. Deleting debate history preserves earned ledger receipts and does not delete a possibly shared recording; recordings remain subject to the existing private audio controls and retention policy in Settings. No live provider request was used to implement or test this change.

## Local setup

Use Node 24, as required by `package.json`. Keep `.env.local` outside version control. The environment text in the request contained a duplicated/corrupted model line; use one assignment per variable, for example:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
PORT=3001
DATABASE_PATH=./data/garden.sqlite
AUDIO_DIR=./data/audio
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:3001
EXPO_PUBLIC_API_URL=
```

These are the repository's configured model profiles, not a claim that a particular account has access. Run `npm run ai:check` for offline configuration validation. Use `npm run dev` for the normal API + Expo web workflow, or `npm run build:web` followed by `npm start` to serve the exported app from the API origin. Physical devices need the existing LAN API URL configuration described in [AI setup](ai-setup.md).

The review preview started on `http://localhost:3025/` uses `data/role3-preview.sqlite` and `data/role3-preview-audio`, with the provider key explicitly empty. It runs the real application with separate local data, not pre-populated rewards or fake inventory. Complete onboarding or use a guest account to explore it. The normal development database remains the path in your own environment settings.

## Verification

The subsequent approved UI redesign is documented in [Connected learning UI implementation](ux-implementation-2026-11.md), including the current export, pixel-art credits and refreshed browser checks. The entries below also retain the earlier merge baseline.

- After merging `c31ed0c`, the full Node 24 API suite passed: 399 passed, zero failed, three optional live-cloud checks skipped (402 total). This includes the incoming daily-guidance changes, clothing purchases, Singapore boss progression and allowed-origin PUT preflight. Log: `artifacts/role3/merge-api-suite.log`.
- Offline AI configuration check passed in local mode; offline mocked AI smoke passed all 43 checks.
- Role 3 browser gate verifies eight scenarios on merged export `d67d3a8d7f162c5f11b890832b031d2a`: the five existing debate, food, recording and wardrobe flows, mobile and desktop navigation through all five tabs and learning destinations, and a 320px layout check. The first run passed six; two new tests needed their enrollment assertion moved after the first daily activity, then both passed on the same export. The wardrobe check cancels a purchase without a request, simulates a lost successful response, retries the same key for one charge, then explicitly equips the owned item and checks persistence after reload.
- The separate boss browser gate completes all three tournament matches through the UI against a test-only mocked provider. It checks exact saved evidence, server-computed wins, the Chair Lin final, cup completion, result recovery and reward idempotency. Its screenshots demonstrate the victory layout using synthetic judging, not live-model quality.
- All 42 wardrobe pieces resolve nonempty isolated thumbnail layers; existing art files are unchanged.
- Typecheck, Expo lint and web export passed. Final visual checks use actual browser captures under `artifacts/role3`.
- Commands: `npm run typecheck`, `npm run lint`, `npm run test:api`, `npm run ai:check`, `npm run ai:smoke`, `npm run build:web`, then `npm run test:e2e:role3` and `npm run test:e2e:role3-boss`.

Browser tests use isolated local data with no real provider credentials. The competitive fixture supplies synthetic scores and exact quotes while the real server validates them and computes outcomes; outbound provider traffic is blocked. The microphone fixture checks capture/upload/review wiring, not real speech quality. Physical-device audio, live AI latency/scoring, and live PostgreSQL concurrency remain deployment/device validation tasks. Historical browser tests for the retired garden are not part of the Role 3 gate.
