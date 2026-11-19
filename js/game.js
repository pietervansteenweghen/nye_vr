// Mini-game 1: pigs charge down the alley between the two barns, from both
// ends. Look at a pig to laser it. One life: if a pig reaches you, it's over.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { normalise } from './assets.js';
import { PIG_LANE_HALF, BARN_Z } from './farm.js';
import { Farmer } from './farmer.js';

const SPAWN_Z = Math.max(-BARN_Z[0], BARN_Z[1]) + 6;   // just past the barn ends
const HIT_DIST = 2.6;
const DWELL_TIME = 1.4;
const INFLATE_TIME = 0.22;
const MAX_PIGS = 12;
const INTRO_COUNT = 3;       // seconds of countdown

// What the farmer says before the game starts (tap to skip a line).
const FARMER_LINES = [
  'Yowww welkom op de varkensboerderij!',
  'Tijd om wa varkens af te schieten fzo.',
  'Ze komen van twee kanten door de gang tussen de stallen.',
  'Kijk naar een varken en uw laser doet de rest.',
  'Eén varken tegen u aan en ge zijt dood. Succes jong!',
];
const lineTime = line => 1.6 + line.length * 0.055;

// All pigs, different sizes. h = height (m), hp = seconds of laser needed.
const TYPES = {
  varken:  { label: 'varken',  h: 1.5, speed: 3.2, hp: 0.35, pts: 10, weight: 6, pitch: 1 },
  biggetje:{ label: 'biggetje', h: 0.9, speed: 4.6, hp: 0.18, pts: 25, weight: 2, pitch: 1.6 },
  zeug:    { label: 'zeug',    h: 2.3, speed: 2.4, hp: 0.9,  pts: 30, weight: 1.5, pitch: 0.7 },
};
const GOLD = new THREE.Color(0xffc21a);

function loadBest() { try { return +localStorage.getItem('pig-best') || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem('pig-best', String(v)); } catch { /* private mode */ } }

export class FarmGame {
  constructor({ scene, camera, controls, hud, effects, sfx, assets }) {
    Object.assign(this, { scene, camera, controls, hud, effects, sfx });
    const pig = assets.animals.pig;
    this.clip = pig.clips.find(c => c.name === 'Jump') || pig.clips[0];
    this.template = normalise(pig.scene, 1); // 1 m tall; scaled per type
    this.baseSize = this.template.userData.size;
    this.weightTotal = Object.values(TYPES).reduce((s, t) => s + t.weight, 0);
    this.shadowGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
    this.pigs = [];
    this.state = 'idle';
    this.best = loadBest();
    this.time = 0;
    this._ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
    this._muzzle = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.farmer = new Farmer(scene);
    this._makeButton();
  }

  _makeButton() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 192;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.roundRect(8, 8, 496, 176, 40); g.fill();
    g.fillStyle = '#1b1035'; g.font = '800 72px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NOG EENS', 256, 72);
    g.font = '600 34px system-ui, sans-serif';
    g.fillText('kijk hier (of tik)', 256, 138);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.button = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
    this.button.visible = false;
    this.scene.add(this.button);
  }

  start() {
    this.clearPigs();
    this.score = 0;
    this.kills = 0;
    this.alive = 0;     // seconds survived
    this.spawnTimer = 1.2;
    this.target = null;
    this.button.visible = false;
    this.lastKill = -10;
    this.combo = 0;
    this.state = 'farmer';
    this.lineIdx = -1;
    this.lineT = 0;
    this.hud.setBar(0, 0);
    this.hud.setWarning('');
    this.hud.setCenter([]);
    this.farmer.show(this.camera);
    this._nextLine();
    this.sfx.startMusic('farm');
  }

  _nextLine() {
    this.lineIdx++;
    if (this.lineIdx >= FARMER_LINES.length) {
      // Farmer leaves in a puff of smoke, then countdown.
      this.effects.poof(this.farmer.root.position.clone().setY(1.2), [0xc0392b, 0x3c5d9c, 0xe8c766], 0.35);
      this.farmer.leave();
      this.state = 'intro';
      this.introT = INTRO_COUNT;
      this._lastBeep = INTRO_COUNT + 1;
      this.sfx.startMusic('rock');
      return;
    }
    this.lineT = lineTime(FARMER_LINES[this.lineIdx]);
    this.farmer.say(FARMER_LINES[this.lineIdx]);
  }

  stop() {
    this.farmer.hide();
    this.clearPigs();
    this.state = 'idle';
    this.sfx.setLaser(false);
    this.sfx.stopMusic();
    this.effects.setBeam(null, null, false);
    this.button.visible = false;
    this.hud.setWarning('');
  }

  clearPigs() {
    for (const p of this.pigs) this.scene.remove(p.root, p.shadow);
    this.pigs = [];
  }

  // Screen tap (or Cardboard button): extra damage burst / press button.
  tap() {
    if (this.state === 'farmer') {
      this._nextLine();
    } else if (this.state === 'playing' && this.target) {
      this.target.hp -= 0.3;
      this.sfx.tone(660, undefined, 0.06, 'square', 0.15);
    } else if (this.state === 'over' && this.overT > 1.2) {
      this.start();
    }
  }

  pickType() {
    let r = Math.random() * this.weightTotal;
    for (const [name, t] of Object.entries(TYPES)) { if ((r -= t.weight) <= 0) return name; }
    return 'varken';
  }

  spawn(level) {
    const type = TYPES[this.pickType()];
    const root = SkeletonUtils.clone(this.template);
    root.scale.setScalar(type.h);
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.push(m));
    });
    const golden = Math.random() < 0.06;
    if (golden) mats.forEach(m => { m.color.lerp(GOLD, 0.8); m.emissive.copy(GOLD).multiplyScalar(0.25); });
    const colors = mats.map(m => m.color.getHex());

    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(this.clip);
    action.time = Math.random() * this.clip.duration;
    const speed = type.speed * (1 + level * 0.8) * (golden ? 1.3 : 1);
    action.timeScale = 1.1 + (speed / type.speed - 1) * 0.6;
    action.play();

    // From the north or south end of the alley.
    const dir = Math.random() < 0.5 ? -1 : 1;
    const pos = new THREE.Vector3((Math.random() * 2 - 1) * PIG_LANE_HALF, 0, dir * (SPAWN_Z + Math.random() * 6));
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    const sx = this.baseSize.x * type.h, sz = this.baseSize.z * type.h;
    shadow.scale.set(sx * 1.1, 1, sz * 1.1);
    this.scene.add(root, shadow);

    const p = {
      type, root, shadow, mixer, mats, colors, golden, pos, speed,
      hp: type.hp * (golden ? 1.5 : 1), maxHp: type.hp * (golden ? 1.5 : 1),
      pts: type.pts * (golden ? 5 : 1),
      radius: Math.max(type.h * 0.75, Math.max(sx, sz) * 0.45, 0.6),
      wobble: { amp: 0.4 + Math.random() * 1.2, freq: 0.7 + Math.random() * 1.3, phase: Math.random() * 6.28 },
      t: 0, flash: 0, dying: -1, nextOink: 0.3 + Math.random() * 2,
      center: new THREE.Vector3(),
    };
    this.pigs.push(p);
    this._move(p, 0);
  }

  _move(p, dt) {
    // Run along the alley toward the player, weaving side to side, staying in the lane.
    p.t += dt;
    const dz = -Math.sign(p.pos.z) || 1;
    const dist = Math.hypot(p.pos.x, p.pos.z);
    const weave = Math.cos(p.t * p.wobble.freq + p.wobble.phase) * p.wobble.amp * Math.min(1, dist / 12);
    const steerX = -p.pos.x * Math.max(0, 1 - Math.abs(p.pos.z) / 14) * 0.8; // home in when close
    const vx = weave + steerX, vz = dz * p.speed;
    p.pos.x = THREE.MathUtils.clamp(p.pos.x + vx * dt, -PIG_LANE_HALF, PIG_LANE_HALF);
    p.pos.z += vz * dt;
    p.root.position.set(p.pos.x, 0, p.pos.z);
    p.root.rotation.y = Math.atan2(vx, vz);
    p.shadow.position.set(p.pos.x, 0.03, p.pos.z);
    p.shadow.rotation.y = p.root.rotation.y;
    p.center.set(p.pos.x, p.type.h * 0.5, p.pos.z);
    p.dist = Math.hypot(p.pos.x, p.pos.z);
  }

  _aim() {
    this.camera.getWorldPosition(this._ray.o);
    this.camera.getWorldDirection(this._ray.d);
  }

  _findTarget() {
    const { o, d } = this._ray;
    let best = null, bestT = Infinity;
    const v = new THREE.Vector3();
    for (const p of this.pigs) {
      if (p.dying >= 0) continue;
      v.subVectors(p.center, o);
      const t = v.dot(d);
      if (t < 0) continue;
      const d2 = v.lengthSq() - t * t;
      const r = p.radius * 1.15 + t * 0.012; // a bit of aim assist at range
      if (d2 < r * r && t < bestT) {
        bestT = t; best = p;
        this._hit.copy(o).addScaledVector(d, t - Math.sqrt(Math.max(0, r * r - d2)) * 0.5);
      }
    }
    return best;
  }

  // Start the death animation: the pig swells up like a balloon, then pops.
  _startDying(p) {
    p.dying = 0;
    this.sfx.squeal(p.center, 0.35);
    // Quick successive kills build a combo multiplier.
    this.combo = this.time - this.lastKill < 2 ? this.combo + 1 : 1;
    this.lastKill = this.time;
    p.combo = this.combo;
    p.pts *= Math.min(this.combo, 5);
    this.score += p.pts;
    this.kills++;
  }

  _pop(p) {
    let word;
    if (this.kills === 1) word = 'FIRST BLOOD';
    else if (p.golden) word = 'FLAWLESS VICTORY';
    else if (p.combo >= 3) word = `${p.combo}x COMBO`;
    this.effects.explode(p.center, p.colors, { golden: p.golden, scale: 0.8 + p.type.h * 0.2, word });
    this.effects.floatText(p.center.clone().add(new THREE.Vector3(0, p.type.h + 0.8, 0)),
      `+${p.pts}`, p.golden ? '#fff27a' : '#ffffff');
    this.sfx.explode(p.golden);
    this._remove(p);
  }

  _remove(p) {
    this.scene.remove(p.root, p.shadow);
    p.mixer.stopAllAction();
    this.pigs.splice(this.pigs.indexOf(p), 1);
    if (this.target === p) this.target = null;
  }

  _gameOver(killer) {
    this.state = 'over';
    this.overT = 0;
    this.dwell = 0;
    this.sfx.setLaser(false);
    this.sfx.death();
    this.hud.flashRed();
    this.hud.setWarning('');
    this.effects.setBeam(null, null, false);
    this.target = null;
    // Grand finale: every pig on the field goes boom.
    for (const p of [...this.pigs]) { if (p !== killer) this.effects.poof(p.center, p.colors); this._remove(p); }
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; saveBest(this.best); }
    const secs = Math.floor(this.alive);
    this.overLines = [
      { text: 'AU! Een varken heeft je!', size: 80, color: '#ff4d6d' },
      { text: `${this.score} punten`, size: 120, color: '#ffd23f' },
      { text: `${this.kills} varkens · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} overleefd`, size: 52 },
      { text: newBest ? '🏆 Nieuw record!' : `Record: ${this.best}`, size: 60, color: '#4de1c1' },
    ];
    // Put the play-again button where the player is looking (horizontally).
    this.camera.getWorldDirection(this._fwd); this._fwd.y = 0; this._fwd.normalize();
    this.button.position.copy(this.camera.position).addScaledVector(this._fwd, 4);
    this.button.position.y = this.camera.position.y - 1.2;
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
    const local = this.button.worldToLocal(o.clone().addScaledVector(d, t));
    return Math.abs(local.x) < 0.85 && Math.abs(local.y) < 0.35;
  }

  // "Pig behind you" hint for close pigs outside the player's view.
  _updateWarning() {
    this.camera.getWorldDirection(this._fwd); this._fwd.y = 0; this._fwd.normalize();
    let warn = '';
    for (const p of this.pigs) {
      if (p.dying >= 0 || p.dist > 16) continue;
      const dx = p.pos.x / p.dist, dz = p.pos.z / p.dist;
      const dot = dx * this._fwd.x + dz * this._fwd.z;
      if (dot < 0.35) { warn = '🐷 VARKEN ACHTER JE! 🐷'; break; }
    }
    this.hud.setWarning(warn);
  }

  update(dt) {
    this.time += dt;
    this._aim();
    for (const p of this.pigs) p.mixer.update(dt);

    if (this.state === 'farmer' || this.state === 'intro') this.farmer.update(dt, this.camera);
    this.hud.bar.mesh.visible = this.state === 'playing' || this.state === 'over';

    if (this.state === 'farmer') {
      this.hud.setReticle(0, false);
      this.lineT -= dt;
      if (Math.random() < dt * 14) this.sfx.blip();
      if (this.lineT <= 0) this._nextLine();
      return;
    }

    if (this.state === 'intro') {
      this.introT -= dt;
      this.hud.setReticle(0, false);
      const n = Math.ceil(this.introT);
      if (n < this._lastBeep && n > 0) { this._lastBeep = n; this.sfx.tone(440, undefined, 0.12); }
      this.hud.setCenter([
        { text: 'Kijk recht vooruit', size: 80 },
        { text: n > 0 ? String(n) : 'GO!', size: 200, color: '#ffd23f' },
        { text: 'kijk naar een varken om te schieten', size: 48, color: '#4de1c1' },
        { text: '1 leven · ze komen van 2 kanten!', size: 48, color: '#ff8fa3' },
      ]);
      if (this.introT <= 0) {
        this.controls.recenter();
        this.sfx.tone(880, undefined, 0.25);
        this.state = 'playing';
        this.hud.setCenter([]);
      }
      return;
    }

    if (this.state === 'playing') {
      this.alive += dt;
      const level = Math.min(1, this.alive / 120); // ramps up over 2 minutes
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.pigs.length < MAX_PIGS) {
        this.spawn(level);
        this.spawnTimer = THREE.MathUtils.lerp(2.2, 0.55, level) * (0.7 + Math.random() * 0.6);
      }

      for (const p of [...this.pigs]) {
        if (p.dying >= 0) {
          // Inflate with a wobble, then pop.
          p.dying += dt;
          const k = p.dying / INFLATE_TIME;
          const w = 1 + k * 0.8 + Math.sin(p.dying * 70) * 0.08;
          p.root.scale.set(p.type.h * w, p.type.h * (1 + k * 0.5), p.type.h * w);
          p.root.position.y = k * 0.6;
          for (const m of p.mats) m.emissive.setRGB(k, k * 0.6, k * 0.7);
          if (p.dying >= INFLATE_TIME) this._pop(p);
          continue;
        }
        this._move(p, dt);
        p.flash = Math.max(0, p.flash - dt * 4);
        p.nextOink -= dt;
        if (p.nextOink <= 0) { this.sfx.oink(p.center, p.type.pitch); p.nextOink = 1.2 + Math.random() * 2.5; }
        if (p.dist < HIT_DIST) { this._gameOver(p); return; }
      }

      this.target = this._findTarget();
      const locked = !!this.target;
      if (locked) {
        const p = this.target;
        p.hp -= dt;
        p.flash = 1;
        // Tough pigs get the announcer treatment halfway.
        if (!p.finishShown && p.maxHp >= 0.5 && p.hp < p.maxHp * 0.5) {
          p.finishShown = true;
          this.effects.comic(p.center.clone().add(new THREE.Vector3(0, p.type.h + 1.4, 0)), 'FINISH HIM!');
          this.sfx.announce();
        }
        this._muzzle.set(0.35, -0.45, -1.2);
        this.camera.localToWorld(this._muzzle);
        this.effects.setBeam(this._muzzle, this._hit, true, this.time);
        if (p.hp <= 0) { this._startDying(p); this.target = null; }
      } else {
        this.effects.setBeam(null, null, false);
      }
      this.sfx.setLaser(!!this.target);
      for (const p of this.pigs) {
        if (p.dying >= 0) continue;
        const k = p.flash * (0.5 + 0.5 * Math.sin(this.time * 40));
        for (const m of p.mats) {
          if (p.golden) m.emissive.copy(GOLD).multiplyScalar(0.25 + k * 0.6);
          else m.emissive.setRGB(k * 0.8, k * 0.25, k * 0.35);
        }
      }
      this.hud.setReticle(this.target ? 1 - this.target.hp / this.target.maxHp : 0, locked);
      this.hud.setBar(this.score, this.alive);
      this._updateWarning();
      return;
    }

    if (this.state === 'over') {
      this.overT += dt;
      this.hud.setCenter(this.overLines);
      this.button.visible = this.overT > 1.2;
      const onBtn = this._gazeOnButton();
      this.dwell = onBtn ? this.dwell + dt : Math.max(0, this.dwell - dt * 2);
      this.hud.setReticle(this.dwell / DWELL_TIME, onBtn);
      if (this.dwell >= DWELL_TIME) this.start();
    }
  }
}
