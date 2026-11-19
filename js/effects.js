// Explosions (chunky cubes + confetti), flashes, floating score text, laser beam.
import * as THREE from 'three';

const CONFETTI = [0xffd23f, 0xff3ea5, 0x4de1c1, 0xffffff, 0x8f6bff];
const MAX_PARTICLES = 600;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Particles: one InstancedMesh for every chunk on screen.
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) this.mesh.setColorAt(i, white);
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({
      life: 0, max: 1, size: 0.1, p: new THREE.Vector3(), v: new THREE.Vector3(),
      r: new THREE.Euler(), rv: new THREE.Vector3(),
    }));
    this.next = 0;
    scene.add(this.mesh);

    // Expanding flash balls.
    this.flashes = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false; m.userData.t = 1;
      scene.add(m);
      return m;
    });

    // Floating "+10" sprites.
    this.texts = Array.from({ length: 10 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      s.renderOrder = 10; s.visible = false; s.userData = { canvas, tex, t: 1 };
      scene.add(s);
      return s;
    });

    // Laser beam: glowing outer tube + white core, plus an impact glow.
    // Tapered: thin at the gun end (near your face), wider at the target.
    const beamGeo = new THREE.CylinderGeometry(1, 0.2, 1, 6, 1, true).translate(0, 0.5, 0);
    this.beam = new THREE.Group();
    this.beamOuter = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff2d6f, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.add(this.beamOuter, this.beamCore);
    this.impact = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), this.beamOuter.material);
    this.beam.visible = this.impact.visible = false;
    scene.add(this.beam, this.impact);
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
  }

  explode(pos, colors, golden = false) {
    const n = golden ? 70 : 40;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.next];
      const idx = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      const confetti = i % 3 === 0;
      p.p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
      p.v.set((Math.random() - 0.5) * 9, 3 + Math.random() * 8, (Math.random() - 0.5) * 9);
      p.rv.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      p.size = confetti ? 0.08 + Math.random() * 0.06 : 0.12 + Math.random() * 0.22;
      p.max = p.life = 1.2 + Math.random() * 0.8;
      c.setHex(golden ? (Math.random() < 0.6 ? 0xffd23f : 0xffffff)
        : confetti ? CONFETTI[i % CONFETTI.length] : colors[i % colors.length]);
      this.mesh.setColorAt(idx, c);
    }
    this.mesh.instanceColor.needsUpdate = true;

    const f = this.flashes.find(f => f.userData.t >= 1) || this.flashes[0];
    f.position.copy(pos); f.userData.t = 0; f.userData.big = golden ? 3.5 : 2.2; f.visible = true;
  }

  floatText(pos, text, color = '#ffd23f') {
    const s = this.texts.find(s => s.userData.t >= 1) || this.texts[0];
    const { canvas, tex } = s.userData;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.font = 'bold 84px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#1b1035'; g.strokeText(text, 128, 64);
    g.fillStyle = color; g.fillText(text, 128, 64);
    tex.needsUpdate = true;
    s.position.copy(pos); s.scale.set(2.4, 1.2, 1);
    s.userData.t = 0; s.userData.y0 = pos.y; s.visible = true;
  }

  setBeam(from, to, active, time) {
    this.beam.visible = this.impact.visible = active;
    if (!active) return;
    this._dir.subVectors(to, from);
    const len = this._dir.length();
    this.beam.position.copy(from);
    this.beam.quaternion.setFromUnitVectors(this._up, this._dir.divideScalar(len));
    const wob = 1 + 0.25 * Math.sin(time * 60);
    this.beamOuter.scale.set(0.09 * wob, len, 0.09 * wob);
    this.beamCore.scale.set(0.03, len, 0.03);
    this.impact.position.copy(to);
    this.impact.scale.setScalar(0.8 + 0.4 * Math.sin(time * 45));
  }

  update(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { if (p.size) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); p.size = 0; } continue; }
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.05) { p.p.y = 0.05; p.v.y *= -0.35; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.r.x += p.rv.x * dt; p.r.y += p.rv.y * dt; p.r.z += p.rv.z * dt;
      const k = Math.min(1, p.life / (p.max * 0.4));
      s.setScalar(Math.max(0.0001, p.size * k));
      m.compose(p.p, q.setFromEuler(p.r), s);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (const f of this.flashes) {
      if (f.userData.t >= 1) continue;
      f.userData.t = Math.min(1, f.userData.t + dt * 4);
      const t = f.userData.t;
      f.scale.setScalar(0.3 + t * f.userData.big);
      f.material.opacity = 1 - t;
      f.visible = t < 1;
    }
    for (const s of this.texts) {
      if (s.userData.t >= 1) continue;
      s.userData.t = Math.min(1, s.userData.t + dt * 0.9);
      const t = s.userData.t;
      s.position.y = s.userData.y0 + t * 2.2;
      s.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      s.visible = t < 1;
    }
  }
}
