/**
 * mob.js — Base entity for all mobs: gravity, collision, wandering AI, and a body
 * made of colored cuboids rendered via the entity shader. Subclasses configure
 * appearance, stats and behavior. Exposes global `MC.Mob`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Collision = MC.Collision;
  const Physics = MC.Physics;
  const Blocks = MC.Blocks;

  class Mob {
    /** @param {World} world @param {number[]} pos spawn feet position */
    constructor(world, pos) {
      this.world = world;
      this.pos = pos.slice();
      this.vel = [0, 0, 0];
      this.yaw = Math.random() * Math.PI * 2;
      this.onGround = false;
      this.dead = false;
      // Defaults; subclasses override.
      this.half = 0.4;
      this.height = 1.2;
      this.speed = 1.6;
      this.health = 10;
      this.maxHealth = 10;
      this.hostile = false;
      this.avoidLedges = true;   // don't walk off tall drops
      this.hurtFlash = 0;        // seconds of red flash after taking damage
      this.color = [0.8, 0.8, 0.8];
      this.parts = [];           // {offset:[x,y,z], size:[x,y,z], color:[r,g,b]}
      this._state = 'idle';
      this._timer = 0;
      this._moveDir = [0, 0];
      this._wanderTime = 0;
    }

    /** True if stepping in the move direction would walk off a tall ledge. */
    _ledgeAhead() {
      const fx = Math.floor(this.pos[0] + this._moveDir[0] * 0.7);
      const fz = Math.floor(this.pos[2] + this._moveDir[1] * 0.7);
      const fy = Math.floor(this.pos[1]);
      for (let d = 1; d <= 3; d++)
        if (Blocks.isSolid(this.world.getBlock(fx, fy - d, fz))) return false;
      return true;
    }

    /** Decide behavior. Base implementation: idle/wander. */
    think(dt, player) {
      this._wanderTime -= dt;
      if (this._wanderTime <= 0) {
        this._wanderTime = 2 + Math.random() * 3;
        if (Math.random() < 0.5) {
          this._state = 'wander';
          this.yaw = Math.random() * Math.PI * 2;
          this._moveDir = [Math.sin(this.yaw), -Math.cos(this.yaw)];
        } else {
          this._state = 'idle';
          this._moveDir = [0, 0];
        }
      }
    }

    /** Move toward a target horizontally, jump over obstacles. */
    seek(target, dt) {
      const dx = target[0] - this.pos[0];
      const dz = target[2] - this.pos[2];
      const d = Math.hypot(dx, dz) || 1;
      this.yaw = Math.atan2(dx, -dz);
      this._moveDir = [dx / d, dz / d];
    }

    /** Physics + collision integration. */
    update(dt, player) {
      this.think(dt, player);
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      const inWater = Collision.inLiquid(this.world, this.pos, this.half, this.height);

      // Don't stroll off tall cliffs while grounded (still allowed to fall if pushed).
      if (this.avoidLedges && this.onGround && (this._moveDir[0] || this._moveDir[1]) && this._ledgeAhead())
        this._moveDir = [0, 0];

      this.vel[0] = this._moveDir[0] * this.speed;
      this.vel[2] = this._moveDir[1] * this.speed;
      this.vel[1] = Physics.applyGravity(this.vel[1], inWater, dt);

      const step = [this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt];
      const before = this.pos.slice();
      const r = Collision.move(this.world, this.pos, step, this.half, this.height);
      this.onGround = r.onGround;
      if (r.onGround) this.vel[1] = 0;
      // Auto-jump when blocked horizontally while grounded.
      if ((r.collidedX || r.collidedZ) && this.onGround) this.vel[1] = 6.5;
      // Despawn if it fell into the void.
      if (this.pos[1] < -20) this.dead = true;

      // Simple animation phase from movement.
      this._anim = (this._anim || 0) + Math.hypot(this.pos[0] - before[0], this.pos[2] - before[2]) * 6;
    }

    damage(n) { this.health -= n; this.hurtFlash = 0.25; if (this.health <= 0) this.dead = true; }

    /**
     * Render the mob's cuboid parts. Parts are positioned relative to feet,
     * rotated by yaw around the vertical axis.
     * @param {Renderer} renderer
     */
    render(renderer) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      for (const part of this.parts) {
        const o = part.offset, s = part.size;
        // Rotate the part's XZ offset by yaw.
        const rx = o[0] * cos - o[2] * sin;
        const rz = o[0] * sin + o[2] * cos;
        // Center the cuboid: offset is the part center, convert to min corner.
        const origin = [
          this.pos[0] + rx - s[0] / 2,
          this.pos[1] + o[1],
          this.pos[2] + rz - s[2] / 2,
        ];
        let color = part.color || this.color;
        if (this.hurtFlash > 0) {
          // Blend toward red while hurt.
          color = [Math.min(1, color[0] * 0.4 + 0.7), color[1] * 0.4, color[2] * 0.4];
        }
        renderer.drawCuboid(origin, s, color);
      }
    }

    serialize() {
      return { type: this.type, pos: this.pos, health: this.health };
    }
  }

  MC.Mob = Mob;
})(typeof window !== 'undefined' ? window : this);
