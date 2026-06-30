/**
 * noise.js — Deterministic value/Perlin-style noise used for terrain & caves.
 * Seedable permutation table; provides 2D and 3D fractal Brownian motion (fBm).
 * Exposes global `MC.Noise`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const { smooth, lerp } = MC.math;

  /** Tiny seeded PRNG (mulberry32) used to shuffle the permutation table. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Noise {
    /** @param {number} seed integer seed */
    constructor(seed = 1337) {
      this.seed = seed;
      const rng = mulberry32(seed);
      // Classic 256-entry permutation, doubled to avoid index wrapping.
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      this.perm = new Uint8Array(512);
      this.gradP = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    /** Gradient hash -> pseudo gradient dot product (2D). */
    _grad2(hash, x, y) {
      const h = hash & 7;
      const u = h < 4 ? x : y;
      const v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }

    /** 2D Perlin-ish noise in range ~[-1,1]. */
    perlin2(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = smooth(x);
      const v = smooth(y);
      const p = this.perm;
      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];
      const x1 = lerp(this._grad2(aa, x, y), this._grad2(ba, x - 1, y), u);
      const x2 = lerp(this._grad2(ab, x, y - 1), this._grad2(bb, x - 1, y - 1), u);
      return lerp(x1, x2, v) * 0.5;
    }

    /** 3D gradient. */
    _grad3(hash, x, y, z) {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    /** 3D Perlin noise in range ~[-1,1]. */
    perlin3(x, y, z) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = smooth(x), v = smooth(y), w = smooth(z);
      const p = this.perm;
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      const g = (h, a, b, c) => this._grad3(h, a, b, c);
      return lerp(
        lerp(
          lerp(g(p[AA], x, y, z), g(p[BA], x - 1, y, z), u),
          lerp(g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z), u), v),
        lerp(
          lerp(g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1), u),
          lerp(g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1), u), v),
        w);
    }

    /** Fractal Brownian motion (2D): sums octaves of perlin2. */
    fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.perlin2(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }

    /** Fractal Brownian motion (3D). */
    fbm3(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.perlin3(x * freq, y * freq, z * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }
  }

  MC.Noise = Noise;
})(typeof window !== 'undefined' ? window : this);
