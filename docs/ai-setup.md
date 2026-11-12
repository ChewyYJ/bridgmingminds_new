# Optional AI setup

MindGarden works locally without credentials. One **server-side OpenAI API key** enables provisional rubric feedback, the AI debate challenger and automatic transcription. No other service, client key or deployment is needed for this local setup.

## Set up once

1. If `.env.local` does not exist, copy `.env.example` to `.env.local`. Keep an existing file and its settings.
2. Set `OPENAI_API_KEY` in that file, using a project API key from your OpenAI account. Do not paste it into chat, a screenshot, source code or an `EXPO_PUBLIC_*` variable. The key's project needs API billing/credits and permission to use the selected models and endpoints.
3. Run `npm run ai:check`, then `npm run ai:smoke`.
4. Restart the API using your normal `npm run dev` or `npm start` command. Stop the previous API process first; use one process per database. A client rebuild is unnecessary for server-only settings.

The only required setting is:

```dotenv
OPENAI_API_KEY=
```

Enter your key after `=` locally. With no model override, the server uses `gpt-6-luna` for feedback/debate and `gpt-transcribe` for recordings. If your existing `.env.local` still names older models, remove those two overrides to use these defaults, or update them explicitly:

```dotenv
OPENAI_MODEL=gpt-6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe
```

The server snapshots configuration at startup. An empty key selects local coaching and manual transcription. A configured but invalid key does **not** silently replace failed AI requests with local feedback: your answer/argument/recording remains saved with a useful error.

## What the checks establish

`npm run ai:check` reads local server configuration and prints only non-secret status. It checks Node.js 24+, placeholder/whitespace mistakes, supported model request profiles and an accidentally public OpenAI key setting. It makes **zero network requests**. `mode: openai` means configured, not authenticated or proven available; `liveVerified` remains `false`. Invalid configuration exits with status 1. Valid local mode exits with status 0.

`npm run ai:smoke` exercises the real API/evaluator paths against mocked OpenAI responses, including all three assessment modes, debate turns, owned-recording transcription, strict output validation, saved failures and retry recovery. It uses fake credentials and temporary databases, never your garden. Outbound provider calls are intercepted; only temporary loopback API requests use sockets. It does not load `.env.local` or inherit provider credentials. Neither command has a live/paid-call flag.

The non-secret `/api/health` response exposes the same `ai` status (`mode`, `configured`, `configValid`, `liveVerified`, allowlisted model names, warnings and issues). Health and startup do not probe OpenAI. Resuming an already-queued evaluation after restart is normal app work and can make a provider request when a key is configured.

## First live check, when you choose

Once you intentionally use an AI feature, OpenAI usage may be billed. Use a short, non-sensitive sample: submit a written answer for feedback; send one AI-debate turn; then record a short spoken sentence and choose transcription. Review the returned transcript before submitting it. These are three distinct provider paths; one succeeding does not prove the others are available.

Offline passes do not establish account access, billing, response latency, microphone/device behavior or scoring accuracy. A bounded synthetic live feedback check was used on 2026-10-31 to diagnose model-generated quote offsets; it does not establish transcription/debate availability or scoring accuracy. No automatic live smoke test runs on startup, health checks or these commands.

## Troubleshooting

| Message                                 | Action                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration needs attention           | Run `npm run ai:check`; correct the named variable and restart the API. Diagnostics never repeat the value.                                               |
| Server key rejected (401)               | Check the key is active and belongs to the intended API project, then restart.                                                                            |
| Access denied (403)                     | Check project permissions, network restrictions and regional availability.                                                                                |
| Model unavailable                       | Check that the project can use that model; use a supported override below if needed, then restart.                                                        |
| Credits/spending limits                 | Check API billing and project limits; a ChatGPT subscription alone does not establish this project's available API credits.                               |
| Rate limited (429)                      | Wait before retrying; inspect project limits if it persists.                                                                                              |
| Timeout/connection/provider unavailable | Check connectivity or wait, then retry the saved work. A timeout can have already consumed provider usage.                                                |
| Unreadable/invalid assessment           | Retry the saved answer. Schema and exact-quote failures are rejected before rewards or feedback commit.                                                   |
| Recording rejected (400)                | Record again using a supported format; the app sends a filename with a format extension and keeps uploads under 10 MB. You can type a transcript instead. |

Requests have bounded timeouts and no automatic retry loop. An evaluation allows at most five failed provider requests; changing models, credentials or restarting does not reset that budget. Configuration errors caught before transport do not consume it. Correct setup before retrying. After the provider budget is exhausted, the response remains saved; explicitly clearing the key and restarting permits local coaching without another provider call. Accepted debate turns and completed evaluations are idempotent; repeating a saved successful action does not issue another provider call.

A late transcription cannot replace a newer edit or completed assessment. If another tab/device changed the answer while transcription was running, the app retains the newer work and asks you to reload it.

## Supported profiles and official references

Request compatibility was checked against official OpenAI documentation on **2026-10-30**. Model access is specific to the configured account and can change.

- Text: `gpt-6-luna` (default) or `gpt-6-sol`. The server uses Chat Completions with `reasoning_effort: none`, `max_completion_tokens` and a bounded temperature. This matches the [GPT-6 parameter guidance](https://developers.openai.com/api/docs/guides/latest-model) and [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). This choice is an implementation profile, not evidence of scoring validity.
- Transcription: `gpt-transcribe` (default). The existing multipart `/v1/audio/transcriptions` path returns JSON containing `text`, matching the [file-transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text).
- Legacy text overrides: `gpt-4.1-mini`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1`, `gpt-4.1-2025-04-14`, `gpt-4o-mini`, `gpt-4o-mini-2024-07-18`. Their request profile omits `reasoning_effort`. Announced shutdown: **2027-01-14**.
- Legacy transcription overrides: `gpt-4o-mini-transcribe`, `gpt-4o-mini-transcribe-2025-12-15`, `gpt-4o-transcribe`, `whisper-1`. Announced shutdown: **2027-02-26**. See the official [deprecation schedule](https://developers.openai.com/api/docs/deprecations).

Other IDs are rejected before a provider request because their endpoint/parameter combination has not been configured here. Adding a new model requires reviewing its documentation and request-profile tests, not guessing parameters. Error categories follow [OpenAI's API error guide](https://developers.openai.com/api/docs/guides/error-codes); raw upstream errors and credentials are never displayed.

Assessment uses [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) plus server-side schema and exact-quote validation. The model returns verbatim quotes, and the server derives their offsets from the saved answer. Neither schema adherence nor a quote's existence establishes semantic correctness. Rejected assessments log only a fixed diagnostic reason and job ID, never the answer or provider body. The research-informed rubrics and provisional LLM levels remain unvalidated. Delivery stays N/A: transcription does not assess vocal pacing, clarity or accent. See [the assessment contract](grow-rubric.md) and [research notes](research/mindgarden-evaluation-framework.md).

Submitted answers and relevant prompt/summary/bounded debate context go to OpenAI for feedback. Transcription sends the selected recording. Keep provider retention and account policies in mind; local account deletion cannot remove external copies. Restore fully local operation by clearing `OPENAI_API_KEY` and restarting the server.
