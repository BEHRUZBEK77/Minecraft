/**
 * crafting.js — Recipe system supporting 2x2 (inventory) and 3x3 (crafting table)
 * grids. Recipes are defined as JSON-like data with shaped patterns or shapeless
 * ingredient lists. Exposes global `MC.Crafting`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const ID = MC.Blocks.ID;

  /**
   * Recipe formats:
   *  shaped:    { pattern: ['WW','WW'], key:{W:ID.WOOD}, result:{id, count} }
   *  shapeless: { shapeless:[ID.PLANK, ID.PLANK], result:{id,count} }
   */
  const RECIPES = [
    // 1 wood -> 4 planks (shapeless)
    { shapeless: [ID.WOOD], result: { id: ID.PLANK, count: 4 } },
    // 2x2 planks -> crafting table
    { pattern: ['PP', 'PP'], key: { P: ID.PLANK }, result: { id: ID.CRAFTING, count: 1 } },
    // cobble 2x2 -> ... (example) ; planks -> torch-ish (coal+stick simplified)
    { shapeless: [ID.COAL, ID.WOOD], result: { id: ID.TORCH, count: 4 } },
    // 4 sand -> glass-ish (no furnace: simplified direct craft)
    { pattern: ['SS', 'SS'], key: { S: ID.SAND }, result: { id: ID.GLASS, count: 4 } },
    // 4 cobble -> bricks-like (3x3 border could be furnace; simplified)
    { pattern: ['CC', 'CC'], key: { C: ID.COBBLE }, result: { id: ID.BRICK, count: 4 } },
    // 9 stone -> ... etc. (3x3 full of cobble -> some block) demonstration
    { pattern: ['CCC', 'CCC', 'CCC'], key: { C: ID.COBBLE }, result: { id: ID.STONE, count: 8 } },
    // furnace: 8 cobble ring (3x3 with hollow center)
    { pattern: ['CCC', 'C C', 'CCC'], key: { C: ID.COBBLE }, result: { id: ID.FURNACE, count: 1 } },
    // 3 apples -> bread (sweet roll)
    { shapeless: [ID.APPLE, ID.APPLE, ID.APPLE], result: { id: ID.BREAD, count: 1 } },

    // Tools & weapons: iron ingots (I) on a plank handle (P).
    { pattern: ['I', 'I', 'P'], key: { I: ID.IRON_INGOT, P: ID.PLANK }, result: { id: ID.SWORD, count: 1 } },
    { pattern: ['III', ' P ', ' P '], key: { I: ID.IRON_INGOT, P: ID.PLANK }, result: { id: ID.PICKAXE, count: 1 } },
    { pattern: ['II', 'IP', ' P'], key: { I: ID.IRON_INGOT, P: ID.PLANK }, result: { id: ID.AXE, count: 1 } },
    { pattern: ['I', 'P', 'P'], key: { I: ID.IRON_INGOT, P: ID.PLANK }, result: { id: ID.SHOVEL, count: 1 } },
    { pattern: ['GIG', 'GPG', ' P '], key: { I: ID.IRON_INGOT, P: ID.PLANK, G: ID.GOLD_INGOT }, result: { id: ID.MACE, count: 1 } },
    { pattern: ['I', 'P', 'P'], key: { I: ID.DIAMOND, P: ID.PLANK }, result: { id: ID.SPEAR, count: 1 } },
  ];

  class Crafting {
    /**
     * Try to match a grid against all recipes.
     * @param {Array<?number>} grid flat array of block ids or null, row-major
     * @param {number} size 2 or 3
     * @returns {?{id:number,count:number}} resulting item or null
     */
    static match(grid, size) {
      for (const r of RECIPES) {
        const res = r.shapeless ? Crafting._matchShapeless(grid, r) : Crafting._matchShaped(grid, size, r);
        if (res) return res;
      }
      return null;
    }

    /** Match shapeless: multiset of non-null cells must equal ingredients. */
    static _matchShapeless(grid, r) {
      const cells = grid.filter((c) => c != null).sort();
      const need = r.shapeless.slice().sort();
      if (cells.length !== need.length) return null;
      for (let i = 0; i < need.length; i++) if (cells[i] !== need[i]) return null;
      return r.result;
    }

    /** Match shaped: trim grid to bounding box, compare against pattern. */
    static _matchShaped(grid, size, r) {
      // Build 2D grid.
      const g = [];
      for (let y = 0; y < size; y++) g.push(grid.slice(y * size, y * size + size));
      // Find bounding box of non-null cells.
      let minR = size, maxR = -1, minC = size, maxC = -1;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (g[y][x] != null) { minR = Math.min(minR, y); maxR = Math.max(maxR, y); minC = Math.min(minC, x); maxC = Math.max(maxC, x); }
      if (maxR < 0) return null;
      const ph = r.pattern.length, pw = r.pattern[0].length;
      if (maxR - minR + 1 !== ph || maxC - minC + 1 !== pw) return null;
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const ch = r.pattern[y][x];
          const want = ch === ' ' ? null : r.key[ch];
          const got = g[minR + y][minC + x];
          if ((want ?? null) !== (got ?? null)) return null;
        }
      }
      return r.result;
    }

    static get recipes() { return RECIPES; }
  }

  MC.Crafting = Crafting;
})(typeof window !== 'undefined' ? window : this);
