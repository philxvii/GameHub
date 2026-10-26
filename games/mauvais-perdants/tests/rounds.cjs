// Complément de multi.cjs : fait jouer PAR L'INTERFACE les manches que son tirage fixe
// ne couvre pas (Gong, Dictée), en repassant par d'autres (Chemin, Déjà vu, Damier, L'Étiquette…).
// Graines recalculées à l'ajout de L'Étiquette (le tirage dépend du catalogue). Trois navigateurs de
// bureau (claviers identiques : la Dictée est éligible), deux tournois aux graines
// choisies. Mêmes prérequis que multi.cjs.
//
//   node games/mauvais-perdants/tests/rounds.cjs

const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');
const CDP = path.join(ROOT, 'tools', 'cdp.js');
const BASE = process.env.SA_URL || 'http://localhost:4174/games/mauvais-perdants/';
const SHOTS = path.join(__dirname, '..', 'docs', 'captures');
const BOT = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port = 9500;
const browsers = [], results = [];
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

async function device(label, width = 1280, height = 820) {
  const { Browser } = cdp();
  const b = await Browser.launch({ headless: true, windowSize: `${width},${height}` });
  browsers.push(b);
  const p = await b.newPage('about:blank', label);
  await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await p.goto(`${BASE}?emu&ai=off`);
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
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('OK   ', name); }
  catch (e) { results.push([false, name]); console.log('ECHEC', name, '|', e.message); }
}
const SKILL = {
  A: `{ react: 200, aim: 230, miss: 0.05, type: 55, memory: 7, calcErr: 9, estimate: 1.05, skip: 2200, bacDelay: 1200, bac: L => [L + 'un', L + 'deux', L + 'trois', L + 'quatre'] }`,
  B: `{ react: 280, aim: 300, miss: 0.2, type: 85, memory: 5, calcErr: 5, estimate: 0.75, boastOn: [0], bacDelay: 1500, bac: L => [L + 'un', L + 'cinq', '', ''] }`,
  C: `{ react: 360, aim: 380, miss: 0.35, type: 120, memory: 3, calcErr: 3, estimate: 1.5, bacDelay: 2000, bac: L => ['', '', '', ''] }`,
};

async function tournament(devs, seed, shotPrefix) {
  const [A] = devs;
  await A.p.eval(`window.__mpSeed = ${js(seed)}; return 1;`);
  await waitFor(A.p, `return !document.querySelector('#btn-start').disabled;`, 15000, 'bouton lancer');
  await A.p.eval(`document.querySelector('#btn-start').click(); return 1;`);
  const tid = await waitFor(A.p, `const m = window.__mp.room.s.match; return m && m.seed === ${js(seed)} && m.tid;`, 15000, 'lancement');
  await Promise.all(devs.map((d, k) => d.p.eval(`return window.__installBot(${SKILL['ABC'[k]]});`)));
  const shots = new Set();
  for (const end = Date.now() + 8 * 60000; ;) {
    const s = await A.p.eval(`const m = window.__mp.room.s.match; return { i: m.i, step: m.step, tid: m.tid, g: m.plan[Math.min(m.i, 4)].g };`).catch(() => ({}));
    if (s.tid === tid && s.step === 'final') break;
    if (s.step === 'play' && !shots.has(s.i)) {
      shots.add(s.i);
      await sleep(3500);
      await devs[1].p.screenshot(path.join(SHOTS, `${shotPrefix}-m${s.i + 1}-${s.g}-play.png`));
    }
    if (Date.now() > end) throw new Error('tournoi non terminé : ' + JSON.stringify(s));
    await sleep(500);
  }
  return A.p.eval(`return window.__mp.room.s.match;`);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await loadRules();
  const devs = [await device('A'), await device('B'), await device('C')];
  const [A, B, C] = devs;
  await A.p.eval(`document.querySelector('#name').value = 'Ana'; document.querySelector('#btn-create').click(); return 1;`);
  const code = await waitFor(A.p, `return window.__mp.room && window.__mp.room.code;`);
  for (const [d, n] of [[B, 'Basile'], [C, 'Coline']]) {
    await d.p.eval(`document.querySelector('#name').value = ${js(n)}; document.querySelector('#code').value = ${js(code)}; document.querySelector('#btn-join').click(); return 1;`);
    await waitFor(d.p, `return document.querySelector('#app').dataset.screen === 'lobby';`);
  }
  const rule = { tir: /[0-9],[0-9] s|cibles/, dictee: /mots\/min|% tapé/, chemin: /^niveau [0-9]+$/, damier: /^niveau [0-9]+$/, dejavu: /bonnes/, nuage: /^écart [0-9]+ %$/, prix: /^écart [0-9]+ %$/, bac: /pts$/ };
  for (const [seed, prefix] of [['MAN00000', '08-manches'], ['MAN00006', '09-manches']]) {
    let m;
    await check(`tournoi ${seed} jusqu’au podium`, async () => { m = await tournament(devs, seed, prefix); });
    if (!m) continue;
    await check(`${seed} : chaque manche a un résultat valide pour les 3 joueurs`, async () => {
      m.plan.forEach((p, i) => {
        const r = m.res[i];
        assert.ok(r, `manche ${i + 1} sans résultat`);
        if (p.g === 'bac') {
          // Coline laisse sa grille vide : comptée absente (0 point), les deux autres ont joué.
          const abs = Object.values(r).filter(x => x.absent);
          assert.equal(abs.length, 1, 'une seule grille vide');
          assert.equal(abs[0].pts, 0);
        }
        for (const [u, x] of Object.entries(r)) {
          if (p.g === 'bac' && x.absent) continue;
          assert.ok(!x.absent, `${p.g} : joueur absent`);
          if (rule[p.g]) assert.match(x.label, rule[p.g], `${p.g} : ${x.label}`);
        }
        console.log(`      ${p.g.padEnd(8)} ${Object.values(r).map(x => `${x.rank}:${x.label}(+${x.pts})`).join('  ')}`);
      });
    });
    await A.p.eval(`[...document.querySelectorAll('.final-actions button')].find(b => b.textContent === 'Retour au salon').click(); return 1;`);
    await waitFor(B.p, `return document.querySelector('#app').dataset.screen === 'lobby';`, 15000, 'retour au salon');
  }
  await check('aucune erreur JavaScript', async () => {
    const errs = devs.flatMap(d => d.p.errors()).filter(e => !/permission_denied|FIREBASE WARNING|ERR_CONNECTION|Failed to load resource/i.test(e));
    assert.deepEqual(errs, []);
  });
  for (const b of browsers) await b.close().catch(() => {});
  const ok = results.filter(r => r[0]).length;
  console.log(`\n===== MANCHES : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(async e => { console.error(e); for (const b of browsers) await b.close().catch(() => {}); process.exit(1); });
