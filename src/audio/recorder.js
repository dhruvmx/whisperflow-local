import { SAMPLE_RATE, MAX_SECONDS, rms } from '../../shared/audio.mjs';
export class Recorder {
  constructor({ onChunk, onLevel, onLimit }) {
    Object.assign(this, { onChunk, onLevel, onLimit });
    this.samples = new Float32Array(SAMPLE_RATE * MAX_SECONDS);
    this.length = 0; this.cursor = 0; this.stopping = false;
  }
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (this.context.sampleRate !== SAMPLE_RATE) throw new Error('This audio device cannot provide 16 kHz audio. Try another microphone.');
      await this.context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      this.source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, 'pcm-capture');
      this.node.port.onmessage = ({ data }) => {
        if (data === 'flushed') { this.flushed?.(); return; }
        const count = Math.min(data.length, this.samples.length - this.length);
        this.samples.set(data.subarray(0, count), this.length); this.length += count;
        this.onLevel(rms(data), this.length / SAMPLE_RATE);
        // Fifteen-second windows with one second of overlap provide periodic previews.
        if (this.length - this.cursor >= SAMPLE_RATE * 15) this.emit(this.cursor + SAMPLE_RATE * 15);
        if (this.length === this.samples.length && !this.stopping) { this.stopping = true; this.onLimit(); }
      };
      this.mute = this.context.createGain(); this.mute.gain.value = 0;
      this.source.connect(this.node); this.node.connect(this.mute); this.mute.connect(this.context.destination);
      await this.context.resume();
    } catch (error) { await this.dispose(); throw error; }
  }
  emit(end) {
    this.onChunk(this.samples.slice(this.cursor, end));
    this.cursor = Math.max(0, end - SAMPLE_RATE);
  }
  async stop() {
    this.stopping = true;
    if (this.node) {
      await Promise.race([new Promise(resolve => { this.flushed = resolve; this.node.port.postMessage('flush'); }), new Promise(resolve => setTimeout(resolve, 500))]);
    }
    await this.dispose();
    const tail = this.length - this.cursor;
    if (tail >= 1600 && (this.cursor === 0 || tail > SAMPLE_RATE + 1600)) this.emit(this.length);
    return this.length / SAMPLE_RATE;
  }
  async dispose() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect(); this.node?.disconnect(); this.mute?.disconnect();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
