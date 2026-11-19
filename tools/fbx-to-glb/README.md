# FBX → GLB converter

Converts Quaternius FBX models to compact GLB using three.js in headless Chromium.

1. `npm i three@0.170.0 playwright` in this folder.
2. Put `.fbx` files in `fbx/` (or another folder).
3. `node run.js convert fbx Cow,Pig` → writes `out/cow.glb`, `out/pig.glb`.
   `node run.js inspect fbx Cow` prints size, materials and animation names.

Only the `Walk`, `Run` and `Jump` animations are kept (edit the filter in
`conv.html`). Colours look too dark after conversion; the game fixes this at
load time in `js/assets.js`.
