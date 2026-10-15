// Apercu de personnages de casting (hors roster) : rend chaque GLB avec le studio du jeu.
//   node games/qui-est-ce/prototype-3d/tools/casting/preview.js sortie.jpg spec.json
// spec.json : [{ "glb": "build/casting/v1-ict.glb", "coiffure": "...", "attributs": {...}, "label": "v1" }, ...]
// Ecrit une planche JPEG (fond de studio colore, 4 expressions par personnage si "exprs").
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Browser, sleep } = require('../../../../../tools/cdp');
const { localCdn } = require('../local-cdn');
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const [out, specFile] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const TMP = path.join(path.dirname(out), '.preview'); fs.mkdirSync(TMP, { recursive: true });
(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '600,700', extraArgs: GPU });
  try {
    const p = await b.newPage('about:blank', 'casting');
    await localCdn(p);
    await p.goto(`${ORIGIN}/games/qui-est-ce/prototype-3d/bake.html`);
    while (!(await p.eval('return document.documentElement.dataset.ready === "1"').catch(() => false))) await sleep(300);
    const files = [];
    for (const [k, s] of spec.entries()) {
      const exprs = s.exprs || ['neutral'];
      const res = await p.eval(`return await __bake.custom(${JSON.stringify({ glb: s.glb, coiffure: s.coiffure, attributs: s.attributs || {} })}, ${JSON.stringify(exprs)})`);
      for (const e of exprs) { const f = path.join(TMP, `${k}-${e}.webp`); fs.writeFileSync(f, Buffer.from(res[e].split(',')[1], 'base64')); files.push([f, s.label || String(k), e, k]); }
    }
    const errs = p.errors().filter((e) => !/ERR_TUNNEL/.test(e)); if (errs.length) console.error(errs.slice(0, 3));
    fs.writeFileSync(path.join(TMP, 'list.json'), JSON.stringify(files));
  } finally { await b.close(); }
  execFileSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'sheet.py'), path.join(TMP, 'list.json'), out], { stdio: 'inherit' });
})().catch((e) => { console.error(e); process.exit(1); });
