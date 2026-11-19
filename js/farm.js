// Builds the static farm: sky, rolling ground, barn, fences, trees, crops.
// All static meshes are merged per colour to keep draw calls low on phones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY_TOP = new THREE.Color('#4b9bff');
const SKY_HORIZON = new THREE.Color('#ffe2b8');
export const FOG_COLOR = new THREE.Color('#cfe6f5');

// Deterministic random so every player gets the same farm (handy for multiplayer).
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const hills = Math.min(1.6, Math.max(0, r - 75) / 60);
  const n = Math.sin(x * 0.045) * Math.cos(z * 0.05) + 0.5 * Math.sin(x * 0.11 + z * 0.07);
  return hills * hills * (5 + 3.5 * n) + 0.25 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
}

function makeSky() {
  const geo = new THREE.SphereGeometry(450, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  return sky;
}

function makeGround() {
  const plane = new THREE.PlaneGeometry(800, 800, 90, 90);
  plane.rotateX(-Math.PI / 2);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  const c = new THREE.Color();
  const rand = rng(7);
  const flat = plane.toNonIndexed();
  // One colour per triangle for a faceted look.
  const fc = [];
  for (let i = 0; i < flat.attributes.position.count; i += 3) {
    c.setHSL(0.26 + rand() * 0.05, 0.5 + rand() * 0.1, 0.33 + rand() * 0.07);
    for (let k = 0; k < 3; k++) fc.push(c.r, c.g, c.b);
  }
  flat.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  flat.deleteAttribute('uv');
  flat.computeVertexNormals(); // non-indexed, so this gives faceted normals
  return new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// Collects transformed geometry, bucketed by colour, then merges each bucket.
class StaticBatcher {
  constructor() { this.buckets = new Map(); }

  add(template, matrix) {
    template.updateMatrixWorld(true);
    template.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const groups = g0.groups.length ? g0.groups : [{ start: 0, count: g0.attributes.position.count, materialIndex: 0 }];
      const m = new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld);
      for (const grp of groups) {
        const mat = mats[grp.materialIndex] || mats[0];
        const arr = g0.attributes.position.array.slice(grp.start * 3, (grp.start + grp.count) * 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        g.applyMatrix4(m);
        this.push(mat.color.getHex(), g);
      }
    });
  }

  addGeometry(geo, colorHex) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    this.push(colorHex, g);
  }

  push(hex, g) {
    if (!this.buckets.has(hex)) this.buckets.set(hex, []);
    this.buckets.get(hex).push(g);
  }

  build() {
    const group = new THREE.Group();
    for (const [hex, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      merged.computeVertexNormals(); // non-indexed, so this gives faceted normals
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: hex }));
      group.add(mesh);
    }
    return group;
  }
}

function place(x, z, rotY, s) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, groundHeight(x, z), z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(s, s, s));
}

function box(batch, color, w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
  batch.addGeometry(g, color);
}

function addBarn(batch, x, z, rotY) {
  const red = 0xa8322d, white = 0xf2efe6, roof = 0x5a3b2e;
  const add = (geo, color, px, py, pz, ry = 0) => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(x, z), z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
    batch.addGeometry(geo, color);
  };
  add(new THREE.BoxGeometry(10, 6, 14), red, 0, 3, 0);
  // Gable roof: a triangular prism.
  const tri = new THREE.Shape([new THREE.Vector2(-5.6, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(0, 4)]);
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 15, bevelEnabled: false });
  add(roofGeo, roof, 0, 6, -7.5);
  add(new THREE.BoxGeometry(4, 4.5, 0.3), white, 0, 2.25, 7.05);
  add(new THREE.BoxGeometry(3.4, 3.9, 0.35), red, 0, 2.1, 7.1);
  add(new THREE.BoxGeometry(0.3, 5.2, 0.4), white, 0, 2.1, 7.2, 0);
  add(new THREE.BoxGeometry(2, 2, 0.3), white, 0, 7.3, 7.05);
}

function addFence(batch, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 2.5));
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const wood = 0x8a5a36;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    box(batch, wood, 0.18, 1.3, 0.18, x, groundHeight(x, z) + 0.65, z, ang);
    if (i < n) {
      const xm = x + (x1 - x0) / n / 2, zm = z + (z1 - z0) / n / 2, y = groundHeight(xm, zm);
      box(batch, wood, 0.08, 0.14, len / n, xm, y + 0.95, zm, ang);
      box(batch, wood, 0.08, 0.14, len / n, xm, y + 0.5, zm, ang);
    }
  }
}

export function buildFarm(scene, assets) {
  scene.fog = new THREE.Fog(FOG_COLOR, 60, 230);
  scene.add(makeSky());
  scene.add(makeGround());

  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.6);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(30, 60, 20);
  scene.add(hemi, sun);

  const batch = new StaticBatcher();
  const N = assets.nature;
  const rand = rng(1234);

  // Player stands on a little hay-bale platform.
  const hay = 0xd9b44a, hayDark = 0xb8902f;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    box(batch, i % 2 ? hay : hayDark, 1.4, 0.8, 0.9, Math.sin(a) * 1.7, 0.4, Math.cos(a) * 1.7, a);
  }

  // Barn and fences behind the player (+Z), animals come from the front (-Z).
  addBarn(batch, 6, 26, Math.PI + 0.3);
  addFence(batch, -22, 14, -6, 20);
  addFence(batch, 14, 18, 30, 8);
  addFence(batch, -40, -60, -10, -70);
  addFence(batch, 12, -72, 42, -58);

  // Trees: a ring around the arena, kept out of the near front so animals stay visible.
  const trees = ['commontree_3', 'pinetree_1', 'commontree_3', 'pinetree_3', 'commontree_1'];
  for (let i = 0; i < 42; i++) {
    const a = rand() * Math.PI * 2;
    const front = Math.cos(a) > 0.2; // angle measured from -Z
    const r = (front ? 62 : 22) + rand() * 90;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (Math.hypot(x - 6, z - 26) < 12) continue; // keep barn clear
    batch.add(N[trees[i % trees.length]], place(x, z, rand() * 6.28, 0.8 + rand() * 0.6));
  }

  // Small stuff scattered everywhere (doesn't block view).
  const smalls = [['bush_1', 25], ['bushberries_1', 8], ['rock_1', 14], ['rock_moss_2', 14],
    ['flowers', 30], ['grass', 90], ['treestump', 6], ['woodlog', 6]];
  for (const [name, count] of smalls) {
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, r = 4 + rand() * 80;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (Math.hypot(x - 6, z - 26) < 9) continue;
      batch.add(N[name], place(x, z, rand() * 6.28, 0.7 + rand() * 0.7));
    }
  }

  // Crop fields left and right.
  for (const [cx, cz, crop] of [[-34, -8, 'wheat'], [30, -14, 'corn_1']]) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const x = cx + i * 1.4 + (rand() - 0.5) * 0.4, z = cz + j * 1.4 + (rand() - 0.5) * 0.4;
      batch.add(N[crop], place(x, z, rand() * 6.28, 0.8 + rand() * 0.4));
    }
  }

  scene.add(batch.build());
}
