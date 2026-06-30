/**
 * voxel.glsl.js — GLSL source for the voxel and sky shaders, kept as JS strings so
 * the game loads from file:// without fetch(). Exposes global `MC.Shaders`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});

  // Voxel shader: textured, with baked light (sky+block) and fog.
  const voxelVS = `
    attribute vec3 aPos;
    attribute vec2 aUV;
    attribute float aLight;   // 0..1 combined light
    attribute float aAO;      // 0..1 ambient occlusion
    uniform mat4 uViewProj;
    uniform vec3 uChunkOrigin;
    varying vec2 vUV;
    varying float vLight;
    varying float vFog;
    uniform vec3 uCamPos;
    uniform float uFogStart;
    uniform float uFogEnd;
    void main() {
      vec3 world = aPos + uChunkOrigin;
      gl_Position = uViewProj * vec4(world, 1.0);
      vUV = aUV;
      vLight = aLight * aAO;
      float d = distance(world, uCamPos);
      vFog = clamp((d - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
    }`;

  const voxelFS = `
    precision mediump float;
    varying vec2 vUV;
    varying float vLight;
    varying float vFog;
    uniform sampler2D uTex;
    uniform vec3 uFogColor;
    uniform float uDayLight;   // 0.1 night .. 1.0 day
    uniform float uAlpha;
    void main() {
      vec4 tex = texture2D(uTex, vUV);
      if (tex.a < 0.3) discard;
      float light = clamp(vLight * uDayLight + 0.06, 0.0, 1.0);
      vec3 color = tex.rgb * light;
      color = mix(color, uFogColor, vFog);
      gl_FragColor = vec4(color, tex.a * uAlpha);
    }`;

  // Sky shader: full-screen gradient quad.
  const skyVS = `
    attribute vec2 aPos;
    varying vec2 vPos;
    void main() { vPos = aPos; gl_Position = vec4(aPos, 0.999, 1.0); }`;

  const skyFS = `
    precision mediump float;
    varying vec2 vPos;
    uniform vec3 uTop;
    uniform vec3 uBottom;
    void main() {
      float t = clamp(vPos.y * 0.5 + 0.5, 0.0, 1.0);
      gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
    }`;

  // Entity shader: solid color cuboids (mobs) with simple directional shade + fog.
  const entVS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uViewProj;
    uniform vec3 uOrigin;
    uniform vec3 uSize;
    uniform vec3 uCamPos;
    uniform float uFogStart;
    uniform float uFogEnd;
    varying float vShade;
    varying float vFog;
    void main() {
      vec3 world = aPos * uSize + uOrigin;
      gl_Position = uViewProj * vec4(world, 1.0);
      // cheap lambert from a fixed sun direction
      vShade = 0.55 + 0.45 * max(dot(normalize(aNormal), normalize(vec3(0.4,1.0,0.3))), 0.0);
      float d = distance(world, uCamPos);
      vFog = clamp((d - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
    }`;

  const entFS = `
    precision mediump float;
    varying float vShade;
    varying float vFog;
    uniform vec3 uColor;
    uniform vec3 uFogColor;
    uniform float uDayLight;
    void main() {
      vec3 c = uColor * vShade * clamp(uDayLight + 0.15, 0.0, 1.0);
      c = mix(c, uFogColor, vFog);
      gl_FragColor = vec4(c, 1.0);
    }`;

  MC.Shaders = { voxelVS, voxelFS, skyVS, skyFS, entVS, entFS };
})(typeof window !== 'undefined' ? window : this);
