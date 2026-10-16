// Captures REDUITES des ecrans cles du jeu, en UNE commande (une image regardee ~ 1 000 jetons au lieu de ~ 1 900).
//
//   node games/qui-est-ce/prototype-3d/tools/shoot.js [--mobile] [--page board.html] [--port 4191] [--out dossier]
//
// Ecrit des JPEG de 940 px de large maximum dans build/shots/shoot/ (ou --out) : accueil, choix du secret,
// ma manche (avec un survol). Imprime seulement les chemins. A utiliser UNIQUEMENT pour juger l'esthetique ;
// pour verifier un comportement, utiliser tools/check-all.js. GPU reel si disponible (Windows : D3D11).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');

const PROTO = path.join(__dirname, '..');
const ROOT = path.join(PROTO, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MOBILE = args.includes('--mobile');
const PAGE = opt('--page', 'board.html');
const PORT = opt('--port', '4191');
const OUT = path.resolve(opt('--out', path.join(PROTO, 'build', 'shots', 'shoot')));
const W = MOBILE ? 390 : 1440, H = MOBILE ? 844 : 900;
const SCALE = Math.min(1, 940 / W);
const GPU = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', PORT], { cwd: ROOT, stdio: 'ignore' });
  await sleep(1500);
  const b = await Browser.launch({ headless: true, windowSize: `${W},${H}`, extraArgs: GPU });
  try {
    const p = await b.newPage('about:blank', 'shoot');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: MOBILE });
    const shot = async (name) => {
      const { data } = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
      const f = path.join(OUT, `${MOBILE ? 'm-' : ''}${name}.jpg`);
      fs.writeFileSync(f, Buffer.from(data, 'base64'));
      console.log(f + '  ' + Math.round(fs.statSync(f).size / 1024) + ' Ko');
    };
    const click = (re) => p.eval(`const b=[...document.querySelectorAll('button')].find(b=>/${re}/i.test(b.innerText)); if(b) b.click(); return !!b`);
    await p.goto(`http://localhost:${PORT}/games/qui-est-ce/prototype-3d/${PAGE}`);
    await sleep(3500);
    await shot('1-accueil');
    if (!(await click('contre le bot'))) { console.log('bouton « contre le bot » introuvable : ecran(s) suivant(s) ignore(s)'); return; }
    await sleep(4500);
    await shot('2-choix-secret');
    const sel = await p.eval(`const c=document.querySelector('[data-id],.card,.portrait,li'); if(c) c.click(); return !!c`);
    await sleep(600);
    await click('garder|mon personnage|confirm');
    await sleep(3500);
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(W * 0.42), y: Math.round(H * 0.45) });
    await sleep(1500);
    await shot('3-ma-manche-survol');
    const errs = p.errors().filter((e) => !e.includes('X4122'));
    if (errs.length) console.log('erreurs console : ' + errs.slice(0, 2).map((e) => e.slice(0, 120)).join(' | '));
  } finally {
    await b.close();
    server.kill();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
