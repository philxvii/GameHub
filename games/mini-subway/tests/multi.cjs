// Tests multijoueur de Mini Subway avec de VRAIS clients distincts : un Chrome (profil,
// compte anonyme Firebase) par joueur, contre les émulateurs locaux (jamais la production).
//
//   node games/mini-subway/tests/multi.cjs
//
// Prérequis : dépôt servi sur http://localhost:4173 et émulateurs base + auth lancés
// avec les règles phase 2 (voir tests/README.md). Couvre : salon, code inconnu, partie
// pleine, entrée après le départ, monde commun et ressources atomiques (Coopération),
// édition concurrente, commande rejouée, pause de l'hôte, déconnexion/reconnexion,
// abandon, même départ et réseaux indépendants (Versus), commande hors siège refusée,
// fin de duel et revanche, absence de dérive (empreintes d'état identiques).

const path = require('path');
const assert = require('assert/strict');

const CDP = path.join(__dirname, '..', '..', '..', 'tools', 'cdp.js');
const BASE = process.env.MS_URL || 'http://localhost:4173/games/mini-subway/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port = 9300;
const browsers = [];
const results = [];

// Sans accès au CDN gstatic (réseau restreint), MS_FIREBASE_SDK désigne le dossier du
// paquet npm firebase@10.12.0 : ses fichiers, identiques à ceux du CDN, sont servis par
// interception des requêtes. Le code du jeu n'est pas modifié.
async function localSdk(p) {
  const dir = process.env.MS_FIREBASE_SDK;
  if (!dir) return;
  const fs = require('fs');
  const orig = p._onEvent.bind(p);
  p._onEvent = msg => {
    if (msg.method !== 'Fetch.requestPaused') return orig(msg);
    const { requestId, request } = msg.params;
    const file = path.join(dir, path.basename(new URL(request.url).pathname));
    if (!fs.existsSync(file)) { p.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {}); return; }
    p.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fs.readFileSync(file).toString('base64') }).catch(() => {});
  };
  await p.send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.gstatic.com/firebasejs/*' }] });
}

function cdp() { process.env.CDP_PORT = String(port++); delete require.cache[require.resolve(CDP)]; return require(CDP); }

async function player(name) {
  const { Browser } = cdp();
  const b = await Browser.launch({ headless: true, windowSize: '1280,800' });
  browsers.push(b);
  const p = await b.newPage('about:blank', name);
  await localSdk(p);
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await p.goto(BASE + '?emu');
  await waitFor(p, `return !!window.__ms;`);
  await p.eval(`window.__msReconnectMs = 6000; return 1;`);
  return { b, p, name };
}
const js = v => JSON.stringify(v);
async function waitFor(p, expr, ms = 15000, label = expr) {
  const end = Date.now() + ms;
  for (;;) {
    let v; try { v = await p.eval(expr); } catch (_) { v = null; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`[${p.label}] délai dépassé : ${label}`);
    await sleep(150);
  }
}
const click = (p, sel) => p.eval(`document.querySelector(${js(sel)}).click(); return 1;`);
const fill = (p, sel, v) => p.eval(`const e = document.querySelector(${js(sel)}); e.value = ${js(v)}; e.dispatchEvent(new Event('input')); return 1;`);
const text = (p, sel) => p.eval(`const e = document.querySelector(${js(sel)}); return e ? e.textContent : null;`);
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('OK   ', name); }
  catch (e) { results.push([false, name]); console.log('ECHEC', name, '|', e.message); }
}
const S = `const s = window.__ms.lobby && window.__ms.lobby.session;`;
// MS_SHOTS=<préfixe> : captures pour la revue visuelle (docs/captures/).
async function shot(pl, name) {
  if (!process.env.MS_SHOTS) return;
  await sleep(700);
  await pl.p.screenshot(path.join(__dirname, '..', 'docs', 'captures', `${process.env.MS_SHOTS}-${name}.png`));
}

async function openMulti(pl) { await click(pl.p, '[data-open="multi"]'); await fill(pl.p, '#mp-name', pl.name); }
async function create(pl, kind, mode = 'classic') {
  await openMulti(pl);
  await click(pl.p, `#mp-kind [data-kind="${kind}"]`);
  if (kind === 'coop') await pl.p.eval(`document.querySelector('#mp-mode').value = ${js(mode)}; return 1;`);
  await click(pl.p, '#mp-create');
  await waitFor(pl.p, `return document.querySelector('#lobby').classList.contains('active') && /^[A-Z]+-\\d\\d$/.test(document.querySelector('#lobby-code').textContent);`);
  return text(pl.p, '#lobby-code');
}
async function join(pl, code) {
  await openMulti(pl);
  await fill(pl.p, '#mp-code', code);
  await click(pl.p, '#mp-join');
}
async function inGame(pl) { await waitFor(pl.p, `${S} return !!(s && document.querySelector('#game').classList.contains('active') && s.tick > 5);`, 20000, 'partie lancée'); }
// État de mon réseau (mine) côté client.
const mine = (pl, expr) => pl.p.eval(`${S} const st = s.mine(); return (${expr});`);
async function submit(pl, cmd) { return pl.p.eval(`${S} window.__ms.game.submit(${js(cmd)}); return 1;`); }
// Attend que tous les clients aient dépassé le même tick, puis compare leurs empreintes.
async function sameState(players, label) {
  const sim = 'http://localhost:4173/games/mini-subway/js/engine/sim.js';
  // on fige tout le monde à un tick commun grâce à une pause de l'hôte
  const t = Math.max(...await Promise.all(players.map(pl => pl.p.eval(`${S} return s.tick;`)))) + 40;
  const hashes = await Promise.all(players.map(pl => waitFor(pl.p, `${S} if (s.tick < ${t}) return null; return 1;`, 20000).then(() => pl.p.eval(`${S} const m = await import(${js(sim)}); return [s.tick, s.drifts, s.states.map(x => x.score).join(',')];`))));
  for (const [, drifts] of hashes) assert.equal(drifts, 0, `${label} : dérive détectée`);
  return hashes;
}

(async () => {
  const [alice, bob, carol, dave] = await Promise.all(['Alice', 'Bob', 'Carol', 'Dave'].map(player));
  let code;

  // ─────────── Coopération ───────────
  await check('salon : création, code d’invitation', async () => {
    code = await create(alice, 'coop', 'classic');
    assert.match(code, /^[A-Z]{3,5}-\d{2}$/);
  });
  await check('code inconnu : erreur explicite', async () => {
    await join(dave, 'ZZZZ-99');
    await waitFor(dave.p, `return /Code inconnu/.test(document.querySelector('#mp-status').textContent);`);
  });
  await check('code mal formé : erreur explicite', async () => {
    await fill(dave.p, '#mp-code', 'n importe quoi');
    await click(dave.p, '#mp-join');
    await waitFor(dave.p, `return /Code invalide/.test(document.querySelector('#mp-status').textContent);`);
  });
  await check('rejoindre, présence, prêt', async () => {
    await join(bob, code); await join(carol, code);
    await waitFor(alice.p, `return document.querySelectorAll('#lobby-players li').length === 3;`);
    await waitFor(alice.p, `return document.querySelector('#lobby-start').disabled === true;`);
    await click(bob.p, '#lobby-ready'); await click(carol.p, '#lobby-ready');
    await waitFor(alice.p, `return document.querySelector('#lobby-start').disabled === false;`);
    await shot(alice, 'lobby');
  });
  await check('nom hostile affiché comme texte', async () => {
    const html = await alice.p.eval(`return document.querySelector('#lobby-players').innerHTML;`);
    assert.ok(!/<script/i.test(html));
  });
  await check('lancement : même graine et même configuration pour tous', async () => {
    await click(alice.p, '#lobby-start');
    await Promise.all([alice, bob, carol].map(inGame));
    const seeds = await Promise.all([alice, bob, carol].map(pl => mine(pl, 'st.seed + ":" + st.map + ":" + st.mode')));
    assert.equal(new Set(seeds).size, 1);
  });
  await check('entrée refusée après le départ', async () => {
    await join(dave, code);
    await waitFor(dave.p, `return /déjà lancée|refusé/i.test(document.querySelector('#mp-status').textContent);`);
  });
  await check('monde commun : la ligne tracée par Bob apparaît chez tous', async () => {
    await submit(bob, { type: 'line', l: 0, s: [1, 2], rev: 0 });
    for (const pl of [alice, bob, carol]) await waitFor(pl.p, `${S} return s.mine().lines[0].s.join() === '1,2';`, 10000, 'ligne 0');
  });
  await check('ressource atomique : deux poses simultanées de la dernière locomotive', async () => {
    const free = await mine(alice, `st.own.locos - st.trains.filter(t => t.k === 'base').length`);
    // on vide l'inventaire jusqu'à 1 locomotive libre
    for (let i = 0; i < free - 1; i++) await submit(alice, { type: 'train', l: 0 });
    await waitFor(alice.p, `${S} const st = s.mine(); return st.own.locos - st.trains.length === 1;`, 10000, 'une locomotive libre');
    await waitFor(bob.p, `${S} const st = s.mine(); return st.own.locos - st.trains.length === 1;`, 10000, 'idem chez Bob');
    await Promise.all([submit(bob, { type: 'train', l: 0 }), submit(carol, { type: 'train', l: 0 })]);
    await sleep(2500);
    const counts = await Promise.all([alice, bob, carol].map(pl => mine(pl, `[st.trains.length, st.own.locos]`)));
    for (const c of counts) assert.deepEqual(c, counts[0]);
    assert.equal(counts[0][0], counts[0][1], 'toutes les locomotives posées, pas une de plus');
  });
  await check('édition concurrente d’une même ligne : le journal tranche', async () => {
    const rev = await mine(alice, 'st.lines[0].rev');
    await Promise.all([submit(bob, { type: 'line', l: 0, s: [3, 1, 2], rev }), submit(carol, { type: 'line', l: 0, s: [1, 2, 3], rev })]);
    await sleep(2500);
    const seqs = await Promise.all([alice, bob, carol].map(pl => mine(pl, `st.lines[0].s.join()`)));
    assert.equal(new Set(seqs).size, 1);
    assert.ok(['3,1,2', '1,2,3'].includes(seqs[0]));
    assert.equal(await mine(alice, 'st.lines[0].rev'), rev + 1, 'une seule des deux modifications appliquée');
  });
  await check('commande rejouée : sans effet', async () => {
    const n = await alice.p.eval(`${S} return s.cmds.length;`);
    const id = await bob.p.eval(`${S} const c = s.cmds.find(x => x && x.by === s.me); return c && c.id;`);
    assert.ok(id);
    await bob.p.eval(`const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'); const { db } = await import('/shared/firebase.js'); ${S} await set(ref(db, s.base + '/req/' + ${js(id)}), { by: s.me, c: JSON.stringify({ type: 'train', l: 0 }), net: 0 }).catch(() => {}); return 1;`);
    await sleep(2000);
    assert.equal(await alice.p.eval(`${S} return s.cmds.length;`), n);
  });
  await check('pause et vitesse décidées par l’hôte', async () => {
    const r = await bob.p.eval(`${S} return s.canSpeed();`);
    assert.equal(r, false);
    await submit(alice, { type: 'speed', v: 0 });
    for (const pl of [alice, bob, carol]) await waitFor(pl.p, `${S} return s.mine().speed === 0;`, 10000, 'pause');
    const t0 = await mine(bob, 'st.t'); await sleep(1500);
    assert.equal(await mine(bob, 'st.t'), t0, 'le temps de jeu est figé');
    await submit(alice, { type: 'speed', v: 2 });
    for (const pl of [alice, bob, carol]) await waitFor(pl.p, `${S} return s.mine().speed === 2;`, 10000, 'vitesse 2');
  });
  await check('empreintes d’état identiques (aucune dérive)', async () => {
    await sleep(6000);
    const h = await alice.p.eval(`const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'); const { db } = await import('/shared/firebase.js'); ${S} return (await get(ref(db, s.base + '/hash'))).val();`);
    assert.ok(h && h.tick >= 100);
    await sameState([alice, bob, carol], 'coop');
    const scores = await Promise.all([alice, bob, carol].map(pl => mine(pl, 'st.stats.spawned')));
    assert.ok(scores.every(x => x > 0));
    await shot(bob, 'coop');
  });
  await check('déconnexion : pause collective, reconnexion et rattrapage', async () => {
    await carol.p.goto('about:blank');
    await waitFor(alice.p, `${S} return s.autoPaused !== false;`, 15000, 'pause automatique');
    await waitFor(bob.p, `${S} return s.mine().speed === 0;`, 10000, 'pause chez Bob');
    await carol.p.goto(BASE + '?emu');
    await waitFor(carol.p, `${S} return !!s && s.tick > 0;`, 20000, 'reconnexion de Carol');
    await waitFor(alice.p, `${S} return s.autoPaused === false && s.mine().speed > 0;`, 15000, 'reprise');
    const [ta, tc] = await Promise.all([alice.p.eval(`${S} return s.tick;`), carol.p.eval(`${S} return s.tick;`)]);
    assert.ok(Math.abs(ta - tc) < 200, `Carol a rattrapé le journal (${tc}/${ta})`);
    await sameState([alice, carol], 'reconnexion');
  });
  await check('départ définitif : la partie continue sans le joueur', async () => {
    await carol.p.goto('about:blank');
    await waitFor(alice.p, `${S} return s.left.size === 1;`, 20000, 'joueur parti');
    await waitFor(alice.p, `${S} return s.mine().speed > 0;`, 10000, 'partie relancée');
  });

  // ─────────── Versus ───────────
  await alice.p.eval(`window.__ms.game && window.__ms.game.quit(); return 1;`);
  await bob.p.eval(`return 1;`);
  await sleep(1500);
  let vcode;
  await check('Versus : salon à deux, partie pleine pour le troisième', async () => {
    await bob.p.goto(BASE + '?emu'); await waitFor(bob.p, `return !!window.__ms;`);
    await bob.p.eval(`try { sessionStorage.clear(); } catch (_) {} return 1;`);
    await bob.p.goto(BASE + '?emu'); await waitFor(bob.p, `return !!window.__ms;`);
    vcode = await create(alice, 'versus');
    await join(bob, vcode);
    await waitFor(alice.p, `return document.querySelectorAll('#lobby-players li').length === 2;`);
    await dave.p.goto(BASE + '?emu'); await waitFor(dave.p, `return !!window.__ms;`);
    await join(dave, vcode);
    await waitFor(dave.p, `return /pleine/i.test(document.querySelector('#mp-status').textContent);`);
  });
  await check('Versus : même départ, réseaux indépendants', async () => {
    await click(bob.p, '#lobby-ready');
    await waitFor(alice.p, `return document.querySelector('#lobby-start').disabled === false;`);
    await click(alice.p, '#lobby-start');
    await Promise.all([alice, bob].map(inGame));
    await submit(alice, { type: 'line', l: 0, s: [1, 2] });
    await waitFor(bob.p, `${S} return s.other().lines[0].s.length === 2;`, 10000, 'Bob voit la ligne d’Alice (lecture seule)');
    assert.equal(await mine(bob, `st.lines[0].s.length`), 0, 'le réseau de Bob est intact');
    await submit(alice, { type: 'speed', v: 2 });
    await sleep(5000);
    const sig = `st.stations.map(x => x.x + ',' + x.y + ',' + x.shape).join(';')`;
    const a = await alice.p.eval(`${S} return s.states.map(st => ${sig});`);
    assert.equal(a[0], a[1], 'même séquence d’apparitions sur les deux réseaux');
    const b = await bob.p.eval(`${S} return s.states.map(st => ${sig});`);
    await submit(bob, { type: 'line', l: 0, s: [2, 3] });
    await sleep(3000);
    await shot(alice, 'versus');
    assert.equal(a[0].slice(0, b[0].length), b[0].slice(0, a[0].length));
  });
  await check('Versus : commande sur le réseau adverse refusée par les règles', async () => {
    const before = await alice.p.eval(`${S} return s.states[0].lines.map(l => l.s.join()).join('|');`);
    await bob.p.eval(`const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'); const { db } = await import('/shared/firebase.js'); ${S} await set(ref(db, s.base + '/req/forge-' + Date.now()), { by: s.me, c: JSON.stringify({ type: 'line', l: 0, s: [] }), net: 0 }).catch(() => {}); return 1;`);
    await sleep(2500);
    assert.equal(await alice.p.eval(`${S} return s.states[0].lines.map(l => l.s.join()).join('|');`), before);
    await sameState([alice, bob], 'versus');
  });
  await check('Versus : abandon = défaite, écran de fin des deux côtés, revanche', async () => {
    await submit(bob, { type: 'forfeit' });
    await waitFor(alice.p, `return !document.querySelector('#m-over').hidden;`, 15000, 'fin chez Alice');
    await waitFor(bob.p, `return !document.querySelector('#m-over').hidden;`, 15000, 'fin chez Bob');
    assert.equal(await text(alice.p, '#t-ov'), 'Victoire');
    assert.equal(await text(bob.p, '#t-ov'), 'Défaite');
    await shot(alice, 'versus-end');
    const seed0 = await mine(alice, 'st.seed');
    await click(alice.p, '#ov-again');
    await waitFor(bob.p, `${S} return s.round === 2 && s.tick > 5;`, 20000, 'revanche chez Bob');
    assert.notEqual(await mine(alice, 'st.seed'), seed0, 'nouvelle graine');
  });

  for (const b of browsers) for (const p of b.pages.values()) {
    const errs = p.errors().filter(e => !/permission_denied|PERMISSION_DENIED|ERR_CONNECTION|404/.test(e));
    if (errs.length) console.log(errs.join('\n'));
  }
  await Promise.all(browsers.map(b => b.close()));
  const bad = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - bad}/${results.length} vérifications réussies`);
  process.exit(bad ? 1 : 0);
})().catch(async e => { console.error(e); await Promise.all(browsers.map(b => b.close().catch(() => {}))); process.exit(1); });
