// Captures d'écran de référence pour la revue visuelle (docs/captures/).
//
//   node games/mini-subway/tests/capture.cjs [préfixe] [scénarios…]
//
// Prérequis : dépôt servi sur http://localhost:4173 et émulateurs Firebase lancés
// (les pages sont ouvertes en ?emu, voir tests/README.md). CHROME_PATH si besoin.

const path = require('path');
const { Browser, sleep } = require('../../../tools/cdp.js');

const BASE = process.env.MS_URL || 'http://localhost:4173/games/mini-subway/';
const OUT = path.join(__dirname, '..', 'docs', 'captures');
const prefix = process.argv[2] || 'gate';
const only = process.argv.slice(3);

const FF = `
  const sim = await import('/games/mini-subway/js/engine/sim.js');
  const ap = await import('/games/mini-subway/js/engine/autoplay.js');
  window.__ff = (n, every = 40) => { const st = window.__ms.game.view(); for (let i = 0; i < n && !st.over; i++) { sim.step(st); if (i % every === 0) ap.botTurn(st); if (st.reward) sim.apply(st, { type: 'reward', pick: 0, loco: 0 }); } return st.score; };
  window.__sim = sim;
  return 1;`;

async function page(b, w, h, mobile = false) {
  const p = await b.newPage('about:blank');
  await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (mobile) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await p.goto(BASE + '?emu');
  await sleep(1500);
  return p;
}
async function solo(p, opts) {
  await p.eval(`window.__ms.startSolo(${JSON.stringify(opts)}); return 1;`);
  await sleep(600);
  await p.eval(FF);
}
const shot = (p, name) => p.screenshot(path.join(OUT, `${prefix}-${name}.png`));

const SCENES = {
  async menu(b) { const p = await page(b, 1440, 900); await sleep(1500); await shot(p, 'menu'); },
  async play(b) { const p = await page(b, 1440, 900); await p.eval(`document.querySelector('[data-open="play"]').click(); return 1;`); await sleep(900); await shot(p, 'play-sheet'); },
  async start(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'val-dorme', mode: 'classic', seed: 5 });
    await p.eval(`const g = window.__ms.game; g.submit({ type: 'line', l: 0, s: [1, 2] }); g.submit({ type: 'line', l: 1, s: [2, 3] }); return 1;`);
    await p.eval(`return window.__ff(500);`);
    await sleep(1800);
    await shot(p, 'game-start');
  },
  async drawing(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'baie-brumes', mode: 'classic', seed: 9 });
    await p.eval(`const g = window.__ms.game; g.submit({ type: 'line', l: 0, s: [1, 2] }); return window.__ff(900, 1e9);`);
    await sleep(1500);
    // tracé réel à la souris : station 3 → station 1 → vers une autre station (bouton maintenu)
    const pts = await p.eval(`const g = window.__ms.game; const st = g.view(); return [3, 1, st.stations[st.stations.length - 1].id].map(id => { const s = st.stations.find(x => x.id === id); const q = g.renderer.toScreen(s.x, s.y); return [q.x, q.y]; });`);
    const mv = (x, y) => p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
    for (let k = 1; k <= 12; k++) await mv(pts[0][0] + (pts[1][0] - pts[0][0]) * k / 12, pts[0][1] + (pts[1][1] - pts[0][1]) * k / 12);
    for (let k = 1; k <= 8; k++) await mv(pts[1][0] + (pts[2][0] - pts[1][0]) * k / 14, pts[1][1] + (pts[2][1] - pts[1][1]) * k / 14);
    await sleep(300);
    await shot(p, 'drawing');
  },
  async network(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'delta-sauge', mode: 'classic', seed: 21 });
    await p.eval(`return window.__ff(3400);`);
    await sleep(1500);
    await shot(p, 'network');
  },
  async dense(b) {
    const p = await page(b, 1920, 1080);
    await solo(p, { map: 'val-dorme', mode: 'infinite', seed: 33 });
    await p.eval(`return window.__ff(16000, 30);`);
    await sleep(1500);
    await shot(p, 'dense');
  },
  async overload(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'archipel-corail', mode: 'classic', seed: 4 });
    await p.eval(`window.__ff(1400); const st = window.__ms.game.view(); const s = st.stations[1]; for (let i = 0; i < 9; i++) { const id = st.nextId++; st.pass[id] = { id, d: 'circle', s: s.id, tr: -1, rd: st.t, b: st.t }; s.q.push(id); } s.o = 0.72; const s2 = st.stations[2]; s2.o = 0.3; return 1;`);
    await sleep(1400);
    await shot(p, 'overload');
  },
  async reward(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'delta-sauge', mode: 'classic', seed: 2 });
    await p.eval(`const st = window.__ms.game.view(); const sim = window.__sim; for (let i = 0; i < 2100 && !st.reward; i++) sim.step(st); return 1;`);
    await sleep(1200);
    await shot(p, 'reward');
  },
  async pause(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'val-dorme', mode: 'classic', seed: 8 });
    await p.eval(`window.__ff(2400); window.__ms.game.openPause(); return 1;`);
    await sleep(900);
    await shot(p, 'pause');
  },
  async panel(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'val-dorme', mode: 'classic', seed: 8 });
    await p.eval(`window.__ff(2400); const g = window.__ms.game; const l = g.view().lines.find(x => x.s.length >= 2); g.panel('line', l.id); return 1;`);
    await sleep(900);
    await shot(p, 'panel-line');
  },
  async over(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'baie-brumes', mode: 'classic', seed: 12 });
    await p.eval(`return window.__ff(60000);`);
    await sleep(2600);
    await shot(p, 'game-over');
  },
  async night(b) {
    const p = await page(b, 1440, 900);
    await p.eval(`const pr = window.__ms.profile; pr.settings.theme = 'night'; localStorage.setItem('mini-subway:profile', JSON.stringify(pr)); return 1;`);
    await p.goto(BASE + '?emu'); await sleep(1200);
    await solo(p, { map: 'lagune-haute', mode: 'classic', seed: 3 });
    await p.eval(`return window.__ff(3000);`);
    await sleep(1400);
    await shot(p, 'night');
    await p.eval(`const pr = window.__ms.profile; pr.settings.theme = 'day'; pr.settings.palette = 'cb'; localStorage.setItem('mini-subway:profile', JSON.stringify(pr)); return 1;`);
    await p.goto(BASE + '?emu'); await sleep(1200);
    await solo(p, { map: 'lagune-haute', mode: 'classic', seed: 3 });
    await p.eval(`return window.__ff(3000);`);
    await sleep(1400);
    await shot(p, 'colorblind');
    await p.eval(`const pr = window.__ms.profile; pr.settings.palette = 'standard'; localStorage.setItem('mini-subway:profile', JSON.stringify(pr)); return 1;`);
  },
  async creative(b) {
    const p = await page(b, 1440, 900);
    await solo(p, { map: 'haut-plateau', mode: 'creative', seed: 3 });
    await p.eval(`const g = window.__ms.game; [[500,600,'star'],[1000,650,'diamond'],[1100,450,'circle'],[560,320,'triangle']].forEach(([x,y,shape]) => g.submit({ type: 'stAdd', x, y, shape })); const st = g.view(); g.submit({ type: 'line', l: 0, s: st.stations.slice(0, 4).map(s => s.id), loop: true }); g.submit({ type: 'line', l: 1, s: [st.stations[4].id, st.stations[1].id, st.stations[5].id] }); return window.__ff(800, 100000);`);
    await sleep(1200);
    await shot(p, 'creative');
  },
  async mobile(b) {
    const p = await page(b, 390, 844, true);
    await sleep(1200);
    await shot(p, 'mobile-menu');
    await solo(p, { map: 'val-dorme', mode: 'classic', seed: 5 });
    await p.eval(`return window.__ff(3000);`);
    await sleep(1400);
    await shot(p, 'mobile-game');
    const q = await page(b, 768, 1024, true);
    await solo(q, { map: 'baie-brumes', mode: 'classic', seed: 5 });
    await q.eval(`return window.__ff(3000);`);
    await sleep(1400);
    await shot(q, 'tablet-game');
  },
};

(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '1920,1080' });
  const errors = [];
  try {
    for (const [name, fn] of Object.entries(SCENES)) {
      if (only.length && !only.includes(name)) continue;
      try { await fn(b); console.log('ok   ', name); }
      catch (e) { console.log('ECHEC', name, e.message); errors.push(name); }
    }
    for (const p of b.pages.values()) errors.push(...p.errors());
  } finally { await b.close(); }
  if (errors.length) { console.log(errors.join('\n')); process.exitCode = 1; }
})();
