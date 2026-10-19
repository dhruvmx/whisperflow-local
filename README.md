# Whisperflow Local

Private Windows desktop dictation with **hold-to-talk**, a small recording capsule, automatic paste, and the larger **Whisper small q8** model. All audio processing runs on your CPU. No account, API key, paid API or internet connection is required at runtime.

## Download and use

Download the `.exe` asset from [Releases](https://github.com/dhruvmx/whisperflow-local/releases/latest) and run it. The runtime and model are included. First launch extracts the bundled application. This is a Windows 10/11 x64 build. The executable is unsigned.

1. Wait until the small capsule says **Ready**.
2. Click inside the chat box or document where you want your words.
3. **Hold Right Ctrl**, speak, then release it. Recording only runs while you hold the key. The capsule changes from **Listening** to **Transcribing**.
4. Leave your destination field focused. Your text is pasted there when transcription finishes. The app does not press Enter or submit your message.
5. Alternatively use **Ctrl + Shift + Space** once to start and once to finish. The capsule's microphone button also toggles recording without activating the main window.

The main window's Record button records a local note. Closing the main window stops any active recording and hides it to the tray without confirmation prompts. Right-click the tray icon to open history, show/hide the indicator, or **Quit Whisperflow Local**. Quitting during recording finishes and saves the current recording first. The app never opens the history window when you start/stop via a shortcut.

The system microphone permission still applies. If recording fails, check Windows Settings → Privacy & security → Microphone → Let desktop apps access your microphone.

## Accuracy and performance

Version 1.1 replaces tiny.en with **Whisper small**, a substantially larger model (about 250 MB of q8 weights). It generally recognizes speech better but takes more RAM and CPU time. This build transcribes English. Accents, noise, poor microphones, music and proper nouns can still affect accuracy; model size does not guarantee every word is correct.

The app captures mono 16 kHz audio only during an active recording. Fifteen-second segments with a one-second overlap provide periodic previews. On release/stop, the remaining audio is processed and the final combined text is saved and pasted. Recordings are limited to five minutes. Speech recognition is not instantaneous and continues processing after you release the recording key; the microphone is released immediately.

## Automatic paste behavior

The app captures the active Windows window/native control when dictation starts and keeps the main UI hidden. Once processing completes, it puts the text on the clipboard and sends Ctrl+V only if that target is still focused and all shortcut modifiers are released. It never injects Enter. The original clipboard contents are replaced by your transcript.

If you switch to another window or Windows blocks input to an elevated application, the capsule explains that the text was copied; use Ctrl+V manually. History retains the transcript. Some applications use a single native control for multiple internal fields, so keep the intended field focused until the paste finishes. Windows cannot always confirm whether a destination application accepted a paste. No application is elevated automatically.

## Local history and privacy

History is saved as plaintext JSON in the current account's Electron application-data directory, normally `%APPDATA%\Whisperflow Local\history.json`. Existing history from earlier releases is retained. Search, copy, export and deletion are available from the history window. Edited previews are archived automatically when starting another recording, rather than showing a confirmation dialog. Audio is held in memory and discarded after transcription.

There is no remote telemetry in this application. Runtime HTTP(S)/WebSocket requests are blocked in Electron and remote model loading/fetch are disabled in the speech worker. The native integration checks only the Right Ctrl key for hold/release and modifier states needed for paste. It does not capture the contents of other applications or log general keyboard input. Initial installation/build downloads public packages, model files and a public test fixture; no user recordings are uploaded.

## Run from source

Install Node.js 24 LTS or later, then run once online:

```powershell
git clone https://github.com/dhruvmx/whisperflow-local.git
cd whisperflow-local
npm ci
npm run setup:model
npm start
```

You can then disconnect from the internet. Opening `src/index.html` in a regular browser only displays instructions; the desktop engine requires `npm start` or the packaged `.exe`.

Model setup pins a repository revision, writes downloads to `.part` files and records SHA-256 digests in `models/manifest.json`. Interrupted setup can be rerun. Packaging includes only the selected small-model assets, even if an older tiny-model cache remains on the development machine.

## Build and share

```powershell
npm run dist
```

The portable executable appears under `release/` and includes Electron, ONNX Runtime, Koffi and the model. Your friend needs only the downloaded `.exe`, not Node, Python, a browser, or repository access. Verify the SHA-256 checksum supplied with the release. `npm run pack` creates an unpacked application folder; keep that entire folder together when sharing it instead of the portable executable.

The GitHub workflow tests and builds on a standard Windows runner and publishes a private release. Changes on `main` trigger a run; it can also be started manually in Actions. Test audio is synthetic fixture input, not a user microphone upload.

## Implementation map

1. **Desktop boundary** — `electron/main.cjs` owns the sandboxed history window, non-focusable overlay, tray, permissions and validated IPC. Shortcuts never call `window.show()`.
2. **Dictation state** — `electron/dictation-controller.cjs` reserves one recording session, handles press/release races, rejects duplicate delivery and keeps a transient destination token.
3. **Windows integration** — `electron/windows.cjs` uses Koffi and Win32 APIs for Right Ctrl press/release, foreground/control identity and SendInput Ctrl+V. This module performs no network access.
4. **Frontend** — `src/app.js`, `state.js`, `index.html` and `styles.css` manage local notes, preview, history, errors and the recording queue. `bootstrap.js` explains browser-only launch attempts instead of hanging.
5. **Compact indicator** — `src/overlay.html`, `.css`, `.js` receive only sanitized state/level messages. Its separate preload exposes only indicator state and a recording toggle.
6. **Audio** — `src/audio/recorder.js` requests the microphone, runs a 16 kHz AudioContext and mono AudioWorklet, emits overlapping segments and releases all tracks/nodes on stop.
7. **Speech engine** — `electron/transcriber.cjs` dispatches bounded jobs to `transcription-worker.mjs`. Transformers.js loads local q8 Whisper small weights on the CPU. The worker runs outside the UI thread, rejects fetch and gates near-silent audio.
8. **Persistence** — `electron/history.cjs` serializes mutations, atomically replaces history JSON, assigns UUID/timestamps and preserves corrupt files rather than overwriting them.
9. **Packaging and tests** — `scripts/` handles setup, integrity verification, offline inference and desktop checks. The desktop check launches a second application process to verify actual foreground paste, native hotkeys and absence of recording dialogs.

## Verification

```powershell
npm test
node scripts/verify-model.mjs
npm run test:engine -- "C:\path\to\speech-16khz-mono-pcm16.wav"
npm run test:desktop
```

For the full fixture-based desktop test:

```powershell
node scripts/download-test-audio.mjs
npm run test:desktop -- .test-artifacts/jfk-16k.wav
```

This checks the browser-only error state, actual microphone capture with a test feed, offline speech, clipboard/history persistence, Right Ctrl hold/release, the toggle shortcut, automatic paste into another process and no main-window activation. A physical microphone and OS-specific permissions still need checking on the receiving computer.

This is an independent implementation inspired by the requested interaction, not affiliated with Wispr Flow or Whisperflow. See `THIRD_PARTY.md` and `LICENSE` before redistributing. The open-source Whisper model was developed by OpenAI; running its downloaded weights locally does not consume OpenAI API credits.
