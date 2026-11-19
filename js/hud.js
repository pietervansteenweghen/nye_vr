// In-world HUD. It is attached to the camera as 3D planes (not HTML) so it
// also works in Cardboard mode, where each eye needs its own copy.
import * as THREE from 'three';

function canvasPlane(w, h, pxW, pxH) {
  const canvas = document.createElement('canvas');
  canvas.width = pxW; canvas.height = pxH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 20;
  return { mesh, canvas, ctx: canvas.getContext('2d'), tex };
}

function outlinedText(g, text, x, y, size, fill = '#fff') {
  g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
  g.lineJoin = 'round';
  g.lineWidth = size * 0.18; g.strokeStyle = 'rgba(20,10,40,0.9)'; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
}

const HUD_DIST = 2;

export class Hud {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);

    this.bar = canvasPlane(2, 0.25, 1024, 128);
    this.root.add(this.bar.mesh);

    this.center = canvasPlane(1.6, 0.8, 1024, 512);
    this.center.mesh.position.set(0, 0.15, -HUD_DIST);
    this.root.add(this.center.mesh);

    // Reticle: dot + ring that fills up while locked on a target.
    const mat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, fog: false });
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), mat(0xffffff));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 32), mat(0xffffff));
    this.ring.material.opacity = 0.6;
    this.fill = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.042, 32, 1, 0, 0.001), mat(0xff2d6f));
    for (const m of [this.dot, this.ring, this.fill]) { m.position.z = -HUD_DIST; m.renderOrder = 30; this.root.add(m); }

    this.redFlash = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0xff0033, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.redFlash.position.z = -1; this.redFlash.renderOrder = 25;
    this.root.add(this.redFlash);

    this._lastBar = '';
    this._lastCenter = '';
    this._fillAmount = -1;
  }

  // Keep the top bar inside the visible area for the current screen shape.
  layout(fovDeg, aspect) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) * HUD_DIST;
    const halfW = halfH * aspect;
    const s = Math.min(1, (halfW * 1.8) / 2);
    this.bar.mesh.scale.setScalar(s);
    this.bar.mesh.position.set(0, halfH * 0.78 - 0.125 * s, -HUD_DIST);
    this.center.mesh.scale.setScalar(Math.min(1, (halfW * 1.9) / 1.6));
  }

  setBar(score, hearts, timeLeft) {
    const key = `${score}|${hearts}|${Math.ceil(timeLeft)}`;
    if (key === this._lastBar) return;
    this._lastBar = key;
    const { ctx: g, canvas, tex } = this.bar;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    outlinedText(g, `⭐ ${score}`, 24, 66, 72, '#ffd23f');
    g.textAlign = 'center';
    outlinedText(g, '❤️'.repeat(Math.max(0, hearts)) + '🖤'.repeat(Math.max(0, 5 - hearts)), 512, 66, 56);
    g.textAlign = 'right';
    outlinedText(g, `⏱ ${Math.max(0, Math.ceil(timeLeft))}`, 1000, 66, 72);
    tex.needsUpdate = true;
  }

  setCenter(lines) {
    const key = JSON.stringify(lines);
    if (key === this._lastCenter) return;
    this._lastCenter = key;
    const { ctx: g, canvas, tex } = this.center;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
    let y = canvas.height / 2 - total / 2;
    for (const l of lines) {
      y += l.size * 0.625;
      outlinedText(g, l.text, canvas.width / 2, y, l.size, l.color || '#fff');
      y += l.size * 0.625;
    }
    tex.needsUpdate = true;
    this.center.mesh.visible = lines.length > 0;
  }

  setReticle(amount, locked) {
    const a = Math.round(amount * 40) / 40;
    if (a !== this._fillAmount) {
      this._fillAmount = a;
      this.fill.geometry.dispose();
      this.fill.geometry = new THREE.RingGeometry(0.03, 0.042, 32, 1, Math.PI / 2, Math.max(0.001, a * Math.PI * 2));
    }
    this.ring.scale.setScalar(locked ? 1.25 : 1);
    this.ring.material.color.set(locked ? 0xff2d6f : 0xffffff);
  }

  flashRed() { this.redFlash.material.opacity = 0.45; }

  update(dt) {
    const m = this.redFlash.material;
    if (m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 1.2);
    this.redFlash.visible = m.opacity > 0;
  }
}
