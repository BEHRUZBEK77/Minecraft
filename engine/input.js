/**
 * input.js — Keyboard + mouse handling with Pointer Lock for first-person look.
 * Exposes global `MC.Input`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  class Input {
    /** @param {HTMLCanvasElement} canvas element to capture pointer lock on */
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = Object.create(null);     // current key state by code
      this.pressed = Object.create(null);  // edge: pressed this frame
      this.mouse = { dx: 0, dy: 0, left: false, right: false, leftEdge: false, rightEdge: false, wheel: 0 };
      this.locked = false;
      this._bind();
    }

    _bind() {
      addEventListener('keydown', (e) => {
        if (!this.keys[e.code]) this.pressed[e.code] = true;
        this.keys[e.code] = true;
        // Prevent page scroll for game keys while playing
        if (this.locked && [' ', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      });
      addEventListener('keyup', (e) => { this.keys[e.code] = false; });

      this.canvas.addEventListener('mousedown', (e) => {
        if (!this.locked) return;
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
        if (e.button === 2) { this.mouse.right = true; this.mouse.rightEdge = true; }
      });
      addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      this.canvas.addEventListener('wheel', (e) => {
        if (this.locked) { e.preventDefault(); this.mouse.wheel += Math.sign(e.deltaY); }
      }, { passive: false });

      document.addEventListener('mousemove', (e) => {
        if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      });
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === this.canvas;
        if (this.onLockChange) this.onLockChange(this.locked);
      });
    }

    /** Request pointer lock (must be from a user gesture). */
    lock() { this.canvas.requestPointerLock?.(); }
    unlock() { document.exitPointerLock?.(); }

    isDown(code) { return !!this.keys[code]; }
    /** True only on the frame a key transitioned to down. */
    wasPressed(code) { return !!this.pressed[code]; }

    /** Call at the end of each frame to clear per-frame edge state. */
    endFrame() {
      this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
      this.mouse.leftEdge = false; this.mouse.rightEdge = false;
      this.pressed = Object.create(null);
    }
  }

  MC.Input = Input;
})(typeof window !== 'undefined' ? window : this);
