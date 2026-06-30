/**
 * main.js — Game bootstrap and main loop. Wires the engine modules together,
 * manages menus, the day/night cycle, weather, mob spawning, block break/place
 * with progress + particles, persistence, and per-frame rendering.
 * Exposes global `MC.Game` and starts on DOMContentLoaded.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;

  // World time: full day length in seconds (Minecraft-style ~20min; spec ~24min).
  const DAY_LENGTH = 1200;
  const SAVE_INTERVAL = 20; // seconds

  class Game {
    constructor() {
      this.canvas = document.getElementById('gl');
      this.fx = document.getElementById('fx');
      this.fxCtx = this.fx.getContext('2d');
      this.renderer = new MC.Renderer(this.canvas);
      this.atlasCanvas = this.renderer.atlasCanvas;
      this.camera = new MC.Camera();
      this.input = new MC.Input(this.canvas);
      this.audio = new MC.Audio();
      this.save = new MC.Save();
      this.inventory = new MC.Inventory();

      this.world = null;
      this.player = null;
      this.chunks = null;
      this.mobs = [];

      this.time = 0.3;          // 0..1, 0.25 = sunrise, 0.5 = noon
      this.weather = 'clear';   // clear | rain | storm
      this._weatherTimer = 60;
      this._saveTimer = 0;
      this._spawnTimer = 0;
      this.running = false;
      this.paused = false;
      this.started = false;

      this.ui = new MC.UI(this);
      this._particles = [];     // 2D fx particles
      this._rainDrops = [];
      this._breaking = null;    // {x,y,z,progress}
      this._fps = 0; this._frames = 0; this._fpsTime = 0;
      this._last = performance.now();

      this._bindUI();
      this._resize();
      addEventListener('resize', () => this._resize());
    }

    _resize() {
      this.aspect = this.renderer.resize();
      this.fx.width = this.canvas.clientWidth;
      this.fx.height = this.canvas.clientHeight;
    }

    /** Wire menu buttons + global keys. */
    _bindUI() {
      const click = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
      click('btnNewSurvival', () => this.startGame('survival', true));
      click('btnNewCreative', () => this.startGame('creative', true));
      click('btnContinue', () => this.startGame(null, false));
      click('btnResume', () => this.resume());
      click('btnSaveQuit', async () => { await this.saveAll(); location.reload(); });
      click('btnRespawn', () => this.respawn());

      this.input.onLockChange = (locked) => {
        if (!locked && this.running && !this.ui.invOpen && !this.player?.dead) this.pause();
      };

      addEventListener('keydown', (e) => {
        if (!this.started) return;
        if (e.code === 'Escape') {
          if (this.ui.invOpen) { this.ui.closeInventory(); this.input.lock(); }
          else if (this.paused) this.resume();
          else this.pause();
        }
        if (e.code === 'KeyE' && !this.paused && !this.player?.dead) {
          if (this.ui.invOpen) { this.ui.closeInventory(); this.input.lock(); }
          else { this.openInventory(false); }
        }
        if (e.code === 'F3') { e.preventDefault(); this.ui.toggleDebug(); }
        // Hotbar number keys.
        if (e.code.startsWith('Digit')) {
          const n = parseInt(e.code.slice(5), 10) - 1;
          if (n >= 0 && n < 9) { this.inventory.selectHotbar(n); this.ui.renderHotbar(); }
        }
      });
    }

    /** Begin or continue a game. */
    async startGame(mode, fresh) {
      this.ui.hideMainMenu();
      this.ui.showLoading(0, 'Generating world...');
      this.audio.init(); this.audio.resume();

      let meta = null;
      if (!fresh) meta = await this.save.loadMeta('world');
      if (fresh) await this.save.clear();

      const seed = meta?.seed ?? ((Math.random() * 1e9) | 0);
      this.world = new MC.World(seed);
      this.player = new MC.Player(this.camera, this.world);
      this.chunks = new MC.ChunkManager(this.world, this.renderer, { renderDistance: 7 });

      // Hook chunk save/load through the manager.
      this._savedKeys = await this.save.loadChunkKeys();
      this.chunks.onLoadChunk = (chunk) => {
        if (this._savedKeys.has(chunk.cx + ',' + chunk.cz)) {
          // Synchronous-ish: blocks restored async; trigger async load + remesh.
          this.save.loadChunkInto(chunk).then(() => { chunk.dirty = true; });
          this.world.generate(chunk); // base terrain, overwritten when load resolves
          return true;
        }
        return false;
      };
      this.chunks.onUnloadSave = (chunk) => { if (chunk.modified) this.save.saveChunk(chunk); };

      // Restore or initialize player + inventory.
      if (meta) {
        this.player.deserialize(meta.player);
        this.inventory.deserialize(meta.inventory);
        this.time = meta.time ?? this.time;
        this.weather = meta.weather ?? 'clear';
      } else {
        this.player.gameMode = mode;
        if (mode === 'creative') { this.inventory.fillCreative(); this.player.flying = true; }
        else this.inventory.giveStarter();
      }

      // Pre-generate spawn area for a smooth start.
      await this._preloadSpawn();

      // Drop the player onto the surface at spawn.
      if (!meta) this._placePlayerAtSurface();

      this.ui.hideLoading();
      this.started = true;
      this.running = true;
      this.paused = false;
      this.ui.renderHotbar();
      this.audio.startMusic();
      this.input.lock();
      requestAnimationFrame((t) => this._loop(t));
    }

    /** Generate the chunks immediately around spawn before play begins. */
    async _preloadSpawn() {
      const R = 4;
      const total = (R * 2 + 1) ** 2;
      let done = 0;
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const c = new MC.Chunk(dx, dz);
          this.world.generate(c);
          MC.Lighting.compute(c);
          this.world.addChunk(c);
          done++;
          if (done % 5 === 0) { this.ui.showLoading(done / total, 'Building terrain...'); await frame(); }
        }
      }
      // Mesh them.
      for (const c of this.world.chunks.values()) this.chunks._remesh(c);
    }

    /** Find a safe surface Y at the player's spawn column. */
    _placePlayerAtSurface() {
      const x = 8, z = 8;
      let y = MC.CHUNK.SIZE_Y - 1;
      while (y > 0 && this.world.getBlock(x, y, z) === Blocks.ID.AIR) y--;
      this.player.pos = [x + 0.5, y + 1, z + 0.5];
    }

    pause() {
      if (this.player?.dead) return;
      this.paused = true; this.input.unlock(); this.ui.showPause();
    }
    resume() {
      this.paused = false; this.ui.hidePause(); this.input.lock(); this.audio.resume();
      this._last = performance.now();
    }
    openInventory(table) {
      this.input.unlock();
      this.ui.openInventory(table || this.inventory.creative);
    }
    respawn() {
      this.player.health = this.player.maxHealth;
      this.player.hunger = this.player.maxHunger;
      this._placePlayerAtSurface();
      this.player.vel = [0, 0, 0];
      this.ui.hideDeath();
      this.resume();
    }

    /* ---------------- Main loop ---------------- */
    _loop(now) {
      if (!this.running) return;
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.1) dt = 0.1;  // clamp huge frame gaps

      if (!this.paused && !this.ui.invOpen && !this.player.dead) {
        this._update(dt);
      }
      this._render();
      this._fpsCount(dt);
      this.input.endFrame();
      requestAnimationFrame((t) => this._loop(t));
    }

    _update(dt) {
      // Day/night advance.
      this.time = (this.time + dt / DAY_LENGTH) % 1;
      this._updateWeather(dt);

      // Player.
      this.player.update(this.input, dt);
      if (this.player.dead) { this.ui.showDeath(); this.input.unlock(); this.audio.hurt(); }

      // Footstep audio.
      if (this.player.onGround && (Math.abs(this.player.vel[0]) + Math.abs(this.player.vel[2])) > 0.5) {
        this._step = (this._step || 0) + dt;
        if (this._step > 0.35) { this._step = 0; this.audio.step(); }
      }

      // Hotbar scroll + selection.
      if (this.input.mouse.wheel) { this.inventory.scroll(this.input.mouse.wheel); this.ui.renderHotbar(); }

      // Block interaction.
      this._handleInteraction(dt);

      // Stream chunks.
      this.chunks.update(this.player.pos[0], this.player.pos[2]);

      // Mobs.
      this._updateMobs(dt);

      // Save periodically.
      this._saveTimer += dt;
      if (this._saveTimer > SAVE_INTERVAL) { this._saveTimer = 0; this.saveAll(); }

      // Update fx particles.
      this._updateParticles(dt);
    }

    /** Break (hold) / place (click) blocks via raycast. */
    _handleInteraction(dt) {
      const hit = this.player.raycast();
      this._target = hit;

      // Left mouse: breaking.
      if (hit && this.input.mouse.left) {
        const def = Blocks.get(hit.id);
        if (def.hardness >= 999) { this._breaking = null; return; }
        const key = hit.x + ',' + hit.y + ',' + hit.z;
        if (!this._breaking || this._breaking.key !== key) {
          this._breaking = { key, x: hit.x, y: hit.y, z: hit.z, progress: 0 };
        }
        const rate = this.player.gameMode === 'creative' ? 100 : 1 / Math.max(0.2, def.hardness);
        this._breaking.progress += rate * dt;
        if (this._breaking.progress >= 1) {
          this._breakBlock(hit);
          this._breaking = null;
        }
      } else {
        this._breaking = null;
      }

      // Right mouse (edge): place block or use crafting table.
      if (hit && this.input.mouse.rightEdge) {
        if (hit.id === Blocks.ID.CRAFTING) { this.openInventory(true); return; }
        this._placeBlock(hit);
      }
    }

    _breakBlock(hit) {
      const def = Blocks.get(hit.id);
      this.world.setBlock(hit.x, hit.y, hit.z, Blocks.ID.AIR);
      this.chunks.markDirty(hit.x, hit.y, hit.z);
      this.audio.break(hit.id);
      this._spawnBreakParticles(hit.x, hit.y, hit.z, hit.id);
      // Drop into inventory (survival) — creative doesn't collect.
      if (this.player.gameMode === 'survival') {
        const drop = def.drop != null ? def.drop : hit.id;
        if (drop !== Blocks.ID.AIR) this.inventory.add(drop, 1);
        this.ui.renderHotbar();
      }
    }

    _placeBlock(hit) {
      const item = this.inventory.selectedItem;
      if (!item) return;
      const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
      if (y < 0 || y >= MC.CHUNK.SIZE_Y) return;
      if (this.world.getBlock(x, y, z) !== Blocks.ID.AIR) return;
      // Don't place inside the player (unless non-solid like torch).
      if (Blocks.isSolid(item.id) && this.player.wouldCollide(x, y, z)) return;
      this.world.setBlock(x, y, z, item.id);
      this.chunks.markDirty(x, y, z);
      this.audio.place(item.id);
      this.inventory.consumeSelected();
      this.ui.renderHotbar();
    }

    /* ---------------- Weather + day/night ---------------- */
    _updateWeather(dt) {
      this._weatherTimer -= dt;
      if (this._weatherTimer <= 0) {
        this._weatherTimer = 60 + Math.random() * 120;
        const r = Math.random();
        this.weather = r < 0.6 ? 'clear' : r < 0.9 ? 'rain' : 'storm';
        this.audio.setRain(this.weather !== 'clear');
      }
      // Spawn rain/snow drops while precipitating.
      if (this.weather !== 'clear') {
        const cold = false;
        const n = this.weather === 'storm' ? 14 : 7;
        for (let i = 0; i < n; i++) this._rainDrops.push({
          x: Math.random() * this.fx.width, y: -10,
          v: 600 + Math.random() * 400, len: 12 + Math.random() * 10, snow: cold,
        });
      }
    }

    /** Sky/light parameters derived from time of day. */
    _skyState() {
      // t: 0 night, 0.25 sunrise, 0.5 noon, 0.75 sunset
      const sun = Math.sin(this.time * Math.PI * 2 - Math.PI / 2); // -1..1
      const day = MC.math.clamp(sun * 0.5 + 0.5, 0, 1);            // 0 night .. 1 day
      let dayLight = 0.12 + day * 0.88;
      if (this.weather === 'storm') dayLight *= 0.6;
      else if (this.weather === 'rain') dayLight *= 0.8;

      const mix = (a, b, t) => [MC.math.lerp(a[0], b[0], t), MC.math.lerp(a[1], b[1], t), MC.math.lerp(a[2], b[2], t)];
      const dayTop = [0.35, 0.55, 0.92], dayBot = [0.65, 0.8, 0.98];
      const nightTop = [0.02, 0.03, 0.09], nightBot = [0.06, 0.08, 0.16];
      const duskTop = [0.5, 0.3, 0.35], duskBot = [0.9, 0.5, 0.3];
      // dusk influence peaks near sunrise/sunset
      const dusk = Math.max(0, 1 - Math.abs(day - 0.5) * 3) * (1 - day) * 1.4;
      let top = mix(nightTop, dayTop, day);
      let bot = mix(nightBot, dayBot, day);
      top = mix(top, duskTop, MC.math.clamp(dusk, 0, 0.6));
      bot = mix(bot, duskBot, MC.math.clamp(dusk, 0, 0.6));
      return { day, dayLight, top, bot };
    }

    /* ---------------- Mobs ---------------- */
    _updateMobs(dt) {
      this._spawnTimer -= dt;
      const sky = this._skyState();
      if (this._spawnTimer <= 0) {
        this._spawnTimer = 4;
        this._trySpawn(sky.day);
      }
      for (const m of this.mobs) m.update(dt, this.player);
      // Remove dead / far mobs.
      this.mobs = this.mobs.filter((m) => {
        if (m.dead) return false;
        const dx = m.pos[0] - this.player.pos[0], dz = m.pos[2] - this.player.pos[2];
        return dx * dx + dz * dz < 64 * 64;
      });

      // Player melee attack on left click against nearby mobs.
      if (this.input.mouse.leftEdge) this._tryAttackMob();
    }

    _tryAttackMob() {
      const eye = this.player.eyePosition();
      const dir = this.camera.forward();
      let best = null, bestT = 4;
      for (const m of this.mobs) {
        const cx = m.pos[0], cy = m.pos[1] + m.height / 2, cz = m.pos[2];
        const ex = cx - eye[0], ey = cy - eye[1], ez = cz - eye[2];
        const t = ex * dir[0] + ey * dir[1] + ez * dir[2];
        if (t < 0 || t > bestT) continue;
        const px = eye[0] + dir[0] * t, py = eye[1] + dir[1] * t, pz = eye[2] + dir[2] * t;
        const d2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
        if (d2 < (m.half + 0.5) ** 2) { best = m; bestT = t; }
      }
      if (best) {
        best.damage(4);
        this.audio.mob(best.type);
        // knockback
        const k = MC.math.normalize ? null : null;
        const dx = best.pos[0] - eye[0], dz = best.pos[2] - eye[2];
        const l = Math.hypot(dx, dz) || 1;
        best.pos[0] += dx / l * 0.4; best.pos[2] += dz / l * 0.4; best.vel[1] = 4;
      }
    }

    /** Spawn animals by day / monsters by night near the player. */
    _trySpawn(day) {
      const night = day < 0.3;
      const cap = night ? 16 : 12;
      if (this.mobs.length >= cap) return;
      const angle = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 16;
      const x = Math.floor(this.player.pos[0] + Math.cos(angle) * dist);
      const z = Math.floor(this.player.pos[2] + Math.sin(angle) * dist);
      // Find ground.
      let y = MC.CHUNK.SIZE_Y - 1;
      while (y > 1 && this.world.getBlock(x, y, z) === Blocks.ID.AIR) y--;
      if (y <= MC.World.SEA_LEVEL && !night) return; // animals on land
      const top = this.world.getBlock(x, y, z);
      if (top === Blocks.ID.AIR || Blocks.isLiquid(top)) return;
      const pos = [x + 0.5, y + 1, z + 0.5];
      if (night) {
        const t = MC.Monsters.TYPES[(Math.random() * MC.Monsters.TYPES.length) | 0];
        this.mobs.push(MC.Monsters.create(this.world, pos, t));
      } else {
        if (top !== Blocks.ID.GRASS) return;
        const t = MC.Animals.TYPES[(Math.random() * MC.Animals.TYPES.length) | 0];
        this.mobs.push(MC.Animals.create(this.world, pos, t));
      }
    }

    /* ---------------- Rendering ---------------- */
    _render() {
      const sky = this._skyState();
      this.camera.update(this.aspect);
      this.renderer.dayLight = sky.dayLight;
      this.renderer.fogColor = sky.bot.map((c, i) => MC.math.lerp(c, sky.top[i], 0.3));

      this.renderer.clear();
      this.renderer.drawSky(sky.top, sky.bot);

      const visible = this.chunks ? this.chunks.render(this.camera) : 0;

      // Mobs.
      if (this.mobs.length) {
        const R = this.chunks.renderDistance;
        this.renderer.beginEntities(this.camera, (R - 2) * 16, R * 16);
        for (const m of this.mobs) {
          const a = m.pos;
          if (this.camera.boxInFrustum(a[0] - 2, a[1] - 1, a[2] - 2, a[0] + 2, a[1] + 3, a[2] + 2))
            m.render(this.renderer);
        }
      }

      // Selection outline + breaking overlay.
      if (this._target) {
        this.renderer.drawOutline(this.camera, this._target.x, this._target.y, this._target.z);
      }

      // 2D fx layer.
      this._renderFx(sky);

      // HUD.
      this.ui.renderStats();
      this.ui.setClock(this._clockText());
    }

    /** Render rain/snow + break particles + breaking crack indicator. */
    _renderFx(sky) {
      const ctx = this.fxCtx;
      ctx.clearRect(0, 0, this.fx.width, this.fx.height);

      // Rain / snow.
      if (this.weather !== 'clear') {
        ctx.strokeStyle = 'rgba(170,190,230,0.5)';
        ctx.lineWidth = 1;
        for (const d of this._rainDrops) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2, d.y + d.len);
          ctx.stroke();
        }
        if (this.weather === 'storm' && Math.random() < 0.004) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(0, 0, this.fx.width, this.fx.height);
        }
      }

      // Break particles.
      for (const p of this._particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.sx, p.sy, p.size, p.size);
      }

      // Breaking progress (radial arc at crosshair).
      if (this._breaking) {
        const cx = this.fx.width / 2, cy = this.fx.height / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + this._breaking.progress * Math.PI * 2);
        ctx.stroke();
      }
    }

    _spawnBreakParticles(x, y, z, id) {
      const def = Blocks.get(id);
      const tile = def.tiles ? def.tiles[1] : 3;
      // Sample an average color from the atlas tile.
      const color = this._sampleTileColor(tile);
      for (let i = 0; i < 14; i++) {
        this._particles.push({
          wx: x + 0.2 + Math.random() * 0.6,
          wy: y + 0.2 + Math.random() * 0.6,
          wz: z + 0.2 + Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2,
          life: 0.8, color, size: 3, sx: 0, sy: 0,
        });
      }
    }

    _sampleTileColor(tile) {
      const TILES = Blocks.ATLAS_TILES, TILE = Blocks.TILE;
      const sx = (tile % TILES) * TILE + TILE / 2, sy = ((tile / TILES) | 0) * TILE + TILE / 2;
      try {
        const d = this.atlasCanvas.getContext('2d').getImageData(sx, sy, 1, 1).data;
        return `rgb(${d[0]},${d[1]},${d[2]})`;
      } catch (e) { return '#999'; }
    }

    _updateParticles(dt) {
      // Advance rain.
      for (const d of this._rainDrops) d.y += d.v * dt;
      this._rainDrops = this._rainDrops.filter((d) => d.y < this.fx.height + 20);
      // Advance break particles + project to screen.
      for (const p of this._particles) {
        p.life -= dt;
        p.vy -= 9 * dt;
        p.wx += p.vx * dt; p.wy += p.vy * dt; p.wz += p.vz * dt;
        const s = this._project(p.wx, p.wy, p.wz);
        if (s) { p.sx = s[0]; p.sy = s[1]; } else p.life = 0;
      }
      this._particles = this._particles.filter((p) => p.life > 0);
    }

    /** Project a world point to fx-canvas pixels (or null if behind camera). */
    _project(x, y, z) {
      const m = this.camera.viewProj;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0) return null;
      return [(cx / cw * 0.5 + 0.5) * this.fx.width, (-cy / cw * 0.5 + 0.5) * this.fx.height];
    }

    _clockText() {
      const hours = (this.time * 24 + 6) % 24;
      const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
      const icon = this._skyState().day > 0.3 ? '☀' : '☾';
      return `${icon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    _fpsCount(dt) {
      this._frames++; this._fpsTime += dt;
      if (this._fpsTime >= 0.5) {
        this._fps = Math.round(this._frames / this._fpsTime);
        this._frames = 0; this._fpsTime = 0;
        this.ui.renderDebug(this._fps, this.chunks ? this.chunks.loadedCount : 0, this._lastVisible || 0);
      }
      this._lastVisible = this.chunks ? this.world.chunks.size : 0;
    }

    /* ---------------- Persistence ---------------- */
    async saveAll() {
      if (!this.world) return;
      // Save modified chunks.
      for (const c of this.world.chunks.values()) {
        if (c.modified) { await this.save.saveChunk(c); this._savedKeys.add(c.cx + ',' + c.cz); }
      }
      await this.save.saveMeta('world', {
        seed: this.world.seed,
        player: this.player.serialize(),
        inventory: this.inventory.serialize(),
        time: this.time,
        weather: this.weather,
      });
    }
  }

  /** Await one animation frame (for cooperative loading). */
  function frame() { return new Promise((r) => requestAnimationFrame(() => r())); }

  MC.Game = Game;

  addEventListener('DOMContentLoaded', () => {
    try {
      const game = new Game();
      MC.game = game;
      // Show "Continue" only if a save exists.
      game.save.loadMeta('world').then((m) => {
        const c = document.getElementById('btnContinue');
        if (c) c.style.display = m ? 'block' : 'none';
      });
      game.ui.showMainMenu();
    } catch (e) {
      document.body.innerHTML = '<div style="color:#fff;font:16px monospace;padding:20px">' +
        'Failed to start: ' + (e && e.message) + '<br>WebGL may be unavailable.</div>';
      console.error(e);
    }
  });
})(typeof window !== 'undefined' ? window : this);
