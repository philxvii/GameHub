// Tests d'interface de Mini Subway en solo, dans un vrai Chrome : souris, tactile,
// clavier, zoom/déplacement, dock de ressources, panneaux, pause, menus, réglages,
// fin de partie et records, Créatif (annuler/rétablir), absence de débordement.
//
//   node games/mini-subway/tests/ui.cjs        (dépôt servi sur :4173, émulateurs lancés)

const path = require('path');
const assert = require('assert/strict');
process.env.CDP_PORT = process.env.CDP_PORT || '9400';
const { Browser, sleep } = require('../../../tools/cdp.js');

const BASE = (process.env.MS_URL || 'http://localhost:4173/games/mini-subway/') + '?emu';
const results = [];
const js = v => JSON.stringify(v);
async function check(name, fn) {
  try { await fn(); results.push(true); console.log('OK   ', name); }
  catch (e) { results.push(false); console.log('ECHEC', name, '|', e.message); }
}
async function waitFor(p, expr, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { let v; try { v = await p.eval(expr); } catch (_) {} if (v) return v; if (Date.now() > end) throw new Error('délai : ' + expr.slice(0, 90)); await sleep(100); }
}
const G = `const g = window.__ms.game; const st = g.view();`;
const scr = (p, id) => p.eval(`${G} const s = st.stations.find(x => x.id === ${id}); const q = g.renderer.toScreen(s.x, s.y); return [q.x, q.y];`);
async function mouseDrag(p, pts, release = true) {
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
  for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 8; k++) {
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 8, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 8, button: 'left', buttons: 1 });
  }
  const l = pts[pts.length - 1];
  if (release) await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: l[0], y: l[1], button: 'left', clickCount: 1 });
}
async function touchDrag(p, pts) {
  const tp = ([x, y]) => [{ x, y, id: 1 }];
  await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
  for (let i = 1; i < pts.length; i++) for (let k = 1; k <= 8; k++) await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 8, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 8]) });
  await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const VK = { Tab: 9, Escape: 27, ' ': 32 };
const key = async (p, k, code = k) => { const kc = VK[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0); await p.send('Input.dispatchKeyEvent', { type: k.length === 1 ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: kc, text: k.length === 1 ? k : undefined }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: kc }); };
const noOverflow = p => p.eval(`return document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1;`);

(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '1440,900' });
  const p = await b.newPage('about:blank', 'UI');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await p.goto(BASE);
  await waitFor(p, `return !!window.__ms;`);
  const start = opts => p.eval(`window.__ms.startSolo(${js(opts)}); return 1;`).then(() => sleep(700));

  await check('accueil : menus, panneaux, focus visible, pas de débordement', async () => {
    assert.ok(await noOverflow(p));
    await p.eval(`document.querySelector('[data-open="play"]').click(); return 1;`);
    await waitFor(p, `return !document.querySelector('#p-play').hidden && document.querySelectorAll('.map-card').length === 6;`);
    assert.equal(await p.eval(`return document.querySelectorAll('.map-card.locked').length;`), 3, 'trois cartes à débloquer');
    await key(p, 'Escape');
    await waitFor(p, `return document.querySelector('#p-play').hidden;`);
    // focus clavier (focusVisible : même état qu'une navigation à la touche Tab)
    const f = await p.eval(`const e = document.querySelector('[data-open="challenges"]'); e.focus({ focusVisible: true }); return [e.id || e.className, getComputedStyle(e).outlineStyle, e.matches(':focus-visible')];`);
    assert.ok(f[1] !== 'none', 'focus clavier visible ' + JSON.stringify(f));
  });
  await check('souris : tracer une ligne, revenir en arrière, boucle', async () => {
    await start({ map: 'haut-plateau', mode: 'classic', seed: 4 });
    await p.eval(`${G} st.stations.push({ id: 90, x: 980, y: 380, shape: 'circle', q: [], o: 0, hub: false, born: 0, np: 1e9, h: [], pk: 0 }); st.netVer++; return 1;`);
    await p.eval(`window.__ms.game.autoCam = false; return 1;`); // positions écran stables
    await sleep(200);
    const [a, bb, c, d] = await Promise.all([1, 2, 3, 90].map(id => scr(p, id)));
    await mouseDrag(p, [a, bb, c, bb]); // bb → c puis retour sur bb : c retiré
    assert.equal(await p.eval(`${G} return st.lines[0].s.join();`), '1,2');
    await mouseDrag(p, [c, d, bb, c]);   // fermeture en boucle
    const why = await p.eval(`return [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' / ');`);
    const got = await p.eval(`${G} return [st.lines[1].s.join(), st.lines[1].loop];`);
    if (got[0] !== '3,90,2' || got[1] !== true) throw new Error('boucle : ' + JSON.stringify(got) + ' ' + why);
  });
  await check('souris : prolonger par l’extrémité, insérer une station dans un tronçon', async () => {
    await start({ map: 'haut-plateau', mode: 'classic', seed: 4 });
    await p.eval(`${G} g.submit({ type: 'line', l: 0, s: [1, 2] }); st.stations.push({ id: 91, x: 1000, y: 650, shape: 'square', q: [], o: 0, hub: false, born: 0, np: 1e9, h: [], pk: 0 }, { id: 92, x: 820, y: 640, shape: 'circle', q: [], o: 0, hub: false, born: 0, np: 1e9, h: [], pk: 0 }); st.netVer++; return 1;`);
    await sleep(200);
    const term = await p.eval(`${G} const R = g.renderer; const tg = R.terminalGeom(st, st.lines[0], 1, R.lineOffsets(st)); const q = R.toScreen(tg.x1, tg.y1); return [q.x, q.y];`);
    await mouseDrag(p, [term, await scr(p, 91)]);
    assert.equal(await p.eval(`${G} return st.lines[0].s.join();`), '1,2,91');
    const mid = await p.eval(`${G} const R = g.renderer; const pts = R.segPts(st, R.lineOffsets(st), 0, 2, 91); const q = R.toScreen((pts[2] + pts[4]) / 2, (pts[3] + pts[5]) / 2); return [q.x, q.y];`);
    await mouseDrag(p, [mid, await scr(p, 92)]);
    assert.equal(await p.eval(`${G} return st.lines[0].s.join();`), '1,2,92,91');
  });
  await check('dock : glisser une locomotive, toucher un wagon puis un train', async () => {
    await p.eval(`${G} st.own.locos += 1; st.own.cars = 1; return 1;`);
    const res = await p.eval(`const r = document.querySelector('#dock-res [data-res="loco"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`);
    const n = await p.eval(`${G} return st.trains.length;`);
    const mid = await p.eval(`${G} const R = g.renderer; const pts = R.segPts(st, R.lineOffsets(st), 0, 1, 2); const q = R.toScreen(pts[2], pts[3]); return [q.x, q.y];`);
    await mouseDrag(p, [res, mid]);
    assert.equal(await p.eval(`${G} return st.trains.length;`), n + 1);
    await p.eval(`document.querySelector('#dock-res [data-res="car"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: 10, clientY: 10 })); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 10, clientY: 10 })); return 1;`);
    assert.ok(await p.eval(`return document.querySelector('#dock-res [data-res="car"]').classList.contains('armed');`), 'wagon sélectionné');
    await p.eval(`${G} st.speed = 0; return 1;`);
    const tr = await p.eval(`${G} const R = g.renderer; const t = st.trains[0]; const q0 = R.trainGeom(st, t, R.lineOffsets(st), 0); const q = R.toScreen(q0.x, q0.y); return [q.x, q.y];`);
    await mouseDrag(p, [tr, tr]);
    assert.equal(await p.eval(`${G} return st.trains[0].c;`), 1);
  });
  await check('panneaux : station et ligne, retrait d’une station', async () => {
    await p.eval(`${G} g.panel('line', 0); return 1;`);
    await waitFor(p, `return !document.querySelector('#panel').hidden && /Ligne 1/.test(document.querySelector('#panel').textContent);`);
    await p.eval(`${G} g.panel('station', 92); return 1;`);
    await waitFor(p, `return /Retirer de la ligne 1/.test(document.querySelector('#panel').textContent);`);
    await p.eval(`[...document.querySelectorAll('#panel [data-act="unlink"]')][0].click(); return 1;`);
    assert.equal(await p.eval(`${G} return st.lines[0].s.join();`), '1,2,91');
  });
  await check('clavier : Espace, 1, 2, Échap, M, +/−', async () => {
    await p.eval(`window.__ms.game.panel(null); return 1;`);
    await key(p, '1'); assert.equal(await p.eval(`${G} return st.speed;`), 1);
    await key(p, ' ', 'Space'); assert.equal(await p.eval(`${G} return st.speed;`), 0);
    await key(p, ' ', 'Space'); assert.equal(await p.eval(`${G} return st.speed;`), 1);
    await key(p, '2'); assert.equal(await p.eval(`${G} return st.speed;`), 2);
    const z = await p.eval(`return window.__ms.game.renderer.cam.z;`);
    await key(p, '+', 'Equal'); assert.ok(await p.eval(`return window.__ms.game.renderer.cam.z;`) > z);
    await key(p, 'm', 'KeyM'); assert.equal(await p.eval(`return window.__ms.profile.settings.muted;`), true);
    await key(p, 'm', 'KeyM');
    await key(p, 'Escape');
    await waitFor(p, `return !document.querySelector('#m-pause').hidden;`);
    assert.equal(await p.eval(`${G} return st.speed;`), 0, 'le menu met en pause');
    await key(p, 'Escape');
    await waitFor(p, `return document.querySelector('#m-pause').hidden;`);
    assert.equal(await p.eval(`${G} return st.speed;`), 2, 'la vitesse est rétablie');
  });
  await check('molette et glisser dans le vide : zoom et déplacement, pas de tracé', async () => {
    const z = await p.eval(`return window.__ms.game.renderer.cam.z;`);
    await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: -400 });
    await sleep(100);
    assert.ok(await p.eval(`return window.__ms.game.renderer.cam.z;`) > z);
    const cam = await p.eval(`return { ...window.__ms.game.renderer.cam };`);
    const lines = await p.eval(`${G} return JSON.stringify(st.lines);`);
    await mouseDrag(p, [[60, 300], [260, 420]]);
    const cam2 = await p.eval(`return { ...window.__ms.game.renderer.cam };`);
    assert.notEqual(cam.x, cam2.x);
    assert.equal(await p.eval(`${G} return JSON.stringify(st.lines);`), lines);
    await p.eval(`document.querySelector('#btn-fit').click(); return 1;`);
    assert.equal(await p.eval(`return window.__ms.game.autoCam;`), true);
  });
  await check('recommencer avec confirmation, quitter vers l’accueil', async () => {
    await p.eval(`window.__ms.game.openPause(); document.querySelector('#m-pause [data-act="restart"]').click(); return 1;`);
    await waitFor(p, `return !document.querySelector('#m-confirm').hidden;`);
    await p.eval(`document.querySelector('#cf-no').click(); return 1;`);
    assert.ok(await p.eval(`return document.querySelector('#m-confirm').hidden;`));
    await p.eval(`document.querySelector('#m-pause [data-act="quit"]').click(); return 1;`);
    await p.eval(`document.querySelector('#cf-yes').click(); return 1;`);
    await waitFor(p, `return document.querySelector('#menu').classList.contains('active');`);
  });
  await check('fin de partie : station fautive, record enregistré, rejouer', async () => {
    await start({ map: 'val-dorme', mode: 'classic', seed: 2 });
    await p.eval(`${G} const s = st.stations[0]; for (let i = 0; i < 9; i++) { const id = st.nextId++; st.pass[id] = { id, d: 'triangle', s: s.id, tr: -1, rd: 0, b: 0 }; s.q.push(id); } s.o = 0.995; st.score = 7; return 1;`);
    await waitFor(p, `return !document.querySelector('#m-over').hidden;`, 10000);
    assert.match(await p.eval(`return document.querySelector('#ov-cause').textContent;`), /cercle/);
    assert.equal(await p.eval(`return JSON.parse(localStorage.getItem('mini-subway:profile')).records['val-dorme:classic'].best;`), 7);
    await p.eval(`document.querySelector('#ov-again').click(); return 1;`);
    await waitFor(p, `return document.querySelector('#m-over').hidden && window.__ms.game && window.__ms.game.view().score === 0;`);
  });
  await check('récompense : choix au clavier, inventaire mis à jour', async () => {
    await p.eval(`${G} st.t = st.nextWeek - 1; st.traffic = false; return 1;`);
    await waitFor(p, `return !document.querySelector('#m-reward').hidden;`);
    const before = await p.eval(`${G} return JSON.stringify(st.own);`);
    await p.eval(`document.activeElement.click(); return 1;`);
    await waitFor(p, `return document.querySelector('#m-reward').hidden;`);
    assert.notEqual(await p.eval(`${G} return JSON.stringify(st.own);`), before);
  });
  await check('réglages : Nuit, Daltonien, mouvement réduit, export de la carte', async () => {
    await p.eval(`window.__ms.game.openPause(); document.querySelector('#m-pause [data-act="settings"]').click(); return 1;`);
    await waitFor(p, `return !document.querySelector('#p-settings').hidden;`);
    await p.eval(`document.querySelector('[data-set="theme"][data-val="night"]').click(); return 1;`);
    assert.equal(await p.eval(`return document.documentElement.dataset.theme;`), 'night');
    assert.equal(await p.eval(`return window.__ms.game.renderer.theme;`), 'night');
    await p.eval(`document.querySelector('[data-set="palette"][data-val="cb"]').click(); return 1;`);
    assert.equal(await p.eval(`return window.__ms.game.renderer.palette;`), 'cb');
    await p.eval(`document.querySelector('[data-set="motion"][data-val="reduced"]').click(); return 1;`);
    assert.equal(await p.eval(`return window.__ms.game.reduced;`), true);
    for (const [k, v] of [['theme', 'day'], ['palette', 'standard'], ['motion', 'auto']]) await p.eval(`document.querySelector('[data-set="${k}"][data-val="${v}"]').click(); return 1;`);
    await p.eval(`document.querySelector('#p-settings [data-close]').click(); return 1;`);
    await p.eval(`window.__ms.game.exportImage(); return 1;`);
    await waitFor(p, `return [...document.querySelectorAll('.toast')].some(t => /exportée/.test(t.textContent));`);
    await p.eval(`window.__ms.game.closePause(); return 1;`);
  });
  await check('Créatif : ajouter une station au clic, annuler, rétablir', async () => {
    await start({ map: 'val-dorme', mode: 'creative', seed: 1 });
    await p.eval(`document.querySelector('#cr-shapes [data-shape="star"]').click(); return 1;`);
    const n = await p.eval(`${G} return st.stations.length;`);
    const pos = await p.eval(`${G} const q = g.renderer.toScreen(400, 420); return [q.x, q.y];`);
    await mouseDrag(p, [pos, pos]);
    assert.equal(await p.eval(`${G} return st.stations.length;`), n + 1);
    await key(p, 'z', 'KeyZ').catch(() => {});
    await p.eval(`document.querySelector('#cr-undo').click(); return 1;`);
    assert.equal(await p.eval(`${G} return st.stations.length;`), n);
    await p.eval(`document.querySelector('#cr-redo').click(); return 1;`);
    assert.equal(await p.eval(`${G} return st.stations.some(s => s.shape === 'star');`), true);
  });
  await check('mobile 390×844 et 360×740 : tactile, pas de débordement, dock complet', async () => {
    for (const [w, h] of [[390, 844], [360, 740]]) {
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await start({ map: 'val-dorme', mode: 'classic', seed: 5 });
      await sleep(600);
      assert.ok(await noOverflow(p), `débordement à ${w}`);
      const dk = await p.eval(`const d = document.querySelector('#dock'); return [d.scrollWidth, d.clientWidth];`);
      assert.ok(dk[0] <= dk[1] + 1, `dock tronqué à ${w} : ${dk}`);
      const [a, bb] = await Promise.all([1, 2].map(id => scr(p, id)));
      await touchDrag(p, [a, bb]);
      assert.equal(await p.eval(`${G} return st.lines[0].s.join();`), '1,2', `tracé tactile à ${w}`);
      const small = await p.eval(`return [...document.querySelectorAll('#game button:not([hidden])')].filter(b => b.offsetParent && (b.offsetWidth < 24 || b.offsetHeight < 24)).map(b => b.id || b.className);`);
      assert.deepEqual(small, [], 'cibles tactiles sous 24 px (WCAG 2.2)');
    }
  });

  const errs = p.errors().filter(e => !/fonts\.g|ERR_CERT|ERR_NAME/.test(e));
  if (errs.length) { console.log(errs.join('\n')); results.push(false); }
  await b.close();
  const bad = results.filter(r => !r).length;
  console.log(`\n${results.length - bad}/${results.length} vérifications réussies`);
  process.exit(bad ? 1 : 0);
})();
