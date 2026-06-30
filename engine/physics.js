/**
 * physics.js — Shared physics constants and a generic gravity/integration helper
 * for entities (player and mobs share this). Exposes global `MC.Physics`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  const Physics = {
    GRAVITY: 28,         // blocks / s^2
    TERMINAL: 50,        // max fall speed
    WATER_GRAVITY: 6,
    WATER_DRAG: 0.5,
    AIR_DRAG: 0.98,

    /**
     * Apply gravity to a vertical velocity for dt seconds.
     * @param {number} vy current vertical velocity
     * @param {boolean} inWater
     * @param {number} dt seconds
     */
    applyGravity(vy, inWater, dt) {
      const g = inWater ? Physics.WATER_GRAVITY : Physics.GRAVITY;
      vy -= g * dt;
      const term = inWater ? 6 : Physics.TERMINAL;
      if (vy < -term) vy = -term;
      return vy;
    },
  };

  MC.Physics = Physics;
})(typeof window !== 'undefined' ? window : this);
