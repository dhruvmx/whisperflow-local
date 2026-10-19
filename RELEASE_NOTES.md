Whisperflow Local for Windows 10/11 x64.

Download the **Whisperflow Local .exe** asset and run it. This portable executable contains the desktop runtime, speech engine, and English Whisper tiny.en model. It extracts its application files before launching; allow time on the first start. No Node.js, Python, account, API key, or internet connection is needed to transcribe.

Version 1.1.0:

- Hold **Right Ctrl** to record and release it to finish and paste into the text box you leave focused. **Ctrl + Shift + Space** remains available as a toggle.
- A compact, non-activating capsule shows Ready, Listening and Transcribing. Recording shortcuts never bring the history window forward.
- Removed repeated new-recording and close-recording confirmations. Closing the history window stops an active recording and hides to the tray. Right-click the tray icon and choose Quit to exit fully.
- Replaced Whisper tiny.en with the larger **Whisper small q8** model for improved recognition. Recognition is configured for English. The model and native speech runtime are bundled; CPU processing uses more memory and takes longer than tiny.en.
- Auto-paste uses the clipboard and Windows keyboard input. It never presses Enter. If you change the active window/native text control or Windows blocks input to an elevated app, your text remains in history and the clipboard for manual pasting.
- Opening the HTML page in a regular browser shows desktop launch instructions. The web page does not contain a separate speech engine.

For dictation, focus the destination text box before using the shortcut and leave it focused until the capsule finishes. The main window's Record button still records a local note. Transcription previews arrive after each short speech segment. History is stored only on your computer. Audio is discarded after transcription.

The executable is unsigned. Windows may display a reputation warning. Verify its SHA-256 checksum against SHA256SUMS.txt before sharing. This repository and its release page are private; you may download the executable and send the file directly to your friend without giving them repository access.

This is an independent implementation inspired by the requested dictation workflow. It is not affiliated with Whisperflow. Speech recognition uses the free open-source Whisper model locally and never calls paid OpenAI APIs.
