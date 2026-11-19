// All sounds are synthesised with WebAudio, so there are no audio files to load.
// Note: on iPhone the ring/silent switch can mute web audio.
export class Sfx {
  constructor() { this.ctx = null; this.laser = null; }

  // Must be called from inside a tap handler.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  _env(node, t, a, peak, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g); g.connect(this.master);
    return g;
  }

  _noise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  // Continuous laser hum while locked on a target.
  setLaser(on) {
    if (!this.ctx) return;
    if (on && !this.laser) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 60;
      lfo.connect(lfoGain); lfoGain.connect(o.frequency);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.laser = { o, lfo, g };
    } else if (!on && this.laser) {
      const { o, lfo, g } = this.laser;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.stop(t + 0.08); lfo.stop(t + 0.08);
      this.laser = null;
    }
  }

  explode(golden = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this._noise(0.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    n.connect(f); this._env(f, t, 0.005, 0.8, 0.45); n.start(t);
    const o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    this._env(o, t, 0.005, 0.35, 0.3); o.start(t); o.stop(t + 0.4);
    if (golden) [880, 1109, 1319, 1760].forEach((fr, i) => this.tone(fr, t + 0.08 * i, 0.15, 'triangle', 0.2));
  }

  bonk() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.35);
    this._env(o, t, 0.005, 0.9, 0.4); o.start(t); o.stop(t + 0.5);
  }

  tone(freq, t = this.ctx?.currentTime, dur = 0.12, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    this._env(o, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05);
  }
}
