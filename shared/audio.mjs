export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 300;
export const MODEL_ID = 'onnx-community/whisper-small';
export const MODEL_REVISION = '36050c46d777d46dc4b5f43f6d90574fc38f8732';
export const MODEL_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json',
  'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];

export function validateAudio(value) {
  if (!(value instanceof Float32Array) || value.length < 1600 || value.length > SAMPLE_RATE * MAX_SECONDS)
    throw new Error('Audio must be 0.1–300 seconds of 16 kHz mono PCM.');
  for (const x of value) if (!Number.isFinite(x) || Math.abs(x) > 1.01) throw new Error('Invalid audio samples.');
  return value;
}

// Match overlap words without changing original punctuation or casing.
export function appendTranscript(previous, next) {
  const a = previous.trim().split(/\s+/).filter(Boolean);
  const b = next.trim().split(/\s+/).filter(Boolean);
  const norm = x => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let overlap = 0;
  for (let n = 1; n <= Math.min(12, a.length, b.length); n++) {
    if (a.slice(-n).every((x, i) => norm(x) && norm(x) === norm(b[i]))) overlap = n;
  }
  return [...a, ...b.slice(overlap)].join(' ');
}

export function rms(samples) {
  let sum = 0;
  for (const x of samples) sum += x * x;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
