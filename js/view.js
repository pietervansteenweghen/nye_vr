// Rendering: normal full-screen ("phone") or side-by-side stereo ("cardboard").
// We do our own stereo instead of WebXR because iPhone Safari has no WebXR.
import * as THREE from 'three';

const PIXEL_RATIO = { low: 1, med: 1.5, high: 2 };
// Rough size of one CSS pixel on a phone screen, in mm. Used to place each eye's
// image under the headset lens. Tunable via the "Lens distance" setting.
const MM_PER_CSS_PX = 0.17;

export class View {
  constructor(canvas, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.stereo = new THREE.StereoCamera();
    this.stereo.eyeSep = 0.064;
    this.mode = 'phone';
    this.width = 1; this.height = 1;
    this.eye = { w: 1, h: 1 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setMode(mode) { this.mode = mode; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.settings.quality] || 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.mode === 'vr') {
      // Each eye's image is centred under its lens and as wide as fits.
      const sep = this.settings.lensMM / MM_PER_CSS_PX;
      const vw = Math.max(50, Math.min(sep, w - sep, w / 2));
      this.eye = { w: vw, h, cxL: w / 2 - sep / 2, cxR: w / 2 + sep / 2 };
    } else {
      this.eye = { w, h };
    }
  }

  // Aspect and vertical FOV of what one eye sees (used to lay out the HUD).
  get aspect() { return this.eye.w / this.eye.h; }
  get fov() { return this.mode === 'vr' ? this.settings.fov : 70; }

  render(scene, camera) {
    const r = this.renderer;
    camera.fov = this.fov;
    camera.aspect = this.aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    if (this.mode !== 'vr') {
      r.setScissorTest(false);
      r.setViewport(0, 0, this.width, this.height);
      r.render(scene, camera);
      return;
    }

    r.setScissorTest(false);
    r.clear();
    this.stereo.update(camera);
    const { w, h, cxL, cxR } = this.eye;
    r.setScissorTest(true);
    for (const [cam, cx] of [[this.stereo.cameraL, cxL], [this.stereo.cameraR, cxR]]) {
      const x = cx - w / 2;
      r.setScissor(x, 0, w, h);
      r.setViewport(x, 0, w, h);
      r.render(scene, cam);
    }
    r.setScissorTest(false);
  }
}
