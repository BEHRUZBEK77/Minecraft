/**
 * camera.js — First-person camera: builds view/projection matrices and a frustum
 * used for chunk culling. Exposes global `MC.Camera`.
 */
(function (global) {
  'use strict';
  const MC = (global.MC = global.MC || {});
  const { mat4, vec3, clamp } = MC.math;

  class Camera {
    constructor() {
      this.position = [0, 80, 0];
      this.yaw = 0;          // radians, around Y
      this.pitch = 0;        // radians, up/down (clamped)
      this.fov = 70 * Math.PI / 180;
      this.near = 0.1;
      this.far = 1000;
      this.aspect = 1;
      this.proj = mat4.identity();
      this.view = mat4.identity();
      this.viewProj = mat4.identity();
      this._planes = new Array(6).fill(0).map(() => [0, 0, 0, 0]);
    }

    /** Unit forward vector from yaw/pitch. */
    forward() {
      const cp = Math.cos(this.pitch);
      return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
    }

    /** Forward vector projected onto the ground plane (for walking). */
    forwardFlat() {
      return [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    }

    /** Right vector on the ground plane. */
    right() {
      return [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
    }

    /** Apply mouse delta to look direction. */
    look(dx, dy, sensitivity = 0.0025) {
      this.yaw += dx * sensitivity;
      this.pitch = clamp(this.pitch - dy * sensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }

    /** Recompute projection, view and combined matrices + frustum planes. */
    update(aspect) {
      this.aspect = aspect;
      mat4.perspective(this.proj, this.fov, aspect, this.near, this.far);
      const fwd = this.forward();
      const center = vec3.add(this.position, fwd);
      mat4.lookAt(this.view, this.position, center, [0, 1, 0]);
      mat4.multiply(this.viewProj, this.proj, this.view);
      this._extractFrustum();
    }

    /** Extract 6 frustum planes from the view-projection matrix (Gribb/Hartmann). */
    _extractFrustum() {
      const m = this.viewProj, pl = this._planes;
      const set = (i, a, b, c, d) => {
        const len = Math.hypot(a, b, c) || 1;
        pl[i][0] = a / len; pl[i][1] = b / len; pl[i][2] = c / len; pl[i][3] = d / len;
      };
      set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);   // left
      set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);   // right
      set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);   // bottom
      set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);   // top
      set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);  // near
      set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);  // far
    }

    /** Axis-aligned box vs frustum test for chunk culling. */
    boxInFrustum(minX, minY, minZ, maxX, maxY, maxZ) {
      const pl = this._planes;
      for (let i = 0; i < 6; i++) {
        const p = pl[i];
        const px = p[0] > 0 ? maxX : minX;
        const py = p[1] > 0 ? maxY : minY;
        const pz = p[2] > 0 ? maxZ : minZ;
        if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
      }
      return true;
    }
  }

  MC.Camera = Camera;
})(typeof window !== 'undefined' ? window : this);
