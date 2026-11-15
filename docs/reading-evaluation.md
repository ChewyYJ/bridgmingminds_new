# Read Aloud evaluation

The reference design separates Read Aloud speech evaluation from Spin & Speak’s BRIDGE reasoning framework. The runtime criteria in `shared/reading-rubric.mjs` are pronunciation, fluency and pace, intonation, word stress, and completeness.

## Evidence and limits

The [Council of Europe’s phonological competence framework](https://www.coe.int/en/web/common-european-framework-reference-languages/phonological-competence) emphasises intelligibility, articulation and prosody rather than matching a native accent. This app’s five-criterion adaptation is formative coaching, not a calibrated CEFR level or validated test. Completeness is an additional reading-task check, not an official CEFR subscale.

`server/openai-reading.mjs` sends the actual recording, converted to bounded 16 kHz mono WAV, to an audio-input model (`gpt-audio-1.5` by default). The [documented Chat Completions audio-input API](https://developers.openai.com/api/docs/guides/audio-chat-completions) supports this direct listening path. A text-only model never supplies pronunciation or intonation feedback. Requests use `store: false`, bounded output and timeouts, the existing private-audio ownership/retention checks and provider usage limits.

The model supplies five short qualitative observations, next steps, an audible transcript and approximate audio evidence intervals. Schema validation rejects unknown fields, duplicate/missing criteria and fabricated numeric scores. Out-of-bounds evidence makes that criterion unassessed; an unverifiable reference quotation is omitted. Quiet or non-speech recordings do not produce positive feedback or completion XP. The model’s listening judgments remain unvalidated and can be wrong; users can replay their own recording and inspect approximate examples.

Pace is a **words-per-minute estimate**, calculated from transcript tokens divided by the span between the first and last detected sound activity. Quiet-pause counts use a bounded RMS threshold, not a validated hesitation detector. Passage coverage uses ordered transcript/reference token alignment, accepting a small documented set of common UK/US spelling variants. It is not a pronunciation score or definitive proof of skipped words. No universal ideal speaking-rate cutoff is imposed. All five dimensions remain visible even when a sample is insufficient.

## Done and persistence

The default flow is passage → record → playback review → **Done** → analysis → feedback. No written observation, self-rating or self-review checkbox is required. The review screen explains that Done sends the private audio to the configured speech service. The submit request explicitly includes processing consent.

The server atomically persists the recording attempt and queues its speech job. Retrying the same request returns the same attempt/job. Saved jobs and results restore after reload. Completion XP is granted only after usable assessed speech, exactly once on the original receipt day. Failed or silent audio can be retried and does not count as completed. The separate “Practise without recording” path remains explicitly labelled self-review and cannot claim AI speech assessment.

OpenAI qualitative results do not enter the Azure-specific pronunciation/WordBloom mastery pipeline. Existing Azure results remain readable, and the tested legacy provider path retains its own numeric observations and consent rules.

## UI

The display name is **BridgingMinds** and the former Garden tab is **Homeland**. Native bundle IDs, saved-data keys and the existing route remain stable so the rename does not disconnect users from saved work.

Home puts the current day streak in a larger top-right card with an outline flame icon, a warm gold accent and a clear secured/start status. It uses the existing streak data; no streak rules or rewards change. Zero and active streak states were checked at 320, 390 and 1440 px without overflow.

Read Aloud and BRIDGE use the shared warm ivory, beige and charcoal theme, consistent rectangular buttons, compact cards, readable type and visible focus/disabled states. Reading feedback provides a short summary, one next step, pace/matching estimates, all five criteria, recording playback, and optional transcript/research details. Shared button wrapping, touch target size, card spacing and tags improve the other screens as well.

## Verification

Backend tests: `tests/reading-evaluation.test.mjs`, `tests/reading-speech-flow.test.mjs`, `tests/speech-assessment.test.mjs`, and `tests/daily-workout.test.mjs`. These cover the five criteria, actual WAV request construction, silence, malformed/unverifiable outputs, explicit processing consent, atomic Done submission, retries, restoration, ownership, receipt dates and duplicate rewards. Synthetic provider fixtures test software contracts, not speech accuracy.

31 focused backend checks and eight real-media decoding checks pass. A live browser check recorded computer-generated reading through MediaRecorder, uploaded and decoded the audio, obtained all five criteria from OpenAI, awarded 10 XP once, restored the result after reload and played the saved recording. Separate UI checks cover the compact paused recorder, enabled Done without observations, mobile/desktop criteria cards, and the full Spin & Speak feedback/guiding-question/vocabulary flow. Seven primary routes were checked at 390 px and 1440 px with no page errors or horizontal overflow. Native-device microphone and live-population accuracy are not established by desktop browser tests.
