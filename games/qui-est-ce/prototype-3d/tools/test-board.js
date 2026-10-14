// Test du plateau 3D (board.html) dans Chrome : chargement, 24 cartes, survol (regard et
// tete vers le curseur), decrochage au clic et au clavier, question du jeu, console propre,
// mobile 390 px sans defilement horizontal. Mesures et captures dans build/board/.
//
//   python -m http.server 4173                       # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/test-board.js [--char models/x.glb]

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const args = process.argv.slice(2);
const CHAR = args.includes('--char') ? args[args.indexOf('--char') + 1] : null;
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = `${ORIGIN}/games/qui-est-ce/prototype-3d/board.html`;
// idle=6 : en rendu logiciel, le rafraichissement de repos (1,1 s) occupe toute la page.
const IDLE = process.platform === 'win32' ? '' : 'idle=6';
const q = (extra) => `${BASE}?${[extra, IDLE, CHAR && 'char=' + CHAR].filter(Boolean).join('&')}`;
const OUT = path.join(__dirname, '..', 'build', 'board');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail !== '' ? ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

async function open(p, url, width, height = 900) {
  await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const t0 = Date.now();
  await p.goto(url);
  // Le rendu logiciel bloque la page plusieurs secondes : une interrogation qui expire n'est pas une erreur.
  const ready = () => p.eval('return document.documentElement.dataset.ready === "1"').catch(() => false);
  for (let i = 0; i < 300 && !(await ready()); i++) await sleep(500);
  return { ready: await ready(), wallMs: Date.now() - t0 };
}
const ev = (p, js) => p.eval(js).catch(async (e) => { if (process.env.DEBUG) console.log('       (relance)', js.slice(0, 60), e.message); await sleep(3000); return p.eval(js); });
// Un evenement d'entree attend la page : s'il expire, il a quand meme ete livre.
const input = (p, method, params) => p.send(method, params).catch(() => {});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await Browser.launch({ headless: true, windowSize: '1440,900', extraArgs: GPU_FLAGS });
  const p = await b.newPage('about:blank', 'board');
  await localCdn(p);
  try {
    // 1. Plateau vivant (hasard fige)
    const o = await open(p, q('seed'), 1440, 900);
    check('Plateau charge', o.ready, `${o.wallMs} ms (horloge du test)`);
    if (!o.ready) throw new Error('plateau non charge : ' + JSON.stringify(p.errors()));
    const info = await ev(p, 'return __board.info()');
    check('24 cartes', info.cards === 24 && (await ev(p, 'return document.querySelectorAll(".card").length')) === 24, info);

    // 2. Survol : regard puis tete vers le curseur (carte 8, curseur a gauche puis a droite)
    const box = await ev(p, `const r = __board.cards[7].slot.getBoundingClientRect(); return { l: r.left, r: r.right, y: r.top + r.height * 0.35, cx: r.left + r.width / 2 };`);
    const move = async (x) => { for (let i = 0; i <= 6; i++) { await input(p, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.cx + (x - box.cx) * i / 6, y: box.y }); await sleep(30); } };
    await move(box.cx); await move(box.l + 2); await sleep(5000);
    const left = await ev(p, 'return __board.pose(7)');
    await move(box.r - 2); await sleep(5000);
    const right = await ev(p, 'return __board.pose(7)');
    check('Survol : yeux et tete vers la gauche puis la droite', left.eye < -0.05 && right.eye > 0.05 && right.head > left.head, { left, right });
    const idle = await ev(p, 'return __board.pose(3)');
    check('Les autres cartes gardent leur pose de repos', Math.abs(idle.eye) < 0.3, idle);

    // 3. Decrochage : clic, puis clavier
    const c3 = await ev(p, `const r = __board.cards[2].slot.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    for (const type of ['mousePressed', 'mouseReleased']) await input(p, 'Input.dispatchMouseEvent', { type, x: c3.x, y: c3.y, button: 'left', clickCount: 1 });
    await sleep(1500);
    const clicked = await ev(p, `const c = __board.cards[2]; return { out: c.el.classList.contains('out'), img: !!c.slot.querySelector('img'), pressed: c.el.getAttribute('aria-pressed'), left: document.getElementById('left').textContent };`);
    check('Clic : portrait decroche (image figee, aria-pressed)', clicked.out && clicked.img && clicked.pressed === 'true' && clicked.left === '23', clicked);
    await ev(p, '__board.cards[4].el.focus()');
    await input(p, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await input(p, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await input(p, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await input(p, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(1500);
    const kb = await ev(p, `return { focus: document.activeElement === __board.cards[5].el, out: __board.cards[5].el.classList.contains('out') }`);
    check('Clavier : fleche puis Entree decroche le portrait suivant', kb.focus && kb.out, kb);
    await input(p, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });

    // 4. Question du jeu : les portraits qui ne correspondent pas sont decroches
    const before = await ev(p, 'return __board.cards.filter((c) => !c.out).length');
    const secret = await ev(p, 'return __board.secret()');
    await ev(p, 'document.getElementById("question").value = "0"; document.getElementById("ask").click();');
    await sleep(9000);
    const after = await ev(p, `return { left: __board.cards.filter((c) => !c.out).length, answer: document.getElementById('answer').textContent, secretUp: !__board.cards.find((c) => c.person.prenom === ${JSON.stringify(secret)}).out }`);
    check('Question : reponse affichee, non-correspondants decroches, secret toujours accroche', after.answer.length > 3 && after.left < before && after.secretUp, { before, ...after, secret });

    // 5. Mesures (en SwiftShader les temps ne valent rien : a refaire sur le PC)
    // Sur le PC : 24 cartes repeintes ; en rendu logiciel, 4 cartes (sinon plus de 60 s par appel).
    const N = process.platform === 'win32' ? 24 : 4;
    const msN = await ev(p, `return __board.paintMs(${N}, 1)`);
    const ms24 = msN * 24 / N;
    const ms1 = await ev(p, 'return __board.paintMs(1, 2)');
    const info2 = await ev(p, 'return __board.info()');
    const gpu = await ev(p, `const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'`);
    const errs = p.errors().filter((e) => !/favicon/.test(e.text));
    check('Console sans erreur', errs.length === 0, errs.slice(0, 3));
    const measures = { char: CHAR || 'models/character-01-ict.glb', loadMs: info.loadMs, glbBytes: info.glbBytes, parseMs: info.parseMs,
      trianglesPerCard: info.trianglesPerCard, memory: info2.memory, programs: info2.programs, canvas: info2.canvas,
      repaint24Ms: +ms24.toFixed(1), repaint1Ms: +ms1.toFixed(1), gpu };
    console.log('       Mesures :', JSON.stringify(measures));

    // 6. Captures figees : bureau, puis mobile 390 px
    const d = await open(p, q('still'), 1440, 900);
    const h = await ev(p, 'return Math.ceil(document.documentElement.scrollHeight)');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(4000);
    let shot = await p.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'desktop.png'), Buffer.from(shot.data, 'base64'));
    const m = await open(p, q('still'), 390, 844);
    const sw = await ev(p, 'return document.documentElement.scrollWidth');
    check('Mobile 390 px : pas de defilement horizontal', d.ready && m.ready && sw <= 390, { scrollWidth: sw });
    shot = await p.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'mobile.png'), Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(measures, null, 1));
  } catch (e) {
    check('Execution', false, e.message);
  } finally {
    await b.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== PLATEAU 3D : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
