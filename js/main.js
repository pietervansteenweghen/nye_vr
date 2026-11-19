// Boot: menu, permissions (gyroscope, audio, wake lock, fullscreen), game loop.
import * as THREE from 'three';
import { LookControls } from './controls.js';
import { View } from './view.js';
import { loadAssets } from './assets.js';
import { buildFarm } from './farm.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { FarmGame } from './game.js';

const $ = id => document.getElementById(id);

// ---------- settings (saved per phone) ----------
const DEFAULTS = { lensMM: 62, fov: 85, quality: 'med' };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('nye-vr-settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
const settings = loadSettings();
const params = new URLSearchParams(location.search);
if (params.has('lens')) settings.lensMM = +params.get('lens');
if (params.has('fov')) settings.fov = +params.get('fov');
if (params.has('quality')) settings.quality = params.get('quality');
function saveSettings() { try { localStorage.setItem('nye-vr-settings', JSON.stringify(settings)); } catch { /* ignore */ } }

function bindSettings() {
  const lens = $('lens'), fov = $('fov'), q = $('quality');
  lens.value = settings.lensMM; fov.value = settings.fov; q.value = settings.quality;
  const show = () => { $('lens-val').textContent = `${settings.lensMM} mm`; $('fov-val').textContent = `${settings.fov}°`; };
  show();
  lens.oninput = () => { settings.lensMM = +lens.value; show(); saveSettings(); view.resize(); };
  fov.oninput = () => { settings.fov = +fov.value; show(); saveSettings(); };
  q.onchange = () => { settings.quality = q.value; saveSettings(); view.resize(); };
}

// ---------- three.js setup ----------
const canvas = $('c');
const view = new View(canvas, settings);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
camera.position.set(0, 1.75, 0);
scene.add(camera);
const controls = new LookControls(camera, canvas);
const hud = new Hud(camera);
const effects = new Effects(scene);
const sfx = new Sfx();
let game = null;
let mode = 'phone';
let running = false;

const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
if (isIOS && !isStandalone) $('ios-tip').classList.remove('hidden');

bindSettings();

const assetsReady = loadAssets(p => { $('load-status').textContent = `Loading farm… ${Math.round(p * 100)}%`; })
  .then(assets => {
    buildFarm(scene, assets);
    game = new FarmGame({ scene, camera, controls, hud, effects, sfx, assets });
    $('load-status').textContent = 'Ready!';
    $('play-phone').disabled = $('play-vr').disabled = false;
    // Render one frame so the menu has the farm behind it once you exit.
    view.render(scene, camera);
  })
  .catch(err => {
    console.error(err);
    $('load-status').textContent = 'Could not load the game: ' + err.message;
  });

// ---------- wake lock & fullscreen ----------
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => { if (running && document.visibilityState === 'visible') keepAwake(); });

function enterFullscreen(landscape) {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement) return Promise.resolve();
  return Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => landscape && screen.orientation?.lock ? screen.orientation.lock('landscape') : null)
    .catch(() => { /* iPhone has no fullscreen API; fine */ });
}
function exitFullscreen() {
  try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function updateRotatePrompt() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('hidden', !(running && mode === 'vr' && portrait));
}
window.addEventListener('resize', updateRotatePrompt);

function showMessage(html, ms = 4000) {
  $('msg-text').innerHTML = html;
  $('msg').classList.remove('hidden');
  setTimeout(() => $('msg').classList.add('hidden'), ms);
}

// ---------- start / stop ----------
async function play(selectedMode) {
  // These three must happen synchronously inside the tap.
  sfx.unlock();
  const permission = LookControls.requestPermission();
  const fs = enterFullscreen(selectedMode === 'vr');

  const granted = await permission;
  await fs;
  await assetsReady;
  if (!game) return;
  // Only complain if the user is on a touch device and no gyro data arrives.
  setTimeout(() => {
    if (running && !controls.hasSensor && navigator.maxTouchPoints > 0) {
      showMessage(granted
        ? 'No motion sensor data. You can look around by dragging.'
        : 'Motion access was blocked, so you can only look around by dragging.<br><br>To fix: fully close this tab, open the link again and tap <b>Allow</b>.', 6000);
    }
  }, 1500);
  keepAwake();

  mode = selectedMode;
  document.body.classList.toggle('vr', mode === 'vr');
  view.setMode(mode);
  controls.connect();
  $('menu').classList.add('hidden');
  $('ingame-buttons').classList.remove('hidden');
  $('vr-divider').classList.toggle('hidden', mode !== 'vr');
  running = true;
  updateRotatePrompt();
  game.start();
}

function backToMenu() {
  running = false;
  game?.stop();
  controls.disconnect();
  try { wakeLock?.release(); } catch { /* ignore */ }
  exitFullscreen();
  view.setMode('phone');
  $('menu').classList.remove('hidden');
  $('ingame-buttons').classList.add('hidden');
  $('vr-divider').classList.add('hidden');
  updateRotatePrompt();
}

$('play-phone').addEventListener('click', () => play('phone'));
$('play-vr').addEventListener('click', () => play('vr'));
$('btn-exit').addEventListener('click', e => { e.stopPropagation(); backToMenu(); });
$('btn-recenter').addEventListener('click', e => { e.stopPropagation(); controls.recenter(); });

// A tap (or the Cardboard button, which taps the screen) = laser burst.
canvas.addEventListener('pointerdown', () => { if (running) game.tap(); });
window.addEventListener('keydown', e => { if (running && e.code === 'Space') game.tap(); });

// ---------- loop ----------
const clock = new THREE.Clock();
view.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running) return;
  controls.update();
  game.update(dt);
  effects.update(dt);
  hud.update(dt);
  hud.layout(view.fov, view.aspect);
  view.render(scene, camera);
});

// Debug hook for automated tests.
window.__nye = { get game() { return game; }, controls, camera, view, play };
