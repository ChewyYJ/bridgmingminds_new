# Real speech-media verification — 12 November 2026

The decoder now passes **eight real-media/API integration checks** using FFmpeg 7.1, plus the portable adapter/job/privacy suite. This verifies decoding and persistence with synthetic audio. It does not verify Azure assessment accuracy or learning outcomes.

## Problem found and fixed

The first actual-media run passed six format/duration checks but failed native-style, non-fragmented AAC/M4A whose `moov` metadata follows the audio data. The pipe-based decoder produced no usable PCM for that file. Native recording support could not be claimed from fragmented MP4 or mock-decoder tests.

MP4/M4A conversion now uses a seekable input copy in a unique owner-only scratch directory. The directory is 0700, the file is 0600, and no shell is invoked. Remote protocols and external MOV track references are disabled. Copies are removed after success, decoder failure, timeout and cancellation. Maintenance and subsequent conversions remove abandoned decode directories older than one hour, preserving recent jobs and unrelated files. A symlink scratch root is rejected. WAV fast-path decoding now also respects cancellation before parsing.

## Evidence

`npm run test:api`: **279 passed; 3 optional live-cloud checks skipped**. The additional portable checks verify private scratch permissions, all terminal cleanup paths, crash-copy recovery, preservation of unrelated files, symlink rejection and cancellation. TypeScript and Expo lint passed.

`npm run test:speech-media`: **8 passed**, with a real executable supplied through `FFMPEG_PATH`:

- WebM/Opus, Ogg/Opus, MP3 and fragmented MP4/AAC: real stereo 48kHz fixture encoding and conversion to non-empty mono 16kHz PCM.
- Ordinary M4A/AAC: a 12-second file with metadata at the end, matching the seekability issue possible in native recordings.
- Stereo WAV resampling and corrupt-media rejection.
- Overlong compressed audio rejected instead of silently truncated.
- Real private M4A upload → persisted Read Aloud self-review → leased speech job → actual decoding → explicitly synthetic assessment result → persisted feedback. Exactly 10 reading XP; one provider-fixture call; no leftover scratch file.

The full 14-case provider browser regression passed with `E2E_REAL_SPEECH_MEDIA=1`, including the acoustic case: Chrome microphone fixture → actual browser recording/upload → real FFmpeg conversion → deliberate offline provider outage → explicit retry → word feedback/private timed playback → reload. The provider remains an offline fixture, and no real learner speech or paid service is used. Current screenshots in `screenshots/speech/` come from that path.

## Reproduction and deployment boundary

Install FFmpeg on the test host and run:

```sh
FFMPEG_PATH=/absolute/path/to/ffmpeg npm run test:speech-media
FFMPEG_PATH=/absolute/path/to/ffmpeg E2E_REAL_SPEECH_MEDIA=1 npm run test:e2e:ai
```

Build the web export first with `npm run build:web` when frontend sources change. The provider browser suite deliberately uses that existing export. The media gate fails when FFmpeg is missing; it is separate from the portable backend suite.

The Homebrew download failed on this machine because `ghcr.io` did not resolve. For local QA, an isolated `imageio-ffmpeg` 0.6.0 wheel supplied `ffmpeg-macos-aarch64-v7.1` in a temporary tools directory. The wheel and binary are not app dependencies or a production deployment. `FFMPEG_PATH` and optional private `SPEECH_TMP_DIR` must be configured on each backend host. Neither an Azure key nor the JavaScript SDK supplies FFmpeg.

Still unverified: actual iOS/Android microphone recordings and interruptions, deployed Linux/serverless binary packaging and permissions, live Azure behavior/accuracy/latency, relevant accent/locale calibration, and the remaining product roadmap. No hosted migration or deployment was performed.
