/**
 * smelting.js — Furnace smelting: recipes, fuel values, and a Furnace state machine
 * with an input, a fuel and an output slot that progresses over time.
 * Exposes global `MC.Smelting` and `MC.Furnace`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const ID = MC.Blocks.ID;

  // input block id -> output { id, count }
  const RECIPES = {
    [ID.SAND]: { id: ID.GLASS, count: 1 },
    [ID.COBBLE]: { id: ID.STONE, count: 1 },
    [ID.IRON]: { id: ID.IRON_INGOT, count: 1 },
    [ID.GOLD]: { id: ID.GOLD_INGOT, count: 1 },
    [ID.MEAT]: { id: ID.COOKED_MEAT, count: 1 },
  };

  // fuel block id -> number of items it can smelt
  const FUELS = {
    [ID.COAL]: 8,
    [ID.WOOD]: 2,
    [ID.PLANK]: 2,
    [ID.CRAFTING]: 2,
  };

  const SMELT_TIME = 3.0; // seconds per item

  class Furnace {
    constructor() {
      this.input = null;   // {id,count}
      this.fuel = null;    // {id,count}
      this.output = null;  // {id,count}
      this.burnLeft = 0;   // remaining items the current fuel charge can smelt
      this.progress = 0;   // 0..1 toward the next smelt
    }

    /** Result for the current input, or null. */
    _recipe() { return this.input ? RECIPES[this.input.id] || null : null; }

    /** Advance smelting by dt seconds. */
    tick(dt) {
      const recipe = this._recipe();
      const canOutput = recipe && (!this.output || (this.output.id === recipe.id &&
        this.output.count + recipe.count <= MC.Inventory.MAX_STACK));
      if (!recipe || !canOutput) { this.progress = 0; return; }

      // Light fuel if needed.
      if (this.burnLeft <= 0) {
        if (this.fuel && FUELS[this.fuel.id]) {
          this.burnLeft = FUELS[this.fuel.id];
          this.fuel.count--;
          if (this.fuel.count <= 0) this.fuel = null;
        } else { this.progress = 0; return; }
      }

      this.progress += dt / SMELT_TIME;
      if (this.progress >= 1) {
        this.progress = 0;
        this.burnLeft--;
        // Consume one input, produce output.
        this.input.count--;
        if (this.input.count <= 0) this.input = null;
        if (this.output && this.output.id === recipe.id) this.output.count += recipe.count;
        else this.output = { id: recipe.id, count: recipe.count };
      }
    }

    serialize() { return { input: this.input, fuel: this.fuel, output: this.output, burnLeft: this.burnLeft }; }
    deserialize(s) { if (!s) return; this.input = s.input; this.fuel = s.fuel; this.output = s.output; this.burnLeft = s.burnLeft || 0; }
  }

  MC.Smelting = { RECIPES, FUELS, SMELT_TIME, canSmelt: (id) => !!RECIPES[id], isFuel: (id) => !!FUELS[id] };
  MC.Furnace = Furnace;
})(typeof window !== 'undefined' ? window : this);
