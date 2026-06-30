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
      this.musicOn = true;
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
    /**
     * Calm, generative ambient music: a slow chord pad underneath a gentle
     * pentatonic melody, in the spirit of Minecraft's quiet piano pieces.
     */
    startMusic() {
      if (!this.ctx || !this.enabled || !this.musicOn || this._music) return;
      // Chord progression (root triads) in a warm key.
      const chords = [
        [130.81, 164.81, 196.00],  // C
        [110.00, 138.59, 164.81],  // A min
        [146.83, 174.61, 220.00],  // D min
        [196.00, 246.94, 293.66],  // G
      ];
      // Pentatonic melody pool (C major pentatonic, two octaves).
      const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
      let step = 0;

      const padNote = (freq, when, dur, gain) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when + dur * 0.3);
        g.gain.linearRampToValueAtTime(0, when + dur);
        o.connect(g); g.connect(this.musicGain);
        o.start(when); o.stop(when + dur + 0.1);
      };

      const tick = () => {
        if (!this._music) return;
        const t = this.ctx.currentTime;
        const chord = chords[step % chords.length];
        // Pad: hold the chord softly for the whole bar.
        for (const f of chord) padNote(f, t, 7.5, 0.16);
        // Melody: a few sparse notes over the bar.
        const notes = 2 + ((Math.random() * 3) | 0);
        for (let n = 0; n < notes; n++) {
          const f = scale[(Math.random() * scale.length) | 0];
          padNote(f, t + 1 + n * 1.6 + Math.random() * 0.4, 1.4, 0.1);
        }
        step++;
      };

      this._music = setInterval(tick, 8000);
      tick();
    }

    stopMusic() { if (this._music) { clearInterval(this._music); this._music = null; } }
    setMusicEnabled(on) {
      this.musicOn = on;
      if (!on) this.stopMusic();
      else this.startMusic();
    }
  }

  MC.Audio = Audio;
})(typeof window !== 'undefined' ? window : this);
