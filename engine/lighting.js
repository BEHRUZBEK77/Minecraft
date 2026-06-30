/**
 * lighting.js — Per-chunk flood-fill lighting. Computes skylight (sunlight that
 * falls vertically without attenuation and spreads horizontally with falloff) and
 * block light from emitters such as torches. Light is stored packed in the chunk's
 * `light` array (high nibble sky, low nibble block). Exposes global `MC.Lighting`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;
  const { SIZE_X, SIZE_Y, SIZE_Z, index } = MC.CHUNK;

  // Neighbor offsets for BFS.
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

  class Lighting {
    /** Recompute all lighting for a chunk in place. */
    static compute(chunk) {
      chunk.light.fill(0);
      Lighting._sky(chunk);
      Lighting._block(chunk);
    }

    /** Skylight flood fill. */
    static _sky(chunk) {
      const queue = [];
      const transparent = (x, y, z) => !Blocks.isOpaque(chunk.get(x, y, z));
      // Seed the top layer.
      for (let z = 0; z < SIZE_Z; z++) {
        for (let x = 0; x < SIZE_X; x++) {
          let y = SIZE_Y - 1;
          // Descend through open sky at full strength.
          while (y >= 0 && transparent(x, y, z)) {
            chunk.setSky(x, y, z, 15);
            queue.push((x) | (y << 5) | (z << 13));
            y--;
          }
        }
      }
      // Horizontal spread with attenuation.
      let head = 0;
      while (head < queue.length) {
        const v = queue[head++];
        const x = v & 31, y = (v >> 5) & 255, z = (v >> 13) & 31;
        const level = chunk.getSky(x, y, z);
        if (level <= 1) continue;
        for (let i = 0; i < NB.length; i++) {
          const nx = x + NB[i][0], ny = y + NB[i][1], nz = z + NB[i][2];
          if (nx < 0 || ny < 0 || nz < 0 || nx >= SIZE_X || ny >= SIZE_Y || nz >= SIZE_Z) continue;
          if (Blocks.isOpaque(chunk.get(nx, ny, nz))) continue;
          // Downward propagation at full strength was already seeded; here -1.
          const newLevel = level - 1;
          if (chunk.getSky(nx, ny, nz) < newLevel) {
            chunk.setSky(nx, ny, nz, newLevel);
            queue.push(nx | (ny << 5) | (nz << 13));
          }
        }
      }
    }

    /** Block-light flood fill from emitters. */
    static _block(chunk) {
      const queue = [];
      for (let y = 0; y < SIZE_Y; y++)
        for (let z = 0; z < SIZE_Z; z++)
          for (let x = 0; x < SIZE_X; x++) {
            const def = Blocks.get(chunk.get(x, y, z));
            if (def.light > 0) {
              chunk.setBlockLight(x, y, z, def.light);
              queue.push(x | (y << 5) | (z << 13));
            }
          }
      let head = 0;
      while (head < queue.length) {
        const v = queue[head++];
        const x = v & 31, y = (v >> 5) & 255, z = (v >> 13) & 31;
        const level = chunk.getBlockLight(x, y, z);
        if (level <= 1) continue;
        for (let i = 0; i < NB.length; i++) {
          const nx = x + NB[i][0], ny = y + NB[i][1], nz = z + NB[i][2];
          if (nx < 0 || ny < 0 || nz < 0 || nx >= SIZE_X || ny >= SIZE_Y || nz >= SIZE_Z) continue;
          if (Blocks.isOpaque(chunk.get(nx, ny, nz))) continue;
          if (chunk.getBlockLight(nx, ny, nz) < level - 1) {
            chunk.setBlockLight(nx, ny, nz, level - 1);
            queue.push(nx | (ny << 5) | (nz << 13));
          }
        }
      }
    }
  }

  MC.Lighting = Lighting;
})(typeof window !== 'undefined' ? window : this);
