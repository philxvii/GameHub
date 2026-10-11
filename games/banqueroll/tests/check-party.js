// Tests purs des mecaniques de party (sans navigateur, ~1 s) :
//   node games/banqueroll/tests/check-party.js
// Chaque lot ajoute ses controles ici. Les modules testes sont purs : ils lisent un
// etat de partie et renvoient des valeurs ou des mises a jour Firebase.

const path = require('path');
const { pathToFileURL } = require('url');

const JS = path.join(__dirname, '..', 'js');
const load = f => import(pathToFileURL(path.join(JS, f)).href);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail !== '' ? ' | ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

// Partie minimale de test : 3 joueurs, Classique par defaut.
function makeGame(over = {}) {
  return {
    code: 'TEST-1', phase: 'playing', turnIndex: 0, round: 3, turnTimer: 30, hostId: 'a',
    settings: { target: 3000, maxRounds: 30 },
    players: [
      { id: 'a', name: 'Alice', cash: 1000, position: 21, color: '#2F7FC1' },
      { id: 'b', name: 'Bob', cash: 1000, position: 21, color: '#D99A1E' },
      { id: 'c', name: 'Chloé', cash: 1000, position: 21, color: '#D2582A' },
    ],
    ownership: {}, buildings: {}, history: {}, ...over,
  };
}

(async () => {
  const C = await load('config.js');

  // ---------------------------------------------------------------- lot 0 : configuration
  const classic = C.makeConfig('classic');
  check('Config : Classique = toutes les mécaniques OFF', C.MECHANIC_KEYS.every(k => classic[k] === false) && classic.preset === 'classic');
  const chaos = C.makeConfig('chaos');
  check('Config : Chaos = toutes les mécaniques ON', C.MECHANIC_KEYS.every(k => chaos[k] === true));
  const party = C.makeConfig('party');
  const econ = C.MECHANICS.filter(m => m.family === 'economy').map(m => m.key);
  check('Config : Party = spectacle ON, économie lourde OFF (sauf Money Time)', C.MECHANICS.filter(m => m.family === 'show').every(m => party[m.key])
    && !party.blueShell && !party.marketCrash && party.moneyTime, econ.map(k => `${k}:${party[k]}`).join(' '));
  const custom = C.makeConfig('custom', ['duel', 'betting', 'nimporte']);
  check('Config : Personnalisé = seulement les clés choisies (clé inconnue ignorée)', custom.duel && custom.betting
    && C.MECHANIC_KEYS.filter(k => !['duel', 'betting'].includes(k)).every(k => custom[k] === false) && !('nimporte' in custom));
  const legacy = makeGame();
  check('Config : ancienne partie sans gameConfig = Classique', C.isClassic(legacy) && C.gameConfig(legacy).preset === 'classic');
  const partial = makeGame({ gameConfig: { preset: 'custom', duel: true, betting: 'oui' } });
  check('Config : valeurs non booléennes ou absentes = OFF', C.on(partial, 'duel') && !C.on(partial, 'betting') && !C.on(partial, 'ghost'));
  check('Config : chaque mécanique a une clé, un libellé, une icône et une famille',
    C.MECHANICS.every(m => m.key && m.label && m.icon && ['show', 'economy'].includes(m.family)) && new Set(C.MECHANIC_KEYS).size === C.MECHANIC_KEYS.length);

  // ---------------------------------------------------------------- lot 2 : mini-jeux
  const M = await load('minigames.js');
  const seq = values => { let i = 0; return () => values[i++ % values.length]; };
  check('Mini-jeux : 7 jeux au catalogue, chacun avec règle courte et durée 5–10 s',
    M.EVENT_GAMES.length === 7 && M.EVENT_GAMES.every(k => M.MINIGAMES[k].rule.length <= 70 && M.MINIGAMES[k].duration >= 5000 && M.MINIGAMES[k].duration <= 10000));
  const d1 = M.drawMinigame(seq([0.31, 0.5, 0.2, 0.7, 0.1])), d2 = M.drawMinigame(seq([0.31, 0.5, 0.2, 0.7, 0.1]));
  check('Mini-jeux : même tirage -> mêmes paramètres', JSON.stringify(d1) === JSON.stringify(d2), d1);
  const mathP = M.MINIGAMES.math.gen(seq([0.4, 0.6, 0.3, 0.9, 0.1, 0.5]));
  check('Calcul éclair : 4 choix distincts dont la bonne réponse', mathP.choices.length === 4 && new Set(mathP.choices).size === 4 && mathP.choices.includes(mathP.answer), mathP);

  const g3 = makeGame();
  const reflex = { kind: 'reflex', origin: 'event', participants: ['a', 'b', 'c'], entries: { a: { v: 300, ok: true }, b: { v: 250, ok: true }, c: { v: 0, ok: false } } };
  const r1 = M.resolveMinigame(g3, reflex), r1b = M.resolveMinigame(g3, reflex);
  check('Réflexe : le plus rapide gagne, celui qui clique trop tôt paie 100 $ partagés',
    r1.winnerIds[0] === 'b' && r1.loserId === 'c' && r1.updates['players/2/cash'] === 900 && r1.updates['players/0/cash'] === 1050 && r1.updates['players/1/cash'] === 1050, r1.updates);
  check('Mini-jeux : résolution déterministe (mêmes entrées -> même résultat)', JSON.stringify(r1) === JSON.stringify(r1b));
  const absent = M.resolveMinigame(g3, { kind: 'mash', origin: 'event', participants: ['a', 'b', 'c'], entries: { a: { v: 4000, ok: true }, c: { v: 5000, ok: true } } });
  check('Mitraillette : un joueur absent est classé dernier et paie', absent.loserId === 'b' && absent.winnerIds[0] === 'a');
  const allFail = M.resolveMinigame(g3, { kind: 'math', origin: 'event', participants: ['a', 'b'], entries: { a: { v: 2000, ok: false }, b: { v: 1000, ok: false } } });
  check('Calcul éclair : tout le monde se trompe -> personne ne paie', !allFail.loserId && !Object.keys(allFail.updates).length);
  const trapNone = M.resolveMinigame(g3, { kind: 'trap', origin: 'event', participants: ['a', 'b', 'c'], entries: {} });
  const trapOne = M.resolveMinigame(g3, { kind: 'trap', origin: 'event', participants: ['a', 'b', 'c'], entries: { c: { v: 1200, ok: false }, a: { v: 3000, ok: false } } });
  check('Le piège : personne ne clique -> rien ; le premier qui clique paie', !trapNone.loserId && trapOne.loserId === 'c' && trapOne.updates['players/2/cash'] === 900);
  const blind = M.resolveMinigame(g3, { kind: 'blind', origin: 'event', participants: ['a', 'b', 'c'], entries: { a: { v: 100, ok: true }, b: { v: 20, ok: true }, c: { v: 50, ok: true } } });
  check('Enchère à l’aveugle : le plus gros prend le pot, le plus petit paie 50 $ de plus',
    blind.winnerIds[0] === 'a' && blind.loserId === 'b' && blind.updates['players/0/cash'] === 1000 - 100 + 170 + 50 && blind.updates['players/1/cash'] === 1000 - 20 - 50 && blind.updates['players/2/cash'] === 950, blind.updates);
  const blindTie = M.resolveMinigame(g3, { kind: 'blind', origin: 'event', participants: ['a', 'b'], entries: { a: { v: 50, ok: true }, b: { v: 50, ok: true } } });
  check('Enchère à l’aveugle : égalité en tête -> pot partagé, personne ne paie de supplément', blindTie.winnerIds.length === 2 && !blindTie.loserId && blindTie.updates['players/0/cash'] === undefined);
  const gGhost = makeGame({ players: [...makeGame().players.slice(0, 2), { id: 'c', name: 'Chloé', cash: -600, bankrupt: true, ghost: true }] });
  const ghostRes = M.resolveMinigame(gGhost, { kind: 'reflex', origin: 'event', participants: ['a', 'b', 'c'], entries: { a: { v: 400, ok: true }, b: { v: 300, ok: true }, c: { v: 200, ok: true } } });
  check('Fantôme : classé premier mais ne gagne ni ne paie ; le paiement va aux vivants', ghostRes.winnerIds[0] === 'c' && ghostRes.loserId === 'a' && ghostRes.updates['players/1/cash'] === 1100 && ghostRes.updates['players/2/cash'] === undefined, ghostRes.updates);
  const duelRes = M.resolveMinigame(g3, { kind: 'reflex', origin: 'duel', participants: ['a', 'b'], entries: { a: { v: 260, ok: true }, b: { v: 410, ok: true } } });
  check('Duel : le perdant paie 50 $ au gagnant', duelRes.updates['players/0/cash'] === 1050 && duelRes.updates['players/1/cash'] === 950 && /Duel/.test(duelRes.text));
  const tooFast = M.cleanEntry('reflex', { v: 12, ok: true }), badBid = M.cleanEntry('blind', { v: 999 }, { options: [0, 20, 50, 100] });
  check('Mini-jeux : entrées nettoyées (réflexe < 80 ms impossible, mise hors barème = 0)', tooFast.v === 80 && badBid.v === 0);
  const bots = M.EVENT_GAMES.map(k => M.botEntry(k, M.MINIGAMES[k].gen(Math.random), Math.random));
  check('Mini-jeux : les bots ont une entrée simulée pour chaque jeu (le piège : parfois aucune)', bots.every((b, i) => M.EVENT_GAMES[i] === 'trap' || (b && b.entry && b.delay > 0)));

  // ---------------------------------------------------------------- lot 3 : testament + fantomes
  const PT = await load('party.js');
  const gw = makeGame({ ownership: { 1: 'c', 2: 'c', 9: 'a' }, buildings: { 1: 2 } });
  gw.players[2].bankrupt = true;
  const toHeir = PT.willUpdates(gw, 'c', 'b');
  check('Testament : l’héritier reçoit propriétés ET bâtiments', toHeir.heirId === 'b' && toHeir.updates['ownership/1'] === 'b' && toHeir.updates['ownership/2'] === 'b' && toHeir.updates['buildings/1'] === undefined && toHeir.count === 2, toHeir);
  const toBank = PT.willUpdates(gw, 'c', 'bank');
  check('Testament : la banque reprend tout (bâtiments détruits)', !toBank.heirId && toBank.updates['ownership/1'] === null && toBank.updates['buildings/1'] === null);
  const gw2 = JSON.parse(JSON.stringify(gw)); gw2.players[1].bankrupt = true;
  check('Testament : héritier entre-temps en faillite -> la banque', PT.willUpdates(gw2, 'c', 'b').heirId === null);
  check('Testament : héritiers = joueurs encore en lice', PT.willHeirs(gw, 'c').join() === 'a,b');
  const gh = makeGame({ haunts: {} });
  gh.players[2] = { ...gh.players[2], bankrupt: true, ghost: true, cash: -700 };
  check('Fantôme : seul un fantôme hante, jamais le Départ ni la prison', PT.canHaunt(gh, 'c', 4).ok && !PT.canHaunt(gh, 'a', 4).ok && !PT.canHaunt(gh, 'c', 21).ok && !PT.canHaunt(gh, 'c', 7).ok);
  const hu = PT.hauntUpdates(gh, 'c', 4);
  check('Fantôme : la case est marquée et le pouvoir consommé pour la manche', hu['haunts/4'].by === 'c' && hu['players/2/hauntRound'] === 3);
  const gh2 = { ...gh, haunts: { 4: { by: 'c', round: 3 } } }; gh2.players = gh.players.map((p, i) => (i === 2 ? { ...p, hauntRound: 3 } : p));
  check('Fantôme : une seule case par manche', !PT.canHaunt(gh2, 'c', 5).ok && PT.canHaunt({ ...gh2, round: 4 }, 'c', 5).ok);
  check('Fantôme : sa nouvelle case remplace l’ancienne', PT.hauntUpdates({ ...gh2, round: 4 }, 'c', 5)['haunts/4'] === null);
  const hit = PT.hauntHit(gh2, 'a', 4);
  check('Fantôme : qui tombe sur la case paie 50 $, la case est libérée', hit && hit.updates['players/0/cash'] === 950 && hit.updates['haunts/4'] === null && !PT.hauntHit(gh2, 'a', 5));

  // ---------------------------------------------------------------- lot 4 : paris, money time, carapace
  const RU = await load('rules.js');
  const CH = await load('chance.js');
  const own = { 1: 'b', 2: 'b' };   // groupe rose complet pour Bob
  const base = RU.rentFor(makeGame({ ownership: own }), 1);
  const mtOff = RU.rentFor(makeGame({ ownership: own, moneyTime: { active: true } }), 1);
  const mtOn = RU.rentFor(makeGame({ ownership: own, moneyTime: { active: true }, gameConfig: C.makeConfig('chaos') }), 1);
  check('Money Time : loyers ×2 seulement si la mécanique est active (Classique inchangé)', mtOff === base && mtOn === base * 2, { base, mtOff, mtOn });
  const pink = 'Pink';
  const bub = RU.rentFor(makeGame({ ownership: own, market: { group: pink, kind: 'bubble', until: 4 }, gameConfig: C.makeConfig('chaos') }), 1);
  const cra = RU.rentFor(makeGame({ ownership: own, market: { group: pink, kind: 'crash', until: 4 }, gameConfig: C.makeConfig('chaos') }), 1);
  const exp = RU.rentFor(makeGame({ ownership: own, round: 5, market: { group: pink, kind: 'bubble', until: 4 }, gameConfig: C.makeConfig('chaos') }), 1);
  check('Bulle / krach : ×2 / ÷2 sur le groupe, plus rien après expiration', bub === base * 2 && cra === Math.round(base / 2) && exp === base, { bub, cra, exp });

  const gb = makeGame({ gameConfig: C.makeConfig('chaos'), turnIndex: 1, lastRoll: { id: 'r0' } });
  gb.bets = { key: PT.betKey(gb), roller: 'b', status: 'open', entries: {} };
  check('Paris : on ne parie pas sur son propre lancer, mise 20/50 seulement', !PT.canBet(gb, 'b', 'six', 20).ok && PT.canBet(gb, 'a', 'six', 20).ok && !PT.canBet(gb, 'a', 'six', 30).ok);
  gb.bets.entries = { a: { kind: 'six', amt: 50 } };
  check('Paris : un seul pari par joueur et par lancer', !PT.canBet(gb, 'a', 'rent', 20).ok && PT.canBet(gb, 'c', 'rent', 20).ok);
  const locked = { ...gb.bets, status: 'locked', lockTs: 1000, roll: { v: 6, id: 'r1' }, entries: { a: { kind: 'six', amt: 50 }, c: { kind: 'rent', amt: 20 } } };
  const gs1 = { ...gb, bets: locked, history: { h1: { ts: 2000, meta: { t: 'roll', p: 'b', v: 6 } } } };
  const s1 = PT.betSettlement(gs1, locked);
  check('Paris : « fait un 6 » gagne ×5 (+200 $ pour 50), « loyer » perd sa mise', s1.deltas.a === 200 && s1.deltas.c === -20 && s1.updates['players/0/cash'] === 1200 && s1.updates['players/2/cash'] === 980, s1.deltas);
  const gs2 = { ...gb, bets: { ...locked, roll: { v: 3 } }, history: { h1: { ts: 500, meta: { t: 'rent', p: 'b' } }, h2: { ts: 2500, meta: { t: 'rent', p: 'b', amt: 40 } } } };
  check('Paris : « loyer » gagne ×2 si le lanceur paie un loyer APRÈS la fermeture', PT.betSettlement(gs2, gs2.bets).deltas.c === 20);
  const gs3 = { ...gb, bets: { ...locked, roll: { v: 2 } }, history: {} }; gs3.players = gb.players.map(p => (p.id === 'b' ? { ...p, inJail: true } : p));
  check('Paris : « prison » reconnu par l’état du joueur (carte, roue, dilemme…)', PT.betOutcome(gs3, gs3.bets).jail === true);
  const gGhostBet = { ...gs1 }; gGhostBet.players = gs1.players.map(p => (p.id === 'a' ? { ...p, bankrupt: true, ghost: true } : p));
  check('Paris : un fantôme parie pour l’honneur (aucun argent)', PT.betSettlement(gGhostBet, locked).updates['players/0/cash'] === undefined && PT.betSettlement(gGhostBet, locked).deltas.a === 200);

  const mt1 = makeGame({ gameConfig: C.makeConfig('chaos'), round: 28 });
  const mt2 = makeGame({ gameConfig: C.makeConfig('chaos'), round: 27 });
  const mt3 = makeGame({ gameConfig: C.makeConfig('chaos'), round: 5, settings: { target: 3000, maxRounds: 0 } }); mt3.players[1].cash = 2450;
  check('Money Time : 3 dernières manches (28/30), pas avant (27/30)', PT.moneyTimeDue(mt1) && PT.moneyTimeDue(mt1).reason === 'rounds' && !PT.moneyTimeDue(mt2));
  check('Money Time : sans limite de manches, déclenché à 80 % de l’objectif', PT.moneyTimeDue(mt3) && PT.moneyTimeDue(mt3).reason === 'target' && PT.moneyTimeDue(mt3).leader === 'b');
  check('Money Time : une seule activation par partie', !PT.moneyTimeDue({ ...mt1, moneyTime: { active: true } }));

  const lead = makeGame({ gameConfig: C.makeConfig('chaos'), ownership: { 1: 'b', 2: 'b' } }); lead.players[1].cash = 2000;
  const drawn = CH.drawChance(lead, 'a', seq([0.9, 0.05, 0.2]));
  const drawnClassic = CH.drawChance({ ...lead, gameConfig: C.makeConfig('classic') }, 'a', seq([0.9, 0.05, 0.2]));
  const drawnLeader = CH.drawChance(lead, 'b', seq([0.9, 0.05, 0.2]));
  check('Carapace : tirée par un joueur en retard (rare), jamais par le leader, jamais en Classique', drawn.key === 'audit' && drawnClassic.key !== 'audit' && drawnLeader.key !== 'audit' && drawnLeader.key !== 'squat', { drawn: drawn.key, classic: drawnClassic.key, leader: drawnLeader.key });
  const audit = CH.resolveCard(lead, 'a', 'audit');
  check('Carapace : contrôle fiscal = le leader perd 15 % de son argent', audit.updates['players/1/cash'] === 1700 && /15|300/.test(audit.text), audit.text);
  const squat = CH.resolveCard(lead, 'c', 'squat');
  const rentPink = Math.max(RU.rentFor(lead, 1), RU.rentFor(lead, 2));   // la plus belle propriete du leader
  check('Carapace : squat = le loyer de la plus belle propriété du leader, payé par le leader', squat.updates['players/2/cash'] === 1000 + rentPink && squat.updates['players/1/cash'] === 2000 - rentPink, squat.text);
  const normalDraws = new Set(Array.from({ length: 400 }, (_, i) => CH.drawChance(makeGame(), 'a', seq([0.2, (i % 13) / 13])).key));
  check('Carapace : jamais dans le tirage normal des cartes', !normalDraws.has('audit') && !normalDraws.has('squat'), [...normalDraws].join(','));

  // ---------------------------------------------------------------- lot 5 : bulle / krach + pacte
  const B = await load('board.js');
  const mk = PT.drawMarket(makeGame({ round: 6 }), seq([0.99, 0.2]));
  const mk2 = PT.drawMarket(makeGame({ round: 6 }), seq([0.0, 0.7]));
  check('Bulle/krach : groupe de villes valide, 2 manches (courante + suivante)', Object.keys(B.GROUPS).includes(mk.group) && mk.kind === 'bubble' && mk.from === 6 && mk.until === 7 && mk2.kind === 'crash', { mk, mk2 });
  const gm = makeGame({ round: 7, market: mk });
  check('Bulle/krach : actif jusqu’à sa dernière manche, expiré après', PT.marketActive(gm) && !PT.marketExpired(gm) && PT.marketExpired({ ...gm, round: 8 }) && !PT.marketActive({ ...gm, round: 8 }));
  const gd = makeGame();
  const d6ok = PT.dealSettlement(gd, { kind: 'six', playerId: 'b' }, 6), d6ko = PT.dealSettlement(gd, { kind: 'six', playerId: 'b' }, 4);
  check('Pacte « Fais un 6 » : +200 sur un 6, −100 sinon', d6ok.success && d6ok.amt === 200 && d6ok.updates['players/1/cash'] === 1200 && !d6ko.success && d6ko.updates['players/1/cash'] === 900);
  const hi = PT.dealSettlement(gd, { kind: 'high', playerId: 'a' }, 5), ev = PT.dealSettlement(gd, { kind: 'even', playerId: 'a' }, 3);
  check('Pacte « 5 ou 6 » réussi sur 5 ; « pair » perdu sur 3', hi.success && hi.amt === 120 && !ev.success && ev.amt === -60);
  check('Pacte : tirage limité aux pactes connus', ['six', 'high', 'even'].includes(PT.drawDeal(seq([0.5]))) && PT.drawDeal(seq([0.99])) === 'even');

  // ---------------------------------------------------------------- lot 6 : primes, recap, carnet
  const H = (ts, meta, text = '') => ({ ts, meta, text });
  const gf = makeGame({ history: {
    h1: H(1, { t: 'rent', p: 'a', o: 'b', amt: 120 }), h2: H(2, { t: 'rent', p: 'c', o: 'a', amt: 300 }, 'Chloé paie 300 $ à Alice'),
    h3: H(3, { t: 'minigame', w: 'c', l: 'a', origin: 'event' }), h4: H(4, { t: 'minigame', w: 'c', l: 'b', origin: 'duel' }),
    h5: H(5, { t: 'chance', p: 'b', key: 'crypto' }), h6: H(6, { t: 'chance', p: 'b', key: 'jail' }), h7: H(7, { t: 'chance', p: 'a', key: 'x' }),
    h8: H(8, { t: 'jail', p: 'b' }), h9: H(9, { t: 'buy', p: 'a', amt: 400 }) } });
  const bo = PT.secretBonuses(gf);
  check('Primes secrètes : roi du loyer, champion des mini-jeux, accro à la Chance', bo.length === 3 && bo[0].winners.join() === 'a' && bo[1].winners.join() === 'c' && bo[2].winners.join() === 'b', bo.map(b => b.key + ':' + b.winners));
  const tie = PT.secretBonuses(makeGame({ history: { x: H(1, { t: 'chance', p: 'a' }), y: H(2, { t: 'chance', p: 'b' }) } }));
  check('Primes secrètes : ex aequo -> chacun touche ; aucune donnée -> personne', tie[2].winners.sort().join() === 'a,b' && tie[0].winners.length === 0);
  const bu = PT.bonusUpdates(gf, bo);
  check('Primes secrètes : +300 $ par catégorie gagnée', bu['players/0/cash'] === 1300 && bu['players/1/cash'] === 1300 && bu['players/2/cash'] === 1300);
  const flip = makeGame({ history: { r: H(1, { t: 'rent', p: 'a', o: 'b', amt: 50 }) } }); flip.players[0].cash = 1200; flip.players[1].cash = 1000;
  const afterFlip = RU.applyUpdates(flip, PT.bonusUpdates(flip, PT.secretBonuses(flip)));
  check('Primes secrètes : elles peuvent renverser le classement', RU.ranking(flip)[0].id === 'a' && RU.ranking(afterFlip)[0].id === 'b');
  const titles = PT.recapTitles(gf);
  const tit = k => (titles.find(t => t.key === k) || {}).pid;
  check('Récap : titres (pigeon, roi du loyer, flambeur, champion des mini-jeux)', tit('pigeon') === 'c' && tit('landlord') === 'a' && tit('spender') === 'a' && tit('gamer') === 'c', titles.map(t => `${t.key}:${t.pid}`));
  check('Récap : plus gros retournement = l’évènement d’argent le plus violent', PT.biggestSwing(gf).amt === 300 && /300/.test(PT.biggestSwing(gf).text));
  const gt = makeGame({ trail: { 1: { a: 1000, b: 1025 }, 2: { a: 1300, b: 900 }, final: { a: 800, b: 1500 }, 3: { a: 1200, b: 1100 } } });
  check('Récap : courbe triée (manches puis finale) et changements de leader', PT.trailSeries(gt).map(t => t.round).join() === '1,2,3,Infinity' && PT.leadChanges(gt) === 2);
  // Carnet local : faux localStorage dans Node.
  const store = {}; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ST = await load('stats.js');
  const done = makeGame({ phase: 'finished', winnerId: 'a', finishedAt: 42, history: { r: H(1, { t: 'rent', p: 'c', o: 'a', amt: 900 }), k: H(2, { t: 'bankrupt', p: 'c' }) } });
  done.players[2].bankrupt = true;
  ST.recordGame(done); ST.recordGame(done);
  const book = ST.loadStats();
  check('Carnet local : une partie comptée une seule fois, victoires et faillites par prénom', book.players.Alice.games === 1 && book.players.Alice.wins === 1 && book.players['Chloé'].bankruptcies === 1);
  check('Carnet local : rivalité « Alice a ruiné Chloé »', ST.rivalryCount('Alice', 'Chloé') === 1 && ST.topRivalry(['Alice', 'Chloé', 'Bob']).n === 1);
  check('Carnet local : aucune donnée sensible (prénoms et compteurs seulement)', Object.keys(JSON.parse(store['banqueroll-stats-v1'])).sort().join() === 'players,rivals,seen');

  // ---------------------------------------------------------------- cartes de regles du lancement
  const BR = await load('briefing.js');
  const CF = await load('config.js');
  const deck = cfg => BR.briefingCards(makeGame({ gameConfig: CF.makeConfig(cfg) }));
  const cl = deck('classic'), ch = deck('chaos'), pa = deck('party');
  check('Cartes de règles : Classique = les 3 bases, sans mécanique', cl.length === 3 && cl.every(c => !c.special) && /3000\s\$/.test(cl[0].lines[0]) && /30 manches/.test(cl[0].lines[0]));
  check('Cartes de règles : Chaos = bases + 12 mécaniques, paris expliqués en premier', ch.length === 15 && ch[3].key === 'betting'
    && ch[3].lines.some(l => /×5/.test(l)) && ch[3].lines.some(l => /20\s\$ ou 50\s\$/.test(l)), ch.map(c => c.key).join());
  check('Cartes de règles : Party = une carte par mécanique active, rien de plus', pa.length === 3 + CF.PRESETS.party.keys.length && !pa.some(c => c.key === 'blueShell'));
  check('Cartes de règles : chiffres tirés du moteur (pacte 12 s, testament 15 s, mini-jeu 100 $)',
    ch.find(c => c.key === 'hostDeals').lines.some(l => /12 s/.test(l)) && ch.find(c => c.key === 'testament').lines.some(l => /15 s/.test(l))
    && ch.find(c => c.key === 'eventMinigames').lines.some(l => /100\s\$/.test(l)));
  check('Cartes de règles : texte court (≤ 6 lignes, ≤ 150 caractères par ligne)', ch.every(c => c.lines.length <= 6 && c.lines.every(l => l.length <= 150)));
  const RL = await load('rules.js');
  const bg = makeGame({ briefing: { endAt: Date.now() + 60000, ready: {} } });
  bg.players[2].bot = true;
  check('Briefing : bloque le lancer tant que tout le monde n’est pas prêt', RL.openBlocking(bg) && !BR.briefingDone(bg) && BR.briefingPending(bg).map(p => p.id).join() === 'a,b');
  bg.briefing.ready = { a: true, b: true };
  check('Briefing : terminé quand tous les humains sont prêts (les bots ne comptent pas)', BR.briefingDone(bg));
  check('Briefing : terminé quand le délai est écoulé', BR.briefingDone(makeGame({ briefing: { endAt: 1, ready: {} } })));
  check('Briefing : une partie sans briefing n’est pas bloquée', !RL.openBlocking(makeGame()) && BR.briefingDone(makeGame()));

  // ---------------------------------------------------------------- fenetre de paris garantie
  const PB = await load('party.js');
  const t0 = 1_000_000;
  const hg = (bets, over = {}) => { const g = makeGame({ gameConfig: CF.makeConfig('custom', ['betting']), turnTimer: 30, turnDeadline: t0 + 30000, lastRoll: { id: 'r1' }, ...over }); g.bets = bets && { key: PB.betKey(g), roller: 'a', status: 'open', at: t0, ...bets }; return g; };
  check('Fenêtre de paris : le lanceur attend tant que personne n’a parié ni passé', PB.betHold(hg({}), t0 + 2000) === PB.BET_WINDOW_MS - 2000);
  check('Fenêtre de paris : libre quand tous les autres ont parié ou passé', PB.betHold(hg({ entries: { b: { kind: 'six', amt: 20 } }, skip: { c: true } }), t0 + 1000) === 0
    && PB.betHold(hg({ skip: { b: true } }), t0 + 1000) > 0);
  check('Fenêtre de paris : libre une fois le délai écoulé', PB.betHold(hg({}), t0 + PB.BET_WINDOW_MS + 1) === 0);
  check('Fenêtre de paris : paris pas encore ouverts → courte attente, jamais de blocage', PB.betHold(hg(null), t0 + 1000) === PB.BET_OPEN_WAIT_MS - 1000 && PB.betHold(hg(null), t0 + PB.BET_OPEN_WAIT_MS) === 0);
  check('Fenêtre de paris : aucune attente en Classique ni pendant les cartes de règles',
    PB.betHold({ ...hg({}), gameConfig: CF.makeConfig('classic') }, t0) === 0 && PB.betHold(hg({}, { briefing: { endAt: t0 + 60000 } }), t0) === 0);

  const passed = results.filter(Boolean).length;
  console.log(`\n===== PARTY (pur) : ${passed}/${results.length} =====`);
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
