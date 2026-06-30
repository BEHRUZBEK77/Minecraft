/**
 * ui.js — All DOM-based user interface: HUD (hotbar, health, hunger, crosshair,
 * FPS, coordinates, debug overlay), menus (main/pause/loading), and the
 * inventory + crafting screen with drag-and-drop. Item icons are rendered from the
 * procedural texture atlas. Exposes global `MC.UI`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;
  const Inv = MC.Inventory;

  class UI {
    /** @param {object} game references {player, inventory, audio, atlasCanvas} */
    constructor(game) {
      this.game = game;
      this.el = {};
      this._iconCache = new Map();
      this._cache();
      this.invOpen = false;
      this.furnaceOpen = false;
      this.furnace = null;           // active MC.Furnace instance
      this.craftGrid = new Array(9).fill(null);   // 3x3 (table) or top-left 2x2
      this.craftSize = 2;
      this._drag = null;
      this._bindInventory();
      this._bindFurnace();
    }

    /** Any modal screen open? Used to pause the world. */
    get anyOpen() { return this.invOpen || this.furnaceOpen; }

    _cache() {
      const $ = (id) => document.getElementById(id);
      this.el = {
        hotbar: $('hotbar'), health: $('health'), hunger: $('hunger'),
        fps: $('fps'), coords: $('coords'), debug: $('debug'),
        inventory: $('inventory'), invGrid: $('invGrid'), hotbarGrid: $('hotbarGrid'),
        craftArea: $('craftArea'), craftGrid: $('craftGrid'), craftResult: $('craftResult'),
        mainMenu: $('mainMenu'), pauseMenu: $('pauseMenu'), loading: $('loading'),
        loadingBar: $('loadingBar'), loadingText: $('loadingText'),
        deathScreen: $('deathScreen'), clock: $('clock'), biome: $('biome'),
        furnace: $('furnace'), furnaceInput: $('furnaceInput'), furnaceFuel: $('furnaceFuel'),
        furnaceOutput: $('furnaceOutput'), furnaceBar: $('furnaceBar'),
        furnaceFlame: $('furnaceFlame'), furnaceInvGrid: $('furnaceInvGrid'),
        furnaceHotbarGrid: $('furnaceHotbarGrid'),
      };
    }

    /** Render an item icon (block) into a small canvas, cached by id. */
    icon(id, size = 40) {
      const cacheKey = id + ':' + size;
      if (this._iconCache.has(cacheKey)) return this._iconCache.get(cacheKey);
      const def = Blocks.get(id);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const atlas = this.game.atlasCanvas;
      const tile = def.tiles ? def.tiles[1] : 3;
      const uv = Blocks.tileUV(tile);
      const TILES = Blocks.ATLAS_TILES, TILE = Blocks.TILE;
      const sx = (tile % TILES) * TILE, sy = ((tile / TILES) | 0) * TILE;
      ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, size, size);
      this._iconCache.set(cacheKey, c);
      return c;
    }

    /** Build a slot element showing an item. */
    _slotEl(item, idx, kind) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.idx = idx;
      d.dataset.kind = kind;
      if (item) {
        const ic = this.icon(item.id, 40);
        ic.className = 'icon';
        d.appendChild(ic);
        if (item.count > 1) {
          const c = document.createElement('span');
          c.className = 'count'; c.textContent = item.count;
          d.appendChild(c);
        }
        // Durability bar for tools that have taken damage.
        if (item.dura != null && item.maxDura) {
          const frac = item.dura / item.maxDura;
          const bar = document.createElement('div');
          bar.className = 'dura';
          const fillEl = document.createElement('div');
          fillEl.style.width = (frac * 100) + '%';
          // green -> red as it wears.
          fillEl.style.background = `hsl(${Math.round(frac * 120)},80%,45%)`;
          bar.appendChild(fillEl);
          d.appendChild(bar);
        }
      }
      return d;
    }

    /** Update the always-on hotbar HUD. */
    renderHotbar() {
      const inv = this.game.inventory;
      const hb = this.el.hotbar;
      hb.innerHTML = '';
      for (let i = 0; i < Inv.HOTBAR; i++) {
        const s = this._slotEl(inv.slots[i], i, 'inv');
        if (i === inv.selected) s.classList.add('selected');
        hb.appendChild(s);
      }
    }

    /** Update health + hunger bars (10 hearts / drumsticks). */
    renderStats() {
      const p = this.game.player;
      if (p.gameMode === 'creative') { this.el.health.style.display = 'none'; this.el.hunger.style.display = 'none'; return; }
      this.el.health.style.display = 'flex';
      this.el.hunger.style.display = 'flex';
      this._renderBar(this.el.health, p.health, p.maxHealth, '❤', '🖤');
      this._renderBar(this.el.hunger, p.hunger, p.maxHunger, '🍗', '◻');
    }

    _renderBar(el, val, max, full, empty) {
      const hearts = max / 2;
      let html = '';
      for (let i = 0; i < hearts; i++) html += (i < val / 2) ? full : empty;
      el.textContent = html;
    }

    /** Update FPS + coordinates + debug overlay. */
    renderDebug(fps, chunks, visible) {
      const p = this.game.player;
      this.el.fps.textContent = fps + ' FPS';
      this.el.coords.textContent =
        `X ${p.pos[0].toFixed(1)}  Y ${p.pos[1].toFixed(1)}  Z ${p.pos[2].toFixed(1)}`;
      if (this.el.debug.style.display !== 'none') {
        const dir = ['South', 'West', 'North', 'East'][Math.round(((this.game.camera.yaw / (Math.PI / 2)) % 4 + 4)) % 4];
        this.el.debug.innerHTML =
          `VoxelCraft — Opus build<br>` +
          `XYZ: ${p.pos.map((n) => n.toFixed(2)).join(' / ')}<br>` +
          `Facing: ${dir}<br>` +
          `Chunks: ${visible}/${chunks} loaded<br>` +
          `Mode: ${p.gameMode}  Fly: ${p.flying}  Water: ${p.inWater}<br>` +
          `Mobs: ${this.game.mobs.length}<br>` +
          `FPS: ${fps}`;
      }
    }

    toggleDebug() {
      this.el.debug.style.display = this.el.debug.style.display === 'none' ? 'block' : 'none';
    }

    setClock(text) { if (this.el.clock) this.el.clock.textContent = text; }

    /* ---------------- Menus ---------------- */
    showLoading(p, text) {
      this.el.loading.style.display = 'flex';
      this.el.loadingBar.style.width = (p * 100) + '%';
      if (text) this.el.loadingText.textContent = text;
    }
    hideLoading() { this.el.loading.style.display = 'none'; }
    showMainMenu() { this.el.mainMenu.style.display = 'flex'; }
    hideMainMenu() { this.el.mainMenu.style.display = 'none'; }
    showPause() { this.el.pauseMenu.style.display = 'flex'; }
    hidePause() { this.el.pauseMenu.style.display = 'none'; }
    showDeath() { this.el.deathScreen.style.display = 'flex'; }
    hideDeath() { this.el.deathScreen.style.display = 'none'; }

    /* ---------------- Inventory screen ---------------- */
    openInventory(withTable = false) {
      this.invOpen = true;
      this.craftSize = withTable ? 3 : 2;
      this.el.inventory.style.display = 'flex';
      this.el.craftArea.style.display = this.game.inventory.creative ? 'none' : 'block';
      this.renderInventory();
    }
    closeInventory() {
      this.invOpen = false;
      this.el.inventory.style.display = 'none';
      // Return crafting items to inventory.
      for (let i = 0; i < this.craftGrid.length; i++) {
        if (this.craftGrid[i]) { this.game.inventory.add(this.craftGrid[i], 1); this.craftGrid[i] = null; }
      }
    }

    /** Full re-render of the inventory + crafting grids. */
    renderInventory() {
      const inv = this.game.inventory;
      // Main grid (slots 9..35).
      this.el.invGrid.innerHTML = '';
      for (let i = Inv.HOTBAR; i < inv.slots.length; i++)
        this.el.invGrid.appendChild(this._slotEl(inv.slots[i], i, 'inv'));
      // Hotbar row inside inventory (slots 0..8).
      this.el.hotbarGrid.innerHTML = '';
      for (let i = 0; i < Inv.HOTBAR; i++)
        this.el.hotbarGrid.appendChild(this._slotEl(inv.slots[i], i, 'inv'));
      // Crafting grid.
      this.el.craftGrid.className = 'craft-grid size-' + this.craftSize;
      this.el.craftGrid.innerHTML = '';
      const cells = this.craftSize * this.craftSize;
      for (let i = 0; i < cells; i++) {
        const item = this.craftGrid[i] != null ? { id: this.craftGrid[i], count: 1 } : null;
        this.el.craftGrid.appendChild(this._slotEl(item, i, 'craft'));
      }
      // Result.
      const result = MC.Crafting.match(this.craftGrid.slice(0, cells), this.craftSize);
      this.el.craftResult.innerHTML = '';
      this.el.craftResult.appendChild(this._slotEl(result, -1, 'result'));
      this._craftResult = result;
    }

    /** Wire pointer interactions on inventory slots (drag & drop / click). */
    _bindInventory() {
      const onDown = (e) => {
        const slot = e.target.closest('.slot');
        if (!slot) return;
        const kind = slot.dataset.kind;
        const idx = parseInt(slot.dataset.idx, 10);
        const inv = this.game.inventory;

        if (kind === 'result') {
          if (this._craftResult) this._takeCraftResult();
          return;
        }
        // Left click picks up / places a whole stack via simple swap model.
        if (kind === 'inv') {
          if (this._drag == null) {
            if (inv.slots[idx]) { this._drag = { kind, idx }; slot.classList.add('dragging'); }
          } else {
            this._applyDrop(kind, idx);
          }
        } else if (kind === 'craft') {
          this._handleCraftClick(idx);
        }
        this.renderInventory();
      };
      // Bind on the container (delegation); container exists in DOM at construction.
      document.addEventListener('mousedown', (e) => {
        if (!this.invOpen) return;
        if (e.target.closest('#inventory')) { e.preventDefault(); onDown(e); }
      });
    }

    /** Resolve a pending drag onto an inventory slot. */
    _applyDrop(kind, idx) {
      const inv = this.game.inventory;
      const from = this._drag;
      this._drag = null;
      if (from.kind === 'inv' && kind === 'inv') inv.moveSlot(from.idx, idx);
    }

    /** Move one item between a held inventory drag and a crafting cell. */
    _handleCraftClick(idx) {
      const inv = this.game.inventory;
      if (this._drag && this._drag.kind === 'inv') {
        const src = inv.slots[this._drag.idx];
        if (src) {
          // Return any existing craft cell item.
          if (this.craftGrid[idx] != null) inv.add(this.craftGrid[idx], 1);
          this.craftGrid[idx] = src.id;
          inv.consumeAt ? inv.consumeAt(this._drag.idx) : this._consumeOne(this._drag.idx);
        }
        this._drag = null;
      } else if (this.craftGrid[idx] != null) {
        // Pull item back to inventory.
        inv.add(this.craftGrid[idx], 1);
        this.craftGrid[idx] = null;
      }
    }

    _consumeOne(idx) {
      const inv = this.game.inventory;
      const s = inv.slots[idx];
      if (!s) return;
      if (!inv.creative) { s.count--; if (s.count <= 0) inv.slots[idx] = null; }
    }

    /** Consume ingredients and grant the crafted result. */
    _takeCraftResult() {
      const inv = this.game.inventory;
      inv.add(this._craftResult.id, this._craftResult.count);
      const cells = this.craftSize * this.craftSize;
      for (let i = 0; i < cells; i++) this.craftGrid[i] = null;  // consume (1 each)
      this.game.audio.place(this._craftResult.id);
      this.renderInventory();
    }

    /* ---------------- Furnace screen ---------------- */
    openFurnace(furnace) {
      this.furnace = furnace;
      this.furnaceOpen = true;
      this.el.furnace.style.display = 'flex';
      this.renderFurnace();
    }
    closeFurnace() {
      this.furnaceOpen = false;
      this.el.furnace.style.display = 'none';
      this._drag = null;
    }

    /** Re-render the furnace slots, progress bar and player inventory rows. */
    renderFurnace() {
      const f = this.furnace, inv = this.game.inventory;
      if (!f) return;
      const fill = (el, item, slotName) => {
        el.innerHTML = '';
        el.appendChild(this._slotEl(item, slotName, 'furnace'));
      };
      fill(this.el.furnaceInput, f.input, 'input');
      fill(this.el.furnaceFuel, f.fuel, 'fuel');
      fill(this.el.furnaceOutput, f.output, 'output');
      this.el.furnaceBar.style.width = (f.progress * 100) + '%';
      this.el.furnaceFlame.style.opacity = f.burnLeft > 0 ? '1' : '0.25';
      this.el.furnaceInvGrid.innerHTML = '';
      for (let i = Inv.HOTBAR; i < inv.slots.length; i++)
        this.el.furnaceInvGrid.appendChild(this._slotEl(inv.slots[i], i, 'inv'));
      this.el.furnaceHotbarGrid.innerHTML = '';
      for (let i = 0; i < Inv.HOTBAR; i++)
        this.el.furnaceHotbarGrid.appendChild(this._slotEl(inv.slots[i], i, 'inv'));
    }

    /** Wire furnace pointer interactions (click-to-move). */
    _bindFurnace() {
      document.addEventListener('mousedown', (e) => {
        if (!this.furnaceOpen) return;
        if (!e.target.closest('#furnace')) return;
        e.preventDefault();
        const slot = e.target.closest('.slot');
        if (!slot) return;
        const inv = this.game.inventory, f = this.furnace;
        const kind = slot.dataset.kind, idx = slot.dataset.idx;

        if (kind === 'inv') {
          // Pick up / put down within the inventory.
          const i = parseInt(idx, 10);
          if (this._drag == null) { if (inv.slots[i]) this._drag = { kind, idx: i }; }
          else { if (this._drag.kind === 'inv') inv.moveSlot(this._drag.idx, i); this._drag = null; }
        } else if (kind === 'furnace') {
          if (idx === 'output') {
            if (f.output) { inv.add(f.output.id, f.output.count); f.output = null; this.game.audio.place(0); }
          } else if (this._drag && this._drag.kind === 'inv') {
            // Move held inventory stack into the furnace input/fuel slot.
            const src = inv.slots[this._drag.idx];
            if (src) {
              const cur = f[idx];
              if (!cur) { f[idx] = { id: src.id, count: src.count }; inv.slots[this._drag.idx] = null; }
              else if (cur.id === src.id) { cur.count += src.count; inv.slots[this._drag.idx] = null; }
            }
            this._drag = null;
          } else if (f[idx]) {
            // Pull furnace slot contents back to the inventory.
            inv.add(f[idx].id, f[idx].count); f[idx] = null;
          }
        }
        this.renderFurnace();
      });
    }
  }

  MC.UI = UI;
})(typeof window !== 'undefined' ? window : this);
