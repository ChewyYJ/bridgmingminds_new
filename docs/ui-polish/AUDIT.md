# BridgingMinds UI polish audit

Baseline: `1ecefa1` on `ui-polish`, 16 November 2026. The preceding debate feature was pushed to `person3/feature-trying-out` before this goal started. No product code was changed during this audit.

## Product and implementation

BridgingMinds is an Expo SDK 57 / React Native 0.86 / React 19 application, with an Expo Router web export. Five main destinations are Home, Play, Discover, Debate and Profile. The app already has a distinctive avatar collection, editable planning boards, private audio capture, evidence-based feedback, and persistent progress. These remain the product foundations for the 10–26 audience; polish should make the practice inviting and understandable without childish copy, emoji, or additional reward pressure.

- `src/app/` owns router entry points. A catch-all currently delegates most routes to the 552-line `App.tsx`, which also owns responsive navigation and screen selection.
- `src/screens/` contains daily speaking, reading, discovery, onboarding, settings and history. `Practice.tsx` is 2,632 lines; `DailySpeaking.tsx` is 1,880. Presentation, persistence and workflow state share these files.
- `src/role3/` contains avatar customisation, food, achievements and staged AI debates. `src/avatar/` contains layered artwork and animation. The illustrated avatar manifest alone is about 1.17 MB before bundling.
- `src/components/ui.tsx` supplies DM Sans / Lora typography, Feather icons, buttons, fields and cards. Several screen-specific action, chip and status implementations duplicate this foundation. Across 71 client TSX modules there are 526 inline style blocks; many are reasonable layout styles, but colours, spacing and radii are not consistently tokenised.
- `server/` is Express 5 on Node 24, using Zod, SQLite or the existing PostgreSQL adapter, and private audio storage. OpenAI, ElevenLabs and Azure integrations are optional. `shared/` defines scoring, planning, avatar and economy contracts. API contracts, scoring, rewards and provider semantics are outside the visual refactor.
- Session ownership, request deduplication, server deadlines, saved transcripts and local drafts are important existing safeguards. They must survive every UI change.

## Main journeys to preserve

1. Guest or account onboarding → interests / goal → Home → two daily activities → saved feedback and progress.
2. Spin & Speak → news wheel → one-minute planning in Notepad / Mind map / Draw → spoken response / reviewed transcript → first feedback → optional guiding practice → optional sample script and vocabulary → completion.
3. Read aloud → immutable passage → recording, pause/resume and playback → Done / feedback → optional sample reader → daily completion. Provider-unavailable self-review remains explicit.
4. Discover → curated reading or publisher news → Read & Reflect → planning → spoken response → saved feedback and revision.
5. Debate street → challenger and motion → random stance roll → five-minute preparation → opening / rebuttal / closing → feedback / rewards / history. The explicitly requested change is to remove topic switching from this practice setup.
6. Tournament → saved bracket / rounds / boss challenge; friend debate → invitation / join code / private turns / saved conversation.
7. Profile → avatar inventory and shop → explicit equip / purchase; food → confirmed purchase and animation; progress / achievements / vocabulary review.
8. Settings → profile, recording consent, reduced motion, account creation, export, sign out and confirmed deletion.

## Baseline evidence

- Backend: **402 passed, 3 optional cloud tests skipped, 0 failures** (`npm run test:api`; 405 discovered).
- ESLint and TypeScript: passed.
- Production web export: passed; initial JavaScript bundle approximately **2.8 MB** uncompressed.
- First-time browser walkthrough: 19 screen families, 114 captures covering 375 / 768 / 1440 px under both OS colour preferences. No horizontal document overflow in those captures. Dark preference produces the same light interface. Additional debate setup, preparation and unknown-route captures are included.
- Axe scans: welcome, Home, Discover, Settings, Profile, Progress, Debate, debate setup and preparation. See `before/axe.json` for exact affected nodes.
- Lighthouse mobile production-export baseline: **Performance 41, Accessibility 98, Best Practices 96**. FCP 14.7 s, LCP 17.5 s, TBT 520 ms, CLS 0.055. This is a local throttled measurement, not a deployed-site claim. The welcome page result does not substitute for the authenticated screen axe results.
- Main browser baseline: **12 passed, 34 failed, 1 skipped** across 47 tests. Failures include obsolete “Grow my garden” selectors, old daily self-review controls, removed garden navigation, and a legacy database-fixture path mismatch. These predate this branch. The separate role-3 suite passed 7 of 8 tests; its microphone test needs a sequential rerun after a timeout under parallel load. Current debate preparation (3), reduced motion (2), news wheel, quick planning, saved guide and account-isolation checks pass. Offline-provider fixtures are being classified separately. A simultaneous first run was too resource-intensive to use as a timing baseline and is not treated as a product regression. Existing domain assertions will be retained as navigation is repaired.

## UX / UI problems

### High impact

- **No dark mode.** `app.json` forces light appearance and colours are static module-level constants. Supporting dark mode needs actual semantic tokens and reactive styles, not colour inversion.
- **Low contrast.** Axe measured mobile navigation labels at 3.36:1 and some secondary copy on tinted surfaces at 4.16–4.27:1. Small text needs at least 4.5:1.
- **Incomplete structure for assistive technology.** Pages lack a main landmark and explicit level-one heading. Discover has tab roles without the required tab-list parent. Icon-only / selected / busy states are not implemented uniformly.
- **Slow first visit.** The welcome screen loads the monolithic application and large avatar manifest. The local static server does not compress the export. Lighthouse flags 3,675 KiB transferred and about 942 KiB of unused initial JavaScript.
- **Challenge setup contradicts the intended constraint.** Practice lets the learner change the motion before the random stance roll. Remove this control as requested while preserving the motion and saved-session contracts.

### Medium impact

- The neutral palette is coherent but many screens have the same visual weight. Stronger primary-action hierarchy, a restrained accent, and more deliberate editorial typography can make it feel engaging without adding clutter.
- The avatar and daily routine already fit mobile well. Preserve them; improve progress, streak readability and completion feedback instead of rebuilding the product.
- Settings switches expose 40×20 targets; avatar collection controls can be only 41 px wide. Mind-map connection controls also need generous hit areas while keeping their small visible dots.
- Some copy still discusses garden resources or server implementation. README instructions describe several obsolete visible flows. Learners need short, action-oriented language; technical setup belongs in documentation.
- Busy, empty and failure states vary between spinners, plain text and custom cards. Shared states should give one next action and preserve drafts.
- Unrecognised URLs silently show Home; there is no intentional not-found experience. Browser titles remain “BridgingMinds” on every screen and metadata is minimal.
- Web emits a native-animation-driver warning from debate motion. Anonymous startup also performs an expected `/api/state` 401; do not hide real console errors to make an audit appear clean.

## Code problems

- Static colour/typography definitions cannot react to appearance changes. Repeated literal colour values are scattered outside artwork; drawing/illustration palettes should remain intentional asset colours.
- Duplicate `Action`, `Chip`, status and reward elements drift in padding, semantics and disabled behaviour.
- Oversized practice files mix presentation with persistence. Extract cohesive UI sections without rewriting the workflow state machines.
- The catch-all app shell eagerly imports nearly every screen, making welcome and simple routes pay for unrelated features.
- Legacy garden screens and API logic remain in source while `/garden` and `/homeland` currently resolve to Debate. Their data must not be deleted just because the current navigation no longer exposes those views.
- Old browser tests are not a reliable regression gate until their navigation/setup matches the current product. Preserve their domain assertions where still applicable and keep legacy data-contract checks.
- Silent optional-load failures need review individually: some are intentional non-blocking fallbacks, others need a retry message. Do not mechanically convert all catches into intrusive errors.

## Prioritised implementation plan

1. **Baseline checkpoint and regression harness.** Preserve screenshots and results; repair stale test setup/labels and add current-journey smoke coverage where old stories no longer reach the app. No business-rule changes.
2. **Shared visual foundation.** Introduce semantic light/dark tokens, appearance preference, readable type scales, spacing/radius scales, consistent buttons/inputs/cards/statuses, visible focus, landmarks and 44 px targets. Use existing DM Sans, Lora and Feather.
3. **Shell and key flows.** Improve onboarding / Home / navigation hierarchy, make practice motion fixed, retain all stance/timer/draft behaviour, simplify feedback presentation and show clear step progress.
4. **Secondary-screen consistency and cleanup.** Apply the same foundation to discovery, wardrobe, progress, food, achievements, vocabulary and settings. Extract large presentational sections; remove only demonstrably unused code and stale copy.
5. **Performance and tasteful feedback.** Split initial screen loading, compress static assets where appropriate, make font/image loading deliberate, reuse the existing reduced-motion-aware animation utilities for short transitions, progress and success feedback.
6. **Verification and readiness.** Re-run domain and browser gates, axe and Lighthouse; screenshot every main view at three widths in both themes; review edge cases and console output. Finish titles, metadata, friendly error/404 states, README/env/run/deploy documentation and a before/after changelog.

Each implementation step gets a small, reviewable commit. The visual direction keeps the warm paper / charcoal character, adds a restrained accent and a deliberate dark counterpart, and lets the learner’s avatar and progress provide the personality.

## Functional questions deliberately outside this refactor

- Do not alter reward amounts, streak rules, food/economy behaviour, assessment validity or provider fallback policy.
- Do not invent scores or sample voice availability when a provider is unavailable.
- Removing topic choice does not by itself randomise the topic. Preserve the existing assignment flow; a broader random-topic or age-banded content policy would be a separate gameplay decision.
- Do not resurrect or delete legacy garden data, change route alias semantics, or replace authentication just to satisfy old browser screenshots.
- The first anonymous auth check currently returns 401 by design. Changing the API contract solely to suppress that expected network entry is outside the visual scope.
