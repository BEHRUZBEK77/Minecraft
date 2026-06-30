/**
 * inventory.js — Hotbar + main inventory with item stacking and a selected slot.
 * Items are represented as { id, count }. Supports creative (infinite) and survival.
 * Exposes global `MC.Inventory`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;

  const HOTBAR = 9;
  const ROWS = 3;            // main inventory rows
  const COLS = 9;
  const MAIN = ROWS * COLS;
  const MAX_STACK = 64;

  class Inventory {
    constructor() {
      // Slots 0..8 = hotbar, 9..35 = main inventory.
      this.slots = new Array(HOTBAR + MAIN).fill(null);
      this.selected = 0;
      this.creative = false;
    }

    get selectedItem() { return this.slots[this.selected]; }

    /** Fill the hotbar with starter items (survival). */
    giveStarter() {
      const give = [Blocks.ID.GRASS, Blocks.ID.DIRT, Blocks.ID.STONE, Blocks.ID.WOOD,
        Blocks.ID.PLANK, Blocks.ID.GLASS, Blocks.ID.TORCH, Blocks.ID.CRAFTING, Blocks.ID.COBBLE];
      give.forEach((id, i) => { this.slots[i] = { id, count: 16 }; });
    }

    /** Populate inventory with one stack of each placeable block (creative). */
    fillCreative() {
      this.creative = true;
      const items = Blocks.placeable;
      for (let i = 0; i < this.slots.length; i++) {
        this.slots[i] = i < items.length ? { id: items[i], count: 64 } : null;
      }
    }

    /**
     * Add a freshly-made tool to the first empty slot with full durability.
     * Tools never stack. @returns true if it fit.
     */
    addTool(id) {
      const max = MC.Tools ? MC.Tools.maxDura(id) : 0;
      for (let i = 0; i < this.slots.length; i++) {
        if (!this.slots[i]) { this.slots[i] = { id, count: 1, dura: max, maxDura: max }; return true; }
      }
      return false;
    }

    /**
     * Spend one point of durability on the selected tool; remove it when it
     * breaks. @returns true if the tool broke this call.
     */
    damageSelectedTool(amount = 1) {
      const s = this.slots[this.selected];
      if (!s || s.dura == null) return false;
      if (this.creative) return false;
      s.dura -= amount;
      if (s.dura <= 0) { this.slots[this.selected] = null; return true; }
      return false;
    }

    /** Add an item, stacking where possible. @returns leftover count not added. */
    add(id, count = 1) {
      // Tools are unique items; route them through addTool so they don't merge.
      if (MC.Tools && MC.Tools.isTool(id)) {
        let left = count;
        while (left > 0 && this.addTool(id)) left--;
        return left;
      }
      // First, top up existing stacks.
      for (let i = 0; i < this.slots.length && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < MAX_STACK) {
          const space = MAX_STACK - s.count;
          const n = Math.min(space, count);
          s.count += n; count -= n;
        }
      }
      // Then fill empty slots.
      for (let i = 0; i < this.slots.length && count > 0; i++) {
        if (!this.slots[i]) {
          const n = Math.min(MAX_STACK, count);
          this.slots[i] = { id, count: n }; count -= n;
        }
      }
      return count;
    }

    /** Remove one of the selected item (no-op in creative). @returns true if used. */
    consumeSelected() {
      const s = this.slots[this.selected];
      if (!s) return false;
      if (this.creative) return true;
      s.count--;
      if (s.count <= 0) this.slots[this.selected] = null;
      return true;
    }

    /** Count total of an item id across all slots. */
    countOf(id) {
      let c = 0;
      for (const s of this.slots) if (s && s.id === id) c += s.count;
      return c;
    }

    /** Remove `count` of `id` across slots. @returns true if it could be removed. */
    remove(id, count) {
      if (this.countOf(id) < count) return false;
      for (let i = 0; i < this.slots.length && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id) {
          const n = Math.min(s.count, count);
          s.count -= n; count -= n;
          if (s.count <= 0) this.slots[i] = null;
        }
      }
      return true;
    }

    /** Move/swap/merge stacks between two slot indices (drag & drop). */
    moveSlot(from, to) {
      if (from === to) return;
      const a = this.slots[from], b = this.slots[to];
      if (!a) return;
      if (b && b.id === a.id) {
        const space = MAX_STACK - b.count;
        const n = Math.min(space, a.count);
        b.count += n; a.count -= n;
        if (a.count <= 0) this.slots[from] = null;
      } else {
        this.slots[from] = b;
        this.slots[to] = a;
      }
    }

    /** Cycle selected hotbar slot by wheel direction. */
    scroll(dir) {
      this.selected = (this.selected + dir + HOTBAR) % HOTBAR;
    }

    selectHotbar(i) { if (i >= 0 && i < HOTBAR) this.selected = i; }

    serialize() { return { slots: this.slots, selected: this.selected, creative: this.creative }; }
    deserialize(s) {
      if (!s) return;
      this.slots = s.slots || this.slots;
      this.selected = s.selected || 0;
      this.creative = !!s.creative;
    }
  }

  Inventory.HOTBAR = HOTBAR; Inventory.MAIN = MAIN; Inventory.COLS = COLS;
  Inventory.ROWS = ROWS; Inventory.MAX_STACK = MAX_STACK;
  MC.Inventory = Inventory;
})(typeof window !== 'undefined' ? window : this);
