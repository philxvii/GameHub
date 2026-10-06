// Moteur de regles : fonctions PURES. Elles lisent un etat de partie et
// renvoient des valeurs ou des mises a jour Firebase (chemins -> valeurs).
// Aucune ecriture ici : c'est actions.js qui commite. Testable dans Node.

import { BOARD, GROUPS, isOwnable, isPublic, JAIL_INDEX, START_INDEX } from './board.js';

// ------------------------------------------------------------ constantes
export const START_CASH = 1500;
export const START_BONUS = 200;
export const LATE_BONUS = 25;        // regle maison : +25 $ par rang de passage au premier tour
export const BAIL = 150;
export const JAIL_TURNS = 3;
export const SELL_RATIO = 0.8;
export const BANKRUPT_CASH = -500;
export const SWAP_BONUS = 100;
export const SWAP_DURATION = 45;
export const AUCTION_DURATION = 20;
export const TRADE_DURATION = 30;
export const TARGETS = [3000, 5000, 7000];
export const ROUND_LIMITS = [30, 50, 0];  // 0 = sans limite
export const LEGACY_MAX_ROUNDS = 34;      // parties creees avant les reglages

// Bareme maison : le fichier de regles fixe le maximum (3 batiments par ville)
// mais ni les couts ni les loyers construits. Valide avec l'utilisateur.
export const BUILD_COST_RATIO = 0.5;   // un batiment coute 50 % du prix de la ville
export const RENT_RATIO = 0.10;        // loyer nu : 10 % du prix
export const RENT_FULL_GROUP = 2;      // groupe complet, sans batiment : x2
export const RENT_BUILDINGS = [4, 7, 10]; // 1, 2, 3 batiments : x4, x7, x10 du loyer nu
export const MAX_BUILDINGS = 3;
export const PUBLIC_BASE_RENT = 50;    // x nombre de proprietes publiques possedees

// ------------------------------------------------------------ reglages
export const targetOf = game => (game && game.settings && game.settings.target) || TARGETS[0];
export function roundsOf(game) {
  if (game && game.settings && game.settings.maxRounds !== undefined) return Number(game.settings.maxRounds) || 0;
  return LEGACY_MAX_ROUNDS;
}

// ------------------------------------------------------------ lecture
export const playersOf = game => (game && game.players) || [];
export const alivePlayers = game => playersOf(game).filter(p => !p.bankrupt);
export const indexOfPlayer = (game, id) => playersOf(game).findIndex(p => p.id === id);
export const playerById = (game, id) => playersOf(game).find(p => p.id === id) || null;
export const ownerOf = (game, pos) => ((game && game.ownership) || {})[pos] || null;
export const levelOf = (game, pos) => Number(((game && game.buildings) || {})[pos]) || 0;
export const currentPlayer = game => playersOf(game)[game.turnIndex] || null;

export function ownedBy(game, playerId) {
  return Object.entries((game && game.ownership) || {})
    .filter(([, owner]) => owner === playerId)
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b);
}

export function ownsFullGroup(game, playerId, group) {
  const list = GROUPS[group];
  return !!list && !!playerId && list.every(i => ownerOf(game, i) === playerId);
}

export function groupProgress(game, playerId, group) {
  const list = GROUPS[group] || [];
  return { owned: list.filter(i => ownerOf(game, i) === playerId).length, total: list.length };
}

export const buildCost = pos => Math.round(BOARD[pos].price * BUILD_COST_RATIO);
export const baseRent = pos => Math.round(BOARD[pos].price * RENT_RATIO);

// Loyer du par un visiteur, hors bonus temporaire (rentBoost du proprietaire).
export function rentFor(game, pos) {
  const sq = BOARD[pos];
  const owner = ownerOf(game, pos);
  if (!owner || !isOwnable(sq)) return 0;
  if (isPublic(sq)) {
    const count = ownedBy(game, owner).filter(i => isPublic(BOARD[i])).length;
    return PUBLIC_BASE_RENT * count;
  }
  const level = levelOf(game, pos);
  if (level > 0) return baseRent(pos) * RENT_BUILDINGS[level - 1];
  return baseRent(pos) * (ownsFullGroup(game, owner, sq.group) ? RENT_FULL_GROUP : 1);
}

// Valeur d'une propriete pour la fortune nette : prix + batiments payes.
export const propertyValue = (game, pos) => (BOARD[pos].price || 0) + levelOf(game, pos) * (BOARD[pos].type === 'property' ? buildCost(pos) : 0);
export const sellValue = (game, pos) => Math.round(propertyValue(game, pos) * SELL_RATIO);

export function netWorth(game, player) {
  if (!player) return 0;
  return (player.cash || 0) + ownedBy(game, player.id).reduce((sum, pos) => sum + propertyValue(game, pos), 0);
}

export function ranking(game) {
  return [...alivePlayers(game)].sort((a, b) => netWorth(game, b) - netWorth(game, a));
}

// Une ville batie ne s'echange pas : elle se vend (avec ses batiments) ou reste.
export const tradeable = (game, pos) => isOwnable(BOARD[pos]) && levelOf(game, pos) === 0;

// ------------------------------------------------------------ tour
export function isMyTurn(game, playerId) {
  const p = currentPlayer(game);
  return !!game && game.phase === 'playing' && !!p && p.id === playerId;
}

// Construire : groupe complet, debut de tour (avant le lancer), argent suffisant.
export function canBuild(game, playerId, pos) {
  const sq = BOARD[pos];
  if (!sq || sq.type !== 'property') return { ok:false, reason:'Seules les villes se construisent.' };
  if (!isMyTurn(game, playerId)) return { ok:false, reason:'Ce n’est pas ton tour.' };
  if (game.turnRolled === playerId) return { ok:false, reason:'On construit au début du tour, avant de lancer le dé.' };
  if (game.currentAction || openBlocking(game)) return { ok:false, reason:'Termine d’abord l’action en cours.' };
  if (ownerOf(game, pos) !== playerId) return { ok:false, reason:'Cette ville ne t’appartient pas.' };
  if (!ownsFullGroup(game, playerId, sq.group)) {
    const g = groupProgress(game, playerId, sq.group);
    return { ok:false, reason:`Groupe incomplet (${g.owned}/${g.total}) : construction impossible.` };
  }
  const level = levelOf(game, pos);
  if (level >= MAX_BUILDINGS) return { ok:false, reason:`Maximum atteint : ${MAX_BUILDINGS} bâtiments.` };
  const me = playerById(game, playerId);
  if (!me || me.cash < buildCost(pos)) return { ok:false, reason:`Il faut ${buildCost(pos)} $ pour construire.` };
  return { ok:true, cost: buildCost(pos), level: level + 1 };
}

export function canSell(game, playerId, pos) {
  if (!isMyTurn(game, playerId)) return { ok:false, reason:'On vend pendant son tour.' };
  if (ownerOf(game, pos) !== playerId) return { ok:false, reason:'Cette propriété ne t’appartient pas.' };
  if (openBlocking(game)) return { ok:false, reason:'Attends la fin de l’échange en cours.' };
  const a = game.currentAction;
  if (a && a.type !== 'buy') return { ok:false, reason:'Termine d’abord l’action en cours.' };
  return { ok:true, value: sellValue(game, pos) };
}

// Ce qui gele le tour : enchere, proposition d'echange, echange Auction.
export function openBlocking(game) {
  return !!((game.auction && game.auction.status === 'open')
    || (game.trade && game.trade.status === 'pending')
    || (game.swap && game.swap.status === 'open'));
}

// Fin de tour : relance sur 6, joueurs en faillite et tours sautes.
// Renvoie { updates, skipped } ; l'appelant commite et journalise.
export function planNextTurn(game, extra = {}, { advance = false, now = Date.now() } = {}) {
  const players = playersOf(game);
  const n = players.length;
  const cur = players[game.turnIndex];
  const updates = { ...extra, currentAction:null, turnRolled:null, extraRoll:null, updatedAt:now };
  const jailedNow = extra[`players/${game.turnIndex}/inJail`] === true;
  const brokeNow = extra[`players/${game.turnIndex}/bankrupt`] === true;
  const skipped = [];
  // Relance accordee par un 6, ou dans cette meme ecriture (roue, Robin des bois).
  const again = (extra.extraRoll !== undefined ? extra.extraRoll : game.extraRoll) === (cur && cur.id);
  // Un 6 donne un nouveau lancer, sauf si le tour finit en prison ou en faillite.
  if (!advance && cur && again && !jailedNow && !brokeNow && !cur.inJail && !cur.bankrupt) {
    updates.turnDeadline = now + game.turnTimer * 1000;
    return { updates, skipped, again:true };
  }
  let idx = game.turnIndex;
  let round = game.round || 1;
  for (let k = 0; k < n; k++) {
    idx = (idx + 1) % n;
    if (idx === 0) round++;
    const p = players[idx];
    if (!p || p.bankrupt || extra[`players/${idx}/bankrupt`] === true) continue;
    if (p.skipNext && extra[`players/${idx}/skipNext`] === undefined) {
      updates[`players/${idx}/skipNext`] = null;
      skipped.push(p.name);
      continue;
    }
    break;
  }
  updates.turnIndex = idx;
  updates.round = round;
  updates.turnDeadline = now + game.turnTimer * 1000;
  return { updates, skipped, again:false };
}

// Faillite (regle 12) : fortune nette <= 0 ou argent < -500 $.
export function isBankrupt(game, player) {
  if (!player || player.bankrupt) return false;
  return (player.cash || 0) < BANKRUPT_CASH || netWorth(game, player) <= 0;
}

// Elimination : proprietes et batiments retournent a la banque.
export function bankruptcyUpdates(game, player) {
  const idx = indexOfPlayer(game, player.id);
  const updates = { [`players/${idx}/bankrupt`]:true, [`players/${idx}/inJail`]:false, [`players/${idx}/jailTurns`]:0 };
  ownedBy(game, player.id).forEach(pos => {
    updates[`ownership/${pos}`] = null;
    updates[`buildings/${pos}`] = null;
  });
  return updates;
}

// Fin de partie : dernier survivant, objectif atteint, ou limite de manches.
export function winnerCheck(game) {
  if (!game || game.phase !== 'playing') return null;
  const alive = alivePlayers(game);
  if (alive.length === 1 && playersOf(game).length > 1) return { winner: alive[0], reason:'survivor' };
  const best = ranking(game)[0];
  if (!best) return null;
  if (netWorth(game, best) >= targetOf(game)) return { winner: best, reason:'target' };
  const max = roundsOf(game);
  if (max > 0 && (game.round || 1) > max) return { winner: best, reason:'rounds' };
  return null;
}

// Ordre initial aleatoire, bonus pour ceux qui jouent plus tard (regle 2).
export function startingPlayers(players, rng = Math.random) {
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((p, rank) => ({
    ...p, position: START_INDEX, cash: START_CASH + rank * LATE_BONUS, jailTurns:0, inJail:false,
    bankrupt:false, skipNext:null, rentBoost:null,
  }));
}

export function jailUpdates(game, playerIdx) {
  return {
    [`players/${playerIdx}/position`]: JAIL_INDEX,
    [`players/${playerIdx}/inJail`]: true,
    [`players/${playerIdx}/jailTurns`]: JAIL_TURNS,
  };
}

// Applique des mises a jour "a la Firebase" sur une copie : sert aux tests
// et a anticiper l'etat apres un commit (faillite, presentateur).
export function applyUpdates(game, updates) {
  const next = JSON.parse(JSON.stringify(game));
  for (const [path, value] of Object.entries(updates)) {
    const keys = path.split('/');
    let node = next;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] === undefined || node[keys[i]] === null) node[keys[i]] = {};
      node = node[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (value === null) delete node[last]; else node[last] = value;
  }
  return next;
}
