// Regles des mecaniques de party : fonctions PURES (testees dans Node).
// Elles lisent un etat de partie et renvoient des valeurs ou des mises a jour
// Firebase. party-actions.js les commite ; rules.js les consulte pour les loyers.

import { BOARD, GROUPS, START_INDEX, JAIL_INDEX } from './board.js';
import { ownedBy, playerById, indexOfPlayer, roundsOf, targetOf, ranking, netWorth } from './rules.js';

// ================================================================ testament
export const WILL_MS = 10000;

// Heritiers possibles : les joueurs encore en lice.
export const willHeirs = (game, deceasedId) => (game.players || []).filter(p => p.id !== deceasedId && !p.bankrupt).map(p => p.id);

// Transmission : vers un heritier (proprietes ET batiments), ou retour a la banque.
// Un heritier qui n'est plus en lice au moment de la resolution -> la banque.
export function willUpdates(game, deceasedId, heirId) {
  const heir = heirId && heirId !== 'bank' ? playerById(game, heirId) : null;
  const valid = !!heir && !heir.bankrupt;
  const updates = {};
  const props = ownedBy(game, deceasedId);
  props.forEach(pos => {
    updates[`ownership/${pos}`] = valid ? heir.id : null;
    if (!valid) updates[`buildings/${pos}`] = null;
  });
  return { updates, heirId: valid ? heir.id : null, count: props.length };
}

// ================================================================ fantomes
export const HAUNT_PENALTY = 50;
// Une case hantable : tout sauf le Depart et la prison.
export const hauntable = pos => Number.isInteger(pos) && pos >= 0 && pos < BOARD.length && pos !== START_INDEX && pos !== JAIL_INDEX;

// Un fantome hante une case par manche ; sa nouvelle case remplace l'ancienne.
export function canHaunt(game, ghostId, pos) {
  const g = playerById(game, ghostId);
  if (!g || !g.bankrupt || !g.ghost) return { ok: false, reason: 'Seul un fantôme peut hanter.' };
  if (!hauntable(pos)) return { ok: false, reason: 'Ni le Départ ni la prison.' };
  if ((g.hauntRound || 0) === (game.round || 1)) return { ok: false, reason: 'Une case par manche. Reviens à la prochaine.' };
  return { ok: true };
}

export function hauntUpdates(game, ghostId, pos) {
  const updates = {};
  Object.entries(game.haunts || {}).forEach(([p, h]) => { if (h && h.by === ghostId) updates[`haunts/${p}`] = null; });
  updates[`haunts/${pos}`] = { by: ghostId, round: game.round || 1 };
  updates[`players/${indexOfPlayer(game, ghostId)}/hauntRound`] = game.round || 1;
  return updates;
}

// Le joueur qui arrive sur une case hantee paie (a la banque) ; la case est liberee.
export function hauntHit(game, playerId, pos) {
  const h = (game.haunts || {})[pos];
  if (!h || h.by === playerId) return null;
  const i = indexOfPlayer(game, playerId);
  return { by: h.by, updates: { [`players/${i}/cash`]: (game.players[i].cash || 0) - HAUNT_PENALTY, [`haunts/${pos}`]: null } };
}

// ================================================================ paris
// Pendant le tour d'un autre : une mise (20 ou 50 $) sur le lancer a venir.
// Rien n'est preleve a la mise : tout se regle a la resolution (gain = mise x (cote - 1),
// perte = la mise). Un tour sans lancer (prison, tour passe) annule les paris.
export const BET_KINDS = {
  rent: { label: 'paie un loyer', short: 'Loyer', odds: 2 },
  jail: { label: 'finit en prison', short: 'Prison', odds: 5 },
  six:  { label: 'fait un 6', short: 'Un 6', odds: 5 },
};
export const BET_STAKES = [20, 50];

// Une fenetre de paris par lancer : la manche, le joueur et le dernier lancer l'identifient.
export const betKey = game => `${game.round || 1}-${game.turnIndex}-${(game.lastRoll && game.lastRoll.id) || '0'}`;

export function canBet(game, pid, kind, amt) {
  const b = game.bets;
  const p = playerById(game, pid);
  if (!b || b.status !== 'open' || b.key !== betKey(game)) return { ok: false, reason: 'Les paris sont fermés.' };
  if (!p || pid === b.roller) return { ok: false, reason: 'On ne parie pas sur son propre lancer.' };
  if (p.bankrupt && !p.ghost) return { ok: false, reason: 'Hors jeu.' };
  if (!BET_KINDS[kind] || !BET_STAKES.includes(amt)) return { ok: false, reason: 'Pari invalide.' };
  if ((b.entries || {})[pid]) return { ok: false, reason: 'Un seul pari par lancer.' };
  if (!p.bankrupt && (p.cash || 0) < amt) return { ok: false, reason: 'Pas assez d’argent pour cette mise.' };
  return { ok: true };
}

// Ce qui est arrive au lanceur depuis la fermeture des paris (lu dans l'historique partage).
export function betOutcome(game, bets) {
  const lines = Object.values(game.history || {}).filter(h => h && h.ts >= (bets.lockTs || 0) && h.meta && h.meta.p === bets.roller);
  // Prison : la ligne d'historique, ou l'etat du joueur en fin de tour (tous les chemins : case, carte, roue, dilemme).
  const jailed = lines.some(h => h.meta.t === 'jail' || (h.meta.t === 'chance' && h.meta.key === 'jail'))
    || (playerById(game, bets.roller) || {}).inJail === true;
  return { rent: lines.some(h => h.meta.t === 'rent'), jail: jailed, six: !!bets.roll && bets.roll.v === 6 };
}

export function betSettlement(game, bets) {
  const out = betOutcome(game, bets);
  const deltas = {}, updates = {};
  Object.entries(bets.entries || {}).forEach(([pid, e]) => {
    const def = BET_KINDS[e.kind];
    if (!def) return;
    deltas[pid] = out[e.kind] ? e.amt * (def.odds - 1) : -e.amt;
    const p = playerById(game, pid);
    if (p && !p.bankrupt) { const i = indexOfPlayer(game, pid); updates[`players/${i}/cash`] = (game.players[i].cash || 0) + deltas[pid]; }
  });
  const name = id => (playerById(game, id) || {}).name || '?';
  const won = Object.entries(deltas).filter(([, d]) => d > 0), lost = Object.entries(deltas).filter(([, d]) => d < 0);
  const text = !Object.keys(deltas).length ? '' : `Paris sur ${name(bets.roller)} : ${[
    won.length ? `${won.map(([id, d]) => `${name(id)} +${d} $`).join(', ')}` : '',
    lost.length ? `${lost.map(([id, d]) => `${name(id)} ${d} $`).join(', ')}` : '',
  ].filter(Boolean).join(' · ')}.`;
  return { outcome: out, deltas, updates, text };
}

// ================================================================ money time
export const MONEY_TIME_SHARE = 0.8;
export const MONEY_TIME_ROUNDS = 3;

// Une seule activation par partie : 3 dernieres manches, ou un joueur a 80 % de l'objectif
// (seul declencheur possible sans limite de manches).
export function moneyTimeDue(game) {
  if (!game || game.phase !== 'playing' || game.moneyTime) return null;
  const max = roundsOf(game);
  if (max > 0 && (game.round || 1) >= max - (MONEY_TIME_ROUNDS - 1)) return { reason: 'rounds' };
  const best = ranking(game)[0];
  if (best && netWorth(game, best) >= targetOf(game) * MONEY_TIME_SHARE) return { reason: 'target', leader: best.id };
  return null;
}

// ================================================================ bulle / krach
// Un evenement de la case EVENT : pendant 2 manches (la courante et la suivante),
// les loyers d'un groupe font x2 (bulle) ou /2 (krach). Le calcul est dans rules.rentFactor.
export const MARKET_ROUNDS = 2;
export const marketGroups = () => Object.keys(GROUPS);

export function drawMarket(game, rng = Math.random) {
  const groups = marketGroups();
  const group = groups[Math.floor(rng() * groups.length)];
  const kind = rng() < 0.5 ? 'bubble' : 'crash';
  const round = game.round || 1;
  return { group, kind, from: round, until: round + MARKET_ROUNDS - 1 };
}
export const marketActive = game => !!(game.market && game.market.group && (game.round || 1) <= game.market.until);
export const marketExpired = game => !!(game.market && game.market.group && (game.round || 1) > game.market.until);

// ================================================================ pacte du presentateur
// Le moteur (pas l'IA) propose un pari au joueur avant son lancer. 8 secondes pour repondre ;
// le silence vaut refus. Regle a la fin du tour, sur la valeur du de deja tiree.
export const DEAL_MS = 8000;
export const DEALS = {
  six:  { label: 'Fais un 6', reward: 200, penalty: 100, test: v => v === 6 },
  high: { label: 'Fais 5 ou 6', reward: 120, penalty: 80, test: v => v >= 5 },
  even: { label: 'Fais un nombre pair', reward: 80, penalty: 60, test: v => v % 2 === 0 },
};
export const drawDeal = (rng = Math.random) => { const keys = Object.keys(DEALS); return keys[Math.floor(rng() * keys.length)]; };

// Resultat d'un pacte accepte, d'apres la valeur du de.
export function dealSettlement(game, deal, die) {
  const def = DEALS[deal.kind];
  const i = indexOfPlayer(game, deal.playerId);
  if (!def || i < 0) return null;
  const success = def.test(die);
  const amt = success ? def.reward : -def.penalty;
  return { success, amt, updates: { [`players/${i}/cash`]: (game.players[i].cash || 0) + amt } };
}

// ================================================================ primes secretes
// Trois categories annoncees au lancement, gagnants reveles a la fin. +300 $ chacune
// (ex aequo : chacun touche la prime). Calcul deterministe a partir de l'historique.
export const BONUS_VALUE = 300;
export const BONUSES = [
  { key: 'rentKing', label: 'Roi du loyer', desc: 'Le plus gros loyer encaissé en une fois' },
  { key: 'miniKing', label: 'Champion des mini-jeux', desc: 'Le plus de mini-jeux et de duels gagnés' },
  { key: 'chanceAddict', label: 'Accro à la Chance', desc: 'Le plus de cartes, dilemmes et roues' },
];

const historyOf = game => Object.values(game.history || {}).filter(h => h && h.meta).sort((a, b) => (a.ts || 0) - (b.ts || 0));

export function bonusScores(game) {
  const scores = { rentKing: {}, miniKing: {}, chanceAddict: {} };
  historyOf(game).forEach(({ meta: m }) => {
    if (m.t === 'rent' && m.o) scores.rentKing[m.o] = Math.max(scores.rentKing[m.o] || 0, m.amt || 0);
    if (m.t === 'minigame' && m.w) scores.miniKing[m.w] = (scores.miniKing[m.w] || 0) + 1;
    if (m.t === 'chance' && m.p) scores.chanceAddict[m.p] = (scores.chanceAddict[m.p] || 0) + 1;
  });
  return scores;
}

export function secretBonuses(game) {
  const scores = bonusScores(game);
  const alive = new Set((game.players || []).filter(p => !p.bankrupt).map(p => p.id));
  return BONUSES.map(b => {
    const entries = Object.entries(scores[b.key]).filter(([id]) => alive.has(id));
    const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
    const winners = max > 0 ? entries.filter(([, v]) => v === max).map(([id]) => id) : [];
    return { key: b.key, label: b.label, desc: b.desc, winners, score: max, value: BONUS_VALUE };
  });
}

// Mises a jour des primes : +300 $ a chaque gagnant (en lice).
export function bonusUpdates(game, bonuses) {
  const updates = {};
  bonuses.forEach(b => b.winners.forEach(id => {
    const i = indexOfPlayer(game, id);
    const key = `players/${i}/cash`;
    updates[key] = (updates[key] !== undefined ? updates[key] : (game.players[i].cash || 0)) + b.value;
  }));
  return updates;
}

// ================================================================ recapitulatif de fin
// Statistiques par joueur, titres droles, courbe de fortune, changements de leader,
// plus gros retournement. Tout vient de l'historique et de la trace des fortunes.
const MONEY_EVENTS = ['rent', 'chance', 'minigame', 'bets', 'deal', 'haunt', 'event', 'auction'];

export function playerStats(game) {
  const st = {};
  const get = id => (st[id] = st[id] || { rentPaid: 0, rentReceived: 0, jail: 0, buys: 0, spent: 0, miniWins: 0, duelWins: 0, betsWon: 0, chance: 0, bankrupt: false, ruinedBy: null });
  (game.players || []).forEach(p => { get(p.id).bankrupt = !!p.bankrupt; });
  const lastRentPayer = {};
  historyOf(game).forEach(({ meta: m }) => {
    if (m.t === 'rent' && m.p) { get(m.p).rentPaid += m.amt || 0; if (m.o) { get(m.o).rentReceived += m.amt || 0; lastRentPayer[m.p] = m.o; } }
    if ((m.t === 'jail' || (m.t === 'chance' && m.key === 'jail')) && m.p) get(m.p).jail++;
    if (m.t === 'buy' && m.p) { get(m.p).buys++; get(m.p).spent += m.amt || 0; }
    if (m.t === 'auction' && m.p) { get(m.p).buys++; get(m.p).spent += m.amt || 0; }
    if (m.t === 'minigame' && m.w) { if (m.origin === 'duel') get(m.w).duelWins++; else get(m.w).miniWins++; }
    if (m.t === 'bets' && m.w) get(m.w).betsWon++;
    if (m.t === 'chance' && m.p) get(m.p).chance++;
    if (m.t === 'bankrupt' && m.p) get(m.p).ruinedBy = lastRentPayer[m.p] || null;
  });
  return st;
}

// Titres : chacun n'est decerne que si la statistique existe vraiment.
export function recapTitles(game) {
  const st = playerStats(game);
  const ids = Object.keys(st);
  const best = (f, min = 1) => { const top = ids.map(id => [id, f(st[id])]).sort((a, b) => b[1] - a[1])[0]; return top && top[1] >= min ? top : null; };
  const titles = [];
  const add = (key, label, why, pick) => { if (pick) titles.push({ key, label, pid: pick[0], why: why(pick[1]) }); };
  add('pigeon', 'Pigeon de la soirée', v => `${v} $ de loyers payés`, best(s => s.rentPaid, 1));
  add('landlord', 'Roi du loyer', v => `${v} $ de loyers encaissés`, best(s => s.rentReceived, 1));
  add('jailbird', 'Abonné à la prison', v => `${v} séjour${v > 1 ? 's' : ''} derrière les barreaux`, best(s => s.jail, 2));
  add('spender', 'Flambeur', v => `${v} $ dépensés en villes`, best(s => s.spent, 300));
  add('gamer', 'Champion des mini-jeux', v => `${v} mini-jeu${v > 1 ? 'x' : ''} gagné${v > 1 ? 's' : ''}`, best(s => s.miniWins + s.duelWins, 1));
  add('bookie', 'Bookmaker du canapé', v => `${v} pari${v > 1 ? 's' : ''} gagné${v > 1 ? 's' : ''}`, best(s => s.betsWon, 1));
  const alive = (game.players || []).filter(p => !p.bankrupt);
  const trail = trailSeries(game);
  // Survivant : le joueur encore en lice dont la fortune est descendue le plus bas.
  const lows = alive.map(p => [p.id, Math.min(...trail.map(t => (t.values[p.id] !== undefined ? t.values[p.id] : Infinity)))]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1]);
  if (lows.length > 1) titles.push({ key: 'survivor', label: 'Survivant', pid: lows[0][0], why: `remonté depuis ${lows[0][1]} $` });
  return titles;
}

// Trace des fortunes : une valeur par manche (ecrite par l'hote), triee.
export function trailSeries(game) {
  return Object.entries(game.trail || {}).map(([k, v]) => ({ round: k === 'final' ? Infinity : Number(k), values: v || {} }))
    .filter(t => !Number.isNaN(t.round)).sort((a, b) => a.round - b.round);
}

export function leadChanges(game) {
  let prev = null, n = 0;
  trailSeries(game).forEach(t => {
    const lead = Object.entries(t.values).sort((a, b) => b[1] - a[1])[0];
    if (!lead) return;
    if (prev && lead[0] !== prev) n++;
    prev = lead[0];
  });
  return n;
}

// Plus gros retournement : l'evenement d'argent le plus violent de la partie.
export function biggestSwing(game) {
  let best = null;
  historyOf(game).forEach(h => {
    const m = h.meta;
    if (!MONEY_EVENTS.includes(m.t)) return;
    const v = Math.abs(m.amt || m.hit || 0);
    if (v && (!best || v > best.amt)) best = { amt: v, text: h.text, p: m.p || null };
  });
  return best;
}

// Statistiques d'une partie pour le carnet local (par prenom).
export function gameStatsByName(game) {
  const st = playerStats(game);
  const name = id => (playerById(game, id) || {}).name;
  const out = {};
  (game.players || []).forEach(p => {
    const s = st[p.id] || {};
    out[p.name] = { games: 1, wins: game.winnerId === p.id ? 1 : 0, bankruptcies: p.bankrupt ? 1 : 0, buys: s.buys || 0,
      duelsWon: s.duelWins || 0, minigamesWon: s.miniWins || 0, betsWon: s.betsWon || 0, rentPaid: s.rentPaid || 0 };
  });
  const ruins = [];
  Object.entries(st).forEach(([id, s]) => { if (s.ruinedBy && name(s.ruinedBy) && name(id)) ruins.push([name(s.ruinedBy), name(id)]); });
  return { players: out, ruins };
}
