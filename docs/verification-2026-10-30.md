# Local app verification — 30–31 October 2026

## Scope

This pass sharpens the local MVP around a small routine: explore an idea, express a view, review the saved answer, revise it, and grow a garden through participation. The [competitive review](research/competitive-positioning.md) compares seven adjacent products using official sources. The [assessment review](research/mindgarden-evaluation-framework.md) explains the original mode-specific rubrics and the human validation work still required.

Implemented: a specific first-practice invitation, exact earlier/current response comparison with reload recovery, deliberate feedback-to-garden navigation, finite button/feedback/plant animations, live system and saved reduced-motion preferences, accessible selected onboarding options, and a non-secret AI setup status. Debate retries now start from the most recent revision. Late transcription cannot overwrite newer edits or completed feedback. Preflight AI configuration errors do not consume the provider retry budget.

## Verification record

- `npm run lint` and `npm run typecheck`: passed.
- `npm run test:api`: **109/109 passed** after the final backend and dependency changes. These include all three assessment contexts, output/evidence validation, idempotent resources, garden lifecycle, private/shared audio, account isolation/deletion, RSS handling, retry recovery and transcription races.
- `npm run test:e2e:ai`: **3/3 passed**. Actual browser, API and temporary SQLite storage with an offline simulated provider; failure recovery without duplicate rewards, reading and debate context, transcription correction and private playback. No paid provider requests.
- Full local browser suite: **22/22 passed** after SDK alignment, against a separate test database on port 3002. It covers onboarding/account synchronization, all practice modes and drafts, both linked revision flows, comparison fetch recovery, deliberate garden navigation, private audio and permission failure, two-person text/voice debate, news refresh/day boundaries, mouse/touch placement and drawing, watering/archive/replant, foreground refresh, and live/persisted reduced motion. A subsequent mobile comparison-layout correction was rechecked with **2/2 targeted product flows** on the final export, including assertions that both full texts fit their colored panels and the disclosure.
- `npm run ai:smoke`: **31/31 passed**, offline. This overlaps the API suite; it is not 31 additional independent tests.
- Web export passed; final bundle is `entry-e9059ce1b46fb0d339bbe3f95113ed3f.js`.
- iOS and Android Hermes exports passed. These are JavaScript/package checks, not device or signed-binary tests.
- `npx expo install --check`: passed after SDK 57 patch alignment.
- `npx expo-doctor`: **20/21 passed**. The remaining host-tooling check is Xcode 16.2 versus SDK 57's required 26.4+. It does not block the local web app; native builds need EAS or compatible tooling. No native folders were generated or edited.
- `npm run ai:check`: valid local mode, no configured key, zero network requests. A blank `.env.local` template was created without overwriting an existing configuration.

Browser screenshots were reviewed for Home and feedback, with comparison views captured at desktop and phone widths. Tests assert no overflow for the phone comparison and exercise its keyboard controls. An additional phone browser smoke check passed welcome/onboarding selected semantics, the first idea, Settings AI-status refresh and invalid-mode recovery with no runtime errors. Screenshots are in `docs/screenshots/`.

The real local app was restarted on **http://localhost:3001**. Its public health reports valid local mode with no key; its HTML and referenced final bundle both return HTTP 200. User data was not used for tests. Test servers are stopped after verification.

## Dependency review

Expo, Router, Linking, Sharing and the installed SDK support packages were aligned through `expo install --fix`. Express's compatible transitive `body-parser` was updated to **2.4.0**, with `qs` **6.17.1**, addressing the directly exposed compressed-request parser issue without changing the SDK major.

The remaining audit findings include Expo CLI/config dependencies and Expo Router's older URI decoder. Initial exported-web requests have a server malformed-URL guard; this does not establish protection for native deep links. SDK-compatible upstream remediation and native deep-link testing remain public-release work. Do not apply the audit tool's suggested Expo downgrade or cross-SDK Router upgrade blindly. Reviewed advisories: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [URI decoder](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), [CLI Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

## What remains external

For this local app, enter the server API key and restart as described in [AI setup](ai-setup.md). Real account access, billing, latency and actual model outputs were not tested. Passing a mock transport cannot establish those properties. The model's ratings remain provisional; an independent human benchmark is required before claiming accurate measurement. Native microphone/accessibility testing, public hosting, account recovery and production operations are separate release tasks documented in the README.
