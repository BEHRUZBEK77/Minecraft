/**
 * collision.js — Axis-aligned bounding box (AABB) collision against the voxel grid.
 * Provides swept per-axis movement resolution so entities slide along walls and
 * stand on floors. Exposes global `MC.Collision`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;

  class Collision {
    /**
     * Test whether an AABB overlaps any solid block.
     * @param {World} world
     * @param {number[]} min [x,y,z] lower corner
     * @param {number[]} max [x,y,z] upper corner
     */
    static overlapsSolid(world, min, max) {
      const x0 = Math.floor(min[0]), x1 = Math.floor(max[0]);
      const y0 = Math.floor(min[1]), y1 = Math.floor(max[1]);
      const z0 = Math.floor(min[2]), z1 = Math.floor(max[2]);
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++)
            if (Blocks.isSolid(world.getBlock(x, y, z))) return true;
      return false;
    }

    /**
     * Move an entity (position = feet center, with half-extents) one frame,
     * resolving collisions per axis. Mutates `pos` and returns flags.
     * @returns {{onGround:boolean, collidedX:boolean, collidedZ:boolean}}
     */
    static move(world, pos, vel, half, height) {
      const result = { onGround: false, collidedX: false, collidedZ: false };
      const box = (p) => [
        [p[0] - half, p[1], p[2] - half],
        [p[0] + half, p[1] + height, p[2] + half],
      ];

      // X axis
      if (vel[0] !== 0) {
        pos[0] += vel[0];
        const [mn, mx] = box(pos);
        if (Collision.overlapsSolid(world, mn, mx)) {
          pos[0] -= vel[0];
          // step toward contact
          pos[0] += Collision._resolve(world, pos, vel[0], 0, half, height);
          result.collidedX = true;
          vel[0] = 0;
        }
      }
      // Z axis
      if (vel[2] !== 0) {
        pos[2] += vel[2];
        const [mn, mx] = box(pos);
        if (Collision.overlapsSolid(world, mn, mx)) {
          pos[2] -= vel[2];
          pos[2] += Collision._resolve(world, pos, vel[2], 2, half, height);
          result.collidedZ = true;
          vel[2] = 0;
        }
      }
      // Y axis
      if (vel[1] !== 0) {
        pos[1] += vel[1];
        const [mn, mx] = box(pos);
        if (Collision.overlapsSolid(world, mn, mx)) {
          pos[1] -= vel[1];
          pos[1] += Collision._resolve(world, pos, vel[1], 1, half, height);
          if (vel[1] < 0) result.onGround = true;
          vel[1] = 0;
        }
      }
      return result;
    }

    /** Binary-search the largest safe move along one axis toward a collision. */
    static _resolve(world, pos, delta, axis, half, height) {
      let lo = 0, hi = delta;
      const test = (d) => {
        const p = pos.slice();
        p[axis] += d;
        const mn = [p[0] - half, p[1], p[2] - half];
        const mx = [p[0] + half, p[1] + height, p[2] + half];
        return !Collision.overlapsSolid(world, mn, mx);
      };
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (test(mid)) lo = mid; else hi = mid;
      }
      return lo;
    }

    /** True if the entity's AABB intersects any liquid block. */
    static inLiquid(world, pos, half, height) {
      const x0 = Math.floor(pos[0] - half), x1 = Math.floor(pos[0] + half);
      const y0 = Math.floor(pos[1]), y1 = Math.floor(pos[1] + height);
      const z0 = Math.floor(pos[2] - half), z1 = Math.floor(pos[2] + half);
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++)
            if (Blocks.isLiquid(world.getBlock(x, y, z))) return true;
      return false;
    }
  }

  MC.Collision = Collision;
})(typeof window !== 'undefined' ? window : this);
