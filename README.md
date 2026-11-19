# 🎆 Voorbeeldje Spelleke NYE

A browser VR party game for phones in Google Cardboard-style headsets. No app
install: open a link, tap **Speel**, and you're in. All in-game text is Dutch.

**Mini-game 1: the pig farm.** You stand in the alley between the two pig barns
(modelled on the real farm from the aerial photo and Street View). A farmer
welcomes you, then pigs charge at you from **both ends** of the alley. Look at
a pig and your laser locks on; keep looking until it swells up and explodes in
a shower of blocks. **One life**: if a pig reaches you, it's over. Score points;
quick kills build a combo multiplier, golden pigs are worth 5x.

## How to play

| Mode | How |
|---|---|
| 📱 Phone | Hold the phone up and look around through it. Tap = extra laser burst (or skip the farmer's line). ⟲ recenters, 🎵 toggles music. |
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
| `js/farm.js` | Builds the pig farm (barns, silos, hedges, yard); static meshes merged per colour |
| `js/game.js` | Game rules: farmer intro, pig spawning, gaze targeting, laser, scoring |
| `js/farmer.js` | The talking farmer (blocky character + speech bubble) |
| `js/hud.js` | In-world HUD and reticle (3D, so it works in both eyes) |
| `js/effects.js` | Explosions, confetti, floating scores, laser beam |
| `js/audio.js` | 3D pig grunts, explosions (synthesised) and music playback with crossfade |
| `assets/models` | Low-poly GLB models (Quaternius, CC0), see `CREDITS.md` |

## Farmer face (optional)

Put a square photo at `assets/farmer-face.jpg` and the farmer wears it as his
face. Note the repo/site is public, so only do this with the person's OK.

## Music

Recorded tracks by Kevin MacLeod (incompetech.com, CC BY 4.0, credited on the
start screen): "Hillbilly Swing" for the farmer intro and "Cool Rock" during
the game. To use the other rock track ("Chipper"), change `TRACKS.rock` in
`js/audio.js` to `assets/music/rock-alt.mp3`.

Commercial songs can't go in here: a GitHub Pages site is public even when the
repo is private. For a specific song, play it on the venue speakers.

## Roadmap

1. ✅ Single-player farm shooter (phone mode)
2. 🟡 Cardboard mode: built in, needs tuning on real headsets (lens distance, FOV, maybe lens-distortion correction)
3. ⬜ Multiplayer: up to 20 players, shared seed + start time, host screen with leaderboard
