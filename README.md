# Whisperflow Local

A self-contained desktop dictation app with a minimalist dark interface, glowing microphone state, audio meter, periodic transcription previews, and searchable local history. Independent implementation; no proprietary source or exact reference UI was supplied.

**No API key. No paid API. All speech recognition runs on the CPU using downloaded Whisper weights.** The running app blocks HTTP(S)/WebSocket requests in Electron; the speech worker disables remote model loading and rejects fetch. Setup downloads public packages and model files, never sends recordings. Once installed, disconnect the internet and use it normally.

## Run the Windows app

Download the portable `.exe` from this repository's **Releases** page and run it. The executable includes the runtime and model. No browser, Node.js, Python, account, or internet connection is needed for transcription. To share with a friend, send them the downloaded `.exe`; they do not need access to this private source repository.

## Run from source

Install Node.js 24 LTS or later. Clone the repository and run these commands once while online:

```powershell
git clone https://github.com/dhruvmx/whisperflow-local.git
cd whisperflow-local
npm ci
npm run setup:model
npm start
```

`npm ci` installs pinned dependencies from package-lock.json. Setup downloads roughly 44 MB of model/configuration files. It pins a model revision and records SHA-256 hashes in models/manifest.json, verifies existing files, writes downloads to .part files, and can be rerun after an interruption. No account is needed. Windows x64 is the primary target. No Python, CUDA, compiler, separate server, or API subscription is required.

## Use it

1. Wait for “Ready when you are.” Model initialization runs in a background worker.
2. Click the microphone or press **Ctrl + Shift + Space** to start/stop. The shortcut works while another app has focus and shows the dictation window. It does not inject text into other apps.
3. Speak in English. Previews update when each 15-second window finishes processing. CPU speed determines the delay. A one-second overlap and text-boundary matching reduce repeated or lost words; this is not token streaming.
4. Stop to process the last segment and save the combined text to local history. Recordings stop automatically at five minutes. The mic is released immediately; processing may continue.
5. Copy, export as .txt, or open History to search, copy, export, and delete saved transcriptions. The preview is editable after recording; edits are kept through copy/export, and do not modify the original history entry.

The app never requests the microphone until you press Record. If access is denied, enable **Windows Settings → Privacy & security → Microphone → Microphone access / Let desktop apps access your microphone**. Other apps may hold exclusive access to a device. A failed save keeps the transcript visible and offers a retry. Closing during recording or transcription asks before discarding unsaved work.

## Build a portable desktop executable

```powershell
npm run dist
```

This bundles Electron, JavaScript, native CPU inference libraries, and the model into a portable Windows executable under `release/`. First-time packaging may download public build tools. The resulting executable needs neither Node nor an internet connection on the target Windows x64 computer. An unsigned local build may trigger Windows SmartScreen. `npm run pack` builds an unpacked app folder for inspection. Other operating-system targets need matching platform builds and microphone entitlements; those are not validated here.

The included GitHub Actions workflow builds on a standard Windows runner, tests the local engine and desktop flow, and publishes the executable and its SHA-256 checksum as a private release. Source changes on `main` trigger a build; it can also be started manually from Actions. No OpenAI API credentials are used in the build or the app.

## Step-by-step implementation map

1. **Desktop boundary** — electron/main.cjs creates a sandboxed renderer with context isolation, validates the sender of every IPC request, limits permissions to audio, blocks remote requests and navigation, registers the global shortcut, and chooses the OS data directory. electron/preload.cjs exposes only specific operations.
2. **Frontend** — src/index.html and styles.css define the interface without external fonts, assets, or CDNs. src/app.js connects buttons, state, processing queue, preview, history, clipboard, export, and errors. src/state.js is the small observable state store.
3. **Audio** — src/audio/recorder.js requests getUserMedia audio, creates a 16 kHz AudioContext, collects mono PCM via capture-worklet.js, updates the meter, and emits 15-second windows with one-second overlap. A muted output keeps capture active without playing your microphone. Stop flushes the last worklet block and releases all devices and audio nodes.
4. **Local inference** — electron/transcriber.cjs owns a dedicated Node worker with request IDs, bounded single-job dispatch, lifecycle rejection and timeout handling. transcription-worker.mjs loads Transformers.js with local_files_only, q8 weights and the CPU provider. The UI remains responsive while ONNX runs. shared/audio.mjs validates audio and merges preview boundaries. A conservative RMS gate skips near-silent segments.
5. **Persistence** — electron/history.cjs serializes mutations and writes history.json via a temporary file and atomic rename. Entries have UUID, UTC timestamp, duration, text, and model identity. Malformed history produces an error without overwriting the original. Audio is held only in RAM and discarded after each recording. History is ordinary plaintext JSON, not encrypted.
6. **Offline distribution** — scripts/download-model.mjs downloads the model during setup, separately from the app. The test-audio downloader is development-only. verify-model.mjs checks hashes before packaging; electron-builder copies model assets alongside the application resources and unpacks native libraries.

```text
whisperflow-local/
  electron/                  Main process, IPC, history, speech worker
  src/
    audio/                   Recorder and AudioWorklet
    app.js                   UI orchestration
    state.js                 Global state
    index.html, styles.css   Interface
  shared/audio.mjs           Constants, validation, overlap merging
  models/                    Local weights and integrity manifest
  scripts/                   Setup, validation, integration checks
  tests/                     Audio and persistence tests
  package.json
  package-lock.json
  .github/workflows/         Windows tests, packaging and release publication
  RELEASE_NOTES.md            Sharing and launch instructions
  THIRD_PARTY.md, LICENSE
```

## Storage and logging

Electron uses the current account's application data folder, normally `%APPDATA%\Whisperflow Local\history.json` on Windows. Portable Electron may use its executable-derived application data name; inspect the OS application data folder if necessary. Each entry is a local transcription log. There is no remote logging or telemetry in this app. Console diagnostics contain startup/engine errors rather than audio recordings. Back up history.json to preserve history; delete entries through the app. Deletion is ordinary file replacement, not secure forensic erasure.

## Verify locally

```powershell
npm test
node scripts/verify-model.mjs
npm run test:engine -- "C:\path\to\speech-16khz-mono-pcm16.wav"
npm run test:desktop
```

For a full automated mic-to-history check, supply the same WAV to `npm run test:desktop -- "C:\path\to\speech.wav"`. The desktop test uses a synthetic microphone feed and a separate local test profile. It expects the standard JFK example speech for its content assertion. It also tests clipboard, search, disk persistence, reload, isolation and a blocked network request. A physical microphone still needs a manual check on your device.

## Scope and limits

- English-only tiny.en prioritizes small downloads and CPU speed. Accents, noise, music and proper nouns affect accuracy. Whisper may hallucinate speech in nonspeech audio; the simple silence gate is not a full voice-activity detector.
- Segment previews may revise or repeat words near boundaries. This implementation uses text overlap matching rather than a full streaming decoder. Repeated intentional phrases can occasionally be merged.
- Five-minute recording cap bounds memory; processing queues can lag on slow CPUs. Do not close the app while processing if you want the complete result.
- No cloud rewriting, login, automatic punctuation cleanup model, auto-paste, or proprietary Whisperflow integrations are implemented. Whisper itself generally supplies punctuation.
- Read THIRD_PARTY.md before redistributing. The local open-source Whisper model was originally developed by OpenAI; using its weights offline does not use OpenAI API credits.

Implementation references: [Transformers.js local models](https://huggingface.co/docs/transformers.js/custom_usage), [Whisper ONNX assets](https://huggingface.co/onnx-community/whisper-tiny.en/tree/main), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
