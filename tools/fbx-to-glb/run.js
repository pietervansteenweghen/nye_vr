const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname; const types = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(8765);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage(); pg.on('console', m => console.log('[page]', m.text())); pg.on('pageerror', e => console.log('[err]', e.message));
  await pg.goto('http://localhost:8765/conv.html'); await pg.waitForFunction(() => window.ready);
  const dir = process.argv[3] || 'fbx'; const names = (process.argv[4] || 'Cow,Horse,Llama,Pig,Pug,Sheep,Zebra').split(',');
  const mode = process.argv[2];
  for (const n of names) {
    if (mode === 'inspect') console.log(JSON.stringify(await pg.evaluate(([n,d]) => inspect(n,d), [n, dir])));
    else { const b64 = await pg.evaluate(([n,d]) => convert(n,null,d), [n, dir]); fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/' + n.toLowerCase() + '.glb', Buffer.from(b64, 'base64')); console.log('wrote', n); }
  }
  await b.close(); srv.close();
})();
