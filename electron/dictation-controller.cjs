const { randomUUID } = require('node:crypto');
const phases = new Set(['loading', 'ready', 'requesting', 'recording', 'finishing', 'error']);
class DictationController {
  constructor({ native, onCommand, onState, writeClipboard }) {
    Object.assign(this, { native, onCommand, onState, writeClipboard });
    this.phase = 'loading'; this.session = null;
  }
  update(state) {
    if (!state || !phases.has(state.phase)) throw new Error('Invalid recording state.');
    this.phase = state.phase === 'ready' && this.session ? 'requesting' : state.phase;
    this.onState({ phase: this.phase, elapsed: Math.max(0, Math.min(301, Number(state.elapsed) || 0)),
      level: Math.max(0, Math.min(1, Number(state.level) || 0)), mode: this.session?.mode || 'manual' });
  }
  begin(mode = 'manual') {
    if (this.session) return this.session.id;
    if (this.phase !== 'ready') throw new Error('The speech engine is not ready yet.');
    this.session = { id: randomUUID(), mode, target: mode === 'manual' ? null : this.native?.captureTarget(), delivered: false };
    this.update({ phase: 'requesting' });
    return this.session.id;
  }
  start(mode) {
    if (this.phase !== 'ready' || this.session) return false;
    const id = this.begin(mode);
    this.onCommand({ action: 'start', id });
    return true;
  }
  stop() {
    if (!['requesting', 'recording'].includes(this.phase)) return false;
    this.onCommand({ action: 'stop' }); return true;
  }
  releaseHold() { if (this.session?.mode === 'hold') this.stop(); }
  toggle() { return this.phase === 'ready' && !this.session ? this.start('toggle') : this.stop(); }
  abort(id) { if (!id || id === this.session?.id) this.session = null; }
  async complete({ id, text }) {
    const session = this.session;
    if (!session || session.id !== id || session.delivered) throw new Error('This recording was already completed.');
    if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid transcript.');
    session.delivered = true;
    try {
      if (!text.trim()) return { pasted: false, message: 'No speech detected' };
      if (!session.target || !this.native) return { pasted: false, message: 'Transcription ready' };
      return await this.native.paste(text.trim(), session.target, this.writeClipboard);
    } finally { if (this.session === session) this.session = null; }
  }
}
module.exports = { DictationController };
