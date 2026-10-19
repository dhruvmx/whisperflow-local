import { parentPort, workerData } from 'node:worker_threads';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { MODEL_ID, MODEL_FILES, validateAudio, rms } from '../shared/audio.mjs';

// The runtime never downloads models. Setup is a separate, explicit command.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = workerData.modelDirectory + path.sep;
env.useBrowserCache = false;
env.useFSCache = false;
// Defense in depth: fail even if a library accidentally attempts fetch.
globalThis.fetch = async () => { throw new Error('Network access is disabled in the speech engine.'); };
let engine;
async function load() {
  if (engine) return engine;
  for (const name of MODEL_FILES) {
    try { await access(path.join(workerData.modelDirectory, MODEL_ID, name)); }
    catch { throw new Error('Local model is missing. Close the app and run npm run setup:model.'); }
  }
  parentPort.postMessage({ type: 'status', status: 'Loading local Whisper model…' });
  engine = await pipeline('automatic-speech-recognition', MODEL_ID, { device: 'cpu', dtype: 'q8', local_files_only: true });
  parentPort.postMessage({ type: 'status', status: 'Local engine ready' });
  return engine;
}
parentPort.on('message', async ({ id, type, audio }) => {
  try {
    if (type === 'load') { await load(); parentPort.postMessage({ id, result: true }); return; }
    if (type !== 'transcribe') throw new Error('Unknown speech operation.');
    validateAudio(audio);
    if (rms(audio) < 0.002) { parentPort.postMessage({ id, result: '' }); return; }
    const transcribe = await load();
    const result = await transcribe(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
    parentPort.postMessage({ id, result: result.text.trim() });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
