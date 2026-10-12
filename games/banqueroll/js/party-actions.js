// Actions et arbitrage des mecaniques de party.
//
// Regles multijoueur (les memes que le reste du jeu) :
// - le hasard est tire UNE fois par un seul client puis ecrit dans l'etat ;
// - tout ce qui expire est resolu par l'HOTE, une seule fois (verrou local +
//   transaction Firebase quand plusieurs ecritures peuvent se croiser) ;
// - chaque mecanique est gardee par on(game, cle) : en Classique, rien ici ne
//   s'execute ni n'ecrit.

import { S, db, ref, push, remove, commit, runTransaction, pushHistory, serverNow } from './net.js';
import { on } from './config.js';
import { playerById, currentPlayer, ownedBy, netWorth, indexOfPlayer, openBlocking } from './rules.js';
import { WILL_MS, willHeirs, willUpdates, canHaunt, hauntUpdates, hauntHit, BET_KINDS, betKey, canBet, betSettlement, moneyTimeDue,
  drawMarket, marketExpired, DEAL_MS, DEALS, drawDeal, dealSettlement, BET_WINDOW_MS, betHold } from './party.js';
import { GROUP_LABELS } from './board.js';
import { JAIL_INDEX, BOARD, de } from './board.js';
import { toast } from './fx.js';
import { MINIGAMES, INTRO_MS, drawMinigame, drawDuel, cleanEntry, botEntry, resolveMinigame } from './minigames.js';
import { endTurn, handleLanding, makeId } from './actions.js';

const now = () => Date.now();
// Transaction tolerante : une ecriture sur un noeud parent peut l'annuler (« set »).
// Elle renvoie false au lieu de lever : l'appelant reessaie au tick suivant.
async function tx(r, fn) {
  try { await runTransaction(r, fn); return true; } catch (e) { return false; }
}
const partyGuards = { reactClean: 0, minigame: null, botsFor: null, will: null, willTimeout: null, bets: null, betsOpen: null, moneyTime: null,
  marketEnd: null, dealOffer: null, dealTimeout: null, deal: null, lastDealTurn: -99, turns: 0, turnKey: null };
const mgRef = code => ref(db, `banqueroll/${code}/minigame`);

// ================================================================ reactions
// Purement cosmetique : n'ecrit que dans reactions/, jamais dans l'economie.
export const REACTIONS = {
  tomato: { icon:'🍅', label:'tomate' },
  coin:   { icon:'🪙', label:'pièce' },
  crown:  { icon:'👑', label:'couronne' },
  clown:  { icon:'🤡', label:'clown' },
};
const REACT_GAP_MS = 700;           // une reaction toutes les 0,7 s au plus
const REACT_WINDOW_MS = 10000;      // et 6 par fenetre de 10 s
const REACT_MAX = 6;
const sent = [];

export function canReact() {
  const t = now();
  while (sent.length && t - sent[0] > REACT_WINDOW_MS) sent.shift();
  if (sent.length && t - sent[sent.length - 1] < REACT_GAP_MS) return false;
  return sent.length < REACT_MAX;
}

export async function sendReaction(kind, to, by = S.playerId) {
  const game = S.game;
  if (!game || !on(game, 'reactions') || game.phase !== 'playing') return false;
  if (!REACTIONS[kind] || !playerById(game, to) || to === by) return false;
  if (by === S.playerId && !canReact()) { toast('Doucement : les tomates ne poussent pas si vite.'); return false; }
  if (by === S.playerId) sent.push(now());
  await push(ref(db, `banqueroll/${game.code}/reactions`), { from: by, to, kind, ts: now() });
  return true;
}

// Hote : on ne garde que les reactions recentes (le noeud ne grossit pas).
function cleanReactions(game) {
  if (!game.reactions || now() - partyGuards.reactClean < 10000) return;
  partyGuards.reactClean = now();
  Object.entries(game.reactions).forEach(([k, r]) => {
    if (!r || now() - (r.ts || 0) > 60000) remove(ref(db, `banqueroll/${game.code}/reactions/${k}`));
  });
}

// ================================================================ encheres tendues
export const AUCTION_EXTEND_MS = 5000;   // une offre dans les 5 dernieres secondes rajoute 5 s
export const AUCTION_LOG_MAX = 12;

// Offre en transaction : deux offres simultanees ne s'ecrasent plus, et la
// prolongation est calculee sur l'etat reel, pas sur la copie locale.
export async function placeBidExtended(game, bid, by) {
  const bidder = playerById(game, by);
  let outcome = null;
  await tx(ref(db, `banqueroll/${game.code}/auction`), a => {
    outcome = null;
    if (!a || a.status !== 'open') { outcome = 'closed'; return; }
    if (now() > a.endAt) { outcome = 'late'; return; }
    if (bid < a.nextBid) { outcome = 'low'; return; }
    const left = a.endAt - now();
    const extended = left < AUCTION_EXTEND_MS;
    const log = [...(a.log || []), { pid: by, amt: bid, ts: now() }].slice(-AUCTION_LOG_MAX);
    const passes = { ...(a.passes || {}) };
    delete passes[by];                                     // surencherir annule un « je passe »
    outcome = extended ? 'extended' : 'ok';
    return { ...a, highestBid: bid, highestBidder: by, nextBid: bid + 10, log, passes,
      endAt: extended ? a.endAt + AUCTION_EXTEND_MS : a.endAt, extensions: (a.extensions || 0) + (extended ? 1 : 0) };
  });
  if (outcome === 'low') toast('Offre trop faible : quelqu’un a surenchéri.');
  if (outcome === 'closed' || outcome === 'late') toast('Trop tard : l’enchère est close.');
  return { outcome, bidder };
}

export async function passAuction(by = S.playerId) {
  const game = S.game;
  const a = game && game.auction;
  if (!a || a.status !== 'open' || !on(game, 'extendedAuctions')) return;
  if (a.highestBidder === by) { toast('Tu mènes l’enchère : rien à passer.'); return; }
  await commit(game.code, { [`auction/passes/${by}`]: true });
}

// Qui peut encore encherir : les joueurs en lice (ni en faillite, ni fantomes).
export const auctionBidders = game => (game.players || []).filter(p => !p.bankrupt);

// L'enchere peut se fermer avant la fin : tout le monde a passe, sauf le meneur.
export function auctionDone(game) {
  const a = game.auction;
  if (!a || a.status !== 'open' || !on(game, 'extendedAuctions')) return false;
  const passes = a.passes || {};
  const others = auctionBidders(game).filter(p => p.id !== a.highestBidder);
  return others.length > 0 && others.every(p => passes[p.id]);
}

// ================================================================ mini-jeux
// Etats : active (intro puis jeu, selon l'heure serveur) -> resolving -> resolved.
// Le noeud reste « resolved » le temps que tout le monde lise le resultat, puis il
// est remplace par le prochain mini-jeu, ou efface au lancement / a la revanche.
const MG_GRACE_MS = 1500;           // retard tolere sur l'envoi d'une entree

// Qui joue : les joueurs en lice, plus les fantomes (pour l'honneur).
export const minigamePlayers = game => (game.players || []).filter(p => !p.bankrupt || p.ghost).map(p => p.id);

async function startMinigame(game, { kind, params, participants, origin, pos = null }) {
  const cur = currentPlayer(game);
  const startAt = serverNow() + INTRO_MS;
  const endAt = startAt + MINIGAMES[kind].duration;
  const mg = { id: makeId(), kind, params, participants, origin, pos, by: cur.id, startAt, endAt, status: 'active', entries: null, result: null };
  await commit(game.code, { minigame: mg, currentAction: { type: 'minigame', playerId: cur.id }, turnDeadline: endAt + 20000, updatedAt: now() });
  pushHistory(game.code, origin === 'duel'
    ? `Duel ! ${participants.map(id => (playerById(game, id) || {}).name).join(' contre ')} sur la même case.`
    : `Mini-jeu pour toute la table : ${MINIGAMES[kind].label} !`, { t: 'minigame-start', kind, origin, p: cur.id });
  return mg;
}

// Case EVENT : le joueur actif tire le mini-jeu (un seul tirage) et l'ouvre a tous.
export function startEventMinigame(game, rng = Math.random) {
  const { kind, params } = drawMinigame(rng);
  return startMinigame(game, { kind, params, participants: minigamePlayers(game), origin: 'event' });
}

// Duel : avant de resoudre la case, si un autre pion en lice s'y trouve deja.
// Un seul duel par lancer (duelRoll), jamais en prison.
export async function maybeStartDuel(game, player, position) {
  if (!on(game, 'duel') || !game.lastRoll || game.duelRoll === game.lastRoll.id || position === JAIL_INDEX) return false;
  const rival = (game.players || []).find(p => p.id !== player.id && !p.bankrupt && !p.inJail && p.position === position);
  if (!rival) return false;
  await commit(game.code, { duelRoll: game.lastRoll.id });
  const { kind, params } = drawDuel();
  await startMinigame(game, { kind, params, participants: [player.id, rival.id], origin: 'duel', pos: position });
  return true;
}

// Entree d'un participant : une seule, avant la fin (+ marge), validee par transaction.
export async function submitEntry(entry, by = S.playerId, mgId = null) {
  const game = S.game;
  const mg = game && game.minigame;
  if (!mg || mg.status !== 'active' || (mgId && mg.id !== mgId) || !(mg.participants || []).includes(by)) return false;
  const clean = cleanEntry(mg.kind, entry, mg.params);
  if (!clean) return false;
  let ok = false;
  await tx(mgRef(game.code), m => {
    ok = false;
    if (!m || m.id !== mg.id || m.status !== 'active') return;
    if (m.entries && m.entries[by]) return;
    if (serverNow() > m.endAt + MG_GRACE_MS) return;
    ok = true;
    return { ...m, entries: { ...(m.entries || {}), [by]: { ...clean, ts: serverNow() } } };
  });
  return ok;
}

// Hote : envoie les entrees des bots au bon moment (un tirage par bot et par mini-jeu).
function scheduleBotEntries(game, mg) {
  if (partyGuards.botsFor === mg.id) return;
  partyGuards.botsFor = mg.id;
  mg.participants.forEach(id => {
    const p = playerById(game, id);
    if (!p || !p.bot) return;
    const sim = botEntry(mg.kind, mg.params);
    if (!sim) return;
    setTimeout(() => submitEntry(sim.entry, id, mg.id), Math.max(0, mg.startAt - serverNow()) + sim.delay);
  });
}

function minigameReady(game, mg) {
  const entries = mg.entries || {};
  const payers = mg.participants.filter(id => { const p = playerById(game, id); return p && !p.bankrupt; });
  if (serverNow() > mg.endAt + MG_GRACE_MS) return true;
  if (mg.kind === 'trap') return payers.some(id => entries[id]);       // le premier qui clique a perdu
  return mg.participants.every(id => entries[id]);
}

function arbitrateMinigame(game) {
  const mg = game.minigame;
  if (!mg || mg.status !== 'active') return;
  scheduleBotEntries(game, mg);
  if (minigameReady(game, mg)) resolveMinigameOnce(game, mg);
}

async function resolveMinigameOnce(game, mg) {
  if (partyGuards.minigame === mg.id) return;
  partyGuards.minigame = mg.id;
  let mine = false;
  const done = await tx(ref(db, `banqueroll/${game.code}/minigame/status`), st => { mine = st === 'active'; return mine ? 'resolving' : undefined; });
  if (!done) { partyGuards.minigame = null; return; }
  if (!mine) return;
  const fresh = S.game;
  const m = fresh.minigame;
  const res = resolveMinigame(fresh, m);
  const result = { rows: res.rows, winnerIds: res.winnerIds, loserId: res.loserId || null, text: res.text, at: serverNow() };
  const extra = { ...res.updates, 'minigame/status': 'resolved', 'minigame/result': result };
  const loserRow = res.rows.find(r => r.pid === res.loserId) || {};
  const line = { text: res.text, meta: { t: 'minigame', kind: m.kind, origin: m.origin, p: res.loserId || res.winnerIds[0] || m.by,
    o: res.winnerIds[0] || null, l: res.loserId || null, w: res.winnerIds[0] || null, amt: Math.abs(loserRow.delta || 0) } };
  if (m.origin === 'duel') {
    // Le duel ne termine pas le tour : la case est ensuite resolue normalement.
    await commit(fresh.code, { ...extra, currentAction: null, turnDeadline: now() + fresh.turnTimer * 1000, updatedAt: now() });
    pushHistory(fresh.code, line.text, line.meta);
    await waitFor(() => S.game && S.game.minigame && S.game.minigame.status === 'resolved');
    return handleLanding(m.pos, { skipDuel: true });
  }
  return endTurn(fresh, extra, [line]);
}

const waitFor = (test, ms = 4000) => new Promise(resolve => {
  const end = now() + ms;
  (function poll() { if (test() || now() > end) resolve(); else setTimeout(poll, 60); })();
});

// ================================================================ testament
// Etats : choose (10 s) -> chosen (choix du joueur, ou « banque » a l'expiration) -> resolved.
// Le joueur est en faillite des l'ouverture (il ne joue plus) ; ses biens attendent le choix.
export const willOpen = game => !!(game.will && (game.will.status === 'choose' || game.will.status === 'chosen'));

export async function openWill(game, player, idx, cancels = {}) {
  const props = ownedBy(game, player.id);
  const will = { id: makeId(), playerId: player.id, endAt: serverNow() + WILL_MS, status: 'choose', choice: null,
    count: props.length, heirs: willHeirs(game, player.id), wasTurn: game.turnIndex === idx };
  const updates = { ...cancels, [`players/${idx}/bankrupt`]: true, [`players/${idx}/inJail`]: false, [`players/${idx}/jailTurns`]: 0, will, updatedAt: now() };
  if (on(game, 'ghost')) updates[`players/${idx}/ghost`] = true;
  if (will.wasTurn) updates.turnDeadline = will.endAt + 15000;
  await commit(game.code, updates);
  pushHistory(game.code, `${player.name} fait faillite (${player.cash} $, fortune ${netWorth(game, player)} $). Testament : qui hérite de ses ${props.length} propriété${props.length > 1 ? 's' : ''} ?`,
    { t: 'bankrupt', p: player.id, amt: player.cash, will: true });
}

// Le joueur en faillite choisit : 'bank' ou l'id d'un joueur en lice. Un seul choix, avant la fin.
export async function chooseHeir(heir, by = S.playerId) {
  const game = S.game;
  const w = game && game.will;
  if (!w || w.status !== 'choose' || w.playerId !== by) return false;
  if (heir !== 'bank' && !(w.heirs || []).includes(heir)) return false;
  let ok = false;
  await tx(ref(db, `banqueroll/${game.code}/will`), cur => {
    ok = false;
    if (!cur || cur.id !== w.id || cur.status !== 'choose' || serverNow() > cur.endAt + MG_GRACE_MS) return;
    ok = true;
    return { ...cur, status: 'chosen', choice: heir };
  });
  return ok;
}

function arbitrateWill(game) {
  const w = game.will;
  if (!w) return;
  if (w.status === 'choose' && serverNow() > w.endAt + 500 && partyGuards.willTimeout !== w.id) {
    partyGuards.willTimeout = w.id;
    runTransaction(ref(db, `banqueroll/${game.code}/will`), cur => (cur && cur.id === w.id && cur.status === 'choose' ? { ...cur, status: 'chosen', choice: 'bank', timeout: true } : undefined));
    return;
  }
  if (w.status === 'chosen') resolveWillOnce(game, w);
}

async function resolveWillOnce(game, w) {
  if (partyGuards.will === w.id) return;
  partyGuards.will = w.id;
  let mine = false;
  const done = await tx(ref(db, `banqueroll/${game.code}/will/status`), st => { mine = st === 'chosen'; return mine ? 'resolving' : undefined; });
  if (!done) { partyGuards.will = null; return; }
  if (!mine) return;
  const fresh = S.game;
  const dead = playerById(fresh, w.playerId) || { name: '?' };
  const { updates, heirId, count } = willUpdates(fresh, w.playerId, w.choice);
  const heir = playerById(fresh, heirId);
  const text = heir ? `Testament ${de(dead.name)} : ${heir.name} hérite de ${count} propriété${count > 1 ? 's' : ''}${w.timeout ? '' : ', bâtiments compris'}.`
    : `${dead.name} ${w.timeout ? 'n’a rien décidé' : 'choisit la banque'} : ses biens retournent à la banque.`;
  const extra = { ...updates, 'will/status': 'resolved', 'will/heir': heirId || 'bank', 'will/at': serverNow() };
  const line = { text, meta: { t: 'will', p: w.playerId, o: heirId || null, n: count, timeout: !!w.timeout } };
  if (w.wasTurn && currentPlayer(fresh) && currentPlayer(fresh).id === w.playerId) return endTurn(fresh, extra, [line], { advance: true });
  await commit(fresh.code, { ...extra, updatedAt: now() });
  pushHistory(fresh.code, line.text, line.meta);
}

// ================================================================ fantomes
export async function hauntSquare(pos, by = S.playerId) {
  const game = S.game;
  if (!game || !on(game, 'ghost')) return false;
  pos = Number(pos);
  const check = canHaunt(game, by, pos);
  if (!check.ok) { if (by === S.playerId) toast(check.reason); return false; }
  await commit(game.code, { ...hauntUpdates(game, by, pos), updatedAt: now() });
  const g = playerById(game, by);
  pushHistory(game.code, `👻 ${g.name} hante ${BOARD[pos].name}. Le prochain qui s’y arrête perd 50 $.`, { t: 'haunt-set', p: by, pos });
  return true;
}

// A l'arrivee sur une case hantee : penalite, puis la case est resolue avec l'etat a jour.
export async function maybeHaunt(game, player, position) {
  if (!on(game, 'ghost')) return false;
  const hit = hauntHit(game, player.id, position);
  if (!hit) return false;
  const ghost = playerById(game, hit.by) || { name: 'un fantôme' };
  const cashPath = `players/${indexOfPlayer(game, player.id)}/cash`;
  await commit(game.code, { ...hit.updates, updatedAt: now() });
  pushHistory(game.code, `👻 ${player.name} tombe sur la case hantée par ${ghost.name} : −50 $.`, { t: 'haunt', p: player.id, o: hit.by, pos: position, amt: 50 });
  await waitFor(() => S.game && !(S.game.haunts || {})[position] && S.game.players[indexOfPlayer(S.game, player.id)].cash === hit.updates[cashPath]);
  return true;
}

// ================================================================ paris
// Etats : open (avant le lancer) -> locked (le de est tire, ecrit dans le meme commit que
// le lancer) -> resolved (fin du tour du lanceur). Un tour sans lancer annule les paris.
export async function placeBet(kind, amt, by = S.playerId) {
  const game = S.game;
  if (!game || !on(game, 'betting')) return false;
  amt = Number(amt);
  const check = canBet(game, by, kind, amt);
  if (!check.ok) { if (by === S.playerId) toast(check.reason); return false; }
  const key = game.bets.key;
  let ok = false;
  await tx(ref(db, `banqueroll/${game.code}/bets`), b => {
    ok = false;
    if (!b || b.key !== key || b.status !== 'open' || (b.entries && b.entries[by])) return;
    ok = true;
    return { ...b, entries: { ...(b.entries || {}), [by]: { kind, amt, ts: serverNow() } } };
  });
  if (!ok && by === S.playerId) toast('Trop tard : le dé est lancé.');
  return ok;
}

// Mises a jour a ajouter au commit du lancer : les paris se ferment au moment du tirage.
export function lockBetsUpdates(game, player, die, rollId) {
  const b = game.bets;
  if (!on(game, 'betting') || !b || b.status !== 'open' || b.roller !== player.id) return {};
  return { 'bets/status': 'locked', 'bets/roll': { v: die, id: rollId }, 'bets/lockTs': Date.now() };
}

function arbitrateBets(game) {
  if (game.briefing) return;                            // cartes de regles : rien ne s'ouvre avant le premier tour
  const cur = currentPlayer(game);
  const b = game.bets;
  if (b && b.status === 'locked') {
    // Le tour du lanceur est fini (fin de tour ou relance sur 6) : on regle.
    const done = game.turnRolled !== b.roller && !game.currentAction && !openBlocking(game);
    if (done) resolveBetsOnce(game, b);
    return;
  }
  if (b && b.status === 'resolving') return;            // reglement en cours : ne pas ecraser le noeud
  if (!cur || cur.bankrupt || game.currentAction || game.turnRolled === cur.id) return;
  const key = betKey(game);
  if (b && b.key === key) return;
  if (partyGuards.betsOpen === key) return;
  partyGuards.betsOpen = key;
  // Le chrono du lanceur est rallonge de la fenetre de paris : l'attente ne lui coute rien.
  commit(game.code, { bets: { key, roller: cur.id, status: 'open', entries: null, at: serverNow() },
    turnDeadline: Math.max(game.turnDeadline || 0, now() + BET_WINDOW_MS + (game.turnTimer || 0) * 1000) });
}

// « Pas de pari » : ce joueur laisse passer ce lancer ; quand tous ont parie ou passe, le lanceur peut y aller.
export async function skipBet(by = S.playerId) {
  const game = S.game;
  const b = game && game.bets;
  if (!b || b.status !== 'open' || b.key !== betKey(game) || b.roller === by || (b.entries || {})[by] || (b.skip || {})[by]) return false;
  await commit(game.code, { [`bets/skip/${by}`]: true });
  return true;
}
export { betHold };

async function resolveBetsOnce(game, b) {
  const id = `${b.key}`;
  if (partyGuards.bets === id) return;
  partyGuards.bets = id;
  let mine = false;
  const done = await tx(ref(db, `banqueroll/${game.code}/bets/status`), st => { mine = st === 'locked'; return mine ? 'resolving' : undefined; });
  if (!done) { partyGuards.bets = null; return; }
  if (!mine) return;
  const fresh = S.game;
  const set = betSettlement(fresh, fresh.bets);
  await commit(fresh.code, { ...set.updates, 'bets/status': 'resolved', 'bets/result': Object.keys(set.deltas).length ? set.deltas : null,
    'bets/outcome': set.outcome, 'bets/at': serverNow(), updatedAt: now() });
  if (set.text) {
    const best = Object.entries(set.deltas).sort((a, c) => c[1] - a[1])[0];
    const worst = Object.entries(set.deltas).sort((a, c) => a[1] - c[1])[0];
    pushHistory(fresh.code, set.text, { t: 'bets', p: worst && worst[1] < 0 ? worst[0] : (best ? best[0] : b.roller), o: b.roller,
      w: best && best[1] > 0 ? best[0] : null, amt: best ? best[1] : 0 });
  }
}

// ================================================================ money time
function arbitrateMoneyTime(game) {
  const due = moneyTimeDue(game);
  if (!due || partyGuards.moneyTime === game.code) return;
  partyGuards.moneyTime = game.code;
  commit(game.code, { moneyTime: { active: true, reason: due.reason, round: game.round || 1, at: serverNow(), ...(due.leader ? { leader: due.leader } : {}) }, updatedAt: now() });
  const lead = due.leader ? playerById(game, due.leader) : null;
  pushHistory(game.code, due.reason === 'rounds' ? 'MONEY TIME : trois dernières manches, tous les loyers sont doublés !'
    : `MONEY TIME : ${lead ? lead.name : 'quelqu’un'} approche de l’objectif. Tous les loyers sont doublés jusqu’à la fin !`, { t: 'moneytime', reason: due.reason, p: due.leader || null });
}

// ================================================================ bulle / krach
// Tire par le joueur actif sur la case EVENT (un seul tirage), comme les autres evenements.
export function startMarket(game, rng = Math.random) {
  const m = drawMarket(game, rng);
  const label = GROUP_LABELS[m.group] || m.group;
  const text = m.kind === 'bubble' ? `Bulle immobilière sur le groupe ${label} : loyers ×2 pendant 2 manches !`
    : `Krach sur le groupe ${label} : loyers divisés par 2 pendant 2 manches.`;
  const player = currentPlayer(game);
  return endTurn(game, { market: { ...m, id: makeId(), at: serverNow() } }, [{ text, meta: { t: 'market', kind: m.kind, group: m.group, p: player.id } }]);
}

function arbitrateMarket(game) {
  if (!marketExpired(game) || partyGuards.marketEnd === game.market.id) return;
  partyGuards.marketEnd = game.market.id;
  const label = GROUP_LABELS[game.market.group] || game.market.group;
  commit(game.code, { market: null, updatedAt: now() });
  pushHistory(game.code, `Fin de la ${game.market.kind === 'bubble' ? 'bulle' : 'crise'} sur le groupe ${label} : les loyers redeviennent normaux.`, { t: 'market-end', group: game.market.group });
}

// ================================================================ pacte du presentateur
// Etats : offer (8 s) -> accepted | refused (silence = refus) -> resolved (fin du tour du joueur).
// C'est le moteur qui propose, jamais l'IA : le presentateur ne fait que le commenter.
const DEAL_EVERY = 4;          // au plus un pacte tous les 4 tours, toute la table confondue
const DEAL_CHANCE = 0.22;      // et seulement un debut de tour sur ~5

export const dealPending = (game, pid) => !!(game.deal && game.deal.status === 'offer' && (!pid || game.deal.playerId === pid));

function arbitrateDeal(game) {
  const d = game.deal;
  const cur = currentPlayer(game);
  const key = `${game.round || 1}-${game.turnIndex}-${(game.lastRoll && game.lastRoll.id) || '0'}`;
  if (key !== partyGuards.turnKey) { partyGuards.turnKey = key; partyGuards.turns++; }
  // Expiration : le silence vaut refus.
  if (d && d.status === 'offer' && serverNow() > d.endAt + 500 && partyGuards.dealTimeout !== d.id) {
    partyGuards.dealTimeout = d.id;
    tx(ref(db, `banqueroll/${game.code}/deal`), x => (x && x.id === d.id && x.status === 'offer' ? { ...x, status: 'refused', timeout: true } : undefined));
    return;
  }
  // Reglement a la fin du tour du joueur, sur le de tire APRES l'offre ; annule si le tour
  // passe a quelqu'un d'autre sans lancer (prison, tour expire).
  if (d && d.status === 'accepted') {
    const rolled = !!game.lastRoll && game.lastRoll.id !== d.afterRoll && game.lastRoll.by === d.playerId;
    const ended = game.turnRolled !== d.playerId && !game.currentAction && !openBlocking(game);
    const moved = !!cur && cur.id !== d.playerId;
    if ((rolled && ended) || (!rolled && moved)) resolveDealOnce(game, d);
    return;
  }
  // Proposition : en debut de tour, rarement, jamais en prison ni pendant une action.
  if (d && d.status === 'offer') return;
  if (!cur || cur.bankrupt || cur.inJail || game.currentAction || game.turnRolled === cur.id || openBlocking(game)) return;
  if (partyGuards.dealOffer === key || partyGuards.turns - partyGuards.lastDealTurn < DEAL_EVERY) return;
  partyGuards.dealOffer = key;
  if (Math.random() >= DEAL_CHANCE) return;
  offerDeal(game, drawDeal());
}

// Ecrit l'offre (hote). Le tirage du pacte est fait par l'appelant, une seule fois.
export function offerDeal(game, kind) {
  const cur = currentPlayer(game);
  const def = DEALS[kind];
  if (!cur || !def) return null;
  partyGuards.lastDealTurn = partyGuards.turns;        // espacement : au plus un pacte tous les 4 tours
  const deal = { id: makeId(), playerId: cur.id, kind, reward: def.reward, penalty: def.penalty, endAt: serverNow() + DEAL_MS, status: 'offer',
    afterRoll: (game.lastRoll && game.lastRoll.id) || '0' };
  commit(game.code, { deal, turnDeadline: Math.max(game.turnDeadline || 0, now() + DEAL_MS + game.turnTimer * 1000), updatedAt: now() });
  pushHistory(game.code, `Pacte du présentateur pour ${cur.name} : « ${def.label} » — réussite +${def.reward} $, échec −${def.penalty} $.`, { t: 'deal-offer', p: cur.id, kind });
  return deal;
}

// Le joueur accepte ou refuse. Une seule reponse, avant la fin.
export async function answerDeal(accept, by = S.playerId) {
  const game = S.game;
  const d = game && game.deal;
  if (!d || d.status !== 'offer' || d.playerId !== by) return false;
  let ok = false;
  await tx(ref(db, `banqueroll/${game.code}/deal`), x => {
    ok = false;
    if (!x || x.id !== d.id || x.status !== 'offer' || serverNow() > x.endAt + 1500) return;
    ok = true;
    return { ...x, status: accept ? 'accepted' : 'refused' };
  });
  if (ok && accept) pushHistory(game.code, `${(playerById(game, by) || {}).name} accepte le pacte. Le dé décidera.`, { t: 'deal-accept', p: by });
  return ok;
}

async function resolveDealOnce(game, d) {
  if (partyGuards.deal === d.id) return;
  partyGuards.deal = d.id;
  let mine = false;
  const done = await tx(ref(db, `banqueroll/${game.code}/deal/status`), st => { mine = st === 'accepted'; return mine ? 'resolving' : undefined; });
  if (!done) { partyGuards.deal = null; return; }
  if (!mine) return;
  const fresh = S.game;
  const roll = fresh.lastRoll;
  const p = playerById(fresh, d.playerId) || { name: '?' };
  // Pas de lancer depuis l'offre (prison...) : le pacte est annule.
  if (!roll || roll.id === d.afterRoll || roll.by !== d.playerId) {
    await commit(fresh.code, { 'deal/status': 'resolved', 'deal/void': true, updatedAt: now() });
    return;
  }
  const set = dealSettlement(fresh, d, roll.v);
  await commit(fresh.code, { ...set.updates, 'deal/status': 'resolved', 'deal/success': set.success, 'deal/die': roll.v, 'deal/amt': set.amt, 'deal/at': serverNow(), updatedAt: now() });
  pushHistory(fresh.code, set.success ? `Pacte tenu : ${p.name} fait ${roll.v} et empoche ${set.amt} $.` : `Pacte perdu : ${p.name} fait ${roll.v} et rend ${-set.amt} $ au présentateur.`,
    { t: 'deal', p: d.playerId, kind: d.kind, success: set.success, amt: Math.abs(set.amt), v: roll.v });
}

// ================================================================ trace des fortunes
// Une photo des fortunes par manche : la courbe et les changements de leader du recap.
// Donnee d'affichage, ecrite dans tous les modes (elle ne touche a aucune regle).
function recordTrail(game) {
  const round = game.round || 1;
  if ((game.trail || {})[round] || partyGuards.trail === `${game.code}:${round}`) return;
  partyGuards.trail = `${game.code}:${round}`;
  const values = {};
  (game.players || []).forEach(p => { values[p.id] = p.bankrupt ? Math.min(0, p.cash || 0) : netWorth(game, p); });
  commit(game.code, { [`trail/${round}`]: values });
}

// ================================================================ arbitrage de l'hote
// Appele par actions.hostArbitrate a chaque mise a jour et par le tick de 2 s.
export function partyArbitrate(game) {
  if (!S.isHost || !game || game.phase !== 'playing') return;
  recordTrail(game);
  if (on(game, 'reactions')) cleanReactions(game);
  if (game.minigame) arbitrateMinigame(game);
  if (game.will) arbitrateWill(game);
  if (on(game, 'betting')) arbitrateBets(game);
  if (on(game, 'moneyTime')) arbitrateMoneyTime(game);
  if (on(game, 'marketCrash') && game.market) arbitrateMarket(game);
  if (on(game, 'hostDeals')) arbitrateDeal(game);
}

export { BET_KINDS };
