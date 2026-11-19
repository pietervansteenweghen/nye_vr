// Mini-game 1: Farm Frenzy. Animals charge at you, look at them to laser them.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { normalise } from './assets.js';
import { groundHeight } from './farm.js';

const ROUND_TIME = 75;
const START_HEARTS = 5;
const SPAWN_RADIUS = 36;
const SPAWN_ARC = THREE.MathUtils.degToRad(70); // ± from straight ahead
const HIT_DIST = 3.2;
const DWELL_TIME = 1.4;
// Rotation needed so the models face the direction they walk.
const FACING = 0;

// h = height (m), speed (m/s), hp = seconds of laser needed, pts = score.
const TYPES = {
  // Sizes are cartoonishly big so they read well on a small screen.
  cow:   { h: 2.3, speed: 3.4, anim: 'Run',  hp: 0.55, pts: 10, weight: 3 },
  horse: { h: 2.7, speed: 5.6, anim: 'Run',  hp: 0.5,  pts: 20, weight: 2 },
  zebra: { h: 2.6, speed: 5.0, anim: 'Run',  hp: 0.5,  pts: 20, weight: 1.5 },
  pig:   { h: 1.5, speed: 3.0, anim: 'Jump', hp: 0.35, pts: 15, weight: 3 },
  sheep: { h: 1.7, speed: 2.8, anim: 'Jump', hp: 0.35, pts: 15, weight: 3 },
  llama: { h: 2.8, speed: 2.4, anim: 'Jump', hp: 0.75, pts: 25, weight: 1.5 },
  pug:   { h: 1.0, speed: 4.2, anim: 'Jump', hp: 0.2,  pts: 30, weight: 1.5 },
};
const GOLD = new THREE.Color(0xffc21a);

function loadBest() { try { return +localStorage.getItem('farm-best') || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem('farm-best', String(v)); } catch { /* private mode */ } }

export class FarmGame {
  constructor({ scene, camera, controls, hud, effects, sfx, assets }) {
    Object.assign(this, { scene, camera, controls, hud, effects, sfx });
    this.templates = {};
    for (const [name, t] of Object.entries(TYPES)) {
      const a = assets.animals[name];
      const wrap = normalise(a.scene, t.h);
      const clip = a.clips.find(c => c.name === t.anim) || a.clips[0];
      this.templates[name] = { wrap, clip, size: wrap.userData.size };
    }
    this.weightTotal = Object.values(TYPES).reduce((s, t) => s + t.weight, 0);
    this.shadowGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
    this.animals = [];
    this.state = 'idle';
    this.best = loadBest();
    this.time = 0;
    this._ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
    this._muzzle = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._makeButton();
  }

  _makeButton() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 192;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.roundRect(8, 8, 496, 176, 40); g.fill();
    g.fillStyle = '#1b1035'; g.font = '800 64px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PLAY AGAIN', 256, 70);
    g.font = '600 34px system-ui, sans-serif';
    g.fillText('look here (or tap)', 256, 135);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.button = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
    this.button.visible = false;
    this.scene.add(this.button);
  }

  start() {
    this.clearAnimals();
    this.score = 0;
    this.hearts = START_HEARTS;
    this.timeLeft = ROUND_TIME;
    this.spawnTimer = 1.5;
    this.target = null;
    this.button.visible = false;
    this.state = 'intro';
    this.introT = 3;
    this._lastBeep = 4;
    this.hud.setBar(this.score, this.hearts, this.timeLeft);
  }

  stop() {
    this.clearAnimals();
    this.state = 'idle';
    this.sfx.setLaser(false);
    this.effects.setBeam(null, null, false);
    this.button.visible = false;
  }

  clearAnimals() {
    for (const a of this.animals) this.scene.remove(a.root, a.shadow);
    this.animals = [];
  }

  // Screen tap (or Cardboard button): extra damage burst / press button.
  tap() {
    if (this.state === 'playing' && this.target) {
      this.target.hp -= 0.3;
      this.sfx.tone(660, undefined, 0.06, 'square', 0.15);
    } else if (this.state === 'over' && this.overT > 1) {
      this.start();
    }
  }

  pickType() {
    let r = Math.random() * this.weightTotal;
    for (const [name, t] of Object.entries(TYPES)) { if ((r -= t.weight) <= 0) return name; }
    return 'cow';
  }

  spawn(progress) {
    const name = this.pickType();
    const type = TYPES[name];
    const tpl = this.templates[name];
    const root = SkeletonUtils.clone(tpl.wrap);
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.push(m));
    });
    const golden = Math.random() < 0.07;
    if (golden) mats.forEach(m => { m.color.lerp(GOLD, 0.75); m.emissive.copy(GOLD).multiplyScalar(0.25); });
    const colors = mats.map(m => m.color.getHex());

    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(tpl.clip);
    action.time = Math.random() * tpl.clip.duration;
    const speed = type.speed * (1 + progress * 0.5) * (golden ? 1.3 : 1);
    action.timeScale = type.anim === 'Run' ? speed / type.speed : 1.2;
    action.play();

    const ang = (Math.random() * 2 - 1) * SPAWN_ARC;
    const pos = new THREE.Vector3(Math.sin(ang) * SPAWN_RADIUS, 0, -Math.cos(ang) * SPAWN_RADIUS);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    const footprint = Math.max(tpl.size.x, tpl.size.z);
    shadow.scale.set(tpl.size.x * 1.1, 1, tpl.size.z * 1.1);
    this.scene.add(root, shadow);

    const a = {
      name, type, root, shadow, mixer, mats, colors, golden, pos,
      speed, hp: type.hp, maxHp: type.hp, pts: type.pts * (golden ? 5 : 1),
      radius: Math.max(type.h * 0.7, footprint * 0.45, 0.7),
      wobble: { amp: 0.6 + Math.random() * 1.6, freq: 0.6 + Math.random() * 1.2, phase: Math.random() * 6.28 },
      t: 0, flash: 0,
    };
    this.animals.push(a);
    this._placeAnimal(a, 0);
  }

  _placeAnimal(a, dt) {
    // Head for the player with a gentle side-to-side weave.
    const toCenter = new THREE.Vector3(-a.pos.x, 0, -a.pos.z);
    const dist = toCenter.length();
    toCenter.divideScalar(dist || 1);
    const side = new THREE.Vector3(-toCenter.z, 0, toCenter.x);
    a.t += dt;
    const weave = Math.cos(a.t * a.wobble.freq + a.wobble.phase) * a.wobble.amp * Math.min(1, dist / 15);
    const vel = toCenter.clone().multiplyScalar(a.speed).addScaledVector(side, weave);
    a.pos.addScaledVector(vel, dt);
    const y = groundHeight(a.pos.x, a.pos.z);
    a.root.position.set(a.pos.x, y, a.pos.z);
    a.root.rotation.y = Math.atan2(vel.x, vel.z) + FACING;
    a.shadow.position.set(a.pos.x, y + 0.03, a.pos.z);
    a.shadow.rotation.y = a.root.rotation.y;
    a.center = (a.center || new THREE.Vector3()).set(a.pos.x, y + a.type.h * 0.5, a.pos.z);
    a.dist = Math.hypot(a.pos.x, a.pos.z);
  }

  _aim() {
    this.camera.getWorldPosition(this._ray.o);
    this.camera.getWorldDirection(this._ray.d);
  }

  // Closest animal whose (generous) hit-sphere the gaze ray passes through.
  _findTarget() {
    const { o, d } = this._ray;
    let best = null, bestT = Infinity;
    const v = new THREE.Vector3();
    for (const a of this.animals) {
      v.subVectors(a.center, o);
      const t = v.dot(d);
      if (t < 0) continue;
      const d2 = v.lengthSq() - t * t;
      const r = a.radius * 1.15 + t * 0.012; // a bit of aim assist at range
      if (d2 < r * r && t < bestT) {
        bestT = t; best = a;
        this._hit.copy(o).addScaledVector(d, t - Math.sqrt(Math.max(0, r * r - d2)) * 0.5);
      }
    }
    return best;
  }

  _kill(a) {
    this.effects.explode(a.center, a.colors, a.golden);
    this.effects.floatText(a.center.clone().add(new THREE.Vector3(0, a.type.h * 0.6, 0)), `+${a.pts}`, a.golden ? '#fff27a' : '#ffd23f');
    this.sfx.explode(a.golden);
    this.score += a.pts;
    this._remove(a);
  }

  _bonk(a) {
    this.hearts--;
    this.hud.flashRed();
    this.sfx.bonk();
    this.effects.explode(a.center, a.colors);
    this._remove(a);
    if (this.hearts <= 0) this._gameOver('OUCH! Trampled!');
  }

  _remove(a) {
    this.scene.remove(a.root, a.shadow);
    a.mixer.stopAllAction();
    this.animals.splice(this.animals.indexOf(a), 1);
    if (this.target === a) this.target = null;
  }

  _gameOver(title) {
    this.state = 'over';
    this.overT = 0;
    this.dwell = 0;
    this.sfx.setLaser(false);
    this.effects.setBeam(null, null, false);
    this.target = null;
    // Grand finale: everything left on the field goes boom.
    for (const a of [...this.animals]) { this.effects.explode(a.center, a.colors, a.golden); this._remove(a); }
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; saveBest(this.best); }
    this.overLines = [
      { text: title, size: 96, color: '#ffd23f' },
      { text: `Score: ${this.score}`, size: 120 },
      { text: newBest ? '🏆 New best!' : `Best: ${this.best}`, size: 64, color: '#4de1c1' },
    ];
    // Put the play-again button where the player is looking (horizontally).
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    this.button.position.copy(this.camera.position).addScaledVector(fwd, 4);
    this.button.position.y = this.camera.position.y - 1.1;
    this.button.lookAt(this.camera.position);
  }

  _gazeOnButton() {
    if (!this.button.visible) return false;
    const { o, d } = this._ray;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.button.quaternion);
    const denom = n.dot(d);
    if (Math.abs(denom) < 1e-4) return false;
    const t = n.dot(new THREE.Vector3().subVectors(this.button.position, o)) / denom;
    if (t < 0) return false;
    const p = o.clone().addScaledVector(d, t);
    const local = this.button.worldToLocal(p);
    return Math.abs(local.x) < 0.85 && Math.abs(local.y) < 0.35;
  }

  update(dt) {
    this.time += dt;
    this._aim();
    for (const a of this.animals) a.mixer.update(dt);

    if (this.state === 'intro') {
      this.introT -= dt;
      const n = Math.ceil(this.introT);
      if (n < this._lastBeep && n > 0) { this._lastBeep = n; this.sfx.tone(440, undefined, 0.12); }
      this.hud.setCenter([
        { text: 'Look straight ahead', size: 80 },
        { text: n > 0 ? String(n) : 'GO!', size: 200, color: '#ffd23f' },
        { text: 'stare at animals to laser them', size: 52, color: '#4de1c1' },
      ]);
      this.hud.setReticle(0, false);
      if (this.introT <= 0) {
        this.controls.recenter();
        this.sfx.tone(880, undefined, 0.25);
        this.state = 'playing';
        this.hud.setCenter([]);
      }
      return;
    }

    if (this.state === 'playing') {
      this.timeLeft -= dt;
      const progress = 1 - this.timeLeft / ROUND_TIME;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.animals.length < 14) {
        this.spawn(progress);
        this.spawnTimer = THREE.MathUtils.lerp(1.7, 0.5, progress) * (0.7 + Math.random() * 0.6);
      }

      for (const a of [...this.animals]) {
        this._placeAnimal(a, dt);
        a.flash = Math.max(0, a.flash - dt * 4);
        if (a.dist < HIT_DIST) this._bonk(a);
        if (this.state !== 'playing') return;
      }

      this.target = this._findTarget();
      const locked = !!this.target;
      if (locked) {
        const a = this.target;
        a.hp -= dt;
        a.flash = 1;
        this._muzzle.set(0.35, -0.45, -1.2);
        this.camera.localToWorld(this._muzzle);
        this.effects.setBeam(this._muzzle, this._hit, true, this.time);
        if (a.hp <= 0) this._kill(a);
      } else {
        this.effects.setBeam(null, null, false);
      }
      this.sfx.setLaser(locked);
      for (const a of this.animals) {
        const k = a.flash * (0.5 + 0.5 * Math.sin(this.time * 40));
        for (const m of a.mats) {
          if (a.golden) m.emissive.copy(GOLD).multiplyScalar(0.25 + k * 0.6);
          else m.emissive.setRGB(k * 0.8, k * 0.25, k * 0.35);
        }
      }
      this.hud.setReticle(this.target ? 1 - this.target.hp / this.target.maxHp : 0, locked);
      this.hud.setBar(this.score, this.hearts, this.timeLeft);
      if (this.timeLeft <= 0) this._gameOver("TIME'S UP!");
      return;
    }

    if (this.state === 'over') {
      this.overT += dt;
      this.hud.setCenter(this.overLines);
      this.button.visible = this.overT > 1;
      const onBtn = this._gazeOnButton();
      this.dwell = onBtn ? this.dwell + dt : Math.max(0, this.dwell - dt * 2);
      this.hud.setReticle(this.dwell / DWELL_TIME, onBtn);
      if (this.dwell >= DWELL_TIME) this.start();
    }
  }
}
