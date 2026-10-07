// Rendu : etat Firebase -> DOM. Ne modifie jamais l'etat de jeu.
//
// Piege connu : le rendu tourne a chaque mise a jour Firebase. Les etats
// visuels transitoires (just-bought, landed, just-built) sont poses par
// classList, jamais en reassignant className.

import { BOARD, de, que, BOARD_LAYOUT, GROUPS, GROUP_COLORS, GROUP_LABELS, getSquareColor, readableInk, isOwnable, isPublic, sideOf, squareLabelText } from './board.js';
import {
  targetOf, roundsOf, playerById, ownerOf, levelOf, ownedBy, rentFor, baseRent, buildCost, netWorth, ranking,
  ownsFullGroup, groupProgress, canBuild, canSell, sellValue, tradeable, isMyTurn, currentPlayer, openBlocking,
  BAIL, RENT_FULL_GROUP, RENT_BUILDINGS, PUBLIC_BASE_RENT, MAX_BUILDINGS, SWAP_BONUS,
} from './rules.js';
import { DILEMMAS, WHEEL, CARDS, wheelGeometry, dilemmaOptions, raidTargets } from './chance.js';
import { S } from './net.js';
import {
  dieFacesHTML, setDieValue, animateDiceRoll, syncPawns, resetPawns, floatDelta, coinBurst, pulse, buildPop, rollNumber,
  wheelSVG, spinWheel, rainCoins, DIE_MS, WHEEL_MS,
} from './fx.js';
import { HOST_NAME } from './presenter.js';

// ================================================================ utilitaires
export const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const fmt = n => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} $`;
const signed = n => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString('fr-FR')} $`;
const initial = name => esc((String(name || '?').trim()[0] || '?').toUpperCase());
const $id = id => document.getElementById(id);
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

export function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id;
  if (id === 's-game') requestAnimationFrame(() => S.game && syncPawns(S.game));
}

// Etat purement visuel : jamais lu par la logique de jeu.
const seen = { cash:new Map(), owned:null, built:null, hostKey:null, histKey:null, chatCount:0, overlay:null, auctionDismissed:null, first:true };
let countdown = null;
let bubbleTimer = null;
let overlayTimer = null;
let chatStick = true;   // le chat suit les nouveaux messages tant qu'on ne remonte pas dans l'historique

export function resetVisualState() {
  resetPawns();
  Object.assign(seen, { cash:new Map(), owned:null, built:null, hostKey:null, histKey:null, chatCount:0, overlay:null, auctionDismissed:null, first:true });
  chatStick = true;
  closeOverlay();
  const v = $id('victory'); if (v) v.classList.remove('active');
  S.lastRollSeen = null;
}

// ================================================================ icones
const ICONS = {
  chance:'<svg viewBox="0 0 48 48"><path d="M17 17a7 7 0 1 1 10.5 6c-2.4 1.4-3.5 2.6-3.5 5v2" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="37.5" r="3.2" fill="currentColor"/></svg>',
  jail:'<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M17 9v30M24 9v30M31 9v30" stroke="currentColor" stroke-width="3.5"/></svg>',
  auction:'<svg viewBox="0 0 48 48"><path d="M9 17h26l-6-6M39 31H13l6 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  start:'<svg viewBox="0 0 48 48"><path d="M24 40V10M12 21 24 9l12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  station:'<svg viewBox="0 0 48 48"><rect x="12" y="7" width="24" height="27" rx="6" fill="currentColor"/><rect x="16" y="12" width="16" height="9" rx="2" fill="#fff" opacity=".85"/><circle cx="18" cy="28" r="2.4" fill="#fff"/><circle cx="30" cy="28" r="2.4" fill="#fff"/><path d="M15 41l4-6M33 41l-4-6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  airport:'<svg viewBox="0 0 48 48"><path d="M22 6c1.5-1.5 4.5-1.5 4 2l-.5 12 14 8v4l-14-4-.5 9 4 3v3l-6-2-6 2v-3l4-3-.5-9-14 4v-4l14-8L22 8z" fill="currentColor"/></svg>',
  boat:'<svg viewBox="0 0 48 48"><path d="M24 6v24H10L24 6z" fill="currentColor"/><path d="M27 12l11 18H27z" fill="currentColor" opacity=".7"/><path d="M6 33h36l-5 8H11z" fill="currentColor"/></svg>',
  event:'<svg viewBox="0 0 48 48"><path d="M27 4 11 27h11l-3 17 18-25H25z" fill="currentColor"/></svg>',
};
const iconFor = sq => ICONS[sq.type === 'airport' ? 'airport' : sq.id === 'boat' ? 'boat' : sq.type] || '';

export const HOST_AVATAR = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1B2420"/><circle cx="32" cy="32" r="27.5" fill="#D7A23A"/><circle cx="32" cy="32" r="24.5" fill="none" stroke="#1B2420" stroke-width="1" stroke-dasharray="2 2.4" opacity=".55"/><rect x="24" y="12" width="16" height="25" rx="8" fill="#1B2420"/><path d="M27 18h10M27 23h10M27 28h10" stroke="#B8893A" stroke-width="2"/><path d="M19 30a13 13 0 0 0 26 0" fill="none" stroke="#1B2420" stroke-width="3.5" stroke-linecap="round"/><path d="M32 43v8M24 52h16" stroke="#1B2420" stroke-width="3.5" stroke-linecap="round"/></svg>';

// ================================================================ plateau
export function initBoard() {
  const grid = $id('board-grid');
  if (!grid) return;
  grid.querySelectorAll('.square').forEach(n => n.remove());
  const frag = document.createDocumentFragment();
  BOARD.forEach((sq, index) => {
    const pos = BOARD_LAYOUT[index];
    const node = document.createElement('button');
    node.type = 'button';
    // Le type et le cote sont poses UNE fois ici ; le rendu n'utilise ensuite que classList.
    node.className = `square type-${sq.type} side-${sideOf(index)}` + (sq.group && sq.type === 'property' ? ` grp-${sq.group}` : '');
    node.dataset.index = index;
    node.dataset.act = 'square';
    node.dataset.arg = index;
    node.style.gridRow = pos.r;
    node.style.gridColumn = pos.c;
    const color = getSquareColor(sq);
    node.style.setProperty('--sq', color);
    node.style.setProperty('--sq-ink', readableInk(color));
    node.setAttribute('aria-label', sq.name);
    const city = sq.type === 'property';
    node.innerHTML = city
      ? `<span class="sq-band"><span class="sq-price">$${sq.price}</span></span><span class="sq-body"><span class="sq-name">${esc(sq.name)}</span></span><span class="sq-blds"><i class="bld"></i><i class="bld"></i><i class="bld"></i></span><span class="sq-owner"></span>`
      : `<span class="sq-band sq-band--thin">${isOwnable(sq) ? `<span class="sq-price">$${sq.price}</span>` : ''}</span><span class="sq-body"><span class="sq-icon">${iconFor(sq)}</span><span class="sq-name">${esc(sq.type === 'start' ? 'Départ' : sq.type === 'jail' ? 'Prison' : sq.name)}</span>${sq.type === 'start' ? '<span class="sq-sub">+200</span>' : ''}</span><span class="sq-owner"></span>`;
    frag.appendChild(node);
  });
  grid.appendChild(frag);
  const die = $id('die');
  if (die && !die.querySelector('.die-face')) die.querySelector('.die-cube').innerHTML = dieFacesHTML();
  setDieValue(1);
  $id('die').dataset.value = '';
}

function renderBoard(game) {
  const action = game.currentAction;
  const cur = currentPlayer(game);
  const mine = new Set(ownedBy(game, S.playerId));
  document.querySelectorAll('#board-grid .square').forEach(node => {
    const index = Number(node.dataset.index);
    const sq = BOARD[index];
    const ownerId = ownerOf(game, index);
    const owner = playerById(game, ownerId);
    const level = levelOf(game, index);
    node.classList.toggle('owned', !!owner);
    node.classList.toggle('mine', mine.has(index));
    node.classList.toggle('full', !!owner && sq.type === 'property' && ownsFullGroup(game, ownerId, sq.group));
    node.classList.toggle('target', !!(action && action.type === 'buy' && action.position === index));
    node.classList.toggle('current', game.phase === 'playing' && !!cur && cur.position === index);
    node.classList.toggle('buildable', game.phase === 'playing' && mine.has(index) && canBuild(game, S.playerId, index).ok);
    const swap = game.swap && game.swap.status === 'open' ? game.swap : null;
    node.classList.toggle('swap-target', !!swap && (swap.offered === index || Object.values(swap.offers || {}).includes(index)));
    node.dataset.level = level;
    if (owner) node.style.setProperty('--owner', owner.color); else node.style.removeProperty('--owner');
    const price = node.querySelector('.sq-price');
    if (price && isOwnable(sq)) price.textContent = owner ? `${rentFor(game, index)} $` : `$${sq.price}`;
    const ownerEl = node.querySelector('.sq-owner');
    if (ownerEl) ownerEl.textContent = owner ? owner.name : '';
    node.title = owner ? `${sq.name} — ${owner.name}${level ? ` · ${plural(level, 'bâtiment')}` : ''} · loyer ${rentFor(game, index)} $` : sq.name;
  });
}

// ================================================================ joueurs
function groupBars(game, pid) {
  return Object.keys(GROUPS).map(g => {
    const { owned, total } = groupProgress(game, pid, g);
    const pips = GROUPS[g].map(pos => `<i class="${ownerOf(game, pos) === pid ? 'on' : ''}"></i>`).join('');
    return `<span class="gset${owned === total ? ' full' : ''}" style="--g:${GROUP_COLORS[g]}" title="${esc(GROUP_LABELS[g])} ${owned}/${total}${owned === total ? ' · complet' : ''}">${pips}</span>`;
  }).join('');
}

// Barre de fortune : rendue a l'ancienne valeur puis animee vers la nouvelle
// (le panneau est regenere a chaque mise a jour, une transition seule ne jouerait pas).
const fortuneSeen = new Map();
function fortuneBar(game, player) {
  const pct = Math.max(1, Math.min(100, netWorth(game, player) / targetOf(game) * 100));
  const prev = fortuneSeen.has(player.id) ? fortuneSeen.get(player.id) : pct;
  fortuneSeen.set(player.id, pct);
  const dir = pct > prev + 0.1 ? ' up' : pct < prev - 0.1 ? ' down' : '';
  return `<div class="pprogress${dir}" data-to="${pct.toFixed(2)}" title="${Math.round(pct)} % de l’objectif (${fmt(targetOf(game))})"><i style="width:${prev.toFixed(2)}%"></i><b style="left:${prev.toFixed(2)}%"></b></div>`;
}

function animateBars(root) {
  const bars = root.querySelectorAll('.pprogress[data-to]');
  if (!bars.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(bar => {
    const to = bar.dataset.to + '%';
    bar.querySelector('i').style.width = to;
    bar.querySelector('b').style.left = to;
  })));
}

function playerCard(game, player, index, compact) {
  const active = game.phase === 'playing' && game.turnIndex === index;
  const net = netWorth(game, player);
  const target = targetOf(game);
  const tags = [player.id === game.hostId ? 'Hôte' : '', player.id === S.playerId ? 'Toi' : ''].filter(Boolean).join(' · ');
  const status = player.bankrupt ? '<span class="pstat pstat-out">Faillite</span>'
    : player.inJail ? `<span class="pstat pstat-jail">Prison · ${player.jailTurns || 0}</span>`
    : player.skipNext ? '<span class="pstat">Passe son tour</span>'
    : player.rentBoost ? '<span class="pstat pstat-boost">Loyer ×3</span>' : '';
  const cls = `pcard${active ? ' current' : ''}${player.id === S.playerId ? ' me' : ''}${player.bankrupt ? ' out' : ''}${player.cash < 0 ? ' debt' : ''}`;
  if (compact) {
    return `<div class="${cls} pcard--compact" data-player="${esc(player.id)}" style="--pc:${esc(player.color)}">
      <span class="ptoken">${initial(player.name)}</span>
      <span class="pcopy"><strong>${esc(player.name)}</strong><small>${fmt(player.cash)}</small></span>${status}</div>`;
  }
  return `<div class="${cls}" data-player="${esc(player.id)}" style="--pc:${esc(player.color)}">
    <span class="ptoken">${initial(player.name)}</span>
    <div class="pmain">
      <div class="pname"><strong>${esc(player.name)}</strong>${tags ? `<em>${tags}</em>` : ''}${status}</div>
      <div class="pmoney"><strong class="pcash">${fmt(player.cash)}</strong><span>fortune <b>${fmt(net)}</b></span></div>
      ${fortuneBar(game, player)}
      <div class="pgroups">${groupBars(game, player.id)}</div>
    </div>
  </div>`;
}

function renderPlayers(game) {
  const panel = $id('players-panel');
  const strip = $id('players-strip');
  if (panel) { panel.innerHTML = game.players.map((p, i) => playerCard(game, p, i, false)).join(''); animateBars(panel); }
  if (strip) strip.innerHTML = game.players.map((p, i) => playerCard(game, p, i, true)).join('');
}

// La carte visible du joueur (panneau desktop ou bandeau mobile).
function visibleCard(pid) {
  const cards = [...document.querySelectorAll(`.pcard[data-player="${CSS.escape(pid)}"]`)];
  return cards.find(c => c.offsetParent !== null) || cards[0] || null;
}

// ================================================================ mes proprietes
function renderAssets(game) {
  const box = $id('my-assets');
  if (!box) return;
  const mine = ownedBy(game, S.playerId);
  if (!mine.length) { box.innerHTML = '<p class="muted small">Aucune propriété. Tombe sur une case libre pour acheter.</p>'; return; }
  const byGroup = {};
  mine.forEach(pos => { const g = BOARD[pos].group; (byGroup[g] = byGroup[g] || []).push(pos); });
  box.innerHTML = Object.entries(byGroup).map(([g, list]) => {
    const isCity = g !== 'Public';
    const prog = isCity ? groupProgress(game, S.playerId, g) : null;
    const full = isCity && prog.owned === prog.total;
    return `<div class="asset-group${full ? ' full' : ''}" style="--g:${GROUP_COLORS[g]}">
      <div class="asset-head"><i></i><span>${esc(GROUP_LABELS[g])}</span><small>${isCity ? `${prog.owned}/${prog.total}${full ? ' · complet' : ''}` : `${list.length} public${list.length > 1 ? 's' : ''}`}</small></div>
      ${list.map(pos => {
        const b = canBuild(game, S.playerId, pos);
        const s = canSell(game, S.playerId, pos);
        const lvl = levelOf(game, pos);
        return `<div class="asset-row">
          <button class="asset-name" data-act="square" data-arg="${pos}">${esc(BOARD[pos].name)}<span class="houses">${'<i></i>'.repeat(lvl)}</span></button>
          <span class="asset-rent">${rentFor(game, pos)} $</span>
          ${BOARD[pos].type === 'property' ? `<button class="btn btn-tiny btn-build" data-act="build" data-arg="${pos}" ${b.ok ? '' : 'disabled'} title="${esc(b.ok ? `Construire pour ${b.cost} $` : b.reason)}">${lvl < MAX_BUILDINGS ? `Bâtir ${buildCost(pos)}` : 'Max'}</button>` : ''}
          <button class="btn btn-tiny btn-sell" data-act="sell" data-arg="${pos}" ${s.ok ? '' : 'disabled'} title="${esc(s.ok ? `Vendre ${s.value} $` : s.reason)}">Vendre ${sellValue(game, pos)}</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('') + '<p class="muted tiny">On bâtit en début de tour, groupe complet (×2 le loyer). On revend à 80 %.</p>';
}

// ================================================================ HUD
function renderHud(game) {
  const obj = $id('ref-objective');
  const max = roundsOf(game);
  if (obj) {
    obj.innerHTML = game.phase === 'finished'
      ? `Partie terminée · <strong>${esc((playerById(game, game.winnerId) || {}).name || '—')}</strong>`
      : `Objectif <strong>${fmt(targetOf(game))}</strong> · Manche <strong>${game.round || 1}${max ? `/${max}` : ''}</strong>`;
  }
  const code = $id('hud-code'); if (code) code.textContent = game.code;
  const cur = currentPlayer(game);
  const who = $id('turn-player');
  if (who) {
    who.innerHTML = game.phase === 'playing' && cur
      ? `<i style="--pc:${esc(cur.color)}"></i>${cur.id === S.playerId ? 'À toi de jouer' : `Tour ${de(esc(cur.name))}`}`
      : game.phase === 'finished' ? 'Terminée' : 'Salon';
  }
  clearInterval(countdown);
  const timer = $id('turn-timer');
  const tick = () => {
    if (!timer) return;
    const left = game.phase === 'playing' && game.turnDeadline ? Math.max(0, Math.round((game.turnDeadline - Date.now()) / 1000)) : 0;
    timer.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    timer.classList.toggle('urgent', left > 0 && left <= 6);
    const sw = $id('swap-countdown');
    if (sw && game.swap) sw.textContent = Math.max(0, Math.round((game.swap.endAt - Date.now()) / 1000)) + ' s';
    const au = $id('auction-countdown');
    if (au && game.auction) au.textContent = Math.max(0, Math.round((game.auction.endAt - Date.now()) / 1000)) + ' s';
  };
  tick();
  countdown = setInterval(tick, 1000);
}

// ================================================================ panneau d'action
const chip = (pos, act, extra = '') => {
  const sq = BOARD[pos];
  return `<button class="chip-prop" data-act="${act}" data-arg="${pos}" style="--sq:${getSquareColor(sq)}"${extra}><i></i>${esc(sq.name)}<small>$${sq.price}</small></button>`;
};
const box = (title, text, buttons = '', cls = '') => `<div class="action-box ${cls}"><div class="action-title">${title}</div>${text ? `<div class="action-text">${text}</div>` : ''}${buttons ? `<div class="action-buttons">${buttons}</div>` : ''}</div>`;
const btn = (label, act, cls = 'btn-primary', arg, disabled, title) =>
  `<button class="btn ${cls}" data-act="${act}"${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''}${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;

function actionHTML(game) {
  if (game.phase === 'lobby') return box('Salon', `Attends que l’hôte lance la partie. Code : <strong>${esc(game.code)}</strong>.`);
  if (game.phase === 'finished') {
    const w = playerById(game, game.winnerId);
    return box('Partie terminée', `<strong>${esc(w ? w.name : 'Personne')}</strong> gagne avec <strong>${fmt(w ? netWorth(game, w) : 0)}</strong>.`,
      (S.isHost ? btn('Nouvelle partie', 'restart') : '') + btn('Quitter', 'leave', 'btn-secondary'));
  }
  const me = playerById(game, S.playerId);
  const cur = currentPlayer(game);
  const myTurn = isMyTurn(game, S.playerId);
  const trade = game.trade;
  if (trade && trade.status === 'pending' && [trade.fromId, trade.toId].includes(S.playerId)) {
    const from = playerById(game, trade.fromId) || { name:'?' }, to = playerById(game, trade.toId) || { name:'?' };
    const prop = p => (p === null || p === undefined ? '' : ` + ${esc(BOARD[p].name)}`);
    const text = `<strong>${esc(from.name)}</strong> offre ${fmt(trade.offerCash)}${prop(trade.offerProperty)} contre ${fmt(trade.requestCash)}${prop(trade.requestProperty)}.`;
    return S.playerId === trade.toId ? box('Échange proposé', text, btn('Accepter', 'trade-accept') + btn('Refuser', 'trade-decline', 'btn-secondary'))
      : box('Échange envoyé', `${text} En attente ${de(esc(to.name))}.`);
  }
  if (game.auction && game.auction.status === 'open') {
    const a = game.auction;
    const bidder = playerById(game, a.highestBidder);
    return box(`Enchère · ${esc(BOARD[a.position].name)}`, `Meilleure offre : <strong>${fmt(a.highestBid || 0)}</strong>${bidder ? ` par ${esc(bidder.name)}` : ''}. Minimum : ${fmt(a.nextBid)}. <span class="countdown" id="auction-countdown"></span>`,
      btn('Faire une offre', 'bid-open'));
  }
  if (game.swap && game.swap.status === 'open') return swapHTML(game, me);
  const a = game.currentAction;
  if (a) {
    if (a.type === 'buy' && a.playerId === S.playerId) {
      const sq = BOARD[a.position];
      const short = me.cash < sq.price;
      const after = { ...game, ownership: { ...(game.ownership || {}), [a.position]: S.playerId } };
      const completes = sq.type === 'property' && ownsFullGroup(after, S.playerId, sq.group);
      return box(`${esc(sq.name)} est libre`, `Prix <strong>${fmt(sq.price)}</strong> · loyer ${isPublic(sq) ? `${PUBLIC_BASE_RENT} $ × tes propriétés publiques` : `${baseRent(a.position)} $`}.${completes ? ' <strong class="good">Complète ton groupe !</strong>' : ''}${short ? ' <span class="bad">Il te manque ' + fmt(sq.price - me.cash) + ' : vends une propriété ou mets aux enchères.</span>' : ''}`,
        btn(`Acheter ${fmt(sq.price)}`, 'buy', 'btn-primary', undefined, short) + btn('Mettre aux enchères', 'auction', 'btn-secondary'), 'action-box--buy');
    }
    if (a.type === 'swapPick' && a.playerId === S.playerId) {
      const list = ownedBy(game, S.playerId).filter(p => tradeable(game, p));
      return box('Auction : mets une propriété en jeu', `Les autres te proposeront une des leurs. Échange conclu : ${fmt(SWAP_BONUS)} chacun.`,
        `<div class="chips">${list.map(p => chip(p, 'swap-pick')).join('')}</div>` + btn('Ne rien mettre en jeu', 'swap-skip', 'btn-ghost'));
    }
    if (a.type === 'steal' && a.playerId === S.playerId) {
      const list = raidTargets(game, me);
      return box('Rafle !', 'Choisis une propriété adverse : tu la rachètes à son prix, payé à son propriétaire.',
        `<div class="chips">${list.map(t => chip(t.pos, 'steal')).join('')}</div>` + btn('Renoncer', 'steal-skip', 'btn-ghost'));
    }
    if (a.type === 'seize' && a.chooserId === S.playerId) {
      const victim = playerById(game, a.victimId);
      const list = ownedBy(game, a.victimId).filter(p => tradeable(game, p));
      return box('Prêt toxique', `${esc(victim.name)} a encaissé 700 $. Choisis la propriété que tu lui prends.`, `<div class="chips">${list.map(p => chip(p, 'seize')).join('')}</div>`);
    }
    if (a.type === 'seize') return box('Prêt toxique', `${esc((playerById(game, a.chooserId) || {}).name)} choisit une propriété ${de(esc((playerById(game, a.victimId) || {}).name))}…`);
    if (a.type === 'dilemma') return box('Dilemme', `${esc(cur.name)} doit choisir son malheur.`);
    if (a.type === 'wheel') return box('Roue de la chance', 'La roue tourne…');
    if (a.type === 'buy') return box(`Tour ${de(esc(cur.name))}`, `${esc(cur.name)} hésite devant ${esc(BOARD[a.position].name)}.`);
    if (a.type === 'swapPick') return box(`Tour ${de(esc(cur.name))}`, `${esc(cur.name)} choisit quoi mettre en jeu à l’Auction.`);
    if (a.type === 'steal') return box('Rafle', `${esc(cur.name)} choisit sa proie…`);
  }
  if (myTurn && me.inJail) {
    return box('En prison', `${plural(me.jailTurns || 0, 'tour')} restant${(me.jailTurns || 0) > 1 ? 's' : ''}. Paie la caution pour sortir et jouer tout de suite.`,
      btn(`Payer ${fmt(BAIL)}`, 'bail', 'btn-primary', undefined, me.cash < BAIL) + btn('Attendre', 'serve', 'btn-secondary'), 'action-box--jail');
  }
  if (myTurn) {
    const buildable = ownedBy(game, S.playerId).filter(p => canBuild(game, S.playerId, p).ok);
    const debt = me.cash < 0 ? `<span class="bad">À découvert : faillite sous ${fmt(-500)}.</span> ` : '';
    const again = game.extraRoll === S.playerId ? '<strong class="good">Relance !</strong> ' : '';
    const hint = buildable.length && game.turnRolled !== S.playerId ? ` Tu peux construire sur ${buildable.map(p => esc(BOARD[p].name)).join(', ')} avant de lancer.` : '';
    return box('C’est ton tour', `${again}${debt}Lance le dé.${hint}`,
      btn('<span class="btn-die"></span>Lancer le dé', 'roll', 'btn-primary btn-roll') + btn('Échange', 'trade-open', 'btn-secondary'), 'action-box--turn');
  }
  return box(`Tour ${de(esc(cur ? cur.name : '…'))}`, me && me.bankrupt ? 'Tu es en faillite : tu regardes les autres finir.' : `Attends ${que(esc(cur ? cur.name : '…'))} joue.`);
}

function swapHTML(game, me) {
  const swap = game.swap;
  const owner = playerById(game, swap.ownerId) || { name:'?' };
  const offers = swap.offers || {};
  const head = `${chip(swap.offered, 'square', ' data-static')} <span class="countdown" id="swap-countdown"></span>`;
  if (swap.ownerId === S.playerId) {
    const list = Object.entries(offers).filter(([, pos]) => pos >= 0);
    const rows = list.length ? list.map(([pid, pos]) => `<div class="offer-row">${chip(pos, 'square', ' data-static')}<span>${de(esc((playerById(game, pid) || {}).name))}</span>${btn('Accepter', 'swap-accept', 'btn-primary btn-small', pid)}</div>`).join('')
      : '<p class="muted small">En attente d’offres…</p>';
    return box('Auction : tes offres', head + rows, btn('Tout refuser', 'swap-cancel', 'btn-ghost'));
  }
  const mine = ownedBy(game, S.playerId).filter(p => tradeable(game, p));
  const myOffer = offers[S.playerId];
  const choice = myOffer === undefined ? '' : myOffer === -1 ? ' Tu passes.' : ` Ta proposition : <strong>${esc(BOARD[myOffer].name)}</strong>.`;
  if (me && me.bankrupt) return box(`Auction ${de(esc(owner.name))}`, head);
  return box(`Auction ${de(esc(owner.name))}`, `${head}<br>Propose une de tes propriétés en échange (+${fmt(SWAP_BONUS)} chacun si accepté).${choice}`,
    `<div class="chips">${mine.map(p => chip(p, 'swap-offer')).join('')}</div>` + btn('Passer', 'swap-offer', 'btn-ghost', -1));
}

function renderAction(game) {
  const panel = $id('action-panel');
  if (!panel) return;
  const html = actionHTML(game);
  // On ne remplace que si le contenu change : les boutons gardent leur etat :active.
  if (panel.dataset.html !== html) { panel.innerHTML = html; panel.dataset.html = html; }
}

// ================================================================ centre, de, journal
function renderCenter(game) {
  const events = Object.values(game.history || {}).sort((a, b) => a.ts - b.ts);
  const latest = events[events.length - 1];
  const msg = $id('event-message');
  if (msg) {
    const text = latest ? latest.text : game.phase === 'lobby' ? 'En attente du lancement…' : 'La partie va commencer…';
    if (msg.textContent !== text) { msg.textContent = text; pulse(msg, 'fresh', 500); }
  }
  const lr = game.lastRoll;
  const total = $id('dice-total');
  const result = $id('roll-result');
  if (lr && lr.id !== S.lastRollSeen) {
    const firstSight = seen.first;
    S.lastRollSeen = lr.id;
    if (firstSight) setDieValue(lr.v);
    else { seen.remoteRollUntil = Date.now() + DIE_MS; animateDiceRoll(lr.v).then(() => renderDiceMeta(game)); }
  }
  renderDiceMeta(game);
}

function renderDiceMeta(game) {
  const total = $id('dice-total'), result = $id('roll-result');
  const die = $id('die');
  const lr = game.lastRoll;
  if (!total || !result) return;
  if (die && die.classList.contains('rolling')) { total.textContent = '…'; return; }
  if (lr) {
    const who = playerById(game, lr.by);
    total.textContent = String(lr.v);
    result.textContent = `${who ? who.name : '?'} a fait ${lr.v}${lr.v === 6 ? ' : relance !' : ''}`;
  } else { total.textContent = '—'; result.textContent = 'Prêt à lancer.'; }
}

function renderHistory(game) {
  const list = $id('history-list');
  if (!list) return;
  const events = Object.entries(game.history || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => a.ts - b.ts);
  const last = events[events.length - 1];
  if (last && last.k === seen.histKey) return;
  const fresh = !seen.first && last && last.k !== seen.histKey;
  seen.histKey = last ? last.k : null;
  // Case EVENT : son effet est inchange (gain ou perte d'argent), il devient visible.
  if (fresh && last.meta && last.meta.t === 'event') showEventCard(game, last);
  list.innerHTML = events.slice(-40).reverse().map(e => `<div class="history-item${e.meta && e.meta.t ? ' t-' + esc(e.meta.t) : ''}">${esc(e.text)}</div>`).join('');
}

// ================================================================ chat + presentateur
function renderChat(game) {
  const list = $id('chat-list');
  const messages = Object.entries(game.chat || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => a.ts - b.ts);
  if (list) {
    watchChat(list);
    list.innerHTML = messages.slice(-50).map(m => {
      if (m.kind === 'host') return `<div class="chat-item host lvl-${Number(m.lvl) || 0}" data-key="${esc(m.k)}"><strong><span class="chat-av">${HOST_AVATAR}</span>${HOST_NAME}${sourceBadge(m)}</strong><span>${esc(hostText(m))}</span></div>`;
      const p = playerById(game, m.pid) || game.players.find(x => x.name === m.author);
      const me = m.pid === S.playerId;
      return `<div class="chat-item${me ? ' me' : ''}" style="--pc:${esc(p ? p.color : '#888')}">${me ? '' : `<strong>${esc(m.author)}</strong>`}<span>${esc(m.text)}</span></div>`;
    }).join('') || '<p class="muted small">Aucun message. Provoque quelqu’un, le présentateur prend des notes.</p>';
    if (chatStick || seen.first) list.scrollTop = list.scrollHeight;
  }
  const last = messages[messages.length - 1];
  const lastEl = $id('ref-chat-last'), countEl = $id('ref-chat-count');
  if (lastEl) lastEl.textContent = last ? `${last.kind === 'host' ? '🎤 ' + HOST_NAME : last.author} : ${last.text}` : 'Aucun message';
  if (countEl) countEl.textContent = String(messages.length);
  const drawer = $id('drawer');
  const dot = $id('chat-dot');
  if (dot && messages.length > seen.chatCount && !seen.first && !(drawer && drawer.classList.contains('open'))) dot.hidden = false;
  seen.chatCount = messages.length;
  // Derniere replique du presentateur : carte + bulle sur le plateau.
  const host = [...messages].reverse().find(m => m.kind === 'host');
  const line = $id('host-line'), status = $id('host-status');
  if (host) {
    if (line) line.textContent = 'Commente les gros coups. Interpelle-le avec @host.';
    if (status) { status.textContent = sourceLabel(host); status.classList.toggle('ai', sourceOf(host) !== 'local'); status.dataset.provider = sourceOf(host); }
    const sig = host.k + '|' + host.text;
    if (sig !== seen.hostKey) {
      const isNew = seen.hostKey !== null && !seen.first;
      seen.hostKey = sig;
      if (isNew) showBubble(host);
    }
  } else if (line) line.textContent = 'Le présentateur s’échauffe. Il commente les gros coups et répond quand on l’interpelle (@host).';
}

// Le modele imite parfois les pseudos du chat : pas de « @Alice » en tete de replique.
const hostText = m => String(m.text || '').replace(/^(@\S+[\s,:]*)+/, '');

// Qui a parle : LOCAL, GEMINI ou OPENROUTER. Rien d'autre ne peut s'afficher.
const PROVIDERS = { gemini:'GEMINI', openrouter:'OPENROUTER' };
const sourceOf = m => (m.src === 'ai' && PROVIDERS[m.provider] ? m.provider : 'local');
function sourceLabel(m) {
  return sourceOf(m) === 'local' ? 'LOCAL' : PROVIDERS[sourceOf(m)];
}
function sourceBadge(m) {
  const p = sourceOf(m);
  return ` <span class="src-badge src-${p}" title="${m.src === 'ai' && m.model ? esc(m.model) : 'Réplique locale, sans IA'}">${sourceLabel(m)}</span>`;
}

// Le chat reste colle en bas : a l'ouverture du tiroir (liste masquee puis affichee),
// au redimensionnement, et a chaque message, sauf si le joueur relit l'historique.
function watchChat(list) {
  if (list.dataset.watched) return;
  list.dataset.watched = '1';
  list.addEventListener('scroll', () => {
    if (list.clientHeight) chatStick = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => { if (chatStick) list.scrollTop = list.scrollHeight; }).observe(list);
}

function showBubble(host) {
  const bubble = $id('host-bubble');
  if (!bubble) return;
  bubble.innerHTML = `<span class="hb-av">${HOST_AVATAR}</span><span class="hb-text">${esc(hostText(host))}${sourceBadge(host)}</span>`;
  bubble.hidden = false;
  bubble.classList.toggle('loud', (Number(host.lvl) || 0) >= 3);
  pulse(bubble, 'pop', 600);
  const card = $id('host-card'); pulse(card, 'pop', 600);
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, Math.min(11000, 4500 + host.text.length * 40));
}

// ================================================================ Chance : overlay partage
function closeOverlay() {
  const ov = $id('stage-overlay');
  clearTimeout(overlayTimer);
  if (ov) { ov.hidden = true; ov.innerHTML = ''; ov.dataset.mode = ''; }
}

function renderOverlay(game) {
  const ov = $id('stage-overlay');
  const ev = game.event;
  if (!ov) return;
  if (!ev || game.phase !== 'playing') { if (ov.dataset.mode && !['done-card', 'done-dilemma', 'done-wheel', 'event'].includes(ov.dataset.mode)) closeOverlay(); return; }
  const player = playerById(game, ev.playerId) || { name:'?' };
  const mine = ev.playerId === S.playerId;
  const sig = `${ev.id}:${ev.status}`;
  if (seen.overlay === sig) {
    if (ev.kind === 'dilemma' && ev.status === 'choose') refreshDilemmaButtons(game, ev);
    return;
  }
  const firstSight = seen.first || (seen.overlay && !seen.overlay.startsWith(ev.id) && ev.status === 'done' && Date.now() - ev.ts > 15000);
  seen.overlay = sig;
  if (firstSight && ev.status === 'done') return;   // evenement ancien : pas de rejeu au rechargement
  clearTimeout(overlayTimer);
  ov.hidden = false;
  if (ev.kind === 'card') {
    const card = CARDS.find(c => c.id === ev.key) || { title:'Chance', text:'' };
    ov.dataset.mode = 'done-card';
    ov.innerHTML = `<div class="chance-card" data-act="overlay-close"><div class="cc-kicker">CHANCE · ${esc(player.name)}</div><div class="cc-mark">?</div><h3>${esc(card.title)}</h3><p>${esc(card.text)}</p><small>Toucher pour fermer</small></div>`;
    overlayTimer = setTimeout(closeOverlay, 4200);
    return;
  }
  if (ev.kind === 'dilemma') {
    const d = DILEMMAS.find(x => x.id === ev.key);
    const opts = ev.status === 'choose' ? dilemmaOptions(game, ev.playerId, ev.key) : (ov.dataset.opts ? JSON.parse(ov.dataset.opts) : dilemmaOptions(game, ev.playerId, ev.key));
    ov.dataset.opts = JSON.stringify(opts);
    const chosen = ev.choice;
    ov.dataset.mode = ev.status === 'choose' ? 'dilemma' : 'done-dilemma';
    const lastLine = ev.status === 'done' ? (Object.values(game.history || {}).sort((a, b) => a.ts - b.ts).pop() || {}).text : '';
    ov.innerHTML = `<div class="dilemma${ev.status === 'done' ? ' resolved' : ''}">
      <div class="cc-kicker">DILEMME · ${esc(player.name)}</div>
      <h3>${esc(d ? d.title : 'Dilemme')}</h3><p class="dilemma-prompt">${esc(d ? d.prompt : '')}</p>
      <div class="dilemma-options">${opts.map(o => `<button class="dopt${chosen === o.id ? ' chosen' : ''}${chosen && chosen !== o.id ? ' faded' : ''}" data-act="dilemma" data-arg="${o.id}" ${mine && ev.status === 'choose' ? '' : 'disabled'}><b>${o.id}</b><span>${esc(o.label)}</span></button>`).join('')}</div>
      <p class="dilemma-foot">${ev.status === 'choose' ? (mine ? 'CHOISIS TON MALHEUR.' : `${esc(player.name)} hésite…`) : esc(lastLine || '')}</p></div>`;
    if (ev.status === 'done') overlayTimer = setTimeout(closeOverlay, 4200);
    return;
  }
  if (ev.kind === 'wheel') {
    const geo = wheelGeometry();
    const seg = geo[ev.seg] || geo.find(s => s.id === ev.key) || geo[0];
    if (ev.status === 'spin' || !ov.querySelector('.wheel-svg')) {
      ov.dataset.mode = 'wheel';
      ov.innerHTML = `<div class="wheel-box"><div class="cc-kicker">ROUE DE LA CHANCE · ${esc(player.name)}</div>${wheelSVG(geo)}<div class="wheel-result" id="wheel-result">…</div></div>`;
      const svg = ov.querySelector('.wheel-svg');
      const elapsed = Date.now() - (ev.spinAt || Date.now());
      const instant = ev.status === 'done' || elapsed > WHEEL_MS + 2000;
      spinWheel(svg, seg, ev.id, { instant }).then(() => showWheelResult(seg));
    }
    if (ev.status === 'done') {
      // Le resultat s'affiche a la fin de l'animation (promesse de spinWheel), pas avant.
      ov.dataset.mode = 'done-wheel';
      overlayTimer = setTimeout(closeOverlay, 4200);
    }
  }
}

function showWheelResult(seg) {
  const res = $id('wheel-result');
  if (!res) return;
  const svg = res.parentElement.querySelector('.wheel-svg');
  if (svg) svg.dataset.spun = '1';
  res.innerHTML = `<b style="--seg:${seg.color};color:${readableInk(seg.color)}">${esc(seg.label)}</b> <span>${esc(seg.sub)}</span>`;
  pulse(res, 'pop', 600);
  const hit = res.parentElement.querySelector(`.wseg[data-id="${seg.id}"]`);
  if (hit) hit.classList.add('hit');
}

function refreshDilemmaButtons(game, ev) {
  const mine = ev.playerId === S.playerId;
  document.querySelectorAll('#stage-overlay .dopt').forEach(b => { b.disabled = !mine; });
}

function showEventCard(game, entry) {
  const ov = $id('stage-overlay');
  if (!ov || (ov.dataset.mode && !ov.hidden)) return;       // une Chance en cours garde la scene
  const who = playerById(game, entry.meta.p) || { name:'?' };
  const amt = entry.meta.amt || 0;
  clearTimeout(overlayTimer);
  ov.hidden = false;
  ov.dataset.mode = 'event';
  ov.innerHTML = `<div class="event-card ${amt >= 0 ? 'gain' : 'loss'}" data-act="overlay-close"><div class="cc-kicker">ÉVÈNEMENT · ${esc(who.name)}</div>
    <div class="ev-amount">${signed(amt)}</div><p>${esc(entry.text)}</p><small>Toucher pour fermer</small></div>`;
  overlayTimer = setTimeout(closeOverlay, 3200);
}

export function overlayClose() { closeOverlay(); }

// ================================================================ modales
function renderAuctionModal(game) {
  const modal = $id('modal-auction');
  const a = game.auction;
  if (!a || a.status !== 'open') { modal.classList.remove('active'); return; }
  const key = `${a.position}@${a.endAt}`;
  if (seen.auctionDismissed === key) return;
  modal.classList.add('active');
  const bidder = playerById(game, a.highestBidder);
  $id('auction-details').innerHTML = `<strong>${esc(BOARD[a.position].name)}</strong> (prix ${fmt(BOARD[a.position].price)}). Offre actuelle : <strong>${fmt(a.highestBid || 0)}</strong>${bidder ? ` par ${esc(bidder.name)}` : ''}. Minimum : ${fmt(a.nextBid)}.`;
  const input = $id('auction-bid');
  if (document.activeElement !== input) input.value = a.nextBid;
  const status = $id('auction-status');
  if (status) status.textContent = 'Temps restant';
}
export function dismissAuction() {
  const a = S.game && S.game.auction;
  if (a) seen.auctionDismissed = `${a.position}@${a.endAt}`;
  $id('modal-auction').classList.remove('active');
}
export function openAuctionModal() { seen.auctionDismissed = null; if (S.game) renderAuctionModal(S.game); }

export function openTradeModal() {
  const game = S.game;
  const recipient = $id('trade-recipient'), offer = $id('trade-offer-property'), request = $id('trade-request-property');
  recipient.innerHTML = game.players.filter(p => p.id !== S.playerId && !p.bankrupt).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  offer.innerHTML = '<option value="">Aucune</option>' + ownedBy(game, S.playerId).filter(p => tradeable(game, p)).map(p => `<option value="${p}">${esc(BOARD[p].name)}</option>`).join('');
  request.innerHTML = '<option value="">Aucune</option>' + game.players.filter(p => p.id !== S.playerId).flatMap(p => ownedBy(game, p.id).filter(x => tradeable(game, x)).map(pos => `<option value="${pos}">${esc(p.name)} · ${esc(BOARD[pos].name)}</option>`)).join('');
  $id('trade-error').textContent = '';
  $id('modal-trade').classList.add('active');
}
export function closeModal(id) { $id(id).classList.remove('active'); }

// Fiche d'une case : loyers, groupe, construire / vendre (regle 5 : on selectionne sa ville).
export function openSquareSheet(index) {
  const game = S.game;
  index = Number(index);
  const sq = BOARD[index];
  const sheet = $id('square-sheet');
  if (!sheet || !game) return;
  let html = `<div class="sheet-band" style="--sq:${getSquareColor(sq)};--sq-ink:${readableInk(getSquareColor(sq))}"><span>${esc(squareLabelText(sq))}</span><h3>${esc(sq.name)}</h3></div>`;
  if (isOwnable(sq)) {
    const ownerId = ownerOf(game, index);
    const owner = playerById(game, ownerId);
    const lvl = levelOf(game, index);
    html += `<div class="sheet-row"><span>Prix</span><strong>${fmt(sq.price)}</strong></div>
      <div class="sheet-row"><span>Propriétaire</span><strong>${owner ? `<i class="dot" style="--pc:${esc(owner.color)}"></i>${esc(owner.name)}` : 'Banque'}</strong></div>`;
    if (sq.type === 'property') {
      const members = GROUPS[sq.group];
      const full = ownerId && ownsFullGroup(game, ownerId, sq.group);
      const rows = [['Ville nue', baseRent(index), !full && !lvl], [`Groupe complet (×${RENT_FULL_GROUP})`, baseRent(index) * RENT_FULL_GROUP, full && !lvl]]
        .concat(RENT_BUILDINGS.map((m, i) => [`${plural(i + 1, 'bâtiment')} (×${m})`, baseRent(index) * m, lvl === i + 1]));
      html += `<div class="sheet-group" style="--g:${GROUP_COLORS[sq.group]}"><span>Groupe ${esc(GROUP_LABELS[sq.group])}</span>${members.map(m => {
        const o = playerById(game, ownerOf(game, m));
        return `<em class="${m === index ? 'self' : ''}">${esc(BOARD[m].name)} · ${o ? esc(o.name) : 'libre'}</em>`;
      }).join('')}</div>
      <table class="rent-table">${rows.map(([l, v, on]) => `<tr class="${on ? 'on' : ''}"><td>${l}</td><td>${fmt(v)}</td></tr>`).join('')}</table>
      <div class="sheet-row"><span>Bâtiment</span><strong>${fmt(buildCost(index))} · max ${MAX_BUILDINGS}</strong></div>
      <div class="sheet-blds">${[1, 2, 3].map(i => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</div>`;
    } else {
      html += `<p class="muted small">Loyer : ${PUBLIC_BASE_RENT} $ × nombre de propriétés publiques du propriétaire (Railway, Airport, Boat).</p>`;
    }
    if (ownerId === S.playerId && game.phase === 'playing') {
      const b = canBuild(game, S.playerId, index), s = canSell(game, S.playerId, index);
      html += `<div class="btn-row">${sq.type === 'property' ? btn(`Construire · ${fmt(buildCost(index))}`, 'build', 'btn-primary btn-block', index, !b.ok) + (b.ok ? '' : `<p class="sheet-why">${esc(b.reason)}</p>`) : ''}
        ${btn(`Vendre à la banque · ${fmt(sellValue(game, index))}`, 'sell', 'btn-danger btn-block', index, !s.ok)}${s.ok ? '' : `<p class="sheet-why">${esc(s.reason)}</p>`}</div>`;
    }
  } else {
    const info = { chance:'Carte, dilemme ou roue de la chance : le hasard décide, parfois tu choisis ton malheur.',
      jail:'Tomber ici : 3 tours en prison, ou 150 $ de caution pour sortir et jouer tout de suite.',
      auction:'Mets une propriété en jeu : les autres proposent une des leurs. Échange conclu : +100 $ chacun.',
      start:'Passer ici rapporte 200 $.', event:'Un évènement d’argent, bon ou mauvais.' }[sq.type] || '';
    html += `<p class="muted">${info}</p>`;
  }
  sheet.innerHTML = html;
  sheet.dataset.index = index;
  $id('modal-square').classList.add('active');
}

// ================================================================ victoire
function renderVictory(game) {
  const overlay = $id('victory');
  if (!overlay) return;
  if (game.phase !== 'finished') { overlay.classList.remove('active'); seen.victory = null; return; }
  const winner = playerById(game, game.winnerId);
  $id('victory-name').textContent = winner ? winner.name : 'Personne';
  const chipEl = $id('victory-chip');
  chipEl.style.setProperty('--pc', (winner && winner.color) || '#8AD21F');
  chipEl.textContent = (winner ? winner.name : '?').trim().charAt(0).toUpperCase();
  $id('victory-restart').classList.toggle('hidden', !S.isHost);
  const worth = winner ? netWorth(game, winner) : 0;
  const ranks = ranking(game).concat(game.players.filter(p => p.bankrupt));
  $id('victory-board').innerHTML = ranks.map((p, i) => `<li class="${p.id === game.winnerId ? 'win' : ''}${p.bankrupt ? ' out' : ''}"><b>${i + 1}</b><i style="--pc:${esc(p.color)}"></i><span>${esc(p.name)}</span><em>${p.bankrupt ? 'faillite' : fmt(netWorth(game, p))}</em></li>`).join('');
  if (seen.victory === game.code) return;
  seen.victory = game.code;
  overlay.classList.add('active');
  const out = $id('victory-worth');
  const start = performance.now();
  const step = t => { const k = Math.min(1, (t - start) / 1400); out.textContent = fmt(worth * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  rainCoins(overlay.querySelector('.victory-coins'));
}

// ================================================================ salon
export function renderLobby(game) {
  $id('lobby-code').textContent = game.code;
  $id('lobby-players').innerHTML = game.players.map(p => `<div class="lobby-player${p.id === S.playerId ? ' me' : ''}" style="--pc:${esc(p.color)}"><span class="ptoken">${initial(p.name)}</span><strong>${esc(p.name)}</strong><em>${p.id === game.hostId ? 'Hôte' : ''}</em></div>`).join('')
    + Array.from({ length: Math.max(0, game.maxPlayers - game.players.length) }, () => '<div class="lobby-player empty"><span class="ptoken">?</span><strong>Place libre</strong></div>').join('');
  const max = roundsOf(game);
  $id('lobby-settings').innerHTML = `<span>Objectif <b>${fmt(targetOf(game))}</b></span><span>${max ? `<b>${max}</b> manches` : '<b>Sans limite</b>'}</span><span>Tour <b>${game.turnTimer} s</b></span><span><b>${game.players.length}/${game.maxPlayers}</b> joueurs</span>`;
  const startBtn = $id('start-game-btn');
  startBtn.disabled = !(S.isHost && game.players.length >= 2);
  startBtn.classList.toggle('hidden', !S.isHost);
  $id('lobby-wait').classList.toggle('hidden', S.isHost);
}

// ================================================================ feedback (diffs)
function feedback(game) {
  const losers = [], gainers = [];
  game.players.forEach(p => {
    const before = seen.cash.get(p.id);
    seen.cash.set(p.id, p.cash);
    if (before === undefined || before === p.cash || seen.first) return;
    const d = p.cash - before;
    const card = visibleCard(p.id);
    floatDelta(card, d);
    if (card) rollNumber(card.querySelector('.pcash, .pcopy small'), before, p.cash, fmt);
    if (card) pulse(card, d > 0 ? 'gain' : 'loss', 700);
    (d < 0 ? losers : gainers).push({ p, d, card });
  });
  // Un loyer se voit passer : pieces du payeur vers le receveur.
  losers.forEach(l => { const g = gainers.find(x => x.d === -l.d) || gainers[0]; if (g) coinBurst(l.card, g.card, Math.min(9, 3 + Math.round(-l.d / 120))); });
  const owned = game.ownership || {};
  if (seen.owned && !seen.first) {
    Object.keys(owned).forEach(k => {
      if (seen.owned[k] === owned[k]) return;
      const node = document.querySelector(`.square[data-index="${k}"]`);
      pulse(node, 'just-bought', 1500);
      const card = visibleCard(owned[k]);
      if (card && !losers.length) coinBurst(card, node, 4);
    });
  }
  seen.owned = { ...owned };
  const built = game.buildings || {};
  if (seen.built && !seen.first) {
    Object.entries(built).forEach(([k, lvl]) => {
      if ((seen.built[k] || 0) < lvl) buildPop(document.querySelector(`.square[data-index="${k}"]`), lvl);
    });
  }
  seen.built = { ...built };
}

// ================================================================ point d'entree
export function renderState(game) {
  if (game.phase === 'lobby') {
    renderLobby(game);
    if (!$id('s-lobby').classList.contains('active')) show('s-lobby');
  } else if (!$id('s-game').classList.contains('active')) show('s-game');
  document.body.dataset.phase = game.phase;
  renderHud(game);
  renderPlayers(game);
  renderBoard(game);
  renderAssets(game);
  renderCenter(game);
  renderAction(game);
  renderHistory(game);
  renderChat(game);
  renderAuctionModal(game);
  renderOverlay(game);
  feedback(game);
  const sheet = $id('square-sheet');
  if (sheet && $id('modal-square').classList.contains('active') && sheet.dataset.index !== undefined) openSquareSheet(sheet.dataset.index);
  const delay = seen.remoteRollUntil && seen.remoteRollUntil > Date.now() ? (seen.remoteRollUntil - Date.now()) / 1000 : 0;
  requestAnimationFrame(() => { syncPawns(game, { animate: !seen.first, delay }); renderVictory(game); });
  seen.first = false;
}

export function toggleDrawer(force) {
  const drawer = $id('drawer');
  if (!drawer) return;
  const open = force === undefined ? !drawer.classList.contains('open') : !!force;
  drawer.classList.toggle('open', open);
  document.body.classList.toggle('drawer-open', open);
  if (open) {
    const dot = $id('chat-dot'); if (dot) dot.hidden = true;
    const list = $id('chat-list');
    if (list) { chatStick = true; requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; }); }
  }
}
