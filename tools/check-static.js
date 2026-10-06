// Portail statique : tout ce qui se verifie SANS navigateur ni reseau.
// Rapide, deterministe : c'est le premier filet apres toute modification.
//
//   node tools/check-static.js
//
// Couvre : syntaxe des modules, ordre du plateau, contrat DOM, de, contraste,
// prix et groupes du fichier de regles, loyers et construction, tours (relance
// sur 6, prison, faillite), Chance (1 000 tirages), presentateur, Worker IA,
// et l'absence de secret dans le frontend.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'banqueroll', 'js');
const HTML = fs.readFileSync(path.join(ROOT, 'banqueroll.html'), 'utf8');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};
const load = f => import(pathToFileURL(path.join(JS, f)).href);
const jsFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js'));
const workerFiles = ['worker.js', 'prompt.js'].map(f => path.join(ROOT, 'ai-host', 'src', f));

(async () => {
  // ------------------------------------------------------------ 1. syntaxe
  const bad = [];
  for (const f of [...jsFiles.map(f => path.join(JS, f)), ...workerFiles]) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad.push(path.basename(f) + ': ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')); }
  }
  check('1. Syntaxe des modules (node --check)', !bad.length, bad.length ? bad.join(' | ') : `${jsFiles.length + workerFiles.length} fichiers`);

  const B = await load('board.js');
  const R = await load('rules.js');
  const C = await load('chance.js');
  const F = await load('fx.js');
  const L = await load('lines.js');

  // ------------------------------------------------------------ 2. plateau
  // L'ordre des villes est une contrainte produit : il ne doit JAMAIS bouger.
  const EXPECTED = {
    bas:    ['START', 'NEW YORK', 'TOKYO', 'AIRPORT', 'LONDON', 'HONG KONG', 'PARIS', 'AUCTION'],
    droite: ['DUBAI', 'BEIJING', 'EVENT', 'SYDNEY', 'RIYADH', 'ZURICH', 'JAIL'],
    haut:   ['JAIL', 'SEOUL', 'TORONTO', 'RAILWAY', 'MOSCOW', 'BERLIN', 'JAKARTA', 'CHANCE'],
    gauche: ['MADRID', 'CAIRO', 'BOAT', 'EVENT', 'DELHI', 'RIO'],
  };
  const at = (r, c) => B.BOARD[B.BOARD_LAYOUT.findIndex(p => p.r === r && p.c === c)].name.toUpperCase();
  const actual = {
    bas:    [1, 2, 3, 4, 5, 6, 7, 8].map(c => at(8, c)),
    droite: [7, 6, 5, 4, 3, 2, 1].map(r => at(r, 8)),
    haut:   [8, 7, 6, 5, 4, 3, 2, 1].map(c => at(1, c)),
    gauche: [2, 3, 4, 5, 6, 7].map(r => at(r, 1)),
  };
  check('2a. BOARD contient 28 cases, Départ à l’index 21', B.BOARD.length === 28 && B.BOARD[21].type === 'start', `${B.BOARD.length} cases`);
  for (const side of Object.keys(EXPECTED)) {
    const same = JSON.stringify(actual[side]) === JSON.stringify(EXPECTED[side]);
    check(`2b. Ordre des villes — ${side}`, same, same ? actual[side].join(' > ') : `attendu ${EXPECTED[side].join(' > ')} | obtenu ${actual[side].join(' > ')}`);
  }

  // ------------------------------------------------------------ 3. contrat DOM
  const body = HTML.slice(HTML.indexOf('<body'));
  const src = jsFiles.map(f => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');
  const needed = [...new Set([...src.matchAll(/(?:getElementById|\$id)\('([^']+)'\)/g)].map(m => m[1]))];
  // Les ids crees dynamiquement (id="..." dans un gabarit JS) comptent aussi.
  const missing = needed.filter(id => !body.includes(`id="${id}"`) && !src.includes(`id="${id}"`));
  check('3a. Tous les ids lus par le JS existent dans le HTML', !missing.length, missing.length ? 'manquants : ' + missing.join(', ') : `${needed.length} ids vérifiés`);
  const acts = [...new Set([...HTML.matchAll(/data-act="([^"]+)"/g), ...src.matchAll(/data-act="([^"$]+)"/g), ...src.matchAll(/btn\([^,]+,\s*'([a-z-]+)'/g), ...src.matchAll(/chip\([^,]+,\s*'([a-z-]+)'/g)].map(m => m[1]))];
  const mainSrc = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
  const unknown = acts.filter(a => !new RegExp(`(^|[\\s{,])'?${a.replace('-', '\\-')}'?\\s*:`, 'm').test(mainSrc));
  check('3b. Chaque data-act a un gestionnaire dans main.js', !unknown.length, unknown.length ? 'sans gestionnaire : ' + unknown.join(', ') : `${acts.length} actions`);

  // ------------------------------------------------------------ 4. de
  let diceOk = true;
  for (let v = 1; v <= 6; v++) {
    if (F.DIE_PIPS[v].length !== v) diceOk = false;
    if (new Set(F.DIE_PIPS[v]).size !== v || F.DIE_PIPS[v].some(p => p < 0 || p > 8)) diceOk = false;
  }
  const rots = Object.values(F.DIE_FACE_ROTATION).map(r => r.join(','));
  if (Object.keys(F.DIE_FACE_ROTATION).length !== 6 || new Set(rots).size !== 6) diceOk = false;
  const faces = (F.dieFacesHTML().match(/class="die-face f\d"/g) || []).length;
  check('4. Dé unique : points = valeur, 6 faces, 6 orientations distinctes', diceOk && faces === 6, `${faces} faces`);

  // ------------------------------------------------------------ 5. contraste
  let worst = 99; const fails = [];
  B.BOARD.forEach(sq => {
    const band = B.getSquareColor(sq);
    const r = B.contrastRatio(B.readableInk(band), band);
    worst = Math.min(worst, r);
    if (r < 4.5) fails.push(`${sq.name} ${band} = ${r.toFixed(2)}`);
  });
  check('5. Contraste prix/bandeau des 28 cases >= 4.5:1 (WCAG AA)', !fails.length, fails.length ? fails.join(' | ') : `minimum ${worst.toFixed(2)}:1`);

  // ------------------------------------------------------------ 6. regles : prix et groupes
  const PRICES = { jakarta:170, berlin:180, moscow:200, toronto:200, seoul:200, zurich:250, riyadh:250, sydney:300, beijing:300, dubai:300,
    'new-york':450, tokyo:420, london:420, 'hong-kong':350, paris:350, madrid:150, cairo:150, delhi:100, rio:100 };
  const wrongPrice = Object.entries(PRICES).filter(([id, p]) => (B.BOARD.find(s => s.id === id) || {}).price !== p);
  check('6a. Prix des villes = fichier de règles (Rio 100 $, arbitré)', !wrongPrice.length, wrongPrice.map(([id]) => id).join(', ') || '19 villes');
  const GROUPS = { Pink:['jakarta','berlin'], Orange:['moscow','toronto','seoul'], DarkGreen:['zurich','riyadh'], Brown:['sydney','beijing','dubai'],
    Red:['new-york','tokyo','london'], Purple:['hong-kong','paris'], LightBlue:['madrid','cairo'], Olive:['delhi','rio'] };
  const groupErr = Object.entries(GROUPS).filter(([g, ids]) => JSON.stringify((B.GROUPS[g] || []).map(i => B.BOARD[i].id).sort()) !== JSON.stringify([...ids].sort()));
  check('6b. Groupes de couleur = fichier de règles (bleu clair sans Bangkok)', !groupErr.length && Object.keys(B.GROUPS).length === 8, groupErr.map(([g]) => g).join(', ') || '8 groupes');
  const colorErr = Object.entries(B.GROUPS).filter(([, list]) => new Set(list.map(i => B.getSquareColor(B.BOARD[i]))).size !== 1);
  check('6c. Une seule couleur par groupe', !colorErr.length, colorErr.map(([g]) => g).join(', '));

  // ------------------------------------------------------------ 7. loyers et construction
  const base = () => ({ phase:'playing', turnIndex:0, round:1, turnTimer:30, extraRoll:null, turnRolled:null, currentAction:null,
    players:[{ id:'a', name:'Alice', cash:1500, position:21 }, { id:'b', name:'Bob', cash:1500, position:21 }, { id:'c', name:'Chloé', cash:1500, position:21 }],
    ownership:{}, buildings:{} });
  const g = base();
  const toronto = B.BOARD.findIndex(s => s.id === 'toronto'), moscow = 3, seoul = 6;
  g.ownership[moscow] = 'a'; g.ownership[toronto] = 'a';
  const partial = R.canBuild(g, 'a', toronto);
  const rentPartial = R.rentFor(g, toronto);
  g.ownership[seoul] = 'a';
  const full = R.canBuild(g, 'a', toronto);
  const rentFull = R.rentFor(g, toronto);
  const levels = [1, 2, 3].map(l => { g.buildings[toronto] = l; return R.rentFor(g, toronto); });
  const level4 = R.canBuild(g, 'a', toronto);
  g.buildings = {};
  g.turnRolled = 'a';
  const afterRoll = R.canBuild(g, 'a', toronto);
  g.turnRolled = null;
  const notMine = R.canBuild(g, 'b', toronto);
  check('7a. Groupe 2/3 : construction refusée', !partial.ok && /2\/3/.test(partial.reason), partial.reason);
  check('7b. Groupe 3/3 : construction autorisée (coût 50 % du prix)', full.ok && full.cost === 100, JSON.stringify(full));
  check('7c. Loyer : nu 20, groupe complet 40, bâtiments 80 / 140 / 200', rentPartial === 20 && rentFull === 40 && levels.join() === '80,140,200', `${rentPartial}, ${rentFull}, ${levels}`);
  check('7d. Niveau 4 refusé, construction après le lancer refusée', !level4.ok && /Maximum/.test(level4.reason) && !afterRoll.ok && !notMine.ok);
  g.buildings[toronto] = 2;
  const worth = R.netWorth(g, g.players[0]);
  check('7e. Fortune nette = cash + prix + bâtiments ; vente à 80 %', worth === 1500 + 600 + 200 && R.sellValue(g, toronto) === Math.round(400 * 0.8), `${worth}, vente ${R.sellValue(g, toronto)}`);
  const pub = base(); pub.ownership[4] = 'b'; pub.ownership[18] = 'b'; pub.ownership[25] = 'b';
  check('7f. Propriétés publiques : 50 $ × nombre possédé', R.rentFor(pub, 4) === 150, R.rentFor(pub, 4));

  // ------------------------------------------------------------ 8. tours
  const t = base(); t.extraRoll = 'a';
  const six = R.planNextTurn(t);
  const sixJail = R.planNextTurn(t, { 'players/0/inJail': true });
  const sixAfk = R.planNextTurn(t, {}, { advance:true });
  check('8a. Un 6 fait rejouer, sauf prison ou tour expiré', six.again && six.updates.turnIndex === undefined && sixJail.updates.turnIndex === 1 && sixAfk.updates.turnIndex === 1);
  const s = base(); s.players[1].skipNext = true; s.players[2].bankrupt = true;
  const skip = R.planNextTurn(s);
  check('8b. Tour sauté et joueurs en faillite ignorés', skip.updates.turnIndex === 0 && skip.skipped[0] === 'Bob' && skip.updates.round === 2, JSON.stringify(skip.updates));
  const j = R.jailUpdates(base(), 1);
  check('8c. Prison : 3 tours, case Jail, caution 150 $', j['players/1/jailTurns'] === 3 && j['players/1/position'] === B.JAIL_INDEX && R.BAIL === 150);
  const k = base(); k.players[0].cash = -501;
  const k2 = base(); k2.players[1].cash = -400; k2.ownership[20] = 'b';   // -400 + New York 450 = +50 : survit
  const k3 = base(); k3.players[2].cash = 0;
  check('8d. Faillite : cash < −500 ou fortune ≤ 0', R.isBankrupt(k, k.players[0]) && !R.isBankrupt(k2, k2.players[1]) && R.isBankrupt(k3, k3.players[2]));
  const bu = R.bankruptcyUpdates(Object.assign(base(), { ownership:{ 1:'a', 2:'b' }, buildings:{ 1:2 } }), { id:'a' });
  check('8e. Faillite : propriétés et bâtiments rendus à la banque', bu['ownership/1'] === null && bu['buildings/1'] === null && bu['ownership/2'] === undefined);
  const w = base(); w.settings = { target:3000, maxRounds:30 }; w.players[1].cash = 3100;
  const w2 = base(); w2.settings = { target:5000, maxRounds:0 }; w2.round = 99;
  check('8f. Victoire : objectif, manches (0 = sans limite)', R.winnerCheck(w).winner.id === 'b' && R.winnerCheck(w2) === null);
  const order = R.startingPlayers(base().players, (() => { let i = 0; return () => [0.9, 0.1, 0.5][i++ % 3]; })());
  check('8g. Ordre tiré au sort, bonus de retard (+25 $ par rang)', order.map(p => p.cash).join() === '1500,1525,1550' && order.every(p => p.position === 21));

  // ------------------------------------------------------------ 9. Chance
  let chanceErr = null; const kinds = { card:0, dilemma:0, wheel:0 };
  let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 0; n < 1000 && !chanceErr; n++) {
    const cg = base(); cg.ownership = { 1:'a', 2:'a', 5:'b', 9:'c', 4:'a' }; cg.buildings = { 1: n % 3 };
    try {
      const ev = C.drawChance(cg, 'a', rng);
      kinds[ev.kind]++;
      const outs = ev.kind === 'card' ? [C.resolveCard(cg, 'a', ev.key)]
        : ev.kind === 'dilemma' ? C.dilemmaOptions(cg, 'a', ev.key).map(o => C.resolveDilemma(cg, 'a', ev.key, o.id, ev.detail))
        : [C.resolveWheel(cg, 'a', ev.key, ev.detail)];
      outs.forEach(o => {
        if (!o.text || !o.then) throw new Error('résultat incomplet ' + ev.key);
        Object.entries(o.updates).forEach(([key, v]) => { if (/cash$/.test(key) && !Number.isFinite(v)) throw new Error('cash non fini ' + key); });
      });
      if (ev.kind === 'dilemma' && C.dilemmaOptions(cg, 'a', ev.key).length !== 2) throw new Error('dilemme sans 2 options ' + ev.key);
    } catch (e) { chanceErr = e.message; }
  }
  check('9a. Chance : 1 000 tirages résolus sans erreur (cartes, dilemmes, roue)', !chanceErr && kinds.card && kinds.dilemma && kinds.wheel, chanceErr || JSON.stringify(kinds));
  const geo = C.wheelGeometry();
  check('9b. Roue : segments contigus couvrant 360°', Math.abs(geo[geo.length - 1].end - 360) < 1e-9 && geo.every((sg, i) => !i || Math.abs(sg.start - geo[i - 1].end) < 1e-9));
  const angles = geo.map(sg => { const a = ((F.wheelAngle(sg, 'x') % 360) + 360) % 360; const pointer = (360 - a) % 360; return pointer >= sg.start && pointer <= sg.end; });
  check('9c. Roue : l’angle final pointe sur le segment tiré', angles.every(Boolean));
  const det = C.drawChance(base(), 'a', () => 0.99);
  check('9d. Hasard tiré une fois : le résultat de la roue est stocké dans l’évènement', det.kind === 'wheel' && Number.isInteger(det.seg) && typeof det.key === 'string');

  // ------------------------------------------------------------ 10. presentateur
  const types = Object.keys(L.LINES);
  const emptyTypes = types.filter(ty => !L.pickLine(ty, { P:'Bob', O:'Alice', amt:300, before:500, cash:200, city:'Paris', intensity:3, key:'jackpot', choice:'A', lvl:3, completes:true, group:'Rose', n:3, net:3000, rent:200, cash0:1 }));
  check('10a. Chaque type d’évènement a au moins une réplique locale', !emptyTypes.length, emptyTypes.join(', ') || `${types.length} types`);
  const quoted = L.pickLine('rent', { P:'Bob', O:'Alice', amt:900, before:1000, cash:100, city:'Paris', intensity:3, quote:{ text:'attends un peu', ago:' il y a 3 manches' } }, [], () => 0);
  check('10b. Les citations du chat passent en priorité (running gags)', /attends un peu/.test(quoted.text), quoted.text);

  // ------------------------------------------------------------ 11. securite IA
  const front = [HTML, src, ...fs.readdirSync(path.join(ROOT, 'banqueroll', 'css')).map(f => fs.readFileSync(path.join(ROOT, 'banqueroll', 'css', f), 'utf8'))].join('\n');
  const leaks = [/sk-or-[a-z0-9-]{10,}/i, /sk-[A-Za-z0-9]{20,}/, /Bearer\s+[A-Za-z0-9-_]{12,}/, /openrouter\.ai\/api/i].filter(re => re.test(front));
  check('11a. Aucun secret ni appel direct OpenRouter dans le frontend', !leaks.length, leaks.map(String).join(' '));
  const P = await import(pathToFileURL(path.join(ROOT, 'ai-host', 'src', 'prompt.js')).href);
  const clean = P.cleanReply('Bankroll Host : « ' + 'x'.repeat(400) + ' »');
  const ctx = P.sanitize({ mode:'chat', intensity:9, chat:Array.from({ length:40 }, (_, i) => ({ who:'A', text:'m' + i })), players:[{ name:'A'.repeat(99), cash:'12' }] });
  check('11b. Worker : contexte borné, réponse nettoyée (≤ 280 car.)', clean.length <= 280 && !/^Bankroll/.test(clean) && ctx.chat.length === 14 && ctx.intensity === 4 && ctx.players[0].name.length === 24);

  const passed = results.filter(Boolean).length;
  console.log(`\n===== STATIQUE : ${passed}/${results.length} =====`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
