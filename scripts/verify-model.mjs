import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MODEL_ID, MODEL_REVISION, MODEL_FILES } from '../shared/audio.mjs';
const base = new URL('../models/', import.meta.url);
try {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  if (manifest.model !== MODEL_ID || manifest.revision !== MODEL_REVISION) throw new Error('Wrong model revision.');
  for (const name of MODEL_FILES) {
    const bytes = await readFile(new URL(`${MODEL_ID}/${name}`, base));
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]?.sha256) throw new Error(`Invalid model file: ${name}`);
  }
  console.log('All local model files verified.');
} catch (error) { console.error(`${error.message}\nRun npm run setup:model before building.`); process.exitCode = 1; }
