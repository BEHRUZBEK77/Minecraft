/**
 * audio.js — Procedural sound effects + ambient music via the Web Audio API, so the
 * game ships without sound files. Provides footsteps, break/place, splash, rain,
 * mob noises and a gentle background pad. Exposes global `MC.Audio`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  class Audio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.enabled = true;
      this.volume = 0.6;
      this._rainNode = null;
      this._stepTimer = 0;
    }

    /** Lazily create the AudioContext (must follow a user gesture). */
    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.master);
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

    /** Quick percussive tone. */
    _blip(freq, dur, type = 'sine', gain = 0.3, dest) {
      if (!this.ctx || !this.enabled) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(); o.stop(this.ctx.currentTime + dur);
    }

    /** A short filtered noise burst (for digging / steps). */
    _noise(dur, cutoff, gain = 0.3) {
      if (!this.ctx || !this.enabled) return;
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * dur, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = cutoff;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
    }

    break(id) { this._noise(0.18, 1200, 0.4); this._blip(180 + id * 8, 0.12, 'square', 0.12); }
    place(id) { this._noise(0.1, 800, 0.3); this._blip(120 + id * 6, 0.08, 'sine', 0.15); }
    step() { this._noise(0.07, 500, 0.18); }
    splash() { this._noise(0.3, 2000, 0.35); }
    hurt() { this._blip(140, 0.25, 'sawtooth', 0.3); }
    mob(type) {
      const f = type === 'zombie' ? 90 : type === 'cow' ? 160 : type === 'chicken' ? 600 : 220;
      this._blip(f, 0.4, 'sawtooth', 0.18);
    }

    /** Toggle continuous rain noise. */
    setRain(on) {
      if (!this.ctx || !this.enabled) return;
      if (on && !this._rainNode) {
        const sr = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, sr * 2, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1500;
        const g = this.ctx.createGain(); g.gain.value = 0.06;
        src.connect(filt); filt.connect(g); g.connect(this.master);
        src.start();
        this._rainNode = { src, g };
      } else if (!on && this._rainNode) {
        this._rainNode.src.stop(); this._rainNode = null;
      }
    }

    /** Play a slow ambient chord progression as background music. */
    startMusic() {
      if (!this.ctx || !this.enabled || this._music) return;
      const chords = [[220, 277, 330], [196, 247, 294], [174, 220, 261], [233, 294, 349]];
      let i = 0;
      const playChord = () => {
        if (!this._music) return;
        const c = chords[i % chords.length]; i++;
        for (const f of c) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, this.ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 1.5);
          g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 5);
          o.connect(g); g.connect(this.musicGain);
          o.start(); o.stop(this.ctx.currentTime + 5.2);
        }
      };
      this._music = setInterval(playChord, 5000);
      playChord();
    }

    stopMusic() { if (this._music) { clearInterval(this._music); this._music = null; } }
  }

  MC.Audio = Audio;
})(typeof window !== 'undefined' ? window : this);
