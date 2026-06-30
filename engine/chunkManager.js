/**
 * chunkManager.js — Streams chunks around the player: generates new chunks, lights
 * and meshes them within a per-frame time budget, remeshes dirty chunks, unloads
 * distant ones, and renders all visible chunks with frustum culling.
 * Exposes global `MC.ChunkManager`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const { SIZE_X, SIZE_Z } = MC.CHUNK;

  class ChunkManager {
    /**
     * @param {World} world
     * @param {Renderer} renderer
     * @param {object} [opts] { renderDistance }
     */
    constructor(world, renderer, opts = {}) {
      this.world = world;
      this.renderer = renderer;
      this.renderDistance = opts.renderDistance || 8;
      this.maxBuildsPerFrame = 3;   // chunk generation budget
      this.maxMeshesPerFrame = 4;   // mesh upload budget
      this.useGreedy = false;
    }

    /** Convert world position to chunk coords. */
    static chunkCoord(x, z) { return [Math.floor(x / SIZE_X), Math.floor(z / SIZE_Z)]; }

    /**
     * Update streaming based on player position. Generates & meshes within budget.
     * @param {number} px player world X
     * @param {number} pz player world Z
     */
    update(px, pz) {
      const [pcx, pcz] = ChunkManager.chunkCoord(px, pz);
      const R = this.renderDistance;
      // Generate one ring beyond the render distance so the outer visible ring has
      // neighbors and can be meshed (otherwise the edge stays invisible).
      const G = R + 1;
      let builds = 0;
      const candidates = [];
      for (let dz = -G; dz <= G; dz++) {
        for (let dx = -G; dx <= G; dx++) {
          const cx = pcx + dx, cz = pcz + dz;
          if (dx * dx + dz * dz > G * G) continue;
          if (!this.world.hasChunk(cx, cz)) candidates.push([dx * dx + dz * dz, cx, cz]);
        }
      }
      candidates.sort((a, b) => a[0] - b[0]);
      for (const [, cx, cz] of candidates) {
        if (builds >= this.maxBuildsPerFrame) break;
        this._createChunk(cx, cz);
        builds++;
      }

      // Unload chunks beyond render distance + 2.
      const limit = (R + 2);
      for (const [key, chunk] of this.world.chunks) {
        if (Math.abs(chunk.cx - pcx) > limit || Math.abs(chunk.cz - pcz) > limit) {
          if (chunk.modified && this.onUnloadSave) this.onUnloadSave(chunk);
          this.renderer.deleteMesh(chunk.mesh);
          this.renderer.deleteMesh(chunk.waterMesh);
          this.world.chunks.delete(key);
        }
      }

      // Remesh dirty chunks (those just generated or edited) within budget.
      let meshes = 0;
      // Prefer dirty chunks closest to the player.
      const dirty = [];
      for (const chunk of this.world.chunks.values()) {
        if (chunk.dirty && chunk.generated && this._neighborsReady(chunk))
          dirty.push(chunk);
      }
      dirty.sort((a, b) =>
        ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2));
      for (const chunk of dirty) {
        if (meshes >= this.maxMeshesPerFrame) break;
        this._remesh(chunk);
        meshes++;
      }
    }

    /** Ensure neighbor chunks exist so border faces/light are correct. */
    _neighborsReady(chunk) {
      return this.world.hasChunk(chunk.cx + 1, chunk.cz) &&
        this.world.hasChunk(chunk.cx - 1, chunk.cz) &&
        this.world.hasChunk(chunk.cx, chunk.cz + 1) &&
        this.world.hasChunk(chunk.cx, chunk.cz - 1);
    }

    _createChunk(cx, cz) {
      const chunk = new MC.Chunk(cx, cz);
      // Restore saved edits if available, else procedurally generate.
      if (this.onLoadChunk && this.onLoadChunk(chunk)) {
        chunk.generated = true;
        chunk.dirty = true;
      } else {
        this.world.generate(chunk);
      }
      MC.Lighting.compute(chunk);
      this.world.addChunk(chunk);
      // Mark existing neighbors dirty so shared-border faces re-cull correctly.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.world.getChunk(cx + dx, cz + dz);
        if (n) n.dirty = true;
      }
      return chunk;
    }

    /** Rebuild + upload a chunk's GPU mesh. */
    _remesh(chunk) {
      MC.Lighting.compute(chunk);
      let opaque, water;
      if (this.useGreedy) {
        opaque = MC.GreedyMesher.build(chunk, this.world);
        water = MC.Mesher.build(chunk, this.world).water;
      } else {
        const built = MC.Mesher.build(chunk, this.world);
        opaque = built.opaque; water = built.water;
      }
      this.renderer.deleteMesh(chunk.mesh);
      this.renderer.deleteMesh(chunk.waterMesh);
      chunk.mesh = this.renderer.uploadMesh(opaque);
      chunk.waterMesh = this.renderer.uploadMesh(water);
      chunk.empty = !chunk.mesh && !chunk.waterMesh;
      chunk.dirty = false;
    }

    /** Mark a chunk and any neighbors sharing a border as needing a remesh. */
    markDirty(wx, wy, wz) {
      const cx = Math.floor(wx / SIZE_X), cz = Math.floor(wz / SIZE_Z);
      const lx = wx - cx * SIZE_X, lz = wz - cz * SIZE_Z;
      const touch = (a, b) => { const c = this.world.getChunk(a, b); if (c) c.dirty = true; };
      touch(cx, cz);
      if (lx === 0) touch(cx - 1, cz);
      if (lx === SIZE_X - 1) touch(cx + 1, cz);
      if (lz === 0) touch(cx, cz - 1);
      if (lz === SIZE_Z - 1) touch(cx, cz + 1);
    }

    /** Render all loaded chunks: opaque pass then transparent water pass. */
    render(camera) {
      const gl = this.renderer.gl;
      const fogStart = (this.renderDistance - 2) * SIZE_X;
      const fogEnd = (this.renderDistance) * SIZE_X;
      this.renderer.beginVoxel(camera, fogStart, fogEnd);

      const visible = [];
      for (const chunk of this.world.chunks.values()) {
        const a = chunk.aabb();
        if (!camera.boxInFrustum(a[0], a[1], a[2], a[3], a[4], a[5])) continue;
        visible.push(chunk);
      }
      // Opaque pass.
      for (const chunk of visible)
        this.renderer.drawChunkMesh(chunk.mesh, chunk.cx * SIZE_X, chunk.cz * SIZE_Z, 1);
      // Transparent water pass: disable culling + enable blend.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.renderer.setWaterPass(true);
      for (const chunk of visible)
        this.renderer.drawChunkMesh(chunk.waterMesh, chunk.cx * SIZE_X, chunk.cz * SIZE_Z, 0.72);
      this.renderer.setWaterPass(false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      return visible.length;
    }

    /** Count loaded chunks. */
    get loadedCount() { return this.world.chunks.size; }
  }

  MC.ChunkManager = ChunkManager;
})(typeof window !== 'undefined' ? window : this);
