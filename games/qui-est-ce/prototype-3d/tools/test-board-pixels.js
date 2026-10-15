// Test d'image du plateau : le canevas 3D partage (#gl) ne doit JAMAIS avoir de pixel peint
// hors des cases des cartes. Chaque carte peint dans sa case ; un pixel opaque ailleurs est
// une image egaree (portrait geant laisse dans un coin, zone de rendu mal recalee apres
// defilement ou redimensionnement).
//
//   python -m http.server 4173                       # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/test-board-pixels.js
//
// Pour chaque taille (1280 x 720, 1440 x 900, 1440 x 900 a DPR 1,5, 1920 x 1080) : plateau au
// repos, survol d'une carte, secret choisi (portrait HD), defilement, redimensionnement. Lit les
// pixels du canevas (alpha) et compte ceux qui sont hors de toutes les cases (marge 2 px).
// Echoue s'il y en a. Captures dans build/pixels/ (canevas seul, pixels fautifs en rouge).

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU_FLAGS = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const PAGE = process.env.QE_PAGE === 'v3d' ? 'v3d/index.html' : 'prototype-3d/board.html';
const URL = `${ORIGIN}/games/qui-est-ce/${PAGE}?seed&fast${WIN ? '' : '&idle=30'}`;
const OUT = path.join(__dirname, '..', 'build', 'pixels');
const SIZES = (process.env.SIZES || '1280x720,1440x900,1440x900@1.5,1920x1080').split(',').map((s) => { const [wh, d] = s.split('@'); const [w, h] = wh.split('x').map(Number); return [w, h, +(d || 1)]; });
const results = [];
const check = (name, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${d !== '' ? ' | ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); };
const ev = (p, js) => p.eval(js).catch(async () => { await sleep(3000); return p.eval(js); });
const until = async (p, js, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(p, `return !!(${js})`).catch(() => false)) return true; await sleep(250); } return false; };

// Pixels opaques du canevas hors des cases des cartes ; renvoie aussi l'image (fautifs en rouge).
const STRAY = `
  const cv = document.getElementById('gl'), W = cv.width, H = cv.height;
  const g = document.createElement('canvas'); g.width = W; g.height = H; const x = g.getContext('2d');
  x.drawImage(cv, 0, 0); const img = x.getImageData(0, 0, W, H), d = img.data;
  const cr = cv.getBoundingClientRect(), sx = W / cr.width, sy = H / cr.height;
  const inside = new Uint8Array(W * H);
  for (const c of __game.board.cards) {
    const r = c.slot.getBoundingClientRect();
    const x0 = Math.max(0, Math.floor((r.left - cr.left) * sx) - 2), y0 = Math.max(0, Math.floor((r.top - cr.top) * sy) - 2);
    const x1 = Math.min(W, Math.ceil((r.right - cr.left) * sx) + 2), y1 = Math.min(H, Math.ceil((r.bottom - cr.top) * sy) + 2);
    for (let y = y0; y < y1; y++) inside.fill(1, y * W + x0, y * W + x1);
  }
  let n = 0, bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  for (let i = 0; i < W * H; i++) {
    if (inside[i] || d[i * 4 + 3] < 8) continue;
    n++; const px = i % W, py = (i / W) | 0;
    if (px < bx0) bx0 = px; if (py < by0) by0 = py; if (px > bx1) bx1 = px; if (py > by1) by1 = py;
    d[i * 4] = 255; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { n, box: n ? [bx0, by0, bx1, by1] : null, canvas: [W, H], png: g.toDataURL('image/png') };`;

async function stray(p, name) {
  const r = await ev(p, STRAY);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  return { n: r.n, box: r.box, canvas: r.canvas };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await Browser.launch({ headless: true, windowSize: '1920,1080', extraArgs: GPU_FLAGS });
  try {
    for (const [w, h, dpr] of SIZES) {
      const tag = `${w}x${h}${dpr !== 1 ? '@' + dpr : ''}`;
      const p = await b.newPage('about:blank', tag);
      await localCdn(p);
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
      await p.goto(URL);
      if (!(await until(p, 'document.documentElement.dataset.ready === "1"', 400000))) { check(`${tag} : chargement`, false); continue; }
      await ev(p, 'localStorage.clear(); document.querySelector("[data-do=play-bot]").click()');
      await until(p, '__game.view() && __game.view().phase === "choose"');
      await sleep(1500);
      let s = await stray(p, `${tag}-1-repos`);
      check(`${tag} : plateau au repos, rien hors des cases`, s.n === 0, s);
      // survol d'une carte de chaque colonne de la premiere rangee, puis d'une carte du bas
      const pts = await ev(p, `return [0, 1, 2, 3, 4, 5, 20].map((i) => { const r = __game.board.cards[i].slot.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * .4]; })`);
      for (const [x, y] of pts) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(500); }
      s = await stray(p, `${tag}-2-survol`);
      check(`${tag} : survol, rien hors des cases`, s.n === 0, s);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
      // secret choisi : le portrait HD de « mon personnage » est fabrique sur le canevas
      await ev(p, '__game.pick(13)'); await ev(p, 'document.querySelector("[data-do=secret]").click()');
      await until(p, '__game.view().phase === "play" && !document.getElementById("mine").hidden');
      await sleep(1500);
      s = await stray(p, `${tag}-3-secret`);
      check(`${tag} : secret choisi (portrait HD), rien hors des cases`, s.n === 0, s);
      await ev(p, 'window.scrollTo(0, 160)'); await sleep(800);
      s = await stray(p, `${tag}-4-defilement`);
      check(`${tag} : apres defilement, rien hors des cases`, s.n === 0, s);
      await p.send('Emulation.setDeviceMetricsOverride', { width: Math.round(w * 0.85), height: h, deviceScaleFactor: dpr, mobile: false });
      await sleep(1500);
      s = await stray(p, `${tag}-5-redimension`);
      check(`${tag} : apres redimensionnement, rien hors des cases`, s.n === 0, s);
      const errs = p.errors().filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED/.test(e));
      check(`${tag} : console sans erreur`, errs.length === 0, errs.slice(0, 2));
      const shot = await p.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${tag}-ecran.png`), Buffer.from(shot.data, 'base64'));
      await p.close?.();
    }
  } catch (e) {
    check('Execution', false, e.message);
  } finally {
    await b.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== PLATEAU, TEST D'IMAGE : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
