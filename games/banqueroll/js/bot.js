// Bots : de vrais joueurs dans l'etat (`bot: true`), joues par le client de l'HOTE.
//
// Le bot passe par les memes actions qu'un humain (actions.js, parametre `by`) :
// il ne triche pas, ne tire aucun hasard lui-meme (le de vient de rollDice) et
// respecte les memes regles. Un pas a la fois, avec un delai pour qu'on voie le
// de, le pion et les cartes comme pour un joueur en chair et en os.
//
// Strategie volontairement simple et lisible : acheter en gardant une reserve,
// construire sur un groupe complet, encherir sous la valeur de la case, accepter
// les echanges qui lui rapportent.

import { S } from './net.js';
import * as A from './actions.js';
import { BOARD } from './board.js';
import { currentPlayer, playerById, ownedBy, canBuild, canSell, tradeable, openBlocking, ownsFullGroup, BAIL } from './rules.js';
import { raidTargets, autoSeizePick } from './chance.js';
import { isPawnMoving } from './fx.js';

const RESERVE = 200;          // le bot garde au moins ca apres un achat
const BUILD_RESERVE = 280;    // et un peu plus apres une construction
const now = () => Date.now();
const jitter = (ms, spread = 500) => ms + Math.random() * spread;
const isBot = (game, id) => !!(playerById(game, id) || {}).bot;
const price = pos => (pos === null || pos === undefined || pos < 0 ? 0 : BOARD[pos].price || 0);

let timer = null;
let busy = false;

// Appele a chaque mise a jour et par un tick : planifie au plus une action a la fois.
function tick() {
  const game = S.game;
  if (!S.isHost || !game || game.phase !== 'playing' || busy || timer) return;
  if (!game.players.some(p => p.bot && !p.bankrupt)) return;
  const step = nextStep(game);
  if (!step) return;
  timer = setTimeout(async () => {
    timer = null;
    // On recalcule sur l'etat frais : il a pu changer pendant l'attente.
    const fresh = S.game && S.game.phase === 'playing' ? nextStep(S.game) : null;
    if (!fresh) return;
    busy = true;
    try { await fresh.run(); } catch (e) { console.warn('[bot]', e && e.message); } finally { busy = false; }
  }, step.delay);
}

export function watchBots() {
  setInterval(tick, 600);
}

// ---------------------------------------------------------------- decisions
function nextStep(game) {
  const bots = game.players.filter(p => p.bot && !p.bankrupt);
  if (!bots.length) return null;
  const a = game.currentAction;

  // 1. Echange propose a un bot : il repond, meme hors de son tour.
  const t = game.trade;
  if (t && t.status === 'pending' && isBot(game, t.toId)) {
    return { delay: jitter(1800), run: () => (tradeIsGood(game, t) ? A.acceptTrade(t.toId) : A.declineTrade(t.toId)) };
  }

  // 2. Enchere ouverte : un bot surencherit tant que la case reste une affaire.
  const au = game.auction;
  if (au && au.status === 'open' && now() < au.endAt - 1200) {
    const value = price(au.position) * 0.85;
    const bidder = bots.find(b => b.id !== au.highestBidder && au.nextBid <= value && b.cash - au.nextBid >= RESERVE);
    if (bidder) return { delay: jitter(900, 900), run: () => A.placeBid(au.nextBid, bidder.id) };
  }

  // 3. Case Auction (echange de proprietes).
  const sw = game.swap;
  if (sw && sw.status === 'open') {
    if (isBot(game, sw.ownerId)) {
      const offers = Object.entries(sw.offers || {}).filter(([, pos]) => Number(pos) >= 0);
      const best = offers.sort((x, y) => price(Number(y[1])) - price(Number(x[1])))[0];
      const waited = now() > sw.endAt - 37000;     // laisse ~8 s aux autres pour proposer
      if (best && waited && price(Number(best[1])) >= price(sw.offered) * 0.9) return { delay: jitter(1200), run: () => A.acceptSwap(best[0], sw.ownerId) };
      if (now() > sw.endAt - 20000) return { delay: jitter(800), run: () => A.cancelSwap(sw.ownerId) };
      return null;
    }
    const offerer = bots.find(b => b.id !== sw.ownerId && (sw.offers || {})[b.id] === undefined && swapCandidate(game, b, sw) !== undefined);
    if (offerer) return { delay: jitter(2500, 1500), run: () => A.offerSwap(swapCandidate(game, offerer, sw), offerer.id) };
    return null;
  }

  // 4. Saisie (pret toxique) : le choix peut revenir a un bot hors de son tour.
  if (a && a.type === 'seize' && isBot(game, a.chooserId)) {
    const pos = autoSeizePick(game, a.victimId);
    if (pos !== undefined) return { delay: jitter(1500), run: () => A.chooseSeize(pos, a.chooserId) };
  }

  // 5. Le tour d'un bot.
  const cur = currentPlayer(game);
  if (!cur || !cur.bot || cur.bankrupt) return null;
  if (isPawnMoving(cur.id)) return null;              // on laisse le pion finir son trajet
  if (a && a.playerId === cur.id) {
    if (a.type === 'buy') {
      const cost = price(a.position);
      return { delay: jitter(1400), run: () => (cur.cash - cost >= RESERVE ? A.buyProperty(cur.id) : A.startAuction(cur.id)) };
    }
    if (a.type === 'dilemma') return { delay: jitter(2600, 900), run: () => A.chooseDilemma(pickDilemma(game, cur), cur.id) };
    if (a.type === 'steal') {
      const target = raidTargets(game, cur).filter(o => cur.cash - price(o.pos) >= RESERVE).sort((x, y) => price(y.pos) - price(x.pos))[0];
      return { delay: jitter(1800), run: () => (target ? A.chooseSteal(target.pos, cur.id) : A.skipSteal(cur.id)) };
    }
    if (a.type === 'swapPick') {
      const mine = ownedBy(game, cur.id).filter(p => tradeable(game, p)).sort((x, y) => price(x) - price(y));
      return { delay: jitter(1500), run: () => (mine.length ? A.pickSwapOffer(mine[0], cur.id) : A.skipSwap(cur.id)) };
    }
    return null;                                      // roue : elle se termine seule
  }
  if (a || openBlocking(game) || (game.event && game.event.status === 'spin')) return null;
  if (cur.inJail) {
    return { delay: jitter(1500), run: () => (cur.cash >= BAIL + 350 ? A.payBail(cur.id) : A.serveJailTurn(cur.id)) };
  }
  if (game.turnRolled === cur.id) return null;        // la case est en cours de resolution

  // Avant de lancer : vendre si on est a decouvert, construire si on peut.
  if (cur.cash < 0) {
    const sale = ownedBy(game, cur.id).filter(p => canSell(game, cur.id, p).ok).sort((x, y) => price(x) - price(y))[0];
    if (sale !== undefined) return { delay: jitter(1200), run: () => A.sellProperty(sale, cur.id) };
  }
  const build = ownedBy(game, cur.id).map(pos => ({ pos, c: canBuild(game, cur.id, pos) }))
    .filter(x => x.c.ok && cur.cash - x.c.cost >= BUILD_RESERVE).sort((x, y) => x.c.cost - y.c.cost)[0];
  if (build) return { delay: jitter(1300), run: () => A.buildOn(build.pos, cur.id) };
  return { delay: jitter(1500, 700), run: () => A.rollDice(cur.id) };
}

// Un echange est bon s'il rapporte au bot, sans offrir un groupe complet a l'autre.
function tradeIsGood(game, t) {
  const bot = playerById(game, t.toId);
  if (!bot || bot.cash < (t.requestCash || 0)) return false;
  let gain = (t.offerCash || 0) - (t.requestCash || 0) + price(t.offerProperty) - price(t.requestProperty);
  const has = v => v !== null && v !== undefined;
  if (has(t.requestProperty)) {
    const sq = BOARD[t.requestProperty];
    const after = { ...game, ownership: { ...(game.ownership || {}), [t.requestProperty]: t.fromId } };
    if (sq.type === 'property' && ownsFullGroup(after, t.fromId, sq.group)) gain -= 350;
  }
  if (has(t.offerProperty)) {
    const sq = BOARD[t.offerProperty];
    const after = { ...game, ownership: { ...(game.ownership || {}), [t.offerProperty]: bot.id } };
    if (sq.type === 'property' && ownsFullGroup(after, bot.id, sq.group)) gain += 250;
  }
  return gain >= 60;
}

// Case Auction tenue par quelqu'un d'autre : le bot propose sa ville la moins chere
// qui ne vaut pas plus que celle en jeu (une offre qu'on a une chance d'accepter).
function swapCandidate(game, bot, sw) {
  return ownedBy(game, bot.id).filter(p => tradeable(game, p) && price(p) <= price(sw.offered) * 1.1)
    .sort((x, y) => price(x) - price(y))[0];
}

// Dilemmes : prudent quand il est pauvre, joueur quand il est riche.
function pickDilemma(game, me) {
  const key = game.event && game.event.key;
  const cash = me.cash;
  switch (key) {
    case 'taxman': return cash >= 450 ? 'A' : 'B';
    case 'faust': return cash < 350 ? 'A' : 'B';
    case 'loan': return cash < 250 ? 'A' : 'B';
    case 'double': return cash >= 700 && Math.random() < 0.6 ? 'A' : 'B';
    case 'shortcut': return Math.random() < 0.5 ? 'A' : 'B';
    case 'robin': {
      const richest = game.players.filter(p => !p.bankrupt).sort((x, y) => y.cash - x.cash)[0];
      return richest && richest.id === me.id ? 'B' : 'A';
    }
    case 'insider': return cash >= 900 && Math.random() < 0.4 ? 'A' : 'B';
    default: return Math.random() < 0.5 ? 'A' : 'B';
  }
}

// Pour les tests.
export const botDebug = { nextStep: game => { const s = nextStep(game); return s ? { delay: Math.round(s.delay) } : null; }, tradeIsGood, pickDilemma };
