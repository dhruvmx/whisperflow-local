import { createStore } from './state.js';
import { Recorder } from './audio/recorder.js';
import { appendTranscript } from '../shared/audio.mjs';
const $ = selector => document.querySelector(selector);
const api = window.desktop;
const store = createStore({ phase: 'loading', transcript: '', history: [], elapsed: 0, view: 'dictation' });
let recorder, queue = Promise.resolve(), chunkError, unsavedEntry;
const bars = Array.from({ length: 35 }, (_, i) => {
  const bar = document.createElement('i'); $('#wave').append(bar); return bar;
});
const time = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function notice(message = '') { $('#notice').hidden = !message; $('#notice').textContent = message; }
function report(error) { notice(error.message || String(error)); }
function safely(action) { return (...args) => Promise.resolve().then(() => action(...args)).catch(report); }
store.subscribe(state => {
  const { phase } = state;
  const active = ['requesting', 'recording', 'finishing'].includes(phase);
  document.body.classList.toggle('recording', phase === 'recording');
  $('#record').disabled = !['ready', 'recording'].includes(phase);
  $('#record').setAttribute('aria-label', phase === 'recording' ? 'Stop recording' : 'Start recording');
  const labels = { loading: ['Loading local engine', 'The first load can take a moment.'], ready: ['Ready when you are', 'Click to record, or use the global shortcut.'], requesting: ['Allow microphone access', 'Check your system microphone permissions.'], recording: ['Listening to you', 'Click to finish · previews arrive about every 15 seconds.'], finishing: ['Finding the right words', 'Finishing your transcription on this device.'], error: ['Local engine unavailable', 'Run npm run setup:model, then restart the app.'] };
  $('#record-label').textContent = labels[phase][0];
  $('#record-help').textContent = labels[phase][1];
  $('#status-label').textContent = { loading: 'Loading local model', ready: 'Ready to capture', requesting: 'Waiting for microphone', recording: 'Recording locally', finishing: 'Processing locally', error: 'Setup required' }[phase];
  $('#timer').textContent = time(state.elapsed);
  $('#transcript').readOnly = active;
  if ($('#transcript').value !== state.transcript) $('#transcript').value = state.transcript;
  $('#copy').disabled = $('#export').disabled = !state.transcript.trim();
  $('#word-count').textContent = `${state.transcript.trim().split(/\s+/).filter(Boolean).length} words`;
  $('#preview-state').textContent = active ? 'LIVE PREVIEW' : 'TRANSCRIPT';
  $('#history-count').textContent = state.history.length;
  $('#dictation-view').hidden = state.view !== 'dictation';
  $('#history-view').hidden = state.view !== 'history';
  $('#dictation-tab').classList.toggle('active', state.view === 'dictation');
  $('#history-tab').classList.toggle('active', state.view === 'history');
  $('#page-name').textContent = state.view === 'dictation' ? 'Dictation' : 'History';
});

function enqueue(samples) {
  queue = queue.then(async () => {
    if (chunkError) return;
    try {
      const text = await api.transcribe(samples);
      store.set({ transcript: appendTranscript(store.get().transcript, text) });
    } catch (error) { chunkError = error; }
  });
}

async function saveEntry() {
  if (!unsavedEntry) return;
  try {
    const history = await api.save(unsavedEntry);
    unsavedEntry = undefined;
    $('#retry-save').hidden = true;
    $('#save-status').textContent = 'Saved to local history. Audio discarded.';
    store.set({ history }); renderHistory();
  } catch (error) {
    $('#retry-save').hidden = false;
    $('#save-status').textContent = 'Not saved. Copy or export your text, or retry.';
    throw error;
  }
}
async function start() {
  notice();
  if (unsavedEntry) { await saveEntry(); }
  // Do not silently erase text the user has typed or edited.
  if (store.get().transcript && !confirm('Start a new recording? The current preview will be cleared. Saved history is kept; copy or export any unsaved edits first.')) return;
  store.set({ phase: 'requesting', transcript: '', elapsed: 0 });
  await api.recordingState(true);
  queue = Promise.resolve(); chunkError = undefined;
  recorder = new Recorder({ onChunk: enqueue,
    onLevel: (level, elapsed) => {
      store.set({ elapsed });
      bars.forEach((bar, i) => { bar.style.height = `${4 + Math.min(1, level * 10) * (8 + 23 * Math.abs(Math.sin(i * 1.7 + elapsed * 7)))}px`; });
    }, onLimit: safely(stop)
  });
  try {
    await recorder.start(); store.set({ phase: 'recording' });
    $('#save-status').textContent = 'Local preview · no audio is written to disk.';
  } catch (error) {
    recorder = undefined; store.set({ phase: 'ready' }); await api.recordingState(false);
    throw new Error(`Microphone unavailable: ${error.message} On Windows, enable Settings → Privacy & security → Microphone → Let desktop apps access your microphone.`);
  }
}
async function stop() {
  if (!recorder || store.get().phase !== 'recording') return;
  store.set({ phase: 'finishing' });
  try {
    const duration = await recorder.stop();
    recorder = undefined;
    await queue;
    if (store.get().transcript.trim()) {
      unsavedEntry = { text: store.get().transcript, duration };
      await saveEntry();
    } else $('#save-status').textContent = 'No speech detected. Try moving closer to the microphone.';
    if (chunkError) throw new Error(`Some audio could not be transcribed: ${chunkError.message} Any recovered text is shown and saved.`);
  } finally {
    recorder = undefined; store.set({ phase: 'ready' });
    await api.recordingState(false);
    bars.forEach(bar => { bar.style.height = '4px'; });
  }
}
const toggle = safely(async () => {
  if (store.get().phase === 'ready') await start();
  else if (store.get().phase === 'recording') await stop();
});
$('#record').addEventListener('click', toggle);
api.onToggle(toggle);
api.onStatus(status => { $('#status-label').textContent = status; });
$('#copy').addEventListener('click', safely(async () => { await api.copy(store.get().transcript); $('#save-status').textContent = 'Copied to clipboard.'; }));
$('#export').addEventListener('click', safely(async () => { if (await api.exportText(store.get().transcript)) $('#save-status').textContent = 'Text exported.'; }));
$('#retry-save').addEventListener('click', safely(saveEntry));
$('#transcript').addEventListener('input', event => {
  store.set({ transcript: event.target.value });
  $('#save-status').textContent = 'Preview edited. Copy or export to keep these changes.';
});
$('#dictation-tab').addEventListener('click', () => store.set({ view: 'dictation' }));
$('#history-tab').addEventListener('click', () => { store.set({ view: 'history' }); renderHistory(); });
$('#search').addEventListener('input', renderHistory);

function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  const search = $('#search').value.toLowerCase();
  const rows = store.get().history.filter(row => row.text.toLowerCase().includes(search));
  if (!rows.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = search ? 'No matching transcriptions.' : 'A quiet beginning. Your first transcription will appear here.';
    list.append(empty);
  }
  for (const row of rows) {
    const card = document.createElement('article'); card.className = 'history-card';
    const meta = document.createElement('div'); meta.className = 'history-meta';
    const date = document.createElement('span'); date.textContent = new Date(row.createdAt).toLocaleString();
    const duration = document.createElement('span'); duration.textContent = `${time(row.duration)} · ${row.text.split(/\s+/).length} words`;
    meta.append(date, duration);
    const text = document.createElement('p'); text.textContent = row.text;
    card.append(meta, text);
    for (const [label, action] of [
      ['Copy', () => api.copy(row.text)],
      ['Export', () => api.exportText(row.text)],
      ['Delete', async () => {
        if (!confirm('Delete this transcription permanently from local history?')) return;
        store.set({ history: await api.remove(row.id) }); renderHistory();
      }]
    ]) {
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = label;
      button.addEventListener('click', safely(action)); card.append(button);
    }
    list.append(card);
  }
}
async function initialize() {
  try { store.set({ history: await api.history() }); }
  catch (error) { report(error); }
  try { await api.loadEngine(); store.set({ phase: 'ready' }); }
  catch (error) { store.set({ phase: 'error' }); report(error); }
}
initialize();
