// All sound is synthesised with WebAudio: no audio files to load.
// - laser hum, explosions
// - pig grunts/squeals, positioned in 3D so you hear where pigs come from
// - music: recorded tracks by Kevin MacLeod (CC BY 4.0), see CREDITS.md
// Note: on iPhone the ring/silent switch can mute web audio.

const MUSIC_VOLUME = 0.45;

// Swap `rock` to 'assets/music/rock-alt.mp3' for the other rock track.
const TRACKS = {
  farm: 'assets/music/farm.mp3',   // "Hillbilly Swing" - intro with the farmer
  rock: 'assets/music/rock.mp3',   // "Cool Rock" - during the game
};

// A short silent WAV, generated once (used for the iOS unmute trick).
let _silentUrl = null;
function silentWavUrl() {
  if (_silentUrl) return _silentUrl;
  const rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  _silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return _silentUrl;
}

export class Sfx {
  constructor() { this.ctx = null; this.laser = null; this.musicOn = true; this.tracks = null; this.track = 'farm'; }

  // Must be called from inside a tap handler.
  unlock() {
    // iPhone: by default web audio is muted by the ring/silent switch.
    // Declaring "playback" (Safari 17+) makes it behave like a video/music app.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iOS */ }
    // Older iOS: playing a (silent) <audio> element in the tap does the same.
    if (!this._silent) {
      this._silent = new Audio(silentWavUrl());
      this._silent.loop = true;
      this._silent.setAttribute('playsinline', '');
    }
    this._silent.play().catch(() => {});

    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      // Limiter at the end so we can play loud without distorting.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.2;
      this.limiter.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 1.4;
      this.master.connect(this.limiter);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOLUME;
      this.musicBus.connect(this.master);
      this._noiseBuf = this._makeNoise(1.5);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    this._initMusic(); // must happen inside the tap on iPhone
  }

  // Call when the app comes back to the foreground (iOS suspends audio).
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    this._silent?.play().catch(() => {});
  }

  _makeNoise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  _noise() { const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf; return s; }

  _env(node, t, a, peak, d, dest = this.master) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g); g.connect(dest);
    return g;
  }

  // ---------- 3D positioning ----------
  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4; p.rolloffFactor = 1.2; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    const px = e[12], py = e[13], pz = e[14];
    if (l.forwardX) {
      l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // ---------- pigs ----------
  // A grunt: a few rough pulses through nasal formant filters.
  oink(pos, pitch = 1) {
    if (!this.ctx) return;
    const out = pos ? this._panner(pos) : this.master;
    const t0 = this.ctx.currentTime + Math.random() * 0.05;
    const pulses = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * (0.11 + Math.random() * 0.04);
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const f0 = (95 + Math.random() * 40) * pitch;
      o.frequency.setValueAtTime(f0 * 1.15, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.1);
      const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 650 * pitch; f1.Q.value = 3;
      const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1300 * pitch; f2.Q.value = 5;
      o.connect(f1); o.connect(f2);
      this._env(f1, t, 0.01, 1.4, 0.09, out); this._env(f2, t, 0.01, 0.6, 0.08, out);
      const n = this._noise(); const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 1;
      n.connect(nf); this._env(nf, t, 0.01, 0.25, 0.08, out);
      o.start(t); o.stop(t + 0.15); n.start(t, Math.random()); n.stop(t + 0.15);
    }
  }

  // High-pitched squeal (when a pig gets lasered or pops).
  squeal(pos, dur = 0.55) {
    if (!this.ctx) return;
    const out = pos ? this._panner(pos) : this.master;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(800, t + dur);
    const vib = this.ctx.createOscillator(); vib.frequency.value = 14;
    const vg = this.ctx.createGain(); vg.gain.value = 70; vib.connect(vg); vg.connect(o.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 1.5;
    o.connect(f); this._env(f, t, 0.02, 0.9, dur, out);
    o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  // Animal-Crossing-style babble while the farmer talks.
  blip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.value = 160 + Math.random() * 120;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 600; f.Q.value = 2;
    o.connect(f); this._env(f, t, 0.005, 0.35, 0.06); o.start(t); o.stop(t + 0.09);
  }

  // Deep "announcer" hit for FINISH HIM.
  announce() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.6);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    o.connect(f); this._env(f, t, 0.01, 0.6, 0.6); o.start(t); o.stop(t + 0.7);
    const n = this._noise(); const hp = this.ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3000;
    n.connect(hp); this._env(hp, t, 0.002, 0.3, 0.25); n.start(t); n.stop(t + 0.3);
  }

  // ---------- weapons ----------
  setLaser(on) {
    if (!this.ctx) return;
    if (on && !this.laser) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 60;
      lfo.connect(lfoGain); lfoGain.connect(o.frequency);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
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
    const n = this._noise();
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(150, t + 0.7);
    n.connect(f); this._env(f, t, 0.005, 1.2, 0.8); n.start(t); n.stop(t + 1);
    // Sub-bass thump.
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    this._env(o, t, 0.005, 1.0, 0.5); o.start(t); o.stop(t + 0.6);
    // Cartoon "boing" afterwards.
    const b = this.ctx.createOscillator(); b.type = 'triangle';
    b.frequency.setValueAtTime(300, t + 0.12); b.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    this._env(b, t + 0.12, 0.01, 0.2, 0.25); b.start(t + 0.12); b.stop(t + 0.45);
    if (golden) [880, 1109, 1319, 1760].forEach((fr, i) => this.tone(fr, t + 0.08 * i, 0.15, 'triangle', 0.2));
  }

  death() {
    if (!this.ctx) return;
    this.squeal(null, 0.9);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(400, t + 0.3); o.frequency.exponentialRampToValueAtTime(60, t + 1.3);
    this._env(o, t + 0.3, 0.01, 0.3, 1.0); o.start(t + 0.3); o.stop(t + 1.4);
  }

  tone(freq, t = this.ctx?.currentTime, dur = 0.12, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    this._env(o, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- music ----------
  // Recorded tracks (see CREDITS.md), streamed via <audio> elements and routed
  // through WebAudio so the volume works on iPhone too.
  _initMusic() {
    if (this.tracks) return;
    this.tracks = {};
    for (const [name, url] of Object.entries(TRACKS)) {
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.setAttribute('playsinline', '');
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      try { this.ctx.createMediaElementSource(el).connect(gain); gain.connect(this.musicBus); }
      catch { /* very old browsers: plays at element volume */ }
      // Unlock playback now, inside the tap (iOS only allows play() from a gesture).
      el.muted = true;
      el.play().then(() => { if (this.track !== name || !this.musicOn) el.pause(); el.muted = false; })
        .catch(() => { el.muted = false; });
      this.tracks[name] = { el, gain };
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (on) this.startMusic(this.track); else this.stopMusic();
  }

  startMusic(track = 'rock') {
    if (!this.ctx) return;
    this._initMusic();
    this.track = track;
    if (!this.musicOn) return;
    const t = this.ctx.currentTime;
    for (const [name, { el, gain }] of Object.entries(this.tracks)) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      if (name === track) {
        if (el.paused) { el.currentTime = 0; el.play().catch(() => {}); }
        gain.gain.linearRampToValueAtTime(1, t + 0.6);   // fade in
      } else if (!el.paused) {
        gain.gain.linearRampToValueAtTime(0, t + 0.6);   // fade out, then pause
        setTimeout(() => { if (this.track !== name) el.pause(); }, 700);
      }
    }
  }

  stopMusic() {
    if (!this.tracks) return;
    for (const { el, gain } of Object.values(this.tracks)) { el.pause(); gain.gain.value = 0; }
  }
}
