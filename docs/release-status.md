# Current release status

## Vercel deployment — 12 November 2026

Deployed and promoted production deployment `dpl_5fUL4taViifbHKTVGchNeEupDXHd` to https://bridgingminds-tau.vercel.app/. Verified the existing `bridgingminds` project and owning team after renewed CLI sign-in. All seven database migrations are applied; five additive migrations were applied for this release. Vercel's remote build succeeded, and the API function runs in Singapore (`sin1`). Fresh lint and TypeScript checks passed.

The production domain serves the homepage and `/api/health` publicly with HTTP 200. Health reports `ok: true`, Supabase audio storage, and valid configured OpenAI settings. Live provider evaluation remains unverified; these smoke checks do not establish speech-scoring validity, device recording behavior, or production decoder availability. The separate Vercel team alias retains deployment protection.

Live Chrome verification at a 390 × 844 mobile viewport passed guest creation, onboarding, authenticated `/api/state`, persisted onboarding after reload, and navigation to Spin & Speak. No JavaScript runtime errors occurred and document width stayed within the viewport. The signed-out state request correctly returned 401 before guest creation. The practice screen was captured and visually reviewed. The isolated release-check guest account was deleted successfully through `/api/account` (HTTP 200). No model evaluation or acoustic provider call was made in this smoke check.

The implemented local flows are reviewable and tested. The complete master roadmap is **not finished**, and this is **not a production approval**.

Implemented: the opt-in two-activity daily loop, idempotent XP/streak/cosmetic rewards, private reading self-review and recordings, BRIDGE feedback and Thought Maps, integrated WordBloom, optional acoustic processing with real media decoding, provisional pronunciation review scheduling, daily speaking access independent of optional quota, and evidence-backed practice recommendations with user controls.

Verification baseline: 303 backend tests passed; 3 optional live-cloud checks skipped. The 33-case local browser suite and 16-case simulated-provider browser suite passed. Provider values in those tests are synthetic; real decoding does not validate speech/model judgments. Lint and TypeScript checks passed. The final dismissal-message change received nine focused learner tests and a fresh web rebuild; the targeted recommendation/pause/dismiss/import browser journey then passed against that rebuilt export (1/1). Test servers closed normally.

Required before claiming a hosted/native release: apply and verify all additive database migrations, validate storage/RLS and actual hosted behavior, provision and verify the backend decoder, verify actual iOS/Android recording behavior, and test the configured live providers with approved credentials/usage. None of those live deployment/device gates is implied by local test results.

Required to finish the full product reference: human calibration/helpfulness studies, independent transfer assessment and mastery-driven garden growth, broader graded exercise content and adaptive difficulty, complete optional-mode BRIDGE rollout, advanced coaching/social features, institution privacy/roles and real billing/entitlements. Existing implemented optional modes remain available; this report does not describe unfinished roadmap features as functioning products.

Primary references: `docs/build-alignment.md`, `docs/learner-profile.md`, `docs/daily-access.md`, `docs/speech-assessment.md`, `docs/wordbloom-pronunciation.md` and the preserved master build reference.

## Native JavaScript export gate

A fresh SDK 57 export passed for both platforms with:

```sh
npx expo export --platform ios --platform android --output-dir dist-native --clear
```

Both generated Hermes bundles exist; all 28 iOS and 32 Android asset references were checked on disk. Lint and TypeScript checks passed again. This verifies native JavaScript resolution/compilation and exported assets, not an installed iOS/Android binary, device permissions, microphone behavior or a store submission. No generated ios/ or android/ native projects were created, and no EAS build/deployment was started.

## Expo compatibility follow-up

Expo's current SDK 57 compatibility check found five patch mismatches. `npx expo install --fix` updated the lockfile and manifest to the recommended Expo 57.0.32, expo-asset 57.0.21, expo-constants 57.0.23, expo-router 57.0.30 and expo-sharing 57.0.25. This stays within SDK 57; no generated native projects were edited.

`npx expo install --check` now passes. `npx expo-doctor` passes 20/21 checks; its remaining failure is the host's Xcode 16.2.0 versus the SDK's required >=26.4.0. That check has not been suppressed. Updating the system toolchain was not attempted. Local native binary builds need compatible Xcode, or a separately configured compatible EAS/cloud build environment.

Fresh patched web, iOS Hermes and Android Hermes exports passed. Both native bundles and all 28 iOS/32 Android assets were verified. TypeScript and lint passed. Browser regression results for this patch follow below; no paid provider call or deployment was made.

Post-patch browser verification passed: **33 local cases + 16 simulated-provider cases with real media decoding + 1 hosted-style daily-access case = 50 browser checks**. The test servers closed normally. The remaining Expo Doctor result is still 20/21 due to the host Xcode mismatch; no device, signed-binary, cloud-deployment or live-model validity claim follows from these passes.
