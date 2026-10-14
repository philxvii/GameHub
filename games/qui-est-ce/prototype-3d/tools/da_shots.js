// Captures de da.html (directions artistiques) : une image par direction en bureau, puis la
// page en 390 px de large (aucun defilement horizontal attendu).
//
//   python -m http.server 4173                    # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/da_shots.js build/da
//
// Ecrit <dossier>/<direction>.png, <dossier>/mobile-<direction>.png et affiche un resume
// (erreurs console, largeur de defilement en mobile). Conversion en JPEG pour reports/da/ :
// python tools/to_jpeg.py build/da/*.png --out reports/da

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const outDir = process.argv[2] || 'build/da';
const ROOT = path.join(__dirname, '..');
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = `${ORIGIN}/games/qui-est-ce/prototype-3d/da.html?still`;
const DIRS = ['dossier', 'casting', 'salon'];

async function shoot(p, width, prefix) {
  await p.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await p.goto(URL);
  // Le rendu logiciel bloque la page plusieurs secondes : une interrogation qui expire n'est pas une erreur.
  const title = () => p.eval('return document.title').catch(() => '');
  for (let i = 0; i < 240 && (await title()) !== 'da-ready'; i++) await sleep(500);
  const ready = (await title()) === 'da-ready';
  const scrollW = await p.eval('return document.documentElement.scrollWidth');
  for (const id of DIRS) {
    const r = await p.eval(`const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };`);
    const { data } = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    fs.writeFileSync(path.join(ROOT, outDir, `${prefix}${id}.png`), Buffer.from(data, 'base64'));
  }
  return { width, ready, scrollWidth: scrollW };
}

(async () => {
  fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
  const b = await Browser.launch({ headless: true, windowSize: '1440,900', extraArgs: GPU_FLAGS });
  try {
    const p = await b.newPage('about:blank', 'da');
    await localCdn(p);
    const desk = await shoot(p, 1440, '');
    const mob = await shoot(p, 390, 'mobile-');
    console.log(JSON.stringify({ desk, mob, horizontalScroll: mob.scrollWidth > 390, errors: p.errors() }));
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
