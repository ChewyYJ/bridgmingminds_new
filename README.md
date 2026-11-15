# BridgingMinds

The supplied [BridgingMinds master build reference](docs/reference/master-build-prompt.md) is tracked with an [implementation gap and delivery plan](docs/build-alignment.md). An opt-in **daily workout** connects Read Aloud self-review and Spin & Speak to Home and persisted daily rewards. New daily speaking sessions now use [BRIDGE feedback and Thought Maps](docs/bridge-assessment.md). [Integrated WordBloom](docs/wordbloom.md) now schedules vocabulary into reading with optional self-reports. [Optional acoustic assessment](docs/speech-assessment.md) now has a consented job/feedback path verified with real decoding and offline assessment fixtures; live provider/device validation and calibrated adaptive mastery remain outstanding; the broader roadmap is not complete.

## Try the new daily workout

Complete onboarding, then choose **Start my daily workout** on Home. This is an explicit, persistent transition from the classic economy: future optional quests and repeated practice stop awarding XP, while all existing XP, plants, cosmetics and responses are retained. Choose your IANA time zone during onboarding or in Settings.

- **Read Aloud:** an immutable original passage, optional private recording and replay, a meaningful written observation and explicit self-review confirmation. Its authorised accessibility/provider-unavailable fallback is labelled **Self-review · no speech scores**. It does not call a pronunciation provider, grade pronunciation or detect silent recordings. Do not present it as acoustic assessment.
- **Spin & Speak:** new daily-plan sessions use the six-dimension, versioned BRIDGE rubric, a single priority feedback card, an optional full breakdown and a source-grounded Thought Map when AI is configured. Its first successfully processed qualifying submission of the local day earns 15 XP. Local mode has no ratings or extracted map, with a clearly separate sample map available. Historical and classic sessions retain their original rubric.
- **Daily progress:** 0/2 → 1/2 → 2/2. Read Aloud earns 10 XP; Spin & Speak earns 15. Only both secure the day and issue one cosmetic seed, with no extra XP bonus. Optional activities do not substitute. Submissions retain their server receipt day through delayed processing, retries and timezone edits. Extra attempts are saved without duplicate XP.
- **Daily speaking access:** [Required daily speaking is independent of optional AI allowance](docs/daily-access.md), with separate bounded feedback/coaching budgets and the existing global service cap.
- **Daily-plan gardens:** plants never die during a break. Watering is free and decorative and cannot grant a skill stage. Historical decorative stages remain; new mastery transitions are not enabled pending calibrated observations.

Read Aloud notes are saved on the device until submission. Saved observations are included in Profile and account export; recordings use existing private storage and retention. JSON export includes daily completions, secured days and trusted receipt records. Account deletion cascades those records.

SQLite creates the additive daily tables on startup. A hosted PostgreSQL installation must apply `supabase/migrations/202611110001_daily_workout.sql` through the existing migration runner **before deploying this version**. No production migration has been run by this task.

Run `node --test tests/daily-workout.test.mjs tests/daily-flow.test.mjs` for domain/API checks and `npm run test:e2e -- tests/daily-workout.spec.ts` for the real browser journeys, failure recovery and recording lifecycle. Screenshots are generated under `docs/screenshots/daily-workout/`.

A mobile-first Expo app for putting ideas into words. Explore a prompt or reading, review feedback tied to your saved response, compare a revision, and grow a personal garden through practice.

The proposed distinction is this connected routine, informed by a [review of seven adjacent apps](docs/research/competitive-positioning.md). It is a product direction to test with users, not a claim of uniqueness or proven learning outcomes.

This implementation uses an Expo / React Native client and a persistent Node.js / SQLite backend. It runs locally without AI credentials. The backend replaces the PRD's suggested Supabase service for this local build; accounts synchronize between devices that connect to **the same running backend and database**.

## Run locally

Use **Node.js 24 or later** and npm. SQLite support comes from Node itself.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:8081](http://localhost:8081). The API runs on port 3001. Choose **Try as guest**, select your interests and a goal, then start a challenge. Create an account later to preserve that guest garden under an email and password.

To run the exported web app through one server:

```sh
npm run build:web
npm start
```

Open [http://localhost:3001](http://localhost:3001). The server serves only the generated `dist/` website; `data/` and recordings are never public static directories. An export is a build artifact, not a deployment.

| Command             | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run dev`       | Start the API and Expo web development server on port 8081                  |
| `npm run build:web` | Export the web app to `dist/`                                               |
| `npm start`         | Serve the API and an existing web export on port 3001                       |
| `npm run test:api`  | Run isolated backend tests with temporary databases                         |
| `npm run ai:check`  | Check AI configuration offline without printing credentials                 |
| `npm run ai:smoke`  | Test AI request/response paths with mocks; no paid provider requests        |
| `npm run test:e2e`  | Build and test the exported app with an isolated local backend on port 3002 |
| `npm run test:e2e:ai` | Test the exported app with an isolated simulated AI provider on port 3003 |
| `npm run test:e2e:daily-access` | Verify both daily activities after optional allowance is exhausted |
| `npm run typecheck` | Check TypeScript                                                            |
| `npm run lint`      | Check source lint rules                                                     |

Do not run two API processes against the same database. Stop the development API before using `npm start` on its port.

## What is implemented

- Guest onboarding, interests, goals, account creation, login, logout and preferences.
- **Spin & Speak:** server-selected prompts, preparation timer, text or recording, editable transcript, feedback, and linked retries.
- **Debate Garden:** two or three text rounds, a challenger, saved conversation, a summary of both perspectives, and feedback.
- **Debate with friends:** private two-person rooms, six-character invitation codes, opposite positions, two or three rounds by text or recorded voice, and saved conversations. Find it in Play or the Home shortcut. No AI credentials required.
- **Read & Reflect:** six curated readings with publisher, date, original-source link, original editorial summaries and three reflection questions.
- **Today’s news:** a separate Discover view with headlines from **CNA, NPR and NASA**, dated today in your profile’s time zone. It opens on **All sources**; choose **CNA**, **NPR** or **NASA** to filter by publisher. Three fixed public RSS feeds supply unchanged headlines, original publication timestamps and direct source links through the backend; no news API key is required. Network failures, cached results and days without stories are explicitly shown.
- **Response feedback:** a focused next-step card with retry guidance, compact garden rewards, and expandable criteria for exact quotes and suggestions. Each mode shares its criteria with the LLM prompt; research and limits are available on demand. Saved responses, assessment notes and reports remain available below; completed practice opens at the top of the reflection.
- **Garden:** an illustrated floating meadow with twelve planting spaces, free placement by mouse or touch, saved plant positions, growth stages, watering, sunlight decorations and XP unlocks. Choose leafy plants or flowers, or draw and plant a custom doodle using the five-colour studio.
- History, comparable-practice views, journal, JSON data export and account deletion.

The news view refreshes every ten minutes while active and at midnight in your saved time zone. Yesterday’s cards disappear as the day changes, even if the next update fails; returning to the app also checks for a needed refresh.

The news feature is a local personal reader. CNA's [Latest News RSS feed](https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml) is listed in its [official RSS directory](https://www.channelnewsasia.com/rss). CNA and NPR feeds have personal, noncommercial usage limits; CNA also prohibits editing the feed and redistribution to third parties. The app displays metadata and direct links, without article bodies, images, rewritten headlines or AI-generated news summaries. See the [content policy](docs/content-policy.md) for the source terms checked on 13 October 2026.

Resource rewards depend on completing practice, not the viewpoint or assessment score. A challenge earns completion resources once; repeating the same prompt on the same day cannot mint more completion resources. Completion resources cap at ten distinct challenges per day. The first linked retry per session can earn sunlight, capped at three such rewards per day. Each daily quest pays once. Further practice remains available within request limits.

## A reason to return

Home suggests one useful next action: recover saved work, revisit the latest feedback, or enjoy the garden after practising today. A first visit offers an actual curated reading and question, selected from the learner’s interests. A three-day weekly intention counts any three days, including valid retries; consecutive days are optional. Progress uses the profile’s saved time zone and refreshes on return and day changes. Home also previews the actual garden, including plants that need water.

Linked revisions have a collapsed **Compare responses** view with both saved texts. Debate compares openings, keeping the opponent’s words separate. Completed feedback offers **Open garden**; resources are spent only when the user chooses a garden action. Brief button, feedback and plant animations follow both the live system reduced-motion preference and **Settings → Reduce motion**.

Daily quests are optional prompts to choose from, with their full water, sunlight and XP bonus visible. Garden shows the next variety unlock and how much XP remains; XP is cumulative and never spent. Points reward participation rather than assessment levels. See [the gamification design](docs/gamification.md) for the economy, return loop, capacity limits and pilot questions. These choices are hypotheses to test with users, not evidence of improved retention.

## Your floating meadow

The planting table opens with **Plants → Greenery**: fern and cactus are available immediately, monstera unlocks at 30 XP, and bamboo at 60 XP. Choose **Flowers** for daisy, sunflower, lavender and tulip. Each variety has its own artwork and growth stages; mature greenery stays leafy instead of blooming.

Each new plant costs one seed. Planting requires an unlocked variety, an available space and a clear spot inside the grassy island. Invalid drops and overlapping placements use no resources. Drag planted greenery and flowers to rearrange them for free, even with no seeds. Positions and drawings remain after reload and synchronize through the local backend.

Active plants and drawings need water every 48 hours. They show **Needs water** after 24 hours and become **Dead** when the 48-hour deadline passes. Each watering costs one water, renews 48 hours and advances growth up to stage three; mature plants still need care. Existing plants receive a full 48-hour grace period on their first load after this update.

**Archive** a living plant for free to pause its remaining care time and free a garden space. **Return to garden** restores its growth and resumes that remaining time for free. Dead plants can be **Cleared** for free or **Replanted** for one seed, preserving the species or drawing and position while restarting growth and care. Watering does not revive dead plants. There are no watering push notifications; use the archive before a longer break.

The **Draw your own** tab offers five ink colours, undo and clear. Drag the drawing preview onto the meadow or use **Plant my drawing**. On small screens, plant packets and the Greenery/Flowers selector sit above the meadow so a touch drag stays within reach; a completed drawing also appears there. Drawing paths are bounded and validated on the server. Custom doodles cost the same one seed as a plant and can be watered through the same growth stages.

For a drag-free alternative, choose a plant and tap the grass, or select a marked empty spot and use **Plant a seed**. Select an existing plant to water it or reposition it with the arrow controls. Existing gardens retain their plants, growth, resources and decorations when migrating to the larger meadow.

## Debate with a friend

Open **Play → Debate with friends**, choose a proposition and side, and create an invitation. Your friend opens the app with their own guest session or account, then enters the code. Both need the same running backend. A separate browser profile or private window can simulate a second person on one computer; signing into the same account in both windows does not create a second participant.

The host speaks first, then turns alternate. Record a voice message or write your argument; review the recording and transcript before sending. Without AI credentials, type the transcript yourself. Shared voice turns use the existing 30-day retention. These are asynchronous voice messages, not a live audio call. Conversations have no automated opponent, scores or garden rewards.

Invitations expire after 24 hours and active rooms after seven days. Either participant can close a room. Completed and closed transcripts remain available in **Your debates**. Reloading restores the active room and saved draft. If an invite or turn request loses its response, retrying recovers that same request; an unresolved invite keeps its original topic, side and round count. Only participants can access the conversation and its attached recordings. For a friend on another device, use the LAN/HTTPS instructions below; a localhost address on their device does not reach your computer.

## Local coaching and optional AI

With `OPENAI_API_KEY` empty, feedback is **Coaching only · no scores**. All numerical levels are null; deterministic revision prompts and saved excerpts support self-review. Local debate uses original, topic-specific counterpoints. These are not semantic assessments or fact verification.

With credentials, classic and historical sessions use original mode-specific rubrics: Support/Reasoning/Clarity/Nuance for speaking, Support/Reasoning/Clarity/Engagement for debate, and Understanding/Interpretation/Clarity/Reflection for reading. New daily speaking sessions use the separate [BRIDGE rubric and Thought Map contract](docs/bridge-assessment.md). Ratings remain **Provisional AI feedback**, excluded from new numerical progress comparisons. See the [research recommendation and primary sources](docs/research/mindgarden-evaluation-framework.md), [classic runtime contract](docs/grow-rubric.md), and [human benchmark tooling](docs/assessment-benchmark.md). A research-informed rubric does not by itself validate an LLM scorer.

You can record, replay and save audio locally. **Automatic transcription requires an AI provider key**; without one, listen to the recording and type or paste the transcript. Delivery remains **N/A** because this evaluator does not assess audible pacing or intelligibility. It never infers intelligence or personal traits from a voice.

To enable provider calls, set **only the server-side** `OPENAI_API_KEY` in `.env.local`, run `npm run ai:check` and `npm run ai:smoke`, then restart the API. Both checks are offline; they do not verify account access or trigger paid calls. The default models are:

```dotenv
OPENAI_MODEL=gpt-6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
```

Do not put secrets in an `EXPO_PUBLIC_*` variable. Those values are compiled into the client. The optional integration sends submitted answers and relevant prompt, reading summary or bounded debate context to OpenAI; transcription sends the selected recording. It has not been tested against a paid provider account in this build. Model access and billing belong to the configured account.

See the [minimal AI setup and troubleshooting guide](docs/ai-setup.md) for supported overrides, official model references, deprecation warnings and an intentional first live check. Health distinguishes configured settings from verified provider access; no automatic probe is made. Existing `.env.local` model overrides remain in effect until changed and the API restarted.

Evaluation jobs persist in SQLite and resume after a server restart. Provider errors keep the submitted answer and expose a retryable failure. Outputs must pass schema and quote checks before an assessment and its idempotent reward commit together. Quote offsets that do not match the saved text are rejected. Background processing runs inside the single API process.

## iOS and Android development

The app uses Expo SDK 57, Expo Router and Expo Audio. For a physical device, `localhost` refers to the phone; set a reachable API address before starting Expo:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
```

Replace the example with the computer's LAN address and keep both devices on a trusted network. Start the API, then use `npx expo start` and an Expo-compatible development client. Use the project's `android` / `ios` scripts where a simulator or configured native build environment is available. Native microphone and playback behaviour still needs device testing; a passing web export does not prove iOS or Android release readiness.

If you open the **web app from another device**, add the exact web origin to `ALLOWED_ORIGINS`: for the exported app served by `npm start`, that could be `http://192.168.1.42:3001`; Expo web development normally uses port `8081`. Keep both participants on the same app address with separate accounts. Browser microphone access requires HTTPS or a browser-recognized localhost origin; use HTTPS for remote web recording. Native bearer authentication uses secure device storage; browsers use an HttpOnly session cookie.

## Data and privacy

The default persistent files are:

- `data/garden.sqlite` — profiles, password hashes, sessions, attempts, feedback, jobs, journal and reward ledger.
- `data/audio/` — private recordings, limited to 10 MB per upload.

Recording storage requires consent. Audio uses authenticated access or a signed playback URL expiring after five minutes. Practice recordings are private; a voice recording attached to a sent friend debate turn is also accessible to the other participant. Recordings expire after **30 days** and are removed on startup or when accessed after expiry. Text and garden records remain until account deletion. Passwords use salted scrypt hashes; session tokens are stored hashed and expire after 30 days.

Settings supports a JSON export and deletion of the account, its sessions, attempts, assessments, journal, reports, rewards and recording files. The JSON export includes recording metadata, not audio binaries. Browser/native drafts are held on the device until saved or cleared by the app. Backups, filesystem snapshots and provider retention are separate operational concerns; a server deletion cannot remove copies held outside this app.

The export also includes the user’s shared friend rooms. Account deletion closes those rooms and removes the deleting user’s identity, written contributions and recordings while keeping the other participant’s own messages. It cannot retract copies a friend has already saved outside the app.

Guest data belongs to its current session. Signing into a separate existing account does not merge the guest garden; **Create account** while using the guest is the upgrade path that retains it. Email verification, password reset and external identity providers are not implemented.

## Configuration

See [`.env.example`](.env.example) for all supported variables. `PORT`, `DATABASE_PATH`, `AUDIO_DIR`, `ALLOWED_ORIGINS` and provider credentials are server settings. `EXPO_PUBLIC_API_URL` is the optional public client endpoint and is fixed into exported bundles at build time. Rebuild the client after changing it.

For an HTTPS deployment, set `NODE_ENV=production` and the exact allowed browser origins. Secure cookies require HTTPS. Prefer one origin for the exported website and API. Keep database and audio directories on persistent storage and restrict access. The service binds to `0.0.0.0` to support local devices; use firewall rules and a reverse proxy for public hosting.

## Verification and release limits

`tests/api.test.mjs` exercises all three modes, account synchronization, saved source snapshots, exact feedback quotes, retry links, concurrent/idempotent reward grants, daily caps, atomic garden spending, ownership isolation, cookie protections, private audio, export/deletion, failed assessments and restart recovery. Tests create temporary data and do not erase your garden.

`tests/provider.test.mjs` checks the configured AI request/response paths using offline transport mocks: evaluation, debate, transcription, invalid output, retained work and retry recovery. No paid provider requests are needed to run these tests.

After `npm run build:web`, `npm run test:e2e:ai` runs the complete browser → API → SQLite → feedback path with fake provider responses. It starts a separate server on port 3003, stores its database/audio in a temporary folder, and blocks unexpected external requests. It covers saved failure/retry, reading context, debate and corrected transcription. These are transport and product-flow checks, not live account verification or assessment validation.

The friends API tests cover participant isolation, atomic joins/turns, idempotency, expiry, shared audio access, deletion and restart recovery. News tests use dated RSS fixtures to check time zones, source validation, caching and failures.

`npm run test:e2e` builds the optimized web bundle, starts its test-only backend on port 3002 using `data/e2e.sqlite`, and runs Chrome browser tests covering text and audio practice, friend debates and recovery, news refresh and midnight rollover, mouse/touch planting, drawing and saved garden positions. It needs an installed Google Chrome; alternatively install a Playwright browser and set `PLAYWRIGHT_CHANNEL=chromium`. The test server is stopped automatically. Its credentials are forced empty so tests do not make paid AI calls. The test entrypoint allows the synthetic users on one loopback address a larger aggregate request budget; production defaults and per-user/authentication limits remain unchanged. To test an already-running development pair, set `E2E_WEB_URL=http://localhost:8081 E2E_API_URL=http://localhost:3001`.

This is a working local MVP, not a completed clinical or educational validation study. The PRD's human benchmark, calibration, diverse accent/noise evaluation, device accessibility testing, production monitoring, user pilot, managed backups and deployment review remain release work. The mode-specific rubrics and their LLM ratings remain unvalidated. Production authentication should add recovery/verification and abuse controls; multiple server instances need a shared database, shared rate limits and coordinated job claims.

A dependency audit at implementation time found upstream Expo/React Native toolchain and router advisories. Do not use `npm audit fix --force`: its proposed Expo/React Native downgrades and Router-major changes break SDK compatibility. Re-run `npm audit --omit=dev`, review the exact dependency paths, and test SDK-compatible patches before a public release. Development bundlers should not be exposed as production servers. The backend does not import the Expo build toolchain, but a clean backend test run is not a substitute for this dependency review.

Further implementation notes are in [`docs/`](docs/).

## Brand assets

The original MindGarden mark combines a rounded M, leaf and golden seed. The app uses shared vector geometry, with matching app icons and favicon. Editable SVGs and PNGs are in `assets/mindgarden-*`; see [brand notes](docs/brand.md) for regeneration.
