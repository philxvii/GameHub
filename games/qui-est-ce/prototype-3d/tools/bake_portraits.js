// Pre-rendu des portraits du plateau : portraits/<id>-<expression>.webp (480 x 600, fond
// transparent) et portraits/index.json. Meme studio que le rendu vivant (js/game/cast.js).
//
//   python -m http.server 4173                                   # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/bake_portraits.js [character-02 ...]
//
// A relancer apres tout changement d'un personnage, d'une coiffure, d'un accessoire ou du
// studio. Sans argument : les 24.

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU_FLAGS = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const OUT = path.join(__dirname, '..', 'portraits');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const b = await Browser.launch({ headless: true, windowSize: '600,700', extraArgs: GPU_FLAGS });
  try {
    const p = await b.newPage('about:blank', 'bake');
    await localCdn(p);
    await p.goto(`${ORIGIN}/games/qui-est-ce/prototype-3d/bake.html`);
    const t0 = Date.now();
    while (!(await p.eval('return document.documentElement.dataset.ready === "1"').catch(() => false))) {
      if (Date.now() - t0 > 180000) throw new Error('page de pre-rendu non prete'); await sleep(300);
    }
    const info = await p.eval('return { ids: __bake.people.map((x) => x.id), exprs: __bake.exprs, size: __bake.size }');
    const indexFile = path.join(OUT, 'index.json');
    const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { portraits: {} };
    for (const [i, id] of info.ids.entries()) {
      if (only.length && !only.includes(id)) continue;
      const res = await p.eval(`return await __bake.one(${i})`);
      let bytes = 0;
      for (const [e, url] of Object.entries(res)) {
        const buf = Buffer.from(url.split(',')[1], 'base64'); bytes += buf.length;
        fs.writeFileSync(path.join(OUT, `${id}-${e}.webp`), buf);
      }
      index.portraits[id] = { exprs: Object.keys(res), bytes };
      console.log(`${id}  ${Math.round(bytes / 1024)} Ko`);
    }
    Object.assign(index, { size: info.size, exprs: info.exprs, baked: new Date().toISOString().slice(0, 10) });
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
    const errs = p.errors().filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED/.test(e));
    if (errs.length) { console.error('Console :', errs.slice(0, 3)); process.exitCode = 1; }
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
