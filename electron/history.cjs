const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class HistoryStore {
  constructor(directory) {
    this.file = path.join(directory, 'history.json');
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(data) || data.some(x => typeof x.id !== 'string' || typeof x.text !== 'string'))
        throw new Error('History file is invalid. Preserve it and restore a backup.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  mutate(transform) {
    const operation = this.queue.then(async () => {
      const rows = transform(await this.read());
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', JSON.stringify(rows, null, 2), { mode: 0o600 });
      // Windows file indexing/antivirus can briefly hold the destination open.
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(this.file + '.tmp', this.file); break; }
        catch (error) {
          if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt));
        }
      }
      return rows;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  add({ text, duration }) {
    if (typeof text !== 'string' || !text.trim() || text.length > 100000 ||
      !Number.isFinite(duration) || duration < 0 || duration > 301) throw new Error('Invalid transcription.');
    return this.mutate(rows => [{ id: randomUUID(), text: text.trim(), duration,
      createdAt: new Date().toISOString(), model: 'whisper-tiny.en / q8 / CPU' }, ...rows]);
  }
  remove(id) {
    if (typeof id !== 'string') throw new Error('Invalid history ID.');
    return this.mutate(rows => rows.filter(row => row.id !== id));
  }
}
module.exports = { HistoryStore };
