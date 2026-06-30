/**
 * block.js — Block registry, properties, and a procedurally generated texture atlas.
 * No external image assets: textures are painted onto a canvas at runtime so the
 * game runs by simply opening index.html. Exposes global `MC.Blocks`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  // Numeric block IDs. 0 is always air.
  const ID = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, WOOD: 6,
    LEAVES: 7, SNOW: 8, BEDROCK: 9, GLASS: 10, PLANK: 11, COBBLE: 12,
    COAL: 13, IRON: 14, GOLD: 15, DIAMOND: 16, TORCH: 17, CRAFTING: 18,
    BRICK: 19, GRAVEL: 20,
    // New blocks / items.
    CACTUS: 21, FURNACE: 22,
    // Items (non-placeable). `food` restores hunger when eaten.
    APPLE: 23, MEAT: 24, COOKED_MEAT: 25, IRON_INGOT: 26, GOLD_INGOT: 27, BREAD: 28,
    // Tools & weapons (items).
    SWORD: 29, PICKAXE: 30, AXE: 31, SHOVEL: 32, MACE: 33, SPEAR: 34,
  };

  // Atlas is a grid of ATLAS_TILES x ATLAS_TILES tiles, each TILE px square.
  const ATLAS_TILES = 8;
  const TILE = 32;

  /**
   * Block definition table.
   * tiles: [top, side, bottom] atlas indices (index = row*ATLAS_TILES + col).
   * solid: participates in collision; transparent: doesn't cull neighbor faces.
   */
  const DEFS = {};
  function def(id, opts) { DEFS[id] = Object.assign({ id, solid: true, transparent: false, light: 0, hardness: 1 }, opts); }

  def(ID.AIR, { name: 'Air', solid: false, transparent: true, hardness: 0, tiles: [-1, -1, -1] });
  def(ID.GRASS, { name: 'Grass', tiles: [0, 1, 2], drop: ID.DIRT });
  def(ID.DIRT, { name: 'Dirt', tiles: [2, 2, 2] });
  def(ID.STONE, { name: 'Stone', tiles: [3, 3, 3], hardness: 2.5, drop: ID.COBBLE });
  def(ID.SAND, { name: 'Sand', tiles: [4, 4, 4] });
  def(ID.WATER, { name: 'Water', solid: false, transparent: true, liquid: true, hardness: 999, tiles: [5, 5, 5] });
  def(ID.WOOD, { name: 'Wood', tiles: [6, 7, 6], hardness: 2 });
  def(ID.LEAVES, { name: 'Leaves', transparent: true, tiles: [8, 8, 8], hardness: 0.3 });
  def(ID.SNOW, { name: 'Snow', tiles: [9, 9, 9] });
  def(ID.BEDROCK, { name: 'Bedrock', hardness: 999, tiles: [10, 10, 10] });
  def(ID.GLASS, { name: 'Glass', transparent: true, tiles: [11, 11, 11], hardness: 0.3 });
  def(ID.PLANK, { name: 'Planks', tiles: [12, 12, 12], hardness: 2 });
  def(ID.COBBLE, { name: 'Cobblestone', tiles: [13, 13, 13], hardness: 2.5 });
  def(ID.COAL, { name: 'Coal Ore', tiles: [14, 14, 14], hardness: 3, drop: ID.COAL });
  def(ID.IRON, { name: 'Iron Ore', tiles: [15, 15, 15], hardness: 3, drop: ID.IRON });
  def(ID.GOLD, { name: 'Gold Ore', tiles: [16, 16, 16], hardness: 3, drop: ID.GOLD });
  def(ID.DIAMOND, { name: 'Diamond Ore', tiles: [17, 17, 17], hardness: 4, drop: ID.DIAMOND });
  def(ID.TORCH, { name: 'Torch', solid: false, transparent: true, light: 14, tiles: [18, 18, 18], hardness: 0.1 });
  def(ID.CRAFTING, { name: 'Crafting Table', tiles: [19, 20, 12], hardness: 2 });
  def(ID.BRICK, { name: 'Bricks', tiles: [21, 21, 21], hardness: 2.5 });
  def(ID.GRAVEL, { name: 'Gravel', tiles: [22, 22, 22], hardness: 1.2 });
  def(ID.CACTUS, { name: 'Cactus', tiles: [23, 23, 23], hardness: 0.4, damage: 1 });
  def(ID.FURNACE, { name: 'Furnace', tiles: [24, 25, 24], hardness: 3.5, drop: ID.FURNACE });
  // Items: not placeable in the world; carried/eaten/used in recipes.
  def(ID.APPLE, { name: 'Apple', solid: false, transparent: true, item: true, food: 4, tiles: [26, 26, 26] });
  def(ID.MEAT, { name: 'Raw Meat', solid: false, transparent: true, item: true, food: 2, tiles: [27, 27, 27] });
  def(ID.COOKED_MEAT, { name: 'Cooked Meat', solid: false, transparent: true, item: true, food: 6, tiles: [28, 28, 28] });
  def(ID.IRON_INGOT, { name: 'Iron Ingot', solid: false, transparent: true, item: true, tiles: [29, 29, 29] });
  def(ID.GOLD_INGOT, { name: 'Gold Ingot', solid: false, transparent: true, item: true, tiles: [30, 30, 30] });
  def(ID.BREAD, { name: 'Bread', solid: false, transparent: true, item: true, food: 5, tiles: [31, 31, 31] });
  def(ID.SWORD, { name: 'Iron Sword', solid: false, transparent: true, item: true, tool: true, tiles: [32, 32, 32] });
  def(ID.PICKAXE, { name: 'Iron Pickaxe', solid: false, transparent: true, item: true, tool: true, tiles: [33, 33, 33] });
  def(ID.AXE, { name: 'Iron Axe', solid: false, transparent: true, item: true, tool: true, tiles: [34, 34, 34] });
  def(ID.SHOVEL, { name: 'Iron Shovel', solid: false, transparent: true, item: true, tool: true, tiles: [35, 35, 35] });
  def(ID.MACE, { name: 'Mace', solid: false, transparent: true, item: true, tool: true, tiles: [36, 36, 36] });
  def(ID.SPEAR, { name: 'Spear', solid: false, transparent: true, item: true, tool: true, tiles: [37, 37, 37] });

  /** Painter helpers operating on a 2D canvas context for one tile. */
  function fillTile(ctx, idx, base) {
    const col = idx % ATLAS_TILES, row = (idx / ATLAS_TILES) | 0;
    return { x: col * TILE, y: row * TILE, base };
  }

  /** Add deterministic per-pixel speckle to give textures grain. */
  function speckle(ctx, x, y, base, amount, density = 0.5) {
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        if (Math.random() > density) continue;
        const d = (Math.random() - 0.5) * amount;
        ctx.fillStyle = shade(base, d);
        ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  /** Shade a hex color by delta (-1..1). */
  function shade(hex, d) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const a = Math.round(d * 255);
    r = Math.max(0, Math.min(255, r + a));
    g = Math.max(0, Math.min(255, g + a));
    b = Math.max(0, Math.min(255, b + a));
    return `rgb(${r},${g},${b})`;
  }

  /** Paint a single solid-color tile with speckle grain. */
  function paint(ctx, idx, color, grain = 0.12) {
    const col = idx % ATLAS_TILES, row = (idx / ATLAS_TILES) | 0;
    const x = col * TILE, y = row * TILE;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, TILE, TILE);
    speckle(ctx, x, y, color, grain, 0.7);
    return { x, y };
  }

  /** Build the full atlas canvas and return it (also returns UV helper data). */
  function buildAtlas() {
    const size = ATLAS_TILES * TILE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    paint(ctx, 0, '#5fa133', 0.14);                 // grass top
    // grass side: dirt with green lip
    let p = paint(ctx, 1, '#8a6240', 0.14);
    ctx.fillStyle = '#5fa133';
    ctx.fillRect(p.x, p.y, TILE, TILE * 0.28);
    speckle(ctx, p.x, p.y, '#5fa133', 0.12, 0.5);
    paint(ctx, 2, '#8a6240', 0.14);                 // dirt
    paint(ctx, 3, '#888888', 0.1);                  // stone
    paint(ctx, 4, '#e0d39a', 0.1);                  // sand
    paint(ctx, 5, '#3a6ee0', 0.06);                 // water
    paint(ctx, 6, '#6b4f2a', 0.12);                 // wood top (rings)
    p = paint(ctx, 7, '#7a5a32', 0.1);              // wood side
    ctx.strokeStyle = shade('#7a5a32', -0.15);
    for (let i = 4; i < TILE; i += 7) { ctx.beginPath(); ctx.moveTo(p.x + i, p.y); ctx.lineTo(p.x + i, p.y + TILE); ctx.stroke(); }
    paint(ctx, 8, '#2f7d2f', 0.2);                  // leaves
    paint(ctx, 9, '#f4f7fb', 0.06);                 // snow
    paint(ctx, 10, '#2b2b2b', 0.12);                // bedrock
    // glass: light frame
    p = fillTile(ctx, 11);
    ctx.clearRect((11 % ATLAS_TILES) * TILE, ((11 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect((11 % ATLAS_TILES) * TILE + 1, ((11 / ATLAS_TILES) | 0) * TILE + 1, TILE - 2, TILE - 2);
    ctx.lineWidth = 1;
    paint(ctx, 12, '#b9905a', 0.1);                 // planks
    p = paint(ctx, 13, '#9a9a9a', 0.16);            // cobble
    // ores: stone base with colored flecks
    const ore = (idx, c) => { paint(ctx, idx, '#888888', 0.1); const o = fillTile(ctx, idx); for (let i = 0; i < 12; i++) { ctx.fillStyle = c; ctx.fillRect(o.x + (Math.random() * TILE) | 0, o.y + (Math.random() * TILE) | 0, 3, 3); } };
    ore(14, '#1c1c1c'); ore(15, '#d8a06a'); ore(16, '#ffd84d'); ore(17, '#62e8e0');
    // torch
    ctx.clearRect((18 % ATLAS_TILES) * TILE, ((18 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 18);
    ctx.fillStyle = '#7a5a32';
    ctx.fillRect(p.x + TILE * 0.42, p.y + TILE * 0.35, TILE * 0.16, TILE * 0.6);
    ctx.fillStyle = '#ffd24d';
    ctx.fillRect(p.x + TILE * 0.38, p.y + TILE * 0.18, TILE * 0.24, TILE * 0.22);
    paint(ctx, 19, '#7a5a32', 0.1);                 // crafting top
    p = paint(ctx, 20, '#b9905a', 0.1);             // crafting side
    ctx.strokeStyle = shade('#b9905a', -0.25);
    ctx.strokeRect(p.x + 4, p.y + 4, TILE - 8, TILE - 8);
    // bricks
    p = paint(ctx, 21, '#a8452f', 0.08);
    ctx.strokeStyle = shade('#a8452f', -0.3);
    for (let r = 0; r < TILE; r += 8) { ctx.beginPath(); ctx.moveTo(p.x, p.y + r); ctx.lineTo(p.x + TILE, p.y + r); ctx.stroke(); }
    paint(ctx, 22, '#7f7f7f', 0.2);                 // gravel

    // cactus
    p = paint(ctx, 23, '#3f7d3a', 0.12);
    ctx.strokeStyle = shade('#3f7d3a', -0.3);
    ctx.strokeRect(p.x + 4, p.y + 1, TILE - 8, TILE - 2);
    // furnace side (stone) + front (with opening)
    paint(ctx, 24, '#6f6f6f', 0.14);
    p = paint(ctx, 25, '#6f6f6f', 0.14);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(p.x + TILE * 0.28, p.y + TILE * 0.45, TILE * 0.44, TILE * 0.4);
    ctx.fillStyle = '#ff8a2a';
    ctx.fillRect(p.x + TILE * 0.34, p.y + TILE * 0.62, TILE * 0.32, TILE * 0.18);
    // apple
    ctx.clearRect((26 % ATLAS_TILES) * TILE, ((26 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 26);
    ctx.fillStyle = '#d83030';
    ctx.beginPath(); ctx.arc(p.x + TILE / 2, p.y + TILE * 0.56, TILE * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4f2a'; ctx.fillRect(p.x + TILE * 0.48, p.y + TILE * 0.2, 3, TILE * 0.2);
    // raw + cooked meat
    ctx.clearRect((27 % ATLAS_TILES) * TILE, ((27 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 27);
    ctx.fillStyle = '#e07a8a'; ctx.fillRect(p.x + TILE * 0.2, p.y + TILE * 0.3, TILE * 0.6, TILE * 0.4);
    ctx.clearRect((28 % ATLAS_TILES) * TILE, ((28 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 28);
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(p.x + TILE * 0.2, p.y + TILE * 0.3, TILE * 0.6, TILE * 0.4);
    // iron + gold ingots
    ctx.clearRect((29 % ATLAS_TILES) * TILE, ((29 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 29);
    ctx.fillStyle = '#d8d8e0'; ctx.fillRect(p.x + TILE * 0.22, p.y + TILE * 0.4, TILE * 0.56, TILE * 0.22);
    ctx.clearRect((30 % ATLAS_TILES) * TILE, ((30 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 30);
    ctx.fillStyle = '#ffd84d'; ctx.fillRect(p.x + TILE * 0.22, p.y + TILE * 0.4, TILE * 0.56, TILE * 0.22);
    // bread
    ctx.clearRect((31 % ATLAS_TILES) * TILE, ((31 / ATLAS_TILES) | 0) * TILE, TILE, TILE);
    p = fillTile(ctx, 31);
    ctx.fillStyle = '#c98a3a';
    ctx.beginPath(); ctx.ellipse(p.x + TILE / 2, p.y + TILE / 2, TILE * 0.34, TILE * 0.22, 0, 0, Math.PI * 2); ctx.fill();

    // Tools (icons drawn as a wooden handle + a metal head).
    const tool = (idx, draw) => {
      ctx.clearRect((idx % ATLAS_TILES) * TILE, ((idx / ATLAS_TILES) | 0) * TILE, TILE, TILE);
      const o = fillTile(ctx, idx);
      draw(o.x, o.y);
    };
    const handle = (x, y) => { ctx.fillStyle = '#7a5a32'; ctx.fillRect(x + TILE * 0.55, y + TILE * 0.5, TILE * 0.1, TILE * 0.42); };
    tool(32, (x, y) => { // sword
      ctx.fillStyle = '#7a5a32'; ctx.fillRect(x + TILE * 0.2, y + TILE * 0.7, TILE * 0.2, TILE * 0.12);
      ctx.fillStyle = '#d8d8e0'; ctx.save(); ctx.translate(x + TILE / 2, y + TILE / 2); ctx.rotate(-0.78);
      ctx.fillRect(-TILE * 0.06, -TILE * 0.42, TILE * 0.12, TILE * 0.6); ctx.restore();
    });
    tool(33, (x, y) => { handle(x, y); // pickaxe
      ctx.strokeStyle = '#cfcfd8'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x + TILE * 0.25, y + TILE * 0.3); ctx.quadraticCurveTo(x + TILE * 0.6, y + TILE * 0.18, x + TILE * 0.8, y + TILE * 0.36); ctx.stroke(); ctx.lineWidth = 1;
    });
    tool(34, (x, y) => { handle(x, y); // axe
      ctx.fillStyle = '#cfcfd8'; ctx.beginPath(); ctx.moveTo(x + TILE * 0.45, y + TILE * 0.2);
      ctx.lineTo(x + TILE * 0.78, y + TILE * 0.3); ctx.lineTo(x + TILE * 0.6, y + TILE * 0.5); ctx.lineTo(x + TILE * 0.45, y + TILE * 0.42); ctx.fill();
    });
    tool(35, (x, y) => { handle(x, y); // shovel
      ctx.fillStyle = '#cfcfd8'; ctx.fillRect(x + TILE * 0.48, y + TILE * 0.18, TILE * 0.24, TILE * 0.26);
    });
    tool(36, (x, y) => { handle(x, y); // mace
      ctx.fillStyle = '#9a9aa6'; ctx.beginPath(); ctx.arc(x + TILE * 0.6, y + TILE * 0.32, TILE * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6f6f7a'; for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2; ctx.fillRect(x + TILE * 0.6 + Math.cos(an) * TILE * 0.2 - 2, y + TILE * 0.32 + Math.sin(an) * TILE * 0.2 - 2, 4, 4); }
    });
    tool(37, (x, y) => { // spear
      ctx.fillStyle = '#7a5a32'; ctx.save(); ctx.translate(x + TILE / 2, y + TILE / 2); ctx.rotate(-0.78);
      ctx.fillRect(-TILE * 0.04, -TILE * 0.1, TILE * 0.08, TILE * 0.7); ctx.restore();
      ctx.fillStyle = '#cfcfd8'; ctx.save(); ctx.translate(x + TILE * 0.7, y + TILE * 0.28); ctx.rotate(-0.78);
      ctx.beginPath(); ctx.moveTo(0, -TILE * 0.16); ctx.lineTo(TILE * 0.08, 0); ctx.lineTo(-TILE * 0.08, 0); ctx.fill(); ctx.restore();
    });

    return canvas;
  }

  /** Compute UV rect for a tile index. Returns [u0,v0,u1,v1] in 0..1. */
  function tileUV(idx) {
    const col = idx % ATLAS_TILES, row = (idx / ATLAS_TILES) | 0;
    const s = 1 / ATLAS_TILES;
    // small inset to avoid texture bleeding between tiles
    const pad = 0.001;
    return [col * s + pad, row * s + pad, (col + 1) * s - pad, (row + 1) * s - pad];
  }

  MC.Blocks = {
    ID, DEFS, ATLAS_TILES, TILE, buildAtlas, tileUV,
    get: (id) => DEFS[id] || DEFS[ID.AIR],
    isSolid: (id) => DEFS[id] && DEFS[id].solid,
    isOpaque: (id) => DEFS[id] && !DEFS[id].transparent && id !== ID.AIR,
    isLiquid: (id) => DEFS[id] && DEFS[id].liquid === true,
    /** True for carried-only items (food, ingots) that can't be placed as blocks. */
    isItem: (id) => !!(DEFS[id] && DEFS[id].item),
    /** True for edible items. */
    isFood: (id) => !!(DEFS[id] && DEFS[id].food),
    /** Placeable blocks shown in creative inventory order. */
    placeable: [ID.GRASS, ID.DIRT, ID.STONE, ID.COBBLE, ID.SAND, ID.WOOD, ID.PLANK,
      ID.LEAVES, ID.GLASS, ID.BRICK, ID.SNOW, ID.GRAVEL, ID.WATER, ID.TORCH,
      ID.CRAFTING, ID.FURNACE, ID.CACTUS, ID.COAL, ID.IRON, ID.GOLD, ID.DIAMOND,
      ID.APPLE, ID.COOKED_MEAT, ID.IRON_INGOT, ID.GOLD_INGOT, ID.BREAD,
      ID.SWORD, ID.PICKAXE, ID.AXE, ID.SHOVEL, ID.MACE, ID.SPEAR],
  };
})(typeof window !== 'undefined' ? window : this);
