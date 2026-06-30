/**
 * tools.js — Tool & weapon registry. Defines mining speed multipliers per block
 * category, attack damage and reach for each tool. Exposes global `MC.Tools`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const ID = MC.Blocks.ID;

  // Block categories each tool type is effective against.
  const STONE_LIKE = new Set([ID.STONE, ID.COBBLE, ID.BRICK, ID.COAL, ID.IRON,
    ID.GOLD, ID.DIAMOND, ID.FURNACE, ID.GRAVEL, ID.BEDROCK]);
  const WOOD_LIKE = new Set([ID.WOOD, ID.PLANK, ID.CRAFTING]);
  const DIRT_LIKE = new Set([ID.DIRT, ID.GRASS, ID.SAND, ID.SNOW]);

  /**
   * Tool data:
   *  attack  – melee damage dealt to mobs
   *  reach   – interaction/attack distance in blocks
   *  speed   – mining-speed multiplier against `set`
   *  set     – block category this tool mines faster (null = none)
   */
  const TOOLS = {
    [ID.SWORD]: { name: 'Sword', attack: 6, reach: 4.5, speed: 1.5, set: null, dura: 250 },
    [ID.PICKAXE]: { name: 'Pickaxe', attack: 2, reach: 5, speed: 5, set: STONE_LIKE, dura: 250 },
    [ID.AXE]: { name: 'Axe', attack: 4, reach: 5, speed: 5, set: WOOD_LIKE, dura: 250 },
    [ID.SHOVEL]: { name: 'Shovel', attack: 2, reach: 5, speed: 5, set: DIRT_LIKE, dura: 250 },
    [ID.MACE]: { name: 'Mace', attack: 10, reach: 4, speed: 1, set: null, dura: 320 },
    [ID.SPEAR]: { name: 'Spear', attack: 5, reach: 7, speed: 1, set: null, dura: 200 },
  };

  MC.Tools = {
    /** Is this item id a tool/weapon? */
    isTool: (id) => !!TOOLS[id],
    get: (id) => TOOLS[id] || null,
    /** Maximum durability for a tool id (0 for non-tools). */
    maxDura: (id) => (TOOLS[id] ? TOOLS[id].dura : 0),
    /** Mining-speed multiplier for `tool` against `block` (1 = no bonus). */
    mineSpeed(toolId, block) {
      const t = TOOLS[toolId];
      if (!t) return 1;
      return t.set && t.set.has(block) ? t.speed : 1;
    },
    /** Melee damage for the held item (1 for bare hands / non-weapons). */
    attack(toolId) { const t = TOOLS[toolId]; return t ? t.attack : 1; },
    /** Interaction reach for the held item. */
    reach(toolId) { const t = TOOLS[toolId]; return t ? t.reach : 4.5; },
  };
})(typeof window !== 'undefined' ? window : this);
