// Tests navigateur de bout en bout : Chrome reel, Firebase reel, deux joueurs.
//
//   python -m http.server 4173            # depuis la racine du depot
//   node tools/test-browser.js            # gameplay + Chance + presentateur + IA + responsive
//   node tools/test-browser.js --shots    # + captures dans tools/shots/
//   node tools/test-browser.js --no-gsap  # repli quand le CDN GSAP est coupe
//   node tools/test-browser.js --preview  # fenetre visible avec une partie de demo
//
// Les parties de test sont creees puis SUPPRIMEES de Firebase a la fin.
// L'IA est testee contre tools/ai-mock.js (le vrai Worker, amont simule) :
// aucune cle, aucun appel externe. Les assertions interrogent le DOM.
//
// Hasard : pour rendre un scenario deterministe, on remplace Math.random dans la
// page du joueur concerne. C'est exactement le seul tirage du jeu (un client,
// une fois) : les autres clients ne tirent rien et doivent afficher la meme chose.

const path = require('path');
const { spawn } = require('child_process');
const { Browser, sleep } = require('./cdp');

// ?ai=off : l'IA reelle est coupee pendant la suite (resultats reproductibles, quota
// gratuit preserve). La suite IA pointe ensuite vers tools/ai-mock.js.
const URL = process.env.BQ_URL || 'http://localhost:4173/banqueroll.html?ai=off';
const DB = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app/banqueroll/';
const AI = 'http://localhost:8787';
const SHOTS = path.join(__dirname, 'shots');
const args = process.argv.slice(2);
const want = f => args.includes(f);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail !== '' ? ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

// ---------------------------------------------------------------- utilitaires
const rest = (code, sub, method = 'GET', body) =>
  fetch(`${DB}${code}${sub}.json`, { method, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());
const state = code => rest(code, '');

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
  await page.send('Page.bringToFront');
  await sleep(250);
  await page.screenshot(path.join(SHOTS, name));
}

// Remplace le prochain(s) tirage(s) de Math.random dans cette page.
const rig = (page, values) => page.eval(`
  window.__rig = ${JSON.stringify(values)};
  if (!window.__realRandom) { window.__realRandom = Math.random; Math.random = () => (window.__rig && window.__rig.length ? window.__rig.shift() : window.__realRandom()); }
  return 1;`);

const click = (page, selector) => page.eval(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.click(); return true;`);
const clickText = (page, scope, text) => page.eval(`const el=[...document.querySelectorAll(${JSON.stringify(scope)})].find(x=>x.textContent.includes(${JSON.stringify(text)})); if(!el||el.disabled) return false; el.click(); return true;`);
const lastHist = page => page.eval(`return Object.values(__bq.S.game.history||{}).sort((a,b)=>a.ts-b.ts).map(h=>h.text).slice(-6);`);
const hostLines = page => page.eval(`return Object.entries(__bq.S.game.chat||{}).map(([k,v])=>({k,...v})).sort((a,b)=>a.ts-b.ts).filter(m=>m.kind==='host');`);
// Echantillonne la position affichee d'un pion : la case la plus proche, toutes les 60 ms.
const trail = pid => `
  window.__trail=[]; const el=document.querySelector('.pawn[data-player="${pid}"]');
  const sq=[...document.querySelectorAll('.square')].map(s=>{const r=s.getBoundingClientRect();return {i:+s.dataset.index,x:r.left+r.width/2,y:r.top+r.height/2};});
  clearInterval(window.__iv);
  window.__iv=setInterval(()=>{const r=el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    let best=null,d=1e9; for(const s of sq){const dd=Math.hypot(s.x-cx,s.y-cy); if(dd<d){d=dd;best=s;}}
    const last=window.__trail[window.__trail.length-1]; if(!last||last.i!==best.i) window.__trail.push({i:best.i});},60);
  return 1;`;
const say = (page, text) => page.eval(`document.getElementById('chat-input').value=${JSON.stringify(text)}; document.querySelector('#chat-form button').click(); return 1;`);

async function openPair(b) {
  const A = await b.newPage(null, 'A');
  const B = await b.newPage(null, 'B');
  await A.setViewport(1600, 900); await B.setViewport(1600, 900);
  await A.goto(URL); await B.goto(URL);
  await sleep(1500);
  return [A, B];
}

async function createGame(A, { name = 'Alice', players = '2', timer = '60' } = {}) {
  return A.eval(`
    document.getElementById('create-name').value=${JSON.stringify(name)};
    document.getElementById('create-players').value=${JSON.stringify(players)};
    document.getElementById('create-timer').value=${JSON.stringify(timer)};
    document.querySelector('[data-act="create"]').click();
    await new Promise(r=>setTimeout(r,2600));
    return document.getElementById('lobby-code').textContent.trim();`);
}

async function joinGame(B, code, name = 'Bob') {
  return B.eval(`
    document.getElementById('join-code').value=${JSON.stringify(code)};
    document.getElementById('join-name').value=${JSON.stringify(name)};
    document.querySelector('[data-act="join"]').click();
    await new Promise(r=>setTimeout(r,2600));
    return {ecran:document.querySelector('.screen.active')?.id, err:document.getElementById('join-error').textContent};`);
}

// ---------------------------------------------------------------- gameplay
async function suiteGameplay(A, B) {
  const code = await createGame(A);
  check('Création de partie (clic réel)', /^[A-Z]+-\d+/.test(code), 'code=' + code);
  const joined = await joinGame(B, code);
  check('Deuxième joueur rejoint', joined.ecran === 's-lobby' && !joined.err, joined);
  await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
  await until(A, `__bq.S.game && __bq.S.game.phase==='playing'`);
  await sleep(1200);
  let g = await state(code);
  const ia = g.players.findIndex(p => p.name === 'Alice'), ib = 1 - ia;
  const idA = g.players[ia].id, idB = g.players[ib].id;
  const pageOf = i => (i === ia ? A : B);
  check('Démarrage : ordre tiré, bonus de retard au 2e joueur', g.players[0].cash === 1000 && g.players[1].cash === 1025, g.players.map(p => p.name + ' ' + p.cash).join(', '));

  // Prepare un tour : joueur, position, argent, pas d'action en cours, delai long.
  const setTurn = async (i, patch = {}, extra = {}) => {
    await rest(code, `/players/${i}`, 'PATCH', patch);
    await rest(code, '', 'PATCH', { turnIndex: i, currentAction: null, turnRolled: null, extraRoll: null, event: null, swap: null, auction: null, turnDeadline: Date.now() + 600000, ...extra });
    await sleep(1300);
  };

  // --- lancer : une seule valeur, la meme partout
  const cur = g.turnIndex;
  await setTurn(cur, { position: 21 });
  await rig(pageOf(cur), [0.4]);                        // de = 3 -> case Event
  await A.eval(trail(g.players[cur].id)); await B.eval(trail(g.players[cur].id));
  await pageOf(cur).eval(`window.rollDice(); return 1;`);
  await sleep(250);
  const pendant = await pageOf(cur).eval(`return document.getElementById('die').classList.contains('rolling');`);
  // La case d'arrivee (24) est un EVENT : sa carte doit s'afficher chez l'autre joueur.
  const other = pageOf(cur) === A ? B : A;
  const evCard = await until(other, `document.querySelector('#stage-overlay .event-card .ev-amount')?.textContent || null`, 4500);
  await sleep(1500);
  const histRoll = (await lastHist(A)).find(t => / lance \d/.test(t)) || '';
  const m = / lance (\d) et avance de (\d)/.exec(histRoll);
  const dieA = await A.eval(`return document.getElementById('die').dataset.value;`);
  const dieB = await B.eval(`return document.getElementById('die').dataset.value;`);
  check('Lancer : un seul dé, animation pendant le lancer', pendant === true && !!m, histRoll);
  check('Case EVENT : carte visible chez l’autre joueur (effet inchangé)', !!evCard, evCard);
  check('Dé affiché == valeur du moteur, sur les DEUX clients', m && dieA === m[1] && dieB === m[1] && m[1] === m[2], `moteur ${m && m[1]}, A ${dieA}, B ${dieB}`);
  const pawn = await A.eval(`
    const p=document.querySelector('.pawn[data-player="${g.players[cur].id}"]').getBoundingClientRect();
    const s=document.querySelector('.square[data-index="24"]').getBoundingClientRect();
    return {dx:Math.abs(p.left+p.width/2-(s.left+s.width/2)), dy:Math.abs(p.top+p.height/2-(s.top+s.height/2)), w:s.width};`);
  check('Pion posé sur la bonne case après le déplacement', pawn.dx < pawn.w / 2 && pawn.dy < pawn.w / 2, pawn);
  const seenA = await A.eval(`clearInterval(window.__iv); return window.__trail.map(x=>x.i).join('>');`);
  const seenB = await B.eval(`clearInterval(window.__iv); return window.__trail.map(x=>x.i).join('>');`);
  check('Pion : trajet visible case par case (21>22>23>24), chez les DEUX joueurs', seenA === '21>22>23>24' && seenB === '21>22>23>24', `lanceur ${seenA} | autre ${seenB}`);

  // --- 6 : nouveau lancer
  await rest(code, '/ownership', 'PATCH', { 6: idA });
  await setTurn(ia, { position: 0 });
  await rig(A, [0.99]);                                  // 6 -> Seoul (a Alice)
  await A.eval(`await window.rollDice(); return 1;`);
  await sleep(2200);
  g = await state(code);
  const h6 = await lastHist(A);
  check('6 → nouveau lancer (le tour reste au même joueur)', g.turnIndex === ia && h6.some(t => /6 !/.test(t)) && h6.some(t => /rejoue/.test(t)), h6.slice(-2).join(' / '));

  // --- achat
  await rest(code, '/ownership', 'PATCH', { 6: null });
  await setTurn(ia, { position: 1, cash: 1500 }, { currentAction: { type: 'buy', position: 1, playerId: idA } });
  const cible = await A.eval(`return document.querySelector('.square[data-index="1"]').classList.contains('target');`);
  await clickText(A, '#action-panel button', 'Acheter');
  await sleep(700);
  const flash = await A.eval(`return document.querySelector('.square[data-index="1"]').classList.contains('just-bought');`);
  await sleep(1300);
  g = await state(code);
  check('Achat : case ciblée, argent débité, propriété acquise, flash', cible && flash && g.players[ia].cash === 1330 && g.ownership[1] === idA, `cash ${g.players[ia].cash}`);

  // --- groupes et batiments
  await rest(code, '/ownership', 'PATCH', { 3: idA, 5: idA, 6: null });
  await setTurn(ia, { cash: 2000 });
  await A.eval(`__bq.R.openSquareSheet(5); return 1;`);
  await sleep(400);
  const partial = await A.eval(`const b=document.querySelector('#square-sheet [data-act="build"]'); return {disabled:b.disabled, why:(document.querySelector('#square-sheet .sheet-why')||{}).textContent};`);
  check('Groupe 2/3 : construction refusée', partial.disabled && /2\/3/.test(partial.why), partial.why);
  await rest(code, '/ownership', 'PATCH', { 6: idA });
  await sleep(1300);
  const rentFull = await A.eval(`return document.querySelector('.square[data-index="5"] .sq-price').textContent;`);
  check('Groupe 3/3 : loyer doublé affiché sur la case (40 $)', /^40/.test(rentFull), rentFull);
  const levels = [];
  for (let l = 1; l <= 3; l++) {
    await A.eval(`document.querySelector('#square-sheet [data-act="build"]').click(); return 1;`);
    await sleep(1400);
    levels.push(await A.eval(`const s=document.querySelector('.square[data-index="5"]'); return s.dataset.level+':'+[...s.querySelectorAll('.bld')].filter(b=>getComputedStyle(b).display!=='none').length;`));
  }
  g = await state(code);
  const max = await A.eval(`const b=document.querySelector('#square-sheet [data-act="build"]'); return {disabled:b.disabled, why:(document.querySelector('#square-sheet .sheet-why')||{}).textContent};`);
  check('Construction niveaux 1, 2, 3 : bâtiments visibles', levels.join() === '1:1,2:2,3:3' && g.buildings[5] === 3 && g.players[ia].cash === 1700, `${levels} cash ${g.players[ia].cash}`);
  check('Niveau 4 refusé', max.disabled && /Maximum/.test(max.why), max.why);
  await shot(A, 'batiments-1600.png');
  await A.eval(`document.querySelector('[data-act="sheet-close"]').click(); return 1;`);

  // --- loyer ameliore
  await setTurn(ib, { position: 5, cash: 1500 });
  await B.eval(`await __bq.A.handleLanding(5); return 1;`);
  await sleep(1500);
  g = await state(code);
  const hRent = (await lastHist(A)).find(t => /loyer/.test(t)) || '';
  check('Loyer amélioré : 3 bâtiments à Toronto = 200 $', g.players[ib].cash === 1300 && /3 bâtiments/.test(hRent), hRent);

  // --- echange libre
  await setTurn(ia, {});
  await A.eval(`
    openTradeModal();
    const rec=document.getElementById('trade-recipient'); rec.value=rec.options[0].value;
    document.getElementById('trade-offer-cash').value='200';
    const off=document.getElementById('trade-offer-property');
    off.value=[...off.options].find(o=>o.textContent.includes('Jakarta')).value;
    await proposeTrade(); return 1;`);
  const accepted = await until(B, `[...document.querySelectorAll('#action-panel button')].find(x=>x.textContent==='Accepter')`, 5000);
  await clickText(B, '#action-panel button', 'Accepter');
  await sleep(1800);
  g = await state(code);
  check('Échange proposé puis accepté (hors de son tour)', accepted && g.trade.status === 'accepted' && g.ownership[1] === idB, g.trade.status);

  // --- enchere en argent
  await setTurn(ib, { cash: 1500 }, { currentAction: { type: 'buy', position: 9, playerId: idB } });
  await clickText(B, '#action-panel button', 'enchères');
  const modal = await until(A, `document.getElementById('modal-auction').classList.contains('active')`, 5000);
  await A.eval(`document.getElementById('auction-bid').value='100'; document.querySelector('[data-act="bid"]').click(); return 1;`);
  await sleep(1500);
  await rest(code, '/auction', 'PATCH', { endAt: Date.now() - 1000 });
  await sleep(3500);
  g = await state(code);
  check('Enchère : offre, résolution par l’hôte, propriété au plus offrant', modal && g.ownership[9] === idA && g.auction.status === 'closed', `owner ${g.ownership[9] === idA ? 'Alice' : g.ownership[9]}`);

  // --- prison
  await setTurn(ib, { position: 5 });
  await B.eval(`await __bq.A.handleLanding(7); return 1;`);
  await sleep(1500);
  g = await state(code);
  check('Prison : tomber sur Jail = 3 tours, le tour passe', g.players[ib].inJail && g.players[ib].jailTurns === 3 && g.turnIndex === ia);
  await setTurn(ib, {});
  const cashJ = g.players[ib].cash;
  await clickText(B, '#action-panel button', 'Payer');
  await sleep(1500);
  g = await state(code);
  check('Caution 150 $ : libéré, le tour continue', !g.players[ib].inJail && g.players[ib].cash === cashJ - 150 && g.turnIndex === ib);

  // --- case Auction : echange de proprietes (+100 $ chacun)
  await setTurn(ia, { position: 13 });
  const cA = (await state(code)).players[ia].cash, cB = (await state(code)).players[ib].cash;
  await A.eval(`await __bq.A.handleLanding(14); return 1;`);
  await sleep(1300);
  await click(A, '#action-panel [data-act="swap-pick"][data-arg="9"]');
  await until(B, `document.querySelector('#action-panel [data-act="swap-offer"][data-arg="1"]')`, 5000);
  await click(B, '#action-panel [data-act="swap-offer"][data-arg="1"]');
  await until(A, `document.querySelector('#action-panel [data-act="swap-accept"]')`, 5000);
  await shot(A, 'auction-swap.png');
  await click(A, '#action-panel [data-act="swap-accept"]');
  await sleep(1800);
  g = await state(code);
  check('Case Auction : échange conclu, +100 $ chacun', g.ownership[9] === idB && g.ownership[1] === idA && g.players[ia].cash === cA + 100 && g.players[ib].cash === cB + 100);

  // --- Chance : carte
  await setTurn(ia, { position: 27 });
  const cardCash = (await state(code)).players[ia].cash;
  await rig(A, [0.1, 0.0]);                              // carte n°0 : +150 $
  await A.eval(`await __bq.A.handleLanding(0); return 1;`);
  const cardB = await until(B, `document.querySelector('#stage-overlay .chance-card h3')?.textContent`, 4000);
  g = await state(code);
  check('Chance : carte tirée une fois, affichée chez l’autre joueur', g.players[ia].cash === cardCash + 150 && /génie/.test(cardB || ''), cardB);

  // --- Chance : dilemme
  await sleep(4500);
  await setTurn(ia, { position: 27, cash: 1500 });
  await rig(A, [0.5, 0.0, 0.9]);                         // dilemme n°0 (fisc)
  await A.eval(`await __bq.A.handleLanding(0); return 1;`);
  const optsB = await until(B, `(()=>{const o=[...document.querySelectorAll('#stage-overlay .dopt')]; return o.length===2 && o.every(x=>x.disabled) ? o.length : 0;})()`, 4000);
  const optsA = await A.eval(`return [...document.querySelectorAll('#stage-overlay .dopt')].filter(x=>!x.disabled).length;`);
  await shot(B, 'dilemme.png');
  await click(A, '#stage-overlay .dopt[data-arg="A"]');
  const chosenB = await until(B, `document.querySelector('#stage-overlay .dopt.chosen')?.dataset.arg`, 4000);
  g = await state(code);
  check('Dilemme : 2 options claires, seul le joueur concerné choisit', optsB === 2 && optsA === 2);
  check('Dilemme : conséquence appliquée et choix visible chez l’autre', g.players[ia].cash === 1200 && chosenB === 'A', `cash ${g.players[ia].cash}`);

  // --- Chance : roue
  await sleep(4500);
  await setTurn(ia, { position: 27 });
  await rig(A, [0.9, 0.999]);                            // roue -> dernier segment (RIEN)
  await A.eval(`__bq.A.handleLanding(0); return 1;`);
  const spinning = await until(B, `document.querySelector('#stage-overlay .wheel-svg')`, 4000);
  await shot(B, 'roue.png');
  await sleep(5200);
  const hitA = await A.eval(`return document.querySelector('#stage-overlay .wseg.hit')?.dataset.id;`);
  const hitB = await B.eval(`return document.querySelector('#stage-overlay .wseg.hit')?.dataset.id;`);
  g = await state(code);
  check('Roue : tourne puis s’arrête sur le MÊME segment chez tous', spinning && hitA === 'nothing' && hitB === 'nothing' && g.event.status === 'done', `A ${hitA}, B ${hitB}`);
  await sleep(3500);
  return { code, ia, ib, idA, idB, setTurn };
}

// ---------------------------------------------------------------- presentateur
async function suitePresenter(A, B, ctx) {
  const { code, ia, ib, setTurn } = ctx;
  const before = (await hostLines(A)).length;
  await say(B, '@host tu dis quoi toi ?');
  const replied = await until(A, `Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host').length > ${before}`, 6000);
  check('Chat → présentateur : il répond quand on l’interpelle', replied, (await hostLines(A)).pop()?.text);

  // Contexte croise : Bob se moque d'Alice, puis la situation se retourne contre Bob.
  await say(B, 'Alice est nulle 😂 tu vas jamais me rattraper');
  await sleep(9000);                                     // laisse passer le delai entre deux prises de parole
  await rest(code, '/ownership', 'PATCH', { 3: ctx.idA, 5: ctx.idA, 6: ctx.idA });
  await rest(code, '/buildings', 'PATCH', { 5: 3 });
  await setTurn(ib, { position: 4, cash: 300 });
  await rig(A, Array(400).fill(0.05));                  // l hote parle et prefere une replique a memoire (les pieces consomment aussi des tirages)
  const n = (await hostLines(A)).length;
  await B.eval(`await __bq.A.handleLanding(5); return 1;`);
  const react = await until(A, `(()=>{const h=Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host').sort((a,b)=>a.ts-b.ts); return h.length > ${n} ? h[h.length-1].text : null;})()`, 6000);
  check('Évènement → réaction automatique (gros loyer)', !!react, react);
  check('Contexte croisé : le présentateur ressort la pique du chat', /nulle|rattraper/.test(react || ''), react);
  await A.eval(`window.__rig=[]; return 1;`);
  const shownB = await until(B, `!document.getElementById('host-bubble').hidden && document.getElementById('host-bubble').textContent`, 3000);
  check('Réplique visible sur le plateau de l’autre joueur (bulle)', !!shownB);
  await shot(B, 'presentateur.png');

  // Enchere absurde : 400 $ pour une case a 250 $.
  await sleep(5000);
  await rig(A, Array(400).fill(0.05));
  await rest(code, `/players/${ib}`, 'PATCH', { cash: 1500 });
  await rest(code, '', 'PATCH', { auction: { status:'open', position:9, nextBid:80, highestBid:0, highestBidder:null, endAt: Date.now() + 600000 } });
  await sleep(1200);
  const nb = (await hostLines(A)).length;
  await B.eval(`await __bq.A.placeBid(400); return 1;`);
  const bidLine = await until(A, `(()=>{const h=Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host').sort((a,b)=>a.ts-b.ts); return h.length > ${nb} && h[h.length-1].ev==='bid' ? h[h.length-1].text : null;})()`, 6000);
  check('Enchère absurde : le présentateur réagit avant même la fin', !!bidLine, bidLine);
  await rest(code, '/auction', 'PATCH', { status:'closed' });

  // Chrono : pression a 12 s, puis a 5 s, puis expiration (tour passe par l'hote).
  await sleep(1500);
  await setTurn(ib, { position: 4 }, { turnDeadline: Date.now() + 14500 });
  const p12 = await until(A, `(()=>{const h=Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host'&&m.ev==='pressure12'); return h.length ? h[h.length-1].text : null;})()`, 8000);
  const p5 = await until(A, `(()=>{const h=Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host'&&m.ev==='pressure5'); return h.length ? h[h.length-1].text : null;})()`, 10000);
  const afk = await until(A, `(()=>{const h=Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host'&&m.ev==='afk'); return h.length ? h[h.length-1].text : null;})()`, 12000);
  check('Chrono : pression à 12 s puis à 5 s', !!p12 && !!p5, `${p12} / ${p5}`);
  check('Joueur AFK : tour passé, le présentateur enfonce le clou', !!afk, afk);
  await A.eval(`window.__rig=[]; return 1;`);
}

// ---------------------------------------------------------------- IA
async function suiteAI(A, B, ctx) {
  const mock = spawn(process.execPath, [path.join(__dirname, 'ai-mock.js')], { stdio: 'ignore' });
  const mode = m => fetch(AI + '/__mode', { method: 'POST', body: JSON.stringify(m) });
  // Interpelle le presentateur et attend la replique : renvoie {src, provider, text} et le badge vu par Bob.
  const ask = async (text, wait = 12000) => {
    const n = (await hostLines(A)).length;
    await say(B, text);
    await until(A, `Object.values(__bq.S.game.chat||{}).filter(m=>m.kind==='host').length > ${n}`, 6000);
    const end = Date.now() + wait;
    let line;
    while (Date.now() < end) {
      line = (await hostLines(A)).filter(m => m.ev === 'chat').pop();
      if (line && line.src === 'ai') break;
      await sleep(400);
    }
    await sleep(900);
    const badge = line ? await B.eval(`const b=document.querySelector('.chat-item.host[data-key="${line.k}"] .src-badge'); return b ? b.textContent : null;`) : null;
    return { ...line, badge };
  };
  try {
    await sleep(1200);
    await mode({ mode: 'ok' });
    await ctx.setTurn(ctx.ia, {}, { turnDeadline: Date.now() + 600000 });   // pas de chrono pendant ces tests
    // Surcharge de l'endpoint, acceptee seulement sur localhost (pas de rechargement : localStorage partage).
    await A.eval(`history.replaceState(null,'',location.pathname+'?ai=${encodeURIComponent(AI + '/host')}'); return __bq.presenter().endpoint;`);
    await sleep(6500);

    const r1 = await ask('@host alors, ça va l’IA ?');
    check('IA : Gemini répond en premier, badge « GEMINI » chez l’autre joueur', r1.provider === 'gemini' && /\[IA gemini\] Réponse à Bob/.test(r1.text) && r1.badge === 'GEMINI', `${r1.text} | ${r1.badge}`);
    const last = await fetch(AI + '/__last').then(r => r.json());
    const c = (last && last.ctx) || {};
    check('IA : le Worker reçoit le jeu, le chat récent et la mémoire', c.players && c.players.length === 2 && c.chat && c.chat.some(x => /nulle/.test(x.text)) && c.memory.quotes.length > 0,
      { joueurs: c.players && c.players.length, chat: c.chat && c.chat.length, citations: c.memory && c.memory.quotes.length });

    await mode({ gemini: 'fail', openrouter: 'ok' }); await sleep(6500);
    const r2 = await ask('@host et si Gemini tombe ?');
    check('Gemini indisponible → OpenRouter, badge « OPENROUTER »', r2.provider === 'openrouter' && r2.badge === 'OPENROUTER', `${r2.provider} | ${r2.badge}`);

    await mode({ gemini: 'quota', openrouter: 'ok' }); await sleep(6500);
    const r3 = await ask('@host et si Gemini n’a plus de quota ?');
    check('Quota Gemini épuisé (429) → OpenRouter', r3.provider === 'openrouter', `${r3.provider} | ${r3.badge}`);

    await mode({ gemini: 'slow', openrouter: 'ok' }); await sleep(6500);
    const r4 = await ask('@host et si Gemini rame ?', 16000);
    check('Gemini trop lent (timeout) → OpenRouter', r4.provider === 'openrouter', `${r4.provider} | ${r4.badge}`);

    await mode({ mode: 'fail' }); await sleep(6500);
    const r5 = await ask('@host et là, tout est en panne ?', 5000);
    check('Gemini et OpenRouter indisponibles → réplique LOCALE, badge « LOCAL »', r5.src === 'local' && r5.badge === 'LOCAL' && !/\[IA/.test(r5.text), `${r5.text} | ${r5.badge}`);

    await ctx.setTurn(ctx.ia, { position: 21 });
    await rig(A, [0.4]);
    await A.eval(`await window.rollDice(); return 1;`);
    await sleep(1500);
    const rolled = (await lastHist(A)).some(t => /Alice lance 3/.test(t));
    check('IA indisponible : le jeu continue normalement', rolled);
    await A.eval(`history.replaceState(null,'',location.pathname+'?ai=off'); return 1;`);
  } finally { mock.kill(); }
}

// ---------------------------------------------------------------- faillite, victoire
async function suiteEnd(A, B, ctx) {
  const { code, ib, ia } = ctx;
  await rest(code, `/players/${ib}`, 'PATCH', { cash: -600 });
  const out = await until(A, `__bq.S.game.players[${ib}].bankrupt && __bq.S.game.phase`, 8000);
  const g = await state(code);
  const bobProps = Object.values(g.ownership || {}).filter(o => o === ctx.idB).length;
  check('Faillite (argent < −500 $) : joueur éliminé, propriétés rendues', g.players[ib].bankrupt && bobProps === 0);
  const vA = await until(A, `document.getElementById('victory').classList.contains('active') && document.getElementById('victory-name').textContent`, 6000);
  const vB = await until(B, `document.getElementById('victory').classList.contains('active') && document.getElementById('victory-name').textContent`, 6000);
  check('Victoire : écran de fin chez tous, gagnant mis en avant', vA === 'Alice' && vB === 'Alice', `${vA} / ${vB} (${out})`);
  await shot(A, 'victoire.png');
  await A.eval(`document.getElementById('victory-restart').click(); return 1;`);
  const lobbyA = await until(A, `document.querySelector('.screen.active').id==='s-lobby'`, 6000);
  const lobbyB = await until(B, `document.querySelector('.screen.active').id==='s-lobby' && !document.getElementById('victory').classList.contains('active')`, 6000);
  check('Nouvelle partie : retour au salon pour les deux joueurs', lobbyA && lobbyB);
}

// ---------------------------------------------------------------- responsive
async function suiteResponsive(A, B, ctx) {
  await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
  await until(A, `__bq.S.game.phase==='playing'`);
  await sleep(1500);
  const sizes = [[1366, 768, false, 600], [1600, 900, false, 760], [1920, 1080, false, 940], [360, 760, true, 330], [390, 844, true, 360], [430, 932, true, 400]];
  for (const [w, h, mobile, minBoard] of sizes) {
    await A.setViewport(w, h, mobile);
    await sleep(900);
    const r = await A.eval(`
      const b=document.getElementById('board').getBoundingClientRect();
      const names=[...document.querySelectorAll('.sq-name')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent);
      const pawns=[...document.querySelectorAll('.pawn')].filter(p=>p.getBoundingClientRect().width>8).length;
      return {plateau:Math.round(b.width), scrollX:document.documentElement.scrollWidth>innerWidth, scrollY:!${mobile} && document.documentElement.scrollHeight>innerHeight+2, coupes:names, pions:pawns};`);
    check(`Responsive ${w}×${h}`, r.plateau >= minBoard && !r.scrollX && !r.scrollY && !r.coupes.length && r.pions === 2, r);
    if ([1366, 390].includes(w)) await shot(A, `jeu-${w}.png`);
  }
  await A.setViewport(1600, 900);
}

// ---------------------------------------------------------------- repli sans GSAP
async function suiteNoGsap(b) {
  const A = await b.newPage(null, 'A-nogsap');
  await A.blockUrls(['*cdnjs.cloudflare.com*']);
  await A.setViewport(1600, 900);
  await A.goto(URL);
  await sleep(1500);
  const code = await createGame(A);
  const g0 = await rest(code, '');
  await rest(code, '/players', 'PUT', [...g0.players, { id: 'demo-b', name: 'Bob', position: 21, cash: 1500, jailTurns: 0, inJail: false, color: '#fbbf24', ready: true }]);
  await sleep(1200);
  await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
  await until(A, `__bq.S.game.phase==='playing'`);
  const g = await rest(code, '');
  const ia = g.players.findIndex(p => p.name === 'Alice');
  await rest(code, '', 'PATCH', { turnIndex: ia, turnDeadline: Date.now() + 600000 });
  await rest(code, `/players/${ia}`, 'PATCH', { position: 21 });
  await sleep(1300);
  await rig(A, [0.4]);
  const r = await A.eval(`
    const gs=typeof gsap; await window.rollDice(); await new Promise(r=>setTimeout(r,1500));
    const p=document.querySelector('.pawn[data-player="${g.players[ia].id}"]').getBoundingClientRect();
    const s=document.querySelector('.square[data-index="24"]').getBoundingClientRect();
    return {gsap:gs, die:document.getElementById('die').dataset.value, near:Math.abs(p.left+p.width/2-(s.left+s.width/2))<s.width/2};`);
  check('Sans GSAP : dé et pion fonctionnent', r.gsap === 'undefined' && r.die === '3' && r.near, r);
  await rest(code, '', 'DELETE');
  return [A];
}

// ---------------------------------------------------------------- apercu
async function preview() {
  const b = await Browser.launch({ headless: false, windowSize: '1600,950' });
  const [A, B] = await openPair(b);
  const code = await createGame(A, { name: 'Toi', players: '4' });
  await joinGame(B, code);
  const g = await rest(code, '');
  await rest(code, '/players', 'PUT', [...g.players,
    { id: 'demo-c', name: 'Chloé', position: 21, cash: 1500, jailTurns: 0, inJail: false, color: '#34d399', ready: true },
    { id: 'demo-d', name: 'Driss', position: 21, cash: 1500, jailTurns: 0, inJail: false, color: '#fb7185', ready: true }]);
  await sleep(1500);
  await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
  await sleep(2600);
  await A.send('Page.bringToFront');
  console.log(`Fenêtre ouverte. Partie de démo : ${code} — tu joues "Toi" (hôte).`);
  console.log(`Pense à la supprimer ensuite : curl -X DELETE "${DB}${code}.json"`);
  process.exit(0);   // on laisse volontairement le navigateur ouvert
}

// ---------------------------------------------------------------- orchestration
// Erreurs attendues : le 503 volontaire du test de panne IA.
const expected = e => /Failed to load resource.*(8787|50[234])/.test(e);

(async () => {
  if (want('--preview')) return preview();
  const b = await Browser.launch({ headless: true });
  const pages = [];
  let code = null;
  try {
    if (want('--no-gsap')) {
      pages.push(...await suiteNoGsap(b));
    } else {
      const [A, B] = await openPair(b);
      pages.push(A, B);
      const ctx = await suiteGameplay(A, B);
      code = ctx.code;
      await suitePresenter(A, B, ctx);
      await suiteAI(A, B, ctx);
      await suiteEnd(A, B, ctx);
      await suiteResponsive(A, B, ctx);
    }
    const errs = pages.flatMap(p => p.errors()).filter(e => !expected(e));
    check('Console sans erreur ni avertissement', errs.length === 0, errs.join(' || ') || 'aucune');
  } catch (e) {
    check('Exécution sans exception', false, e.message);
  } finally {
    if (code) await rest(code, '', 'DELETE').catch(() => {});
    await b.close();
  }
  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== NAVIGATEUR : ${passed}/${results.length} =====`);
  const ko = results.filter(r => !r.ok);
  if (ko.length) console.log('Échecs : ' + ko.map(r => r.name).join(' | '));
  process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE:', e.message); process.exit(2); });
