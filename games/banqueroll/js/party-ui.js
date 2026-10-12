// Rendu des mecaniques de party : ecran de mode, configuration affichee, et les
// fenetres des mecaniques (ajoutees lot par lot). Ne modifie jamais l'etat de jeu.
//
// Grammaire commune a toutes les mecaniques : CAUSE (bandeau ou carte qui
// s'annonce) -> FEEDBACK (animation courte) -> RESOLUTION (resultat lisible,
// le meme chez tous) -> RETOUR AU JEU (la fenetre se ferme seule).

import { S, serverNow } from './net.js';
import { MECHANICS, PRESETS, PRESET_ORDER, gameConfig, activeMechanics, on, adultHost } from './config.js';
import { BOARD, GROUP_LABELS } from './board.js';
import { playerById, currentPlayer, roundsOf, targetOf, ranking, netWorth } from './rules.js';
import { REACTIONS, sendReaction, AUCTION_EXTEND_MS, submitEntry, hauntSquare, placeBet, betHold } from './party-actions.js';
import { WILL_MS, BET_KINDS, BET_STAKES, BET_WINDOW_MS, betKey, DEALS, DEAL_MS, trailSeries, recapTitles, biggestSwing, leadChanges } from './party.js';
import { recordGame } from './stats.js';
import { sfx, isMuted, setMuted } from './sfx.js';
import { HOST_AVATAR } from './render.js';
import { MINIGAMES, MEMORY_COLORS } from './minigames.js';
import { briefingCards, briefingActive, briefingPending } from './briefing.js';

const $id = id => document.getElementById(id);
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const fmt = n => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} $`;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = () => !document.hidden && !reduced();
// La fiche visible d'un joueur (panneau desktop ou bandeau mobile).
function cardOf(pid) {
  const cards = [...document.querySelectorAll(`.pcard[data-player="${CSS.escape(pid)}"]`)];
  return cards.find(c => c.offsetParent !== null) || null;
}
const centerOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const seenP = { first: true, reactions: new Set(), auction: null };

// ================================================================ ecran « Comment voulez-vous jouer ? »
export function initModeScreen() {
  const grid = $id('mode-grid');
  if (grid && !grid.childElementCount) {
    grid.innerHTML = PRESET_ORDER.map(id => {
      const p = PRESETS[id];
      const keys = p.keys || [];
      const chips = id === 'custom' ? '<span class="mode-chip">À la carte</span>'
        : keys.length ? MECHANICS.filter(m => keys.includes(m.key)).map(m => `<span class="mode-chip" title="${esc(m.label)}">${m.icon}</span>`).join('')
        : '<span class="mode-chip mode-chip--none">Aucune nouvelle mécanique</span>';
      return `<button class="mode-card mode-card--${id}" type="button" data-act="mode-pick" data-arg="${id}">
        ${id === 'classic' ? '<span class="mode-stamp">Recommandé</span>' : ''}
        <span class="mode-icon" aria-hidden="true">${p.icon}</span>
        <span class="mode-name">${esc(p.label)}</span>
        <span class="mode-tag">${esc(p.tagline)}</span>
        <span class="mode-chips">${chips}</span>
        ${id === 'custom' ? '' : `<span class="mode-count">${keys.length ? `${keys.length} mécanique${keys.length > 1 ? 's' : ''}` : 'Règles d’origine'}</span>`}
      </button>`;
    }).join('');
  }
  const toggles = $id('mode-toggles');
  if (toggles && !toggles.childElementCount) {
    const group = (fam, title) => `<fieldset class="mode-family"><legend>${title}</legend>${MECHANICS.filter(m => m.family === fam).map(m => `
      <label class="mode-toggle"><input type="checkbox" value="${m.key}"><span class="mode-toggle-icon" aria-hidden="true">${m.icon}</span>
        <span class="mode-toggle-text"><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span></label>`).join('')}</fieldset>`;
    toggles.innerHTML = group('show', 'Spectacle et interactions') + group('economy', 'Économie');
  }
}

export function showCustomPanel(open) {
  $id('mode-custom').classList.toggle('hidden', !open);
  $id('mode-grid').classList.toggle('hidden', !!open);
  if (open) { const first = document.querySelector('#mode-toggles input'); if (first) first.focus(); }
}

export const customPicks = () => [...document.querySelectorAll('#mode-toggles input:checked')].map(i => i.value);
export const adultPick = () => !!($id('mode-adult') && $id('mode-adult').checked);

// ================================================================ configuration affichee
// Salon : le mode et ses mecaniques. HUD : un tampon discret.
export function renderConfig(game) {
  const cfg = gameConfig(game);
  const preset = PRESETS[cfg.preset] || PRESETS.custom;
  const active = activeMechanics(game);
  const lobby = $id('lobby-mode');
  if (lobby) {
    lobby.innerHTML = `<span class="mode-badge mode-badge--${cfg.preset}">${preset.icon} ${esc(preset.label)}</span>
      ${adultHost(game) ? '<span class="mode-chip mode-chip--adult" title="Présentateur sans filtre : humour cru, partie réservée aux majeurs">🔞 Sans filtre</span>' : ''}
      ${active.length ? active.map(m => `<span class="mode-chip" title="${esc(m.label)} : ${esc(m.desc)}">${m.icon} ${esc(m.label)}</span>`).join('') : '<span class="mode-chip mode-chip--none">Règles d’origine, aucune nouvelle mécanique</span>'}`;
  }
  const hud = $id('hud-mode');
  if (hud) {
    hud.textContent = `${preset.icon} ${preset.label}${adultHost(game) ? ' · 🔞' : ''}`;
    hud.title = active.length ? active.map(m => `${m.icon} ${m.label}`).join('\n') : 'Règles d’origine';
    hud.dataset.preset = cfg.preset;
  }
}

// ================================================================ tampon de resolution
// Le meme pour toutes les mecaniques : un cachet bref, en haut, qui ne bloque rien.
// Les cachets passent l'un apres l'autre (avant, le second ecrasait le premier aussitot),
// chacun le temps d'etre lu : ~ 55 ms par caractere, entre 3,2 et 7 s.
const stampQueue = [];
let stampBusy = false;
export function showStamp(opts) {
  if (document.hidden) return;                       // onglet masque : rien a lire, rien a empiler
  stampQueue.push(opts);
  if (stampQueue.length > 3) stampQueue.splice(0, stampQueue.length - 3);
  if (!stampBusy) nextStamp();
}
function nextStamp() {
  const s = stampQueue.shift();
  if (!s) { stampBusy = false; return; }
  stampBusy = true;
  const { kicker = '', title, text = '', tone = 'ink', ms = 0, sound } = s;
  sfx(sound || (tone === 'green' ? 'win' : tone === 'red' ? 'lose' : 'stamp'));
  let el = $id('party-stamp');
  if (!el) {
    el = document.createElement('div');
    el.id = 'party-stamp'; el.className = 'party-stamp'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.dataset.tone = tone;
  el.innerHTML = `${kicker ? `<span class="ps-kicker">${esc(kicker)}</span>` : ''}<strong class="ps-title">${esc(title)}</strong>${text ? `<span class="ps-text">${esc(text)}</span>` : ''}`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(el._t);
  const read = Math.min(7000, Math.max(3200, 1800 + `${kicker} ${title} ${text}`.length * 55));
  el._t = setTimeout(() => { el.classList.remove('on'); el._t = setTimeout(nextStamp, 300); }, Math.max(ms, read));
}

// ================================================================ reactions
let reactTarget = null;

export function pickReactionTarget(pid) { reactTarget = pid; if (S.game) renderReactDock(S.game, true); }
export async function pickReaction(kind) {
  const game = S.game;
  if (!game) return;
  const target = reactTarget && playerById(game, reactTarget) ? reactTarget : defaultTarget(game);
  if (!target) return;
  await sendReaction(kind, target);
}
function defaultTarget(game) {
  const cur = currentPlayer(game);
  if (cur && cur.id !== S.playerId) return cur.id;
  const other = (game.players || []).find(p => p.id !== S.playerId);
  return other ? other.id : null;
}

function renderReactDock(game, force = false) {
  const dock = $id('react-dock');
  if (!dock) return;
  const show = on(game, 'reactions') && game.phase === 'playing' && !!playerById(game, S.playerId);
  dock.hidden = !show;
  if (!show) return;
  if (reactTarget && !playerById(game, reactTarget)) reactTarget = null;
  const target = reactTarget || defaultTarget(game);
  const others = game.players.filter(p => p.id !== S.playerId);
  const sig = target + '|' + others.map(p => p.id + p.bankrupt).join();
  if (!force && dock.dataset.sig === sig) return;
  dock.dataset.sig = sig;
  dock.innerHTML = `<h3>Réagir</h3>
    <div class="react-targets" role="radiogroup" aria-label="Cible">${others.map(p => `<button type="button" class="react-target${p.id === target ? ' on' : ''}" role="radio" aria-checked="${p.id === target}" data-act="react-target" data-arg="${esc(p.id)}" style="--pc:${esc(p.color)}"><i></i>${esc(p.name)}</button>`).join('')}</div>
    <div class="react-buttons">${Object.entries(REACTIONS).map(([k, r]) => `<button type="button" class="react-btn" data-act="react" data-arg="${k}" aria-label="Lancer : ${r.label}" title="${r.label}">${r.icon}</button>`).join('')}</div>`;
}

// Chaque reaction recente vole de la fiche de l'envoyeur a celle de la cible.
function playReactions(game) {
  const list = Object.entries(game.reactions || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => a.ts - b.ts);
  list.forEach(r => {
    if (seenP.reactions.has(r.k)) return;
    seenP.reactions.add(r.k);
    if (seenP.first || Date.now() - (r.ts || 0) > 6000) return;     // pas de rejeu au chargement
    flyReaction(r);
  });
}

function reactLayer() {
  let layer = $id('react-layer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'react-layer'; layer.className = 'react-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
  return layer;
}
const hits = new Map();   // cible -> { n, t } pour le compteur de rafale

function flyReaction(r) {
  const to = cardOf(r.to);
  if (!to) return;
  const icon = (REACTIONS[r.kind] || REACTIONS.tomato).icon;
  const layer = reactLayer();
  const b = centerOf(to);
  const from = cardOf(r.from);
  const a = from ? centerOf(from) : { x: b.x + 140, y: b.y - 160 };
  const prev = hits.get(r.to);
  const n = prev && Date.now() - prev.t < 4000 ? prev.n + 1 : 1;
  hits.set(r.to, { n, t: Date.now() });
  const land = () => {
    const splat = document.createElement('span');
    splat.className = 'react-splat'; splat.textContent = icon;
    splat.style.left = b.x + 'px'; splat.style.top = b.y + 'px';
    layer.appendChild(splat);
    if (n >= 2) {
      let badge = layer.querySelector(`.react-count[data-to="${CSS.escape(r.to)}"]`);
      if (!badge) { badge = document.createElement('span'); badge.className = 'react-count'; badge.dataset.to = r.to; layer.appendChild(badge); }
      const rc = to.getBoundingClientRect();
      badge.style.left = (rc.right - 8) + 'px'; badge.style.top = (rc.top + 4) + 'px';
      badge.textContent = `${icon}×${n}`;
      badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
      clearTimeout(badge._t); badge._t = setTimeout(() => badge.remove(), 2600);
    }
    to.classList.remove('hit'); void to.offsetWidth; to.classList.add('hit');
    sfx('pop');
    setTimeout(() => { splat.remove(); to.classList.remove('hit'); }, 900);
  };
  if (!live()) return land();
  const fly = document.createElement('span');
  fly.className = 'react-fly'; fly.textContent = icon;
  layer.appendChild(fly);
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 70 };
  fly.animate([
    { transform: `translate(${a.x}px,${a.y}px) scale(.6) rotate(0deg)`, opacity: 0 },
    { transform: `translate(${a.x}px,${a.y}px) scale(1) rotate(-20deg)`, opacity: 1, offset: .1 },
    { transform: `translate(${mid.x}px,${mid.y}px) scale(1.25) rotate(160deg)`, offset: .55 },
    { transform: `translate(${b.x}px,${b.y}px) scale(1) rotate(340deg)`, opacity: 1 },
  ], { duration: 620, easing: 'cubic-bezier(.3,.6,.4,1)' }).finished.catch(() => {}).then(() => { fly.remove(); land(); });
}

// ================================================================ encheres tendues
let auctionTicker = null;
let auctionBeat = null;

function renderAuctionX(game) {
  const box = $id('auction-x');
  const a = game.auction;
  const ext = on(game, 'extendedAuctions');
  // Fermeture : un cachet « Adjugé » chez tout le monde, puis retour au jeu.
  // « closing » est l'etat transitoire de la transaction de cloture : on attend « closed ».
  const closing = a && seenP.auction && a.id === seenP.auction.id && a.status === 'closing';
  if (seenP.auction && !closing && (!a || a.id !== seenP.auction.id || a.status !== 'open')) {
    const prev = seenP.auction;
    seenP.auction = null;
    stopAuctionTicker();
    if (ext && a && a.id === prev.id && a.status === 'closed') {
      const w = playerById(game, a.winner);
      const sq = BOARD[a.position] ? BOARD[a.position].name : '';
      showStamp(w ? { kicker: 'Enchère', title: 'Adjugé !', text: `${sq} → ${w.name} · ${fmt(a.highestBid)}`, tone: 'brass' }
        : { kicker: 'Enchère', title: 'Pas de preneur', text: `${sq} reste à la banque`, tone: 'ink' });
      const board = $id('board');
      if (board && live()) { board.classList.remove('hammer'); void board.offsetWidth; board.classList.add('hammer'); setTimeout(() => board.classList.remove('hammer'), 600); }
    }
  }
  if (!box) return;
  if (!ext || !a || a.status !== 'open') { box.hidden = true; return; }
  seenP.auction = { id: a.id };
  box.hidden = false;
  const me = playerById(game, S.playerId);
  const leader = playerById(game, a.highestBidder);
  const passes = a.passes || {};
  const log = [...(a.log || [])].reverse().slice(0, 5);
  const quick = [a.nextBid, a.nextBid + 40, a.nextBid + 90].map(v => Math.ceil(v / 10) * 10).filter((v, i, l) => l.indexOf(v) === i);
  const iLead = a.highestBidder === S.playerId;
  const canBid = me && !me.bankrupt;
  const sig = JSON.stringify([a.highestBid, a.highestBidder, a.nextBid, log.length, Object.keys(passes).sort(), me && me.cash]);
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    const passBtn = !iLead && !passes[S.playerId] ? '<button type="button" class="btn btn-small btn-ghost ax-pass" data-act="bid-pass">Je passe</button>'
      : passes[S.playerId] ? '<span class="ax-passed">Tu as passé</span>' : '';
    box.innerHTML = `<div class="ax-top"><span class="ax-amount">${fmt(a.highestBid || 0)}</span>
        <span class="ax-leader">${leader ? `<i style="--pc:${esc(leader.color)}"></i>${esc(leader.name)}${iLead ? ' (toi)' : ''}` : 'Aucune offre'}</span></div>
      ${canBid ? `<div class="ax-quick">${quick.map(v => `<button type="button" class="btn btn-small btn-secondary" data-act="bid-quick" data-arg="${v}" ${me.cash < v ? 'disabled' : ''}>${fmt(v)}</button>`).join('')}${passBtn}</div>` : ''}
      <ol class="ax-log" aria-label="Dernières offres">${log.map(l => { const p = playerById(game, l.pid); return `<li><i style="--pc:${esc(p ? p.color : '#888')}"></i>${esc(p ? p.name : '?')}<b>${fmt(l.amt)}</b></li>`; }).join('') || `<li class="ax-empty">Première offre : ${fmt(a.nextBid)}</li>`}</ol>
      ${Object.keys(passes).length ? `<p class="ax-passes">Ont passé : ${Object.keys(passes).map(id => esc((playerById(game, id) || {}).name || '?')).join(', ')}</p>` : ''}`;
  }
  startAuctionTicker();
}

// Tension des dernieres secondes : battement sur le compteur, fenetre qui vibre.
function startAuctionTicker() {
  if (auctionTicker) return;
  auctionTicker = setInterval(() => {
    const a = S.game && S.game.auction;
    if (!a || a.status !== 'open') return stopAuctionTicker();
    const left = a.endAt - Date.now();
    const tense = left <= AUCTION_EXTEND_MS && left > 0;
    document.querySelectorAll('.auction-countdown').forEach(el => el.classList.toggle('tense', tense));
    const card = document.querySelector('#modal-auction .modal-card');
    if (card) card.classList.toggle('tense', tense);
    const sec = Math.ceil(left / 1000);
    if (tense && sec !== auctionBeat) { auctionBeat = sec; sfx('beat'); }
  }, 250);
}
function stopAuctionTicker() {
  clearInterval(auctionTicker); auctionTicker = null;
  document.querySelectorAll('.auction-countdown.tense, #modal-auction .modal-card.tense').forEach(el => el.classList.remove('tense'));
}

// ================================================================ mini-jeux
// Une machine a etats locale, calee sur l'heure serveur : intro -> play -> wait -> result.
// Le resultat vient de l'etat partage (resolu une fois par l'hote) : tout le monde voit le meme.
const mgUI = { id: null, phase: null, submitted: false, ticker: null, t0: 0, green: 0, greenTimer: null, clicks: 0, mem: [], memInput: 0, closeTimer: null, resultFor: null };
const perf = () => performance.now();

function mgOverlay() { return $id('mg-overlay'); }
function closeMg() {
  const ov = mgOverlay();
  clearInterval(mgUI.ticker); mgUI.ticker = null;
  clearTimeout(mgUI.greenTimer); clearTimeout(mgUI.closeTimer);
  if (ov) { ov.hidden = true; ov.innerHTML = ''; ov.className = 'mg-overlay'; }
  mgUI.phase = null;
}

function renderMinigame(game) {
  const ov = mgOverlay();
  if (!ov) return;
  const mg = game.minigame;
  if (!mg) { if (mgUI.phase) closeMg(); return; }
  if (mg.status === 'resolved') {
    if (mgUI.resultFor === mg.id) return;
    const recent = mg.result && serverNow() - (mg.result.at || 0) < 6500;
    if (!recent) { if (mgUI.phase) closeMg(); return; }
    return showMgResult(game, mg);
  }
  if (mgUI.id !== mg.id) {
    closeMg();
    Object.assign(mgUI, { id: mg.id, phase: null, submitted: false, clicks: 0, mem: [], memInput: 0, green: 0, resultFor: null });
    buildMgShell(game, mg);
  }
  if (!mgUI.ticker) mgUI.ticker = setInterval(tickMg, 100);
  tickMg();
}

function buildMgShell(game, mg) {
  const ov = mgOverlay();
  const def = MINIGAMES[mg.kind];
  const names = mg.participants.map(id => (playerById(game, id) || {}).name || '?');
  ov.hidden = false;
  ov.className = `mg-overlay mg-k-${mg.kind}${mg.kind === 'city' ? ' mg-see-board' : ''}`;
  ov.innerHTML = `<div class="mg-card" role="dialog" aria-modal="false" aria-labelledby="mg-title">
    <div class="mg-head"><span class="mg-kicker">${mg.origin === 'duel' ? `Duel · ${esc(names.join(' contre '))}` : 'Mini-jeu · toute la table'}</span>
      <h3 id="mg-title">${esc(def.label)}</h3><p class="mg-rule">${esc(def.rule)}</p></div>
    <div class="mg-body" id="mg-body"></div>
    <div class="mg-bar" aria-hidden="true"><i id="mg-bar"></i></div>
    <div class="mg-who" id="mg-who" aria-live="polite"></div></div>`;
}

function tickMg() {
  const game = S.game;
  const mg = game && game.minigame;
  if (!mg || mg.id !== mgUI.id || mg.status === 'resolved') { clearInterval(mgUI.ticker); mgUI.ticker = null; return; }
  const t = serverNow();
  const me = S.playerId;
  const isPlayer = mg.participants.includes(me);
  const mine = (mg.entries || {})[me];
  let phase = t < mg.startAt ? 'intro' : (isPlayer && !mine && !mgUI.submitted && t <= mg.endAt && mg.status === 'active') ? 'play' : 'wait';
  // Mitraillette : temps ecoule sans finir -> on envoie l'echec.
  if (mgUI.phase === 'play' && phase === 'wait' && !mgUI.submitted && mg.kind === 'mash' && isPlayer && !mine) submitMg({ v: MINIGAMES.mash.duration, ok: false });
  if (phase !== mgUI.phase) { mgUI.phase = phase; buildMgPhase(game, mg, phase); }
  const count = $id('mg-count');
  if (count) {
    const n = String(Math.max(1, Math.ceil((mg.startAt - t) / 1000)));
    if (count.textContent !== n) { count.textContent = n; sfx('tick'); }
  }
  const bar = $id('mg-bar');
  if (bar) bar.style.transform = `scaleX(${phase === 'intro' ? 1 : Math.max(0, Math.min(1, (mg.endAt - t) / MINIGAMES[mg.kind].duration))})`;
  const who = $id('mg-who');
  if (who) {
    const entries = mg.entries || {};
    const html = mg.participants.map(id => { const p = playerById(game, id) || { name: '?', color: '#888' };
      return `<span class="mg-chip${entries[id] ? ' done' : ''}" style="--pc:${esc(p.color)}"><i></i>${esc(p.name)}${entries[id] ? ' ✓' : ''}</span>`; }).join('');
    if (who.dataset.html !== html) { who.innerHTML = html; who.dataset.html = html; }
  }
}

function submitMg(entry) {
  if (mgUI.submitted) return;
  mgUI.submitted = true;
  clearTimeout(mgUI.greenTimer);
  submitEntry(entry, S.playerId, mgUI.id);
  if (S.game) { mgUI.phase = 'wait'; buildMgPhase(S.game, S.game.minigame, 'wait', entry); }
}

function buildMgPhase(game, mg, phase, sentEntry) {
  const body = $id('mg-body');
  if (!body || !mg) return;
  const p = mg.params || {};
  if (phase === 'intro') { body.innerHTML = `<div class="mg-count" id="mg-count" aria-live="assertive">3</div>`; return; }
  if (phase === 'wait') {
    const isPlayer = mg.participants.includes(S.playerId);
    const msg = !isPlayer ? 'Tu regardes. Prépare les tomates.' : mgUI.submitted ? (sentEntry && sentEntry.ok === false && mg.kind !== 'trap' ? 'Raté. On attend les autres…' : 'Envoyé. On attend les autres…')
      : serverNow() > mg.endAt ? 'Temps écoulé.' : 'On attend les autres…';
    body.innerHTML = `<p class="mg-wait">${msg}</p>`;
    return;
  }
  // phase === 'play'
  mgUI.t0 = perf();
  const late = Math.max(0, serverNow() - mg.startAt);   // arrive en cours de jeu
  switch (mg.kind) {
    case 'reflex': {
      body.innerHTML = `<button type="button" class="mg-pad mg-pad--wait" id="mg-pad">Attends le vert…</button>`;
      const pad = $id('mg-pad');
      pad.focus();
      mgUI.greenTimer = setTimeout(() => { mgUI.green = perf(); pad.classList.replace('mg-pad--wait', 'mg-pad--go'); pad.textContent = 'MAINTENANT !'; sfx('go'); }, Math.max(0, (p.wait || 2000) - late));
      pad.addEventListener('click', () => (mgUI.green ? submitMg({ v: Math.round(perf() - mgUI.green), ok: true }) : submitMg({ v: 0, ok: false })));
      break;
    }
    case 'mash': {
      body.innerHTML = `<button type="button" class="mg-pad" id="mg-pad">TAPE ! <b id="mg-n">0</b> / ${p.target || 20}</button>`;
      const pad = $id('mg-pad');
      pad.focus();
      pad.addEventListener('click', () => {
        mgUI.clicks++;
        const n = $id('mg-n'); if (n) n.textContent = String(mgUI.clicks);
        if (mgUI.clicks >= (p.target || 20)) submitMg({ v: Math.round(perf() - mgUI.t0 + late), ok: true });
      });
      break;
    }
    case 'math': {
      body.innerHTML = `<p class="mg-q">${p.a} ${p.op} ${p.b} = ?</p><div class="mg-choices">${(p.choices || []).map((c, i) => `<button type="button" class="btn btn-secondary mg-choice" data-v="${c}"><small>${i + 1}</small>${c}</button>`).join('')}</div>`;
      body.querySelectorAll('.mg-choice').forEach(b => b.addEventListener('click', () => submitMg({ v: Math.round(perf() - mgUI.t0 + late), ok: Number(b.dataset.v) === p.answer })));
      const first = body.querySelector('.mg-choice'); if (first) first.focus();
      break;
    }
    case 'city': {
      const sq = BOARD[p.target] || { name: '?' };
      body.innerHTML = `<p class="mg-q">Trouve <b>${esc(sq.name)}</b></p><p class="mg-hint">Clique sa case sur le plateau.</p>`;
      break;
    }
    case 'memory': {
      const colors = MEMORY_COLORS;
      const token = id => { const c = colors.find(x => x.id === id) || colors[0]; return `<span class="mg-token" style="--c:${c.hex}"><b>${c.shape}</b>${c.id}</span>`; };
      body.innerHTML = `<div class="mg-seq" id="mg-seq">${(p.seq || []).map(token).join('')}</div><div class="mg-choices mg-colors" id="mg-colors" hidden>${colors.map(c => `<button type="button" class="mg-color" data-c="${c.id}" style="--c:${c.hex}"><b>${c.shape}</b>${c.id}</button>`).join('')}</div><p class="mg-hint" id="mg-mem-hint">Mémorise…</p>`;
      mgUI.greenTimer = setTimeout(() => {
        const seqEl = $id('mg-seq'), pads = $id('mg-colors'), hint = $id('mg-mem-hint');
        if (!seqEl || !pads) return;
        seqEl.innerHTML = (p.seq || []).map(() => '<span class="mg-token mg-token--hidden">?</span>').join('');
        pads.hidden = false; hint.textContent = 'À toi : rejoue la suite.';
        mgUI.memInput = perf();
        pads.querySelector('.mg-color').focus();
      }, Math.max(0, (p.show || 2800) - late));
      body.querySelectorAll('.mg-color').forEach(b => b.addEventListener('click', () => {
        if (!mgUI.memInput || mgUI.submitted) return;
        const i = mgUI.mem.length;
        mgUI.mem.push(b.dataset.c);
        const slots = document.querySelectorAll('#mg-seq .mg-token');
        if (slots[i]) slots[i].outerHTML = token(b.dataset.c);
        if (b.dataset.c !== p.seq[i]) return submitMg({ v: Math.round(perf() - mgUI.memInput), ok: false });
        if (mgUI.mem.length === p.seq.length) submitMg({ v: Math.round(perf() - mgUI.memInput), ok: true });
      }));
      break;
    }
    case 'trap': {
      body.innerHTML = `<p class="mg-big">NE CLIQUE PAS</p><button type="button" class="btn btn-gold btn-lg mg-bait" id="mg-bait">${esc(p.bait || 'Clique ici')}</button>`;
      $id('mg-bait').addEventListener('click', () => submitMg({ v: Math.round(perf() - mgUI.t0 + late), ok: false }));
      break;
    }
    case 'blind': {
      const me = playerById(game, S.playerId);
      const max = me && !me.bankrupt ? Math.max(0, me.cash || 0) : 0;
      body.innerHTML = `<p class="mg-hint">Ta mise reste secrète jusqu’au résultat.</p><div class="mg-choices">${(p.options || [0, 20, 50, 100]).map(v => `<button type="button" class="btn btn-secondary mg-choice" data-v="${v}" ${v > max ? 'disabled' : ''}>${fmt(v)}</button>`).join('')}</div>`;
      body.querySelectorAll('.mg-choice').forEach(b => b.addEventListener('click', () => submitMg({ v: Number(b.dataset.v), ok: true })));
      break;
    }
    default: body.innerHTML = '';
  }
}

// Trouve la ville : le clic sur une case du plateau repond (avant la fiche de case).
function cityClick(e) {
  const mg = S.game && S.game.minigame;
  if (!mg || mg.kind !== 'city' || mgUI.phase !== 'play' || mgUI.id !== mg.id) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  e.stopPropagation(); e.preventDefault();
  const ok = Number(sq.dataset.index) === Number(mg.params.target);
  sq.classList.add(ok ? 'mg-hit' : 'mg-miss');
  setTimeout(() => sq.classList.remove('mg-hit', 'mg-miss'), 1200);
  submitMg({ v: Math.round(perf() - mgUI.t0), ok });
}

// Clavier : Espace / Entree pour le pad (reflexe, mitraillette), 1-4 pour les choix.
function mgKeys(e) {
  if (mgUI.phase !== 'play' || /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName)) return;
  const pad = $id('mg-pad');
  if (pad && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat || (S.game.minigame || {}).kind === 'mash') pad.click(); return; }
  const n = Number(e.key);
  if (n >= 1 && n <= 4) { const b = document.querySelectorAll('#mg-body .mg-choice, #mg-body .mg-color:not([hidden])')[n - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } }
}

function showMgResult(game, mg) {
  const ov = mgOverlay();
  clearInterval(mgUI.ticker); mgUI.ticker = null; clearTimeout(mgUI.greenTimer);
  mgUI.resultFor = mg.id; mgUI.phase = 'result';
  const def = MINIGAMES[mg.kind];
  const res = mg.result || { rows: [] };
  sfx((res.winnerIds || []).includes(S.playerId) ? 'win' : res.loserId === S.playerId ? 'lose' : 'stamp');
  const rows = (res.rows || []).map(r => {
    const p = playerById(game, r.pid) || { name: '?', color: '#888' };
    const tag = (res.winnerIds || []).includes(r.pid) ? '<span class="mg-tag mg-tag--win">Gagne</span>' : r.pid === res.loserId ? '<span class="mg-tag mg-tag--lose">Paie</span>' : '';
    const d = r.delta ? `<b class="${r.delta > 0 ? 'up' : 'down'}">${r.delta > 0 ? '+' : '−'}${fmt(Math.abs(r.delta))}</b>` : '<b class="zero">0 $</b>';
    return `<li class="${r.pid === S.playerId ? 'me' : ''}"><span class="mg-rank">${r.rank}</span><i style="--pc:${esc(p.color)}"></i><span class="mg-name">${esc(p.name)}${r.ghost ? ' 👻' : ''}</span><span class="mg-label">${esc(r.label || '')}</span>${tag}${d}</li>`;
  }).join('');
  ov.hidden = false;
  ov.className = 'mg-overlay mg-result';
  ov.innerHTML = `<div class="mg-card" role="status" aria-live="polite">
    <div class="mg-head"><span class="mg-kicker">${mg.origin === 'duel' ? 'Duel · résultat' : 'Mini-jeu · résultat'}</span><h3>${esc(def.label)}</h3></div>
    <ol class="mg-rows">${rows}</ol><p class="mg-summary">${esc(res.text || '')}</p></div>`;
  clearTimeout(mgUI.closeTimer);
  mgUI.closeTimer = setTimeout(closeMg, 6500);
}

// ================================================================ testament
// Cause : la faillite (fenetre dramatique). Feedback : compte a rebours de 10 s.
// Resolution : un cachet chez tout le monde. Retour au jeu : la fenetre se ferme.
const willUI = { id: null, ticker: null, done: null };

function closeWill() {
  const ov = $id('will-overlay');
  clearInterval(willUI.ticker); willUI.ticker = null;
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
}

function renderWill(game) {
  const ov = $id('will-overlay');
  const w = game.will;
  if (!ov) return;
  if (!w) { if (willUI.id) closeWill(); willUI.id = null; return; }
  if (w.status === 'resolved') {
    if (willUI.id === w.id && willUI.done !== w.id) {
      willUI.done = w.id;
      closeWill();
      const heir = playerById(game, w.heir);
      const dead = playerById(game, w.playerId) || { name: '?' };
      showStamp(heir ? { kicker: `Testament de ${dead.name}`, title: `${heir.name} hérite`, text: `${w.count} propriété${w.count > 1 ? 's' : ''}`, tone: 'brass', ms: 3200 }
        : { kicker: `Testament de ${dead.name}`, title: 'Tout à la banque', text: w.timeout ? 'Aucun choix à temps.' : 'Personne n’hérite.', tone: 'ink', ms: 3200 });
    }
    return;
  }
  const mine = w.playerId === S.playerId;
  const dead = playerById(game, w.playerId) || { name: '?' };
  if (willUI.id !== w.id || ov.dataset.status !== w.status) {
    if (willUI.id !== w.id) sfx('sting');
    willUI.id = w.id;
    ov.dataset.status = w.status;
    ov.hidden = false;
    const heirs = (w.heirs || []).map(id => playerById(game, id)).filter(Boolean);
    const choose = mine && w.status === 'choose';
    ov.innerHTML = `<div class="mg-card will-card" role="dialog" aria-labelledby="will-title">
      <span class="will-stamp" aria-hidden="true">Faillite</span>
      <div class="mg-head"><span class="mg-kicker">Testament</span>
        <h3 id="will-title">${choose ? 'Qui hérite de tout ça ?' : `${esc(dead.name)} rédige son testament…`}</h3>
        <p class="mg-rule">${w.count} propriété${w.count > 1 ? 's' : ''} à léguer${choose ? ', bâtiments compris. La banque, ou un joueur.' : '.'}</p></div>
      ${choose ? `<div class="will-heirs">${heirs.map(p => `<button type="button" class="btn btn-secondary will-heir" data-act="will" data-arg="${esc(p.id)}" style="--pc:${esc(p.color)}"><i></i>${esc(p.name)}</button>`).join('')}
        <button type="button" class="btn btn-ghost will-heir" data-act="will" data-arg="bank">🏦 La banque</button></div>`
        : `<p class="mg-wait">${w.status === 'choose' ? 'La table retient son souffle.' : 'Le notaire ouvre l’enveloppe…'}</p>`}
      <div class="mg-bar" aria-hidden="true"><i id="will-bar"></i></div>
      <p class="will-count" id="will-count" aria-live="polite"></p></div>`;
    if (choose) { const first = ov.querySelector('.will-heir'); if (first) first.focus(); }
  }
  if (!willUI.ticker) willUI.ticker = setInterval(() => {
    const cur = S.game && S.game.will;
    if (!cur || cur.status === 'resolved') { clearInterval(willUI.ticker); willUI.ticker = null; return; }
    const left = Math.max(0, cur.endAt - serverNow());
    const bar = $id('will-bar'); if (bar) bar.style.transform = `scaleX(${Math.min(1, left / WILL_MS)})`;
    const c = $id('will-count'); if (c) c.textContent = cur.status === 'choose' ? `${Math.ceil(left / 1000)} s — sans choix, tout part à la banque.` : '';
  }, 200);
}

// ================================================================ fantomes
let hauntPick = false;

export function startHaunt() {
  hauntPick = !hauntPick;
  document.body.classList.toggle('haunt-pick', hauntPick);
  if (S.game) renderGhostDock(S.game, true);
}

function hauntClick(e) {
  if (!hauntPick) return;
  const sq = e.target.closest('.square');
  if (!sq) return;
  e.stopPropagation(); e.preventDefault();
  hauntPick = false;
  document.body.classList.remove('haunt-pick');
  hauntSquare(Number(sq.dataset.index)).then(() => S.game && renderGhostDock(S.game, true));
}

function renderGhostDock(game, force = false) {
  const dock = $id('ghost-dock');
  if (!dock) return;
  const me = playerById(game, S.playerId);
  const show = on(game, 'ghost') && game.phase === 'playing' && me && me.bankrupt && me.ghost;
  dock.hidden = !show;
  if (!show) { if (hauntPick) { hauntPick = false; document.body.classList.remove('haunt-pick'); } return; }
  const used = (me.hauntRound || 0) === (game.round || 1);
  const sig = `${used}|${hauntPick}|${game.round}`;
  if (!force && dock.dataset.sig === sig) return;
  dock.dataset.sig = sig;
  dock.innerHTML = `<h3>👻 Fantôme</h3>
    <p class="ghost-text">Tu ne possèdes plus rien, mais tu peux hanter une case par manche : le prochain qui s’y arrête perd 50 $.</p>
    ${used ? '<p class="ghost-used">Pouvoir utilisé cette manche.</p>'
      : `<button type="button" class="btn btn-secondary btn-block" data-act="haunt">${hauntPick ? 'Annuler' : 'Hanter une case'}</button>${hauntPick ? '<p class="ghost-hint">Clique une case du plateau (sauf Départ et prison).</p>' : ''}`}`;
}

// Cases hantees : un 👻 visible de tous, a la couleur du fantome.
function renderHaunts(game) {
  const haunts = on(game, 'ghost') ? (game.haunts || {}) : {};
  document.querySelectorAll('#board-grid .square').forEach(node => {
    const h = haunts[node.dataset.index];
    node.classList.toggle('haunted', !!h);
    if (h) { const g = playerById(game, h.by); node.style.setProperty('--ghost', g ? g.color : '#888'); node.title = `${node.title.split(' · 👻')[0]} · 👻 hantée par ${g ? g.name : '?'} (−50 $)`; }
  });
}

// ================================================================ paris
// Cause : le tour d'un autre commence. Feedback : la barre de paris. Resolution : un
// cachet pour chaque parieur. Retour au jeu : la barre disparait des le tour suivant.
let betStake = 20;
let betsSeen = null;

export function setBetStake(v) { betStake = Number(v) || 20; if (S.game) renderBets(S.game, true); }
export function betPick(kind) { return placeBet(kind, betStake); }

function renderBets(game, force = false) {
  const bar = $id('bet-bar');
  if (!bar) return;
  const b = game.bets;
  const me = playerById(game, S.playerId);
  if (b && b.status === 'resolved' && b.result && b.result[S.playerId] !== undefined && betsSeen !== b.key) {
    betsSeen = b.key;
    if (!seenP.first) {
      const d = b.result[S.playerId];
      showStamp({ kicker: me && me.bankrupt ? 'Pari pour l’honneur' : 'Pari', title: d > 0 ? `+${fmt(d)}` : `−${fmt(Math.abs(d))}`, text: d > 0 ? 'Bien vu. Tu ne l’avais pas volé.' : 'Raté. La banque te remercie.', tone: d > 0 ? 'green' : 'red' });
    }
  }
  const live = b && (b.status === 'open' ? b.key === betKey(game) : b.status === 'locked');
  const eligible = on(game, 'betting') && game.phase === 'playing' && live && me && b.roller !== me.id && (!me.bankrupt || me.ghost);
  if (!eligible) { bar.hidden = true; bar.dataset.sig = ''; return; }
  const mine = (b.entries || {})[me.id];
  const skipped = !!(b.skip || {})[me.id];
  const roller = playerById(game, b.roller) || { name: '?' };
  const count = Object.keys(b.entries || {}).length;
  const sig = JSON.stringify([b.key, b.status, mine, skipped, count, betStake, me.cash]);
  if (!force && bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  bar.hidden = false;
  const label = e => `${BET_KINDS[e.kind].short} ×${BET_KINDS[e.kind].odds} · ${fmt(e.amt)}`;
  if (b.status === 'locked') {
    bar.innerHTML = `<span class="bet-title">Paris fermés</span><span class="bet-note">${mine ? `Ton pari : <b>${esc(label(mine))}</b>` : `${count} pari${count > 1 ? 's' : ''}`} · on regarde ${esc(roller.name)}…</span>`;
    return;
  }
  if (mine) {
    bar.innerHTML = `<span class="bet-title">Ton pari</span><span class="bet-note"><b>${esc(label(mine))}</b> sur ${esc(roller.name)}. Rien n’est prélevé avant le résultat.</span>`;
    return;
  }
  if (skipped) {
    bar.innerHTML = `<span class="bet-title">Pas de pari</span><span class="bet-note">Tu regardes ${esc(roller.name)} lancer.</span>`;
    return;
  }
  const poor = !me.bankrupt && (me.cash || 0) < betStake;
  bar.innerHTML = `<span class="bet-title">Parie sur ${esc(roller.name)}</span>
    <span class="bet-stakes" role="radiogroup" aria-label="Mise">${BET_STAKES.map(v => `<button type="button" class="bet-stake${v === betStake ? ' on' : ''}" role="radio" aria-checked="${v === betStake}" data-act="bet-stake" data-arg="${v}">${fmt(v)}</button>`).join('')}</span>
    <span class="bet-kinds">${Object.entries(BET_KINDS).map(([k, d]) => `<button type="button" class="btn btn-small btn-secondary bet-kind" data-act="bet" data-arg="${k}" ${poor ? 'disabled' : ''} title="${esc(roller.name)} ${esc(d.label)} : mise ×${d.odds}">${esc(d.short)} <b>×${d.odds}</b></button>`).join('')}</span>
    <button type="button" class="btn btn-small btn-ghost bet-skip" data-act="bet-skip">Pas de pari</button>
    <span class="bet-left" id="bet-left" aria-live="off"></span>
    ${me.bankrupt ? '<span class="bet-note">Fantôme : pour l’honneur.</span>' : ''}`;
  tickBetWindow();
}

// Compte a rebours de la fenetre de paris : chez les parieurs (« ferme dans 5 s ») et
// sur le bouton du lanceur, bloque tant que les autres n'ont pas parie ou passe.
let betTicker = null;
function tickBetWindow() {
  const game = S.game;
  const hold = game ? betHold(game) : 0;
  const b = game && game.bets;
  const left = $id('bet-left');
  if (left && b && b.status === 'open') left.textContent = `Ferme dans ${Math.max(0, Math.ceil(((b.at || 0) + BET_WINDOW_MS - Date.now()) / 1000))} s`;
  document.querySelectorAll('.btn-roll').forEach(btn => {
    if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
    if (hold > 0) {
      btn.disabled = true;
      btn.classList.add('is-holding');
      btn.textContent = `Les autres parient… ${Math.ceil(hold / 1000)} s`;
    } else if (btn.classList.contains('is-holding')) {
      btn.disabled = false;
      btn.classList.remove('is-holding');
      btn.innerHTML = btn.dataset.orig;
    }
  });
  const need = hold > 0 || (b && b.status === 'open');
  if (need && !betTicker) betTicker = setInterval(tickBetWindow, 400);
  if (!need && betTicker) { clearInterval(betTicker); betTicker = null; }
}

// ================================================================ money time
let mtSeen = null;

function renderMoneyTime(game) {
  const ban = $id('money-banner');
  if (!ban) return;
  const mt = game.moneyTime;
  const active = on(game, 'moneyTime') && !!mt && mt.active && game.phase === 'playing';
  ban.hidden = !active;
  document.body.classList.toggle('money-time', active);
  if (!active) return;
  const max = roundsOf(game), round = game.round || 1;
  const left = max ? Math.max(1, max - round + 1) : 0;
  const html = `<b>MONEY TIME</b><span>Loyers ×2</span><span>${max ? `Manche ${round}/${max} · plus que ${left}` : `Premier à ${fmt(targetOf(game))}`}</span>`;
  if (ban.dataset.html !== html) { ban.innerHTML = html; ban.dataset.html = html; }
  if (mtSeen !== mt.at) {
    const fresh = !seenP.first && serverNow() - (mt.at || 0) < 9000;
    mtSeen = mt.at;
    if (fresh) slamMoneyTime();
  }
}

function slamMoneyTime() {
  sfx('sting');
  const el = $id('mt-slam');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = '<div class="mt-word">Money<br>Time</div><p>Tous les loyers doublent jusqu’à la fin.</p>';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove('on'); el.hidden = true; }, 2300);
}

// ================================================================ pacte du presentateur
const dealUI = { id: null, ticker: null, result: null };

function closeDeal() {
  const ov = $id('deal-overlay');
  clearInterval(dealUI.ticker); dealUI.ticker = null;
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
}

function renderDeal(game) {
  const ov = $id('deal-overlay');
  const d = game.deal;
  if (!ov) return;
  if (!on(game, 'hostDeals') || !d) { if (dealUI.id) closeDeal(); return; }
  if (d.status === 'resolved') {
    if (dealUI.result !== d.id && !d.void && d.at && serverNow() - d.at < 6000) {
      dealUI.result = d.id;
      const p = playerById(game, d.playerId) || { name: '?' };
      showStamp(d.success ? { kicker: `Pacte · ${p.name} fait ${d.die}`, title: `Tenu ! +${fmt(d.amt)}`, text: 'Le présentateur paie, à contrecœur.', tone: 'green' }
        : { kicker: `Pacte · ${p.name} fait ${d.die}`, title: `Perdu −${fmt(Math.abs(d.amt))}`, text: 'Le présentateur encaisse.', tone: 'red' });
    }
    if (dealUI.id) closeDeal();
    return;
  }
  if (d.status !== 'offer') { if (dealUI.id) { closeDeal(); dealUI.id = null; } return; }
  const mine = d.playerId === S.playerId;
  const p = playerById(game, d.playerId) || { name: '?' };
  const def = DEALS[d.kind] || { label: '?' };
  if (dealUI.id !== d.id) {
    dealUI.id = d.id;
    ov.hidden = false;
    ov.innerHTML = `<div class="mg-card deal-card" role="dialog" aria-labelledby="deal-title">
      <div class="deal-host" aria-hidden="true">${HOST_AVATAR}</div>
      <div class="mg-head"><span class="mg-kicker">Pacte du présentateur${mine ? '' : ` · pour ${esc(p.name)}`}</span>
        <h3 id="deal-title">${esc(def.label)}</h3>
        <p class="deal-terms"><b class="up">+${fmt(d.reward)}</b> si tu réussis · <b class="down">−${fmt(d.penalty)}</b> sinon</p></div>
      ${mine ? `<div class="deal-buttons"><button type="button" class="btn btn-gold btn-lg" data-act="deal" data-arg="yes">J’accepte</button>
        <button type="button" class="btn btn-ghost btn-lg" data-act="deal" data-arg="no">Non merci</button></div>`
        : `<p class="mg-wait">${esc(p.name)} réfléchit… La table aussi.</p>`}
      <div class="mg-bar" aria-hidden="true"><i id="deal-bar"></i></div>
      <p class="will-count" id="deal-count"></p></div>`;
    if (mine) { const b = ov.querySelector('[data-act="deal"]'); if (b) b.focus(); }
  }
  if (!dealUI.ticker) dealUI.ticker = setInterval(() => {
    const cur = S.game && S.game.deal;
    if (!cur || cur.status !== 'offer') { closeDeal(); return; }
    const left = Math.max(0, cur.endAt - serverNow());
    const bar = $id('deal-bar'); if (bar) bar.style.transform = `scaleX(${Math.min(1, left / DEAL_MS)})`;
    const c = $id('deal-count'); if (c) c.textContent = `${Math.ceil(left / 1000)} s — le silence vaut refus.`;
  }, 200);
}

// ================================================================ bulle / krach
let marketSeen = null;

function renderMarket(game) {
  const m = on(game, 'marketCrash') && game.market && game.market.group && (game.round || 1) <= game.market.until ? game.market : null;
  document.querySelectorAll('#board-grid .square').forEach(node => {
    const sq = BOARD[node.dataset.index];
    const hit = !!m && sq.group === m.group;
    node.classList.toggle('mk-bubble', hit && m.kind === 'bubble');
    node.classList.toggle('mk-crash', hit && m.kind === 'crash');
  });
  if (m && marketSeen !== m.id) {
    const fresh = !seenP.first && serverNow() - (m.at || 0) < 8000;
    marketSeen = m.id;
    const label = GROUP_LABELS[m.group] || m.group;
    if (fresh) showStamp(m.kind === 'bubble' ? { kicker: 'Bulle immobilière', title: `${label} ×2`, text: 'Loyers doublés pendant 2 manches.', tone: 'green', ms: 3000 }
      : { kicker: 'Krach', title: `${label} ÷2`, text: 'Loyers divisés par 2 pendant 2 manches.', tone: 'red', ms: 3000 });
  }
}

// ================================================================ recapitulatif de fin
// Primes secretes revelees une a une, podium, courbe des fortunes, faits marquants,
// titres, carnet local. Les memes donnees chez tout le monde (etat partage).
let recapFor = null;

function curveSVG(game) {
  const series = trailSeries(game);
  if (series.length < 2) return '';
  const ids = (game.players || []).map(p => p.id);
  const all = series.flatMap(t => ids.map(id => t.values[id]).filter(v => v !== undefined));
  const min = Math.min(0, ...all), max = Math.max(...all, 1);
  const W = 300, H = 120, pad = 6;
  const x = i => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = v => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const zero = min < 0 ? `<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="rc-zero"/>` : '';
  const lines = (game.players || []).map(p => {
    const pts = series.map((t, i) => (t.values[p.id] === undefined ? null : `${x(i).toFixed(1)},${y(t.values[p.id]).toFixed(1)}`)).filter(Boolean);
    return pts.length > 1 ? `<polyline points="${pts.join(' ')}" style="stroke:${esc(p.color)}" class="${p.id === game.winnerId ? 'win' : ''}"/>` : '';
  }).join('');
  return `<svg class="rc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe des fortunes, manche par manche">${zero}${lines}</svg>`;
}

function renderRecap(game) {
  const box = $id('victory-recap');
  if (!box) return;
  if (game.phase !== 'finished') { box.innerHTML = ''; recapFor = null; const list = $id('victory-board'); if (list) list.hidden = false; return; }
  const sig = `${game.code}:${game.finishedAt || game.winnerId}`;
  if (recapFor === sig) return;
  recapFor = sig;
  const stats = recordGame(game);                 // carnet local, une seule fois par partie
  const name = id => esc((playerById(game, id) || {}).name || '?');
  const chip = id => { const p = playerById(game, id) || { color: '#888', name: '?' }; return `<i class="rc-dot" style="--pc:${esc(p.color)}"></i>${esc(p.name)}`; };
  const bonuses = on(game, 'secretBonuses') && Array.isArray(game.bonuses) ? game.bonuses : [];
  const ranks = ranking(game).concat((game.players || []).filter(p => p.bankrupt));
  // Jusqu'a 3 joueurs, le podium dit tout : la liste classee ferait doublon.
  const list = $id('victory-board'); if (list) list.hidden = ranks.length <= 3;
  const podium = [ranks[1], ranks[0], ranks[2]].map((p, i) => p ? `<div class="rc-step rc-step--${['second', 'first', 'third'][i]}">
      <span class="ptoken" style="--pc:${esc(p.color)}">${esc(p.name.trim().charAt(0).toUpperCase())}</span>
      <b>${esc(p.name)}</b><small>${p.bankrupt ? 'faillite' : fmt(netWorth(game, p))}</small><span class="rc-place">${['2', '1', '3'][i]}</span></div>` : '<div class="rc-step rc-step--empty"></div>').join('');
  const titles = recapTitles(game);
  const swing = biggestSwing(game);
  const changes = leadChanges(game);
  const me = playerById(game, S.playerId);
  const mine = me && stats ? stats.players[me.name] : null;
  const delay = i => (reduced() ? 0 : i * 0.9);
  box.innerHTML = `
    ${bonuses.length ? `<section class="rc-block"><h4>Primes secrètes</h4><div class="rc-bonuses">${bonuses.map((b, i) => `
      <div class="rc-bonus" style="--d:${delay(i)}s"><span class="rc-bonus-label">🏅 ${esc(b.label)}</span><small>${esc(b.desc)}</small>
        <b>${(b.winners || []).length ? `${b.winners.map(name).join(', ')} <em>+${fmt(b.value)}</em>` : 'Personne'}</b></div>`).join('')}</div></section>` : ''}
    <section class="rc-block rc-podium" style="--d:${delay(bonuses.length)}s">${podium}</section>
    ${curveSVG(game) ? `<section class="rc-block"><h4>Courbe des fortunes</h4>${curveSVG(game)}
      <div class="rc-legend">${(game.players || []).map(p => `<span>${chip(p.id)}</span>`).join('')}</div></section>` : ''}
    <section class="rc-block rc-facts">
      <p><b>${changes}</b> changement${changes > 1 ? 's' : ''} de leader</p>
      ${swing ? `<p>Plus gros retournement : <b>${fmt(swing.amt)}</b> — ${esc(swing.text)}</p>` : ''}
    </section>
    ${titles.length ? `<section class="rc-block"><h4>Titres de la soirée</h4><div class="rc-titles">${titles.map(t => `
      <div class="rc-title"><span>${esc(t.label)}</span><b>${chip(t.pid)}</b><small>${esc(t.why)}</small></div>`).join('')}</div></section>` : ''}
    ${mine ? `<p class="rc-carnet">Ton carnet sur cet appareil : ${mine.games} partie${mine.games > 1 ? 's' : ''} · ${mine.wins || 0} victoire${(mine.wins || 0) > 1 ? 's' : ''} · ${mine.bankruptcies || 0} faillite${(mine.bankruptcies || 0) > 1 ? 's' : ''}</p>` : ''}
    ${S.isHost ? '' : '<p class="rc-wait">L’hôte peut lancer la revanche.</p>'}`;
}

let mgWired = false;
function wireMinigames() {
  if (mgWired) return;
  mgWired = true;
  const grid = $id('board-grid');
  if (grid) { grid.addEventListener('click', cityClick, true); grid.addEventListener('click', hauntClick, true); }
  document.addEventListener('keydown', mgKeys, true);
}

// ================================================================ son
export function toggleSound() { setMuted(!isMuted()); renderSoundButton(); if (!isMuted()) sfx('pop'); }
export function renderSoundButton() {
  const b = $id('sound-toggle');
  if (!b) return;
  b.textContent = isMuted() ? '🔇' : '🔊';
  b.setAttribute('aria-label', isMuted() ? 'Activer le son' : 'Couper le son');
  b.setAttribute('aria-pressed', String(!isMuted()));
}

// ================================================================ points d'entree
// Appele apres le rendu principal a chaque mise a jour.
// ================================================================ cartes de regles (lancement)
// Un paquet a feuilleter : les bases, puis chaque mecanique active. Le premier tour attend
// que tous les humains aient clique « Pret » (ou 60 s). Chacun feuillette a son rythme.
const briefUI = { id: null, idx: 0, cards: [], timer: null };

function renderBriefing(game) {
  const ov = $id('brief-overlay');
  if (!ov) return;
  if (!briefingActive(game)) { closeBriefing(); return; }
  const id = String(game.briefing.endAt);
  if (briefUI.id !== id) {
    Object.assign(briefUI, { id, idx: 0, cards: briefingCards(game) });
    const cfg = gameConfig(game), preset = PRESETS[cfg.preset] || PRESETS.classic;
    ov.innerHTML = `<div class="brief-box" role="dialog" aria-modal="true" aria-labelledby="brief-title">
      <p class="brief-kicker">Avant de jouer · ${esc(preset.icon)} Mode ${esc(preset.label)}</p>
      <div class="brief-card" id="brief-card" aria-live="polite"></div>
      <div class="brief-nav">
        <button class="btn btn-ghost" type="button" data-act="brief-prev" aria-label="Carte précédente">←</button>
        <div class="brief-dots" id="brief-dots"></div>
        <button class="btn btn-ghost" type="button" data-act="brief-next" aria-label="Carte suivante">→</button>
      </div>
      <button class="btn btn-gold btn-block btn-lg" type="button" id="brief-ready" data-act="brief-ready">Prêt !</button>
      <p class="brief-wait" id="brief-wait"></p>
    </div>`;
    ov.hidden = false;
    drawBriefCard();
    clearInterval(briefUI.timer);
    briefUI.timer = setInterval(() => S.game && updateBriefWait(S.game), 500);
  }
  updateBriefWait(game);
}

function drawBriefCard() {
  const card = $id('brief-card'), dots = $id('brief-dots');
  const c = briefUI.cards[briefUI.idx];
  if (!card || !c) return;
  const n = briefUI.cards.length;
  card.classList.toggle('special', !!c.special);
  card.innerHTML = `<span class="brief-count">${briefUI.idx + 1} / ${n}</span><span class="brief-icon" aria-hidden="true">${esc(c.icon)}</span>
    <h3 id="brief-title">${esc(c.title)}</h3><ul>${c.lines.map(l => `<li class="${l.startsWith('• ') ? 'sub' : ''}">${esc(l.replace(/^• /, ''))}</li>`).join('')}</ul>`;
  card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
  if (dots) dots.innerHTML = briefUI.cards.map((x, i) => `<button type="button" class="brief-dot${i === briefUI.idx ? ' on' : ''}${x.special ? ' special' : ''}" data-act="brief-go" data-arg="${i}" aria-label="Carte ${i + 1} : ${esc(x.title)}"></button>`).join('');
  document.querySelectorAll('[data-act="brief-prev"]').forEach(b => { b.disabled = briefUI.idx === 0; });
  document.querySelectorAll('[data-act="brief-next"]').forEach(b => { b.disabled = briefUI.idx === n - 1; });
}

function updateBriefWait(game) {
  const btn = $id('brief-ready'), wait = $id('brief-wait');
  if (!btn || !wait || !briefingActive(game)) return;
  const meReady = !!((game.briefing.ready || {})[S.playerId]);
  const pending = briefingPending(game);
  const left = Math.max(0, Math.ceil(((game.briefing.endAt || 0) - Date.now()) / 1000));
  btn.disabled = meReady;
  btn.textContent = meReady ? '✓ Prêt' : briefUI.idx === briefUI.cards.length - 1 ? 'Prêt !' : 'Je connais, prêt !';
  wait.textContent = meReady
    ? (pending.length ? `On attend ${pending.map(p => p.name).join(', ')}… départ dans ${left} s au plus tard.` : 'C’est parti !')
    : `La partie démarre quand tout le monde est prêt, ou dans ${left} s.`;
}

function closeBriefing() {
  const ov = $id('brief-overlay');
  clearInterval(briefUI.timer);
  briefUI.timer = null; briefUI.id = null;
  if (ov && !ov.hidden) { ov.hidden = true; ov.innerHTML = ''; }
}

export function briefStep(delta) { briefGo(briefUI.idx + delta); }
export function briefGo(i) {
  const n = briefUI.cards.length;
  if (!n) return;
  briefUI.idx = Math.max(0, Math.min(n - 1, Number(i) || 0));
  drawBriefCard();
  if (S.game) updateBriefWait(S.game);
}
document.addEventListener('keydown', e => {
  if (!briefUI.id || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight') briefStep(1);
  else if (e.key === 'ArrowLeft') briefStep(-1);
});

export function renderParty(game) {
  renderConfig(game);
  if (game.phase !== 'playing') closeBriefing(); else renderBriefing(game);
  if (game.phase !== 'playing' && game.phase !== 'finished') { seenP.first = true; return; }
  wireMinigames();
  renderReactDock(game);
  playReactions(game);
  renderAuctionX(game);
  renderMinigame(game);
  renderWill(game);
  renderGhostDock(game);
  renderHaunts(game);
  renderBets(game);
  tickBetWindow();
  renderMoneyTime(game);
  renderDeal(game);
  renderMarket(game);
  renderRecap(game);
  seenP.first = false;
}

// Changement de partie : on oublie ce qui a ete vu.
export function resetParty() {
  Object.assign(seenP, { first: true, reactions: new Set(), auction: null });
  closeBriefing();
  stopAuctionTicker();
  reactTarget = null;
  hits.clear();
  closeMg();
  mgUI.id = null; mgUI.resultFor = null;
  closeWill(); willUI.id = null; willUI.done = null;
  hauntPick = false; document.body.classList.remove('haunt-pick');
  betsSeen = null; mtSeen = null; document.body.classList.remove('money-time');
  closeDeal(); dealUI.id = null; dealUI.result = null; marketSeen = null;
  recapFor = null;
}

export const partyDebug = { gameConfig: () => gameConfig(S.game) };
