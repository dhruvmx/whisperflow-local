const { Worker } = require('node:worker_threads');
const path = require('node:path');

class Transcriber {
  constructor(modelDirectory, onStatus = () => {}) {
    this.worker = new Worker(path.join(__dirname, 'transcription-worker.mjs'), {
      workerData: { modelDirectory }
    });
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    this.worker.on('message', message => {
      if (message.type === 'status') return onStatus(message.status);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result);
    });
    this.worker.on('error', error => this.fail(error));
    this.worker.on('exit', code => { this.closed = true; this.fail(new Error(`Speech worker stopped (${code}). Restart the app.`)); });
  }
  fail(error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
  }
  request(type, audio) {
    if (this.closed) return Promise.reject(new Error('Speech worker unavailable. Restart the app.'));
    if (this.pending.size) return Promise.reject(new Error('Speech engine is busy.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.closed = true;
        this.fail(new Error('Local transcription timed out. Restart the app.'));
        this.worker.terminate();
      }, 10 * 60 * 1000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, audio });
    });
  }
  close() { this.closed = true; this.fail(new Error('App closing.')); return this.worker.terminate(); }
}
module.exports = { Transcriber };
