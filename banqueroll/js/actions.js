// Actions des joueurs et arbitrage de l'hote.
//
// Architecture client-autoritaire : le client du joueur actif calcule et ecrit
// son tour ; SEUL l'hote arbitre ce qui expire (encheres, echanges, tours AFK,
// roue abandonnee), les faillites et la fin de partie.

import { BOARD, START_INDEX, isOwnable, crossesStart } from './board.js';
import {
  START_CASH, START_BONUS, BAIL, AUCTION_DURATION, TRADE_DURATION, SWAP_DURATION, SWAP_BONUS,
  TARGETS, ROUND_LIMITS, LATE_BONUS,
  targetOf, roundsOf, playerById, indexOfPlayer, ownerOf, ownedBy, rentFor, ownsFullGroup, levelOf,
  canBuild, canSell, tradeable, planNextTurn, isBankrupt, bankruptcyUpdates, winnerCheck,
  startingPlayers, jailUpdates, openBlocking, netWorth, currentPlayer, isMyTurn,
} from './rules.js';
import {
  drawChance, resolveCard, resolveDilemma, resolveWheel, resolveSteal, resolveSeize, autoSeizePick,
  DILEMMAS, WHEEL,
} from './chance.js';
import {
  S, get, set, remove, onValue, runTransaction, onDisconnect, gameRef, presenceRef,
  pushHistory, pushChat, commit, saveLocal, clearLocal,
} from './net.js';
import { animateDiceRoll, toast, WHEEL_MS } from './fx.js';

export const PLAYER_COLORS = ['#2F7FC1','#D99A1E','#D2582A','#7752C2','#2E8F62','#C93F55','#1C949E','#B8509A'];
const TURN_GRACE_MS = 1500;
const WHEEL_FALLBACK_MS = 9000;  // l'hote termine une roue abandonnee apres ce delai

// Le rendu et le presentateur s'abonnent ici (main.js) : evite les imports circulaires.
export const hooks = { onGame: null, onGone: null, onShow: null };

const show = id => hooks.onShow && hooks.onShow(id);
const now = () => Date.now();
export const makeId = () => Math.random().toString(36).slice(2, 10);
const me = (game = S.game) => playerById(game, S.playerId);
const myIdx = (game = S.game) => indexOfPlayer(game, S.playerId);
const deadline = game => now() + game.turnTimer * 1000;

// Verrous locaux : une resolution ecrit dans l'historique, ce qui relance le
// rendu avant que l'etat ne soit propage. Sans eux, la resolution boucle.
const guards = {};
let rolling = false;
let watchdog = null;
export function resetGuards() {
  Object.assign(guards, { auction:null, trade:null, swap:null, finished:null, deadline:null, wheel:null, bankrupt:new Set() });
  rolling = false;
}
resetGuards();

// ================================================================ fin de tour
// Termine le tour (ou le prolonge : relance sur 6), journalise, signale les tours sautes.
export async function endTurn(game, extra = {}, lines = [], opts = {}) {
  const plan = planNextTurn(game, extra, opts);
  await commit(game.code, plan.updates);
  lines.forEach(l => l && pushHistory(game.code, l.text, l.meta));
  plan.skipped.forEach(name => pushHistory(game.code, `${name} passe son tour : le pacte faustien se paie.`, { t:'skip' }));
  if (plan.again) {
    const cur = currentPlayer(game);
    pushHistory(game.code, `${cur.name} rejoue.`, { t:'again', p: cur.id });
  }
}

// Applique un resultat de Chance (voir chance.js) : fin de tour, deplacement ou decision.
async function applyOutcome(game, out, extra = {}) {
  const updates = { ...out.updates, ...extra };
  const line = { text: out.text, meta: out.meta };
  if (out.then === 'end') return endTurn(game, updates, [line]);
  if (out.then && out.then.action) {
    await commit(game.code, { ...updates, currentAction: out.then.action, turnDeadline: deadline(game), updatedAt: now() });
    return pushHistory(game.code, out.text, out.meta);
  }
  if (out.then && out.then.move !== undefined) {
    const player = currentPlayer(game);
    await commit(game.code, { ...updates, currentAction: null, turnDeadline: deadline(game), updatedAt: now() });
    pushHistory(game.code, out.text, out.meta);
    await waitForPosition(player.id, out.then.move);
    return handleLanding(out.then.move);
  }
}

// Attend que l'etat Firebase reflete la nouvelle position avant de resoudre la case.
function waitForPosition(playerId, position, timeout = 4000) {
  const end = now() + timeout;
  return new Promise(resolve => {
    (function check() {
      const p = playerById(S.game, playerId);
      if ((p && p.position === position) || now() > end) resolve();
      else setTimeout(check, 60);
    })();
  });
}

// ================================================================ salon
async function freeCode() {
  const words = ['ROLL','BANK','VALE','LIFT','NOVA','PLAZA','CASH','LOOP','ARCO','MINT'];
  const gen = () => words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(10 + Math.random() * 90);
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = gen();
    const snap = await get(gameRef(candidate));
    if (!snap.exists()) return candidate;
  }
  return gen() + '-' + makeId().slice(0, 3);
}

const val = id => document.getElementById(id).value;

export async function createGame() {
  const name = val('create-name').trim();
  const players = parseInt(val('create-players'), 10);
  const timer = parseInt(val('create-timer'), 10);
  const target = parseInt(val('create-target'), 10);
  const maxRounds = parseInt(val('create-rounds'), 10);
  const err = document.getElementById('create-error');
  err.textContent = '';
  if (!name) { err.textContent = 'Entre ton prénom.'; return; }
  if (players < 2 || players > 8) { err.textContent = 'Choisis entre 2 et 8 joueurs.'; return; }
  if (!Number.isFinite(timer) || timer < 10 || timer > 120) { err.textContent = 'Durée de tour invalide.'; return; }
  const settings = {
    target: TARGETS.includes(target) ? target : TARGETS[0],
    maxRounds: ROUND_LIMITS.includes(maxRounds) ? maxRounds : ROUND_LIMITS[0],
  };
  S.code = await freeCode();
  S.playerId = makeId(); S.name = name; S.color = PLAYER_COLORS[0]; S.isHost = true;
  saveLocal();
  const player = { id:S.playerId, name, position:START_INDEX, cash:START_CASH, jailTurns:0, inJail:false, color:S.color, ready:true };
  const game = { code:S.code, hostId:S.playerId, maxPlayers:players, turnTimer:timer, settings, players:[player], phase:'lobby',
    turnIndex:0, round:1, currentAction:null, ownership:{}, auction:null, trade:null, winnerId:null, turnDeadline:null,
    createdAt:now(), updatedAt:now() };
  await set(gameRef(S.code), game);
  attachPresence();
  startGameListener(S.code);
  show('s-lobby');
}

// Deux joueurs qui rejoignaient en meme temps s'ecrasaient : l'ajout passe par une transaction.
export async function joinGame() {
  const code = val('join-code').trim().toUpperCase();
  const name = val('join-name').trim();
  const err = document.getElementById('join-error');
  err.textContent = '';
  if (!code) { err.textContent = 'Entre le code de la partie.'; return; }
  if (!name) { err.textContent = 'Entre ton prénom.'; return; }
  show('s-joining');
  const ref = gameRef(code);
  // Un listener actif amorce le cache local : sans lui, runTransaction demarre
  // avec current===null et la transaction s'annule immediatement.
  let detach = null;
  const snap = await new Promise(resolve => { detach = onValue(ref, s => resolve(s), () => resolve(null)); });
  if (!snap || !snap.exists()) { if (detach) detach(); err.textContent = 'Code introuvable.'; show('s-home'); return; }
  const newId = makeId();
  let outcome = null;
  try {
    await runTransaction(ref, current => {
      outcome = null;
      if (!current) { outcome = { error:'Code introuvable.' }; return; }
      if (current.phase !== 'lobby') { outcome = { error:'La partie est déjà lancée.' }; return; }
      const players = current.players || [];
      const existing = players.find(p => p.name && p.name.toLowerCase() === name.toLowerCase());
      if (existing) { outcome = { player:existing, hostId:current.hostId }; return; }
      if (players.length >= current.maxPlayers) { outcome = { error:'La partie est complète.' }; return; }
      const player = { id:newId, name, position:START_INDEX, cash:START_CASH, jailTurns:0, inJail:false,
        color:PLAYER_COLORS[players.length % PLAYER_COLORS.length], ready:true };
      outcome = { player, hostId:current.hostId };
      current.players = [...players, player];
      current.updatedAt = now();
      return current;
    });
  } finally { if (detach) detach(); }
  if (!outcome || outcome.error) { err.textContent = (outcome && outcome.error) || 'Impossible de rejoindre la partie.'; show('s-home'); return; }
  S.code = code; S.playerId = outcome.player.id; S.name = outcome.player.name; S.color = outcome.player.color;
  S.isHost = outcome.hostId === S.playerId;
  saveLocal(); attachPresence(); startGameListener(code);
}

export function attachPresence() {
  if (!S.code || !S.playerId) return;
  const ref = presenceRef(S.code, S.playerId);
  set(ref, { name:S.name, ts:now() });
  onDisconnect(ref).remove();
}

export function startGameListener(code) {
  stopGameListener();
  S.listener = onValue(gameRef(code), snap => {
    if (!snap.exists()) {
      toast('La partie a été supprimée.');
      stopGameListener(); clearLocal(); S.game = null;
      if (hooks.onGone) hooks.onGone();
      show('s-home');
      return;
    }
    S.game = snap.val();
    if (hooks.onGame) hooks.onGame(S.game);
    hostArbitrate(S.game);
  });
  // Sans ce tick, une enchere arrivee a echeance restait ouverte tant
  // qu'aucune autre ecriture ne declenchait le rendu.
  if (!watchdog) watchdog = setInterval(() => { if (S.game) hostArbitrate(S.game, true); }, 2000);
}

export function stopGameListener() {
  if (S.listener) { S.listener(); S.listener = null; }
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
}

export async function startGame() {
  const game = S.game;
  if (!game || !S.isHost) return;
  resetGuards();
  if (game.players.length < 2) { toast('Il faut au moins 2 joueurs pour démarrer.'); return; }
  const players = startingPlayers(game.players);
  await commit(game.code, { players, phase:'playing', turnIndex:0, round:1, currentAction:null, ownership:null, buildings:null,
    auction:null, trade:null, swap:null, event:null, extraRoll:null, turnRolled:null, lastRoll:null, winnerId:null,
    hostMem:null, turnDeadline:deadline(game), updatedAt:now() });
  const max = roundsOf(game);
  const late = players.slice(1).map((p, i) => `${p.name} +${(i + 1) * LATE_BONUS} $`).join(', ');
  pushHistory(game.code, `La partie commence : ${targetOf(game)} $ de fortune nette${max ? ` ou ${max} manches` : ', sans limite de manches'}. `
    + `Ordre tiré au sort : ${players.map(p => p.name).join(' → ')}.${late ? ` Bonus de retard : ${late}.` : ''}`, { t:'begin' });
}

// Relance une partie terminee en repartant du salon, sans perdre les joueurs.
export async function restartGame() {
  const game = S.game;
  if (!game || !S.isHost) return;
  resetGuards();
  const players = game.players.map(p => ({ ...p, position:START_INDEX, cash:START_CASH, jailTurns:0, inJail:false,
    bankrupt:false, skipNext:null, rentBoost:null }));
  await commit(game.code, { players, phase:'lobby', turnIndex:0, round:1, currentAction:null, ownership:null, buildings:null,
    auction:null, trade:null, swap:null, event:null, extraRoll:null, turnRolled:null, lastRoll:null, winnerId:null,
    history:null, hostMem:null, turnDeadline:null, updatedAt:now() });
  toast('Nouvelle partie prête.');
}

export async function deleteGame() {
  if (!S.game) { leaveGame(); return; }
  if (!confirm('Supprimer la partie ?')) return;
  const code = S.game.code;
  stopGameListener();
  S.game = null;
  await remove(gameRef(code));
  clearLocal();
  Object.assign(S, { code:null, playerId:null, isHost:false });
  if (hooks.onGone) hooks.onGone();
  show('s-home');
}

// Quitter proprement : sans detacher le listener, le prochain onValue reaffichait la partie.
export function leaveGame() {
  stopGameListener();
  resetGuards();
  if (S.code && S.playerId) remove(presenceRef(S.code, S.playerId));
  S.game = null;
  clearLocal();
  Object.assign(S, { code:null, playerId:null, name:null, color:null, isHost:false });
  if (hooks.onGone) hooks.onGone();
  show('s-home');
}

export function autoReconnect() {
  if (!S.code || !S.playerId) return;
  get(gameRef(S.code)).then(snap => {
    if (!snap.exists()) { clearLocal(); return; }
    const game = snap.val();
    const existing = (game.players || []).find(p => p.id === S.playerId);
    if (!existing) { clearLocal(); return; }
    S.name = existing.name; S.color = existing.color; S.isHost = game.hostId === S.playerId;
    saveLocal(); attachPresence(); startGameListener(S.code);
    show(game.phase === 'lobby' ? 's-lobby' : 's-game');
  });
}

// ================================================================ de et deplacement
// UN seul de a 6 faces (regle 2). La valeur tiree ici est celle qu'affiche le
// de ET celle qui deplace le pion : l'animation ne fait que la mettre en scene.
export async function rollDice() {
  if (rolling) return;
  const game = S.game;
  if (!isMyTurn(game, S.playerId)) return;
  const player = me(game);
  if (player.inJail) { toast('Règle d’abord ta situation en prison.'); return; }
  if (game.currentAction || openBlocking(game)) { toast('Termine d’abord l’action en cours.'); return; }
  rolling = true;
  try {
    const die = Math.ceil(Math.random() * 6);
    const idx = myIdx(game);
    const nextPos = (player.position + die) % BOARD.length;
    const passedStart = crossesStart(player.position, die);
    const rollId = makeId();
    S.lastRollSeen = rollId;              // ce client anime tout de suite, pas a la reception
    await animateDiceRoll(die);
    const updates = {
      [`players/${idx}/position`]: nextPos,
      turnRolled: player.id,
      extraRoll: die === 6 ? player.id : null,
      lastRoll: { v: die, id: rollId, by: player.id, ts: now() },
      turnDeadline: deadline(game), updatedAt: now(),
    };
    if (passedStart) updates[`players/${idx}/cash`] = player.cash + START_BONUS;
    await commit(game.code, updates);
    pushHistory(game.code, `${player.name} lance ${die} et avance de ${die} case${die > 1 ? 's' : ''} jusqu’à ${BOARD[nextPos].name}.`,
      { t:'roll', p: player.id, v: die, pos: nextPos });
    if (passedStart) pushHistory(game.code, `${player.name} passe par le Départ et encaisse ${START_BONUS} $.`, { t:'start', p: player.id, amt: START_BONUS });
    if (die === 6) pushHistory(game.code, `6 ! ${player.name} rejouera après cette case.`, { t:'six', p: player.id });
    await waitForPosition(player.id, nextPos);
    await handleLanding(nextPos);
  } finally { rolling = false; }
}

export async function handleLanding(position) {
  const game = S.game;
  const player = currentPlayer(game);
  const idx = game.turnIndex;
  const square = BOARD[position];
  if (square.type === 'start') return endTurn(game, {}, [{ text:`${player.name} s’arrête pile sur le Départ.`, meta:{ t:'land', p: player.id, pos: position } }]);
  if (isOwnable(square)) {
    const owner = ownerOf(game, position);
    if (!owner) {
      return commit(game.code, { currentAction:{ type:'buy', position, playerId: player.id }, turnDeadline: deadline(game), updatedAt: now() });
    }
    if (owner !== player.id) return payRent(game, position);
    return endTurn(game, {}, [{ text:`${player.name} s’arrête sur sa propre propriété, ${square.name}.`, meta:{ t:'home', p: player.id, pos: position } }]);
  }
  if (square.type === 'jail') {
    return endTurn(game, jailUpdates(game, idx), [{ text:`${player.name} tombe sur la case Prison : 3 tours derrière les barreaux.`, meta:{ t:'jail', p: player.id } }]);
  }
  if (square.type === 'auction') return startSwapPick(game);
  if (square.type === 'event') return handleEvent(game, position);
  if (square.type === 'chance') return handleChance(game);
  return endTurn(game);
}

async function payRent(game, position) {
  const idx = game.turnIndex;
  const player = game.players[idx];
  const ownerId = ownerOf(game, position);
  const owner = playerById(game, ownerId);
  const ownerIdx = indexOfPlayer(game, ownerId);
  let amount = rentFor(game, position);
  const extra = {};
  const boost = Number(owner.rentBoost) || 0;
  if (boost > 1) { amount *= boost; extra[`players/${ownerIdx}/rentBoost`] = null; }
  // Plus de plancher a 0 : le decouvert est autorise jusqu'a -500 $ (regle 12).
  extra[`players/${idx}/cash`] = player.cash - amount;
  extra[`players/${ownerIdx}/cash`] = owner.cash + amount;
  const sq = BOARD[position];
  const full = sq.type === 'property' && ownsFullGroup(game, ownerId, sq.group);
  const lvl = levelOf(game, position);
  const why = boost > 1 ? ' (loyer triplé !)' : lvl ? ` (${lvl} bâtiment${lvl > 1 ? 's' : ''})` : full ? ' (groupe complet)' : '';
  return endTurn(game, extra, [{
    text: `${player.name} paie ${amount} $ de loyer à ${owner.name} pour ${sq.name}${why}.`,
    meta: { t:'rent', p: player.id, o: ownerId, pos: position, amt: amount, before: player.cash, full, lvl, boost: boost > 1 },
  }]);
}

async function handleEvent(game, position) {
  const effects = [
    { text:'touche un dividende', amount:120 }, { text:'subit une rénovation imprévue', amount:-100 },
    { text:'voit son commerce prospérer', amount:140 }, { text:'reçoit une amende municipale', amount:-130 },
    { text:'encaisse un loyer exceptionnel', amount:160 },
  ];
  const pick = effects[Math.floor(Math.random() * effects.length)];
  const idx = game.turnIndex;
  const player = game.players[idx];
  return endTurn(game, { [`players/${idx}/cash`]: player.cash + pick.amount }, [{
    text: `${player.name} ${pick.text} : ${pick.amount > 0 ? '+' : '−'}${Math.abs(pick.amount)} $.`,
    meta: { t:'event', p: player.id, amt: pick.amount, pos: position },
  }]);
}

// ================================================================ Chance
async function handleChance(game) {
  const player = currentPlayer(game);
  const ev = drawChance(game, player.id);
  const event = { id: makeId(), kind: ev.kind, key: ev.key, detail: ev.detail, playerId: player.id, ts: now() };
  if (ev.seg !== undefined) event.seg = ev.seg;
  if (ev.kind === 'card') {
    return applyOutcome(game, resolveCard(game, player.id, ev.key), { event: { ...event, status:'done' } });
  }
  if (ev.kind === 'dilemma') {
    const d = DILEMMAS.find(x => x.id === ev.key);
    await commit(game.code, { event: { ...event, status:'choose' }, currentAction:{ type:'dilemma', playerId: player.id },
      turnDeadline: now() + Math.max(game.turnTimer, 25) * 1000, updatedAt: now() });
    return pushHistory(game.code, `${player.name} tombe sur un dilemme : « ${d.title} »`, { t:'dilemma', p: player.id, key: ev.key });
  }
  const spinAt = now();
  await commit(game.code, { event: { ...event, status:'spin', spinAt }, currentAction:{ type:'wheel', playerId: player.id },
    turnDeadline: spinAt + Math.max(game.turnTimer, 25) * 1000, updatedAt: now() });
  pushHistory(game.code, `${player.name} fait tourner la roue…`, { t:'wheel-spin', p: player.id });
  // Le resultat est deja ecrit ; on attend seulement la fin de l'animation pour l'appliquer.
  setTimeout(() => finishWheel(event.id), WHEEL_MS + 400);
}

export async function finishWheel(eventId) {
  const game = S.game;
  const ev = game && game.event;
  if (!ev || ev.id !== eventId || ev.status !== 'spin' || ev.kind !== 'wheel') return;
  if (guards.wheel === eventId) return;
  guards.wheel = eventId;
  const out = resolveWheel(game, ev.playerId, ev.key, ev.detail || {});
  return applyOutcome(game, out, { 'event/status':'done' });
}

export async function chooseDilemma(choice) {
  const game = S.game;
  const a = game && game.currentAction;
  if (!a || a.type !== 'dilemma' || a.playerId !== S.playerId) return;
  const ev = game.event;
  const out = resolveDilemma(game, S.playerId, ev.key, choice, ev.detail || {});
  return applyOutcome(game, out, { 'event/status':'done', 'event/choice': choice });
}

export async function chooseSteal(pos) {
  const game = S.game;
  const a = game && game.currentAction;
  if (!a || a.type !== 'steal' || a.playerId !== S.playerId) return;
  const out = resolveSteal(game, S.playerId, Number(pos));
  if (!out) { toast('Cible invalide.'); return; }
  return applyOutcome(game, out);
}

export async function skipSteal() {
  const game = S.game;
  const a = game && game.currentAction;
  if (!a || a.type !== 'steal' || a.playerId !== S.playerId) return;
  return endTurn(game, {}, [{ text:`${me(game).name} renonce à la rafle. Noblesse, ou panne de trésorerie.`, meta:{ t:'steal-skip', p: S.playerId } }]);
}

export async function chooseSeize(pos) {
  const game = S.game;
  const a = game && game.currentAction;
  if (!a || a.type !== 'seize' || a.chooserId !== S.playerId) return;
  const out = resolveSeize(game, a.chooserId, a.victimId, Number(pos));
  if (!out) { toast('Choix invalide.'); return; }
  return applyOutcome(game, out);
}

// ================================================================ achat / enchere
export async function buyProperty() {
  const game = S.game;
  const a = game.currentAction;
  if (!a || a.type !== 'buy' || a.playerId !== S.playerId) return;
  const square = BOARD[a.position];
  const idx = myIdx(game);
  const player = game.players[idx];
  if (player.cash < square.price) { toast('Pas assez d’argent.'); return; }
  const extra = { [`ownership/${a.position}`]: S.playerId, [`players/${idx}/cash`]: player.cash - square.price };
  const after = { ...game, ownership: { ...(game.ownership || {}), [a.position]: S.playerId } };
  const completes = square.type === 'property' && ownsFullGroup(after, S.playerId, square.group);
  return endTurn(game, extra, [{
    text: `${player.name} achète ${square.name} pour ${square.price} $.${completes ? ' Groupe complet : loyers doublés et construction débloquée !' : ''}`,
    meta: { t:'buy', p: S.playerId, pos: a.position, amt: square.price, before: player.cash, completes },
  }]);
}

export async function startAuction() {
  const game = S.game;
  const a = game.currentAction;
  if (!a || a.type !== 'buy' || a.playerId !== S.playerId) return;
  const square = BOARD[a.position];
  const nextBid = Math.max(20, Math.ceil(square.price * 0.3));
  const auction = { status:'open', position:a.position, nextBid, highestBid:0, highestBidder:null, endAt: now() + AUCTION_DURATION * 1000 };
  await commit(game.code, { auction, currentAction:null, updatedAt:now() });
  pushHistory(game.code, `${me(game).name} met ${square.name} aux enchères.`, { t:'auction-open', p: S.playerId, pos: a.position });
}

export async function placeBid(amount) {
  const game = S.game;
  const bid = parseInt(amount, 10);
  if (!game.auction || game.auction.status !== 'open') { toast('Aucune enchère active.'); return; }
  const player = me(game);
  if (!player) return;
  if (!Number.isFinite(bid)) { toast('Montant invalide.'); return; }
  if (player.cash < bid) { toast('Pas assez de liquidités.'); return; }
  if (bid < game.auction.nextBid) { toast('Offre trop faible.'); return; }
  await commit(game.code, { auction: { ...game.auction, highestBid: bid, highestBidder: S.playerId, nextBid: bid + 10 }, updatedAt: now() });
  pushHistory(game.code, `${player.name} enchérit ${bid} $.`, { t:'bid', p: S.playerId, amt: bid, pos: game.auction.position });
}

// ================================================================ echange libre
export async function proposeTrade(form) {
  const game = S.game;
  const player = me(game);
  const { recipient, offerCash, requestCash, offerProperty, requestProperty } = form;
  if (!recipient || recipient === S.playerId) return 'Choisis un autre joueur.';
  if (offerCash < 0 || requestCash < 0) return 'Montants invalides.';
  if (offerCash > player.cash) return 'Pas assez d’argent pour proposer cela.';
  if (offerProperty !== null && !tradeable(game, offerProperty)) return 'Une ville bâtie ne s’échange pas.';
  if (requestProperty !== null && !tradeable(game, requestProperty)) return 'Une ville bâtie ne s’échange pas.';
  const trade = { fromId:S.playerId, toId:recipient, offerCash, requestCash, offerProperty, requestProperty,
    status:'pending', expiresAt: now() + TRADE_DURATION * 1000, createdAt: now() };
  await commit(game.code, { trade, updatedAt: now() });
  pushHistory(game.code, `${player.name} propose un échange à ${(playerById(game, recipient) || { name:'?' }).name}.`, { t:'trade-open', p: S.playerId, o: recipient });
  return null;
}

export async function acceptTrade() {
  const game = S.game;
  const trade = game.trade;
  if (!trade || trade.status !== 'pending' || trade.toId !== S.playerId) return;
  const from = playerById(game, trade.fromId), to = playerById(game, trade.toId);
  if (!from || !to) { toast('Joueur introuvable.'); return; }
  // L'etat a pu changer depuis la proposition : on revalide avant d'echanger.
  const stillOk = (trade.offerProperty === null || trade.offerProperty === undefined || ownerOf(game, trade.offerProperty) === from.id)
    && (trade.requestProperty === null || trade.requestProperty === undefined || ownerOf(game, trade.requestProperty) === to.id)
    && from.cash >= trade.offerCash && to.cash >= trade.requestCash;
  if (!stillOk) {
    await commit(game.code, { 'trade/status':'cancelled', updatedAt: now() });
    pushHistory(game.code, 'L’échange n’est plus valable : la situation a changé.', { t:'trade-void' });
    return;
  }
  const fi = indexOfPlayer(game, from.id), ti = indexOfPlayer(game, to.id);
  const updates = {
    [`players/${fi}/cash`]: from.cash - trade.offerCash + trade.requestCash,
    [`players/${ti}/cash`]: to.cash - trade.requestCash + trade.offerCash,
    'trade/status':'accepted', updatedAt: now(),
  };
  if (trade.offerProperty !== null && trade.offerProperty !== undefined) updates[`ownership/${trade.offerProperty}`] = to.id;
  if (trade.requestProperty !== null && trade.requestProperty !== undefined) updates[`ownership/${trade.requestProperty}`] = from.id;
  await commit(game.code, updates);
  pushHistory(game.code, `${to.name} accepte l’échange proposé par ${from.name}.`, { t:'trade', p: from.id, o: to.id });
}

export async function declineTrade() {
  const game = S.game;
  if (!game.trade || game.trade.status !== 'pending') return;
  await commit(game.code, { 'trade/status':'declined', 'trade/updatedAt': now() });
  pushHistory(game.code, `${me(game).name} refuse l’échange.`, { t:'trade-no', p: S.playerId });
}

// ================================================================ case Auction (regle 10)
// Le joueur met une propriete en jeu, les autres proposent une des leurs,
// il accepte une offre ou annule. Echange conclu : +100 $ pour chacun.
async function startSwapPick(game) {
  const player = currentPlayer(game);
  const mine = ownedBy(game, player.id).filter(p => tradeable(game, p));
  if (!mine.length) {
    return endTurn(game, {}, [{ text:`${player.name} arrive à l’Auction sans rien à mettre en jeu.`, meta:{ t:'swap-none', p: player.id } }]);
  }
  await commit(game.code, { currentAction:{ type:'swapPick', playerId: player.id, position: 14 }, turnDeadline: deadline(game), updatedAt: now() });
  pushHistory(game.code, `${player.name} arrive à l’Auction et choisit une propriété à mettre en jeu.`, { t:'swap-pick', p: player.id });
}

export async function pickSwapOffer(pos) {
  const game = S.game;
  const a = game.currentAction;
  pos = Number(pos);
  if (!a || a.type !== 'swapPick' || a.playerId !== S.playerId) return;
  if (ownerOf(game, pos) !== S.playerId || !tradeable(game, pos)) { toast('Choisis une de tes propriétés non bâties.'); return; }
  const endAt = now() + SWAP_DURATION * 1000;
  await commit(game.code, { swap:{ status:'open', id: makeId(), ownerId: S.playerId, offered: pos, offers: null, endAt },
    currentAction: null, turnDeadline: endAt + 5000, updatedAt: now() });
  pushHistory(game.code, `${me(game).name} met ${BOARD[pos].name} en jeu. Faites vos offres : 45 secondes.`, { t:'swap-open', p: S.playerId, pos });
}

export async function skipSwap() {
  const game = S.game;
  const a = game.currentAction;
  if (!a || a.type !== 'swapPick' || a.playerId !== S.playerId) return;
  return endTurn(game, {}, [{ text:`${me(game).name} ne met rien en jeu.`, meta:{ t:'swap-skip', p: S.playerId } }]);
}

export async function offerSwap(pos) {
  const game = S.game;
  const swap = game.swap;
  if (!swap || swap.status !== 'open' || swap.ownerId === S.playerId) return;
  pos = Number(pos);
  if (pos !== -1 && (ownerOf(game, pos) !== S.playerId || !tradeable(game, pos))) { toast('Propose une de tes propriétés non bâties.'); return; }
  await commit(game.code, { [`swap/offers/${S.playerId}`]: pos, updatedAt: now() });
  if (pos !== -1) pushHistory(game.code, `${me(game).name} propose ${BOARD[pos].name}.`, { t:'swap-offer', p: S.playerId, pos });
}

export async function acceptSwap(fromId) {
  const game = S.game;
  const swap = game.swap;
  if (!swap || swap.status !== 'open' || swap.ownerId !== S.playerId) return;
  const theirs = Number((swap.offers || {})[fromId]);
  const valid = ownerOf(game, swap.offered) === S.playerId && tradeable(game, swap.offered)
    && theirs >= 0 && ownerOf(game, theirs) === fromId && tradeable(game, theirs);
  if (!valid) { toast('Cette offre n’est plus valable.'); return; }
  const mi = myIdx(game), fi = indexOfPlayer(game, fromId);
  const other = game.players[fi];
  const extra = {
    [`ownership/${swap.offered}`]: fromId, [`ownership/${theirs}`]: S.playerId,
    [`players/${mi}/cash`]: game.players[mi].cash + SWAP_BONUS, [`players/${fi}/cash`]: other.cash + SWAP_BONUS,
    'swap/status':'done', 'swap/winner': fromId,
  };
  return endTurn(game, extra, [{
    text: `Échange conclu : ${BOARD[swap.offered].name} ↔ ${BOARD[theirs].name}. ${me(game).name} et ${other.name} touchent chacun ${SWAP_BONUS} $.`,
    meta: { t:'swap', p: S.playerId, o: fromId, pos: swap.offered, pos2: theirs },
  }]);
}

export async function cancelSwap() {
  const game = S.game;
  const swap = game.swap;
  if (!swap || swap.status !== 'open' || swap.ownerId !== S.playerId) return;
  return endTurn(game, { 'swap/status':'cancelled' }, [{ text:`${me(game).name} n’accepte aucune offre.`, meta:{ t:'swap-cancel', p: S.playerId } }]);
}

// ================================================================ prison
// La caution ne fait pas perdre le tour : le joueur sort et peut lancer le de.
export async function payBail() {
  const game = S.game;
  const idx = myIdx(game);
  const player = game.players[idx];
  if (!player || game.turnIndex !== idx || !player.inJail) return;
  if (player.cash < BAIL) { toast('Pas assez pour payer la caution.'); return; }
  await commit(game.code, { [`players/${idx}/cash`]: player.cash - BAIL, [`players/${idx}/inJail`]: false, [`players/${idx}/jailTurns`]: 0,
    currentAction: null, turnDeadline: deadline(game), updatedAt: now() });
  pushHistory(game.code, `${player.name} paie ${BAIL} $ de caution et sort de prison : le tour continue.`, { t:'bail', p: player.id, amt: BAIL });
}

export async function serveJailTurn() {
  const game = S.game;
  const idx = myIdx(game);
  const player = game.players[idx];
  if (!player || game.turnIndex !== idx || !player.inJail) return;
  const remaining = Math.max(0, (player.jailTurns || 0) - 1);
  const extra = { [`players/${idx}/jailTurns`]: remaining };
  if (remaining === 0) extra[`players/${idx}/inJail`] = false;
  return endTurn(game, extra, [{
    text: remaining === 0 ? `${player.name} a purgé sa peine et sortira au prochain tour.` : `${player.name} reste en prison (${remaining} tour${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}).`,
    meta: { t:'jail-wait', p: player.id, left: remaining },
  }], { advance: true });
}

// ================================================================ batiments / vente
export async function buildOn(pos) {
  const game = S.game;
  pos = Number(pos);
  const check = canBuild(game, S.playerId, pos);
  if (!check.ok) { toast(check.reason); return false; }
  const idx = myIdx(game);
  await commit(game.code, { [`buildings/${pos}`]: check.level, [`players/${idx}/cash`]: game.players[idx].cash - check.cost, updatedAt: now() });
  pushHistory(game.code, `${me(game).name} construit à ${BOARD[pos].name} : ${check.level} bâtiment${check.level > 1 ? 's' : ''} (−${check.cost} $). Loyer : ${rentFor({ ...game, buildings:{ ...(game.buildings || {}), [pos]: check.level } }, pos)} $.`,
    { t:'build', p: S.playerId, pos, lvl: check.level, amt: check.cost });
  return true;
}

export async function sellProperty(pos) {
  const game = S.game;
  pos = Number(pos);
  const check = canSell(game, S.playerId, pos);
  if (!check.ok) { toast(check.reason); return false; }
  const idx = myIdx(game);
  await commit(game.code, { [`ownership/${pos}`]: null, [`buildings/${pos}`]: null,
    [`players/${idx}/cash`]: game.players[idx].cash + check.value, updatedAt: now() });
  pushHistory(game.code, `${me(game).name} revend ${BOARD[pos].name} à la banque pour ${check.value} $ (80 %).`, { t:'sell', p: S.playerId, pos, amt: check.value });
  return true;
}

// ================================================================ arbitrage de l'hote
export function hostArbitrate(game, fromTick = false) {
  if (!S.isHost || !game || game.phase !== 'playing') return;
  maybeResolveAuction(game);
  maybeResolveTradeTimeout(game);
  maybeResolveSwap(game);
  maybeRescueWheel(game);
  maybeBankrupt(game);
  maybeFinishGame(game);
  if (fromTick) enforceTurnDeadline(game);
}

function maybeResolveAuction(game) {
  const auction = game.auction;
  if (!auction || auction.status !== 'open' || now() <= auction.endAt) return;
  const key = `${auction.position}@${auction.endAt}`;
  if (guards.auction === key) return;
  guards.auction = key;
  const winner = auction.highestBidder ? playerById(game, auction.highestBidder) : null;
  const extra = { 'auction/status':'closed' };
  let text = `Aucune offre pour ${BOARD[auction.position].name}.`;
  // Le gagnant a pu depenser entre-temps : on revalide son argent.
  if (winner && winner.cash >= auction.highestBid) {
    const wi = indexOfPlayer(game, winner.id);
    extra[`ownership/${auction.position}`] = winner.id;
    extra[`players/${wi}/cash`] = winner.cash - auction.highestBid;
    text = `${winner.name} remporte ${BOARD[auction.position].name} pour ${auction.highestBid} $.`;
  } else if (winner) text = `${winner.name} ne peut plus payer : ${BOARD[auction.position].name} reste à la banque.`;
  endTurn(game, extra, [{ text, meta:{ t:'auction', p: winner && winner.id, pos: auction.position, amt: auction.highestBid } }]);
}

function maybeResolveTradeTimeout(game) {
  const trade = game.trade;
  if (!trade || trade.status !== 'pending' || now() <= trade.expiresAt) return;
  const key = `${trade.fromId}@${trade.createdAt}`;
  if (guards.trade === key) return;
  guards.trade = key;
  commit(game.code, { 'trade/status':'cancelled', 'trade/updatedAt': now() });
  pushHistory(game.code, 'La proposition d’échange a expiré.', { t:'trade-expired' });
}

function maybeResolveSwap(game) {
  const swap = game.swap;
  if (!swap || swap.status !== 'open' || now() <= swap.endAt) return;
  if (guards.swap === swap.id) return;
  guards.swap = swap.id;
  const owner = playerById(game, swap.ownerId);
  endTurn(game, { 'swap/status':'expired' }, [{ text:`Temps écoulé : ${owner ? owner.name : '?'} garde ${BOARD[swap.offered].name}.`, meta:{ t:'swap-expired' } }]);
}

// Le client qui fait tourner la roue a pu fermer l'onglet : l'hote termine.
function maybeRescueWheel(game) {
  const ev = game.event;
  if (!ev || ev.kind !== 'wheel' || ev.status !== 'spin') return;
  if (now() < (ev.spinAt || 0) + WHEEL_MS + WHEEL_FALLBACK_MS) return;
  finishWheel(ev.id);
}

function maybeBankrupt(game) {
  game.players.forEach((player, idx) => {
    if (!isBankrupt(game, player) || guards.bankrupt.has(player.id)) return;
    guards.bankrupt.add(player.id);
    let extra = bankruptcyUpdates(game, player);
    if (game.trade && game.trade.status === 'pending' && [game.trade.fromId, game.trade.toId].includes(player.id)) extra['trade/status'] = 'cancelled';
    if (game.swap && game.swap.status === 'open' && game.swap.ownerId === player.id) extra['swap/status'] = 'cancelled';
    const line = { text:`${player.name} fait faillite (${player.cash} $, fortune ${netWorth(game, player)} $). Ses propriétés retournent à la banque.`,
      meta:{ t:'bankrupt', p: player.id, amt: player.cash } };
    if (game.turnIndex === idx) { endTurn(game, extra, [line], { advance: true }); return; }
    commit(game.code, { ...extra, updatedAt: now() });
    pushHistory(game.code, line.text, line.meta);
  });
}

// Seul l'hote ecrit le resultat.
function maybeFinishGame(game) {
  const result = winnerCheck(game);
  if (!result || guards.finished === game.code) return;
  guards.finished = game.code;
  const w = result.winner;
  commit(game.code, { phase:'finished', winnerId: w.id, currentAction:null, turnDeadline:null, updatedAt:now() });
  const worth = netWorth(game, w);
  const text = result.reason === 'target' ? `${w.name} atteint ${targetOf(game)} $ de fortune nette et remporte la partie.`
    : result.reason === 'survivor' ? `${w.name} reste seul en lice et remporte la partie.`
    : `Fin des ${roundsOf(game)} manches : ${w.name} gagne avec ${worth} $ de fortune nette.`;
  pushHistory(game.code, text, { t:'win', p: w.id, amt: worth, reason: result.reason });
}

// Un joueur absent bloquait la partie : l'hote passe les tours expires, en
// appliquant le choix par defaut des decisions en attente.
function enforceTurnDeadline(game) {
  if (openBlocking(game)) return;
  if (!game.turnDeadline || now() <= game.turnDeadline + TURN_GRACE_MS) return;
  if (guards.deadline === game.turnDeadline) return;
  guards.deadline = game.turnDeadline;
  const player = currentPlayer(game);
  if (!player) return;
  const a = game.currentAction;
  if (a && a.type === 'wheel' && game.event) return finishWheel(game.event.id);
  if (a && a.type === 'dilemma' && game.event) {
    const d = DILEMMAS.find(x => x.id === game.event.key);
    const out = resolveDilemma(game, player.id, game.event.key, d.afk, game.event.detail || {});
    out.text = `${player.name} n’a pas choisi à temps. ${out.text}`;
    return applyOutcome(game, out, { 'event/status':'done', 'event/choice': d.afk });
  }
  if (a && a.type === 'seize') {
    const pos = autoSeizePick(game, a.victimId);
    const out = pos !== undefined && resolveSeize(game, a.chooserId, a.victimId, pos);
    if (out) return applyOutcome(game, out);
  }
  const extra = {};
  if (player.inJail) {
    const remaining = Math.max(0, (player.jailTurns || 0) - 1);
    extra[`players/${game.turnIndex}/jailTurns`] = remaining;
    if (remaining === 0) extra[`players/${game.turnIndex}/inJail`] = false;
  }
  endTurn(game, extra, [{ text:`${player.name} n’a pas joué à temps : son tour est passé.`, meta:{ t:'afk', p: player.id } }], { advance: true });
}

export function sendChat(text) {
  text = String(text || '').trim().slice(0, 160);
  if (!text || !S.game) return;
  pushChat(S.game.code, { author: S.name, pid: S.playerId, text, kind:'player' });
}

export { WHEEL };
