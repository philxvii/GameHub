// Test d'image du plateau : seule la carte concernee peut changer, et seulement dans sa case.
//
//   python -m http.server 4173                       # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/test-board-pixels.js
//
// Pour chaque taille (1280 x 720, 1440 x 900, 1440 x 900 a DPR 1,5, 1920 x 1080) : capture du
// plateau au repos ; survol de cartes de chaque type (personnage 01, lunettes, casquette, barbe,
// crane rase) : le personnage vivant s'allume, et la capture ne doit differer de celle du repos
// QUE dans la case survolee ; le canevas vivant doit etre exactement pose sur la photo ; souris
// partie, le plateau revient a l'identique ; secret choisi, seule sa carte change ; apres
// defilement et redimensionnement, le canevas vivant reste sur sa carte. Echoue sinon.
// Images dans build/pixels/ (differences hors case en rouge).

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU_FLAGS = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const PAGE = process.env.QE_PAGE === 'v3d' ? 'v3d/index.html' : 'prototype-3d/board.html';
const URL = `${ORIGIN}/games/qui-est-ce/${PAGE}?seed&fast`;
const OUT = path.join(__dirname, '..', 'build', 'pixels');
const SIZES = (process.env.SIZES || '1280x720,1440x900,1440x900@1.5,1920x1080').split(',').map((s) => { const [wh, d] = s.split('@'); const [w, h] = wh.split('x').map(Number); return [w, h, +(d || 1)]; });
const results = [];
const check = (name, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${d !== '' ? ' | ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); };
const ev = (p, js) => p.eval(js).catch(async () => { await sleep(3000); return p.eval(js); });
const until = async (p, js, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(p, `return !!(${js})`).catch(() => false)) return true; await sleep(250); } return false; };

// Compare deux captures (PNG base64) dans la page : pixels differents (> 10 niveaux) hors des
// rectangles permis (CSS px, x DPR). Renvoie le compte, la boite, et l'image des fautifs.
const DIFF = (a, b, allowed, dpr) => `
  const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
  const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
  const W = A.width, H = A.height, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, W, H).data;
  g.drawImage(B, 0, 0); const img = g.getImageData(0, 0, W, H), db = img.data;
  const ok = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1] of ${JSON.stringify(allowed)}) {
    for (let y = Math.max(0, Math.floor(y0 * ${dpr})); y < Math.min(H, Math.ceil(y1 * ${dpr})); y++) ok.fill(1, y * W + Math.max(0, Math.floor(x0 * ${dpr})), y * W + Math.min(W, Math.ceil(x1 * ${dpr})));
  }
  let n = 0, bx = [W, H, 0, 0];
  for (let i = 0; i < W * H; i++) {
    const k = i * 4, d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
    if (d <= 10 || ok[i]) continue;
    n++; const x = i % W, y = (i / W) | 0; bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x), Math.max(bx[3], y)];
    db[k] = 255; db[k + 1] = 0; db[k + 2] = 0;
  }
  g.putImageData(img, 0, 0);
  const png = await new Promise((r) => { const f = new FileReader(); c.convertToBlob().then((bl) => { f.onload = () => r(f.result); f.readAsDataURL(bl); }); });
  return { n, box: n ? bx : null, png };`;

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
      if (!(await until(p, 'document.documentElement.dataset.ready === "1"', 300000))) { check(`${tag} : chargement`, false); continue; }
      await ev(p, 'localStorage.clear(); document.querySelector("[data-do=play-bot]").click()');
      await until(p, '__game.view() && __game.view().phase === "choose"');
      await sleep(1200);
      const lineup = await ev(p, 'const r = document.getElementById("lineup").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, innerHeight - r.top), scale: 1 }');
      const cap = async () => (await p.send('Page.captureScreenshot', { format: 'png', clip: lineup })).data;
      const card = (i) => ev(p, `const r = document.querySelector('.suspect[data-i="${i}"]').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]`);
      // rectangle permis, en coordonnees de la capture (plateau) ; marge pour l'elevation et l'ombre
      const rel = (r, m = 26) => [r[0] - lineup.x - m, r[1] - lineup.y - m, r[2] - lineup.x + m, r[3] - lineup.y + m];
      const diff = async (a, bb, allowed, name) => {
        const r = await ev(p, DIFF(a, bb, allowed, dpr));
        fs.writeFileSync(path.join(OUT, `${tag}-${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
        return { n: r.n, box: r.box };
      };
      const aligned = (i) => ev(p, `const c = document.querySelector('.live'), s = document.querySelector('.suspect[data-i="${i}"] .shot').getBoundingClientRect(), r = c.getBoundingClientRect();
        return { on: c.classList.contains('on'), dx: +(r.left - s.left).toFixed(1), dy: +(r.top - s.top).toFixed(1), dw: +(r.width - s.width).toFixed(1), dh: +(r.height - s.height).toFixed(1) }`);
      const ok = (a) => a.on && Math.abs(a.dx) <= 1 && Math.abs(a.dy) <= 1 && Math.abs(a.dw) <= 1 && Math.abs(a.dh) <= 1.5;
      const rest = await cap();
      const kinds = await ev(p, `return [['01', __game.people.findIndex((x) => x.statut === 'modelise')], ['lunettes', __game.people.findIndex((x) => x.attributs.lunettes)],
        ['casquette', __game.people.findIndex((x) => x.attributs.chapeau)], ['barbe', __game.people.findIndex((x) => x.attributs.barbe && !x.attributs.moustache)],
        ['chauve', __game.people.findIndex((x) => x.attributs.coupe === 'chauve')]].filter(([, i]) => i >= 0)`);
      for (const [kind, i] of kinds) {
        const r = await card(i);
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (r[0] + r[2]) / 2, y: r[1] + (r[3] - r[1]) * 0.35 });
        const lit = await until(p, 'document.querySelector(".live.on")', 90000);
        await sleep(700);
        const al = await aligned(i);
        check(`${tag} : survol ${kind} (carte ${i}) : personnage vivant pose sur sa photo`, lit && ok(al), al);
        const d = await diff(rest, await cap(), [rel(r)], `survol-${kind}`);
        check(`${tag} : survol ${kind} : rien ne change hors de sa case`, d.n === 0, d);
      }
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }); await sleep(900);
      let d = await diff(rest, await cap(), [], 'souris-partie');
      check(`${tag} : souris partie : le plateau revient a l'identique`, d.n === 0, d);
      await ev(p, '__game.pick(13)'); await ev(p, 'document.querySelector("[data-do=secret]").click()');
      await until(p, '__game.view().phase === "play"'); await sleep(900);
      d = await diff(rest, await cap(), [rel(await card(13))], 'secret');
      check(`${tag} : secret choisi : seule sa carte change`, d.n === 0, d);
      // defilement puis redimensionnement : le vivant suit sa carte
      await ev(p, 'window.scrollTo(0, 120)'); await sleep(400);
      let r = await card(20);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (r[0] + r[2]) / 2, y: r[1] + (r[3] - r[1]) * 0.4 });
      await until(p, 'document.querySelector(".live.on")', 90000); await sleep(500);
      let al = await aligned(20);
      check(`${tag} : apres defilement, le vivant reste sur sa carte`, ok(al), al);
      await p.send('Emulation.setDeviceMetricsOverride', { width: Math.round(w * 0.85), height: h, deviceScaleFactor: dpr, mobile: false });
      await sleep(900); r = await card(20);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (r[0] + r[2]) / 2 + 2, y: r[1] + (r[3] - r[1]) * 0.4 }); await sleep(900);
      al = await aligned(20);
      check(`${tag} : apres redimensionnement, le vivant reste sur sa carte`, ok(al), al);
      const errs = p.errors().filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED/.test(e));
      check(`${tag} : console sans erreur`, errs.length === 0, errs.slice(0, 2));
      await b.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
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
