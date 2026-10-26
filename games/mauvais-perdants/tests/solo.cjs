// Solo : un seul navigateur clique « Jouer seul contre Gonzague » et joue jusqu'au podium
// (vraies règles chargées dans l'émulateur). Mêmes prérequis que multi.cjs.
//
//   node games/mauvais-perdants/tests/solo.cjs

const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');
const BASE = process.env.SA_URL || 'http://localhost:4174/games/mauvais-perdants/';
const SHOTS = path.join(__dirname, '..', 'docs', 'captures');
const BOT = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.env.CDP_PORT = process.env.CDP_PORT || '9650';
const { Browser } = require(path.join(ROOT, 'tools', 'cdp.js'));
const results = [];

async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('OK   ', name); }
  catch (e) { results.push([false, name]); console.log('ECHEC', name, '|', e.message); }
}
async function waitFor(p, expr, ms = 20000, label = expr) {
  const end = Date.now() + ms;
  for (;;) {
    let v; try { v = await p.eval(expr); } catch (_) { v = null; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`délai dépassé : ${label}`);
    await sleep(250);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'database.rules.phase2.json'), 'utf8');
  const put = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
  assert.ok(put.ok, 'règles chargées');
  const b = await Browser.launch({ headless: true, windowSize: '390,844' });
  const p = await b.newPage('about:blank', 'solo');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await p.goto(`${BASE}?emu&ai=off`);
  await waitFor(p, 'return !!window.__mp;');
  await p.eval(BOT + '; return 1;');
  let m;
  await check('« Jouer seul » lance directement un duel contre Gonzague', async () => {
    await p.eval(`document.querySelector('#name').value = 'Solène'; document.querySelector('#btn-solo').click(); return 1;`);
    m = await waitFor(p, `const m = window.__mp.room && window.__mp.room.s.match; return m && m.step === 'intro' && m;`, 20000, 'tournoi solo');
    assert.ok(m.roster.gonzague, 'Gonzague dans le tournoi');
    assert.equal(Object.keys(m.roster).length, 2);
    assert.ok(!m.plan.some(x => x.g === 'bac'), 'pas de Petit Bac en solo sans IA');
    await waitFor(p, `return /Score à battre/.test(document.querySelector('#deck').textContent);`, 5000, 'score à battre affiché');
    await sleep(800);
    await p.screenshot(path.join(SHOTS, '10-solo-intro-mobile.png'));
    await p.eval(`return window.__installBot({ react: 250, aim: 300, miss: 0.1, type: 70, memory: 6, calcErr: 6, estimate: 1.1, skip: 1500, bacDelay: 1000, bac: L => [] });`);
  });
  await check('5 manches jouées jusqu’au podium, Gonzague classé', async () => {
    const end = Date.now() + 8 * 60000;
    let shot = false;
    for (;;) {
      const s = await p.eval(`const m = window.__mp.room.s.match; return { step: m.step, i: m.i };`);
      if (s.step === 'play' && s.i === 1 && !shot) { shot = true; await sleep(3000); await p.screenshot(path.join(SHOTS, '11-solo-manche-mobile.png')); }
      if (s.step === 'final') break;
      if (Date.now() > end) throw new Error('pas fini : ' + JSON.stringify(s));
      await sleep(800);
    }
    m = await p.eval(`return window.__mp.room.s.match;`);
    assert.deepEqual(Object.keys(m.res).sort(), ['0', '1', '2', '3', '4']);
    for (const r of Object.values(m.res)) assert.ok(r.gonzague && !r.gonzague.absent);
    await sleep(2500);
    const rows = await p.eval(`return [...document.querySelectorAll('.final .brow b')].map(x => x.textContent);`);
    assert.ok(rows.includes('Gonzague') && rows.includes('Solène'), rows.join(','));
    await p.screenshot(path.join(SHOTS, '12-solo-final-mobile.png'));
  });
  await check('revanche en solo', async () => {
    await p.eval(`[...document.querySelectorAll('.final-actions button')].find(b => b.textContent === 'Revanche').click(); return 1;`);
    await waitFor(p, `const m = window.__mp.room.s.match; return m && m.step === 'intro' && m.roster.gonzague && m.tid !== ${JSON.stringify(m.tid)};`, 15000, 'revanche');
  });
  await check('aucune erreur JavaScript', async () => {
    assert.deepEqual(p.errors().filter(e => !/permission_denied|FIREBASE WARNING|Failed to load resource/i.test(e)), []);
  });
  await b.close();
  const ok = results.filter(r => r[0]).length;
  console.log(`\n===== SOLO : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
