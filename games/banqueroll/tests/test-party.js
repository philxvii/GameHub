// Tests navigateur des mecaniques de party, lot par lot : Chrome reel, Firebase reel.
//
//   python -m http.server 4173                                  # depuis la racine du depot
//   node games/banqueroll/tests/test-party.js --lot=0           # un lot
//   node games/banqueroll/tests/test-party.js --lot=all         # tous les lots
//   node games/banqueroll/tests/test-party.js --lot=2 --shots   # + captures
//
// Plus leger que test-browser.js (une partie par scenario, deux fenetres au plus) :
// il tient sur une machine qui manque de memoire. Les parties creees sont SUPPRIMEES.

const path = require('path');
const { Browser, sleep } = require('../../../tools/cdp');

const URL = process.env.BQ_URL || 'http://localhost:4173/games/banqueroll/?ai=off';
const DB = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll/';
const SHOTS = path.join(__dirname, 'shots');
const args = process.argv.slice(2);
const want = f => args.includes(f);
const lotArg = (args.find(a => a.startsWith('--lot=')) || '--lot=all').slice(6);
const LOTS = lotArg === 'all' ? null : lotArg.split(',').map(Number);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail !== '' ? ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

// ---------------------------------------------------------------- utilitaires
const rest = (code, sub = '', method = 'GET', body) =>
  fetch(`${DB}${code}${sub}.json`, { method, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());
const state = code => rest(code);
const codes = new Set();                                 // tout ce qui est cree est supprime a la fin

async function until(page, expr, ms = 8000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await page.eval(`try { return (${expr}); } catch (e) { return null; }`);
    if (v) return v;
    await sleep(200);
  }
  return v;
}
async function shot(page, name) {
  if (!want('--shots')) return;
  await page.send('Page.bringToFront'); await sleep(250);
  await page.screenshot(path.join(SHOTS, name));
}
const click = (page, sel) => page.eval(`const el=document.querySelector(${JSON.stringify(sel)}); if(!el||el.disabled) return false; el.click(); return true;`);
const rig = (page, values) => page.eval(`
  window.__rig = ${JSON.stringify(values)};
  if (!window.__realRandom) { window.__realRandom = Math.random; Math.random = () => (window.__rig && window.__rig.length ? window.__rig.shift() : window.__realRandom()); }
  return 1;`);

async function openPages(b, n = 2) {
  const pages = [];
  for (let i = 0; i < n; i++) {
    const p = await b.newPage(null, 'ABCD'[i]);
    await p.setViewport(1280, 820);
    await p.goto(URL);
    pages.push(p);
  }
  await sleep(1400);
  return pages;
}

// Cree une partie par le vrai parcours : formulaire -> ecran du mode -> salon.
async function createVia(A, { name = 'Alice', players = '2', preset = 'classic', picks = [] } = {}) {
  await A.eval(`document.getElementById('create-name').value=${JSON.stringify(name)};
    document.getElementById('create-players').value=${JSON.stringify(players)};
    document.getElementById('create-timer').value='60';
    document.querySelector('[data-act="create"]').click(); return 1;`);
  await until(A, `document.getElementById('s-mode').classList.contains('active')`, 4000);
  if (preset === 'custom') {
    await click(A, '[data-act="mode-pick"][data-arg="custom"]');
    await A.eval(`${JSON.stringify(picks)}.forEach(k => { const i=document.querySelector('#mode-toggles input[value="'+k+'"]'); if (i) i.checked = true; }); return 1;`);
    await click(A, '[data-act="mode-custom-go"]');
  } else await click(A, `[data-act="mode-pick"][data-arg="${preset}"]`);
  const code = await until(A, `document.getElementById('s-lobby').classList.contains('active') && __bq.S.code`, 6000);
  if (code) codes.add(code);
  return code;
}
async function joinVia(B, code, name = 'Bob') {
  return B.eval(`document.getElementById('join-code').value=${JSON.stringify(code)};
    document.getElementById('join-name').value=${JSON.stringify(name)};
    document.querySelector('[data-act="join"]').click(); await new Promise(r=>setTimeout(r,2400));
    return document.querySelector('.screen.active').id;`);
}
// Les cartes de regles du lancement bloquent le premier tour : les tests de mecaniques les
// sautent (le lot 0 les teste a travers l'interface, avec brief: true).
// Paris actifs : le lanceur attend que les autres aient parie ou passe. Pour lancer tout de
// suite, on attend l'ouverture des paris puis tous les autres passent.
async function skipBets(code) {
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    const g = await state(code);
    const b = g.bets;
    if (b && b.status === 'open' && b.roller === g.players[g.turnIndex].id) {
      await rest(code, '/bets/skip', 'PATCH', Object.fromEntries(g.players.filter(p => p.id !== b.roller).map(p => [p.id, true])));
      await sleep(500);
      return true;
    }
    await sleep(300);
  }
  return false;
}
const noBrief = code => rest(code, '', 'PATCH', { briefing: null, turnDeadline: Date.now() + 600000 });
async function startVia(A, { brief = false } = {}) {
  await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
  const ok = await until(A, `__bq.S.game && __bq.S.game.phase==='playing'`, 6000);
  if (ok && !brief) { await noBrief(await A.eval(`return __bq.S.code;`)); await sleep(600); }
  return ok;
}
// Partie a deux, lancee, avec le mode demande. Renvoie les index et ids.
async function duo(A, B, opts = {}) {
  const code = await createVia(A, opts);
  await joinVia(B, code);
  await startVia(A);
  await sleep(1000);
  const g = await state(code);
  const ia = g.players.findIndex(p => p.name === 'Alice'), ib = 1 - ia;
  return { code, g, ia, ib, idA: g.players[ia].id, idB: g.players[ib].id, pageOf: i => (i === ia ? A : B) };
}
// Place un tour : joueur, position, argent ; plus aucune action ni enchere en cours.
async function setTurn(code, i, patch = {}, extra = {}) {
  await rest(code, `/players/${i}`, 'PATCH', patch);
  await rest(code, '', 'PATCH', { turnIndex: i, currentAction: null, turnRolled: null, extraRoll: null, event: null, swap: null, auction: null, briefing: null,
    turnDeadline: Date.now() + 600000, ...extra });
  await sleep(1200);
}

// ---------------------------------------------------------------- lot 0 : configuration
async function lot0(b) {
  const [A, B] = await openPages(b);
  // Classique : configuration figee, toutes les mecaniques OFF, visible chez l'autre joueur.
  let code = await createVia(A, { preset: 'classic' });
  let g = await state(code);
  const keys = Object.keys(g.gameConfig || {}).filter(k => k !== 'preset');
  check('Mode Classique : gameConfig écrit, tout OFF', g.gameConfig && g.gameConfig.preset === 'classic' && keys.length >= 12 && keys.every(k => g.gameConfig[k] === false), g.gameConfig);
  await joinVia(B, code);
  const seenB = await until(B, `document.querySelector('#lobby-mode .mode-badge')?.textContent.trim()`, 4000);
  check('Mode Classique : le second joueur lit le mode dans le salon', /Classique/.test(seenB || ''), seenB);
  await shot(A, 'party-lot0-lobby-classic.png');
  // Revanche : la configuration est conservee.
  await startVia(A);
  await rest(code, '', 'PATCH', { phase: 'finished', winnerId: g.players[0].id });
  await sleep(800);
  await A.eval(`await __bq.A.restartGame(); return 1;`);
  await sleep(1200);
  g = await state(code);
  check('Revanche : la configuration ne change pas', g.phase === 'lobby' && g.gameConfig.preset === 'classic');
  await A.eval(`__bq.A.leaveGame(); return 1;`); await B.eval(`__bq.A.leaveGame(); return 1;`);
  await sleep(600);

  // Chaos : toutes ON, badge dans le bandeau de jeu.
  code = await createVia(A, { preset: 'chaos' });
  g = await state(code);
  check('Mode Chaos : toutes les mécaniques ON', Object.entries(g.gameConfig).filter(([k]) => k !== 'preset').every(([, v]) => v === true), g.gameConfig.preset);
  await joinVia(B, code);
  await startVia(A, { brief: true });
  const hud = await until(B, `document.getElementById('hud-mode').textContent`, 4000);
  check('Mode Chaos : badge visible dans le bandeau des deux joueurs', /Chaos/.test(hud || ''), hud);
  // Cartes de regles : chez les deux joueurs, avant le premier tour, qui attend que tous soient prets.
  const deckOf = P => until(P, `(() => { const o = document.getElementById('brief-overlay'); return !o.hidden && document.querySelectorAll('#brief-dots .brief-dot').length; })()`, 5000);
  const nA = await deckOf(A), nB = await deckOf(B);
  check('Lancement : cartes de règles chez les deux joueurs (3 bases + 12 mécaniques)', nA === 15 && nB === 15, `${nA} / ${nB}`);
  g = await state(code);
  check('Lancement : pas de chrono ni de lancer tant que le briefing est ouvert', g.briefing && !g.turnDeadline, { briefing: !!g.briefing, deadline: g.turnDeadline });
  await click(A, '[data-act="brief-next"]');
  const card2 = await A.eval(`return document.querySelector('#brief-card h3').textContent;`);
  await shot(A, 'party-lot0-briefing.png');
  const cur = g.players[g.turnIndex];
  const P1 = cur.name === 'Alice' ? A : B;
  const before = (await state(code)).turnRolled;
  await P1.eval(`__bq.A.rollDice(); return 1;`);
  await sleep(900);
  check('Lancement : le dé est refusé pendant le briefing', !(await state(code)).lastRoll && before == null);
  await click(A, '#brief-ready');
  await sleep(1200);
  g = await state(code);
  const waitTxt = await A.eval(`return document.getElementById('brief-wait').textContent;`);
  check('Lancement : un joueur prêt attend l’autre (son nom est affiché)', g.briefing && g.briefing.ready && Object.keys(g.briefing.ready).length === 1 && /Bob/.test(waitTxt), waitTxt);
  await click(B, '#brief-ready');
  const gone = await until(A, `document.getElementById('brief-overlay').hidden && !__bq.S.game.briefing ? 1 : 0`, 5000);
  g = await state(code);
  check('Lancement : tous prêts → cartes fermées, le chrono du premier tour démarre', gone === 1 && !g.briefing && g.turnDeadline > Date.now(), { card2 });
  await A.eval(`__bq.A.leaveGame(); return 1;`); await B.eval(`__bq.A.leaveGame(); return 1;`);
  await sleep(600);

  // Party : spectacle ON, economie lourde OFF.
  code = await createVia(A, { preset: 'party' });
  g = await state(code);
  check('Mode Party : spectacle ON, carapace et krach OFF', g.gameConfig.preset === 'party' && g.gameConfig.duel && g.gameConfig.eventMinigames && !g.gameConfig.blueShell && !g.gameConfig.marketCrash);
  await A.eval(`__bq.A.leaveGame(); return 1;`);
  await sleep(500);

  // Personnalise : seulement les interrupteurs coches.
  code = await createVia(A, { preset: 'custom', picks: ['duel', 'betting'] });
  g = await state(code);
  const on = Object.entries(g.gameConfig).filter(([k, v]) => k !== 'preset' && v).map(([k]) => k).sort();
  check('Mode Personnalisé : seulement duel + paris', g.gameConfig.preset === 'custom' && on.join() === 'betting,duel', on);
  await A.eval(`__bq.A.leaveGame(); return 1;`);
  await sleep(500);

  // Ancienne partie sans gameConfig : Classique.
  const legacy = 'TEST-' + Math.floor(100 + Math.random() * 899);
  codes.add(legacy);
  await rest(legacy, '', 'PUT', { code: legacy, hostId: 'h1', maxPlayers: 3, turnTimer: 60, phase: 'lobby', turnIndex: 0, round: 1,
    players: [{ id: 'h1', name: 'Hôte', position: 21, cash: 1000, color: '#2F7FC1', ready: true }], createdAt: Date.now(), updatedAt: Date.now() });
  await joinVia(B, legacy);
  const legacyMode = await until(B, `document.querySelector('#lobby-mode .mode-badge')?.textContent.trim()`, 4000);
  check('Ancienne partie sans gameConfig : affichée et traitée en Classique', /Classique/.test(legacyMode || ''), legacyMode);
  await B.eval(`__bq.A.leaveGame(); return 1;`);

  // Bots : le choix du mode s'applique aussi au solo.
  await A.eval(`document.getElementById('bot-name').value='Solo'; document.getElementById('bot-count').value='1';
    document.querySelector('[data-act="bot-game"]').click(); return 1;`);
  await until(A, `document.getElementById('s-mode').classList.contains('active')`, 4000);
  await click(A, '[data-act="mode-pick"][data-arg="party"]');
  const solo = await until(A, `__bq.S.game && __bq.S.game.phase==='playing' && __bq.S.code`, 8000);
  if (solo) codes.add(solo);
  g = solo ? await state(solo) : {};
  check('Solo contre un bot : mode choisi puis partie lancée', g.gameConfig && g.gameConfig.preset === 'party' && g.phase === 'playing');
  // Le bot est pret d'office ; le seul humain clique « Pret » et la partie part aussitot.
  await until(A, `!document.getElementById('brief-overlay').hidden ? 1 : 0`, 4000);
  await click(A, '#brief-ready');
  const soloGo = await until(A, `!__bq.S.game.briefing && __bq.S.game.turnDeadline ? 1 : 0`, 5000);
  check('Solo : le bot est prêt d’office, la partie démarre dès que l’humain est prêt', soloGo === 1);
  await A.eval(`__bq.A.leaveGame(); return 1;`);
  return [A, B];
}

// ---------------------------------------------------------------- lot 1 : reactions + encheres
async function lot1(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB } = await duo(A, B, { preset: 'custom', picks: ['reactions', 'extendedAuctions'] });
  // --- reactions : envoi par l'interface, vu chez l'autre joueur
  await until(A, `!document.getElementById('react-dock').hidden`, 4000);
  await A.eval(`document.querySelector('[data-act="react-target"][data-arg="${idB}"]').click(); return 1;`);
  await B.eval(`window.__seenFly = 0; new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => { if (n.classList && (n.classList.contains('react-fly') || n.classList.contains('react-splat'))) window.__seenFly++; }))).observe(document.getElementById('react-layer'), { childList:true }); return 1;`);
  await click(A, '[data-act="react"][data-arg="tomato"]');
  await sleep(1500);
  let g = await state(code);
  const sent = Object.values(g.reactions || {});
  check('Réactions : envoi écrit dans Firebase (de, vers, type)', sent.length === 1 && sent[0].from === idA && sent[0].to === idB && sent[0].kind === 'tomato', sent);
  const flyB = await B.eval(`return window.__seenFly;`);
  check('Réactions : l’animation apparaît chez l’autre joueur', flyB >= 1, `${flyB} élément(s)`);
  check('Réactions : aucune incidence sur l’économie', g.players.every((p, i) => p.cash === 1000 + i * 25));
  // --- spam : 10 clics d'affilee -> une seule reaction (0,7 s minimum entre deux)
  await A.eval(`for (let i = 0; i < 10; i++) document.querySelector('[data-act="react"][data-arg="clown"]').click(); return 1;`);
  await sleep(1200);
  g = await state(code);
  const clowns = Object.values(g.reactions || {}).filter(r => r.kind === 'clown').length;
  check('Réactions : 10 clics en rafale -> 1 seule réaction', clowns === 1, `${clowns} clown(s)`);
  // --- fenetre de 10 s : 6 reactions au plus ; la 5e declenche le commentaire du presentateur
  for (let i = 0; i < 8; i++) { await click(A, '[data-act="react"][data-arg="crown"]'); await sleep(760); }
  await sleep(2500);
  g = await state(code);
  const fromA = Object.values(g.reactions || {}).filter(r => r.from === idA && Date.now() - r.ts < 12000).length;
  check('Réactions : 6 au plus par fenêtre de 10 s', fromA <= 6 && fromA >= 5, `${fromA} en 10 s`);
  const burst = await until(A, `Object.values(__bq.S.game.chat||{}).find(m=>m.kind==='host'&&m.ev==='reactions')?.text`, 9000);
  check('Réactions : le présentateur commente la rafale', !!burst, burst);

  // --- enchere tendue : mise en vente par l'interface
  await setTurn(code, ib, { cash: 1500, position: 8 }, { currentAction: { type: 'buy', position: 9, playerId: idB } });
  await B.eval(`[...document.querySelectorAll('#action-panel button')].find(x=>x.textContent.includes('enchères')).click(); return 1;`);
  let a = (await until(A, `__bq.S.game.auction && __bq.S.game.auction.status==='open' && __bq.S.game.auction`, 5000)) || {};
  check('Enchère tendue : identifiant, journal et « passes » initialisés', !!a.id && Array.isArray(a.log || []) && a.by === idB, { id: a.id, by: a.by });
  // Prolongation : offre dans les 5 dernieres secondes -> +5 s.
  await rest(code, '/auction', 'PATCH', { endAt: Date.now() + 3000 });
  await sleep(700);
  const before = (await state(code)).auction.endAt;
  await until(A, `document.querySelector('#auction-x [data-act="bid-quick"]')`, 4000);
  await click(A, '#auction-x [data-act="bid-quick"]');
  await sleep(1200);
  a = (await state(code)).auction;
  check('Enchère tendue : offre dans les 5 dernières s -> +5 s', a.endAt - before === 5000 && a.highestBidder === idA && (a.log || []).length === 1, { delta: a.endAt - before, extensions: a.extensions });
  const tenseSeen = await until(A, `document.querySelector('#modal-auction .modal-card.tense, .auction-countdown.tense') ? 1 : 0`, 4000);
  check('Enchère tendue : tension visuelle sur les dernières secondes', tenseSeen === 1);
  await shot(A, 'party-lot1-auction.png');
  // « Je passe » de l'autre joueur : fin anticipee, le dernier encherisseur gagne, une seule resolution.
  await click(B, '#action-panel [data-act="bid-pass"]');
  const closed = await until(A, `__bq.S.game.auction && __bq.S.game.auction.status==='closed' && __bq.S.game.auction`, 5000);
  g = await state(code);
  const lines = Object.values(g.history || {}).filter(h => h.meta && h.meta.t === 'auction');
  check('Enchère tendue : tout le monde passe -> fin anticipée, le meneur gagne', closed && closed.early && g.ownership[9] === idA && g.players[ia].cash === 1000 + ia * 25 - a.highestBid, { early: closed && closed.early, owner: g.ownership[9] === idA });
  check('Enchère tendue : une seule résolution écrite', lines.length === 1, `${lines.length} ligne(s)`);
  const stampB = await until(B, `document.getElementById('party-stamp').classList.contains('on') && document.getElementById('party-stamp').textContent`, 3000);
  check('Enchère tendue : cachet « Adjugé » chez l’autre joueur', /Adjug/.test(stampB || ''), stampB);
  // Sans aucune offre : les deux passent -> la case reste a la banque.
  await setTurn(code, ia, { position: 9 }, { currentAction: { type: 'buy', position: 10, playerId: idA } });
  await A.eval(`[...document.querySelectorAll('#action-panel button')].find(x=>x.textContent.includes('enchères')).click(); return 1;`);
  await until(A, `__bq.S.game.auction && __bq.S.game.auction.status==='open'`, 4000);
  await A.eval(`await __bq.PA.passAuction(); return 1;`);
  await B.eval(`await __bq.PA.passAuction(); return 1;`);
  const none = await until(A, `__bq.S.game.auction && __bq.S.game.auction.status==='closed' && __bq.S.game.auction`, 5000);
  g = await state(code);
  check('Enchère tendue : personne ne mise, tout le monde passe -> case à la banque', none && !g.ownership[10], { status: none && none.status });
  await shot(A, 'party-lot1.png');
  return [A, B];
}

// ---------------------------------------------------------------- lot 2 : mini-jeux + duel
// Lance un mini-jeu choisi (index dans EVENT_GAMES) depuis la page de l'hote, comme la case EVENT.
const GAMES = ['reflex', 'mash', 'math', 'city', 'memory', 'trap', 'blind'];
const startMg = (page, kind, extra = [0.3, 0.6, 0.2, 0.8, 0.4, 0.5]) => page.eval(`
  const v = [${(GAMES.indexOf(kind) + 0.5) / GAMES.length}, ...${JSON.stringify(extra)}]; let i = 0;
  await __bq.PA.startEventMinigame(__bq.S.game, () => v[i++ % v.length]); return __bq.S.game.minigame && __bq.S.game.minigame.id;`);
const mgPhase = (page, phase, ms = 6000) => until(page, `(() => { const ov=document.getElementById('mg-overlay'); return !ov.hidden && (${phase === 'play' ? "document.querySelector('#mg-body .mg-pad, #mg-body .mg-choice, #mg-body .mg-bait, #mg-body .mg-q, #mg-body .mg-seq')" : phase === 'result' ? "ov.classList.contains('mg-result')" : "document.getElementById('mg-count')"}) ? 1 : 0; })()`, ms);
const mgResolved = (code, ms = 15000) => (async () => { const end = Date.now() + ms; while (Date.now() < end) { const m = await rest(code, '/minigame'); if (m && m.status === 'resolved') return m; await sleep(400); } return null; })();
const cashOf = (g, i) => g.players[i].cash;

async function lot2(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB, pageOf } = await duo(A, B, { preset: 'custom', picks: ['eventMinigames', 'duel'] });
  // --- vraie case EVENT : de = 3 depuis la case 21 -> Event (24) -> mini-jeu reflexe
  // B lance (pas l'hote) : chez l'hote, le presentateur tire aussi Math.random et fausserait le trucage.
  await setTurn(code, ib, { position: 21 });
  // de 3, puis des valeurs qui menent toutes au meme resultat (mini-jeu, reflexe), quel que soit l'ordre des tirages.
  await rig(B, [0.4, ...Array(40).fill(0.05)]);        // l'animation du de tire aussi Math.random
  await B.eval(`window.rollDice(); return 1;`);
  const introA = await mgPhase(A, 'intro'), introB = await mgPhase(B, 'intro');
  if (want('--debug')) { const d = await state(code); console.log('DEBUG', d.turnIndex, ia, d.players.map(p => p.name + '@' + p.position).join(' '), JSON.stringify(d.currentAction), Object.values(d.history || {}).sort((x, y) => x.ts - y.ts).slice(-3).map(h => h.text).join(' / '));
    for (const P of [A, B]) console.log('OV', await P.eval(`const o=document.getElementById('mg-overlay'); return [o.hidden, o.className, o.innerText.slice(0,60).split(String.fromCharCode(10)).join(' '), typeof __bq.S.game.minigame, __bq.S.game.phase].join(' | ');`), P.errors()); }
  check('EVENT -> mini-jeu ouvert chez les deux joueurs (annonce + compte à rebours)', introA && introB);
  let mg = await rest(code, '/minigame');
  check('Mini-jeu : état partagé (id, réflexe, participants, départ commun)', mg && mg.kind === 'reflex' && mg.participants.length === 2 && mg.status === 'active' && mg.startAt > 0, mg && { kind: mg.kind, status: mg.status });
  await shot(B, 'party-lot2-intro.png');
  // A attend le vert et clique ; B clique trop tot.
  await until(B, `document.querySelector('#mg-body .mg-pad') ? 1 : 0`, 6000);
  await B.eval(`document.getElementById('mg-pad').click(); return 1;`);
  await until(A, `document.querySelector('#mg-pad.mg-pad--go') ? 1 : 0`, 8000);
  await A.eval(`document.getElementById('mg-pad').click(); return 1;`);
  mg = await mgResolved(code);
  await sleep(1200);                                     // la ligne d'historique suit l'ecriture du resultat
  let g = await state(code);
  const starts = Object.values(g.history || {}).filter(h => h.meta && h.meta.t === 'minigame').length;
  check('Réflexe : B clique trop tôt et paie 100 $ à A ; une seule résolution', mg && mg.result.loserId === idB && cashOf(g, ib) === 1000 + ib * 25 - 100 && cashOf(g, ia) === 1000 + ia * 25 + 100 && starts === 1,
    { loser: mg && mg.result.loserId === idB, lignes: starts });
  const rowsA = await (async () => { await mgPhase(A, 'result', 4000); return A.eval(`return [...document.querySelectorAll('.mg-rows li')].map(l=>l.querySelector('.mg-name').textContent + ':' + l.querySelector('b').textContent).join('|');`); })();
  const rowsB = await (async () => { await mgPhase(B, 'result', 4000); return B.eval(`return [...document.querySelectorAll('.mg-rows li')].map(l=>l.querySelector('.mg-name').textContent + ':' + l.querySelector('b').textContent).join('|');`); })();
  check('Mini-jeu : les deux joueurs voient le même résultat', rowsA && rowsA === rowsB, rowsA);
  await shot(A, 'party-lot2-result.png');
  check('Mini-jeu EVENT : le tour se termine après le résultat', g.turnIndex !== ib && !g.currentAction, { turn: g.turnIndex, action: g.currentAction });
  const closes = await until(A, `document.getElementById('mg-overlay').hidden ? 1 : 0`, 8000);
  check('Mini-jeu : la fenêtre se ferme seule (retour au jeu)', closes === 1);

  // --- expiration : personne ne repond au calcul -> resolu par l'hote, personne ne paie
  await setTurn(code, ia, {});
  const before = await state(code);
  await startMg(A, 'math');
  mg = await mgResolved(code, 16000);
  g = await state(code);
  check('Expiration : personne ne répond -> résolu à la fin, personne ne paie', mg && !mg.result.loserId && cashOf(g, ia) === cashOf(before, ia) && cashOf(g, ib) === cashOf(before, ib));

  // --- le piege : le premier qui clique perd, resolution immediate
  await setTurn(code, ia, {});
  const c0 = await state(code);
  await startMg(A, 'trap');
  await mgPhase(B, 'play', 6000);
  const t0 = Date.now();
  await B.eval(`document.getElementById('mg-bait').click(); return 1;`);
  mg = await mgResolved(code, 6000);
  g = await state(code);
  check('Le piège : B clique, perd 100 $ ; résolu sans attendre la fin', mg && mg.result.loserId === idB && cashOf(g, ib) === cashOf(c0, ib) - 100 && Date.now() - t0 < 4000, { ms: Date.now() - t0 });

  // --- trouve la ville : clic sur le plateau
  await setTurn(code, ia, {});
  const c1 = await state(code);
  await startMg(A, 'city', [0.5]);
  mg = await rest(code, '/minigame');
  const target = mg.params.target;
  await mgPhase(A, 'play', 6000); await mgPhase(B, 'play', 2000);
  await A.eval(`document.querySelector('.square[data-index="${target}"]').click(); return 1;`);
  await B.eval(`document.querySelector('.square[data-index="${target === 1 ? 2 : 1}"]').click(); return 1;`);
  mg = await mgResolved(code, 8000);
  g = await state(code);
  check('Trouve la ville : la bonne case gagne, la mauvaise paie', mg && mg.result.winnerIds[0] === idA && mg.result.loserId === idB && cashOf(g, ia) === cashOf(c1, ia) + 100);

  // --- calcul eclair + mitraillette : bonne reponse / 20 clics
  await setTurn(code, ia, {});
  await startMg(A, 'math');
  mg = await rest(code, '/minigame');
  await mgPhase(A, 'play', 6000); await mgPhase(B, 'play', 2000);
  await A.eval(`document.querySelector('#mg-body .mg-choice[data-v="${mg.params.answer}"]').click(); return 1;`);
  await B.eval(`document.querySelector('#mg-body .mg-choice:not([data-v="${mg.params.answer}"])').click(); return 1;`);
  mg = await mgResolved(code, 8000);
  check('Calcul éclair : bonne réponse gagne, mauvaise réponse paie', mg && mg.result.winnerIds[0] === idA && mg.result.loserId === idB);
  await setTurn(code, ia, {});
  await startMg(A, 'mash');
  await mgPhase(A, 'play', 6000); await mgPhase(B, 'play', 2000);
  await A.eval(`for (let i = 0; i < 20; i++) document.getElementById('mg-pad').click(); return 1;`);
  await B.eval(`for (let i = 0; i < 5; i++) document.getElementById('mg-pad').click(); return 1;`);
  mg = await mgResolved(code, 12000);
  check('Mitraillette : 20 clics gagnent, 5 clics paient', mg && mg.result.winnerIds[0] === idA && mg.result.loserId === idB, mg && mg.result.rows);

  // --- enchere a l'aveugle
  await setTurn(code, ia, {});
  const c2 = await state(code);
  await startMg(A, 'blind');
  await mgPhase(A, 'play', 6000); await mgPhase(B, 'play', 2000);
  await A.eval(`document.querySelector('#mg-body .mg-choice[data-v="100"]').click(); return 1;`);
  await B.eval(`document.querySelector('#mg-body .mg-choice[data-v="20"]').click(); return 1;`);
  mg = await mgResolved(code, 8000);
  g = await state(code);
  check('Enchère à l’aveugle : 100 contre 20 -> A prend le pot (+70 $), B paie 20 + 50 $', mg && cashOf(g, ia) === cashOf(c2, ia) + 20 + 50 && cashOf(g, ib) === cashOf(c2, ib) - 70, { a: cashOf(g, ia) - cashOf(c2, ia), b: cashOf(g, ib) - cashOf(c2, ib) });

  // --- duel : A arrive sur la case de B (libre), duel, puis la case est resolue (achat propose)
  await rest(code, `/players/${ib}`, 'PATCH', { position: 2 });
  await setTurn(code, ia, { position: 0 });
  const c3 = await state(code);
  await rig(A, [0.3, 0.2]);                            // de = 2 -> case 2 ; attente du reflexe
  await A.eval(`window.rollDice(); return 1;`);
  const duelUp = await until(B, `(() => { const k = document.querySelector('#mg-overlay .mg-kicker'); return k && /Duel/.test(k.textContent) ? k.textContent : null; })()`, 6000);
  check('Duel : deux pions sur la même case -> duel annoncé chez les deux', /Duel/.test(duelUp || ''), duelUp);
  await until(A, `document.querySelector('#mg-pad.mg-pad--go') ? 1 : 0`, 9000);
  await A.eval(`document.getElementById('mg-pad').click(); return 1;`);
  await until(B, `document.querySelector('#mg-pad.mg-pad--go') ? 1 : 0`, 2000);
  await sleep(250);
  await B.eval(`document.getElementById('mg-pad') && document.getElementById('mg-pad').click(); return 1;`);
  mg = await mgResolved(code, 10000);
  const buy = await until(A, `__bq.S.game.currentAction && __bq.S.game.currentAction.type === 'buy' && __bq.S.game.currentAction.position`, 8000);
  g = await state(code);
  check('Duel : le plus rapide prend 50 $', mg && mg.origin === 'duel' && mg.result.winnerIds[0] === idA && cashOf(g, ia) === cashOf(c3, ia) + 50, mg && mg.result.rows);
  check('Duel : la case est ensuite résolue normalement (achat proposé)', buy === 2, buy);
  await shot(A, 'party-lot2-duel.png');
  await A.eval(`__bq.A.leaveGame(); return 1;`); await B.eval(`__bq.A.leaveGame(); return 1;`);
  await sleep(600);

  // --- bot : il participe avec une entree simulee
  await A.eval(`document.getElementById('bot-name').value='Solo'; document.getElementById('bot-count').value='1';
    document.querySelector('[data-act="bot-game"]').click(); return 1;`);
  await until(A, `document.getElementById('s-mode').classList.contains('active')`, 4000);
  await A.eval(`document.querySelector('[data-act="mode-custom-go"]') && 1; document.querySelector('[data-act="mode-pick"][data-arg="custom"]').click();
    document.querySelector('#mode-toggles input[value="eventMinigames"]').checked = true; document.querySelector('[data-act="mode-custom-go"]').click(); return 1;`);
  const solo = await until(A, `__bq.S.game && __bq.S.game.phase === 'playing' && __bq.S.code`, 8000);
  if (solo) codes.add(solo);
  const gs = await state(solo);
  const hi = gs.players.findIndex(p => !p.bot);
  await setTurn(solo, hi, {});
  await startMg(A, 'math');
  mg = await rest(solo, '/minigame');
  await mgPhase(A, 'play', 6000);
  await A.eval(`document.querySelector('#mg-body .mg-choice[data-v="${mg.params.answer}"]').click(); return 1;`);
  mg = await mgResolved(solo, 12000);
  const botId = gs.players.find(p => p.bot).id;
  check('Bot : il envoie une entrée simulée et le mini-jeu se résout', mg && mg.entries && mg.entries[botId] && mg.status === 'resolved', mg && mg.entries);
  await A.eval(`__bq.A.leaveGame(); return 1;`);
  return [A, B];
}

// ---------------------------------------------------------------- lot 3 : testament + fantomes
async function lot3(b) {
  const [A, B] = await openPages(b);
  const code = await createVia(A, { players: '3', preset: 'custom', picks: ['testament', 'ghost'] });
  await joinVia(B, code);
  await A.eval(`document.getElementById('add-bot-btn').click(); return 1;`);
  await sleep(1500);
  await startVia(A);
  await sleep(1000);
  let g = await state(code);
  const ia = g.players.findIndex(p => p.name === 'Alice'), ib = g.players.findIndex(p => p.name === 'Bob'), ic = g.players.findIndex(p => p.bot);
  const idA = g.players[ia].id, idB = g.players[ib].id, idC = g.players[ic].id;
  // Le tour reste a l'hote pendant les tests : le bot ne joue pas dans notre dos.
  await rest(code, '', 'PATCH', { turnIndex: ia, turnDeadline: Date.now() + 600000 });

  // --- 1. B fait faillite avec 2 villes (dont une batie) et ne choisit pas -> la banque au bout de 10 s
  await rest(code, '', 'PATCH', { ownership: { 1: idB, 2: idB }, buildings: { 1: 1 } });
  await rest(code, `/players/${ib}`, 'PATCH', { cash: -700 });
  const winB = await until(B, `document.querySelector('#will-overlay .will-heir') ? 1 : 0`, 6000);
  const winA = await until(A, `(() => { const o=document.getElementById('will-overlay'); return !o.hidden && /rédige/.test(o.textContent) ? 1 : 0; })()`, 3000);
  g = await state(code);
  check('Testament : faillite -> fenêtre de choix chez le joueur, attente chez les autres', winB && winA && g.will && g.will.status === 'choose' && g.players[ib].bankrupt === true, g.will && g.will.status);
  check('Testament : le joueur en faillite devient fantôme', g.players[ib].ghost === true);
  await shot(B, 'party-lot3-will.png');
  const tw = Date.now();
  let w = null;
  while (Date.now() - tw < 16000) { w = await rest(code, '/will'); if (w && w.status === 'resolved') break; await sleep(500); }
  g = await state(code);
  check('Testament : pas de choix en 10 s -> tout revient à la banque', w && w.status === 'resolved' && w.heir === 'bank' && !g.ownership?.[1] && !g.ownership?.[2] && !(g.buildings || {})[1], { heir: w && w.heir });
  const stampA = await until(A, `document.getElementById('party-stamp').classList.contains('on') && document.getElementById('party-stamp').textContent`, 3000);
  check('Testament : résultat annoncé à tous (cachet)', /banque/i.test(stampA || ''), stampA);

  // --- 2. B fantome hante une case par l'interface
  await until(B, `!document.getElementById('ghost-dock').hidden ? 1 : 0`, 4000);
  await click(B, '#ghost-dock [data-act="haunt"]');
  await B.eval(`document.querySelector('.square[data-index="4"]').click(); return 1;`);
  await sleep(1300);
  g = await state(code);
  check('Fantôme : la case choisie est hantée, pouvoir consommé', g.haunts && g.haunts[4] && g.haunts[4].by === idB && g.players[ib].hauntRound === (g.round || 1), g.haunts);
  const seenGhostA = await until(A, `document.querySelector('.square[data-index="4"]').classList.contains('haunted') ? 1 : 0`, 3000);
  check('Fantôme : la case hantée est visible chez les autres', seenGhostA === 1);
  await B.eval(`await __bq.PA.hauntSquare(5); return 1;`);
  await sleep(900);
  g = await state(code);
  check('Fantôme : une seule case par manche', !g.haunts[5] && g.haunts[4]);
  // A arrive sur la case hantee : -50 $, puis la case est resolue normalement (achat).
  await setTurn(code, ia, { position: 1 });
  const cashA = (await state(code)).players[ia].cash;
  await rig(A, Array(60).fill(0.4));                     // de = 3 : 1 -> 4
  await A.eval(`window.rollDice(); return 1;`);
  const buy = await until(A, `__bq.S.game.currentAction && __bq.S.game.currentAction.type === 'buy' && __bq.S.game.currentAction.position`, 8000);
  g = await state(code);
  check('Fantôme : tomber sur la case hantée coûte 50 $, la case est libérée', g.players[ia].cash === cashA - 50 && !(g.haunts || {})[4], { avant: cashA, apres: g.players[ia].cash });
  check('Fantôme : la case est ensuite résolue (achat proposé)', buy === 4, buy);

  // --- 3. A fait faillite et choisit le bot : proprietes et batiments transmis ; fin de partie apres le testament
  await rest(code, '', 'PATCH', { currentAction: null, ownership: { 3: idA, 5: idA, 6: idA }, buildings: { 5: 2 } });
  await rest(code, `/players/${ia}`, 'PATCH', { cash: -800 });
  await until(A, `document.querySelector('#will-overlay .will-heir') ? 1 : 0`, 6000);
  const heirs = await A.eval(`return [...document.querySelectorAll('#will-overlay .will-heir')].map(b => b.dataset.arg).join(',');`);
  check('Testament : les héritiers proposés sont les joueurs en lice + la banque', heirs.split(',').sort().join() === [idC, 'bank'].sort().join(), heirs);
  await click(A, `#will-overlay .will-heir[data-arg="${idC}"]`);
  const t3 = Date.now();
  while (Date.now() - t3 < 8000) { w = await rest(code, '/will'); if (w && w.status === 'resolved') break; await sleep(400); }
  await sleep(1500);
  g = await state(code);
  check('Testament : l’héritier choisi reçoit propriétés et bâtiments', g.ownership[3] === idC && g.ownership[5] === idC && g.ownership[6] === idC && g.buildings[5] === 2, g.ownership);
  check('Testament : la fin de partie attend le testament (le bot gagne seul en lice)', g.phase === 'finished' && g.winnerId === idC, { phase: g.phase });
  return [A, B];
}

// ---------------------------------------------------------------- lot 4 : paris, money time, carapace
async function lot4(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB } = await duo(A, B, { preset: 'custom', picks: ['betting', 'moneyTime', 'blueShell'] });
  // --- paris : tour d'Alice, Bob parie par l'interface
  await setTurn(code, ia, { position: 15 });
  const barB = await until(B, `!document.getElementById('bet-bar').hidden && document.querySelector('#bet-bar [data-act="bet"]') ? 1 : 0`, 6000);
  const barA = await A.eval(`return document.getElementById('bet-bar').hidden;`);
  check('Paris : la barre s’ouvre chez les autres, pas chez le lanceur', barB === 1 && barA === true);
  await click(B, '#bet-bar [data-act="bet-stake"][data-arg="50"]');
  await sleep(200);
  await click(B, '#bet-bar [data-act="bet"][data-arg="six"]');
  await sleep(1200);
  let g = await state(code);
  check('Paris : pari enregistré (Un 6, 50 $), aucun argent prélevé', g.bets.entries && g.bets.entries[idB] && g.bets.entries[idB].kind === 'six' && g.bets.entries[idB].amt === 50 && g.players[ib].cash === 1000 + ib * 25, g.bets.entries);
  const second = await B.eval(`return await __bq.PA.placeBet('rent', 20);`);
  const own = await A.eval(`return await __bq.PA.placeBet('rent', 20);`);
  check('Paris : un seul pari par lancer ; pas de pari sur son propre lancer', second === false && own === false);
  await shot(B, 'party-lot4-bet.png');
  // Alice fait 6 (15 -> 21, le Depart : rien a resoudre) -> pari gagne x5.
  const cashB = (await state(code)).players[ib].cash;
  await rig(A, Array(80).fill(0.9));
  await A.eval(`window.rollDice(); return 1;`);
  let bets = null;
  const tb = Date.now();
  while (Date.now() - tb < 10000) { bets = await rest(code, '/bets'); if (bets && (bets.status === 'resolved' || (bets.status === 'open' && bets.key !== g.bets.key))) break; await sleep(400); }
  g = await state(code);
  const settled = Object.values(g.history || {}).find(h => h.meta && h.meta.t === 'bets');
  check('Paris : le 6 tombe -> +200 $ pour Bob (×5), réglé une fois', g.players[ib].cash === cashB + 200 && settled && /Bob \+200/.test(settled.text), settled && settled.text);
  const stamp = await until(B, `document.getElementById('party-stamp').classList.contains('on') && document.getElementById('party-stamp').textContent`, 3000);
  check('Paris : le parieur voit son gain', /\+200/.test(stamp || ''), stamp);
  // Fenetre garantie : Alice ne peut pas lancer tant que Bob n'a ni parie ni passe.
  await setTurn(code, ia, { position: 15 });
  await until(B, `document.querySelector('#bet-bar [data-act="bet-skip"]') ? 1 : 0`, 6000);
  const holdBtn = await until(A, `(() => { const b = document.querySelector('.btn-roll'); return b && b.disabled && /parient/.test(b.textContent) ? b.textContent : null; })()`, 3000);
  const r0 = (await state(code)).lastRoll;
  await A.eval(`window.rollDice(); return 1;`);
  await sleep(900);
  const r1 = (await state(code)).lastRoll;
  check('Paris : le lanceur attend que les autres aient pu parier (bouton bloqué, dé refusé)', !!holdBtn && JSON.stringify(r0) === JSON.stringify(r1), holdBtn);
  await click(B, '#bet-bar [data-act="bet-skip"]');
  const freed = await until(A, `(() => { const b = document.querySelector('.btn-roll'); return b && !b.disabled ? 1 : 0; })()`, 3000);
  const skipNote = await B.eval(`return document.getElementById('bet-bar').textContent;`);
  check('Paris : « Pas de pari » libère le lanceur aussitôt', freed === 1 && /Pas de pari/.test(skipNote), skipNote.trim().slice(0, 60));

  // Tour sans lancer (prison) : paris annules.
  await setTurn(code, ia, { position: 7, inJail: true, jailTurns: 2 });
  await until(B, `document.querySelector('#bet-bar [data-act="bet"]') ? 1 : 0`, 6000);
  await click(B, '#bet-bar [data-act="bet"][data-arg="rent"]');
  await sleep(900);
  const cashB2 = (await state(code)).players[ib].cash;
  await A.eval(`await __bq.A.serveJailTurn(); return 1;`);
  await sleep(2500);
  g = await state(code);
  check('Paris : tour sans lancer -> paris annulés, personne ne paie', g.players[ib].cash === cashB2 && g.bets.roller === idB, { roller: g.bets.roller === idB });

  // --- money time : manche 28/30 -> active une fois, bandeau, loyers doubles
  await rest(code, '', 'PATCH', { round: 28 });
  const mt = await (async () => { const e = Date.now() + 6000; while (Date.now() < e) { const m = await rest(code, '/moneyTime'); if (m) return m; await sleep(400); } return null; })();
  check('Money Time : déclenché aux 3 dernières manches', mt && mt.active && mt.reason === 'rounds', mt);
  const ban = await until(B, `!document.getElementById('money-banner').hidden && document.getElementById('money-banner').textContent`, 4000);
  check('Money Time : bandeau visible chez tous (loyers ×2, manches restantes)', /MONEY TIME/.test(ban || '') && /×2/.test(ban || '') && /plus que 3/.test(ban || ''), ban);
  await shot(B, 'party-lot4-moneytime.png');
  // Bob tombe sur Jakarta (a Alice) : loyer nu 17 $ -> 34 $.
  await rest(code, '', 'PATCH', { ownership: { 1: idA } });
  await setTurn(code, ib, { position: 0, inJail: false });
  await skipBets(code);
  const before = await state(code);
  await rig(B, Array(80).fill(0.1));                      // de = 1 : 0 -> 1
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  g = await state(code);
  check('Money Time : loyer doublé (17 -> 34 $)', g.players[ib].cash === before.players[ib].cash - 34 && g.players[ia].cash === before.players[ia].cash + 34, { paye: before.players[ib].cash - g.players[ib].cash });
  check('Money Time : une seule activation', (await rest(code, '/moneyTime')).at === mt.at);

  // --- carapace : Bob (en retard) tombe sur Chance -> controle fiscal sur Alice (en tete)
  await rest(code, `/players/${ia}`, 'PATCH', { cash: 2000 });
  await setTurn(code, ib, { position: 27, cash: 300 });
  await skipBets(code);
  const cashA = (await state(code)).players[ia].cash;
  await rig(B, Array(80).fill(0.05));                     // de 1 -> Chance ; carapace ; controle fiscal
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  g = await state(code);
  const audit = Object.values(g.history || {}).find(h => h.meta && h.meta.key === 'audit');
  check('Carapace : contrôle fiscal tiré par le joueur en retard, le leader perd 15 %', audit && g.players[ia].cash === cashA - Math.round(cashA * 0.15), audit && audit.text);
  return [A, B];
}

// ---------------------------------------------------------------- lot 5 : bulle / krach + pacte
async function lot5(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB } = await duo(A, B, { preset: 'custom', picks: ['marketCrash', 'hostDeals'] });
  // L'hote peut proposer un pacte au hasard en debut de tour : il bloque le de tant qu'on n'a
  // pas repondu (c'est le jeu). Dans la partie « bulle », Bob refuse ce pacte avant de lancer.
  const noDeal = async () => { await B.eval(`if (__bq.S.game.deal && __bq.S.game.deal.status === 'offer') await __bq.PA.answerDeal(false); return 1;`); await sleep(500); };
  // --- bulle : Bob tombe sur EVENT (21 -> 24), tirage -> bulle sur le premier groupe (rose)
  await setTurn(code, ib, { position: 21 });
  await noDeal();
  await rig(B, [0.4, ...Array(60).fill(0.05)]);
  await B.eval(`window.rollDice(); return 1;`);
  const mk = await (async () => { const e = Date.now() + 7000; while (Date.now() < e) { const m = await rest(code, '/market'); if (m) return m; await sleep(400); } return null; })();
  check('Bulle : déclenchée par la case EVENT (groupe, 2 manches)', mk && mk.kind === 'bubble' && mk.group === 'Pink' && mk.until === mk.from + 1, mk);
  const marked = await until(A, `document.querySelectorAll('.square.mk-bubble').length`, 4000);
  check('Bulle : les cases du groupe changent d’aspect chez tous', marked === 2, `${marked} case(s)`);
  await shot(A, 'party-lot5-market.png');
  // Loyer de Jakarta (17 $, rose) a Alice : 34 $ pendant la bulle.
  await rest(code, '', 'PATCH', { ownership: { 1: idA } });
  await setTurn(code, ib, { position: 0 });
  await noDeal();
  const before = await state(code);
  await rig(B, Array(80).fill(0.1));
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  let g = await state(code);
  check('Bulle : le moteur applique ×2 au loyer (17 -> 34 $)', before.players[ib].cash - g.players[ib].cash === 34, { paye: before.players[ib].cash - g.players[ib].cash });
  // Expiration : manche suivante + 1 -> le marche disparait.
  await rest(code, '', 'PATCH', { round: mk.until + 1 });
  const gone = await (async () => { const e = Date.now() + 6000; while (Date.now() < e) { const m = await rest(code, '/market'); if (!m) return true; await sleep(400); } return false; })();
  const unmarked = await until(A, `document.querySelectorAll('.square.mk-bubble').length === 0 ? 1 : 0`, 4000);
  g = await state(code);
  check('Bulle : expirée après 2 manches (état, cases, journal)', gone && unmarked === 1 && Object.values(g.history || {}).some(h => h.meta && h.meta.t === 'market-end'));

  // --- pacte accepte et tenu : « Fais un 6 », Bob fait 6 -> +200 $ (de 8 a 14 : la case Auction, sans bonus du Depart)
  await setTurn(code, ib, { position: 8 });
  await A.eval(`__bq.PA.offerDeal(__bq.S.game, 'six'); return 1;`);
  const offerB = await until(B, `document.querySelector('#deal-overlay [data-act="deal"]') ? 1 : 0`, 5000);
  const offerA = await until(A, `(() => { const o=document.getElementById('deal-overlay'); return !o.hidden && /réfléchit/.test(o.textContent) ? 1 : 0; })()`, 3000);
  check('Pacte : proposé au joueur (boutons), annoncé aux autres', offerB === 1 && offerA === 1);
  await shot(B, 'party-lot5-deal.png');
  // Pendant l'offre, le de est bloque.
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(800);
  check('Pacte : impossible de lancer avant d’avoir répondu', (await state(code)).players[ib].position === 8);
  await click(B, '#deal-overlay [data-act="deal"][data-arg="yes"]');
  await sleep(900);
  check('Pacte : acceptation enregistrée', (await rest(code, '/deal')).status === 'accepted');
  const c1 = (await state(code)).players[ib].cash;
  await rig(B, Array(80).fill(0.9));                       // de 6 : 8 -> 14
  await B.eval(`window.rollDice(); return 1;`);
  let d = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 9000) { d = await rest(code, '/deal'); if (d && d.status === 'resolved') break; await sleep(400); }
  await sleep(1200);                                        // la ligne d'historique suit le reglement
  g = await state(code);
  check('Pacte tenu : un 6 -> +200 $, résolu une fois en fin de tour', d && d.success === true && g.players[ib].cash === c1 + 200 && Object.values(g.history || {}).filter(h => h.meta && h.meta.t === 'deal').length === 1, d);
  // --- pacte accepte et perdu : un 2 -> -100 $
  await setTurn(code, ib, { position: 15 });
  await A.eval(`__bq.PA.offerDeal(__bq.S.game, 'six'); return 1;`);
  await until(B, `document.querySelector('#deal-overlay [data-act="deal"]') ? 1 : 0`, 5000);
  await click(B, '#deal-overlay [data-act="deal"][data-arg="yes"]');
  await sleep(900);
  const c2 = (await state(code)).players[ib].cash;
  await rig(B, Array(80).fill(0.3));                       // de 2 : 15 -> 17 (Riyadh, libre -> achat)
  await B.eval(`window.rollDice(); return 1;`);
  await until(B, `__bq.S.game.currentAction && __bq.S.game.currentAction.type === 'buy' ? 1 : 0`, 6000);
  await B.eval(`__bq.A.startAuction(); return 1;`);          // tour qui se termine apres une enchere
  await rest(code, '/auction', 'PATCH', { endAt: Date.now() - 1000 });
  const t2 = Date.now();
  while (Date.now() - t2 < 9000) { d = await rest(code, '/deal'); if (d && d.status === 'resolved') break; await sleep(400); }
  g = await state(code);
  check('Pacte perdu : un 2 -> −100 $ (réglé après la fin du tour)', d && d.success === false && g.players[ib].cash === c2 - 100, d);
  // --- refus
  await setTurn(code, ib, { position: 15 });
  await A.eval(`__bq.PA.offerDeal(__bq.S.game, 'even'); return 1;`);
  await until(B, `document.querySelector('#deal-overlay [data-act="deal"]') ? 1 : 0`, 5000);
  await click(B, '#deal-overlay [data-act="deal"][data-arg="no"]');
  await sleep(900);
  check('Pacte : refus enregistré, la fenêtre se ferme', (await rest(code, '/deal')).status === 'refused' && (await B.eval(`return document.getElementById('deal-overlay').hidden;`)) === true);
  // --- expiration : pas de reponse en 12 s -> refus
  await setTurn(code, ib, { position: 15 });
  await A.eval(`__bq.PA.offerDeal(__bq.S.game, 'high'); return 1;`);
  const t3 = Date.now();
  while (Date.now() - t3 < 18000) { d = await rest(code, '/deal'); if (d && d.status !== 'offer') break; await sleep(500); }
  check('Pacte : silence pendant 12 s -> refus automatique', d && d.status === 'refused' && d.timeout === true, d && d.status);
  return [A, B];
}

// ---------------------------------------------------------------- lot 6 : primes, recap, carnet, revanche
async function lot6(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB } = await duo(A, B, { preset: 'custom', picks: ['secretBonuses'] });
  const begin = await (async () => { const e = Date.now() + 5000; while (Date.now() < e) { const g = await state(code); const h = Object.values(g.history || {}).find(x => x.meta && x.meta.t === 'bonus-announce'); if (h) return h.text; await sleep(400); } return null; })();
  check('Primes secrètes : catégories annoncées au lancement, sans gagnant', /Roi du loyer/.test(begin || '') && /Accro/.test(begin || ''), begin);
  // Une partie jouee (historique reel ecrit comme le moteur l'ecrit) : Bob encaisse le plus gros loyer et visite le plus Chance.
  const H = meta => rest(code, '/history', 'POST', { ts: Date.now(), text: 'test', meta });
  await H({ t: 'rent', p: idA, o: idB, amt: 240 });
  await H({ t: 'rent', p: idB, o: idA, amt: 60 });
  await H({ t: 'chance', p: idB, key: 'crypto' });
  await H({ t: 'chance', p: idB, key: 'scooter' });
  await rest(code, '', 'PATCH', { trail: { 1: { [idA]: 1000, [idB]: 1025 }, 2: { [idA]: 1600, [idB]: 1400 }, 3: { [idA]: 2400, [idB]: 2600 } } });
  // Alice atteint l'objectif (3 000 $) avec 3 050 $ ; Bob a 2 900 $ + 2 primes (600 $) -> Bob gagne.
  await rest(code, `/players/${ib}`, 'PATCH', { cash: 2900 });
  await rest(code, `/players/${ia}`, 'PATCH', { cash: 3050 });
  const fin = await (async () => { const e = Date.now() + 8000; while (Date.now() < e) { const g = await state(code); if (g.phase === 'finished') return g; await sleep(400); } return null; })();
  check('Primes secrètes : révélées à la fin (+300 $ chacune)', fin && Array.isArray(fin.bonuses) && fin.bonuses.find(x => x.key === 'rentKing').winners.includes(idB) && fin.players[ib].cash === 3500, fin && fin.bonuses);
  check('Primes secrètes : elles renversent la victoire (Bob gagne malgré l’objectif atteint par Alice)', fin && fin.winnerId === idB, fin && fin.winnerId);
  const recapA = await until(A, `document.getElementById('victory').classList.contains('active') && document.querySelectorAll('#victory-recap .rc-bonus').length`, 6000);
  const recapB = await until(B, `document.getElementById('victory').classList.contains('active') && document.querySelectorAll('#victory-recap .rc-bonus').length`, 6000);
  check('Récap : les 3 primes révélées chez les deux joueurs', recapA === 3 && recapB === 3, `${recapA} / ${recapB}`);
  const parts = await A.eval(`const r=document.getElementById('victory-recap'); return { podium: r.querySelectorAll('.rc-step:not(.rc-step--empty)').length, curve: r.querySelectorAll('.rc-svg polyline').length, titles: r.querySelectorAll('.rc-title').length, facts: r.querySelector('.rc-facts')?.textContent.trim(), carnet: r.querySelector('.rc-carnet')?.textContent };`);
  check('Récap : podium, courbe des fortunes, titres, faits marquants', parts.podium === 2 && parts.curve === 2 && parts.titles >= 1 && /changement/.test(parts.facts || ''), parts);
  check('Carnet local : la partie est comptée sur l’appareil', /1 partie/.test(parts.carnet || ''), parts.carnet);
  const textA = await A.eval(`return [...document.querySelectorAll('#victory-recap .rc-bonus b')].map(x=>x.textContent).join('|');`);
  const textB = await B.eval(`return [...document.querySelectorAll('#victory-recap .rc-bonus b')].map(x=>x.textContent).join('|');`);
  check('Récap : le même résultat chez tout le monde', textA === textB, textA);
  await shot(A, 'party-lot6-recap.png');
  // Revanche : relancee aussitot, meme configuration, noeuds temporaires effaces.
  await click(A, '#victory-restart');
  const again = await until(A, `__bq.S.game.phase === 'playing' && !document.getElementById('victory').classList.contains('active') ? 1 : 0`, 8000);
  await sleep(1200);
  const g2 = await state(code);
  check('Revanche : nouvelle partie lancée, même configuration, primes et trace remises à zéro', again === 1 && g2.gameConfig.secretBonuses === true && !g2.bonuses && g2.players.every(p => !p.bankrupt && p.cash >= 1000 && p.cash <= 1025), { phase: g2.phase, bonuses: g2.bonuses });
  const backB = await until(B, `__bq.S.game.phase === 'playing' && !document.getElementById('victory').classList.contains('active') ? 1 : 0`, 6000);
  check('Revanche : l’autre joueur repart aussi', backB === 1);
  return [A, B];
}

// ---------------------------------------------------------------- lot 7 : le mode Classique reste Banqueroll
// On provoque chaque situation qui declencherait une mecanique, et on verifie qu'il ne se passe rien de nouveau.
async function lot7(b) {
  const [A, B] = await openPages(b);
  const { code, ia, ib, idA, idB } = await duo(A, B, { preset: 'classic' });
  // Reactions : pas de barre, et l'API refuse.
  const dock = await A.eval(`return document.getElementById('react-dock').hidden;`);
  const sent = await A.eval(`return await __bq.PA.sendReaction('tomato', ${JSON.stringify(idB)});`);
  check('Classique : pas de réactions (barre masquée, envoi refusé)', dock === true && sent === false && !(await rest(code, '/reactions')));
  // Paris : aucune fenetre ne s'ouvre au debut d'un tour.
  await setTurn(code, ib, { position: 21 });
  await sleep(1500);
  check('Classique : pas de paris (aucun nœud, barre masquée)', !(await rest(code, '/bets')) && (await B.eval(`return document.getElementById('bet-bar').hidden;`)) === true);
  // Case EVENT : l'evenement d'argent d'origine, jamais un mini-jeu ni une bulle.
  await rig(B, [0.4, ...Array(60).fill(0.05)]);
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  let g = await state(code);
  check('Classique : case EVENT = gain/perte d’argent, pas de mini-jeu ni de bulle', !g.minigame && !g.market && Object.values(g.history || {}).some(h => h.meta && h.meta.t === 'event'));
  // Duel : deux pions sur la meme case, rien.
  await rest(code, `/players/${ia}`, 'PATCH', { position: 2 });
  await setTurn(code, ib, { position: 0 });
  await rig(B, Array(60).fill(0.3));                       // de 2 : 0 -> 2, la case d'Alice
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3000);
  g = await state(code);
  check('Classique : pas de duel (la case est résolue directement)', !g.minigame && g.currentAction && g.currentAction.type === 'buy', g.currentAction);
  // Encheres : le systeme d'origine (pas de journal, pas de « Je passe »).
  await B.eval(`__bq.A.startAuction(); return 1;`);
  await sleep(1200);
  g = await state(code);
  const pass = await A.eval(`return !!document.querySelector('[data-act="bid-pass"]');`);
  check('Classique : enchère d’origine (ni journal, ni prolongation, ni « Je passe »)', g.auction && !g.auction.id && !g.auction.log && pass === false);
  await rest(code, '/auction', 'PATCH', { endAt: Date.now() - 1000 });
  await sleep(3000);
  // Money Time : manche 28/30, rien ; loyer normal.
  await rest(code, '', 'PATCH', { round: 28, ownership: { 1: idA } });
  await setTurn(code, ib, { position: 0, cash: 900 });
  await sleep(2000);
  await rig(B, Array(60).fill(0.1));
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  g = await state(code);
  check('Classique : pas de Money Time, loyer normal (17 $)', !g.moneyTime && g.players[ib].cash === 900 - 17, g.players[ib].cash);
  // Carapace : Bob en retard tombe sur Chance avec des tirages bas -> jamais un controle fiscal.
  await rest(code, `/players/${ia}`, 'PATCH', { cash: 2000 });
  await setTurn(code, ib, { position: 27 });
  await rig(B, Array(80).fill(0.05));
  await B.eval(`window.rollDice(); return 1;`);
  await sleep(3500);
  g = await state(code);
  check('Classique : pas de carapace du leader', !Object.values(g.history || {}).some(h => h.meta && (h.meta.key === 'audit' || h.meta.key === 'squat')));
  check('Classique : aucun pacte proposé', !(await rest(code, '/deal')));
  // Faillite : biens a la banque tout de suite, pas de testament, pas de fantome ; fin sans primes.
  await rest(code, '', 'PATCH', { currentAction: null, event: null, ownership: { 3: idB, 5: idB } });
  await rest(code, `/players/${ib}`, 'PATCH', { cash: -900 });
  await sleep(3500);
  g = await state(code);
  check('Classique : faillite d’origine (pas de testament, pas de fantôme)', !g.will && g.players[ib].bankrupt && !g.players[ib].ghost && !g.ownership?.[3]);
  check('Classique : fin de partie sans primes secrètes', g.phase === 'finished' && !g.bonuses);
  const bonusCards = await A.eval(`return document.querySelectorAll('#victory-recap .rc-bonus').length;`);
  check('Classique : récapitulatif sans primes, mais avec podium', bonusCards === 0 && (await A.eval(`return document.querySelectorAll('#victory-recap .rc-step').length;`)) === 3);
  return [A, B];
}

// ---------------------------------------------------------------- orchestration
const LOT_FNS = { 0: lot0, 1: lot1, 2: lot2, 3: lot3, 4: lot4, 5: lot5, 6: lot6, 7: lot7 };

(async () => {
  const b = await Browser.launch({ headless: !want('--headed') });
  const pages = [];
  try {
    for (const [n, fn] of Object.entries(LOT_FNS)) {
      if (LOTS && !LOTS.includes(Number(n))) continue;
      console.log(`\n--- lot ${n}`);
      pages.push(...await fn(b));
    }
    const errs = pages.flatMap(p => p.errors());
    check('Console sans erreur ni avertissement', errs.length === 0, errs.join(' || ') || 'aucune');
  } catch (e) {
    check('Exécution sans exception', false, e.message);
  } finally {
    for (const c of codes) await rest(c, '', 'DELETE').catch(() => {});
    await b.close();
  }
  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== PARTY (navigateur) : ${passed}/${results.length} =====`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
})();
