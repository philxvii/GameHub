// Point d'entree : relie l'etat Firebase, le rendu, le presentateur et les clics.

import { S, loadLocal } from './net.js';
import * as A from './actions.js';
import * as R from './render.js';
import { observe, presenterDebug } from './presenter.js';
import { toast, syncPawns, finishMoves } from './fx.js';
import { getSquareColor, BOARD } from './board.js';

A.hooks.onGame = game => { R.renderState(game); observe(game); };
A.hooks.onGone = () => { R.resetVisualState(); R.toggleDrawer(false); };
A.hooks.onShow = id => R.show(id);

const $id = id => document.getElementById(id);

function readTradeForm() {
  const num = id => parseInt($id(id).value, 10) || 0;
  const prop = id => ($id(id).value === '' ? null : Number($id(id).value));
  return { recipient: $id('trade-recipient').value, offerCash: num('trade-offer-cash'), requestCash: num('trade-request-cash'),
    offerProperty: prop('trade-offer-property'), requestProperty: prop('trade-request-property') };
}

async function proposeTrade() {
  const error = await A.proposeTrade(readTradeForm());
  $id('trade-error').textContent = error || '';
  if (!error) R.closeModal('modal-trade');
}

// Vente en deux temps : le premier clic arme le bouton, le second confirme.
async function sellConfirm(arg, el) {
  if (el && el.dataset.armed !== '1') {
    el.dataset.armed = '1';
    const label = el.innerHTML;
    el.classList.add('armed');
    el.innerHTML = 'Confirmer ?';
    setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.classList.remove('armed'); el.innerHTML = label; } }, 3000);
    return;
  }
  return A.sellProperty(arg);
}

function copyCode() {
  if (!S.code || !navigator.clipboard) return;
  navigator.clipboard.writeText(S.code).then(() => toast('Code copié !')).catch(() => {});
}

const ACTS = {
  create: () => A.createGame(),
  join: () => A.joinGame(),
  start: () => A.startGame(),
  restart: () => A.restartGame(),
  delete: () => A.deleteGame(),
  leave: () => { R.toggleDrawer(false); A.leaveGame(); },
  copy: copyCode,
  roll: () => A.rollDice(),
  buy: () => A.buyProperty(),
  auction: () => A.startAuction(),
  'bid-open': () => R.openAuctionModal(),
  bid: () => A.placeBid($id('auction-bid').value),
  'bid-close': () => R.dismissAuction(),
  'trade-open': () => R.openTradeModal(),
  'trade-send': proposeTrade,
  'trade-close': () => R.closeModal('modal-trade'),
  'trade-accept': () => A.acceptTrade(),
  'trade-decline': () => A.declineTrade(),
  bail: () => A.payBail(),
  serve: () => A.serveJailTurn(),
  build: arg => A.buildOn(arg),
  sell: sellConfirm,
  square: arg => R.openSquareSheet(arg),
  'sheet-close': () => R.closeModal('modal-square'),
  'swap-pick': arg => A.pickSwapOffer(arg),
  'swap-skip': () => A.skipSwap(),
  'swap-offer': arg => A.offerSwap(arg),
  'swap-accept': arg => A.acceptSwap(arg),
  'swap-cancel': () => A.cancelSwap(),
  dilemma: arg => A.chooseDilemma(arg),
  steal: arg => A.chooseSteal(arg),
  'steal-skip': () => A.skipSteal(),
  seize: arg => A.chooseSeize(arg),
  'overlay-close': () => R.overlayClose(),
  drawer: () => R.toggleDrawer(),
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  const loading = el.classList.contains('btn') && el.dataset.act !== 'sell';
  if (loading) el.classList.add('is-loading');
  try { await fn(el.dataset.arg, el); }
  catch (err) { console.error(err); toast('Action impossible : ' + (err && err.message ? err.message : err)); }
  finally { if (loading) el.classList.remove('is-loading'); }
});

$id('chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $id('chat-input');
  A.sendChat(input.value);
  input.value = '';
});

// Clavier : Espace lance le de (hors saisie), Echap ferme modales et tiroir.
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(m => (m.id === 'modal-auction' ? R.dismissAuction() : m.classList.remove('active')));
    R.toggleDrawer(false);
    R.overlayClose();
  }
  if (e.code === 'Space' && !typing && document.body.dataset.screen === 's-game') {
    const roll = document.querySelector('#action-panel [data-act="roll"]');
    if (roll && !roll.disabled) { e.preventDefault(); roll.click(); }
  }
});

// Le plateau est fluide : on repositionne les pions quand sa geometrie change.
let resizeRaf = null;
const relayout = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { finishMoves(); if (S.game) syncPawns(S.game); }); };
// rAF ne tourne pas dans un onglet masque : on recale aussi immediatement.
window.addEventListener('resize', () => { finishMoves(); if (S.game) syncPawns(S.game); });
window.addEventListener('resize', relayout);
if (typeof ResizeObserver === 'function') new ResizeObserver(relayout).observe($id('board-grid'));

// Le bandeau du lobby reprend les vraies couleurs des groupes.
function paintLobbyStrip() {
  const strip = $id('lobby-strip');
  if (!strip || strip.childElementCount) return;
  const seenGroups = new Set();
  BOARD.filter(sq => sq.type === 'property' && !seenGroups.has(sq.group) && seenGroups.add(sq.group)).forEach(sq => {
    const seg = document.createElement('i');
    seg.style.background = getSquareColor(sq);
    strip.appendChild(seg);
  });
}

// Interface de test et de compatibilite (tools/test-browser.js).
Object.assign(window, {
  rollDice: A.rollDice, buyProperty: A.buyProperty, startAuction: A.startAuction, openTradeModal: R.openTradeModal,
  proposeTrade, acceptTrade: A.acceptTrade, declineTrade: A.declineTrade, payBail: A.payBail, serveJailTurn: A.serveJailTurn,
  leaveGame: A.leaveGame, restartGame: A.restartGame, toggleDrawer: R.toggleDrawer,
  __bq: { S, A, R, presenter: presenterDebug },
});

R.initBoard();
paintLobbyStrip();
$id('host-av').innerHTML = R.HOST_AVATAR;
$id('join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
loadLocal();
if (S.code) A.autoReconnect();
