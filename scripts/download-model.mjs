import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ID, MODEL_REVISION, MODEL_FILES } from '../shared/audio.mjs';
const root = fileURLToPath(new URL('../models/', import.meta.url));
const directory = path.join(root, MODEL_ID);
await mkdir(directory, { recursive: true });
let old = {};
try { old = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')); } catch {}
const manifest = { model: MODEL_ID, revision: MODEL_REVISION, files: {} };
for (const name of MODEL_FILES) {
  const destination = path.join(directory, name);
  const expected = old.revision === MODEL_REVISION && old.files?.[name];
  if (expected) {
    try {
      const bytes = await readFile(destination);
      if (createHash('sha256').update(bytes).digest('hex') === expected.sha256) {
        manifest.files[name] = expected; console.log(`Verified ${name}`); continue;
      }
    } catch {}
  }
  console.log(`Downloading free model asset: ${name}`);
  const response = await fetch(`https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${name}`, { signal: AbortSignal.timeout(600000) });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${name}. Run setup:model again to retry.`);
  await mkdir(path.dirname(destination), { recursive: true });
  const hash = createHash('sha256');
  const tap = new Transform({ transform(chunk, _, callback) { hash.update(chunk); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), tap, createWriteStream(destination + '.part'));
  const size = (await stat(destination + '.part')).size;
  if (size < (name.endsWith('.onnx') ? 1000000 : 10)) throw new Error(`Incomplete asset: ${name}`);
  await rename(destination + '.part', destination);
  manifest.files[name] = { bytes: size, sha256: hash.digest('hex') };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ ...manifest, files: { ...old.files, ...manifest.files } }, null, 2));
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Local model ready. You can now disconnect from the internet and run npm start.');
