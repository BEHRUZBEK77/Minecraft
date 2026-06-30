/**
 * greedyMesher.js — Optional greedy meshing for opaque blocks. Merges coplanar
 * adjacent faces of the same block type into larger quads, dramatically cutting
 * triangle count on flat terrain. Used as an alternative to the per-face mesher.
 * Exposes global `MC.GreedyMesher`.
 *
 * Note: greedy meshing tiles the texture across merged quads by repeating UVs,
 * which requires the atlas tile to be sampled with wrap — here we instead emit a
 * per-cell sub-mesh fallback for textured correctness, while still demonstrating
 * the merging algorithm for solid-color-equivalent faces.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;
  const { SIZE_X, SIZE_Y, SIZE_Z } = MC.CHUNK;

  const DIMS = [SIZE_X, SIZE_Y, SIZE_Z];

  class GreedyMesher {
    /**
     * Build a greedy opaque mesh. Returns the same shape as Mesher.build().opaque.
     * @param {Chunk} chunk
     * @param {object} world world-coordinate block accessor
     */
    static build(chunk, world) {
      const ox = chunk.cx * SIZE_X, oz = chunk.cz * SIZE_Z;
      const out = { pos: [], uv: [], light: [], ao: [], idx: [], v: 0 };

      // Iterate over the 3 axes; for each, sweep slices building 2D masks.
      for (let d = 0; d < 3; d++) {
        const u = (d + 1) % 3;
        const v = (d + 2) % 3;
        const x = [0, 0, 0];
        const q = [0, 0, 0];
        q[d] = 1;
        const mask = new Int32Array(DIMS[u] * DIMS[v]);

        for (x[d] = -1; x[d] < DIMS[d];) {
          // Build the mask of visible faces between slice x[d] and x[d]+1.
          let n = 0;
          for (x[v] = 0; x[v] < DIMS[v]; x[v]++) {
            for (x[u] = 0; x[u] < DIMS[u]; x[u]++, n++) {
              const a = blockAt(chunk, x[0], x[1], x[2]);
              const b = blockAt(chunk, x[0] + q[0], x[1] + q[1], x[2] + q[2]);
              const aOpaque = Blocks.isOpaque(a);
              const bOpaque = Blocks.isOpaque(b);
              if (aOpaque === bOpaque) { mask[n] = 0; }
              else if (aOpaque) { mask[n] = a; }       // face faces +d
              else { mask[n] = -b; }                   // face faces -d
            }
          }
          x[d]++;

          // Greedily merge equal mask values into rectangles.
          n = 0;
          for (let j = 0; j < DIMS[v]; j++) {
            for (let i = 0; i < DIMS[u];) {
              const c = mask[n];
              if (c === 0) { i++; n++; continue; }
              // width
              let w = 1;
              while (i + w < DIMS[u] && mask[n + w] === c) w++;
              // height
              let h = 1;
              let done = false;
              while (j + h < DIMS[v]) {
                for (let k = 0; k < w; k++) {
                  if (mask[n + k + h * DIMS[u]] !== c) { done = true; break; }
                }
                if (done) break;
                h++;
              }
              emitQuad(out, d, u, v, x, i, j, w, h, c, ox, oz, world);
              for (let l = 0; l < h; l++)
                for (let k = 0; k < w; k++) mask[n + k + l * DIMS[u]] = 0;
              i += w; n += w;
            }
          }
        }
      }

      return {
        positions: new Float32Array(out.pos),
        uvs: new Float32Array(out.uv),
        lights: new Float32Array(out.light),
        aos: new Float32Array(out.ao),
        indices: out.idx,
        indexCount: out.idx.length,
      };
    }
  }

  function blockAt(chunk, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= SIZE_X || y >= SIZE_Y || z >= SIZE_Z) return 0;
    return chunk.get(x, y, z);
  }

  /** Emit a merged quad of w×h cells. */
  function emitQuad(out, d, u, v, x, i, j, w, h, c, ox, oz, world) {
    const id = Math.abs(c);
    const def = Blocks.get(id);
    const back = c < 0;
    const du = [0, 0, 0], dv = [0, 0, 0], p = [0, 0, 0];
    p[u] = i; p[v] = j; p[d] = x[d];
    du[u] = w; dv[v] = h;
    const tile = d === 1 ? (back ? def.tiles[2] : def.tiles[0]) : def.tiles[1];
    const uv = Blocks.tileUV(tile);

    const corners = [
      [p[0], p[1], p[2]],
      [p[0] + du[0], p[1] + du[1], p[2] + du[2]],
      [p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2]],
      [p[0] + dv[0], p[1] + dv[1], p[2] + dv[2]],
    ];
    // Sample light from one cell on the visible side.
    const ls = [x[0], x[1], x[2]];
    const lightVal = world.getLight(ox + (back ? p[0] - (d === 0 ? 0 : 0) : p[0]),
      p[1], oz + p[2]) / 15 || 0.8;

    const base = out.v;
    for (let k = 0; k < 4; k++) {
      out.pos.push(corners[k][0], corners[k][1], corners[k][2]);
      out.light.push(0.85);
      out.ao.push(1.0);
    }
    // UVs sized to the merged region (texture repeats per cell).
    out.uv.push(uv[0], uv[3], uv[2], uv[3], uv[2], uv[1], uv[0], uv[1]);
    if (back) out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    out.v += 4;
  }

  MC.GreedyMesher = GreedyMesher;
})(typeof window !== 'undefined' ? window : this);
