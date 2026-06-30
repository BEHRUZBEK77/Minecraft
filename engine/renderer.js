/**
 * renderer.js — WebGL renderer: shader programs, texture atlas upload, per-chunk
 * vertex/index buffers, sky gradient, selection outline, and the main draw loop
 * with frustum + back/face culling. Exposes global `MC.Renderer`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const Blocks = MC.Blocks;

  class Renderer {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
        canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not supported');
      this.gl = gl;
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);     // backface culling
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.clearColor(0.5, 0.7, 1.0, 1);

      // 32-bit indices so a single chunk mesh can exceed 65k vertices.
      this.uintExt = gl.getExtension('OES_element_index_uint');
      this.indexType = this.uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

      this.prog = this._program(MC.Shaders.voxelVS, MC.Shaders.voxelFS);
      this.skyProg = this._program(MC.Shaders.skyVS, MC.Shaders.skyFS);
      this.entProg = this._program(MC.Shaders.entVS, MC.Shaders.entFS);
      this.celProg = this._program(MC.Shaders.celVS, MC.Shaders.celFS);
      this._cacheLocations();
      this._uploadAtlas();
      this._initSky();
      this._initOutline();
      this._initCube();
      this._initCelestial();
      this.time = 0;
      this.fogColor = [0.6, 0.75, 0.95];
      this.dayLight = 1.0;
    }

    /** Compile + link a shader program. */
    _program(vsSrc, fsSrc) {
      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error('Shader: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error('Link: ' + gl.getProgramInfoLog(p));
      return p;
    }

    _cacheLocations() {
      const gl = this.gl, p = this.prog;
      this.loc = {
        aPos: gl.getAttribLocation(p, 'aPos'),
        aUV: gl.getAttribLocation(p, 'aUV'),
        aLight: gl.getAttribLocation(p, 'aLight'),
        aAO: gl.getAttribLocation(p, 'aAO'),
        uViewProj: gl.getUniformLocation(p, 'uViewProj'),
        uChunkOrigin: gl.getUniformLocation(p, 'uChunkOrigin'),
        uTex: gl.getUniformLocation(p, 'uTex'),
        uCamPos: gl.getUniformLocation(p, 'uCamPos'),
        uFogStart: gl.getUniformLocation(p, 'uFogStart'),
        uFogEnd: gl.getUniformLocation(p, 'uFogEnd'),
        uFogColor: gl.getUniformLocation(p, 'uFogColor'),
        uDayLight: gl.getUniformLocation(p, 'uDayLight'),
        uAlpha: gl.getUniformLocation(p, 'uAlpha'),
        uTime: gl.getUniformLocation(p, 'uTime'),
        uWater: gl.getUniformLocation(p, 'uWater'),
      };
      this.skyLoc = {
        aPos: gl.getAttribLocation(this.skyProg, 'aPos'),
        uTop: gl.getUniformLocation(this.skyProg, 'uTop'),
        uBottom: gl.getUniformLocation(this.skyProg, 'uBottom'),
      };
      const e = this.entProg;
      this.entLoc = {
        aPos: gl.getAttribLocation(e, 'aPos'),
        aNormal: gl.getAttribLocation(e, 'aNormal'),
        uViewProj: gl.getUniformLocation(e, 'uViewProj'),
        uOrigin: gl.getUniformLocation(e, 'uOrigin'),
        uSize: gl.getUniformLocation(e, 'uSize'),
        uColor: gl.getUniformLocation(e, 'uColor'),
        uCamPos: gl.getUniformLocation(e, 'uCamPos'),
        uFogStart: gl.getUniformLocation(e, 'uFogStart'),
        uFogEnd: gl.getUniformLocation(e, 'uFogEnd'),
        uFogColor: gl.getUniformLocation(e, 'uFogColor'),
        uDayLight: gl.getUniformLocation(e, 'uDayLight'),
      };
      const cl = this.celProg;
      this.celLoc = {
        aPos: gl.getAttribLocation(cl, 'aPos'),
        uViewRot: gl.getUniformLocation(cl, 'uViewRot'),
        uPointSize: gl.getUniformLocation(cl, 'uPointSize'),
        uColor: gl.getUniformLocation(cl, 'uColor'),
        uRound: gl.getUniformLocation(cl, 'uRound'),
      };
    }

    /** Generate a fixed starfield (points on the upper hemisphere). */
    _initCelestial() {
      const gl = this.gl;
      const N = 500;
      const verts = new Float32Array(N * 3);
      let seed = 9281;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let i = 0; i < N; i++) {
        // Uniform-ish points on a sphere, biased to upper half.
        const theta = rnd() * Math.PI * 2;
        const y = rnd();                      // 0..1 keeps stars above horizon
        const r = Math.sqrt(1 - y * y);
        verts[i * 3] = Math.cos(theta) * r;
        verts[i * 3 + 1] = y;
        verts[i * 3 + 2] = Math.sin(theta) * r;
      }
      this.starBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      this.starCount = N;
      this._viewRot = new Float32Array(16);
    }

    /**
     * Draw sun, moon and stars. Directions are unit vectors; nightFactor 0..1
     * controls star/moon visibility.
     * @param {Camera} camera
     * @param {number[]} sunDir
     * @param {number[]} moonDir
     * @param {number} nightFactor
     */
    drawCelestial(camera, sunDir, moonDir, nightFactor) {
      const gl = this.gl, l = this.celLoc;
      // projection * (view with translation removed) so bodies sit at infinity.
      const v = camera.view, vr = this._viewRot;
      vr.set(v); vr[12] = 0; vr[13] = 0; vr[14] = 0;
      const m = new Float32Array(16);
      MC.math.mat4.multiply(m, camera.proj, vr);

      gl.useProgram(this.celProg);
      gl.uniformMatrix4fv(l.uViewRot, false, m);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      // Stars (night only).
      if (nightFactor > 0.01) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
        gl.enableVertexAttribArray(l.aPos);
        gl.vertexAttribPointer(l.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(l.uPointSize, 2.0);
        gl.uniform1f(l.uRound, 0.0);
        gl.uniform4f(l.uColor, 1, 1, 1, nightFactor);
        gl.drawArrays(gl.POINTS, 0, this.starCount);
        gl.disableVertexAttribArray(l.aPos);
      }

      // Sun + moon as single soft discs.
      gl.uniform1f(l.uRound, 1.0);
      const disc = (dir, size, r, g, b, a) => {
        if (dir[1] < -0.15 || a <= 0) return;     // below horizon: skip
        gl.disableVertexAttribArray(l.aPos);
        gl.vertexAttrib3f(l.aPos, dir[0], dir[1], dir[2]);
        gl.uniform1f(l.uPointSize, size);
        gl.uniform4f(l.uColor, r, g, b, a);
        gl.drawArrays(gl.POINTS, 0, 1);
      };
      disc(sunDir, 70, 1.0, 0.95, 0.7, 1.0);
      disc(moonDir, 48, 0.85, 0.88, 0.95, Math.max(0.4, nightFactor));

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /** Build a unit cube (positions + normals) for entity rendering. */
    _initCube() {
      const gl = this.gl;
      // 6 faces * 2 tris, with per-vertex normals. Cube spans 0..1.
      const f = [
        // +X
        [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]],
        // -X
        [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1], [-1, 0, 0]],
        // +Y
        [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
        // -Y
        [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
        // +Z
        [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1], [0, 0, 1]],
        // -Z
        [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, -1]],
      ];
      const verts = [];
      for (const face of f) {
        const n = face[4];
        const q = [face[0], face[1], face[2], face[3]];
        const tri = [0, 1, 2, 0, 2, 3];
        for (const i of tri) verts.push(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2]);
      }
      this.cubeBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      this.cubeCount = verts.length / 6;
    }

    /** Begin entity pass: bind program and shared uniforms. */
    beginEntities(camera, fogStart, fogEnd) {
      const gl = this.gl, l = this.entLoc;
      gl.useProgram(this.entProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
      gl.enableVertexAttribArray(l.aPos);
      gl.vertexAttribPointer(l.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(l.aNormal);
      gl.vertexAttribPointer(l.aNormal, 3, gl.FLOAT, false, 24, 12);
      gl.uniformMatrix4fv(l.uViewProj, false, camera.viewProj);
      gl.uniform3fv(l.uCamPos, camera.position);
      gl.uniform1f(l.uFogStart, fogStart);
      gl.uniform1f(l.uFogEnd, fogEnd);
      gl.uniform3fv(l.uFogColor, this.fogColor);
      gl.uniform1f(l.uDayLight, this.dayLight);
    }

    /** Draw one cuboid for an entity body part. origin = min corner (world). */
    drawCuboid(origin, size, color) {
      const gl = this.gl, l = this.entLoc;
      gl.uniform3fv(l.uOrigin, origin);
      gl.uniform3fv(l.uSize, size);
      gl.uniform3fv(l.uColor, color);
      gl.drawArrays(gl.TRIANGLES, 0, this.cubeCount);
    }

    /** Build and upload the procedural block atlas texture. */
    _uploadAtlas() {
      const gl = this.gl;
      const canvas = Blocks.buildAtlas();
      this.atlasCanvas = canvas;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.atlas = tex;
    }

    _initSky() {
      const gl = this.gl;
      this.skyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }

    _initOutline() {
      const gl = this.gl;
      // 12 edges of a unit cube as line segments
      const e = [
        0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
        0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0,
        0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1,
      ];
      // Expand the cube slightly past block bounds to avoid z-fighting with faces.
      const expanded = e.map((v) => (v === 0 ? -0.004 : 1.004));
      this.outlineBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(expanded), gl.STATIC_DRAW);
      this.outlineCount = e.length / 3;
    }

    /** Resize backing store to display size. */
    resize() {
      const c = this.canvas;
      const w = c.clientWidth * (window.devicePixelRatio || 1) | 0;
      const h = c.clientHeight * (window.devicePixelRatio || 1) | 0;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.gl.viewport(0, 0, c.width, c.height);
      return c.width / c.height;
    }

    /**
     * Upload a mesh built by the mesher into GPU buffers attached to a chunk.
     * @param {object} target chunk-mesh slot recipient {pos,uv,light,ao,index counts}
     */
    uploadMesh(data) {
      const gl = this.gl;
      if (!data || data.indexCount === 0) return null;
      const buf = (arr, type) => {
        const b = gl.createBuffer();
        gl.bindBuffer(type, b);
        gl.bufferData(type, arr, gl.STATIC_DRAW);
        return b;
      };
      const idxArr = this.uintExt ? new Uint32Array(data.indices) : new Uint16Array(data.indices);
      return {
        pos: buf(data.positions, gl.ARRAY_BUFFER),
        uv: buf(data.uvs, gl.ARRAY_BUFFER),
        light: buf(data.lights, gl.ARRAY_BUFFER),
        ao: buf(data.aos, gl.ARRAY_BUFFER),
        index: buf(idxArr, gl.ELEMENT_ARRAY_BUFFER),
        count: data.indexCount,
      };
    }

    deleteMesh(m) {
      if (!m) return;
      const gl = this.gl;
      gl.deleteBuffer(m.pos); gl.deleteBuffer(m.uv); gl.deleteBuffer(m.light);
      gl.deleteBuffer(m.ao); gl.deleteBuffer(m.index);
    }

    /** Draw the sky gradient quad (depth ~far). */
    drawSky(top, bottom) {
      const gl = this.gl;
      gl.depthMask(false);
      gl.useProgram(this.skyProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.enableVertexAttribArray(this.skyLoc.aPos);
      gl.vertexAttribPointer(this.skyLoc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(this.skyLoc.uTop, top);
      gl.uniform3fv(this.skyLoc.uBottom, bottom);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
    }

    /** Begin a voxel-pass frame: bind program, atlas and shared uniforms. */
    beginVoxel(camera, fogStart, fogEnd) {
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.uniform1i(this.loc.uTex, 0);
      gl.uniformMatrix4fv(this.loc.uViewProj, false, camera.viewProj);
      gl.uniform3fv(this.loc.uCamPos, camera.position);
      gl.uniform1f(this.loc.uFogStart, fogStart);
      gl.uniform1f(this.loc.uFogEnd, fogEnd);
      gl.uniform3fv(this.loc.uFogColor, this.fogColor);
      gl.uniform1f(this.loc.uDayLight, this.dayLight);
      gl.uniform1f(this.loc.uTime, this.time || 0);
      gl.uniform1f(this.loc.uWater, 0);
    }

    /** Toggle the water-wave path of the voxel vertex shader. */
    setWaterPass(on) { this.gl.uniform1f(this.loc.uWater, on ? 1 : 0); }

    /** Draw a single chunk mesh at its world origin. */
    drawChunkMesh(mesh, originX, originZ, alpha = 1) {
      if (!mesh) return;
      const gl = this.gl, loc = this.loc;
      gl.uniform3f(loc.uChunkOrigin, originX, 0, originZ);
      gl.uniform1f(loc.uAlpha, alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
      gl.enableVertexAttribArray(loc.aUV);
      gl.vertexAttribPointer(loc.aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.light);
      gl.enableVertexAttribArray(loc.aLight);
      gl.vertexAttribPointer(loc.aLight, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.ao);
      gl.enableVertexAttribArray(loc.aAO);
      gl.vertexAttribPointer(loc.aAO, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
      gl.drawElements(gl.TRIANGLES, mesh.count, this.indexType, 0);
    }

    /** Draw selection wireframe around the targeted block. */
    drawOutline(camera, x, y, z) {
      const gl = this.gl, loc = this.loc;
      gl.useProgram(this.prog);
      gl.uniform3f(loc.uChunkOrigin, x, y, z);
      gl.uniform1f(loc.uAlpha, 1);
      gl.uniform1f(loc.uWater, 0);
      gl.uniform1f(loc.uDayLight, 0); // light=0 renders the wireframe dark
      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(loc.aUV);
      gl.disableVertexAttribArray(loc.aLight);
      gl.disableVertexAttribArray(loc.aAO);
      gl.vertexAttrib2f(loc.aUV, 0.999, 0.999);
      gl.vertexAttrib1f(loc.aLight, 0.0);
      gl.vertexAttrib1f(loc.aAO, 1.0);
      // scale unit cube to 1.004 by drawing positions already 0..1 offset; good enough
      gl.drawArrays(gl.LINES, 0, this.outlineCount);
    }

    clear() {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
  }

  MC.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : this);
