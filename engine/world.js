/**
 * world.js — Procedural terrain generation and the world block/light accessor used
 * by the mesher and gameplay. Generates biome-influenced heightmaps, stone/dirt/
 * grass layering, beaches, water seas, ore pockets, 3D-noise caves and trees.
 * Exposes global `MC.World`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;
  const ID = Blocks.ID;
  const { SIZE_X, SIZE_Y, SIZE_Z } = MC.CHUNK;

  const SEA_LEVEL = 48;

  /**
   * Biome definitions. `surface`/`sub` are block ids; `treeChance` controls tree
   * density per column; `cactus` enables desert cacti.
   */
  const BIOMES = {
    plains: { name: 'Plains', surface: ID.GRASS, sub: ID.DIRT, treeChance: 0.012, cactus: false },
    forest: { name: 'Forest', surface: ID.GRASS, sub: ID.DIRT, treeChance: 0.08, cactus: false },
    desert: { name: 'Desert', surface: ID.SAND, sub: ID.SAND, treeChance: 0, cactus: true },
    tundra: { name: 'Tundra', surface: ID.SNOW, sub: ID.DIRT, treeChance: 0.01, cactus: false },
    snowyPeaks: { name: 'Snowy Peaks', surface: ID.SNOW, sub: ID.STONE, treeChance: 0.004, cactus: false },
    peaks: { name: 'Mountain Peaks', surface: ID.STONE, sub: ID.STONE, treeChance: 0, cactus: false },
  };

  class World {
    /** @param {number} seed terrain seed */
    constructor(seed = 20260630) {
      this.seed = seed;
      this.height = new MC.Noise(seed);
      this.detail = new MC.Noise(seed + 1);
      this.biome = new MC.Noise(seed + 2);
      this.cave = new MC.Noise(seed + 3);
      this.ore = new MC.Noise(seed + 4);
      this.chunks = new Map(); // key "cx,cz" -> Chunk
    }

    static key(cx, cz) { return cx + ',' + cz; }

    getChunk(cx, cz) { return this.chunks.get(World.key(cx, cz)) || null; }

    hasChunk(cx, cz) { return this.chunks.has(World.key(cx, cz)); }

    addChunk(chunk) { this.chunks.set(World.key(chunk.cx, chunk.cz), chunk); }

    /** World-space block read; returns AIR for ungenerated chunks. */
    getBlock(x, y, z) {
      if (y < 0 || y >= SIZE_Y) return ID.AIR;
      const cx = Math.floor(x / SIZE_X), cz = Math.floor(z / SIZE_Z);
      const c = this.getChunk(cx, cz);
      if (!c) return ID.AIR;
      return c.get(x - cx * SIZE_X, y, z - cz * SIZE_Z);
    }

    /** World-space light read (max of sky and block light, 0..15). */
    getLight(x, y, z) {
      if (y < 0) return 0;
      if (y >= SIZE_Y) return 15;
      const cx = Math.floor(x / SIZE_X), cz = Math.floor(z / SIZE_Z);
      const c = this.getChunk(cx, cz);
      if (!c) return 13; // assume lit so unloaded borders aren't black
      const lx = x - cx * SIZE_X, lz = z - cz * SIZE_Z;
      return Math.max(c.getSky(lx, y, lz), c.getBlockLight(lx, y, lz));
    }

    /** Set a block in world coords, marking the chunk dirty/modified. Returns chunk. */
    setBlock(x, y, z, id) {
      if (y < 0 || y >= SIZE_Y) return null;
      const cx = Math.floor(x / SIZE_X), cz = Math.floor(z / SIZE_Z);
      const c = this.getChunk(cx, cz);
      if (!c) return null;
      c.set(x - cx * SIZE_X, y, z - cz * SIZE_Z, id);
      c.modified = true;
      return c;
    }

    /** Sampled surface height (top solid Y) at world column (x,z). */
    surfaceHeight(x, z) {
      // Continent shape + mountains via layered fBm.
      const base = this.height.fbm2(x * 0.0045, z * 0.0045, 4) * 0.5 + 0.5; // 0..1
      const mountain = Math.pow(Math.max(0, this.height.fbm2(x * 0.0018 + 100, z * 0.0018 - 100, 4)), 1.4);
      const roughness = this.detail.fbm2(x * 0.02, z * 0.02, 3) * 4;
      let h = SEA_LEVEL - 6 + base * 26 + mountain * 60 + roughness;
      return Math.max(2, Math.min(SIZE_Y - 4, Math.floor(h)));
    }

    /**
     * Classify the biome at a world column. Combines a temperature and a humidity
     * noise field into a discrete biome with surface/subsurface block choices.
     * @returns {{name,temp,surface,sub,treeChance,cactus}}
     */
    biomeAt(x, z, h) {
      const temp = this.biome.fbm2(x * 0.0032, z * 0.0032, 3);            // -1..1 cold..hot
      const humid = this.biome.fbm2(x * 0.0036 + 500, z * 0.0036 - 500, 3);
      const mountainous = h > SEA_LEVEL + 30;

      // Most terrain noise lives within roughly ±0.2, so thresholds are modest.
      if (mountainous && temp < 0.0) return BIOMES.snowyPeaks;
      if (h > SEA_LEVEL + 46) return BIOMES.peaks;
      if (temp < -0.16) return BIOMES.tundra;
      if (temp > 0.14 && humid < 0.02) return BIOMES.desert;
      if (humid > 0.1) return BIOMES.forest;
      return BIOMES.plains;
    }

    /** Generate (fill) a chunk's block data. */
    generate(chunk) {
      const ox = chunk.cx * SIZE_X, oz = chunk.cz * SIZE_Z;
      chunk.biomeName = null;
      for (let lz = 0; lz < SIZE_Z; lz++) {
        for (let lx = 0; lx < SIZE_X; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const h = this.surfaceHeight(wx, wz);
          const beach = h <= SEA_LEVEL + 1 && h >= SEA_LEVEL - 2;
          const biome = this.biomeAt(wx, wz, h);
          if (lx === 8 && lz === 8) chunk.biomeName = biome.name;

          for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
            let id = ID.AIR;
            if (y === 0) id = ID.BEDROCK;
            else if (y < h - 4) id = ID.STONE;
            else if (y < h) id = beach ? ID.SAND : biome.sub;
            else if (y === h) {
              if (beach) id = ID.SAND;
              else id = biome.surface;
            } else if (y <= SEA_LEVEL) id = ID.WATER;

            // Carve caves with 3D noise (not above surface, keep crust).
            if (id === ID.STONE || (id === ID.DIRT && y < h)) {
              const cv = this.cave.fbm3(wx * 0.05, y * 0.06, wz * 0.05, 3);
              const cv2 = this.cave.perlin3(wx * 0.025 + 50, y * 0.03, wz * 0.025 - 50);
              if (y > 3 && y < h - 2 && (cv > 0.62 || Math.abs(cv2) < 0.04)) id = ID.AIR;
            }

            // Ore distribution in stone.
            if (id === ID.STONE) id = this._ore(wx, y, wz);

            if (id !== ID.AIR) chunk.set(lx, y, lz, id);
          }
        }
      }
      this._trees(chunk);
      chunk.generated = true;
      chunk.dirty = true;
    }

    /** Decide ore type for a stone cell based on depth + noise pockets. */
    _ore(x, y, z) {
      const n = this.ore.perlin3(x * 0.1, y * 0.1, z * 0.1);
      if (y < 16 && n > 0.78) return ID.DIAMOND;
      if (y < 28 && n < -0.8) return ID.GOLD;
      if (y < 48 && n > 0.72) return ID.IRON;
      if (n > 0.6) return ID.COAL;
      return ID.STONE;
    }

    /** Scatter biome-appropriate vegetation (trees / cacti) within the chunk. */
    _trees(chunk) {
      const ox = chunk.cx * SIZE_X, oz = chunk.cz * SIZE_Z;
      const rng = mulberry(chunk.cx * 73856093 ^ chunk.cz * 19349663 ^ this.seed);
      for (let lz = 2; lz < SIZE_Z - 2; lz++) {
        for (let lx = 2; lx < SIZE_X - 2; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const h = this.surfaceHeight(wx, wz);
          if (h <= SEA_LEVEL) continue;
          const biome = this.biomeAt(wx, wz, h);
          const surf = chunk.get(lx, h, lz);
          if (biome.cactus && surf === ID.SAND) {
            if (rng() < 0.02) this._placeCactus(chunk, lx, h + 1, lz, 2 + ((rng() * 3) | 0));
            continue;
          }
          if (biome.treeChance <= 0 || rng() > biome.treeChance) continue;
          if (surf !== ID.GRASS) continue;
          this._placeTree(chunk, lx, h + 1, lz, 4 + ((rng() * 3) | 0));
        }
      }
    }

    /** Build a desert cactus column. */
    _placeCactus(chunk, x, y, z, height) {
      for (let i = 0; i < height; i++) {
        if (y + i < SIZE_Y) chunk.set(x, y + i, z, ID.CACTUS);
      }
    }

    /** Build a single tree (trunk + leaf canopy) at local coords. */
    _placeTree(chunk, x, y, z, trunk) {
      for (let i = 0; i < trunk; i++) chunk.set(x, y + i, z, ID.WOOD);
      const top = y + trunk;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && dy >= 0) continue;
            const lx = x + dx, ly = top + dy, lz = z + dz;
            if (lx < 0 || lz < 0 || lx >= SIZE_X || lz >= SIZE_Z || ly >= SIZE_Y) continue;
            if (chunk.get(lx, ly, lz) === ID.AIR) chunk.set(lx, ly, lz, ID.LEAVES);
          }
      }
    }
  }

  /** Small deterministic PRNG for feature placement. */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  World.SEA_LEVEL = SEA_LEVEL;
  MC.World = World;
})(typeof window !== 'undefined' ? window : this);
