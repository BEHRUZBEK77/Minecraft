/**
 * player.js — First-person player: movement (walk/run/jump/fly), gravity, collision,
 * swimming, voxel raycasting for targeting blocks, and health/hunger state.
 * Exposes global `MC.Player`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const { vec3 } = MC.math;
  const Blocks = MC.Blocks;
  const Collision = MC.Collision;
  const Physics = MC.Physics;

  const HALF = 0.3;        // half width
  const HEIGHT = 1.8;      // body height
  const EYE = 1.62;        // eye height from feet
  const REACH = 6;         // block interaction distance

  class Player {
    /** @param {Camera} camera @param {World} world */
    constructor(camera, world) {
      this.camera = camera;
      this.world = world;
      this.pos = [8, 90, 8];      // feet position
      this.vel = [0, 0, 0];
      this.onGround = false;
      this.flying = false;
      this.inWater = false;
      this.speedWalk = 4.6;
      this.speedRun = 7.5;
      this.speedFly = 12;
      this.health = 20;
      this.maxHealth = 20;
      this.hunger = 20;
      this.maxHunger = 20;
      this._hungerTimer = 0;
      this._fallStart = null;
      this.gameMode = 'survival';  // or 'creative'
    }

    /** Eye world position used as the camera location. */
    eyePosition() { return [this.pos[0], this.pos[1] + EYE, this.pos[2]]; }

    /**
     * Update movement from input for dt seconds.
     * @param {Input} input
     * @param {number} dt seconds
     */
    update(input, dt) {
      const cam = this.camera;
      // Mouse look always works.
      if (input.mouse.dx || input.mouse.dy) cam.look(input.mouse.dx, input.mouse.dy);

      // While frozen (e.g. waiting for the ground chunk to load) only look around.
      if (this.frozen) { this.vel = [0, 0, 0]; cam.position = this.eyePosition(); return; }

      this.inWater = Collision.inLiquid(this.world, this.pos, HALF, HEIGHT);

      // Toggle flfight on double-tap not implemented; use 'KeyF'.
      if (input.wasPressed('KeyF')) this.flying = !this.flying;

      const fwd = cam.forwardFlat();
      const right = cam.right();
      let dx = 0, dz = 0;
      if (input.isDown('KeyW')) { dx += fwd[0]; dz += fwd[2]; }
      if (input.isDown('KeyS')) { dx -= fwd[0]; dz -= fwd[2]; }
      if (input.isDown('KeyD')) { dx += right[0]; dz += right[2]; }
      if (input.isDown('KeyA')) { dx -= right[0]; dz -= right[2]; }
      const len = Math.hypot(dx, dz);
      if (len > 0) { dx /= len; dz /= len; }

      const running = input.isDown('ShiftLeft') && !this.flying;
      let speed = this.flying ? this.speedFly : running ? this.speedRun : this.speedWalk;
      if (this.inWater && !this.flying) speed *= 0.6;

      if (this.flying) {
        this.vel[0] = dx * speed;
        this.vel[2] = dz * speed;
        this.vel[1] = 0;
        if (input.isDown('Space')) this.vel[1] = speed;
        if (input.isDown('ShiftLeft')) this.vel[1] = -speed;
        // Move with collision but no gravity.
        const step = [this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt];
        Collision.move(this.world, this.pos, step, HALF, HEIGHT);
      } else {
        // Horizontal velocity (snappy).
        this.vel[0] = dx * speed;
        this.vel[2] = dz * speed;
        // Jump / swim up.
        if (input.isDown('Space')) {
          if (this.inWater) this.vel[1] = 4;
          else if (this.onGround) { this.vel[1] = 8.4; this.onGround = false; }
        }
        // Gravity.
        this.vel[1] = Physics.applyGravity(this.vel[1], this.inWater, dt);

        const step = [this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt];
        const r = Collision.move(this.world, this.pos, step, HALF, HEIGHT);
        // Fall damage.
        this._fallDamage(r.onGround);
        this.onGround = r.onGround;
        if (r.onGround) this.vel[1] = 0;
      }

      // Keep above the void.
      if (this.pos[1] < -10) { this.pos[1] = 100; this.vel[1] = 0; this.damage(2); }

      cam.position = this.eyePosition();
      this._hunger(dt, len > 0, running);
    }

    /** Track falls and apply damage on hard landings (survival only). */
    _fallDamage(landed) {
      if (this.flying || this.inWater) { this._fallStart = null; return; }
      if (this.vel[1] < -0.1 && this._fallStart === null) this._fallStart = this.pos[1];
      if (landed && this._fallStart !== null) {
        const dist = this._fallStart - this.pos[1];
        if (dist > 4 && this.gameMode === 'survival') this.damage(Math.floor(dist - 3));
        this._fallStart = null;
      }
    }

    /** Drain hunger over time and regen/starve based on it. */
    _hunger(dt, moving, running) {
      if (this.gameMode !== 'survival') return;
      this._hungerTimer += dt * (moving ? (running ? 1.6 : 1) : 0.3);
      if (this._hungerTimer > 12) {
        this._hungerTimer = 0;
        if (this.hunger > 0) this.hunger--;
        else this.damage(1);
      }
      if (this.hunger >= 18 && this.health < this.maxHealth) {
        this._regen = (this._regen || 0) + dt;
        if (this._regen > 3) { this._regen = 0; this.health = Math.min(this.maxHealth, this.health + 1); }
      }
    }

    damage(n) { if (this.gameMode === 'creative') return; this.health = Math.max(0, this.health - n); }
    heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
    eat(n) { this.hunger = Math.min(this.maxHunger, this.hunger + n); }
    get dead() { return this.health <= 0; }

    /**
     * Voxel DDA raycast from the eye along the view direction.
     * @returns {?{x,y,z, nx,ny,nz, id}} hit block + the face normal, or null.
     */
    raycast(maxDist = REACH) {
      const origin = this.eyePosition();
      const dir = this.camera.forward();
      let x = Math.floor(origin[0]), y = Math.floor(origin[1]), z = Math.floor(origin[2]);
      const stepX = Math.sign(dir[0]), stepY = Math.sign(dir[1]), stepZ = Math.sign(dir[2]);
      const tDeltaX = dir[0] !== 0 ? Math.abs(1 / dir[0]) : Infinity;
      const tDeltaY = dir[1] !== 0 ? Math.abs(1 / dir[1]) : Infinity;
      const tDeltaZ = dir[2] !== 0 ? Math.abs(1 / dir[2]) : Infinity;
      const fract = (a, s) => s > 0 ? (1 - (a - Math.floor(a))) : (a - Math.floor(a));
      let tMaxX = dir[0] !== 0 ? fract(origin[0], stepX) * tDeltaX : Infinity;
      let tMaxY = dir[1] !== 0 ? fract(origin[1], stepY) * tDeltaY : Infinity;
      let tMaxZ = dir[2] !== 0 ? fract(origin[2], stepZ) * tDeltaZ : Infinity;
      let nx = 0, ny = 0, nz = 0;
      let t = 0;
      while (t <= maxDist) {
        const id = this.world.getBlock(x, y, z);
        if (id !== Blocks.ID.AIR && !Blocks.isLiquid(id)) {
          return { x, y, z, nx, ny, nz, id };
        }
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
        } else if (tMaxY < tMaxZ) {
          y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
        } else {
          z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
        }
      }
      return null;
    }

    /** Would placing a block at (x,y,z) intersect the player's body? */
    wouldCollide(x, y, z) {
      const mn = [this.pos[0] - HALF, this.pos[1], this.pos[2] - HALF];
      const mx = [this.pos[0] + HALF, this.pos[1] + HEIGHT, this.pos[2] + HALF];
      return x + 1 > mn[0] && x < mx[0] && y + 1 > mn[1] && y < mx[1] && z + 1 > mn[2] && z < mx[2];
    }

    /** Serialize state for saving. */
    serialize() {
      return { pos: this.pos, yaw: this.camera.yaw, pitch: this.camera.pitch,
        health: this.health, hunger: this.hunger, flying: this.flying, gameMode: this.gameMode };
    }

    /** Restore state from a save. */
    deserialize(s) {
      if (!s) return;
      this.pos = s.pos || this.pos;
      this.camera.yaw = s.yaw || 0;
      this.camera.pitch = s.pitch || 0;
      this.health = s.health ?? 20;
      this.hunger = s.hunger ?? 20;
      this.flying = !!s.flying;
      this.gameMode = s.gameMode || 'survival';
    }
  }

  Player.HALF = HALF; Player.HEIGHT = HEIGHT; Player.EYE = EYE; Player.REACH = REACH;
  MC.Player = Player;
})(typeof window !== 'undefined' ? window : this);
