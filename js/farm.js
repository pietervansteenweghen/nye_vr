// Builds the pig farm (based on the aerial photo): two long barns with an
// alley in between, feed silos, a yard with farmhouse + trailer to the north,
// a tree line on the east side, fields around. Flat Flemish landscape.
// All static meshes are merged per colour to keep draw calls low on phones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKY_TOP = new THREE.Color('#5aa2f0');
const SKY_HORIZON = new THREE.Color('#f3ead8');
export const FOG_COLOR = new THREE.Color('#dfe8ee');

// Layout (metres). Player stands at the origin in the alley; -Z = north (yard).
export const ALLEY_HALF = 5;        // barn walls at x = ±5
export const PIG_LANE_HALF = 2.4;   // pigs stay within x = ±2.4 (silos along the sides)
export const BARN_Z = [-36, 36];    // barns run from z = -36 to +36
const BARN_W = 16;

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Flanders is flat.
export function groundHeight() { return 0; }

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);\n#include <colorspace_fragment>\n}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), mat);
  sky.renderOrder = -1;
  return sky;
}

// Ground: a finely tessellated inner area (big triangles right under the camera
// can rasterise badly on some GPUs) on top of a coarse outer plane.
function groundPlane(geo, y, rand) {
  const plane = geo.rotateX(-Math.PI / 2).translate(0, y, 0).toNonIndexed();
  const c = new THREE.Color();
  const fc = [];
  for (let i = 0; i < plane.attributes.position.count; i += 3) {
    c.setHSL(0.25 + rand() * 0.04, 0.42 + rand() * 0.1, 0.38 + rand() * 0.06);
    for (let k = 0; k < 3; k++) fc.push(c.r, c.g, c.b);
  }
  plane.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  plane.deleteAttribute('uv');
  plane.computeVertexNormals();
  return plane;
}

function makeGround() {
  const rand = rng(7);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(groundPlane(new THREE.PlaneGeometry(170, 170, 68, 68), 0, rand), mat));
  // Outer ring has a hole in the middle, so none of its huge triangles is near the camera.
  g.add(new THREE.Mesh(groundPlane(new THREE.RingGeometry(80, 420, 40, 6), -0.08, rand), mat));
  return g;
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
      group.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: hex })));
    }
    return group;
  }
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function xf(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1)));
}
function box(batch, color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  batch.addGeometry(xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), color);
}
// Flat patch on the ground (paths, fields, yard).
function patch(batch, color, x0, x1, z0, z1, y = 0.03) {
  box(batch, color, x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2);
}
function place(x, z, rotY, s) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, s, s));
}

const C = {
  // Barn colours from the Street View photo: red-brown brick, dark roofs,
  // small white-framed windows, dark board cladding in the gables, olive silos.
  wallLow: 0x8e8b84, brick: 0x9c4f36, brickDark: 0x86412c, boards: 0x3f4640, frame: 0xf2f0ea,
  window: 0x2c3136, roof: 0x3d3f3b, ridge: 0x262826, hedge: 0x8a4a30, hedgeDark: 0x6e3a26,
  door: 0x6a6f74, solar: 0x22304d, solarFrame: 0xb9c0c8, concrete: 0xb8b4aa, path: 0xc9c5ba,
  field: 0x8a6c4b, fieldDark: 0x765a3d, pasture: 0x86b85c, silo: 0x9a9363, siloTop: 0x5e5a3c, siloLeg: 0x8c949b,
  houseBrick: 0x9a5a40, houseRoof: 0x3f3f44, trailer: 0xf1efe8, trailerStripe: 0xc9a14a, tyre: 0x222222,
};

// Long pig barn: concrete plinth, red-brown brick walls with small white
// windows, dark board cladding in the gables, low dark roof with a row of
// small ventilation chimneys on the ridge.
function addBarn(batch, cx, z0, z1, { solarSide = 0 } = {}) {
  const w = BARN_W, len = z1 - z0, cz = (z0 + z1) / 2;
  const eave = 2.8, rise = 2.2, over = 0.5;
  box(batch, C.wallLow, w + 0.04, 0.45, len + 0.04, cx, 0.225, cz);
  box(batch, C.brick, w, eave - 0.45, len, cx, 0.45 + (eave - 0.45) / 2, cz);
  box(batch, C.brickDark, w + 0.03, 0.12, len + 0.03, cx, eave - 0.06, cz); // header course
  // Small white-framed windows on both long sides.
  for (let z = z0 + 2.5; z < z1 - 2; z += 3.5) {
    for (const side of [-1, 1]) {
      const x = cx + side * (w / 2 + 0.02);
      box(batch, C.frame, 0.06, 0.7, 1.1, x, 1.75, z);
      box(batch, C.window, 0.08, 0.5, 0.9, x + side * 0.01, 1.75, z);
    }
  }
  // Gable infill (triangles at both ends): dark board cladding.
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  batch.addGeometry(xf(new THREE.ExtrudeGeometry(tri, { depth: len + 0.1, bevelEnabled: false }), cx, eave, z0 - 0.05), C.boards);
  // Two roof slopes.
  const half = w / 2 + over;
  const slopeLen = Math.hypot(half, rise * half / (w / 2));
  const ang = Math.atan2(rise, w / 2);
  for (const side of [-1, 1]) {
    box(batch, C.roof, slopeLen, 0.16, len + 2 * over,
      cx + side * half / 2, eave + rise / 2 - (over * Math.tan(ang)) / 2, cz, 0, 0, -side * ang);
  }
  // Row of small ventilation chimneys along the ridge.
  for (let z = z0 + 3; z < z1 - 2; z += 3.2) {
    box(batch, C.ridge, 0.45, 0.7, 0.45, cx, eave + rise + 0.25, z);
    box(batch, C.ridge, 0.7, 0.08, 0.7, cx, eave + rise + 0.62, z);
  }
  // Solar panels on one slope (left barn in the aerial photo).
  if (solarSide) {
    for (let z = z0 + 6; z < cz + 8; z += 2.2) {
      for (const u of [0.3, 0.62]) {
        const px = cx + solarSide * half * u, py = eave + rise * (1 - u) + 0.15;
        box(batch, C.solar, 3.0, 0.08, 2.0, px, py, z, 0, 0, -solarSide * ang);
      }
    }
  }
  // Doors on the ends.
  for (const zEnd of [z0 - 0.08, z1 + 0.08]) {
    box(batch, C.frame, 3.4, 2.5, 0.08, cx - 3, 1.25, zEnd);
    box(batch, C.boards, 1.0, 2.0, 0.1, cx + 4, 1.0, zEnd);
  }
}

// Clipped beech hedge (brown-red leaves in winter, like in the Street View).
function addHedge(batch, x0, z0, x1, z1, rand) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.ceil(len / 2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const h = 1.6 + rand() * 0.25;
    box(batch, rand() < 0.5 ? C.hedge : C.hedgeDark, 0.9, h, len / n + 0.1, x, h / 2, z, 0, ang, 0);
  }
}

function addSilo(batch, x, z) {
  const r = 1.1;
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(batch, C.siloLeg, 0.12, 2.6, 0.12, x + dx, 1.3, z + dz);
  batch.addGeometry(xf(new THREE.ConeGeometry(r, 1.2, 12).rotateX(Math.PI), x, 2.4, z), C.silo);
  batch.addGeometry(xf(new THREE.CylinderGeometry(r, r, 4.2, 12), x, 5.1, z), C.silo);
  batch.addGeometry(xf(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.8, 12), x, 6.8, z), C.siloTop);
  batch.addGeometry(xf(new THREE.ConeGeometry(r, 0.9, 12), x, 7.65, z), C.siloTop);
  box(batch, C.siloLeg, 0.15, 1.6, 0.15, x, 1.2, z); // feed pipe
}

function addHouse(batch, x, z) {
  box(batch, C.houseBrick, 10, 5, 8, x, 2.5, z);
  const tri = new THREE.Shape([new THREE.Vector2(-5.5, 0), new THREE.Vector2(5.5, 0), new THREE.Vector2(0, 3.5)]);
  batch.addGeometry(xf(new THREE.ExtrudeGeometry(tri, { depth: 8.6, bevelEnabled: false }), x, 5, z - 4.3), C.houseRoof);
  for (const dx of [-3, 0, 3]) box(batch, C.window, 1.2, 1.2, 0.1, x + dx, 3, z + 4.03);
}

function addTrailer(batch, x, z) {
  box(batch, C.trailer, 2.6, 2.9, 13, x, 2.6, z);
  box(batch, C.trailerStripe, 2.62, 0.3, 13.02, x, 1.6, z);
  for (const dz of [3.5, 4.8, 6]) for (const dx of [-1, 1]) {
    batch.addGeometry(xf(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), x + dx * 1.05, 0.5, z + dz, 0, 0, Math.PI / 2), C.tyre);
  }
}

export function buildFarm(scene, assets) {
  scene.fog = new THREE.Fog(FOG_COLOR, 70, 260);
  scene.add(makeSky(), makeGround());
  const hemi = new THREE.HemisphereLight(0xe6f2ff, 0x6a7a4a, 1.7);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
  sun.position.set(-25, 60, 35);
  scene.add(hemi, sun);

  const batch = new StaticBatcher();
  const N = assets.nature;
  const rand = rng(1234);

  // Barns either side of the alley.
  const bx = ALLEY_HALF + BARN_W / 2;
  addBarn(batch, -bx, BARN_Z[0], BARN_Z[1] + 6, { solarSide: -1 });
  addBarn(batch, bx, BARN_Z[0] + 2, BARN_Z[1]);

  // Alley: concrete path in the middle, grass strips at the sides.
  patch(batch, C.path, -1.8, 1.8, -70, 60);
  patch(batch, C.concrete, -30, 30, -62, BARN_Z[0] - 1);      // yard in front of barns
  patch(batch, C.field, -260, -bx - BARN_W / 2 - 4, -45, 220, 0.04); // brown field west
  for (let x = -250; x < -bx - BARN_W / 2 - 6; x += 6) patch(batch, C.fieldDark, x, x + 1.2, -44, 219, 0.05);
  patch(batch, C.pasture, bx + BARN_W / 2 + 10, 260, -80, 220, 0.04); // pasture east

  // Feed silos along the alley sides.
  for (const [x, z] of [[-3.7, -14], [-3.7, -10.5], [-3.7, 8], [3.7, -24], [3.7, 18]]) addSilo(batch, x, z);

  // Beech hedges along the road (north) and around the yard.
  addHedge(batch, -45, -66, 40, -66, rand);
  addHedge(batch, -45, -66, -45, -40, rand);
  addHedge(batch, -44, -38, -25, -38, rand);

  // Yard: farmhouse, trailer, small shed.
  addHouse(batch, -24, -58);
  addTrailer(batch, 15, -52);
  box(batch, C.roof, 7, 3.5, 6, 20, 1.75, -40);

  // Tree line along the east side of the right barn, hedge across the south end.
  const trees = ['commontree_3', 'commontree_1', 'pinetree_1'];
  for (let z = -30; z < 45; z += 3.2 + rand() * 2) {
    batch.add(N[trees[Math.floor(rand() * 3)]], place(bx + BARN_W / 2 + 3 + rand() * 3, z, rand() * 6.3, 0.8 + rand() * 0.5));
    batch.add(N.bush_1, place(bx + BARN_W / 2 + 1.5, z + 1.5, rand() * 6.3, 1.2 + rand() * 0.6));
  }
  for (let x = -30; x < 35; x += 3 + rand() * 2) {
    batch.add(N[trees[Math.floor(rand() * 3)]], place(x, 58 + rand() * 6, rand() * 6.3, 0.9 + rand() * 0.5));
  }
  // A few trees around the yard and garden (west of the yard in the photo).
  for (const [x, z] of [[-36, -48], [-32, -68], [-12, -70], [30, -62], [28, -30]]) {
    batch.add(N.commontree_1, place(x, z, rand() * 6.3, 1 + rand() * 0.4));
  }
  // Distant tree lines on the horizon (typical Flemish view).
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r = 120 + rand() * 90;
    batch.add(N[trees[i % 3]], place(Math.sin(a) * r, Math.cos(a) * r, rand() * 6.3, 1.2 + rand() * 0.6));
  }
  // Grass tufts and flowers in the alley's grass strips.
  for (let i = 0; i < 70; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (2.2 + rand() * 2.6), z = -34 + rand() * 70;
    batch.add(rand() < 0.75 ? N.grass : N.flowers, place(x, z, rand() * 6.3, 0.7 + rand() * 0.6));
  }

  scene.add(batch.build());
}
