// Over-the-top block explosions: chunks fly everywhere and bounce around,
// smoke puffs, a shockwave ring, a flash and a comic "BOEM!" word.
import * as THREE from 'three';

const CONFETTI = [0xffd23f, 0xff3ea5, 0x4de1c1, 0xffffff, 0x8f6bff];
const PINKS = [0xf4a3a8, 0xe98a92, 0xffc2c6, 0xd9707c, 0xc95a66];
const BACON = [0xb3453d, 0xf2d0c0, 0x8e2f2a];
const SMOKE = [0xeeeeee, 0xd6d6d6, 0xbfbfbf];
// Fighting-game announcer style (in English, on purpose).
const WORDS = ['FATALITY', 'BRUTALITY', 'PORKALITY', 'BACONALITY', 'EXCELLENT', 'OUTSTANDING', 'SUPERB', 'WELL DONE', 'TOASTY!', 'HAMTASTIC'];
const MAX_PARTICLES = 1600;

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) { this.mesh.setColorAt(i, white); this.mesh.setMatrixAt(i, zero); }
    this.parts = Array.from({ length: MAX_PARTICLES }, () => ({
      life: 0, max: 1, size: 0, g: 16, grow: 0, p: new THREE.Vector3(), v: new THREE.Vector3(),
      r: new THREE.Euler(), rv: new THREE.Vector3(), alive: false,
    }));
    this.next = 0;
    scene.add(this.mesh);

    const additive = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flashes = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), additive(0xfff0a0));
      m.visible = false; m.userData.t = 1; scene.add(m); return m;
    });
    this.rings = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.userData.t = 1; scene.add(m); return m;
    });
    this.texts = Array.from({ length: 12 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 256;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
      s.renderOrder = 10; s.visible = false; s.userData = { canvas, tex, t: 1 };
      scene.add(s); return s;
    });

    // Laser beam: tapered glowing tube + white core, plus an impact glow.
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
    this._c = new THREE.Color();
  }

  _spawn(color, p, v, size, life, g = 16, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    const q = this.parts[i];
    q.p.copy(p); q.v.copy(v); q.size = size; q.max = q.life = life; q.g = g; q.grow = grow; q.alive = true;
    q.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    q.rv.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
    this.mesh.setColorAt(i, this._c.setHex(color));
  }

  // The big one. `colors` are the pig's own colours.
  explode(pos, colors = PINKS, { golden = false, scale = 1, word } = {}) {
    const P = new THREE.Vector3(), V = new THREE.Vector3();
    const chunk = golden ? [0xffd23f, 0xffe98a, 0xffffff] : [...PINKS, ...colors];
    // Meaty chunks flying in every direction.
    for (let i = 0; i < 90 * scale; i++) {
      P.copy(pos).add(V.set(rnd(-0.5, 0.5), rnd(-0.3, 0.5), rnd(-0.5, 0.5)));
      const speed = rnd(5, 17);
      const dir = V.set(rnd(-1, 1), rnd(0.3, 1.4), rnd(-1, 1)).normalize().multiplyScalar(speed);
      this._spawn(pick(chunk), P, dir, rnd(0.15, 0.5) * scale, rnd(3, 5));
    }
    // A few comically huge cubes.
    for (let i = 0; i < (scale >= 0.7 ? 5 : 0); i++) {
      this._spawn(pick(chunk), pos, V.set(rnd(-6, 6), rnd(9, 15), rnd(-6, 6)), rnd(0.7, 1.1) * scale, rnd(4, 5.5));
    }
    // Bacon bits + confetti.
    for (let i = 0; i < 30; i++) {
      const c = i % 2 ? pick(BACON) : pick(CONFETTI);
      this._spawn(c, pos, V.set(rnd(-9, 9), rnd(6, 16), rnd(-9, 9)), rnd(0.08, 0.2), rnd(2.5, 4), 9);
    }
    // Smoke puffs: rise slowly and grow.
    for (let i = 0; i < 14; i++) {
      P.copy(pos).add(V.set(rnd(-1, 1), rnd(-0.3, 0.8), rnd(-1, 1)));
      this._spawn(pick(SMOKE), P, V.set(rnd(-1.5, 1.5), rnd(0.5, 2), rnd(-1.5, 1.5)), rnd(0.5, 1) * scale, rnd(1.2, 2), -0.6, 1.4);
    }
    this.mesh.instanceColor.needsUpdate = true;

    const f = this.flashes.find(f => f.userData.t >= 1) || this.flashes[0];
    f.position.copy(pos); f.userData.t = 0; f.userData.big = (golden ? 6 : 4.5) * scale; f.visible = true;
    const r = this.rings.find(r => r.userData.t >= 1) || this.rings[0];
    r.position.set(pos.x, 0.08, pos.z); r.userData.t = 0; r.userData.big = 10 * scale; r.visible = true;

    if (word !== null) this.comic(pos.clone().add(new THREE.Vector3(0, 1.6, 0)), word || pick(WORDS), golden ? 'gold' : 'red');
  }

  // Small poof (used when a pig gets you, and for the end-of-game finale).
  poof(pos, colors, scale = 0.6) { this.explode(pos, colors, { scale, word: null }); }

  _drawText(sprite, text, { fill, stroke, size, comic }) {
    const { canvas, tex } = sprite.userData;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.translate(256, 128);
    g.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    // Shrink long words to fit.
    const wMax = 480, wText = g.measureText(text).width;
    if (wText > wMax) { size = Math.floor(size * wMax / wText); g.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`; }
    if (comic) {
      // Blood-red metallic look with a heavy black outline.
      const grad = g.createLinearGradient(0, -size / 2, 0, size / 2);
      grad.addColorStop(0, comic === 'gold' ? '#fff3a0' : '#ff6a3d');
      grad.addColorStop(0.5, comic === 'gold' ? '#f2b300' : '#d10f0f');
      grad.addColorStop(1, comic === 'gold' ? '#8a5a00' : '#5c0000');
      g.lineWidth = size * 0.22; g.strokeStyle = '#000'; g.strokeText(text, 0, 0);
      g.fillStyle = grad; g.fillText(text, 0, 0);
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,220,160,0.6)'; g.strokeText(text, 0, 0);
    } else {
      g.lineWidth = size * 0.16; g.strokeStyle = stroke; g.strokeText(text, 0, 0);
      g.fillStyle = fill; g.fillText(text, 0, 0);
    }
    g.restore();
    tex.needsUpdate = true;
  }

  comic(pos, text, style = 'red') {
    const s = this.texts.find(s => s.userData.t >= 1) || this.texts[0];
    this._drawText(s, text, { fill: '#ffe600', stroke: '#000', size: 120, comic: style });
    s.position.copy(pos); s.userData = { ...s.userData, t: 0, y0: pos.y, kind: 'comic', w: 5 };
    s.visible = true;
  }

  floatText(pos, text, color = '#ffd23f') {
    const s = this.texts.find(s => s.userData.t >= 1) || this.texts[0];
    this._drawText(s, text, { fill: color, stroke: '#1b1035', size: 110 });
    s.position.copy(pos); s.userData = { ...s.userData, t: 0, y0: pos.y, kind: 'float', w: 3 };
    s.visible = true;
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
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); continue; }
      p.v.y -= p.g * dt;
      p.p.addScaledVector(p.v, dt);
      const half = p.size / 2;
      if (p.p.y < half && p.g > 0) {
        // Bounce, then slide to a stop and lie on the ground.
        p.p.y = half;
        p.v.y = Math.abs(p.v.y) > 2 ? -p.v.y * 0.45 : 0;
        p.v.x *= 0.75; p.v.z *= 0.75; p.rv.multiplyScalar(0.6);
      }
      p.r.x += p.rv.x * dt; p.r.y += p.rv.y * dt; p.r.z += p.rv.z * dt;
      let k = Math.min(1, p.life / 0.6);               // shrink away at the end
      if (p.grow) k = (1 + (1 - p.life / p.max) * p.grow) * Math.min(1, p.life / 0.5);
      s.setScalar(Math.max(0.0001, p.size * k));
      m.compose(p.p, q.setFromEuler(p.r), s);
      this.mesh.setMatrixAt(i, m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    for (const f of this.flashes) {
      if (f.userData.t >= 1) continue;
      const t = f.userData.t = Math.min(1, f.userData.t + dt * 3.5);
      f.scale.setScalar(0.5 + Math.sqrt(t) * f.userData.big);
      f.material.opacity = (1 - t) * 0.9;
      f.visible = t < 1;
    }
    for (const r of this.rings) {
      if (r.userData.t >= 1) continue;
      const t = r.userData.t = Math.min(1, r.userData.t + dt * 2.5);
      r.scale.setScalar(0.5 + t * r.userData.big);
      r.material.opacity = 1 - t;
      r.visible = t < 1;
    }
    for (const s of this.texts) {
      const u = s.userData;
      if (u.t >= 1) continue;
      u.t = Math.min(1, u.t + dt * (u.kind === 'comic' ? 1.1 : 0.9));
      const t = u.t;
      if (u.kind === 'comic') {
        // Pop in with overshoot, hang, then fade.
        const pop = t < 0.15 ? (t / 0.15) * 1.35 : t < 0.25 ? 1.35 - (t - 0.15) * 3.5 : 1;
        s.scale.set(u.w * pop, u.w * 0.5 * pop, 1);
        s.position.y = u.y0 + t * 0.8;
      } else {
        s.scale.set(u.w, u.w * 0.5, 1);
        s.position.y = u.y0 + t * 2.2;
      }
      s.material.opacity = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      s.visible = t < 1;
    }
  }
}
