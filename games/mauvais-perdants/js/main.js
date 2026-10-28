// Mauvais Perdants — interface. Lit l'état du salon (net.js) et l'affiche ; ne décide de
// rien. Le coordinateur (coord.js) tourne dans l'onglet désigné par `coord`.
// Habillage : Canal 7 (voir css/show.css). La phase colore le plateau, les vues posent
// leurs pièces ; aucune animation ne pilote le jeu.

import { $, h, clear, chip, toast, reduced } from './ui/dom.js';
import { Flaps } from './ui/flaps.js';
import { wipe, confetti } from './ui/fx.js';
import { createRoom, joinRoom, resumeRoom, serverNow, normalizeCode, ONLINE_MS } from './net.js';
import { Coordinator, paramsOf, namesOf, finalSummary } from './coord.js';
import { GHOST } from './results.js';
import { round, FAMILIES } from './rounds/index.js';
import { gameOf, contenders, COUNT_MS } from './machine.js';
import { ROUNDS_PER_TOURNAMENT, PICK_ORDER, MIN_PICKS, encodePicks, decodePicks, roundsOf } from './draw.js';
import { standings, MIN_PLAYERS, MAX_PLAYERS, FINAL_MULT } from './scoring.js';
import { mountPlay } from './play/index.js';
import { cleanName, validName } from './text.js';

const app = $('#app');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
};
const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

let room = null, coord = null, view = { key: null }, raf = 0, codeFlaps = null;
const lobbyKnown = new Set();

// ───────────── petits outils d'affichage
const pcol = c => `var(--p${(Number(c) || 0) % 8})`;
const initial = name => (String(name || '?').trim()[0] || '?').toUpperCase();
const token = (name, c, cls = '') => h('span', { class: `tok ${cls}`, style: { '--pc': pcol(c) }, 'aria-hidden': 'true', text: initial(name) });
const signed = n => (n < 0 ? `−${-n}` : `+${n}`);
// Choix stable dans une liste (même texte pour tout le monde, à chaque rendu).
const pick = (list, seed) => { let x = 0; for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return list[x % list.length]; };
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
// Mises à jour sur place : un élément par clé, créé une fois, puis seulement modifié. Rien
// n'est reconstruit à chaque écriture de la base : les transitions glissent, rien ne clignote.
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
const setClass = (el, c) => { if (el.className !== c) el.className = c; };
function keyed(parent, keys, make) {
  parent.__k = parent.__k || new Map();
  const seen = new Set(keys);
  for (const [k, el] of parent.__k) if (!seen.has(k)) { el.remove(); parent.__k.delete(k); }
  return keys.map((k, i) => {
    let el = parent.__k.get(k);
    if (!el) { el = make(k); parent.__k.set(k, el); }
    if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null);
    return el;
  });
}

// ═════════════════════════════════════ accueil
const nameIn = $('#name'), codeIn = $('#code'), homeErr = $('#home-err');
nameIn.value = store.get('mp-name') || '';
const pre = new URLSearchParams(location.search).get('code');
if (pre) codeIn.value = normalizeCode(pre);

// Le jeu commente ton nom pendant que tu le tapes.
const QUIPS = ['Joli nom. Dommage qu’on va le voir en bas du classement.', 'Noté. La régie prépare déjà la lanterne rouge.', 'Court et efficace. Comme ta future série de victoires.', 'Très bien. On l’écrira en petit sur le podium.'];
const quip = () => { const n = cleanName(nameIn.value); $('#name-quip').textContent = n ? pick(QUIPS, n) : ''; };
nameIn.addEventListener('input', quip);
quip();

function readName() {
  const n = cleanName(nameIn.value);
  if (!validName(n)) { homeErr.textContent = 'Il te faut un nom de candidat (1 à 16 caractères).'; nameIn.focus(); return null; }
  store.set('mp-name', n);
  return n;
}
async function busy(btn, fn) {
  btn.disabled = true;
  homeErr.textContent = '';
  try { await fn(); } catch (e) { homeErr.textContent = (e && e.userMessage) || 'Impossible pour le moment. Réessaie.'; if (!(e && e.userMessage)) console.warn(e); }
  finally { btn.disabled = false; }
}
$('#btn-create').addEventListener('click', e => busy(e.currentTarget, async () => {
  const scene = $('#scene').checked;
  const name = scene ? 'Scène' : readName();
  if (!name) return;
  enter(await createRoom({ name, scene, roast: 'soft', crude: false, v: encodePicks(homePicks()) }));
}));
// Solo : un salon privé, lancé aussitôt (duel contre un score de référence).
let autoSolo = false;
$('#btn-solo').addEventListener('click', e => busy(e.currentTarget, async () => {
  const name = readName();
  if (!name) return;
  autoSolo = true;
  enter(await createRoom({ name, scene: false, roast: 'soft', crude: false, v: encodePicks(homePicks()) }));
}));
$('#btn-join').addEventListener('click', e => busy(e.currentTarget, async () => {
  const scene = $('#scene-join').checked;
  const name = scene ? 'Scène' : readName();
  if (!name) return;
  enter(await joinRoom(codeIn.value, { name, scene }));
}));
codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });
nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') (codeIn.value ? $('#btn-join') : $('#btn-create')).click(); });
codeIn.addEventListener('input', () => { const v = codeIn.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (v !== codeIn.value) codeIn.value = v; });

// ═════════════════════════════════════ entrée dans un salon
function enter(r) {
  if (room) room.dispose();
  room = r;
  lobbyKnown.clear();
  store.set('mp-room', r.code);
  history.replaceState(null, '', `?code=${encodeURIComponent(r.code)}${location.search.includes('emu') ? '&emu' : ''}${aiParam()}`);
  room.onClosed = msg => { leaveUI(); homeErr.textContent = msg; };
  room.on(() => schedule());
  schedule();
}
function aiParam() { const a = new URLSearchParams(location.search).get('ai'); return a ? `&ai=${encodeURIComponent(a)}` : ''; }
function leaveUI() {
  if (coord) { coord.stop(); coord = null; }
  if (view.destroy) view.destroy();
  view = { key: null };
  room = null;
  store.set('mp-room', null);
  history.replaceState(null, '', location.pathname + (location.search.includes('emu') ? '?emu' : ''));
  setScreen('home', 'home');
  delete app.dataset.step;
}
$('#btn-leave').addEventListener('click', async () => { const r = room; leaveUI(); if (r) await r.leave(); });

function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
setInterval(() => { if (room) { tickClock(); elect(); if (view.tick) view.tick(); } }, 200);

// Reprise après rechargement : si l'on est encore membre du salon, on y retourne
// directement (même manche, même état : tout vient de la base).
(async () => {
  const code = store.get('mp-room');
  if (!code) return;
  try {
    const r = await resumeRoom(code);
    if (r && !room) enter(r); else if (!r) store.set('mp-room', null);
  } catch (_) { store.set('mp-room', null); }
})();

// ═════════════════════════════════════ coordination
// Le coordinateur tourne ici si `coord` désigne cet onglet. S'il s'est éteint depuis
// 15 s, le premier membre en ligne (hôte d'abord, puis ordre des uid) prend la relève.
function elect() {
  if (!room || room.closed || !room.connected) return;
  if (room.isCoord) {
    if (!coord) { coord = new Coordinator(room); coord.start(); }
    if (autoSolo && room.s.phase === 'lobby' && room.isPlayer && room.online(room.me)) {
      autoSolo = false;
      coord.startTournament().catch(() => { autoSolo = false; });
    }
  } else if (coord) { coord.stop(); coord = null; }
  if (room.isCoord || room.takingOver) return;
  const grab = () => {
    room.takingOver = true;
    room.takeover().catch(() => {}).finally(() => { setTimeout(() => { if (room) room.takingOver = false; }, 3000); });
  };
  // L'hôte revenu reprend toujours la main (les transitions sont des transactions : sans risque).
  if (room.isHost && room.s.presence[room.me]) return grab();
  const c = room.s.coord;
  const now = serverNow();
  const t = c && room.s.presence[c];
  if (typeof t === 'number' && now - t < 15500) { room.coordGone = null; return; }
  // Présence absente (onDisconnect l'a effacée) : on laisse 15 s au coordinateur pour revenir.
  if (typeof t !== 'number') {
    if (!room.coordGone || room.coordGone.uid !== c) room.coordGone = { uid: c, since: now };
    if (now - room.coordGone.since < 15000) return;
  }
  const online = [...room.onlineSet(now)].sort((a, b) => (b === room.s.hostUid) - (a === room.s.hostUid) || (a < b ? -1 : 1));
  if (online[0] === room.me) grab();
}

// ═════════════════════════════════════ rendu
// Écran (accueil / salon / émission) et phase (la couleur du plateau). Un changement
// d'écran passe par la virgule d'antenne.
function setScreen(screen, phase) {
  if (app.dataset.screen !== screen) { wipe(); app.dataset.screen = screen; }
  setPhase(phase);
}
// La phase n'est réécrite que si elle change : sinon tout le plateau se recalcule pour rien.
function setPhase(phase) {
  if (app.dataset.phase === phase) return;
  app.dataset.phase = phase;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = { home: '#e5542a', lobby: '#f1e6cf', wait: '#e9b23a', verdict: '#1d6b66' }[phase] || '#2e1d14';
}
const PHASE = { intro: 'onair', count: 'onair', play: 'onair', judge: 'onair', vote: 'onair', reveal: 'verdict', board: 'verdict', final: 'final' };
const ONAIR = { intro: 'En direct', count: 'En direct', play: 'En direct', judge: 'Délibération', vote: 'Délibération', reveal: 'Verdict', board: 'Classement', final: 'Fin de l’émission' };

function render() {
  if (!room) return;
  const s = room.s;
  const screen = s.phase === 'lobby' || !s.match ? 'lobby' : 'show';
  $('#conn').hidden = room.connected !== false;
  if (screen === 'lobby') { setScreen('lobby', 'lobby'); app.dataset.step = 'lobby'; return renderLobby(); }
  renderShow();
}

// ───────────── salon
function renderLobby() {
  if (view.destroy) view.destroy();
  view = { key: 'lobby' };
  if (!codeFlaps) { codeFlaps = new Flaps(7); clear($('#code-flaps')).append(codeFlaps.el); }
  if (codeFlaps.text !== room.code.padEnd(7)) codeFlaps.set(room.code);
  const players = room.players();
  // Chaque candidat a son pupitre, son jeton à sa couleur. Un pupitre est créé une seule fois :
  // le nouveau venu fait son entrée, les autres ne bougent pas.
  const newest = players.length > 1 ? players[players.length - 1] : null;
  const byUid = Object.fromEntries(players.map(p => [p.uid, p]));
  keyed($('#roster'), players.length ? players.map(p => p.uid) : ['∅'], uid => {
    if (uid === '∅') return h('li', { class: 'off empty' }, h('span', { class: 'tok', text: '?' }), h('span', { class: 'desk' }, h('span', { class: 'nm', text: 'Personne' }), h('span', { class: 'tag', text: 'pour l’instant' })));
    const p = byUid[uid];
    const tagEl = h('span', { class: 'tag' });
    const el = h('li', {}, token(p.name, p.c), h('span', { class: 'desk' }, h('span', { class: 'nm', text: p.name }), tagEl));
    const stk = h('span', { class: 'sticker red', text: pick(['Proie facile', 'Vient perdre', 'Favori ?'], uid), hidden: true });
    el.append(stk);
    el.__p = { tagEl, stk };
    return el;
  }).forEach((el, k) => {
    if (!el.__p) return;
    const p = players[k];
    setClass(el, p.online ? '' : 'off');
    setText(el.__p.tagEl, p.uid === room.me ? (p.host ? 'toi · hôte' : 'toi') : p.host ? 'hôte' : p.online ? 'prêt à perdre' : 'parti se cacher');
    // Un seul autocollant : pour le dernier arrivé (jamais pour soi).
    el.__p.stk.hidden = !(newest && p.uid === newest.uid && p.uid !== room.me);
  });
  players.forEach(p => lobbyKnown.add(p.uid));
  renderPicks();
  const n = players.filter(p => p.online).length;
  $('#count').textContent = String(n);
  $('#count-s').textContent = n > 1 ? 's' : '';
  $('#count-min').textContent = n < MIN_PLAYERS ? 'seul : partie en solo' : `${MAX_PLAYERS} au plus`;
  $('#launch-quip').textContent = n < 2 ? 'Seul, tu ne peux perdre que contre toi-même. C’est déjà un début.' : n < 4 ? 'Les absents ont toujours tort. Ici, les présents aussi.' : 'Beau plateau. Il n’y aura qu’un gagnant, et beaucoup d’excuses.';
  const host = room.isHost;
  // Lancer : l'hôte, ou le joueur qui coordonne en son absence.
  const ctl = host || room.isCoord;
  $('#host-ctl').hidden = !ctl;
  $('#wait-host').hidden = ctl;
  if (ctl) {
    $('#btn-start').disabled = n < 1 || !room.isCoord;
    $('#btn-start').textContent = !room.isCoord ? 'Reprise de la coordination…' : n < MIN_PLAYERS ? 'Jouer en solo' : 'Lancer le tournoi';
  }
}
// Au programme : les épreuves que l'on veut jouer, une seule suffit. Jusqu'à cinq, on les joue
// toutes ; au-delà, cinq sont tirées au sort. Choisies dès l'accueil (mémorisées sur l'appareil),
// modifiables par l'hôte au salon ; rangées dans cfg.v (voir draw.js).
const PICKS_SHOWN = PICK_ORDER.filter(id => round(id)).sort((a, b) => Object.keys(FAMILIES).indexOf(round(a).family) - Object.keys(FAMILIES).indexOf(round(b).family));
function programmeNote(n) {
  if (n === 1) return 'Une seule épreuve : rien que celle-là.';
  if (n <= ROUNDS_PER_TOURNAMENT) return `${n} épreuves, toutes jouées, dans un ordre tiré au sort.`;
  return `${n === PICK_ORDER.length ? 'Toutes les épreuves' : `${n} épreuves`} : ${ROUNDS_PER_TOURNAMENT} seront tirées au sort.`;
}
// Dessine les cases dans `box` ; `toggle(id)` reçoit le clic (absent : lecture seule).
function drawPicks(box, chosen, toggle) {
  keyed(box, PICKS_SHOWN, id => {
    const def = round(id);
    const b = h('button', { type: 'button', class: 'pick' }, h('span', { class: 'pick-fam', text: FAMILIES[def.family].label }), h('span', { class: 'pick-name', text: def.title }));
    b.addEventListener('click', () => { if (b.__toggle) b.__toggle(id); });
    return b;
  }).forEach((b, k) => {
    const on = chosen.has(PICKS_SHOWN[k]);
    setClass(b, `pick${on ? ' on' : ''}`);
    b.disabled = !toggle;
    b.__toggle = toggle;
    b.setAttribute('aria-pressed', String(on));
  });
}
const flip = (set, id) => {
  const now = new Set(set);
  if (now.has(id)) { if (now.size <= MIN_PICKS) { toast('Garde au moins une épreuve.'); return null; } now.delete(id); } else now.add(id);
  return now;
};
// Accueil : le choix vit sur l'appareil jusqu'à la création du plateau.
const homePicks = () => decodePicks(store.get('mp-picks'));
function renderHomePicks() {
  const chosen = new Set(homePicks());
  drawPicks($('#home-picks'), chosen, id => { const now = flip(chosen, id); if (now) { store.set('mp-picks', String(encodePicks([...now]))); renderHomePicks(); } });
  $('#home-picks-note').textContent = programmeNote(chosen.size);
  $('#home-picks-all').hidden = chosen.size === PICK_ORDER.length;
}
$('#home-picks-all').addEventListener('click', () => { store.set('mp-picks', null); renderHomePicks(); });
renderHomePicks();
// Salon : l'hôte peut encore changer d'avis ; les autres voient la sélection.
function setPicks(ids) {
  if (!room || !room.isHost) return;
  const c = room.s.cfg || {};
  store.set('mp-picks', String(encodePicks(ids)));
  room.setCfg({ roast: c.roast || 'soft', crude: !!c.crude, v: encodePicks(ids) }).catch(() => toast('Réglage refusé. Réessaie.'));
}
function renderPicks() {
  const chosen = new Set(decodePicks((room.s.cfg || {}).v));
  const host = room.isHost;
  drawPicks($('#picks'), chosen, host ? id => { const now = flip(decodePicks((room.s.cfg || {}).v), id); if (now) setPicks([...now]); } : null);
  $('#picks-note').textContent = programmeNote(chosen.size) + (host ? '' : ' Choix de l’hôte.');
  $('#picks-all').hidden = !host || chosen.size === PICK_ORDER.length;
}
$('#picks-all').addEventListener('click', () => setPicks(PICK_ORDER));
$('#btn-start').addEventListener('click', async e => {
  if (!coord) return;
  e.currentTarget.disabled = true;
  try { await coord.startTournament(); } catch (err) { $('#lobby-err').textContent = err.userMessage || 'Lancement impossible.'; }
});
$('#room-code').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?code=${room.code}`;
  try { await navigator.clipboard.writeText(url); toast('Lien copié. Plus de retour possible.'); } catch (_) { toast(room.code); }
});

// ───────────── émission
function renderShow() {
  const s = room.s, m = s.match;
  app.dataset.step = m.step;
  renderPips(m);
  const key = `${m.tid}:${m.rk}:${m.step}`;
  if (view.key !== key) {
    if (view.destroy) view.destroy();
    // Les grandes séquences s'ouvrent sur une virgule d'antenne.
    if (m.step === 'final' && app.dataset.screen === 'show') wipe();
    setScreen('show', PHASE[m.step] || 'onair');
    const deck = clear($('#deck'));
    deck.scrollTop = 0;
    view = { key };
    const fn = VIEWS[m.step];
    if (fn) Object.assign(view, fn(deck, m) || {});
    if (room.isCoord && ['intro', 'reveal', 'board', 'vote'].includes(m.step)) deck.append(h('div', { class: 'coord-ctl' }, h('button', { class: 'btn btn-ghost', type: 'button', text: 'Passer', onclick: () => coord && coord.skip() })));
  }
  setPhase(view.phase || PHASE[m.step] || 'onair');
  $('#onair').textContent = view.onair || ONAIR[m.step] || 'En direct';
  $('#onair').classList.toggle('rec', app.dataset.phase === 'onair' && !view.onair);
  if (view.update) view.update(m);
}

function renderPips(m) {
  const keys = m.plan.map((p, k) => `${k}:${p.g}`);
  if (m.i >= ROUNDS_PER_TOURNAMENT) keys.push('tb');
  keyed($('#pips'), keys, k => h('li', { title: k === 'tb' ? 'Départage' : round(k.split(':')[1]).title, text: k === 'tb' ? '⚡' : String(Number(k.split(':')[0]) + 1) })).forEach((li, k) => {
    if (k >= roundsOf(m)) return setClass(li, 'pip now');
    setClass(li, `pip${k < m.i || (k === m.i && ['reveal', 'board', 'final'].includes(m.step)) ? ' done' : ''}${k === m.i && m.step !== 'final' ? ' now' : ''}${k === roundsOf(m) - 1 && k > 0 ? ' x2' : ''}`);
  });
}

// Ce qu'une manche peut rapporter : 10 au premier, 2 au dernier (2 à 8 joueurs), fanfaronnade ±3.
function pointsNote(last, roster) {
  const n = Object.keys(roster).length, k = last ? FINAL_MULT : 1;
  return `Points : ${10 * k} au 1er${n > 1 ? `, ${2 * k} au dernier` : ''}${last ? ' (manche ×2)' : ''}. Fanfaronnade : +3 si tu gagnes, −3 si tu finis en bas. Maximum sur la manche : ${10 * k + 3}.`;
}

// Mini-démonstration animée : trois temps (regarde / agis / gagne) qui s'allument à tour de rôle.
const DEMOS = {
  bac: ['🔤 Une lettre', '✍️ Un mot par case', '🏆 Le plus original'],
  calcul: ['➕ Une opération', '⚡ Réponds vite', '🏆 Meilleur total'],
  chemin: ['👀 Cases allumées', '👆 Reproduis l’ordre', '🏆 Niveau le plus haut'],
  coffre: ['🔢 Un nombre', '🙈 Il disparaît', '⌨️ Retape-le'],
  damier: ['💡 Cases allumées', '🧠 Retiens-les', '👆 Retrouve-les'],
  dejavu: ['📝 Un mot', '🤔 Déjà vu ?', '✅ Oui ou non'],
  dictee: ['📜 Une phrase', '⌨️ Recopie-la', '🏁 Premier arrivé'],
  gong: ['🔴 Panneau rouge', '🟢 Il passe au vert', '👆 Touche vite'],
  nuage: ['☁️ Un nuage de points', '🔢 Combien ?', '🎯 Écart minimal'],
  numeros: ['🔢 Repère les numéros', '🙈 Ils se cachent', '👆 Dans l’ordre'],
  prix: ['🛒 Un produit', '🏷️ Devine son prix', '🔴 L’étiquette tombe'],
  tir: ['🎯 20 cibles', '👆 Touche-les', '⏱️ Le plus rapide']
};
function demoOf(id) {
  const steps = DEMOS[id];
  if (!steps) return null;
  return h('div', { class: 'demo', 'aria-hidden': 'true' }, steps.map((t, k) => h('span', { class: 'demo-step', style: { animationDelay: `${k * 1.4}s` }, text: t })));
}

function tickClock() {
  const el = $('#clock-num'), box = $('#clock');
  const m = room && room.s.match;
  if (!m || app.dataset.screen !== 'show') return;
  const left = Math.ceil((m.end - serverNow()) / 1000);
  const timed = ['play', 'vote'].includes(m.step);
  box.classList.toggle('idle', !timed);
  box.classList.toggle('hot', timed && m.step === 'play' && left <= 10 && app.dataset.phase === 'onair');
  const txt = timed ? String(Math.max(0, left)) : '—';
  if (el.textContent !== txt) { el.textContent = txt; if (!reduced()) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); } }
}

const meIn = m => contenders(m).includes(room.me) && !!(m.roster || {})[room.me];
const tag = m => `${m.tid}:${m.rk}`;

const VIEWS = {
  // La carte d'épreuve est distribuée ; à droite, qui est prêt, et les deux décisions du joueur.
  intro(deck, m) {
    const tb = m.i >= ROUNDS_PER_TOURNAMENT;
    const def = round(gameOf(m));
    const p = paramsOf(m);
    const fam = FAMILIES[def.family];
    const last = m.i === roundsOf(m) - 1 && m.i > 0;
    const card = h('div', { class: 'ecard' },
      h('div', { class: 'top' }, h('span', { class: `fam ${last ? 'x2' : ''}`, text: tb ? 'Départage' : last ? `Finale · points ×${FINAL_MULT}` : fam.label }), h('span', { class: 'no', text: tb ? 'Ex æquo' : `${m.i + 1} / ${roundsOf(m)}` })),
      h('h1', { text: def.title }),
      tb ? h('p', { class: 'pts-note', text: `Égalité en tête entre ${Object.keys(m.tb || {}).map(u => namesOf(m)[u]).join(' et ')} : une manche décide, les autres regardent. Si l’égalité persiste, la victoire est partagée.` }) : demoOf(def.id),
      h('ol', { class: 'round-rules' }, (tb ? ['Seuls les ex æquo jouent.', def.id === 'gong' ? 'Trois signaux : le temps moyen le plus bas remporte le tournoi.' : '20 secondes de calcul : le meilleur total remporte le tournoi.'] : def.rules).map(t => h('li', { text: t }))),
      h('div', { class: 'meta' }, h('span', {}, 'Durée max ', h('b', { text: `${Math.round(def.playMs / 1000 * (tb ? 0.5 : 1))} s` })), h('span', {}, 'Égalité : ', h('b', { text: def.tieText(p) }))),
      h('p', { class: 'pts-note', text: tb ? 'Le gagnant du départage remporte le tournoi.' : pointsNote(last, m.roster) }),
      m.roster[GHOST] && def.ghost ? h('p', { class: 'ghost', text: `Score à battre : ${def.ghost(p).label}` }) : null,
      h('span', { class: 'sticker red', text: last ? 'Tout se joue ici' : pick(['Aucune excuse acceptée', 'Facile. En théorie.', 'Ça va mal se passer'], tag(m)) }));
    const readies = h('div', { class: 'readies' });
    const auto = h('p', { class: 'auto' });
    const side = h('div', { class: 'side' }, h('h3', { text: 'Sur le plateau' }), readies);
    if (meIn(m) && room.isPlayer) {
      const actions = h('div', { class: 'intro-actions' });
      if (!tb) {
        const label = h('b', { text: 'Fanfaronner' });
        const sub = h('small', { text: '« Trop facile. » +3 si tu gagnes, −3 si tu finis en bas. Tout le monde le verra.' });
        const boast = h('button', { class: 'btn boast-btn', type: 'button' }, h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', {}, label, sub));
        boast.addEventListener('click', () => { boast.disabled = true; room.boast(m.tid, m.rk).then(() => { boast.classList.add('on'); label.textContent = 'Tu as fanfaronné'; sub.textContent = 'C’est noté. Tout le plateau t’attend au tournant.'; }).catch(() => { boast.disabled = false; }); });
        actions.append(boast);
      }
      const ready = h('button', { class: 'btn ready-btn', type: 'button', text: 'Prêt' });
      ready.addEventListener('click', () => { ready.disabled = true; ready.textContent = 'Prêt ✓'; room.ready(tag(m)); });
      actions.append(ready);
      side.append(actions);
    }
    side.append(auto);
    deck.append(h('div', { class: 'intro' }, card, side));
    return {
      update(mm) {
        const names = namesOf(mm);
        keyed(readies, contenders(mm), u => h('span', {}, token(names[u], mm.roster[u].c), h('span', { class: 'nm', text: names[u] }))).forEach((el, k) => {
          const u = contenders(mm)[k];
          setClass(el, u === GHOST || room.s.ready[u] === tag(mm) ? 'on' : '');
          if (room.s.boast[u] && !el.querySelector('.sticker')) el.append(h('span', { class: 'sticker', text: '« Trop facile »' }));
        });
      },
      tick() { const left = Math.max(0, Math.ceil((m.end - serverNow()) / 1000)); auto.textContent = `Départ dans ${left} s, prêt ou pas.`; },
    };
  },

  count(deck, m) {
    const num = h('div', { class: 'count-num', text: '3' });
    deck.append(h('div', { class: 'count' }, num, h('p', { text: round(gameOf(m)).verb + ' !' })));
    let last = null;
    return { tick() { const n = Math.max(1, Math.ceil((m.end - serverNow()) / 1000)); if (n !== last) { last = n; num.textContent = String(n); num.style.animation = 'none'; void num.offsetWidth; num.style.animation = ''; } } };
  },

  // La manche : le jeu au centre, les rivaux en direct à droite.
  play(deck, m) {
    const mine = meIn(m) && room.isPlayer;
    if (!mine || room.s.subs[room.me]) return liveView(deck, m, mine ? 'Ta réponse est verrouillée. Les autres jouent encore…' : 'En direct du plateau', mine);
    const k = tag(m);
    const saveKey = `mp-partial:${room.code}:${k}`;
    const def = round(gameOf(m));
    const v = {};
    const stage = h('div', { class: 'pg-stage' }, h('p', { class: 'fine', text: 'Connexion à la manche…' }));
    const rivals = rivalsPanel(m);
    deck.append(h('div', { class: 'pgrid' }, h('div', { class: 'pg-main' }, h('div', { class: 'pg-title' }, h('h2', { text: def.title }), h('p', { text: def.rules[0] })), stage), rivals.el));
    const toLive = (mm, title) => { if (v.ctl) { v.ctl.destroy(); v.ctl = null; } clear(deck); v.live = liveView(deck, m, title, true); Object.assign(v, { phase: v.live.phase, onair: v.live.onair }); v.live.update(mm); schedule(); };
    // On ne lance la manche qu'une fois l'état relu : sinon un rechargement permettrait
    // de rejouer un contenu déjà vu (même graine).
    v.update = mm => {
      if (v.live) return v.live.update(mm);
      rivals.update(mm);
      if (!v.ctl) {
        if (!room.loaded.has('start') || !room.loaded.has('subs')) return;
        if (room.s.subs[room.me]) return toLive(mm, 'Ta réponse est verrouillée. Les autres jouent encore…');
        if (room.s.start[room.me]) {
          // Manche déjà commencée sur ce compte : elle s'arrête là, avec ce qui était joué.
          let saved = {};
          try { saved = JSON.parse(sessionStorage.getItem(saveKey) || '{}') || {}; } catch (_) {}
          room.submit(m.tid, m.rk, saved).catch(() => {});
          return toLive(mm, 'Tu as quitté la manche en cours : elle s’arrête à ce que tu avais joué.');
        }
        room.markStart(m.tid, m.rk).catch(() => {});   // « commencée », écriture unique (règles)
        room.progress(k, 0);
        v.ctl = mountPlay(stage, {
          gameId: gameOf(m), params: paramsOf(m), startAt: m.at, endAt: m.end, now: serverNow,
          send: payload => { try { sessionStorage.removeItem(saveKey); } catch (_) {} return room.submit(m.tid, m.rk, payload); },
          save: payload => { try { sessionStorage.setItem(saveKey, JSON.stringify(payload)); } catch (_) {} },
          progress: (x, sub) => room.progress(sub === undefined ? k : `${k}.${sub}`, x),
          // L'Étiquette : le prix que chaque autre joueur a écrit pour le produit `idx` (null = rien).
          peers: idx => contenders(mm).filter(u => u !== room.me && u !== GHOST).map(u => {
            const pr = room.s.prog[u], names = namesOf(mm);
            const cents = pr && pr.k.startsWith(`${k}.${idx}`) ? parseInt(pr.k.slice(`${k}.${idx}`.length), 36) : 0;
            return { name: names[u], cents: cents > 0 ? cents : null };
          }),
          finished: () => room.ready(`${k}:f`),
        });
        return;
      }
      // Petit Bac : tous les présents ont fini -> chacun envoie tout de suite.
      if (gameOf(mm) === 'bac' && !v.ctl.sent) {
        const online = contenders(mm).filter(u => room.online(u));
        if (online.length && online.every(u => room.s.ready[u] === `${k}:f`)) v.ctl.submitNow();
      }
      // Réponse enregistrée : on regarde la course des autres.
      if (room.s.subs[room.me]) toLive(mm, 'Ta réponse est verrouillée. Les autres jouent encore…');
    };
    v.destroy = () => v.ctl && v.ctl.destroy();
    return v;
  },

  judge(deck) {
    deck.append(h('div', { class: 'judging' }, h('div', { class: 'stamp', text: 'La régie délibère' }), h('div', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('p', { class: 'fine', text: 'Lettres et doublons sont vérifiés. Le correcteur IA juge les catégories ; s’il tarde, vous serez le jury.' })));
  },

  vote(deck, m) {
    const box = h('div', { class: 'vote-list' });
    deck.append(box);
    let drawn = false;
    const done = h('button', { class: 'btn btn-main btn-xl', type: 'button', text: 'J’ai voté' });
    done.addEventListener('click', () => { done.disabled = true; done.textContent = 'Vote enregistré ✓'; room.ready(`${tag(m)}:v`); });
    function draw(det) {
      drawn = true;
      clear(box);
      const jury = det.mode === 'jury';
      const duel = Object.keys(m.roster).length === 2;
      box.append(h('h2', { class: 'h2', text: jury ? 'Vous êtes le jury' : 'Réponses discutables' }),
        h('p', { class: 'fine', text: jury
          ? (duel ? 'Le correcteur IA n’a pas répondu à temps : en duel, chacun juge les réponses de l’autre. Refuse ce qui n’existe pas.' : 'Le correcteur IA n’a pas répondu à temps : chaque réponse est acceptée, sauf si au moins deux autres joueurs, et la majorité, la refusent.')
          : (duel ? 'Le correcteur IA hésite sur ces réponses : en duel, l’autre joueur tranche.' : 'Le correcteur IA hésite sur ces réponses. Elles sont acceptées, sauf si au moins deux autres joueurs, et la majorité, les refusent.') }));
      if (!det.items.length) box.append(h('p', { text: 'Rien à juger.' }));
      det.items.forEach((it, k) => {
        const own = (it.by || []).includes(room.me) || !meIn(m) || !room.isPlayer;
        const yes = h('button', { class: 'yes', type: 'button', 'aria-pressed': 'true', text: 'Accepter' });
        const no = h('button', { class: 'no', type: 'button', 'aria-pressed': 'false', text: 'Refuser' });
        const set = refuse => { yes.setAttribute('aria-pressed', String(!refuse)); no.setAttribute('aria-pressed', String(refuse)); room.vote(m.tid, m.rk, it.g, refuse); };
        yes.addEventListener('click', () => set(false));
        no.addEventListener('click', () => set(true));
        box.append(h('div', { class: `vote-item ${own ? 'mine' : ''}`, style: { animationDelay: `${k * 50}ms` } },
          h('div', {}, h('div', { class: 'ans', text: it.t }), h('small', { text: `${it.cat}${it.why ? ' — ' + it.why : ''}${own && (it.by || []).includes(room.me) ? ' · ta réponse' : ''}` })),
          own ? h('span', { class: 'fine', text: (it.by || []).includes(room.me) ? 'pas de vote' : '' }) : h('div', { class: 'tog' }, yes, no)));
      });
      if (meIn(m) && room.isPlayer) box.append(done);
    }
    return { update(mm) { if (drawn) return; const det = parse((mm.det || {})[mm.i] || ''); if (det && det.kind === 'vote') draw(det); else if (!box.firstChild) box.append(h('p', { class: 'fine', text: 'Préparation du vote…' })); } };
  },

  // Le verdict de la manche : les places tombent du dernier au premier, puis le parcours.
  reveal(deck, m) {
    if (m.i >= ROUNDS_PER_TOURNAMENT) return tiebreakView(deck, m);
    const res = (m.res || {})[m.i];
    const def = round(gameOf(m));
    const names = namesOf(m);
    const wrap = h('div', { class: 'verdict-wrap' }, h('div', { class: 'v-head' }, h('h2', { text: def.title }), h('small', { text: `Manche ${m.i + 1} sur ${roundsOf(m)} · le verdict de la régie` })));
    deck.append(wrap);
    if (!res) { wrap.append(h('p', { class: 'fine', text: 'La régie recompte…' })); return {}; }
    const rows = Object.entries(res).map(([uid, r]) => ({ uid, ...r })).sort((a, b) => a.rank - b.rank || (a.uid < b.uid ? -1 : 1));
    // La lanterne rouge : le dernier classé (présent), s'il n'est pas aussi premier.
    const worst = Math.max(...rows.filter(r => !r.absent).map(r => r.rank));
    const list = h('div', { class: 'results' });
    const els = rows.map(r => {
      const lantern = !r.absent && r.rank === worst && worst > 1;
      const who = mInfo(m, r.uid, names);
      return h('div', { class: `res-row ${r.rank === 1 && !r.absent ? 'first' : ''} ${r.absent ? 'absent' : ''}` },
        h('span', { class: 'rk', text: r.absent ? '—' : String(r.rank) }),
        token(who.name, who.c),
        h('span', { class: 'who' }, h('b', { text: who.name }),
          r.boast ? h('span', { class: `bst ${r.boast > 0 ? 'up' : 'down'}`, text: `${signed(r.boast)} fanfaronnade` }) : null,
          lantern ? h('span', { class: 'sticker red', text: 'Lanterne rouge' }) : null),
        h('span', { class: 'lab', text: r.label }),
        h('span', { class: 'pts', text: signed(r.pts) }));
    });
    els.forEach(e => list.append(e));
    // L'Étiquette : le tableau des estimations d'abord (sinon il est hors de l'écran à 6-8 joueurs).
    if (gameOf(m) === 'prix') wrap.append(prixTable(m, names));
    wrap.append(list);
    if (rows.some(r => r.tied)) wrap.append(h('p', { class: 'tied-note', text: 'Ex æquo : points partagés (moyenne des places).' }));
    if (m.i === roundsOf(m) - 1 && m.i > 0) wrap.append(h('p', { class: 'tied-note', text: `Manche décisive : points de place ×${FINAL_MULT}.` }));
    if (gameOf(m) === 'bac') wrap.append(bacTable(m, names));
    // Du dernier au premier ; le vainqueur arrive détaché, après un court temps d'arrêt.
    const order = els.slice().reverse();
    const step = reduced() ? 0 : Math.min(640, 2800 / order.length);
    order.forEach((e, k) => {
      const winner = k === order.length - 1 && order.length > 1;
      e.style.animationDelay = `${Math.round(500 + k * step + (winner ? 600 : 0))}ms`;
      e.classList.add('in');
    });
    return {};
  },

  // Le classement général : les jetons avancent sur le parcours.
  board(deck, m) {
    const roster = Object.keys(m.roster);
    const names = namesOf(m);
    const prev = standings(roster, Object.fromEntries(Object.entries(m.res || {}).filter(([k]) => Number(k) < m.i)), roundsOf(m));
    const cur = standings(roster, m.res || {}, roundsOf(m));
    const left = roundsOf(m) - 1 - m.i;
    const wrap = h('div', { class: 'verdict-wrap' }, h('div', { class: 'v-head' }, h('h2', { text: 'Classement' }), h('small', { text: left > 0 ? `${plural(left, 'manche')} à jouer${left === 1 ? ' · la dernière compte double' : ''}` : 'Fin du tournoi' })));
    deck.append(wrap);
    const course = parcours(m, prev, cur, names);
    wrap.append(course.el);
    const table = h('div', { class: 'standings' });
    cur.forEach((r, k) => {
      const was = (prev.find(p => p.uid === r.uid) || r).place;
      const d = was - r.place;
      const who = mInfo(m, r.uid, names);
      table.append(h('div', { class: `brow rise ${r.place === 1 ? 'lead' : ''}`, style: { '--d': String(k), '--base': '200ms' } },
        h('span', { class: 'rk', text: String(r.place) }), token(who.name, who.c, 'sm'),
        h('span', { class: 'who' }, h('b', { text: who.name })),
        h('span', { class: `mv ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`, text: m.i > 0 && d ? `${d > 0 ? '▲' : '▼'}${Math.abs(d)}` : '' }),
        h('span', { class: 'tt', text: String(r.total) })));
    });
    wrap.append(table);
    const foot = h('div', { class: 'v-foot' });
    const next = m.plan[m.i + 1];
    foot.append(h('div', { class: 'nx' }, left > 0 ? 'Prochaine épreuve :' : 'Et maintenant :', h('b', { text: left > 0 ? `${FAMILIES[round(next.g).family].label} · ???` : 'le podium' })));
    const count = h('span');
    const go = h('div', { class: 'go' }, count);
    // « Suite » : quand tous les joueurs l'ont touché, on enchaîne sans attendre le chrono.
    if (meIn(m) && room.isPlayer) {
      const btn = h('button', { class: 'btn btn-main next-btn', type: 'button', text: left > 0 ? 'Suite' : 'Voir le podium' });
      btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = 'On attend les autres…'; room.ready(`${tag(m)}:n`); });
      go.append(btn);
    }
    foot.append(go);
    wrap.append(foot);
    return {
      destroy: course.destroy,
      update(mm) {
        const who = contenders(mm).filter(u => u !== GHOST);
        const n = who.filter(u => room.s.ready[u] === `${tag(mm)}:n`).length;
        count.textContent = n ? `${n} sur ${who.length} ${n > 1 ? 'sont prêts' : 'est prêt'}` : '';
      },
    };
  },

  // La finale : la 3e place, la 2e, un temps d'arrêt, puis le vainqueur. Un toucher termine.
  final(deck, m) {
    const sum = finalSummary(m);
    const { rows, names } = sum;
    const shared = rows.filter(r => r.place === 1).length > 1;
    const lastUid = rows[rows.length - 1].uid;
    const podium = h('div', { class: 'podium', title: 'Toucher pour tout révéler' });
    const slot = (r, cls) => {
      if (!r) return h('div');
      const who = mInfo(m, r.uid, names);
      const stk = cls === 'p2' ? h('span', { class: 'sticker cream', text: 'Si près…' }) : cls === 'p3' && r.uid === lastUid ? h('span', { class: 'sticker red', text: 'Lanterne rouge' }) : null;
      return h('div', { class: `pod ${cls}` }, token(who.name, who.c), h('div', { class: 'nm', text: who.name }), h('div', { class: 'tt', text: `${r.total} pts` }), h('div', { class: 'step', text: cls === 'p1' ? '?' : String(r.place) }), stk);
    };
    const pods = { p1: slot(rows[0], 'p1'), p2: slot(rows[1], 'p2'), p3: slot(rows[2], 'p3') };
    pods.p1.classList.add('tease');
    podium.append(pods.p2, pods.p1, pods.p3);
    const kick = h('span', { class: 'f-kick', text: 'Fin de l’émission' });
    const title = h('h2', { class: 'final-title wait', text: 'Et le vainqueur est…' });
    const verdict = h('span', { class: 'verdict', 'aria-hidden': 'true', text: shared ? 'Ex æquo' : 'Sans appel' });
    const winnerText = shared ? 'Victoire partagée' : `${names[rows[0].uid]} gagne`;

    const table = h('div', { class: 'board' });
    rows.forEach(r => table.append(h('div', { class: `brow ${r.place === 1 ? 'lead' : ''}` }, h('span', { class: 'rk', text: String(r.place) }), chip(m.roster[r.uid].c), h('span', { class: 'who' }, h('b', { text: names[r.uid] })), h('span', { class: 'lab', text: `${r.wins} manche${r.wins > 1 ? 's' : ''} gagnée${r.wins > 1 ? 's' : ''}` }), h('b', { text: String(r.total) }))));
    const credits = h('div', { class: 'credits' }, h('h3', { text: 'Classement final' }), table);
    if (sum.tiebreak && sum.tiebreak.order) credits.append(h('p', { class: 'fine', style: { padding: '0 18px 10px' }, text: 'Égalité départagée au Gong.' }));
    if (sum.awards.length) {
      const aw = h('div', { class: 'awards' });
      sum.awards.forEach(a => aw.append(h('div', { class: 'award' }, h('h4', { text: a.title }), h('b', { text: a.who }), h('span', { text: a.detail }))));
      credits.append(h('h3', { text: 'Au générique ce soir' }), aw);
    }
    const rest = h('div', { class: 'final-rest' }, credits);
    const actions = h('div', { class: 'final-actions' });
    if (room.isCoord) {
      const again = h('button', { class: 'btn btn-main', type: 'button', text: 'Revanche' });
      const lobby = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Retour au salon' });
      again.addEventListener('click', async () => { again.disabled = true; try { await coord.startTournament({ rematch: true }); } catch (e) { toast(e.userMessage || 'Revanche impossible'); again.disabled = false; } });
      lobby.addEventListener('click', () => coord.backToLobby());
      actions.append(again, lobby);
    } else actions.append(h('p', { class: 'fine', text: 'L’hôte peut lancer la revanche : mêmes joueurs, nouvelles épreuves, mêmes excuses.' }));
    // Partir sans pénalité ni message culpabilisant : le tournoi est terminé.
    const quit = h('button', { class: 'btn btn-ghost', type: 'button', text: room.isHost ? 'Fermer le salon' : 'Quitter' });
    quit.addEventListener('click', async () => { const r = room; leaveUI(); if (r) await r.leave(); });
    actions.append(quit);
    deck.append(h('div', { class: 'final' },
      h('div', { class: 'f-main' }, kick, title, verdict, podium),
      h('div', { class: 'f-side' }, rest, actions)));
    rest.append(h('p', { class: 'seed-note', text: `Tirage ${m.seed} · ${m.plan.map(p => round(p.g).title).join(' · ')}` }));

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    let over = false;
    const up = k => pods[k].classList && pods[k].classList.add('up');
    const crown = () => {
      up('p1');
      const step = pods.p1.querySelector('.step');
      if (step) step.textContent = '1';
      kick.textContent = shared ? 'Fin de l’émission' : `Vainqueur de l’émission · ${rows[0].total} points`;
      title.classList.remove('wait'); title.textContent = winnerText; title.classList.add('won');
    };
    actions.classList.add('wait');
    const release = () => actions.classList.remove('wait');
    const crowning = () => {
      if (over) return;
      over = true;
      timers.forEach(clearTimeout);
      ['p3', 'p2'].forEach(up); crown();
      verdict.classList.add('on'); rest.classList.add('on'); release();
    };
    if (reduced()) crowning();
    else {
      at(1100, () => up('p3'));
      at(2300, () => up('p2'));
      at(3800, () => { crown(); confetti(pcol((m.roster[rows[0].uid] || {}).c)); release(); });
      at(4600, () => verdict.classList.add('on'));
      at(5200, () => { over = true; rest.classList.add('on'); });
    }
    podium.addEventListener('click', crowning);
    return { destroy: () => { timers.forEach(clearTimeout); release(); } };
  },
};

// Nom et couleur d'un candidat dans le tournoi.
function mInfo(m, uid, names) { return { name: names[uid], c: (m.roster[uid] || {}).c }; }

// ───────────── progression en direct
// Dans l'unité de la manche ; barre relative à la borne (ou au meilleur).
const PROG = {
  gong: (v, p) => [`${v}/${p.trials} signaux`, v / p.trials],
  tir: v => [`${v}/20 cibles`, v / 20],
  dictee: (v, p) => [`${Math.round(100 * v / p.phrase.length)} % tapé`, v / p.phrase.length],
  chemin: v => [`niveau ${v}`, null], damier: v => [`niveau ${v}`, null],
  numeros: v => [`${v} numéros`, null], coffre: v => [`${v} chiffres`, null],
  dejavu: v => [`${v} bonnes`, null], calcul: v => [`${v} pt${Math.abs(v) > 1 ? 's' : ''}`, null],
  nuage: v => [`${v}/3 nuages`, v / 3], bac: v => [`${v}/4 cases`, v / 4],
  prix: v => [`${v}/5 produits`, v / 5],
};
// État de chaque candidat : valeur, part de la borne (0 à 1), texte, fini ou non.
function race(mm, g, p) {
  const vals = contenders(mm).map(u => { const pr = room.s.prog[u]; return pr && pr.k.split('.')[0] === tag(mm) ? pr.v : null; });
  const best = Math.max(1, ...vals.filter(v => v !== null));
  return contenders(mm).map((u, k) => {
    if (u === GHOST) return { u, ghost: true, txt: round(g).ghost(p).label, frac: 1, done: true };
    const v = vals[k];
    const [txt, frac] = v === null ? ['', 0] : PROG[g](v, p);
    return { u, v, txt, frac: Math.max(0, Math.min(1, frac === null ? v / best : frac)), done: !!room.s.subs[u], on: room.online(u) };
  });
}

// Les rivaux pendant ta manche : un jeton, une valeur, une rampe de lampes.
function rivalsPanel(m) {
  const g = gameOf(m), p = paramsOf(m), names = namesOf(m);
  const list = h('div', { class: 'rivals-list' });
  const el = h('aside', { class: 'rivals', 'aria-label': 'Les autres candidats' }, h('h3', { text: 'Pendant ce temps' }), list);
  let myBest = 0;
  return {
    el,
    update(mm) {
      const rows = race(mm, g, p);
      const mine = rows.find(r => r.u === room.me);
      myBest = mine && mine.v !== null && mine.v !== undefined ? mine.v : myBest;
      const others = rows.filter(r => r.u !== room.me);
      keyed(list, others.map(r => r.u), u => {
        const val = h('small'), lamps = h('div', { class: 'lamps', 'aria-hidden': 'true' }, Array.from({ length: 10 }, () => h('i'))), stk = h('span', { class: 'sticker', text: 'Te dépasse', hidden: true });
        const el = h('div', { class: 'rv', style: { '--pc': pcol(mm.roster[u].c) } }, token(names[u], mm.roster[u].c, 'sm'), h('div', {}, h('div', { class: 'nm' }, h('span', { text: names[u] }), val), lamps), stk);
        el.__p = { val, lamps: [...lamps.children], stk };
        return el;
      }).forEach((el, k) => {
        const r = others[k], x = el.__p;
        const lit = Math.round(r.frac * 10);
        setClass(el, `rv${r.done ? ' fin' : ''}`);
        setText(x.val, r.ghost ? `à battre · ${r.txt}` : r.done ? 'fini' : r.on ? (r.v === null ? '…' : String(r.v)) : 'absent');
        x.lamps.forEach((l, i) => setClass(l, i < lit ? 'on' : ''));
        x.stk.hidden = !(!r.ghost && !r.done && r.v !== null && r.v > 0 && r.v > myBest);
      });
    },
  };
}

// Fausses publicités de Canal 7, pendant que les autres finissent.
const ADS = [
  { l: 'R', b: 'Assurances Rebond', t: 'Vous avez perdu ? Nous aussi, souvent. Rebond rembourse la honte, pas les points.', s: ['Perdre,', 'ça s’assure.'], f: 'Contrat soumis à conditions. La lanterne rouge n’est pas couverte.', c: 'var(--teal)' },
  { l: 'E', b: 'Pastilles Excuses', t: 'Une pastille, et l’excuse vient toute seule. Goût menthe ou mauvaise foi.', s: ['C’était', 'le réseau.'], f: 'Ne pas dépasser trois excuses par manche.', c: 'var(--red)' },
  { l: 'B', b: 'Lessive Blanchie', t: 'Elle lave tout, même les réputations après une cinquième place.', s: ['Blanchi,', 'pas vainqueur.'], f: 'Sur tissus délicats et ego fragiles.', c: 'var(--p1)' },
  { l: 'P', b: 'Café du Podium', t: 'Le café de ceux qui regardent le podium d’en bas. Corsé, amer, familier.', s: ['Corsé,', 'comme ta défaite.'], f: 'À consommer avec modération et lucidité.', c: 'var(--brown-3)' },
];
const adCard = seed => {
  const a = ADS[Math.abs(seed) % ADS.length] || ADS[0];
  return h('div', { class: 'ad', style: { '--ac': a.c } },
    h('div', { class: 'ad-tag' }, h('span', { text: 'Page de publicité' }), h('span', { text: 'Canal 7' })),
    h('div', { class: 'ad-body' }, h('div', { class: 'brand' }, h('span', { class: 'logo-c', text: a.l }), h('b', { text: a.b })), h('p', { text: a.t })),
    h('div', { class: 'slogan' }, a.s[0], h('br'), h('span', { text: a.s[1] })),
    h('div', { class: 'small', text: a.f }));
};

// Ta manche est finie (ou tu regardes) : la course des autres, et la pub.
function liveView(deck, m, title, mine = false) {
  const g = gameOf(m), p = paramsOf(m), names = namesOf(m);
  const head = h('h2', { text: round(g).title });
  const list = h('div', { class: 'live-list' });
  const wrap = h('div', { class: 'live' }, h('div', { class: 'live-head' }, head, h('p', { class: 'fine', text: title }), list), adCard(Number(m.i) || 0));
  deck.append(wrap);
  return {
    phase: mine ? 'wait' : 'onair',
    onair: mine ? 'Ta manche est finie' : null,
    update(mm) {
      const rows = race(mm, g, p);
      const me = rows.find(r => r.u === room.me);
      if (mine && me && me.txt) head.textContent = `${me.txt} !`;
      keyed(list, rows.map(r => r.u), u => {
        const tok = h('span', { class: 'tok', style: { '--pc': pcol(mm.roster[u].c), left: '5%' }, text: initial(names[u]) });
        const status = h('b'), detail = h('small');
        const el = h('div', { class: 'lane' }, h('div', { class: 'road' }, tok), h('div', { class: 'st' }, `${names[u]} · `, status, detail));
        el.__p = { tok, status, detail };
        return el;
      }).forEach((el, k) => {
        const r = rows[k], x = el.__p;
        setClass(el, `lane${r.done ? ' fin' : ''}`);
        // Le jeton glisse (transition CSS) : seule sa position change.
        const left = `${(5 + r.frac * 78).toFixed(1)}%`;
        if (x.tok.style.left !== left) x.tok.style.left = left;
        setText(x.status, r.ghost ? 'score à battre' : r.done ? 'fini' : r.on ? 'joue' : 'déconnecté');
        setText(x.detail, r.txt || (r.done ? '' : '…'));
      });
    },
  };
}

// ───────────── le parcours (classement général)
function parcours(m, prev, cur, names) {
  const top = Math.max(...cur.map(r => r.total), 1);
  const scale = Math.max(60, Math.ceil(top * 1.15 / 15) * 15);
  const at = t => `${(Math.max(0, t) / scale * 100).toFixed(2)}%`;
  const path = h('div', { class: 'path' }, h('div', { class: 'line' }), [0, 1, 2, 3].map(q => h('span', { class: 'mark', style: { left: `${q * 25}%` }, text: String(Math.round(scale * q / 4)) })));
  const toks = {};
  // Ordre d'empilement : le meneur au-dessus.
  prev.forEach(r => {
    const c = cur.find(x => x.uid === r.uid);
    const d = r.place - c.place;
    const label = `${c.total}${m.i > 0 && d ? ` · ${d > 0 ? '▲' : '▼'}${Math.abs(d)}` : ''}${d >= 2 ? ' Remontada' : ''}`;
    const t = h('span', { class: `tok ${c.place === 1 ? 'lead' : ''}`, style: { '--pc': pcol(m.roster[r.uid].c), left: at(r.total) }, text: initial(names[r.uid]) }, h('span', { class: 'tag', text: label }));
    toks[r.uid] = t;
    path.append(t);
  });
  const el = h('div', { class: 'course rise', style: { '--base': '100ms' } }, h('h3', {}, h('span', { text: 'Le parcours · classement général' }), h('span', { text: `arrivée à ${scale}` })), path);
  const timer = setTimeout(() => { cur.forEach(r => { toks[r.uid].style.left = at(r.total); }); path.classList.add('moved'); }, reduced() ? 0 : 900);
  return { el, destroy: () => clearTimeout(timer) };
}

function tiebreakView(deck, m) {
  const det = parse((m.det || {})[ROUNDS_PER_TOURNAMENT] || '') || {};
  const names = namesOf(m);
  const wrap = h('div', { class: 'verdict-wrap' }, h('div', { class: 'v-head' }, h('h2', { text: `Départage : ${round(gameOf(m)).title}` })));
  const list = h('div', { class: 'results' });
  Object.entries(det.order || {}).sort((a, b) => a[1] - b[1]).forEach(([u, pos]) => {
    const who = mInfo(m, u, names);
    list.append(h('div', { class: `res-row in ${pos === 0 ? 'first' : ''}` }, h('span', { class: 'rk', text: String(pos + 1) }), token(who.name, who.c), h('span', { class: 'who' }, h('b', { text: who.name })), h('span', { class: 'lab', text: (det.labels || {})[u] || '' }), h('span')));
  });
  wrap.append(list);
  deck.append(wrap);
}

// L'Étiquette : produit par produit, le vrai prix et l'estimation de chacun ; le plus proche en avant.
function prixTable(m, names) {
  const p = paramsOf(m);
  const who = contenders(m).filter(u => u !== GHOST && room.s.subs[u]);
  const guesses = Object.fromEntries(who.map(u => { const d = parse((room.s.subs[u] || {}).d) || {}; return [u, Array.isArray(d.a) ? d.a.map(Number) : []]; }));
  const eur = n => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const t = h('table', { class: 'prix-table' });
  t.append(h('tr', {}, h('th', { text: 'Produit' }), h('th', { text: 'Prix' }), who.map(u => h('th', { text: names[u] }))));
  p.items.forEach((it, k) => {
    const errs = who.map(u => { const g = guesses[u][k]; return g > 0 ? Math.abs(Math.log(g / it.price)) : Infinity; });
    const best = Math.min(...errs);
    t.append(h('tr', {},
      h('td', { class: 'pt-item' }, h('img', { src: `img/prix/${it.code}.jpg`, alt: '', loading: 'lazy', onerror: e => e.currentTarget.remove() }), h('span', {}, h('b', { text: it.name }), h('small', { text: `${it.brand} · ${it.qty}` }), h('small', { class: 'pt-src', text: `Source : ${it.source}` }))),
      h('td', { class: 'pt-price' }, h('span', { class: 'tagp', text: eur(it.price) })),
      who.map((u, j) => { const g = guesses[u][k]; return h('td', { class: `pt-guess ${errs[j] === best && best < Infinity ? 'best' : ''}`, text: g > 0 ? eur(g) : '—' }); })));
  });
  return h('div', { class: 'bac-grid' }, t, h('p', { class: 'fine', text: 'Produits et prix : Open Food Facts et Open Prices (données libres), médiane des relevés en magasin. Lots pour rire : prix neufs approximatifs.' }));
}

function bacTable(m, names) {
  const det = parse((m.det || {})[m.i] || '') || {};
  if (det.kind !== 'bac') return h('div');
  const t = h('table', { class: 'bac-table' });
  t.append(h('tr', {}, h('th', { text: `Lettre ${det.letter}` }), det.cats.map(c => h('th', { text: c }))));
  const ST = { unique: 'unique', shared: 'partagée', invalid: 'refusée', letter: 'mauvaise lettre', empty: '' };
  Object.entries(det.cells).forEach(([u, cells]) => {
    t.append(h('tr', {}, h('td', {}, h('b', { text: names[u] })), cells.map(c => h('td', { class: c.st }, h('span', { class: 'p', text: c.p ? `+${c.p}` : '0' }), c.t || '—', c.st !== 'empty' ? h('small', { text: [ST[c.st], c.w].filter(Boolean).join(' · ') }) : null))));
  });
  const mode = String(det.mode || '');
  return h('div', { class: 'bac-grid' }, t,
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--ok)' } }), 'unique 10'), h('span', {}, h('i', { style: { background: 'var(--mustard)' } }), 'partagée 5'), h('span', {}, h('i', { style: { background: 'var(--red)' } }), 'refusée 0'),
      h('span', { text: mode.startsWith('ia:') ? `Correction : IA (${mode.slice(3)}) + vote des joueurs sur les cas douteux` : 'Correction : vote des joueurs (IA indisponible)' })));
}

// ═════════════════════════════════════ menu de la partie
// Reprendre, règles de la manche, réglages (animations réduites, plein écran), quitter.
// La confirmation se fait dans le menu (jamais de fenêtre du navigateur).
const menu = $('#menu'), menuBack = $('#menu-back');
const calmPref = () => store.get('mp-calm') === '1';
document.documentElement.classList.toggle('calm', calmPref());
function openMenu() {
  const m = room && room.s.match;
  const box = clear($('#menu-round'));
  if (m && m.step !== 'final') {
    const def = round(gameOf(m));
    box.append(h('h3', { text: m.i >= ROUNDS_PER_TOURNAMENT ? 'Départage' : `Manche ${m.i + 1} sur ${roundsOf(m)}` }), h('p', { class: 'sheet-title', text: def.title }), h('ol', { class: 'round-rules' }, def.rules.map(t => h('li', { text: t }))));
  } else box.append(h('h3', { text: 'Mauvais Perdants' }), h('p', { class: 'fine', text: 'Les épreuves que vous voulez, un seul gagnant.' }));
  $('#opt-calm').checked = calmPref();
  $('#opt-full').checked = !!document.fullscreenElement;
  $('#opt-full').closest('label').hidden = !document.documentElement.requestFullscreen;
  $('#menu-stop').hidden = !(room && room.isCoord && m && m.step !== 'final');
  $('#menu-confirm').hidden = true;
  menu.hidden = false; menuBack.hidden = false;
  requestAnimationFrame(() => { menu.classList.add('open'); menuBack.classList.add('open'); });
  $('#menu-resume').focus();
}
function closeMenu() {
  if (menu.hidden) return;
  menu.classList.remove('open'); menuBack.classList.remove('open');
  setTimeout(() => { menu.hidden = true; menuBack.hidden = true; }, reduced() ? 0 : 420);
  $('#btn-menu').focus();
}
$('#btn-menu').addEventListener('click', openMenu);
$('#menu-close').addEventListener('click', closeMenu);
$('#menu-resume').addEventListener('click', closeMenu);
menuBack.addEventListener('click', closeMenu);
addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });
$('#opt-calm').addEventListener('change', e => { store.set('mp-calm', e.target.checked ? '1' : null); document.documentElement.classList.toggle('calm', e.target.checked); });
$('#opt-full').addEventListener('change', e => { (e.target.checked ? document.documentElement.requestFullscreen() : document.exitFullscreen()).catch(() => { e.target.checked = !!document.fullscreenElement; }); });
let menuAction = null;
const ask = (text, yes, fn) => { $('#menu-confirm-text').textContent = text; $('#menu-confirm-yes').textContent = yes; menuAction = fn; $('#menu-confirm').hidden = false; $('#menu-confirm-no').focus(); };
$('#menu-quit').addEventListener('click', () => ask('Tu quittes l’émission : tu seras compté absent pour la suite. La lanterne rouge te tend les bras.', 'Oui, quitter', async () => { closeMenu(); const r = room; leaveUI(); if (r) await r.leave(); }));
$('#menu-stop').addEventListener('click', () => ask('Le tournoi s’arrête pour tout le monde et vous revenez au salon. Les points en cours sont perdus.', 'Arrêter le tournoi', () => { closeMenu(); if (coord) coord.backToLobby(); }));
$('#menu-confirm-no').addEventListener('click', () => { $('#menu-confirm').hidden = true; menuAction = null; });
$('#menu-confirm-yes').addEventListener('click', () => { const f = menuAction; menuAction = null; if (f) f(); });

// Accès de test (tests navigateur) : état lu seulement.
window.__mp = { get room() { return room; }, get coord() { return coord; }, params: () => (room && room.s.match ? paramsOf(room.s.match) : null), serverNow, COUNT_MS, ONLINE_MS };
