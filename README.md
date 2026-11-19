# 🎆 NYE VR: Farm Frenzy

A browser VR party game for phones in Google Cardboard-style headsets. No app
install: open a link, tap **Play**, and you're in.

**Mini-game 1: Farm Frenzy.** Animals charge at you across a farm. Look at
them and your laser locks on automatically. Hold your gaze until they explode.
Don't let them trample you (5 hearts, 75 seconds).

## How to play

| Mode | How |
|---|---|
| 📱 Phone | Hold the phone up and look around through it. Tap = extra laser burst. ⟲ recenters. |
| 🥽 Cardboard | Tap *Play in Cardboard*, turn the phone sideways, put it in the headset. Look straight ahead during the 3-2-1 countdown (that sets "forward"). |
| 💻 Laptop | Drag the mouse to look, space = laser burst (for testing). |

**iPhone:** Safari asks for "Motion & Orientation" access. Tap **Allow**.
For true full screen, use *Share → Add to Home Screen* and open it from there.

**Cardboard settings** (on the start screen, saved per phone):
- *Lens distance*: if you see double, adjust this until the two images merge.
- *Field of view*: bigger = more zoomed out.
- *Quality*: use *Low* on older phones.

You can also pass these as URL parameters: `?lens=62&fov=85&quality=low`.

## Running it

This is a static site: no build step, no dependencies to install.

- **On a phone:** it must be served over **HTTPS** (browsers block the
  gyroscope otherwise). GitHub Pages does this: every push to `main` deploys
  via `.github/workflows/pages.yml`.
- **Locally on a laptop:** `python3 -m http.server 8000` then open
  http://localhost:8000.

## Code map

| File | What it does |
|---|---|
| `js/main.js` | Start screen, permissions (motion, audio, wake lock, fullscreen), game loop |
| `js/controls.js` | Gyroscope head tracking + mouse fallback + recenter |
| `js/view.js` | Normal or side-by-side Cardboard rendering (no WebXR, so it works on iPhone) |
| `js/farm.js` | Builds the farm scene; static meshes merged per colour for speed |
| `js/game.js` | Farm Frenzy rules: spawning, gaze targeting, laser, scoring |
| `js/hud.js` | In-world HUD and reticle (3D, so it works in both eyes) |
| `js/effects.js` | Explosions, confetti, floating scores, laser beam |
| `js/audio.js` | Synthesised sound effects (no audio files) |
| `assets/models` | Low-poly GLB models (Quaternius, CC0), see `CREDITS.md` |

## Roadmap

1. ✅ Single-player farm shooter (phone mode)
2. 🟡 Cardboard mode: built in, needs tuning on real headsets (lens distance, FOV, maybe lens-distortion correction)
3. ⬜ Multiplayer: up to 20 players, shared seed + start time, host screen with leaderboard
