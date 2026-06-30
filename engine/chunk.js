/**
 * chunk.js — Chunk storage (16 x 128 x 16) with block + light arrays and GPU mesh
 * handles. Coordinates inside a chunk are local (0..15, 0..127, 0..15).
 * Exposes global `MC.Chunk` and chunk size constants on `MC.CHUNK`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  const SIZE_X = 16, SIZE_Z = 16, SIZE_Y = 128;
  const AREA = SIZE_X * SIZE_Z;          // blocks per Y layer
  const VOLUME = AREA * SIZE_Y;

  /** Flatten local coords to array index. y is the slowest-varying axis. */
  function index(x, y, z) { return x + z * SIZE_X + y * AREA; }

  class Chunk {
    /** @param {number} cx chunk X coord, @param {number} cz chunk Z coord */
    constructor(cx, cz) {
      this.cx = cx;
      this.cz = cz;
      this.blocks = new Uint8Array(VOLUME);
      this.light = new Uint8Array(VOLUME);   // packed: high nibble=sky, low nibble=block
      this.dirty = true;                     // needs remesh
      this.generated = false;
      this.modified = false;                 // player-edited (needs save)
      // GPU buffers (filled by renderer): opaque + transparent passes
      this.mesh = null;        // { vao-less: posBuf, count }
      this.waterMesh = null;
      this.empty = true;       // no solid faces
    }

    inBounds(x, y, z) { return x >= 0 && x < SIZE_X && y >= 0 && y < SIZE_Y && z >= 0 && z < SIZE_Z; }

    get(x, y, z) {
      if (!this.inBounds(x, y, z)) return 0;
      return this.blocks[index(x, y, z)];
    }

    set(x, y, z, id) {
      if (!this.inBounds(x, y, z)) return;
      this.blocks[index(x, y, z)] = id;
      this.dirty = true;
    }

    getSky(x, y, z) { return this.light[index(x, y, z)] >> 4; }
    getBlockLight(x, y, z) { return this.light[index(x, y, z)] & 15; }
    setSky(x, y, z, v) { const i = index(x, y, z); this.light[i] = (this.light[i] & 15) | (v << 4); }
    setBlockLight(x, y, z, v) { const i = index(x, y, z); this.light[i] = (this.light[i] & 0xf0) | v; }

    /** World-space AABB used for frustum culling. */
    aabb() {
      const x0 = this.cx * SIZE_X, z0 = this.cz * SIZE_Z;
      return [x0, 0, z0, x0 + SIZE_X, SIZE_Y, z0 + SIZE_Z];
    }
  }

  MC.Chunk = Chunk;
  MC.CHUNK = { SIZE_X, SIZE_Y, SIZE_Z, AREA, VOLUME, index };
})(typeof window !== 'undefined' ? window : this);
