/**
 * animal.js — Passive animals (cow, pig, chicken, sheep). They wander, flee briefly
 * when hit, and drop nothing fancy. Exposes global `MC.Animal` plus per-type
 * factory helpers. Built on MC.Mob. Exposes `MC.Animals`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  /** Helper to construct a box part. */
  const part = (offset, size, color) => ({ offset, size, color });

  class Animal extends MC.Mob {
    constructor(world, pos, type) {
      super(world, pos);
      this.type = type;
      this.hostile = false;
      this._fleeTime = 0;
      configure(this, type);
    }

    think(dt, player) {
      // Flee for a short time after being hurt.
      if (this._fleeTime > 0) {
        this._fleeTime -= dt;
        const dx = this.pos[0] - player.pos[0];
        const dz = this.pos[2] - player.pos[2];
        const d = Math.hypot(dx, dz) || 1;
        this.yaw = Math.atan2(dx, -dz);
        this._moveDir = [dx / d, dz / d];
        this.speed = this._baseSpeed * 2;
        return;
      }
      this.speed = this._baseSpeed;
      super.think(dt, player);
    }

    damage(n) {
      super.damage(n);
      this._fleeTime = 3;
    }
  }

  /** Configure stats + body parts for an animal type. */
  function configure(m, type) {
    switch (type) {
      case 'cow':
        m.half = 0.45; m.height = 1.3; m._baseSpeed = 1.4; m.health = 10;
        m.color = [0.5, 0.35, 0.25];
        m.parts = [
          part([0, 0.6, 0], [0.9, 0.7, 1.4], [0.45, 0.3, 0.22]),     // body
          part([0, 0.8, 0.85], [0.55, 0.55, 0.4], [0.5, 0.35, 0.25]),// head
          part([0.3, 0, 0.45], [0.2, 0.6, 0.2], [0.3, 0.22, 0.18]),  // legs
          part([-0.3, 0, 0.45], [0.2, 0.6, 0.2], [0.3, 0.22, 0.18]),
          part([0.3, 0, -0.45], [0.2, 0.6, 0.2], [0.3, 0.22, 0.18]),
          part([-0.3, 0, -0.45], [0.2, 0.6, 0.2], [0.3, 0.22, 0.18]),
        ];
        break;
      case 'pig':
        m.half = 0.4; m.height = 0.9; m._baseSpeed = 1.5; m.health = 8;
        m.color = [0.9, 0.6, 0.65];
        m.parts = [
          part([0, 0.45, 0], [0.8, 0.6, 1.1], [0.9, 0.6, 0.65]),
          part([0, 0.55, 0.7], [0.5, 0.5, 0.35], [0.95, 0.65, 0.7]),
          part([0.25, 0, 0.35], [0.18, 0.45, 0.18], [0.8, 0.5, 0.55]),
          part([-0.25, 0, 0.35], [0.18, 0.45, 0.18], [0.8, 0.5, 0.55]),
          part([0.25, 0, -0.35], [0.18, 0.45, 0.18], [0.8, 0.5, 0.55]),
          part([-0.25, 0, -0.35], [0.18, 0.45, 0.18], [0.8, 0.5, 0.55]),
        ];
        break;
      case 'chicken':
        m.half = 0.25; m.height = 0.6; m._baseSpeed = 1.7; m.health = 4;
        m.color = [0.95, 0.95, 0.92];
        m.parts = [
          part([0, 0.3, 0], [0.4, 0.4, 0.5], [0.95, 0.95, 0.92]),
          part([0, 0.55, 0.2], [0.28, 0.32, 0.28], [0.97, 0.97, 0.95]),
          part([0, 0.6, 0.34], [0.12, 0.12, 0.14], [0.9, 0.5, 0.1]),  // beak
          part([0.1, 0, 0.0], [0.1, 0.3, 0.1], [0.9, 0.6, 0.1]),
          part([-0.1, 0, 0.0], [0.1, 0.3, 0.1], [0.9, 0.6, 0.1]),
        ];
        break;
      case 'sheep':
      default:
        m.type = 'sheep';
        m.half = 0.45; m.height = 1.2; m._baseSpeed = 1.3; m.health = 8;
        m.color = [0.92, 0.92, 0.9];
        m.parts = [
          part([0, 0.55, 0], [0.95, 0.8, 1.3], [0.92, 0.92, 0.9]),   // woolly body
          part([0, 0.7, 0.8], [0.45, 0.5, 0.4], [0.85, 0.78, 0.72]), // head
          part([0.3, 0, 0.4], [0.18, 0.55, 0.18], [0.8, 0.78, 0.75]),
          part([-0.3, 0, 0.4], [0.18, 0.55, 0.18], [0.8, 0.78, 0.75]),
          part([0.3, 0, -0.4], [0.18, 0.55, 0.18], [0.8, 0.78, 0.75]),
          part([-0.3, 0, -0.4], [0.18, 0.55, 0.18], [0.8, 0.78, 0.75]),
        ];
        break;
    }
  }

  MC.Animal = Animal;
  MC.Animals = {
    TYPES: ['cow', 'pig', 'chicken', 'sheep'],
    create: (world, pos, type) => new Animal(world, pos, type),
  };
})(typeof window !== 'undefined' ? window : this);
