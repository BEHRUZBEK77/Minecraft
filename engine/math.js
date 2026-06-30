/**
 * math.js — Minimal linear-algebra library (mat4 / vec3) for the voxel engine.
 * Everything is column-major to match WebGL's expectations.
 * Attaches a global `MC.math` namespace (no ES modules so the game runs from file://).
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  /** 3-component vector helpers (operate on plain [x,y,z] arrays). */
  const vec3 = {
    create: (x = 0, y = 0, z = 0) => [x, y, z],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    length: (a) => Math.hypot(a[0], a[1], a[2]),
    normalize: (a) => {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
  };

  /** 4x4 matrix helpers. Matrices are Float32Array(16), column-major. */
  const mat4 = {
    /** @returns {Float32Array} identity matrix */
    identity() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },

    /** Perspective projection. fov in radians. */
    perspective(out, fov, aspect, near, far) {
      const f = 1 / Math.tan(fov / 2);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },

    /** Build a view matrix looking from `eye` toward `center` with `up`. */
    lookAt(out, eye, center, up) {
      const z = vec3.normalize(vec3.sub(eye, center));
      const x = vec3.normalize(vec3.cross(up, z));
      const y = vec3.cross(z, x);
      out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
      out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
      out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
      out[12] = -vec3.dot(x, eye);
      out[13] = -vec3.dot(y, eye);
      out[14] = -vec3.dot(z, eye);
      out[15] = 1;
      return out;
    },

    /** Multiply a*b -> out (out may not alias a or b). */
    multiply(out, a, b) {
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          out[c * 4 + r] =
            a[r] * b[c * 4] +
            a[4 + r] * b[c * 4 + 1] +
            a[8 + r] * b[c * 4 + 2] +
            a[12 + r] * b[c * 4 + 3];
        }
      }
      return out;
    },

    /** Translation matrix. */
    translation(out, t) {
      out.set(mat4.identity());
      out[12] = t[0]; out[13] = t[1]; out[14] = t[2];
      return out;
    },
  };

  /** Clamp helper used across the engine. */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  /** Linear interpolation. */
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Smoothstep used by noise. */
  const smooth = (t) => t * t * (3 - 2 * t);

  MC.math = { vec3, mat4, clamp, lerp, smooth, TO_RAD: Math.PI / 180 };
})(typeof window !== 'undefined' ? window : this);
