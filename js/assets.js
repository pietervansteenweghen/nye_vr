// Loads the low-poly models (Quaternius, CC0) and normalises their size.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ANIMALS = ['pig'];

// Target height in metres for each nature model.
export const NATURE = {
  commontree_1: 9, commontree_3: 10, pinetree_1: 10,
  bush_1: 2.2, flowers: 0.5, grass: 0.55,
};

// Swap the exported materials for cheap Lambert (fast on phones). We avoid
// `flatShading` because it relies on GPU derivatives that are flaky on phones.
export function toonify(root) {
  const cache = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const conv = m => {
      if (!cache.has(m)) {
        cache.set(m, // The FBX->glTF step darkened colours twice (sRGB->linear applied to values
        // that were already linear); undo one of those conversions here.
        new THREE.MeshLambertMaterial({ color: m.color.clone().convertLinearToSRGB(), name: m.name }));
      }
      return cache.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.frustumCulled = !o.isSkinnedMesh; // skinned bounds are unreliable
  });
}

// Wrap a model in a group whose origin sits on the ground, scaled to `height`.
function normalise(scene, height) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  scene.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  const wrap = new THREE.Group();
  wrap.add(scene);
  wrap.userData.size = size.multiplyScalar(s);
  return wrap;
}

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const jobs = [
    ...ANIMALS.map(n => ({ kind: 'animal', name: n, url: `assets/models/animals/${n}.glb` })),
    ...Object.keys(NATURE).map(n => ({ kind: 'nature', name: n, url: `assets/models/nature/${n}.glb` })),
  ];
  let done = 0;
  const out = { animals: {}, nature: {} };
  await Promise.all(jobs.map(async job => {
    const gltf = await loader.loadAsync(job.url);
    toonify(gltf.scene);
    if (job.kind === 'animal') {
      out.animals[job.name] = { scene: gltf.scene, clips: gltf.animations };
    } else {
      out.nature[job.name] = normalise(gltf.scene, NATURE[job.name]);
    }
    onProgress(++done / jobs.length);
  }));
  return out;
}

export { normalise };
