# Daily speaking flow

Updated 15 November 2026 on `person1`.

The learner records a one-minute pitch, receives first-attempt feedback, chooses optional question practice and a sample script, then optionally saves vocabulary for Read Aloud.

## Behaviour

- New daily questions use recent headlines (up to seven days) from the existing allowlisted news feeds. The headline, publisher, date and source link are shown; this is headline-based discussion, not an invented article summary.
- Stories in the curated Read & Reflect catalogue and stories already assigned to that learner are excluded by source URL, headline or ID. Concurrent requests and retries respect the same reservations. If no unused recent story is available, the UI offers retry instead of recycling a question.
- Planning lasts 60 seconds; speaking remains 60 seconds. Existing in-progress boards keep their original expiry.

- Feedback appears before optional practice. The original evaluation and rewards remain unchanged by follow-up answers or vocabulary selection.
- A vertical BRIDGE summary shows every criterion in a compact card without tapping, with short explanations and labelled What worked / Try next feedback: Big Idea, Reasons, Illustrations, Different Perspectives, Glue and Expression. Unassessed criteria are explicitly labelled, not displayed as low scores.
- Each guiding answer is checked against its specific question. The result distinguishes answered, partly answered and not answered, with an explanation and next step. Users can record or type, retry failed checks, or skip.
- Viewing a sample is a separate choice. The sample uses the original pitch and any follow-up answers, preserving the learner's meaning.
- Samples can introduce zero to three words from the approved vocabulary catalogue. Exact occurrences are highlighted, with catalogue definitions. Words already saved or used by the learner are excluded.
- Viewing feedback or a daily sample does not automatically add words. Only selected words are saved; duplicate saves are idempotent, and selection is checked against the server's saved sample.
- Saved words use the existing Read Aloud scheduling system. An already assigned passage stays stable; words enter a future eligible assignment.
- Optional stages never award additional completion XP. Users can skip either stage and complete the challenge.
- An invalid optional thought map is omitted if the remaining first-attempt evaluation independently passes validation. Evidence and rubric validation remain strict.

## Presentation

The news entry screen includes an animated wheel for drawing another headline before brainstorming. Each spin creates a fresh news session using the existing cross-activity exclusions. A failed request retains the current question and reuses its request key on retry; a successful draw persists in the local draft. Spinning is unavailable once a board or response exists, so existing work cannot be attached to another topic. The wheel respects reduced-motion preferences and uses outline icons without emoji. `tests/news-wheel.spec.ts` checks real session selection, failure/retry, reload, the selected board, and phone/desktop layouts.

Shared sans-serif headings, warm ivory backgrounds, cream bordered cards and charcoal primary actions establish a consistent visual style. Buttons use 10px corners; feedback tabs use beige selected states and softly rectangular shapes matching the supplied reference. Secondary actions are quiet text. Feedback opens with two concise points; the thought map and guiding-answer details are collapsed. Recording and typing use separate views. The back button returns to first-attempt feedback.

## Verification

- Focused backend checks: guided response, guiding-answer evidence, selected-word ownership and idempotency, Read Aloud inclusion, BRIDGE validation, vocabulary scheduling and daily reward tests passed.
- Live OpenAI check using synthetic content: first-attempt feedback returned `openai`, an invalid optional map was omitted, a guiding answer was assessed, and a sample contained one highlighted catalogue word.
- TypeScript and Expo lint passed during implementation.
- Full API suite also contains older daily-text-submission fixtures that now fail the existing recording-only requirement. That requirement predates this change. These failures are not a claim that the full suite passes.
- `E2E_WEB_URL=http://localhost:8081 npx playwright test tests/person1-ui.spec.ts` passed. Browser UI fixtures exercise skip paths, guiding-answer feedback, selected vocabulary, reload and reward rendering. Phone and desktop screenshots were inspected. Audio-output activation is isolated from host hardware; real metering has a separate browser test. No physical phone verification was performed.

Read Aloud now uses direct audio evaluation: record, listen back, then **Done**. Written self-review is optional and separate. The five speech criteria and software verification are documented in [reading-evaluation.md](reading-evaluation.md).
