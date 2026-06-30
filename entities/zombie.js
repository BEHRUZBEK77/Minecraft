/**
 * zombie.js — Hostile mobs (zombie, skeleton, spider) with simple chase-and-attack
 * AI. They detect the player within a radius, path toward them (with auto-jump from
 * the base Mob), and deal contact damage on a cooldown. Burn logic is omitted for
 * simplicity but day/night spawn gating is handled by the spawner. Built on MC.Mob.
 * Exposes global `MC.Hostile` / `MC.Monsters`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const part = (offset, size, color) => ({ offset, size, color });

  class Hostile extends MC.Mob {
    constructor(world, pos, type) {
      super(world, pos);
      this.type = type;
      this.hostile = true;
      this.detectRange = 16;
      this.attackRange = 1.6;
      this.attackDamage = 2;
      this._attackCd = 0;
      configure(this, type);
    }

    think(dt, player) {
      this._attackCd -= dt;
      const dx = player.pos[0] - this.pos[0];
      const dy = player.pos[1] - this.pos[1];
      const dz = player.pos[2] - this.pos[2];
      const dist = Math.hypot(dx, dy, dz);

      if (dist < this.detectRange && !player.dead) {
        this._state = 'chase';
        this.seek(player.pos, dt);
        // Attack on contact.
        if (dist < this.attackRange && this._attackCd <= 0) {
          player.damage(this.attackDamage);
          this._attackCd = 1.0;
        }
      } else {
        super.think(dt, player);
      }
    }
  }

  function configure(m, type) {
    switch (type) {
      case 'skeleton':
        m.half = 0.35; m.height = 1.8; m._baseSpeed = m.speed = 2.0; m.health = 12;
        m.attackDamage = 2;
        m.parts = [
          part([0, 0.7, 0], [0.5, 0.9, 0.3], [0.85, 0.85, 0.82]),     // body
          part([0, 1.6, 0], [0.45, 0.45, 0.45], [0.9, 0.9, 0.88]),    // head
          part([0.28, 0.7, 0], [0.12, 0.85, 0.12], [0.8, 0.8, 0.78]), // arms
          part([-0.28, 0.7, 0], [0.12, 0.85, 0.12], [0.8, 0.8, 0.78]),
          part([0.15, 0, 0], [0.14, 0.7, 0.14], [0.82, 0.82, 0.8]),   // legs
          part([-0.15, 0, 0], [0.14, 0.7, 0.14], [0.82, 0.82, 0.8]),
        ];
        break;
      case 'spider':
        m.half = 0.6; m.height = 0.7; m._baseSpeed = m.speed = 2.6; m.health = 14;
        m.attackDamage = 2; m.detectRange = 14;
        m.parts = [
          part([0, 0.3, -0.3], [0.9, 0.5, 0.9], [0.15, 0.1, 0.1]),    // abdomen
          part([0, 0.3, 0.5], [0.5, 0.4, 0.5], [0.2, 0.12, 0.12]),    // head
          part([0.55, 0.25, 0], [0.5, 0.12, 0.12], [0.1, 0.07, 0.07]),// legs
          part([-0.55, 0.25, 0], [0.5, 0.12, 0.12], [0.1, 0.07, 0.07]),
          part([0.55, 0.25, 0.4], [0.5, 0.12, 0.12], [0.1, 0.07, 0.07]),
          part([-0.55, 0.25, 0.4], [0.5, 0.12, 0.12], [0.1, 0.07, 0.07]),
        ];
        break;
      case 'zombie':
      default:
        m.type = 'zombie';
        m.half = 0.35; m.height = 1.8; m._baseSpeed = m.speed = 1.7; m.health = 16;
        m.attackDamage = 3;
        m.parts = [
          part([0, 0.7, 0], [0.55, 0.95, 0.32], [0.25, 0.5, 0.32]),   // body
          part([0, 1.6, 0], [0.48, 0.48, 0.48], [0.36, 0.62, 0.38]),  // head
          part([0, 0.95, 0.3], [0.4, 0.5, 0.2], [0.2, 0.45, 0.28]),   // outstretched arms
          part([0.18, 0, 0], [0.18, 0.7, 0.18], [0.2, 0.3, 0.5]),     // legs (pants)
          part([-0.18, 0, 0], [0.18, 0.7, 0.18], [0.2, 0.3, 0.5]),
        ];
        break;
    }
  }

  MC.Hostile = Hostile;
  MC.Monsters = {
    TYPES: ['zombie', 'skeleton', 'spider'],
    create: (world, pos, type) => new Hostile(world, pos, type),
  };
})(typeof window !== 'undefined' ? window : this);
