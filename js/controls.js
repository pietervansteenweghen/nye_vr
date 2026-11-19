// Head tracking: phone gyroscope (DeviceOrientation API) with a mouse/touch-drag
// fallback so the game can also be tested on a laptop.
import * as THREE from 'three';

const DEG = THREE.MathUtils.DEG2RAD;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Rotates the device frame so the camera looks out of the back of the phone.
const Q_WORLD = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

export class LookControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.hasSensor = false;
    this.lastEvent = null;
    this.yawOffset = 0;
    this.dragYaw = 0;
    this.dragPitch = 0;
    this._euler = new THREE.Euler();
    this._q = new THREE.Quaternion();
    this._qOffset = new THREE.Quaternion();
    this._dragging = null;
    this._onOrientation = this._onOrientation.bind(this);
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  // iOS 13+ needs an explicit permission prompt, triggered from a tap.
  // Call this synchronously inside the tap handler (before any other await).
  static requestPermission() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      return D.requestPermission().then(r => r === 'granted').catch(() => false);
    }
    return Promise.resolve(true);
  }

  connect() {
    window.addEventListener('deviceorientation', this._onOrientation);
    this.dom.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }

  disconnect() {
    window.removeEventListener('deviceorientation', this._onOrientation);
    this.dom.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
  }

  _onOrientation(e) {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    this.hasSensor = true;
    this.lastEvent = e;
  }

  // Drag-to-look only when there is no gyroscope (laptop, or permission denied).
  _onDown(e) {
    if (this.hasSensor) return;
    this._dragging = { x: e.clientX, y: e.clientY, moved: 0 };
  }
  _onMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._dragging.x, dy = e.clientY - this._dragging.y;
    this._dragging.x = e.clientX; this._dragging.y = e.clientY;
    this._dragging.moved += Math.abs(dx) + Math.abs(dy);
    this.dragYaw += dx * 0.005;
    this.dragPitch = THREE.MathUtils.clamp(this.dragPitch + dy * 0.005, -1.4, 1.4);
  }
  _onUp() { this._dragging = null; }

  screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  update() {
    const cam = this.camera;
    if (this.hasSensor && this.lastEvent) {
      const e = this.lastEvent;
      this._euler.set((e.beta || 0) * DEG, (e.alpha || 0) * DEG, -(e.gamma || 0) * DEG, 'YXZ');
      this._q.setFromEuler(this._euler).multiply(Q_WORLD);
      this._q.multiply(this._qOffset.setFromAxisAngle(Z_AXIS, -this.screenAngle() * DEG));
      this._qOffset.setFromAxisAngle(Y_AXIS, this.yawOffset);
      cam.quaternion.copy(this._qOffset).multiply(this._q);
    } else {
      this._euler.set(this.dragPitch, this.dragYaw + this.yawOffset, 0, 'YXZ');
      cam.quaternion.setFromEuler(this._euler);
    }
  }

  // Make the direction the player currently faces the new "forward" (-Z).
  recenter() {
    this.update();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    this.yawOffset -= yaw;
    this.update();
  }
}
