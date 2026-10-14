// Captures des ecrans d'une partie a deux (partie.html?ecran=<id>) : bureau 1280 px, page
// entiere ; mobile 390 x 844, l'ecran du telephone tel qu'on le voit (barre d'action collee en bas). Verifie l'absence de defilement horizontal et d'erreur console.
//
//   python -m http.server 4173                    # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/partie_shots.js build/partie
//   python tools/to_jpeg.py build/partie/*.png --out reports/da/partie

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const outDir = process.argv[2] || 'build/partie';
const ROOT = path.join(__dirname, '..');
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SCREENS = ['accueil', 'salon', 'secret', 'mon-tour', 'repondre', 'attente', 'ecartees', 'designation', 'designation-ratee', 'fin', 'deconnexion'];
const WIDTHS = { bureau: [1280, 860], mobile: [390, 844] };

(async () => {
  fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
  const b = await Browser.launch({ headless: true, windowSize: '1280,900', extraArgs: GPU_FLAGS });
  const report = [];
  try {
    const p = await b.newPage('about:blank', 'partie');
    await localCdn(p);
    for (const id of SCREENS) {
      for (const [kind, [w, h]] of Object.entries(WIDTHS)) {
        await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
        await p.goto(`${ORIGIN}/games/qui-est-ce/prototype-3d/partie.html?ecran=${id}`);
        const ready = () => p.eval('return document.documentElement.dataset.ready === "1"').catch(() => false);
        for (let i = 0; i < 240 && !(await ready()); i++) await sleep(500);
        await sleep(3200);                                         // croix, cercles, lampes, pastille
        const m = await p.eval('return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }');
        const full = kind === 'bureau';
        const { data } = await p.send('Page.captureScreenshot', full
          ? { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: m.sh, scale: 1 } }
          : { format: 'png' });
        fs.writeFileSync(path.join(ROOT, outDir, `${id}-${kind}.png`), Buffer.from(data, 'base64'));
        report.push({ id, kind, ready: await ready(), height: m.sh, hscroll: m.sw > w });
      }
    }
    console.log(JSON.stringify({ shots: report.length, notReady: report.filter((r) => !r.ready).map((r) => r.id + '/' + r.kind),
      horizontalScroll: report.filter((r) => r.hscroll).map((r) => r.id + '/' + r.kind), errors: p.errors().filter((e) => !/favicon/.test(e.text)) }));
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
