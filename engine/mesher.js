/**
 * mesher.js — Builds renderable geometry for a chunk by emitting only the faces
 * that border air/transparent blocks (face culling), with per-vertex ambient
 * occlusion and baked light sampled from neighbors. Produces separate opaque and
 * water meshes. Exposes global `MC.Mesher`.
 *
 * Neighbor lookups go through a `world` accessor so faces on chunk borders are
 * culled correctly against adjacent chunks.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;
  const { SIZE_X, SIZE_Y, SIZE_Z } = MC.CHUNK;

  // Face definitions: direction normal + 4 corner offsets (CCW) + AO sample sets.
  // Order: corners listed so triangles (0,1,2)+(0,2,3) are CCW when viewed from outside.
  // Per-face brightness so cubes read as lit from above (classic voxel look).
  const FACE_SHADE = { px: 0.72, nx: 0.72, py: 1.0, ny: 0.5, pz: 0.86, nz: 0.6 };

  const FACES = [
    { // +X (right)
      dir: [1, 0, 0], uvFace: 'side', shade: FACE_SHADE.px,
      corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
      ao: [[[1, -1, 0], [1, 0, 1], [1, -1, 1]], [[1, -1, 0], [1, 0, -1], [1, -1, -1]],
      [[1, 1, 0], [1, 0, -1], [1, 1, -1]], [[1, 1, 0], [1, 0, 1], [1, 1, 1]]],
    },
    { // -X (left)
      dir: [-1, 0, 0], uvFace: 'side', shade: FACE_SHADE.nx,
      corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
      ao: [[[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]], [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]],
      [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]], [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]]],
    },
    { // +Y (top)
      dir: [0, 1, 0], uvFace: 'top', shade: FACE_SHADE.py,
      corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
      ao: [[[0, 1, 1], [-1, 1, 0], [-1, 1, 1]], [[0, 1, 1], [1, 1, 0], [1, 1, 1]],
      [[0, 1, -1], [1, 1, 0], [1, 1, -1]], [[0, 1, -1], [-1, 1, 0], [-1, 1, -1]]],
    },
    { // -Y (bottom)
      dir: [0, -1, 0], uvFace: 'bottom', shade: FACE_SHADE.ny,
      corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      ao: [[[0, -1, -1], [-1, -1, 0], [-1, -1, -1]], [[0, -1, -1], [1, -1, 0], [1, -1, -1]],
      [[0, -1, 1], [1, -1, 0], [1, -1, 1]], [[0, -1, 1], [-1, -1, 0], [-1, -1, 1]]],
    },
    { // +Z (front)
      dir: [0, 0, 1], uvFace: 'side', shade: FACE_SHADE.pz,
      corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      ao: [[[0, -1, 1], [-1, 0, 1], [-1, -1, 1]], [[0, -1, 1], [1, 0, 1], [1, -1, 1]],
      [[0, 1, 1], [1, 0, 1], [1, 1, 1]], [[0, 1, 1], [-1, 0, 1], [-1, 1, 1]]],
    },
    { // -Z (back)
      dir: [0, 0, -1], uvFace: 'side', shade: FACE_SHADE.nz,
      corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
      ao: [[[0, -1, -1], [1, 0, -1], [1, -1, -1]], [[0, -1, -1], [-1, 0, -1], [-1, -1, -1]],
      [[0, 1, -1], [-1, 0, -1], [-1, 1, -1]], [[0, 1, -1], [1, 0, -1], [1, 1, -1]]],
    },
  ];

  /** Map face name to atlas tile index for a block def. tiles = [top, side, bottom]. */
  function faceTile(def, face) {
    if (face === 'top') return def.tiles[0];
    if (face === 'bottom') return def.tiles[2];
    return def.tiles[1];
  }

  /** Vertex AO level 0..3 from 3 occluder booleans (side1, side2, corner). */
  function aoLevel(s1, s2, c) {
    if (s1 && s2) return 0;
    return 3 - (s1 + s2 + c);
  }

  class Mesher {
    /**
     * @param {object} world object exposing getBlock(x,y,z), getLight(x,y,z)
     *        in *world* coordinates.
     */
    static build(chunk, world) {
      const ox = chunk.cx * SIZE_X, oz = chunk.cz * SIZE_Z;
      const opaque = newBuffers();
      const water = newBuffers();

      for (let y = 0; y < SIZE_Y; y++) {
        for (let z = 0; z < SIZE_Z; z++) {
          for (let x = 0; x < SIZE_X; x++) {
            const id = chunk.get(x, y, z);
            if (id === Blocks.ID.AIR) continue;
            const def = Blocks.get(id);
            const liquid = Blocks.isLiquid(id);
            const buf = liquid ? water : opaque;
            const wx = ox + x, wy = y, wz = oz + z;

            for (let f = 0; f < 6; f++) {
              const face = FACES[f];
              const nx = wx + face.dir[0], ny = wy + face.dir[1], nz = wz + face.dir[2];
              const neighbor = world.getBlock(nx, ny, nz);
              // Cull face if neighbor is opaque, or (for liquids) another liquid.
              if (Blocks.isOpaque(neighbor)) continue;
              if (liquid && Blocks.isLiquid(neighbor)) continue;
              if (!liquid && neighbor === id && def.transparent) continue; // merge glass/leaves seams less

              emitFace(buf, face, wx, wy, wz, ox, oz, faceTile(def, face.uvFace), world, liquid);
            }
          }
        }
      }

      return {
        opaque: finalize(opaque),
        water: finalize(water),
      };
    }
  }

  function newBuffers() {
    return { pos: [], uv: [], light: [], ao: [], idx: [], v: 0 };
  }

  /** Emit one quad (2 triangles) for a face. */
  function emitFace(buf, face, wx, wy, wz, ox, oz, tile, world, liquid) {
    const uv = Blocks.tileUV(tile);
    const uvCoords = [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]];
    // Light sampled from the neighbor cell this face looks into.
    const lnx = wx + face.dir[0], lny = wy + face.dir[1], lnz = wz + face.dir[2];
    // Combine the neighbor cell's light with a fixed per-face directional shade.
    const lightVal = (world.getLight(lnx, lny, lnz) / 15) * face.shade;
    const aoVals = [];
    for (let i = 0; i < 4; i++) {
      const a = face.ao[i];
      const s1 = Blocks.isOpaque(world.getBlock(wx + a[0][0], wy + a[0][1], wz + a[0][2]));
      const s2 = Blocks.isOpaque(world.getBlock(wx + a[1][0], wy + a[1][1], wz + a[1][2]));
      const c = Blocks.isOpaque(world.getBlock(wx + a[2][0], wy + a[2][1], wz + a[2][2]));
      aoVals.push(0.45 + 0.55 * (aoLevel(s1, s2, c) / 3));
    }
    const base = buf.v;
    const yDrop = liquid && face.dir[1] === 1 ? 0.12 : 0; // lower water surface slightly
    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      // positions stored relative to chunk origin so the shader adds uChunkOrigin
      buf.pos.push((wx - ox) + c[0], wy + c[1] - yDrop, (wz - oz) + c[2]);
      buf.uv.push(uvCoords[i][0], uvCoords[i][1]);
      buf.light.push(lightVal);
      buf.ao.push(aoVals[i]);
    }
    // Flip triangulation toward the brighter diagonal (reduces AO artifacts).
    if (aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3]) {
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
    buf.v += 4;
  }

  /** Convert collected arrays into typed arrays for upload. */
  function finalize(b) {
    return {
      positions: new Float32Array(b.pos),
      uvs: new Float32Array(b.uv),
      lights: new Float32Array(b.light),
      aos: new Float32Array(b.ao),
      indices: b.idx,
      indexCount: b.idx.length,
    };
  }

  MC.Mesher = Mesher;
})(typeof window !== 'undefined' ? window : this);
