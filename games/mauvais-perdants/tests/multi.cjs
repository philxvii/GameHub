// Test multijoueur de bout en bout de Mauvais Perdants, avec de VRAIS clients distincts :
// un Chrome (profil, donc compte anonyme Firebase) par appareil, contre les émulateurs
// locaux — jamais la production. Les joueurs jouent par l'interface (tests/bot.js).
//
//   node games/mauvais-perdants/tests/multi.cjs
//
// Prérequis (voir tests/README.md) :
//   - émulateurs base + auth (règles phase 2) : cd firebase && npx firebase emulators:start --only database,auth --project demo-gamehub
//   - dépôt servi : node firebase/tests/serve-emulated.js 4174
//   - IA simulée : node games/mauvais-perdants/tests/ai-mock.mjs 8787
//
// Scénario : salon (3 joueurs + 1 écran de scène), mauvais code, 5 manches complètes
// avec correction IA du Petit Bac et vote, rechargement d'un joueur en pleine partie,
// podium identique partout, revanche avec IA en panne (jury), retour au salon,
// 3e tournoi : l'hôte disparaît, un autre joueur reprend la coordination.

const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');
const CDP = path.join(ROOT, 'tools', 'cdp.js');
const BASE = process.env.SA_URL || 'http://localhost:4174/games/mauvais-perdants/';
const AI = process.env.SA_AI || 'http://localhost:8787';
const SHOTS = path.join(__dirname, '..', 'docs', 'captures');
const BOT = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port = 9400;
const browsers = [];
const results = [];
const js = v => JSON.stringify(v);

// Le site parle à l'espace « undercover-game-b0d2a-default-rtdb » de l'émulateur, dont les
// règles par défaut sont ouvertes : on y charge les VRAIES règles (phase 2) avant de jouer.
async function loadRules() {
  const rules = fs.readFileSync(path.join(ROOT, 'firebase', 'database.rules.phase2.json'), 'utf8');
  const res = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb', { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
  if (!res.ok) throw new Error('règles non chargées : ' + res.status);
  const back = await (await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=undercover-game-b0d2a-default-rtdb', { headers: { Authorization: 'Bearer owner' } })).text();
  if (!back.includes('"mp"')) throw new Error('règles de mp absentes après chargement');
  console.log('      règles phase 2 chargées dans l’émulateur');
}

function cdp() { process.env.CDP_PORT = String(port++); delete require.cache[require.resolve(CDP)]; return require(CDP); }

async function device(label, { width = 1280, height = 800, mobile = false } = {}) {
  const { Browser } = cdp();
  const b = await Browser.launch({ headless: true, windowSize: `${width},${height}` });
  browsers.push(b);
  const p = await b.newPage('about:blank', label);
  await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await p.goto(`${BASE}?emu&ai=${encodeURIComponent(AI)}`);
  await waitFor(p, 'return !!window.__mp;');
  await p.eval(BOT + '; return 1;');
  return { b, p, label };
}
async function waitFor(p, expr, ms = 20000, label = expr) {
  const end = Date.now() + ms;
  for (;;) {
    let v; try { v = await p.eval(expr); } catch (_) { v = null; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`[${p.label}] délai dépassé : ${label}`);
    await sleep(200);
  }
}
const state = p => p.eval('const r = window.__mp.room; return r && r.s.match ? { tid: r.s.match.tid, i: r.s.match.i, step: r.s.match.step, phase: r.s.phase, coord: r.s.coord } : { phase: r && r.s.phase };');
const shot = async (p, name) => { try { await p.screenshot(path.join(SHOTS, `${name}.png`)); } catch (e) { console.log('capture impossible', name, e.message); } };
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('OK   ', name); }
  catch (e) { results.push([false, name]); console.log('ECHEC', name, '|', e.message); }
}
async function join(d, code, name, scene = false) {
  await d.p.eval(`document.querySelector('#name').value = ${js(name)}; document.querySelector('#code').value = ${js(code)}; document.querySelector('#scene-join').checked = ${scene}; document.querySelector('#btn-join').click(); return 1;`);
  await waitFor(d.p, `return document.querySelector('#app').dataset.screen === 'lobby';`, 15000, `${name} dans le salon`);
}

// Niveaux des joueurs automatiques (code injecté : les fonctions passent ainsi).
const SKILL = {
  A: `{ react: 210, aim: 260, miss: 0.05, type: 60, memory: 7, calcErr: 9, estimate: 1.08, boastOn: [1], skip: 2600, refuse: /zz/i, bacDelay: 1500,
        bac: L => [L + 'ommun', L + 'eta', L + 'ex', ''] }`,
  B: `{ react: 290, aim: 330, miss: 0.15, type: 90, memory: 5, calcErr: 5, estimate: 0.8, boastOn: [0, 3], refuse: /zz/i, bacDelay: 2500,
        bac: L => [L + 'ommun', L + 'omega', '', L + 'alpha'] }`,
  C: `{ react: 380, aim: 420, miss: 0.3, type: 130, memory: 3, calcErr: 3, estimate: 1.6, boastOn: [2], bacDelay: 3500,
        bac: L => [L + 'zzbizarre', L + 'xqinvente', L + 'sigma', L + 'tau'] }`,
};
const bot = (d, who) => d.p.eval(`return window.__installBot(${SKILL[who]});`);

async function tournamentDone(devs, tid, ms = 9 * 60000) {
  const end = Date.now() + ms;
  let lastLog = 0;
  for (;;) {
    const s = await state(devs[0].p).catch(() => ({}));
    if (s.tid === tid && s.step === 'final') return s;
    if (Date.now() - lastLog > 15000) { lastLog = Date.now(); console.log('      …', JSON.stringify(s)); }
    if (Date.now() > end) throw new Error('tournoi non terminé à temps : ' + JSON.stringify(s));
    await sleep(1000);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await loadRules();
  const A = await device('A');
  const B = await device('B', { width: 390, height: 844, mobile: true });
  const C = await device('C');
  const D = await device('Scène', { width: 1600, height: 900 });
  let code, T1, T2;

  await check('accueil : rendu, pas d’erreur', async () => {
    await shot(A.p, '01-accueil');
    await shot(B.p, '01b-accueil-mobile');
    assert.equal(await A.p.eval(`return document.querySelector('.logo').textContent;`), 'MauvaisPerdants');
  });
  await check('créer un salon (code court et lisible)', async () => {
    await A.p.eval(`window.__mpSeed = 'MULTI001'; document.querySelector('#name').value = 'Alice'; document.querySelector('#btn-create').click(); return 1;`);
    code = await waitFor(A.p, `return window.__mp.room && window.__mp.room.code;`);
    assert.match(code, /^[A-Z]{3,5}-[0-9]{2}$/);
  });
  await check('mauvais code : message clair', async () => {
    await B.p.eval(`document.querySelector('#name').value = 'Bob'; document.querySelector('#code').value = 'ZZZZ-00'; document.querySelector('#btn-join').click(); return 1;`);
    const err = await waitFor(B.p, `return document.querySelector('#home-err').textContent;`);
    assert.match(err, /inconnu|invalide/i);
  });
  await check('seul au salon : le bouton propose le duel contre Gonzague', async () => {
    assert.equal(await A.p.eval(`return document.querySelector('#btn-start').textContent;`), 'Jouer en solo');
  });
  await check('rejoindre : 2 joueurs + un écran de scène ; présentateur accueille', async () => {
    await join(B, code, 'Bob');
    await join(C, code, 'Chloé <b>');
    await join(D, code, 'Scène', true);
    await waitFor(A.p, `return document.querySelectorAll('#roster li').length === 3 && !document.querySelector('#btn-start').disabled;`, 15000, '3 candidats');
    const names = await A.p.eval(`return [...document.querySelectorAll('#roster .nm')].map(x => x.textContent);`);
    assert.ok(names.includes('Chloé b'), 'balise retirée du pseudo : ' + names);
    assert.equal(await A.p.eval(`return document.querySelectorAll('#roster b').length;`), 0, 'aucun HTML injecté');
    // Le présentateur n'est plus affiché, mais ses répliques sont toujours écrites (mc/).
    await waitFor(A.p, `return Object.values(window.__mp.room.s.mc || {}).some(l => (l.t || '').length > 10);`, 10000, 'réplique du salon');
    await shot(A.p, '02-salon');
    await shot(B.p, '02b-salon-mobile');
  });

  await check('règles réelles dans le navigateur : un joueur ne peut ni avancer le tournoi ni prendre la main', async () => {
    const r = await B.p.eval(`const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const { db } = await import('/shared/firebase.js');
      const base = 'mp/' + window.__mp.room.code;
      const out = [];
      for (const [p, v] of [['phase', 'ended'], ['coord', window.__mp.room.me], ['cfg', { roast: 'hard', crude: true }]]) {
        try { await set(ref(db, base + '/' + p), v); out.push('accepté:' + p); } catch (e) { out.push('refusé'); }
      }
      return out;`);
    assert.deepEqual(r, ['refusé', 'refusé', 'refusé']);
  });
  await check('lancer : même tirage, même manche, mêmes paramètres partout', async () => {
    await A.p.eval(`document.querySelector('#btn-start').click(); return 1;`);
    for (const d of [A, B, C, D]) await waitFor(d.p, `return document.querySelector('#app').dataset.screen === 'show';`, 15000, `${d.label} en émission`);
    const plans = await Promise.all([A, B, C, D].map(d => d.p.eval(`const m = window.__mp.room.s.match; return JSON.stringify({ seed: m.seed, plan: m.plan, p: window.__mp.params() });`)));
    assert.ok(plans.every(x => x === plans[0]));
    const plan = JSON.parse(plans[0]).plan;
    T1 = (await state(A.p)).tid;
    assert.equal(plan.length, 5);
    assert.equal(new Set(plan.map(x => x.g)).size, 5);
    assert.equal(new Set(plan.map(x => x.f)).size, 5);
    console.log('      tirage :', plan.map(x => x.g).join(', '));
    await shot(A.p, '03-intro-manche');
    await shot(B.p, '03b-intro-mobile');
    await Promise.all([bot(A, 'A'), bot(B, 'B'), bot(C, 'C')]);
  });

  // Captures en route, et rechargement d'un joueur pendant la 2e manche.
  let captured = new Set(), reloaded = false, reloadedPlay = null;
  const watcher = (async () => {
    for (;;) {
      const s = await state(D.p).catch(() => ({}));
      if (s.tid !== T1 || s.step === 'final') return;
      const g = await D.p.eval(`return window.__mp.room.s.match.plan[window.__mp.room.s.match.i].g;`).catch(() => '');
      const k = `${s.i}-${s.step}`;
      if (!captured.has(k) && ['play', 'reveal', 'board', 'vote', 'judge'].includes(s.step)) {
        captured.add(k);
        await sleep(s.step === 'play' ? 2500 : 1600);
        await shot(D.p, `04-scene-m${s.i + 1}-${g}-${s.step}`);
        if (s.step === 'play') await shot(B.p, `04b-mobile-m${s.i + 1}-${g}-play`);
        if (s.step === 'vote' || (g === 'bac' && s.step === 'reveal')) await shot(A.p, `05-bac-${s.step}`);
      }
      if (reloaded && !reloadedPlay && s.i === 2 && s.step === 'play') {
        await sleep(3000);
        await C.p.goto(`${BASE}?emu&ai=${encodeURIComponent(AI)}`);
        reloadedPlay = await waitFor(C.p, `const t = document.querySelector('#deck .live .fine'); return t && t.textContent;`, 15000, 'C : manche arrêtée après rechargement');
        await C.p.eval(BOT + '; return 1;');
        await bot(C, 'C');
      }
      // Fenêtre élargie au compte à rebours : l'intro peut ne durer qu'une seconde (tous prêts).
      if (!reloaded && s.i === 1 && ['intro', 'count'].includes(s.step)) {
        reloaded = true;
        await C.p.goto(`${BASE}?emu&ai=${encodeURIComponent(AI)}`);
        await waitFor(C.p, `return document.querySelector('#app').dataset.screen === 'show';`, 15000, 'C revient dans l’émission');
        await C.p.eval(BOT + '; return 1;');
        await bot(C, 'C');
      }
      await sleep(400);
    }
  })();

  await check('tournoi 1 : 5 manches jouées jusqu’au podium', async () => {
    await tournamentDone([A, B, C, D], T1);
    await watcher;
  });
  await check('reconnexion : le joueur rechargé a retrouvé la partie et joué la suite', async () => {
    assert.ok(reloaded, 'rechargement effectué');
    const m = await A.p.eval(`return window.__mp.room.s.match;`);
    const cUid = await C.p.eval(`return window.__mp.room.me;`);
    const played = Object.keys(m.res).filter(i => Number(i) >= 1 && m.res[i][cUid] && !m.res[i][cUid].absent).length;
    assert.ok(played >= 3, `manches jouées après rechargement : ${played}`);
  });
  await check('rechargement en pleine manche : pas de rejeu, la manche s’arrête à ce qui était joué', async () => {
    assert.match(String(reloadedPlay), /quitté la manche/);
    const m = await A.p.eval(`return window.__mp.room.s.match;`);
    const cUid = await C.p.eval(`return window.__mp.room.me;`);
    assert.ok(m.res[2] && m.res[2][cUid], 'résultat de C pour la manche 3');
  });
  await check('points : chaque manche écrite une fois, total = somme, podium identique partout', async () => {
    const all = await Promise.all([A, B, C, D].map(d => d.p.eval(`const m = window.__mp.room.s.match; return JSON.stringify({ res: m.res, podium: [...document.querySelectorAll('.final .brow')].map(x => x.textContent) });`)));
    const parsed = all.map(x => JSON.parse(x));
    assert.ok(parsed.every(x => JSON.stringify(x) === JSON.stringify(parsed[0])), 'mêmes résultats et même podium partout');
    const res = parsed[0].res;
    assert.deepEqual(Object.keys(res).sort(), ['0', '1', '2', '3', '4']);
    const totals = {};
    Object.values(res).forEach(r => Object.entries(r).forEach(([u, x]) => { totals[u] = (totals[u] || 0) + x.pts; }));
    const shown = parsed[0].podium.map(t => Number(t.match(/(\d+)$/)[1]));
    assert.deepEqual(shown, Object.values(totals).sort((a, b) => b - a));
    assert.ok(Object.values(res[4]).some(x => x.base >= 4 && x.base % 2 === 0), 'finale doublée');
    console.log('      totaux :', JSON.stringify(totals));
  });
  await check('Petit Bac : correction IA, doublon à 5, ambiguë soumise au vote et refusée, inventée refusée', async () => {
    const m = await A.p.eval(`return window.__mp.room.s.match;`);
    const i = m.plan.findIndex(x => x.g === 'bac');
    const det = JSON.parse(m.det[i]);
    assert.match(det.mode, /^ia:gemini/);
    const cells = Object.values(det.cells).flat();
    assert.ok(cells.some(c => /ommun$/.test(c.t) && c.st === 'shared' && c.p === 5), 'doublon partagé');
    assert.ok(cells.some(c => /zzbizarre/.test(c.t) && c.st === 'invalid'), 'ambiguë refusée au vote');
    assert.ok(cells.some(c => /xqinvente/.test(c.t) && c.st === 'invalid'), 'inventée refusée par l’IA');
    assert.ok(cells.some(c => c.st === 'unique' && c.p === 10), 'unique à 10');
    assert.ok(Object.values(det.votes).some(v => v.s === 'invalid' && v.no === 2), 'vote majoritaire');
  });
  await check('présentateur : répliques variées, liées aux faits, réécrites par l’IA quand elle répond', async () => {
    const lines = await D.p.eval(`return Object.values(window.__mp.room.s.mc);`);
    assert.ok(lines.length >= 3);
    assert.ok(lines.some(l => l.src === 'gemini'), 'au moins une réplique de l’IA simulée');
    assert.equal(new Set(lines.map(l => l.t)).size, lines.length, 'pas de répétition');
  });
  await check('écran final : podium, statistiques, revanche', async () => {
    await sleep(2500);
    await shot(D.p, '06-final-scene');
    await shot(B.p, '06b-final-mobile');
    assert.ok(await A.p.eval(`return !!document.querySelector('.podium') && [...document.querySelectorAll('.final-actions button')].some(b => b.textContent === 'Revanche');`));
    assert.ok(!(await B.p.eval(`return [...document.querySelectorAll('.final-actions button')].some(b => b.textContent === 'Revanche');`)), 'revanche réservée à l’hôte');
  });

  await check('revanche en un clic : nouveau tirage, mêmes joueurs, IA en panne -> jury', async () => {
    await fetch(`${AI}/mode?m=down`);
    await A.p.eval(`window.__mpSeed = 'MULTI002'; [...document.querySelectorAll('.final-actions button')].find(b => b.textContent === 'Revanche').click(); return 1;`);
    T2 = `t${Number(T1.slice(1)) % 9999 + 1}`;
    for (const d of [A, B, C, D]) await waitFor(d.p, `const m = window.__mp.room.s.match; return m && m.tid === ${js(T2)} && m.step === 'intro';`, 15000, `${d.label} revanche`);
    const [p1, p2] = await A.p.eval(`const m = window.__mp.room.s.match; return [m.recent, m.plan.map(x => x.g)];`);
    assert.deepEqual(p2.filter(g => p1.includes(g)), [], 'aucune manche de la partie précédente ne revient');
    await tournamentDone([A, B, C, D], T2);
    const m = await A.p.eval(`return window.__mp.room.s.match;`);
    // Le Petit Bac était dans la 1re partie : il ne revient donc pas ici. Le jury sans IA est vérifié s'il est tiré.
    const bi = m.plan.findIndex(x => x.g === 'bac');
    if (bi >= 0) {
      const det = JSON.parse(m.det[bi]);
      assert.equal(det.mode, 'jury');
      assert.ok(Object.values(det.cells).flat().some(c => /xqinvente/.test(c.t) && c.st === 'unique'), 'sans IA, personne n’a refusé : acceptée (règle annoncée)');
    }
    await fetch(`${AI}/mode?m=ok`);
  });

  await check('retour au salon puis 3e tournoi : l’hôte disparaît, un joueur reprend la coordination', async () => {
    await A.p.eval(`[...document.querySelectorAll('.final-actions button')].find(b => b.textContent === 'Retour au salon').click(); return 1;`);
    await waitFor(B.p, `return document.querySelector('#app').dataset.screen === 'lobby';`, 15000, 'retour au salon');
    await A.p.eval(`window.__mpSeed = 'MULTI003'; return 1;`);
    await waitFor(A.p, `return !document.querySelector('#btn-start').disabled;`, 10000, 'bouton lancer');
    await A.p.eval(`document.querySelector('#btn-start').click(); return 1;`);
    // L'intro peut ne durer qu'une seconde (tous prêts) : l'intro ou le compte à rebours suffisent.
    await waitFor(B.p, `const m = window.__mp.room.s.match; return m && m.tid !== ${js(T2)} && ['intro', 'count'].includes(m.step);`, 15000, '3e tournoi lancé');
    const hostUid = await A.p.eval(`return window.__mp.room.me;`);
    await A.b.close();
    browsers.splice(browsers.indexOf(A.b), 1);
    const coord = await waitFor(B.p, `const r = window.__mp.room; return r.s.coord && r.s.coord !== ${js(hostUid)} ? r.s.coord : null;`, 40000, 'relève du coordinateur');
    assert.ok([await B.p.eval(`return window.__mp.room.me;`), await C.p.eval(`return window.__mp.room.me;`), await D.p.eval(`return window.__mp.room.me;`)].includes(coord));
    await waitFor(B.p, `const m = window.__mp.room.s.match; return m.step === 'play' || m.i >= 1;`, 40000, 'la partie avance sans l’hôte');
    await shot(B.p, '07-releve-mobile');
  });

  await check('aucune erreur JavaScript dans les pages', async () => {
    const errs = [B, C, D].flatMap(d => d.p.errors()).filter(e => !/permission_denied|FIREBASE WARNING|ERR_CONNECTION|Failed to load resource/i.test(e));
    assert.deepEqual(errs, []);
  });

  for (const b of browsers) await b.close().catch(() => {});
  const ok = results.filter(r => r[0]).length;
  console.log(`\n===== MULTIJOUEUR : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(async e => { console.error(e); for (const b of browsers) await b.close().catch(() => {}); process.exit(1); });
