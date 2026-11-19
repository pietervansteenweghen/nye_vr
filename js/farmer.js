// The farmer who welcomes you: a blocky low-poly guy with a straw hat,
// overalls and a pitchfork, plus a speech bubble. Built from boxes in code.
//
// Optional: put a square photo at assets/farmer-face.jpg to give him a real face.
import * as THREE from 'three';

const FACE_URL = 'assets/farmer-face.jpg';

function lambert(c) { return new THREE.MeshLambertMaterial({ color: c }); }
function part(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

function drawFace(g, mouthOpen) {
  g.fillStyle = '#f0b48c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff'; g.fillRect(58, 78, 50, 40); g.fillRect(148, 78, 50, 40);
  g.fillStyle = '#2b1a10'; g.fillRect(76, 86, 22, 26); g.fillRect(166, 86, 22, 26);
  g.fillStyle = '#5a3a22'; g.fillRect(50, 60, 66, 12); g.fillRect(140, 60, 66, 12); // eyebrows
  g.fillStyle = '#e0957a'; g.fillRect(112, 112, 32, 40);                              // nose
  g.fillStyle = '#6b4226'; g.fillRect(70, 158, 116, 22);                              // moustache
  g.fillStyle = '#6a1f1f';
  if (mouthOpen) g.fillRect(100, 184, 56, 34); else g.fillRect(96, 190, 64, 10);
  g.fillStyle = '#e88d8d'; g.fillRect(40, 140, 26, 16); g.fillRect(190, 140, 26, 16);  // cheeks
}

export class Farmer {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const skin = lambert(0xf0b48c), denim = lambert(0x3c5d9c), shirt = lambert(0xc0392b),
      boot = lambert(0x4a2e1a), straw = lambert(0xe8c766), band = lambert(0x8a3b1f), wood = lambert(0x8a5a36),
      metal = lambert(0xb8bec4);

    // Legs + boots
    for (const x of [-0.17, 0.17]) {
      this.body.add(part(new THREE.BoxGeometry(0.26, 0.8, 0.28), denim, x, 0.5, 0));
      this.body.add(part(new THREE.BoxGeometry(0.3, 0.16, 0.38), boot, x, 0.08, 0.04));
    }
    // Torso: shirt with overall bib
    this.body.add(part(new THREE.BoxGeometry(0.66, 0.7, 0.36), shirt, 0, 1.25, 0));
    this.body.add(part(new THREE.BoxGeometry(0.46, 0.45, 0.02), denim, 0, 1.15, 0.19));
    for (const x of [-0.17, 0.17]) this.body.add(part(new THREE.BoxGeometry(0.07, 0.3, 0.02), denim, x, 1.48, 0.19));
    this.body.add(part(new THREE.BoxGeometry(0.68, 0.22, 0.38), denim, 0, 0.95, 0));
    // Arms (pivot at shoulder so they can wave)
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.44, 1.52, 0);
      pivot.add(part(new THREE.BoxGeometry(0.2, 0.62, 0.22), shirt, 0, -0.28, 0));
      pivot.add(part(new THREE.BoxGeometry(0.18, 0.16, 0.2), skin, 0, -0.66, 0));
      this.body.add(pivot);
      this.arms.push(pivot);
    }
    // Pitchfork in the right hand
    const fork = new THREE.Group();
    fork.add(part(new THREE.BoxGeometry(0.05, 1.9, 0.05), wood, 0, 0.3, 0));
    fork.add(part(new THREE.BoxGeometry(0.34, 0.05, 0.05), metal, 0, 1.25, 0));
    for (const x of [-0.15, 0, 0.15]) fork.add(part(new THREE.BoxGeometry(0.035, 0.38, 0.035), metal, x, 1.45, 0));
    fork.position.set(0, -0.68, 0.06);
    this.arms[1].add(fork);

    // Head with a canvas face (mouth animates while talking)
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.photo = null;
    this._mouth = null;
    this._drawFace(false);
    const faceMat = new THREE.MeshLambertMaterial({ map: this.faceTex });
    const headMats = [skin, skin, skin, skin, faceMat, skin]; // +z face
    this.head = new THREE.Group();
    this.head.position.set(0, 1.85, 0);
    this.head.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.46), headMats));
    // Straw hat
    this.head.add(part(new THREE.CylinderGeometry(0.55, 0.58, 0.05, 16), straw, 0, 0.27, 0));
    this.head.add(part(new THREE.CylinderGeometry(0.28, 0.3, 0.26, 16), straw, 0, 0.42, 0));
    this.head.add(part(new THREE.CylinderGeometry(0.305, 0.305, 0.07, 16), band, 0, 0.33, 0));
    this.body.add(this.head);

    // Speech bubble above his head
    this.bubbleCanvas = document.createElement('canvas');
    this.bubbleCanvas.width = 1024; this.bubbleCanvas.height = 512;
    this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
    this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
    this.bubble = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({ map: this.bubbleTex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.bubble.renderOrder = 15;
    this.bubble.position.set(0, 2.95, 0);
    this.root.add(this.bubble);

    this.root.visible = false;
    this.talking = false;
    this.t = 0;
    this.yaw = null;
    scene.add(this.root);

    // Optional real face photo.
    const img = new Image();
    img.onload = () => { this.photo = img; this._mouth = null; this._drawFace(false); };
    img.src = FACE_URL;
  }

  _drawFace(open) {
    if (this._mouth === open) return;
    this._mouth = open;
    const g = this.faceCanvas.getContext('2d');
    if (this.photo) {
      const s = Math.min(this.photo.width, this.photo.height);
      g.drawImage(this.photo, (this.photo.width - s) / 2, (this.photo.height - s) / 2, s, s, 0, 0, 256, 256);
      if (open) { g.fillStyle = 'rgba(60,10,10,0.85)'; g.fillRect(104, 196, 48, 22); }
    } else {
      drawFace(g, open);
    }
    this.faceTex.needsUpdate = true;
  }

  say(text) {
    const g = this.bubbleCanvas.getContext('2d');
    const W = 1024, H = 512;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fffdf5'; g.strokeStyle = '#2b1a10'; g.lineWidth = 10;
    g.beginPath(); g.roundRect(20, 20, W - 40, H - 120, 50); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(W / 2 - 50, H - 104); g.lineTo(W / 2, H - 20); g.lineTo(W / 2 + 40, H - 104); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#fffdf5'; g.fillRect(W / 2 - 44, H - 112, 80, 14);
    // Word-wrap.
    g.fillStyle = '#2b1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 76;
    let lines;
    do {
      g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
      lines = [];
      let line = '';
      for (const word of text.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (g.measureText(test).width > W - 120 && line) { lines.push(line); line = word; } else line = test;
      }
      lines.push(line);
      size -= 6;
    } while (lines.length * size * 1.25 > H - 170 && size > 30);
    const lh = (size + 6) * 1.2;
    const y0 = (H - 100) / 2 - ((lines.length - 1) * lh) / 2 + 10;
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
    this.bubbleTex.needsUpdate = true;
    this.talking = true;
  }

  show(camera) {
    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.yaw = null;
    this.leaving = -1;
    this.update(0, camera);
  }

  hide() { this.root.visible = false; this.talking = false; }

  // He leaves by shrinking into a poof.
  leave() { this.leaving = 0; this.talking = false; }

  update(dt, camera) {
    if (!this.root.visible) return;
    this.t += dt;
    // Stay in front of the player (lazy follow on a circle) so he's never behind you.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const target = Math.atan2(fwd.x, fwd.z);
    if (this.yaw === null) this.yaw = target;
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.35) this.yaw += d * Math.min(1, dt * 2.5);
    const R = 3.6;
    this.root.position.set(Math.sin(this.yaw) * R, 0, Math.cos(this.yaw) * R);
    this.root.rotation.y = this.yaw + Math.PI; // face the player
    this.bubble.lookAt(camera.position);

    // Talking: bob, mouth flap, gesturing arm. Idle: gentle sway.
    const talk = this.talking;
    this.body.position.y = talk ? Math.abs(Math.sin(this.t * 9)) * 0.04 : 0;
    this.head.rotation.z = talk ? Math.sin(this.t * 5) * 0.08 : Math.sin(this.t * 1.5) * 0.03;
    this.arms[0].rotation.z = talk ? -0.6 - Math.sin(this.t * 6) * 0.5 : -0.1;
    this.arms[0].rotation.x = talk ? -0.5 : 0;
    this._drawFace(talk && Math.sin(this.t * 22) > 0);

    if (this.leaving >= 0) {
      this.leaving += dt;
      const k = Math.max(0, 1 - this.leaving / 0.35);
      this.root.scale.set(k * (1 + this.leaving), k, k * (1 + this.leaving));
      this.bubble.visible = false;
      if (k <= 0) this.hide();
    } else {
      this.bubble.visible = true;
    }
  }
}
