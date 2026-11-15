# Daily challenge UX

Updated 15 November 2026 on `person1`.

- Home offers two equal choices: Read aloud and Spin and reflect. Selecting either enrolls a new daily learner, then opens the selected activity. Enrollment failures leave both choices available for retry.
- Completion, XP, streak and timezone come from the saved daily-workout API state. The UI does not assign its own rewards or pretend an activity is complete.
- Phone layouts stack the choices; desktop layouts show them side by side. Speaking uses a wider desktop workspace with the prompt and current phase alongside the task.
- Reading separates the passage from self-review. Recording is optional, can be cancelled after permission denial, and saved observation drafts reopen in review.
- Speaking retains the timed board, recording, transcript recovery, feedback and optional guiding/script tools. Learners can finish directly from feedback.

## Verification

- `npx playwright test tests/daily-workout.spec.ts tests/daily-hub.spec.ts`: 7 passed against the exported web app and an isolated local API/database. Covers 360px and 1440px layouts, both activity orders, actual daily rewards, reload, recording storage/playback, denied microphone, lost submission response, and duplicate completion.
- `E2E_WEB_URL=http://localhost:8081 npx playwright test tests/person1-ui.spec.ts`: passed. Real local session/board/audio persistence; deterministic AI response fixtures cover feedback tabs and sample-script rendering.
- `node --test tests/daily-workout.test.mjs`: 11 passed, including reward idempotency, concurrency and timezone boundaries.
- TypeScript and Expo lint passed; the browser tests build the production web export.
- Screenshots were inspected on phone and desktop viewports. No physical iOS/Android device or paid live AI-provider test was performed in this UI change.
