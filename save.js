/**
 * save.js — Persistence via IndexedDB. Stores modified chunks (run-length encoded),
 * player state, inventory, world time, weather and settings. Falls back to
 * localStorage for meta if IndexedDB is unavailable. Exposes global `MC.Save`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  const DB_NAME = 'voxelcraft';
  const DB_VERSION = 1;

  class Save {
    constructor() { this.db = null; this.ready = this._open(); }

    /** Open (and upgrade) the database. */
    _open() {
      return new Promise((resolve) => {
        if (!global.indexedDB) { resolve(null); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
        req.onerror = () => { console.warn('IndexedDB unavailable'); resolve(null); };
      });
    }

    _tx(store, mode) { return this.db.transaction(store, mode).objectStore(store); }

    /** Promise wrapper for a single IDB request. */
    _req(r) {
      return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }

    /** Run-length encode a chunk's block array to keep saves small. */
    static encodeChunk(chunk) {
      const b = chunk.blocks, out = [];
      let i = 0;
      while (i < b.length) {
        const v = b[i]; let run = 1;
        while (i + run < b.length && b[i + run] === v && run < 65535) run++;
        out.push(run, v);
        i += run;
      }
      return new Uint16Array(out);
    }

    /** Decode RLE data back into a chunk's block array. */
    static decodeChunk(chunk, data) {
      const b = chunk.blocks;
      let p = 0;
      for (let i = 0; i < data.length; i += 2) {
        const run = data[i], v = data[i + 1];
        for (let k = 0; k < run; k++) b[p++] = v;
      }
    }

    async saveChunk(chunk) {
      await this.ready; if (!this.db) return;
      const data = Save.encodeChunk(chunk);
      await this._req(this._tx('chunks', 'readwrite').put(data, chunk.cx + ',' + chunk.cz));
    }

    /** Load a chunk's saved blocks into it. @returns true if found. */
    async loadChunkInto(chunk) {
      await this.ready; if (!this.db) return false;
      const data = await this._req(this._tx('chunks', 'readonly').get(chunk.cx + ',' + chunk.cz));
      if (!data) return false;
      Save.decodeChunk(chunk, data);
      return true;
    }

    /** Synchronous cache of saved chunk keys so chunk creation can decide fast. */
    async loadChunkKeys() {
      await this.ready; if (!this.db) return new Set();
      const keys = await this._req(this._tx('chunks', 'readonly').getAllKeys());
      return new Set(keys);
    }

    async saveMeta(key, value) {
      await this.ready;
      if (!this.db) { try { localStorage.setItem('vc_' + key, JSON.stringify(value)); } catch (e) {} return; }
      await this._req(this._tx('meta', 'readwrite').put(value, key));
    }

    async loadMeta(key) {
      await this.ready;
      if (!this.db) { try { return JSON.parse(localStorage.getItem('vc_' + key)); } catch (e) { return null; } }
      return this._req(this._tx('meta', 'readonly').get(key));
    }

    /** Wipe all saved data (new world). */
    async clear() {
      await this.ready; if (!this.db) { localStorage.clear(); return; }
      await this._req(this._tx('chunks', 'readwrite').clear());
      await this._req(this._tx('meta', 'readwrite').clear());
    }
  }

  MC.Save = Save;
})(typeof window !== 'undefined' ? window : this);
