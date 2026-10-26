// Mauvais Perdants — interface. Lit l'état du salon (net.js) et l'affiche ; ne décide de
// rien. Le coordinateur (coord.js) tourne dans l'onglet désigné par `coord`.

import { $, h, clear, chip, toast, reduced } from './ui/dom.js';
import { Flaps } from './ui/flaps.js';
import { Stage, hostInto } from './ui/stage.js';
import { sfx, isMuted, setMuted } from './sfx.js';
import { createRoom, joinRoom, resumeRoom, serverNow, normalizeCode, ONLINE_MS } from './net.js';
import { Coordinator, paramsOf, namesOf, finalSummary } from './coord.js';
import { GHOST } from './results.js';
import { round, FAMILIES } from './rounds/index.js';
import { gameOf, contenders, COUNT_MS } from './machine.js';
import { ROUNDS_PER_TOURNAMENT } from './draw.js';
import { standings, MIN_PLAYERS, MAX_PLAYERS, FINAL_MULT } from './scoring.js';
import { mountPlay } from './play/index.js';
import { cleanName, validName } from './text.js';

const app = $('#app');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
};
const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

let room = null, coord = null, stages = [], view = { key: null }, raf = 0, codeFlaps = null;

// ═════════════════════════════════════ accueil
const nameIn = $('#name'), codeIn = $('#code'), homeErr = $('#home-err');
nameIn.value = store.get('mp-name') || '';
const pre = new URLSearchParams(location.search).get('code');
if (pre) codeIn.value = normalizeCode(pre);
document.querySelectorAll('.host-big').forEach(svg => { clear(svg); hostInto(svg); });

function readName() {
  const n = cleanName(nameIn.value);
  if (!validName(n)) { homeErr.textContent = 'Choisis un pseudo (1 à 16 caractères).'; nameIn.focus(); return null; }
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
  const roast = document.querySelector('input[name="roast"]:checked').value;
  enter(await createRoom({ name, scene, roast, crude: $('#crude').checked }));
}));
// Solo : un salon privé, lancé aussitôt (duel contre Gonzague).
let autoSolo = false;
$('#btn-solo').addEventListener('click', e => busy(e.currentTarget, async () => {
  const name = readName();
  if (!name) return;
  const roast = document.querySelector('input[name="roast"]:checked').value;
  autoSolo = true;
  enter(await createRoom({ name, scene: false, roast, crude: $('#crude').checked }));
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

// Son
function syncMute() {
  document.querySelectorAll('[data-mute]').forEach(b => {
    b.querySelector('use').setAttribute('href', isMuted() ? '#i-mute' : '#i-sound');
    b.setAttribute('aria-label', isMuted() ? 'Rétablir le son' : 'Couper le son');
  });
}
document.querySelectorAll('[data-mute]').forEach(b => b.addEventListener('click', () => { setMuted(!isMuted()); syncMute(); }));
syncMute();

// ═════════════════════════════════════ entrée dans un salon
function enter(r) {
  if (room) room.dispose();
  room = r;
  store.set('mp-room', r.code);
  history.replaceState(null, '', `?code=${encodeURIComponent(r.code)}${location.search.includes('emu') ? '&emu' : ''}${aiParam()}`);
  room.onClosed = msg => { leaveUI(); homeErr.textContent = msg; };
  stages = [...document.querySelectorAll('[data-stage]')].map(el => new Stage(el));
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
  app.dataset.screen = 'home';
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
      coord.startTournament().then(() => sfx.sting()).catch(() => { autoSolo = false; });
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
function render() {
  if (!room) return;
  const s = room.s;
  const screen = s.phase === 'lobby' || !s.match ? 'lobby' : 'show';
  app.dataset.screen = screen;
  $('#conn').hidden = room.connected !== false;
  stages.forEach(st => st.update(s.mc));
  if (screen === 'lobby') { app.dataset.step = 'lobby'; return renderLobby(); }
  renderShow();
}

// ───────────── salon
function renderLobby() {
  const s = room.s;
  if (view.destroy) view.destroy();
  view = { key: 'lobby' };
  if (!codeFlaps) { codeFlaps = new Flaps(7); clear($('#code-flaps')).append(codeFlaps.el); }
  if (codeFlaps.text !== room.code.padEnd(7)) codeFlaps.set(room.code);
  const players = room.players();
  const list = clear($('#roster'));
  players.forEach(p => list.append(h('li', { class: p.online ? '' : 'off' }, chip(p.c), h('span', { class: 'nm', text: p.name }), p.uid === room.me ? h('span', { class: 'tag', text: 'toi' }) : p.host ? h('span', { class: 'tag', text: 'hôte' }) : null)));
  if (!players.length) list.append(h('li', { class: 'off' }, h('span', { class: 'nm', text: 'En attente des candidats…' })));
  const n = players.filter(p => p.online).length;
  $('#count').textContent = String(n);
  $('#count-s').textContent = n > 1 ? 's' : '';
  $('#count-min').textContent = n < MIN_PLAYERS ? 'seul : duel contre Gonzague' : `${MAX_PLAYERS} au plus`;
  const cfg = s.cfg || {};
  $('#cfg-line').textContent = `Présentateur : ${cfg.roast === 'hard' ? 'Sans pitié' : 'Pièces rapportées'}${cfg.crude ? ', grossièretés autorisées' : ''}.`;
  const host = room.isHost;
  // Lancer : l'hôte, ou le joueur qui coordonne en son absence. Réglages : l'hôte seul.
  const ctl = host || room.isCoord;
  $('#host-ctl').hidden = !ctl;
  $('#wait-host').hidden = ctl;
  $('#lobby-roast').disabled = !host;
  $('#lcrude').disabled = !host;
  if (ctl) {
    document.querySelectorAll('input[name="lroast"]').forEach(i => { i.checked = i.value === (cfg.roast || 'soft'); });
    $('#lcrude').checked = !!cfg.crude;
    $('#btn-start').disabled = n < 1 || !room.isCoord;
    $('#btn-start').textContent = !room.isCoord ? 'Reprise de la coordination…' : n < MIN_PLAYERS ? 'Jouer seul contre Gonzague' : 'Lancer le tournoi';
  }
}
document.querySelectorAll('input[name="lroast"]').forEach(i => i.addEventListener('change', () => room && room.setCfg({ ...(room.s.cfg || {}), roast: i.value, crude: $('#lcrude').checked, v: 1 })));
$('#lcrude').addEventListener('change', () => room && room.setCfg({ ...(room.s.cfg || {}), roast: (room.s.cfg || {}).roast || 'soft', crude: $('#lcrude').checked, v: 1 }));
$('#btn-start').addEventListener('click', async e => {
  if (!coord) return;
  e.currentTarget.disabled = true;
  try { await coord.startTournament(); sfx.sting(); } catch (err) { $('#lobby-err').textContent = err.userMessage || 'Lancement impossible.'; }
});
$('#room-code').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?code=${room.code}`;
  try { await navigator.clipboard.writeText(url); toast('Lien du salon copié'); } catch (_) { toast(room.code); }
});

// ───────────── émission
function renderShow() {
  const s = room.s, m = s.match;
  app.dataset.step = m.step;
  renderPips(m);
  const key = `${m.tid}:${m.rk}:${m.step}`;
  if (view.key !== key) {
    if (view.destroy) view.destroy();
    const deck = clear($('#deck'));
    view = { key };
    const fn = VIEWS[m.step];
    if (fn) Object.assign(view, fn(deck, m) || {});
    if (room.isCoord && ['intro', 'reveal', 'board', 'vote'].includes(m.step)) deck.append(h('div', { class: 'coord-ctl' }, h('button', { class: 'btn btn-ghost', type: 'button', text: 'Passer ⏭', onclick: () => coord && coord.skip() })));
    if (m.step === 'play') sfx.go();
    if (m.step === 'reveal') sfx.sting();
    if (m.step === 'final') sfx.fanfare();
  }
  if (view.update) view.update(m);
}

function renderPips(m) {
  const ol = clear($('#pips'));
  m.plan.forEach((p, k) => ol.append(h('li', { class: `pip ${k < m.i || (k === m.i && ['reveal', 'board'].includes(m.step)) ? 'done' : ''} ${k === m.i ? 'now' : ''} ${k === ROUNDS_PER_TOURNAMENT - 1 ? 'x2' : ''}`, title: round(p.g).title, text: String(k + 1) })));
  if (m.i >= ROUNDS_PER_TOURNAMENT) ol.append(h('li', { class: 'pip now', title: 'Départage', text: '⚡' }));
}

function tickClock() {
  const el = $('#clock-num'), box = $('#clock');
  const m = room && room.s.match;
  if (!m || app.dataset.screen !== 'show') return;
  const left = Math.ceil((m.end - serverNow()) / 1000);
  const timed = ['intro', 'count', 'play', 'vote', 'judge'].includes(m.step);
  box.classList.toggle('idle', !timed);
  box.classList.toggle('hot', timed && m.step === 'play' && left <= 5);
  el.textContent = timed ? String(Math.max(0, left)) : '—';
  if (m.step === 'play' && left <= 5 && left > 0 && view.lastTick !== left) { view.lastTick = left; sfx.tick(); }
}

const meIn = m => contenders(m).includes(room.me) && !!(m.roster || {})[room.me];
const tag = m => `${m.tid}:${m.rk}`;

const VIEWS = {
  intro(deck, m) {
    const tb = m.i >= ROUNDS_PER_TOURNAMENT;
    const def = round(gameOf(m));
    const p = paramsOf(m);
    const fam = FAMILIES[def.family];
    const last = m.i === ROUNDS_PER_TOURNAMENT - 1;
    const card = h('div', { class: 'card round-card' },
      h('div', { class: 'round-no' }, tb ? 'Départage' : `Manche ${m.i + 1} sur ${ROUNDS_PER_TOURNAMENT}`, h('span', { class: 'fam', text: `${fam.icon} ${fam.label}` }), last ? h('span', { class: 'x2', text: `points ×${FINAL_MULT}` }) : null),
      h('h1', { class: 'round-title', text: def.title }),
      h('ol', { class: 'round-rules' }, (tb ? ['Seuls les ex æquo jouent.', def.id === 'gong' ? 'Trois signaux : le temps moyen le plus bas remporte le tournoi.' : '20 secondes de calcul : le meilleur total remporte le tournoi.'] : def.rules).map(t => h('li', { text: t }))),
      m.roster[GHOST] && def.ghost ? h('p', { class: 'kicker', text: `Score à battre (Gonzague) : ${def.ghost(p).label}` }) : null,
      h('div', { class: 'round-meta' }, h('span', {}, 'Durée max ', h('b', { text: `${Math.round(def.playMs / 1000 * (tb ? 0.5 : 1))} s` })), h('span', {}, 'Départage ', h('b', { text: def.tieText(p) }))),
    );
    deck.append(card);
    const readies = h('div', { class: 'readies' });
    card.append(readies);
    if (meIn(m) && room.isPlayer) {
      const boast = h('button', { class: 'btn boast-btn', type: 'button', text: 'Fanfaronner : « Facile. »', title: '+3 si tu gagnes la manche, −3 si tu finis dans la moitié basse' });
      const ready = h('button', { class: 'btn btn-main', type: 'button', text: 'Prêt' });
      boast.addEventListener('click', () => { boast.disabled = true; room.boast(m.tid, m.rk).then(() => { boast.classList.add('on'); boast.textContent = 'Tu as fanfaronné. Assume.'; }).catch(() => { boast.disabled = false; }); });
      ready.addEventListener('click', () => { ready.disabled = true; ready.textContent = 'Prêt ✓'; room.ready(tag(m)); });
      if (!tb) card.append(h('div', { class: 'intro-actions' }, boast, ready)); else card.append(h('div', { class: 'intro-actions' }, ready));
      if (!tb) card.append(h('p', { class: 'fine', text: 'Fanfaronner : +3 si tu gagnes la manche, −3 si tu finis dans la moitié basse. Facultatif.' }));
    }
    return {
      update(mm) {
        const names = namesOf(mm);
        clear(readies);
        contenders(mm).forEach(u => {
          const on = room.s.ready[u] === tag(mm);
          const b = !!room.s.boast[u];
          readies.append(h('span', { class: `${on ? 'on' : ''} ${b ? 'boast' : ''}`, title: b ? 'a fanfaronné' : '' }, chip(mm.roster[u].c), names[u] + (b ? ' · « Facile »' : '')));
        });
      },
    };
  },

  count(deck, m) {
    const num = h('div', { class: 'count-num', text: '3' });
    deck.append(h('div', { class: 'count' }, num, h('p', { text: round(gameOf(m)).verb + ' !' })));
    let last = null;
    return { tick() { const n = Math.max(1, Math.ceil((m.end - serverNow()) / 1000)); if (n !== last) { last = n; num.textContent = String(n); num.style.animation = 'none'; void num.offsetWidth; num.style.animation = ''; sfx.tick(); } } };
  },

  play(deck, m) {
    const mine = meIn(m) && room.isPlayer;
    if (!mine || room.s.subs[room.me]) return liveView(deck, m, mine ? 'Réponse verrouillée. Les autres jouent encore…' : 'En direct du plateau');
    const k = tag(m);
    const saveKey = `mp-partial:${room.code}:${k}`;
    const v = {};
    deck.append(h('p', { class: 'fine', text: 'Connexion à la manche…' }));
    const toLive = (mm, title) => { clear(deck); v.live = liveView(deck, m, title); v.live.update(mm); };
    // On ne lance la manche qu'une fois l'état relu : sinon un rechargement permettrait
    // de rejouer un contenu déjà vu (même graine).
    v.update = mm => {
      if (v.live) return v.live.update(mm);
      if (!v.ctl) {
        if (!room.loaded.has('start') || !room.loaded.has('subs')) return;
        if (room.s.subs[room.me]) return toLive(mm, 'Réponse verrouillée. Les autres jouent encore…');
        if (room.s.start[room.me]) {
          // Manche déjà commencée sur ce compte : elle s'arrête là, avec ce qui était joué.
          let saved = {};
          try { saved = JSON.parse(sessionStorage.getItem(saveKey) || '{}') || {}; } catch (_) {}
          room.submit(m.tid, m.rk, saved).catch(() => {});
          return toLive(mm, 'Tu as quitté la manche en cours : elle s’arrête à ce que tu avais joué.');
        }
        clear(deck);
        room.markStart(m.tid, m.rk).catch(() => {});   // « commencée », écriture unique (règles)
        room.progress(k, 0);
        v.ctl = mountPlay(deck, {
          gameId: gameOf(m), params: paramsOf(m), startAt: m.at, endAt: m.end, now: serverNow,
          send: payload => { try { sessionStorage.removeItem(saveKey); } catch (_) {} return room.submit(m.tid, m.rk, payload); },
          save: payload => { try { sessionStorage.setItem(saveKey, JSON.stringify(payload)); } catch (_) {} },
          progress: x => room.progress(k, x),
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
      if (room.s.subs[room.me]) { v.ctl.destroy(); v.ctl = null; toLive(mm, 'Ta réponse est verrouillée. Les autres jouent encore…'); }
    };
    v.destroy = () => v.ctl && v.ctl.destroy();
    return v;
  },

  judge(deck, m) {
    deck.append(h('div', { class: 'judging' }, h('div', { class: 'stamp', text: 'Correction' }), h('p', { class: 'fine', text: 'Le code a vérifié les lettres et les doublons. Le correcteur IA juge les catégories ; s’il tarde, vous serez le jury.' })));
  },

  vote(deck, m) {
    const box = h('div', { class: 'vote-list' });
    deck.append(box);
    let drawn = false, mine = {};
    const done = h('button', { class: 'btn btn-main btn-xl', type: 'button', text: 'J’ai voté' });
    done.addEventListener('click', () => { done.disabled = true; done.textContent = 'Vote enregistré ✓'; room.ready(`${tag(m)}:v`); });
    function draw(det) {
      drawn = true;
      clear(box);
      const jury = det.mode === 'jury';
      box.append(h('h2', { class: 'h2', text: jury ? 'Vous êtes le jury' : 'Réponses discutables' }),
        h('p', { class: 'fine', text: jury
          ? (Object.keys(m.roster).length === 2 ? 'Le correcteur IA n’a pas répondu à temps : en duel, chacun juge les réponses de l’autre. Refuse ce qui n’existe pas.' : 'Le correcteur IA n’a pas répondu à temps : chaque réponse est acceptée, sauf si au moins deux autres joueurs, et la majorité, la refusent.')
          : (Object.keys(m.roster).length === 2 ? 'Le correcteur IA hésite sur ces réponses : en duel, l’autre joueur tranche.' : 'Le correcteur IA hésite sur ces réponses. Elles sont acceptées, sauf si au moins deux autres joueurs, et la majorité, les refusent.') }));
      if (!det.items.length) box.append(h('p', { text: 'Rien à juger.' }));
      det.items.forEach(it => {
        const own = (it.by || []).includes(room.me) || !meIn(m) || !room.isPlayer;
        const yes = h('button', { class: 'yes', type: 'button', 'aria-pressed': 'true', text: 'Accepter' });
        const no = h('button', { class: 'no', type: 'button', 'aria-pressed': 'false', text: 'Refuser' });
        const set = refuse => { mine[it.g] = refuse; yes.setAttribute('aria-pressed', String(!refuse)); no.setAttribute('aria-pressed', String(refuse)); room.vote(m.tid, m.rk, it.g, refuse); };
        yes.addEventListener('click', () => set(false));
        no.addEventListener('click', () => set(true));
        box.append(h('div', { class: `vote-item ${own ? 'mine' : ''}` },
          h('div', {}, h('div', { class: 'ans', text: it.t }), h('small', { text: `${it.cat}${it.why ? ' — ' + it.why : ''}${own && (it.by || []).includes(room.me) ? ' · ta réponse' : ''}` })),
          own ? h('span', { class: 'fine', text: (it.by || []).includes(room.me) ? 'pas de vote' : '' }) : h('div', { class: 'tog' }, yes, no)));
      });
      if (meIn(m) && room.isPlayer) box.append(done);
    }
    return { update(mm) { if (drawn) return; const det = parse((mm.det || {})[mm.i] || ''); if (det && det.kind === 'vote') draw(det); else if (!box.firstChild) box.append(h('p', { class: 'fine', text: 'Préparation du vote…' })); } };
  },

  reveal(deck, m) {
    if (m.i >= ROUNDS_PER_TOURNAMENT) return tiebreakView(deck, m);
    const res = (m.res || {})[m.i];
    const def = round(gameOf(m));
    const names = namesOf(m);
    const wrap = h('div', { class: 'reveal' }, h('h2', { text: `${def.title} — résultats` }));
    deck.append(wrap);
    if (!res) { wrap.append(h('p', { class: 'fine', text: 'Calcul…' })); return {}; }
    const rows = Object.entries(res).map(([uid, r]) => ({ uid, ...r })).sort((a, b) => a.rank - b.rank || (a.uid < b.uid ? -1 : 1));
    const els = rows.map(r => h('div', { class: `res-row ${r.rank === 1 && !r.absent ? 'first' : ''} ${r.absent ? 'absent' : ''}` },
      h('span', { class: 'rk', text: r.absent ? '—' : String(r.rank) }),
      h('span', { class: 'who' }, chip(m.roster[r.uid].c), h('b', { text: names[r.uid] }), r.boast ? h('span', { class: `bst ${r.boast > 0 ? 'up' : 'down'}`, text: `${r.boast > 0 ? '+' : ''}${r.boast} fanfaronnade` }) : null),
      h('span', { class: 'lab', text: r.label }),
      h('span', { class: 'pts', text: `+${r.pts}` })));
    els.forEach(e => wrap.append(e));
    if (rows.some(r => r.tied)) wrap.append(h('p', { class: 'tied-note', text: 'Ex æquo : points partagés (moyenne des places).' }));
    if (m.i === ROUNDS_PER_TOURNAMENT - 1) wrap.append(h('p', { class: 'tied-note', text: `Manche décisive : points de place ×${FINAL_MULT}.` }));
    // Révélation du dernier au premier.
    const order = els.slice().reverse();
    const step = reduced() ? 0 : Math.min(420, 2600 / order.length);
    const timers = order.map((e, k) => setTimeout(() => { e.classList.add('in'); if (k === order.length - 1) sfx.good(); }, 200 + k * step));
    if (gameOf(m) === 'bac') wrap.append(bacTable(m, names));
    return { destroy: () => timers.forEach(clearTimeout) };
  },

  board(deck, m) {
    const roster = Object.keys(m.roster);
    const names = namesOf(m);
    const prev = standings(roster, Object.fromEntries(Object.entries(m.res || {}).filter(([k]) => Number(k) < m.i)), ROUNDS_PER_TOURNAMENT);
    const cur = standings(roster, m.res || {}, ROUNDS_PER_TOURNAMENT);
    const left = ROUNDS_PER_TOURNAMENT - 1 - m.i;
    const wrap = h('div', { class: 'board' }, h('h2', {}, 'Classement', h('small', { text: left > 0 ? `${left} manche${left > 1 ? 's' : ''} à jouer${left === 1 ? ' · la dernière vaut double' : ''}` : 'Fin du tournoi' })));
    deck.append(wrap);
    // « Suite » : quand tous les joueurs l'ont touché, on enchaîne sans attendre le chrono.
    if (meIn(m) && room.isPlayer) {
      const go = h('button', { class: 'btn btn-main next-btn', type: 'button', text: left > 0 ? 'Suite ▸' : 'Voir le podium ▸' });
      go.addEventListener('click', () => { go.disabled = true; go.textContent = 'On attend les autres…'; room.ready(`${tag(m)}:n`); });
      setTimeout(() => deck.append(go), reduced() ? 0 : 1600);
    }
    const rowsEl = {};
    // Ordre de départ : classement AVANT la manche, puis glissement vers le nouveau.
    prev.forEach(r => {
      const fl = new Flaps(3, 'md');
      fl.set(String(r.total), { pad: 'start', sound: false });
      const delta = h('span', { class: 'delta' });
      const el = h('div', { class: 'brow' }, h('span', { class: 'rk', text: String(r.place) }), h('span', { class: 'who' }, chip(m.roster[r.uid].c), h('b', { text: names[r.uid] })), fl.el, delta);
      rowsEl[r.uid] = { el, fl, delta, rk: el.firstChild };
      wrap.append(el);
    });
    const timers = [];
    timers.push(setTimeout(() => {
      cur.forEach(r => {
        const x = rowsEl[r.uid];
        const before = prev.find(p => p.uid === r.uid).total;
        const d = r.total - before;
        x.delta.textContent = d ? `+${d}` : '+0';
        x.delta.classList.add('show'); x.delta.classList.toggle('zero', !d);
        x.fl.set(String(r.total), { pad: 'start' });
      });
    }, reduced() ? 0 : 500));
    timers.push(setTimeout(() => {
      // FLIP : chaque ligne glisse vers sa nouvelle place.
      const tops = Object.fromEntries(Object.entries(rowsEl).map(([u, x]) => [u, x.el.getBoundingClientRect().top]));
      cur.forEach(r => { const x = rowsEl[r.uid]; wrap.append(x.el); x.rk.textContent = String(r.place); x.el.classList.toggle('lead', r.place === 1); });
      if (reduced()) return;
      cur.forEach(r => {
        const x = rowsEl[r.uid];
        const dy = tops[r.uid] - x.el.getBoundingClientRect().top;
        if (!dy) return;
        x.el.style.transition = 'none'; x.el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => { x.el.style.transition = ''; x.el.style.transform = ''; });
      });
    }, reduced() ? 0 : 1500));
    return { destroy: () => timers.forEach(clearTimeout) };
  },

  final(deck, m) {
    const sum = finalSummary(m);
    const { rows, names } = sum;
    const wrap = h('div', { class: 'final' });
    deck.append(wrap);
    const podium = h('div', { class: 'podium' });
    const slot = (r, cls) => r ? h('div', { class: `pod ${cls}` }, cls === 'p1' ? h('div', { class: 'crown', text: '👑', 'aria-hidden': 'true' }) : null, chip(m.roster[r.uid].c), h('div', { class: 'nm', text: names[r.uid] }), h('div', { class: 'tt', text: `${r.total} pts` }), h('div', { class: 'step', text: String(r.place) })) : h('div');
    podium.append(slot(rows[1], 'p2'), slot(rows[0], 'p1'), slot(rows[2], 'p3'));
    wrap.append(h('h2', { class: 'h2', text: rows.filter(r => r.place === 1).length > 1 ? 'Victoire partagée' : `${names[rows[0].uid]} remporte le tournoi` }), podium);
    const table = h('div', { class: 'board' });
    rows.forEach(r => table.append(h('div', { class: `brow ${r.place === 1 ? 'lead' : ''}` }, h('span', { class: 'rk', text: String(r.place) }), h('span', { class: 'who' }, chip(m.roster[r.uid].c), h('b', { text: names[r.uid] })), h('span', { class: 'lab', text: `${r.wins} manche${r.wins > 1 ? 's' : ''} gagnée${r.wins > 1 ? 's' : ''}` }), h('b', { text: String(r.total) }))));
    wrap.append(table);
    if (sum.tiebreak && sum.tiebreak.order) wrap.append(h('p', { class: 'fine', text: 'Égalité départagée au Gong.' }));
    if (sum.awards.length) {
      const aw = h('div', { class: 'awards' });
      sum.awards.forEach(a => aw.append(h('div', { class: 'award' }, h('h4', { text: a.title }), h('b', { text: a.who }), h('span', { text: a.detail }))));
      wrap.append(aw);
    }
    const actions = h('div', { class: 'final-actions' });
    if (room.isCoord) {
      const again = h('button', { class: 'btn btn-main btn-xl', type: 'button', text: 'Revanche' });
      const lobby = h('button', { class: 'btn btn-ghost btn-xl', type: 'button', text: 'Retour au salon' });
      again.addEventListener('click', async () => { again.disabled = true; try { await coord.startTournament({ rematch: true }); } catch (e) { toast(e.userMessage || 'Revanche impossible'); again.disabled = false; } });
      lobby.addEventListener('click', () => coord.backToLobby());
      actions.append(again, lobby);
    } else actions.append(h('p', { class: 'fine', text: 'L’hôte peut lancer la revanche : mêmes joueurs, nouvelles manches.' }));
    // Partir sans pénalité ni message culpabilisant : le tournoi est terminé.
    const quit = h('button', { class: 'btn btn-ghost', type: 'button', text: room.isHost ? 'Fermer le salon' : 'Quitter' });
    quit.addEventListener('click', async () => { const r = room; leaveUI(); if (r) await r.leave(); });
    actions.append(quit);
    wrap.append(actions, h('p', { class: 'seed-note', text: `Tirage ${m.seed} · ${m.plan.map(p => round(p.g).title).join(' · ')}` }));
    if (!reduced()) confetti(m);
  },
};

// Progression en direct, dans l'unité de la manche ; barre relative à la borne (ou au meilleur).
const PROG = {
  gong: (v, p) => [`${v}/${p.trials} signaux`, v / p.trials],
  tir: v => [`${v}/20 cibles`, v / 20],
  dictee: (v, p) => [`${Math.round(100 * v / p.phrase.length)} % tapé`, v / p.phrase.length],
  chemin: v => [`niveau ${v}`, null], damier: v => [`niveau ${v}`, null],
  numeros: v => [`${v} numéros`, null], coffre: v => [`${v} chiffres`, null],
  dejavu: v => [`${v} bonnes`, null], calcul: v => [`${v} pt${Math.abs(v) > 1 ? 's' : ''}`, null],
  nuage: v => [`${v}/3 nuages`, v / 3], bac: v => [`${v}/4 cases`, v / 4],
};
function liveView(deck, m, title) {
  const g = gameOf(m);
  const p = paramsOf(m);
  const wrap = h('div', { class: 'live' }, h('h2', { text: round(g).title }), h('p', { class: 'fine', text: title }));
  const list = h('div', { class: 'live-list' });
  wrap.append(list);
  deck.append(wrap);
  const names = namesOf(m);
  return {
    update(mm) {
      clear(list);
      const vals = contenders(mm).map(u => { const pr = room.s.prog[u]; return pr && pr.k === tag(mm) ? pr.v : null; });
      const best = Math.max(1, ...vals.filter(v => v !== null));
      contenders(mm).forEach((u, k) => {
        if (u === GHOST) {
          const gs = round(g).ghost(p);
          list.append(h('div', { class: 'lrow fin' }, h('span', { class: 'who' }, chip(mm.roster[u].c), h('b', { text: names[u] })), h('span', { class: 'st', text: `score à battre · ${gs.label}` }), h('span', { class: 'lbar', style: { '--w': '1', '--pc': `var(--p${mm.roster[u].c})` } })));
          return;
        }
        const done = !!room.s.subs[u];
        const v = vals[k];
        const on = room.online(u);
        const [txt, frac] = v === null ? ['', 0] : PROG[g](v, p);
        const pct = Math.max(0, Math.min(1, frac === null ? v / best : frac));
        list.append(h('div', { class: `lrow ${done ? 'fin' : ''}` },
          h('span', { class: 'who' }, chip(mm.roster[u].c), h('b', { text: names[u] })),
          h('span', { class: 'st', text: done ? `fini ✓${txt ? ' · ' + txt : ''}` : !on ? 'déconnecté' : txt || 'joue…' }),
          h('span', { class: 'lbar', style: { '--w': String(pct), '--pc': `var(--p${mm.roster[u].c})` } })));
      });
    },
  };
}

function tiebreakView(deck, m) {
  const det = parse((m.det || {})[ROUNDS_PER_TOURNAMENT] || '') || {};
  const names = namesOf(m);
  const wrap = h('div', { class: 'reveal' }, h('h2', { text: `Départage : ${round(gameOf(m)).title}` }));
  Object.entries(det.order || {}).sort((a, b) => a[1] - b[1]).forEach(([u, pos]) => wrap.append(h('div', { class: 'res-row in' }, h('span', { class: 'rk', text: String(pos + 1) }), h('span', { class: 'who' }, chip(m.roster[u].c), h('b', { text: names[u] })), h('span', { class: 'lab', text: (det.labels || {})[u] || '' }), h('span'))));
  deck.append(wrap);
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
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--ok)' } }), 'unique 10'), h('span', {}, h('i', { style: { background: 'var(--warn)' } }), 'partagée 5'), h('span', {}, h('i', { style: { background: 'var(--bad)' } }), 'refusée 0'),
      h('span', { text: mode.startsWith('ia:') ? `Correction : IA (${mode.slice(3)}) + vote des joueurs sur les cas douteux` : 'Correction : vote des joueurs (IA indisponible)' })));
}

function confetti(m) {
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const colors = ['var(--brass)', 'var(--cream)', 'var(--red)', ...Object.values(m.roster).map(p => `var(--p${p.c})`)];
  for (let k = 0; k < 70; k++) box.append(h('i', { style: { left: `${Math.random() * 100}%`, background: colors[k % colors.length], animationDuration: `${2.2 + Math.random() * 2}s`, animationDelay: `${Math.random() * 0.8}s` } }));
  document.body.append(box);
  setTimeout(() => box.remove(), 5200);
}

// Accès de test (tests navigateur) : état lu seulement.
window.__mp = { get room() { return room; }, get coord() { return coord; }, params: () => (room && room.s.match ? paramsOf(room.s.match) : null), serverNow, COUNT_MS, ONLINE_MS };
