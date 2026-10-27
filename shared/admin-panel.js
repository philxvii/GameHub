// Panneau d'administration de GameHub, chargé par home.html après la connexion Google.
//
//  Vue d'ensemble : chiffres en direct, contrôles rapides, parties en cours, dernières actions.
//  En direct      : toutes les parties et tous les joueurs de tous les jeux, en temps réel ;
//                   renommer, exclure, exclure de la partie pour de bon, bannir du site, supprimer.
//  Accueil        : aperçu de l'accueil à modifier (ordre par glisser-déposer, masquer, nom,
//                   sous-titre, filtres, carte large, abandonnés, fenêtre « nouvelle version »),
//                   publié d'un bloc dans hub/layout et hub/hidden.
//  Audience       : shared/admin-audience.js.   Journal : shared/admin-journal.js.
//  Bannis, Réglages.
//
// Les droits sont ceux des règles de la base (firebase/build-rules.js) : ce module n'en accorde aucun.
// Les parties sont listées par l'API REST en mode « shallow » (codes seuls), puis chaque partie est
// suivie champ par champ (phase, joueurs, présence…) : jamais les gros nœuds d'un jeu.
import { ref, get, set, update, remove, onValue, query, orderByKey, limitToLast }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db, auth } from './firebase.js';
import { logAdmin, mountJournal, CATS } from './admin-journal.js';

// Jeux : identifiant de l'accueil, dossier, nœud de la base, présence suivie par le jeu,
// joueurs rangés par compte (uid) plutôt qu'en liste.
const CATALOG = [
  { id: 'banqueroll', name: 'Banqueroll', dir: 'banqueroll', db: 'banqueroll', presence: 'id' },
  { id: 'mauvaisperdants', name: 'Mauvais Perdants', dir: 'mauvais-perdants', db: 'mp', presence: 'uid', keyed: true },
  { id: 'undercover', name: 'Undercover', dir: 'undercover', db: 'games' },
  { id: 'uno', name: 'UNO', dir: 'uno', db: 'uno' },
  { id: 'puissance4', name: 'Puissance 4', dir: 'puissance4', db: 'p4', presence: 'index' },
  { id: 'quiestce', name: 'Qui est-ce ?', dir: 'qui-est-ce', db: 'qec2' },
  { id: 'bataille', name: 'Bataille Navale', dir: 'bataille-navale', db: 'bn' },
  { id: 'roulette', name: 'Roulette', dir: 'roulette', db: 'rl' },
  { id: 'minisubway', name: 'Mini Subway', dir: 'mini-subway', db: 'ms', presence: 'uid', keyed: true },
  { id: 'minigolf', name: 'Mini Golf', dir: 'mini-golf', db: 'mg' },
  { id: 'wikirace', name: 'WikiRace', dir: 'wikirace', db: 'wr' },
];
const BY_DB = Object.fromEntries(CATALOG.map(g => [g.db, g]));
const BY_ID = Object.fromEntries(CATALOG.map(g => [g.id, g]));
const TAGS = [['amis', 'À plusieurs'], ['duel', 'En duel'], ['solo', 'En solo'], ['bluff', 'Bluff'], ['strategie', 'Stratégie'], ['chance', 'Hasard']];
const WORDS = ['Aucun', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix', 'Onze', 'Douze'];
const FIELDS = ['phase', 'players', 'presence', 'hostUid', 'members', 'createdAt', 'updatedAt', 'banned'];
const LIVE_MS = 45000;            // présence datée plus vieille : joueur absent
const IDLE_MS = 3 * 3600000;      // partie sans signe de vie depuis 3 h : inactive
const NAME_MAX = { mp: 16 };
const AV_COLORS = ['#FF5A3C', '#2F6BFF', '#2FB36B', '#8B5CF6', '#E8A317', '#13A08C', '#D6457A', '#5F6FE8'];

// ── Icônes (traits 1,8, 24 × 24) ──
const P = {
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  live: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  home: '<rect x="3.5" y="4" width="5" height="7" rx="1.4"/><rect x="9.5" y="4" width="5" height="7" rx="1.4"/><rect x="15.5" y="4" width="5" height="7" rx="1.4"/><rect x="3.5" y="13" width="5" height="7" rx="1.4"/><rect x="9.5" y="13" width="5" height="7" rx="1.4"/>',
  audience: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bans: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  journal: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
  kick: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9.5 6a17 17 0 0 1-3.1 3.6M6.3 7.6C4.4 8.9 3 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  crown: '<path d="M4 18h16l1-10-5 4-4-6-4 6-5-4 1 10Z" fill="currentColor" stroke="none"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6l1-8Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 4l9 16H3l9-16Z"/><path d="M12 10v4M12 17h.01"/>',
  broom: '<path d="M14 4l-4 8M6 13h10l2 7H4l2-7Z"/>',
  arrowl: '<path d="M14 6l-6 6 6 6"/>', arrowr: '<path d="M10 6l6 6-6 6"/>', first: '<path d="M7 5v14M17 6l-6 6 6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

const SECTIONS = [
  { id: 'overview', label: 'Vue d’ensemble', short: 'Aperçu', ico: 'overview', c: '#8E8E93' },
  { id: 'live', label: 'En direct', short: 'Direct', ico: 'live', c: '#2FB36B' },
  { id: 'home', label: 'Accueil', short: 'Accueil', ico: 'home', c: '#FF5A3C' },
  { id: 'audience', label: 'Audience', short: 'Audience', ico: 'audience', c: '#2F6BFF' },
  { id: 'bans', label: 'Bannis', short: 'Bannis', ico: 'bans', c: '#E5484D' },
  { id: 'settings', label: 'Réglages', short: 'Réglages', ico: 'settings', c: '#6B6F7B' },
  { id: 'journal', label: 'Journal', short: 'Journal', ico: 'journal', c: '#8B5CF6' },
];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const nf = new Intl.NumberFormat('fr-FR');
const plural = (n, one, many = one + 's') => `${nf.format(n)} ${n > 1 ? many : one}`;
const now = () => Date.now() + S.offset;
function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now() - ts) / 1000));
  if (s < 45) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
const avColor = s => AV_COLORS[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % AV_COLORS.length];
const initial = s => (String(s || '?').trim()[0] || '?').toUpperCase();
const cover = g => `games/${g.dir}/cover.webp`;
const isDenied = e => /permission/i.test(String(e && (e.code || e.message) || e));

// ── État ──
const S = {
  el: null, sec: 'overview', offs: [], timers: [], open: false, dev: null,
  offset: 0, visitors: 0, online: {},
  rooms: new Map(),              // "prefix/code" -> { g, prefix, code, f: {champ: valeur}, offs }
  settings: { ageGate: true, maintenance: false }, hidden: {}, layout: null, layoutDenied: false,
  bans: {}, bansDenied: false, visits: null, recent: [], today: null,
  live: { view: 'rooms', game: 'all', q: '', idle: true, sel: null },
  pv: null,                      // éditeur de l'accueil (voir initPreview)
  audience: null, journal: null,
};

// ════════════════════════════════════════════════════════════════════════════════════════════
// Ouverture / fermeture
// ════════════════════════════════════════════════════════════════════════════════════════════
let cssReady;
function loadCss() {
  return cssReady || (cssReady = new Promise(resolve => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./admin-panel.css', import.meta.url).href });
    l.onload = l.onerror = resolve;
    document.head.append(l);
  }));
}

export async function openAdmin(el, { login = false, devEndpoint } = {}) {
  S.el = el; S.dev = devEndpoint || null;
  await loadCss();
  if (!el.firstChild) build();
  el.classList.remove('hidden');
  document.documentElement.style.overflow = 'hidden';
  S.open = true;
  if (login) logAdmin('connexion', 'Connexion au panneau d’administration', 'Google');
  start();
  go(S.sec, { instant: true });
  requestAnimationFrame(() => el.querySelector('.ap').classList.remove('boot'));
}

async function closeAdmin() {
  if (S.pv && pvChanges().length && !(await ask({ title: 'Quitter sans publier ?', text: 'Les modifications de l’accueil ne sont pas encore publiées. Elles restent en brouillon jusqu’à ce que tu fermes la page.', ok: 'Quitter' }))) return;
  stop();
  S.el.classList.add('hidden');
  document.documentElement.style.overflow = '';
}

function build() {
  const me = auth.currentUser;
  const who = me && !me.isAnonymous ? (me.email || me.displayName || 'Compte Google') : (S.dev ? 'Aperçu local' : 'Compte');
  S.el.innerHTML = `
  <div class="ap boot with-side">
    <aside class="ap-side">
      <div class="ap-brand"><i aria-hidden="true"></i>GameHub<span>Admin</span></div>
      <label class="ap-search">${icon('search')}<input type="search" id="ap-q" placeholder="Joueur, partie, jeu…" aria-label="Rechercher un joueur, une partie ou un jeu" autocomplete="off"><kbd>${/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></label>
      <nav class="ap-nav" aria-label="Rubriques">
        ${SECTIONS.map((s, i) => `${i === 4 ? '<div class="ap-nav-h">Gestion</div>' : ''}<button class="ap-item" type="button" data-go="${s.id}"><span class="ap-ico" style="background:${s.c}">${icon(s.ico)}</span>${s.label}<span class="ap-badge" data-badge="${s.id}" hidden></span></button>`).join('')}
      </nav>
      <div class="ap-side-foot">
        <div class="ap-me"><b>${esc(initial(who))}</b><span title="${esc(who)}">${esc(who)}</span></div>
        <button class="ap-back" type="button" data-act="close">${icon('back')}Retour au site</button>
      </div>
    </aside>
    <div class="ap-main">
      <header class="ap-bar"><h1 id="ap-title"></h1><span class="ap-sub" id="ap-sub"></span><div class="ap-tools" id="ap-tools"></div>
        <button class="ap-icon-btn ap-x" type="button" data-act="close" aria-label="Retour au site">${icon('close')}</button></header>
      <div class="ap-scroll" id="ap-scroll">${SECTIONS.map(s => `<section class="ap-sec" data-sec="${s.id}" hidden aria-label="${s.label}"></section>`).join('')}</div>
    </div>
    <nav class="ap-tabs" aria-label="Rubriques">${SECTIONS.map(s => `<button type="button" data-go="${s.id}">${icon(s.ico)}<span>${s.short}</span>${s.id === 'live' ? '<i hidden></i>' : ''}</button>`).join('')}</nav>
  </div>`;
  const root = S.el;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  // Lignes et cartes cliquables : Entrée ou Espace comme un clic.
  root.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act], .pv-card')) { e.preventDefault(); e.target.click(); }
  });
  const scroll = root.querySelector('#ap-scroll'), bar = root.querySelector('.ap-bar');
  scroll.addEventListener('scroll', () => bar.classList.toggle('scrolled', scroll.scrollTop > 4), { passive: true });
  root.querySelector('#ap-q').addEventListener('input', e => {
    S.live.q = e.target.value.trim(); if (S.live.q) { S.live.view = 'players'; if (S.sec !== 'live') go('live'); } else draw('live');
    const f = root.querySelector('#ap-live-q'); if (f && f !== e.target) f.value = e.target.value;
  });
  document.addEventListener('keydown', onKey);
}

function onKey(e) {
  if (!S.open || S.el.classList.contains('hidden')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const q = S.el.querySelector(innerWidth > 820 ? '#ap-q' : '#ap-live-q') || S.el.querySelector('#ap-q'); if (innerWidth <= 820 && S.sec !== 'live') go('live'); setTimeout(() => (S.el.querySelector(innerWidth > 820 ? '#ap-q' : '#ap-live-q'))?.focus(), 30); return; }
  if (e.key !== 'Escape') return;
  if (document.querySelector('.ap-veil, .ap-menu')) return;   // la fenêtre ouverte se ferme d'abord
  e.stopImmediatePropagation();
  if (S.live.sel && S.sec === 'live') { S.live.sel = null; draw('live'); return; }
  if (S.pv && S.pv.sel && S.sec === 'home') { S.pv.sel = null; drawHome(); return; }
  closeAdmin();
}

function go(sec, { instant = false } = {}) {
  S.sec = sec;
  const def = SECTIONS.find(s => s.id === sec);
  closeSheet(); closeMenu();
  S.el.querySelectorAll('[data-go]').forEach(b => { if (b.dataset.go === sec) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  S.el.querySelector('#ap-title').textContent = def.label;
  S.el.querySelectorAll('.ap-sec').forEach(x => {
    const on = x.dataset.sec === sec;
    x.hidden = !on;
    if (on && !instant) { x.classList.remove('in'); void x.offsetWidth; x.classList.add('in'); }
  });
  S.el.querySelector('#ap-scroll').scrollTop = 0;
  if (sec === 'audience') mountAudienceSec();
  if (sec === 'journal') mountJournalSec();
  if (sec === 'home') initPreview();
  draw(sec);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Données en direct
// ════════════════════════════════════════════════════════════════════════════════════════════
function sub(path, fn, onErr) { S.offs.push(onValue(ref(db, path), s => fn(s.val()), e => onErr && onErr(e))); }

function start() {
  if (S.offs.length) return;
  sub('.info/serverTimeOffset', v => { S.offset = v || 0; });
  sub('hub/online', v => { S.online = v || {}; countVisitors(); schedule(); });
  sub('hub/settings', v => { S.settings = { ageGate: true, maintenance: false, ...(v || {}) }; schedule(); });
  sub('hub/hidden', v => { S.hidden = v || {}; schedule(); });
  sub('hub/layout', v => { S.layout = v; S.layoutDenied = false; schedule(); }, e => { S.layoutDenied = isDenied(e); schedule(); });
  sub('bans', v => { S.bans = v || {}; S.bansDenied = false; schedule(); }, e => { S.bansDenied = isDenied(e); schedule(); });
  sub('hub/stats/visits', v => { S.visits = v; schedule(); });
  S.offs.push(onValue(query(ref(db, 'adminLog'), orderByKey(), limitToLast(6)),
    s => { S.recent = Object.values(s.val() || {}).filter(e => typeof e.ts === 'number').sort((a, b) => b.ts - a.ts); schedule(); }, () => {}));
  syncRooms();
  S.timers.push(setInterval(syncRooms, 8000), setInterval(() => { countVisitors(); schedule(); }, 15000));
  loadToday();
}

function stop() {
  S.open = false;
  S.offs.forEach(f => f()); S.offs = [];
  S.timers.forEach(clearInterval); S.timers = [];
  for (const r of S.rooms.values()) r.offs.forEach(f => f());
  S.rooms.clear();
}

function countVisitors() {
  const t = now();
  S.visitors = Object.values(S.online).filter(v => v && t - v.t < 180000).length;
}

// Codes des parties d'un nœud, sans leur contenu (REST, shallow). Repli : lecture complète.
async function listCodes(prefix) {
  try {
    const base = new URL(db.app.options.databaseURL);
    const u = new URL(`${base.origin}/${prefix}.json`);
    base.searchParams.forEach((v, k) => u.searchParams.set(k, v));
    u.searchParams.set('shallow', 'true');
    const me = auth.currentUser;
    if (me) u.searchParams.set('auth', await me.getIdToken());
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return Object.keys((await res.json()) || {});
  } catch (_) {
    return Object.keys((await get(ref(db, prefix))).val() || {});
  }
}

let syncing = false;
async function syncRooms() {
  if (syncing || !S.open) return;
  syncing = true;
  try {
    const seen = new Set();
    await Promise.all(CATALOG.map(async g => {
      let codes = [];
      try { codes = await listCodes(g.db); } catch (_) { return; }
      for (const code of codes) {
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(code)) continue;   // clé inattendue : jamais affichée
        const key = `${g.db}/${code}`;
        seen.add(key);
        if (S.rooms.has(key)) continue;
        const r = { g, prefix: g.db, code, key, f: {}, offs: [], at: now() };
        S.rooms.set(key, r);
        for (const f of FIELDS) r.offs.push(onValue(ref(db, `${key}/${f}`), s => { r.f[f] = s.val(); schedule(); }, () => {}));
      }
    }));
    for (const [k, r] of S.rooms) if (!seen.has(k)) { r.offs.forEach(f => f()); S.rooms.delete(k); }
    schedule();
  } finally { syncing = false; }
}

// Joueurs d'une partie, quel que soit le format du jeu.
function playersOf(r) {
  const { g, f } = r, out = [], pres = f.presence;
  const state = key => {
    if (!g.presence) return '?';
    const v = pres && pres[key];
    if (v === true || (v && typeof v === 'object')) return 'on';
    if (typeof v === 'number') return now() - v < LIVE_MS ? 'on' : 'off';
    return 'off';
  };
  if (g.keyed) {
    for (const [uid, p] of Object.entries(f.players || {})) if (p) out.push({ key: uid, path: `players/${uid}`, uid, name: p.name, host: uid === f.hostUid, st: state(uid) });
  } else {
    const list = Array.isArray(f.players) ? f.players.map((p, i) => [i, p]) : Object.entries(f.players || {});
    for (const [i, p] of list) {
      if (!p || typeof p !== 'object') continue;
      const uid = typeof p.uid === 'string' ? p.uid : null;
      const pk = g.presence === 'index' ? i : g.presence === 'id' ? p.id : uid;
      out.push({ key: String(i), idx: Number(i), path: `players/${i}`, uid, name: p.name, presKey: pk,
        host: uid ? uid === f.hostUid : Number(i) === 0, st: state(pk) });
    }
  }
  return out;
}

const PHASES = { lobby: ['Salon', 'tint'], playing: ['En jeu', 'green'], play: ['En jeu', 'green'], game: ['En jeu', 'green'], ended: ['Terminée', ''], end: ['Terminée', ''], finished: ['Terminée', ''], results: ['Résultats', ''], podium: ['Podium', ''] };
const phaseOf = p => PHASES[p] || [p ? String(p)[0].toUpperCase() + String(p).slice(1) : 'Inconnue', 'green'];

function roomInfo(r) {
  const players = playersOf(r), on = players.filter(p => p.st === 'on').length;
  const stamps = [r.f.createdAt, r.f.updatedAt].filter(v => typeof v === 'number');
  for (const v of Object.values(r.f.presence || {})) { if (typeof v === 'number') stamps.push(v); else if (v && typeof v.ts === 'number') stamps.push(v.ts); }
  const last = stamps.length ? Math.max(...stamps) : null;
  const ended = /^(ended|end|finished)$/.test(r.f.phase || '');
  // Inactive : terminée et vide ; ou, pour un jeu qui suit la présence, personne de connecté et aucun signe
  // de vie depuis 10 min ; sinon, aucun signe de vie depuis 3 h. Sans aucun horodatage : on ne sait pas, active.
  let idle = false;
  if (r.f.phase != null && !on) {
    if (ended) idle = true;
    else if (r.g.presence) idle = !last || now() - last > 600000;
    else idle = !!last && now() - last > IDLE_MS;
  }
  return { players, on, last, idle, ended, created: typeof r.f.createdAt === 'number' ? r.f.createdAt : null };
}

function liveRooms() {
  return [...S.rooms.values()].filter(r => r.f.phase != null || r.f.players != null).map(r => ({ r, ...roomInfo(r) }))
    .sort((a, b) => (b.on - a.on) || (a.idle - b.idle) || ((b.last || 0) - (a.last || 0)) || a.r.code.localeCompare(b.r.code));
}

function totals() {
  const rooms = liveRooms(), active = rooms.filter(x => !x.idle);
  const inGame = active.reduce((s, x) => s + x.players.length, 0);
  const onNow = rooms.reduce((s, x) => s + x.on, 0);
  return { rooms, active, idle: rooms.length - active.length, inGame, onNow };
}

let raf = 0;
function schedule() {
  if (raf || !S.open) return;
  raf = requestAnimationFrame(() => { raf = 0; draw(S.sec); badges(); });
}

function badges() {
  const t = totals();
  const set = (id, v, cls = '') => S.el.querySelectorAll(`[data-badge="${id}"]`).forEach(b => { b.hidden = !v; b.textContent = v; b.className = 'ap-badge ' + cls; });
  set('live', t.inGame, 'live');
  set('bans', Object.keys(S.bans).length);
  const tab = S.el.querySelector('.ap-tabs i'); if (tab) { tab.hidden = !t.inGame; tab.textContent = t.inGame; }
  if (S.pv) set('home', pvChanges().length || '', '');
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Rendu
// ════════════════════════════════════════════════════════════════════════════════════════════
function draw(sec) {
  if (!S.el) return;
  const box = S.el.querySelector(`.ap-sec[data-sec="${sec}"]`);
  if (!box) return;
  if (sec === 'overview') drawOverview(box);
  if (sec === 'live') drawLive(box);
  if (sec === 'home') drawHome();
  if (sec === 'bans') drawBans(box);
  if (sec === 'settings') drawSettings(box);
  if (sec === 'audience' || sec === 'journal') tools('', sec === 'audience' ? 'Pages vues, provenance, appareils' : 'Toutes les actions faites ici, jamais effaçables');
}

function tools(html, subtitle = '') {
  const t = S.el.querySelector('#ap-tools');
  if (t.dataset.k !== html) {
    const a = document.activeElement, id = a && t.contains(a) && a.id, pos = id && a.selectionStart;
    t.innerHTML = html; t.dataset.k = html;
    if (id) { const n = t.querySelector('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }
  }
  S.el.querySelector('#ap-sub').textContent = subtitle;
}

// Remplace le contenu sans perdre le défilement ni le champ en cours de saisie.
function paint(box, html) {
  if (box.__html === html) return;
  box.__html = html;
  const a = document.activeElement, id = a && box.contains(a) && a.id, pos = id && a.selectionStart;
  box.innerHTML = html;
  if (id) { const n = box.querySelector('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } }
}

const sw = (act, on, label, red = false) => `<label class="ap-switch${red ? ' red' : ''}"><input type="checkbox" data-act="${act}" ${on ? 'checked' : ''} aria-label="${esc(label)}"><i></i></label>`;
const tile = (k, c) => `<span class="tile" style="background:${c}">${icon(k)}</span>`;

// ── Vue d'ensemble ──
function drawOverview(box) {
  const t = totals(), d = S.today;
  tools(`<button class="ap-btn" type="button" data-act="refresh">${icon('undo')}Actualiser</button>`, 'GameHub en un coup d’œil');
  const delta = (n, p) => {
    if (!p) return n ? '<span class="ap-delta up">nouveau</span>' : '';
    const v = Math.round((n - p) / p * 100);
    return `<span class="ap-delta ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v)} %</span>`;
  };
  const shown = order().filter(id => BY_ID[id]);
  const visibleCount = shown.filter(id => !S.hidden[id]).length;
  const rooms = t.active.slice(0, 6);
  const maint = S.settings.maintenance === true;
  paint(box, `
    ${maint ? `<div class="ap-note red">${icon('warn')}<div><b>Le site est en maintenance.</b><br>Les visiteurs voient l’écran de maintenance, les parties sont gelées.</div><button class="ap-btn danger" type="button" data-act="maint-off">Rouvrir le site</button></div>` : ''}
    <div class="ap-kpis">
      <button class="ap-kpi" type="button" data-go="live"><span class="k"><span class="ap-dot on"></span>Sur le site maintenant</span><span class="n">${nf.format(S.visitors + t.onNow)}</span><span class="s">${plural(S.visitors, 'sur l’accueil', 'sur l’accueil')} · ${plural(t.onNow, 'en partie', 'en partie')}</span></button>
      <button class="ap-kpi" type="button" data-go="live"><span class="k">Joueurs en partie</span><span class="n">${nf.format(t.inGame)}</span><span class="s">${t.onNow} connecté${t.onNow > 1 ? 's' : ''}, présence vérifiée</span></button>
      <button class="ap-kpi" type="button" data-go="live"><span class="k">Parties actives</span><span class="n">${nf.format(t.active.length)}</span><span class="s">${t.idle ? `${plural(t.idle, 'inactive')} à nettoyer` : 'aucune partie fantôme'}</span></button>
      <button class="ap-kpi" type="button" data-go="audience"><span class="k">Pages vues · 24 h</span><span class="n">${d ? nf.format(d.totals.views) : '—'}</span><span class="s">${d ? (d.previous ? `${delta(d.totals.views, d.previous.views)} vs les 24 h d’avant` : `${nf.format(d.totals.entries)} arrivées`) : (S.todayErr || 'Chargement…')}</span></button>
    </div>
    <div class="ap-cols">
      <div>
        <div class="ap-group-h"><h2>Parties en cours</h2><button class="link" type="button" data-go="live">Tout voir</button></div>
        <div class="ap-group ap-rooms">${rooms.length ? rooms.map(roomRow).join('') : '<div class="ap-empty"><b>Aucune partie en cours</b>Les nouvelles parties s’affichent ici en direct.</div>'}</div>
        <div class="ap-group-h"><h2>Accueil</h2><p>${visibleCount} jeu${visibleCount > 1 ? 'x' : ''} affiché${visibleCount > 1 ? 's' : ''} sur ${shown.length}</p></div>
        <div class="ap-group"><div class="ap-shelf">${shown.map(id => `<button type="button" class="${S.hidden[id] ? 'off' : ''}" data-act="edit-game" data-id="${id}"><img src="${cover(BY_ID[id])}" alt="" loading="lazy" decoding="async"><span>${esc(nameFor(id))}</span></button>`).join('')}</div></div>
      </div>
      <div>
        <div class="ap-group-h"><h2>Contrôles rapides</h2></div>
        <div class="ap-group">
          <div class="ap-row ico">${tile('warn', '#E5484D')}<div class="main"><div class="t">Maintenance</div><div class="d">Ferme tout le site, gèle les parties</div></div>${sw('maint', maint, 'Maintenance', true)}</div>
          <div class="ap-row ico">${tile('lock', '#2F6BFF')}<div class="main"><div class="t">Vérification d’âge</div><div class="d">Date de naissance avant d’entrer</div></div>${sw('age', S.settings.ageGate !== false, 'Vérification d’âge')}</div>
          <button class="ap-row ico" type="button" data-go="home">${tile('home', '#FF5A3C')}<div class="main"><div class="t">Modifier l’accueil</div><div class="d">Ordre, noms, jeux masqués</div></div>${icon('chev', 'chev')}</button>
          <button class="ap-row ico" type="button" data-go="bans">${tile('bans', '#E5484D')}<div class="main"><div class="t">Bannis</div><div class="d">${S.bansDenied ? 'Règles de la base à publier' : plural(Object.keys(S.bans).length, 'compte banni', 'comptes bannis')}</div></div>${icon('chev', 'chev')}</button>
          ${t.idle ? `<button class="ap-row ico" type="button" data-act="cleanup">${tile('broom', '#E8A317')}<div class="main"><div class="t">Nettoyer les parties inactives</div><div class="d">${plural(t.idle, 'partie')} sans signe de vie</div></div>${icon('chev', 'chev')}</button>` : ''}
        </div>
        <div class="ap-group-h"><h2>Dernières actions</h2><button class="link" type="button" data-go="journal">Journal</button></div>
        <div class="ap-group">${S.recent.length ? S.recent.map(e => `<div class="ap-row"><div class="main"><div class="t">${esc(e.msg)}</div><div class="d">${esc(CATS[e.cat] || e.cat)}${e.target ? ' · ' + esc(e.target) : ''}</div></div><span class="v">${ago(e.ts)}</span></div>`).join('') : '<div class="ap-empty">Aucune action pour l’instant.</div>'}</div>
      </div>
    </div>`);
}

async function loadToday() {
  try {
    const res = await fetch(`${S.dev || ''}/_stats/summary?range=24h&game=all`, { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'Service de mesure absent' : 'Service indisponible');
    S.today = await res.json();
  } catch (e) { S.todayErr = e.message || 'Indisponible'; }
  schedule();
}
async function token() {
  if (S.dev) return 'dev';
  await auth.authStateReady();
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Accès refusé');
  return auth.currentUser.getIdToken();
}

// ── En direct ──
function roomRow(x) {
  const r = x.r, [ph, phc] = phaseOf(r.f.phase);
  const dots = x.players.slice(0, 8).map(p => `<span class="ap-dot ${p.st === 'on' ? 'on' : p.st === 'off' ? 'off' : ''}" title="${esc(p.name)}"></span>`).join('');
  return `<div class="ap-row" role="button" tabindex="0" data-act="room" data-key="${esc(r.key)}" aria-selected="${S.live.sel === r.key}">
    <img class="ap-thumb" src="${cover(r.g)}" alt="" loading="lazy" decoding="async">
    <div class="main"><div class="t">${esc(r.g.name)} · <span style="letter-spacing:.04em">${esc(r.code)}</span></div>
      <div class="d">${plural(x.players.length, 'joueur')}${x.last ? ' · ' + ago(x.last) : x.created ? ' · créée ' + ago(x.created) : ''}</div></div>
    <span class="ap-stack" aria-hidden="true">${dots}</span>
    <span class="ap-pill ${x.idle ? '' : phc}">${x.idle ? 'Inactive' : ph}</span>
  </div>`;
}

function liveFilter(rooms) {
  const q = S.live.q.toLowerCase();
  return rooms.filter(x => (S.live.game === 'all' || x.r.g.id === S.live.game) && (S.live.idle || !x.idle) &&
    (!q || `${x.r.code} ${x.r.g.name}`.toLowerCase().includes(q) || x.players.some(p => String(p.name || '').toLowerCase().includes(q))));
}

function drawLive(box) {
  const t = totals();
  const counts = {};
  t.rooms.forEach(x => { counts[x.r.g.id] = (counts[x.r.g.id] || 0) + 1; });
  tools(`<div class="ap-seg" role="group" aria-label="Affichage"><button type="button" data-act="lv-view" data-v="rooms" aria-pressed="${S.live.view === 'rooms'}">Parties</button><button type="button" data-act="lv-view" data-v="players" aria-pressed="${S.live.view === 'players'}">Joueurs</button></div>
    <select class="ap-field" data-act="lv-game" aria-label="Jeu"><option value="all">Tous les jeux</option>${CATALOG.map(g => `<option value="${g.id}">${esc(g.name)}${counts[g.id] ? ` (${counts[g.id]})` : ''}</option>`).join('')}</select>
    <input class="ap-field" id="ap-live-q" type="search" placeholder="Rechercher" aria-label="Rechercher un joueur ou une partie" value="${esc(S.live.q)}" style="width:170px">
    <button class="ap-btn" type="button" data-act="cleanup" ${t.idle ? '' : 'disabled'}>${icon('broom')}Nettoyer${t.idle ? ` (${t.idle})` : ''}</button>`,
    `${plural(t.active.length, 'partie active', 'parties actives')} · temps réel`);
  const sel = S.el.querySelector('[data-act="lv-game"]'); if (sel) sel.value = S.live.game;
  const rooms = liveFilter(t.rooms);
  const strip = `<div class="ap-strip"><span><b>${S.visitors}</b>sur l’accueil</span><span><b>${t.onNow}</b>connectés en partie</span><span><b>${t.inGame}</b>joueurs dans les parties actives</span><span><b>${t.idle}</b>parties inactives</span>
    <label style="margin-left:auto;display:inline-flex;align-items:center;gap:8px">Montrer les inactives ${sw('lv-idle', S.live.idle, 'Montrer les parties inactives')}</label></div>`;
  if (S.live.sel && !S.rooms.has(S.live.sel)) S.live.sel = null;
  if (S.live.view === 'players') {
    const rows = [];
    for (const x of rooms) for (const p of x.players) rows.push({ x, p });
    const q = S.live.q.toLowerCase();
    const list = rows.filter(({ x, p }) => !q || `${p.name} ${x.r.code} ${x.r.g.name}`.toLowerCase().includes(q))
      .sort((a, b) => (a.p.st === 'on' ? 0 : 1) - (b.p.st === 'on' ? 0 : 1) || String(a.p.name).localeCompare(String(b.p.name), 'fr'));
    paint(box, strip + `<div class="ap-group">${list.length ? `<table class="ap-table"><thead><tr><th>Joueur</th><th>Jeu</th><th class="hide-s">Partie</th><th>Statut</th><th></th></tr></thead><tbody>
      ${list.map(({ x, p }) => `<tr><td><span class="who"><span class="ap-av" style="background:${avColor(p.name)}">${esc(initial(p.name))}</span>${esc(p.name)}${p.host ? icon('crown', 'ap-host') : ''}</span></td>
        <td>${esc(x.r.g.name)}</td><td class="hide-s"><button class="ap-code" type="button" data-act="room" data-key="${esc(x.r.key)}">${esc(x.r.code)}</button></td>
        <td>${status(p)}</td><td class="r"><button class="ap-icon-btn" type="button" data-act="pmenu" data-key="${esc(x.r.key)}" data-p="${esc(p.key)}" aria-label="Actions pour ${esc(p.name)}">${icon('more')}</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="ap-empty"><b>${q ? 'Aucun joueur ne correspond' : 'Personne en partie'}</b>${q ? 'Essaie un autre nom ou un code.' : 'Les joueurs apparaissent ici dès qu’ils rejoignent une partie.'}</div>`}</div>`);
    return;
  }
  const detail = S.live.sel && innerWidth > 1100 ? roomDetail(S.rooms.get(S.live.sel)) : '';
  paint(box, strip + `<div class="ap-md${detail ? '' : ' solo'}">
    <div class="ap-group ap-rooms">${rooms.length ? rooms.map(roomRow).join('') : `<div class="ap-empty"><b>Aucune partie</b>${S.live.game !== 'all' || S.live.q ? 'Rien ne correspond à ce filtre.' : 'Les parties apparaissent ici dès leur création.'}</div>`}</div>
    ${detail ? `<div class="ap-detail">${detail}</div>` : ''}</div>`);
  if (S.live.sel && innerWidth <= 1100) sheet(roomDetail(S.rooms.get(S.live.sel)), 'room');
}

function status(p) {
  return p.st === 'on' ? '<span class="ap-pill green">En ligne</span>' : p.st === 'off' ? '<span class="ap-pill amber">Absent</span>' : '<span class="ap-pill" title="Ce jeu ne signale pas la présence">Inscrit</span>';
}

function roomDetail(r) {
  if (!r) return '';
  const x = roomInfo(r), [ph, phc] = phaseOf(r.f.phase);
  const banned = Object.keys(r.f.banned || {});
  return `<div class="ap-card">
    <div class="ap-detail-h"><img src="${cover(r.g)}" alt=""><div style="min-width:0;flex:1"><h3>${esc(r.g.name)}</h3>
      <button class="ap-code" type="button" data-act="copy" data-v="${esc(r.code)}" aria-label="Copier le code ${esc(r.code)}">${esc(r.code)}${icon('copy')}</button></div>
      <button class="ap-icon-btn" type="button" data-act="room-close" aria-label="Fermer">${icon('close')}</button></div>
    <div class="ap-meta"><div><b><span class="ap-pill ${x.idle ? '' : phc}">${x.idle ? 'Inactive' : ph}</span></b>État</div><div><b>${r.g.presence ? `${x.on}/${x.players.length}` : x.players.length}</b>${r.g.presence ? 'Connectés' : 'Inscrits'}</div><div><b>${x.created ? ago(x.created).replace('il y a ', '') : '—'}</b>Créée</div></div>
    <div>${x.players.length ? x.players.map(p => `<div class="ap-row ico"><span class="ap-av" style="background:${avColor(p.name)}">${esc(initial(p.name))}</span>
      <div class="main"><div class="t">${esc(p.name)}${p.host ? icon('crown', 'ap-host') : ''}</div><div class="d">${p.host ? 'Hôte · ' : ''}${p.st === 'on' ? 'En ligne' : p.st === 'off' ? 'Absent' : 'Présence non suivie par ce jeu'}</div></div>
      <span class="ap-dot ${p.st === 'on' ? 'on' : p.st === 'off' ? 'off' : ''}"></span>
      <button class="ap-icon-btn" type="button" data-act="pmenu" data-key="${esc(r.key)}" data-p="${esc(p.key)}" aria-label="Actions pour ${esc(p.name)}">${icon('more')}</button></div>`).join('') : '<div class="ap-empty">Aucun joueur.</div>'}</div>
    ${banned.length ? `<div class="ap-row"><div class="main"><div class="t">${plural(banned.length, 'compte exclu', 'comptes exclus')} de cette partie</div><div class="d">Ils ne peuvent plus y revenir</div></div><button class="ap-btn sm" type="button" data-act="unban-room" data-key="${esc(r.key)}">Tout lever</button></div>` : ''}
    <div style="padding:12px 14px 14px;display:flex;gap:8px;border-top:1px solid var(--ap-sep)"><button class="ap-btn danger" style="flex:1" type="button" data-act="del-room" data-key="${esc(r.key)}">${icon('trash')}Supprimer la partie</button></div>
  </div>`;
}

// ── Bannis ──
function drawBans(box) {
  tools('', 'Comptes privés de toutes les parties');
  const list = Object.entries(S.bans).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  paint(box, `
    ${S.bansDenied ? rulesNote() : ''}
    <div class="ap-group-h"><h2>${plural(list.length, 'compte banni', 'comptes bannis')}</h2></div>
    <div class="ap-group">${list.length ? list.map(([uid, b]) => `<div class="ap-row ico"><span class="ap-av" style="background:${avColor(b.name || uid)}">${esc(initial(b.name || '?'))}</span>
      <div class="main"><div class="t">${esc(b.name || 'Joueur sans nom')}</div><div class="d">${b.at ? 'Banni ' + ago(b.at) : ''}${b.why ? ' · ' + esc(b.why) : ''} · compte ${esc(uid.slice(0, 8))}…</div></div>
      <button class="ap-btn sm" type="button" data-act="unban" data-uid="${esc(uid)}">Lever</button></div>`).join('') : '<div class="ap-empty"><b>Personne n’est banni</b>Depuis « En direct », le menu ⋯ d’un joueur permet de le bannir du site.</div>'}</div>
    <p class="ap-foot">Un compte banni ne peut plus créer, rejoindre ni lire aucune partie. Le bannissement vise le navigateur du joueur (son compte anonyme) : en vidant ses données de navigation, il obtient un nouveau compte.</p>`);
}

function rulesNote() {
  return `<div class="ap-note">${icon('info')}<div><b>Règles de la base à publier.</b> Cette fonction s’appuie sur de nouvelles règles (firebase/database.rules.phase2.json), pas encore en ligne : la lecture et l’écriture sont refusées jusque-là.</div></div>`;
}

// ── Réglages ──
function drawSettings(box) {
  tools('', 'Accès au site et actions globales');
  const t = totals();
  paint(box, `
    <div class="ap-group-h"><h2>Accès au site</h2></div>
    <div class="ap-group">
      <div class="ap-row ico">${tile('warn', '#E5484D')}<div class="main"><div class="t">Maintenance</div><div class="d">Toutes les pages affichent l’écran de maintenance, les parties sont gelées</div></div>${sw('maint', S.settings.maintenance === true, 'Maintenance', true)}</div>
      <div class="ap-row ico">${tile('lock', '#2F6BFF')}<div class="main"><div class="t">Vérification d’âge</div><div class="d">Demande la date de naissance avant d’entrer</div></div>${sw('age', S.settings.ageGate !== false, 'Vérification d’âge')}</div>
    </div>
    <div class="ap-group-h"><h2>Parties</h2></div>
    <div class="ap-group">
      <div class="ap-row ico">${tile('broom', '#E8A317')}<div class="main"><div class="t">Parties inactives</div><div class="d">${t.idle ? `${plural(t.idle, 'partie')} sans joueur connecté ni signe de vie depuis 3 h` : 'Aucune pour l’instant'}</div></div><button class="ap-btn sm" type="button" data-act="cleanup" ${t.idle ? '' : 'disabled'}>Nettoyer</button></div>
    </div>
    <div class="ap-group-h"><h2>Compteur historique</h2></div>
    <div class="ap-group">
      <div class="ap-row ico">${tile('audience', '#8E8E93')}<div class="main"><div class="t">Visites comptées : ${S.visits == null ? '—' : nf.format(S.visits)}</div><div class="d">Ancien compteur de l’accueil, sans période. La rubrique Audience le remplace.</div></div><button class="ap-btn sm" type="button" data-act="reset-visits">Remettre à zéro</button></div>
    </div>
    <div class="ap-group-h"><h2 style="color:var(--ap-red)">Zone sensible</h2></div>
    <div class="ap-group">
      <button class="ap-row ico danger" type="button" data-act="del-all">${tile('trash', '#E5484D')}<div class="main"><div class="t">Supprimer toutes les parties</div><div class="d">Irréversible : toutes les parties de tous les jeux, pour tous les joueurs</div></div></button>
    </div>`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Accueil : aperçu modifiable
// ════════════════════════════════════════════════════════════════════════════════════════════
const defaults = () => (window.hubDefaults ? window.hubDefaults() : {});
function order() {
  const D = defaults(), ids = Object.keys(D).sort((a, b) => D[a].i - D[b].i);
  if (S.pv) return S.pv.order;
  const o = String((S.layout && S.layout.order) || '').split(',').filter(id => D[id]);
  return [...o, ...ids.filter(id => !o.includes(id))];
}
function nameFor(id) { return (S.pv && S.pv.g[id] && S.pv.g[id].name) || (S.layout && S.layout.games && S.layout.games[id] && S.layout.games[id].name) || (defaults()[id] || {}).name || BY_ID[id]?.name || id; }

// Valeurs publiées (défauts du hub + hub/layout + hub/hidden), une fiche par jeu.
function published() {
  const D = defaults(), L = S.layout || {}, over = L.games || {}, g = {};
  for (const [id, d] of Object.entries(D)) {
    const o = over[id] || {};
    g[id] = { name: o.name || d.name, sub: o.sub ?? d.sub, tags: o.tags ?? d.tags, wide: o.wide ?? d.wide, aband: o.aband ?? d.aband,
      wip: d.wip == null ? null : (o.wip ?? d.wip), hidden: !!S.hidden[id] };
  }
  const ids = Object.keys(D).sort((a, b) => D[a].i - D[b].i);
  const o = String(L.order || '').split(',').filter(id => D[id]);
  return { order: [...o, ...ids.filter(id => !o.includes(id))], g };
}

function initPreview() {
  if (!S.pv) S.pv = { ...published(), base: published(), sel: null, device: 'desktop', showHidden: true, filter: 'all' };
}
// Le brouillon suit les changements publiés ailleurs tant qu'il n'a pas été modifié.
function refreshBase() {
  if (!S.pv) return;
  const fresh = published();
  if (!pvChanges().length) Object.assign(S.pv, { order: fresh.order, g: fresh.g });
  S.pv.base = fresh;
}

const FIELD_LABEL = { name: 'nom', sub: 'sous-titre', tags: 'filtres', wide: 'carte large', aband: 'rangée', wip: 'fenêtre « nouvelle version »', hidden: 'visibilité' };
function pvChanges() {
  if (!S.pv) return [];
  const { base, g, order: o } = S.pv, out = [];
  if (o.join() !== base.order.join()) out.push({ k: 'order' });
  for (const id of Object.keys(g)) for (const f of Object.keys(FIELD_LABEL)) if (String(g[id][f]) !== String(base.g[id][f])) out.push({ k: f, id });
  return out;
}

function drawHome() {
  const box = S.el.querySelector('.ap-sec[data-sec="home"]');
  if (!box || !S.pv) return;
  refreshBase();
  const pv = S.pv, n = pvChanges().length;
  tools(`<div class="ap-seg" role="group" aria-label="Appareil"><button type="button" data-act="pv-device" data-v="desktop" aria-pressed="${pv.device === 'desktop'}">Ordinateur</button><button type="button" data-act="pv-device" data-v="mobile" aria-pressed="${pv.device === 'mobile'}">Mobile</button></div>
    <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)">Jeux masqués ${sw('pv-hidden', pv.showHidden, 'Montrer les jeux masqués dans l’aperçu')}</label>
    <button class="ap-btn" type="button" data-act="pv-reset" title="Revenir à la mise en page d’origine du site">Tout réinitialiser</button>`,
    'Glisse les cartes pour les ranger, touche-en une pour la modifier');
  const card = id => {
    const v = pv.g[id], d = defaults()[id] || {};
    if (!d.cover || (v.hidden && !pv.showHidden)) return '';
    const changed = pvChanges().some(c => c.id === id);
    const out = pv.filter !== 'all' && !String(v.tags).split(' ').includes(pv.filter);
    const badges = [v.hidden ? `<span>${icon('eyeoff')}Masqué</span>` : '', v.wip != null && v.wip >= 0 ? `<span>${v.wip} %</span>` : ''].join('');
    return `<div class="pv-card${v.hidden ? ' off' : ''}${pv.sel === id ? ' sel' : ''}${v.wide ? ' wide' : ''}${changed ? ' changed' : ''}${out ? ' out' : ''}" data-id="${id}" tabindex="0" role="button" aria-label="${esc(v.name)}${v.hidden ? ', masqué' : ''}">
      <img src="${esc(d.cover)}" alt="" draggable="false" decoding="async"><span class="pv-badges">${badges}</span>
      <span class="pv-cap"><b>${esc(v.name)}</b><small>${esc(v.sub)}</small></span></div>`;
  };
  const main = pv.order.filter(id => pv.g[id] && !pv.g[id].aband), ab = pv.order.filter(id => pv.g[id] && pv.g[id].aband);
  const count = main.filter(id => !pv.g[id].hidden).length;
  const insp = pv.sel && innerWidth > 1100 ? inspector(pv.sel) : '';
  const html = `
    ${S.layoutDenied ? rulesNote() : ''}
    <div class="pv-wrap${insp ? '' : ' closed'}">
      <div class="pv-window${pv.device === 'mobile' ? ' mobile' : ''}">
        <div class="pv-chrome"><i></i><i></i><i></i><span>roulia.me</span></div>
        <div class="pv-page">
          <div class="pv-top"><i></i>GameHub<em>${S.visitors} en ligne</em></div>
          <div class="pv-intro"><div><h2>On joue ?</h2><p>${WORDS[count] || count} jeu${count > 1 ? 'x' : ''} en ligne, sans compte. Crée une partie, partage le code.</p></div>
            <div class="pv-chips">${[['all', 'Tous'], ...TAGS].map(([k, t]) => `<button type="button" data-act="pv-filter" data-v="${k}" aria-pressed="${pv.filter === k}">${t}</button>`).join('')}</div></div>
          <div class="pv-grid" data-zone="main">${main.map(card).join('')}</div>
          <div class="pv-aband-h">Abandonnés · bouton discret, visible s’il reste un jeu affiché</div>
          <div class="pv-grid pv-aband" data-zone="aband">${ab.map(card).join('')}</div>
        </div>
      </div>
      ${insp ? `<aside class="pv-insp ap-card" aria-label="Réglages du jeu">${insp}</aside>` : ''}
    </div>
    <div class="pv-publish${n ? '' : ' gone'}" role="status"><span><b>${n}</b> modification${n > 1 ? 's' : ''} non publiée${n > 1 ? 's' : ''}</span>
      <button class="ap-btn ghost" type="button" data-act="pv-discard">Annuler</button><button class="ap-btn primary" type="button" data-act="pv-publish">Publier</button></div>`;
  if (!drag.on) {
    const keepInsp = box.querySelector('.pv-insp');
    const focusInInsp = keepInsp && keepInsp.contains(document.activeElement) && document.activeElement.matches('input[type=text]');
    if (focusInInsp && insp) {
      // Saisie en cours : on ne retouche que l'aperçu et la barre de publication.
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      box.querySelector('.pv-window').replaceWith(tmp.querySelector('.pv-window'));
      box.querySelector('.pv-publish').replaceWith(tmp.querySelector('.pv-publish'));
      box.__html = null;
    } else paint(box, html);
    wireDrag(box);
  }
  if (pv.sel && innerWidth <= 1100 && !document.querySelector('.ap-sheet[data-k="game"]')) sheet(`<div class="pv-insp">${inspector(pv.sel)}</div>`, 'game');
  badges();
}

function inspector(id) {
  const v = S.pv.g[id], d = defaults()[id] || {}, D = d;
  const idx = S.pv.order.indexOf(id);
  const live = totals().rooms.filter(x => x.r.g.id === id && !x.idle);
  const players = live.reduce((s, x) => s + x.players.length, 0);
  const tags = String(v.tags).split(' ').filter(Boolean);
  return `
    <div class="pv-insp-h"><img src="${esc(d.cover)}" alt=""><div style="flex:1;min-width:0"><h3>${esc(v.name)}</h3><p>${live.length ? `${plural(live.length, 'partie')} · ${plural(players, 'joueur')} en ce moment` : 'Aucune partie en cours'}</p></div>
      <button class="ap-icon-btn" type="button" data-act="pv-close" aria-label="Fermer">${icon('close')}</button></div>
    <div style="padding:0 12px 14px">
      <div class="ap-group">
        <label class="ap-row"><div class="main"><div class="t">Affiché sur l’accueil</div><div class="d">Masqué, sa page se ferme aussi</div></div>${sw('pv-f-hidden', !v.hidden, 'Affiché sur l’accueil')}</label>
      </div>
      <div class="ap-group-h"><h2 style="font-size:13px;color:var(--muted);font-weight:600">Carte</h2></div>
      <div class="ap-group">
        <label class="ap-row"><span class="t" style="flex:none">Nom</span><input type="text" id="pv-name" data-f="name" maxlength="40" value="${esc(v.name)}" placeholder="${esc(D.name)}"></label>
        <label class="ap-row"><span class="t" style="flex:none">Sous-titre</span><input type="text" id="pv-sub" data-f="sub" maxlength="40" value="${esc(v.sub)}" placeholder="${esc(D.sub)}"></label>
        <label class="ap-row"><div class="main"><div class="t">Grande carte sur mobile</div><div class="d">Occupe toute la largeur</div></div>${sw('pv-f-wide', v.wide, 'Grande carte sur mobile')}</label>
        <div class="ap-row"><span class="t" style="flex:1">Rangée</span><div class="ap-seg"><button type="button" data-act="pv-aband" data-v="0" aria-pressed="${!v.aband}">Principale</button><button type="button" data-act="pv-aband" data-v="1" aria-pressed="${!!v.aband}">Abandonnés</button></div></div>
      </div>
      <div class="ap-group-h"><h2 style="font-size:13px;color:var(--muted);font-weight:600">Filtres de l’accueil</h2></div>
      <div class="ap-group"><div class="pv-tags">${TAGS.map(([k, t]) => `<button type="button" data-act="pv-tag" data-v="${k}" aria-pressed="${tags.includes(k)}">${t}</button>`).join('')}</div></div>
      ${v.wip != null ? `<div class="ap-group-h"><h2 style="font-size:13px;color:var(--muted);font-weight:600">Nouvelle version en préparation</h2></div>
      <div class="ap-group">
        <label class="ap-row"><div class="main"><div class="t">Fenêtre avant le jeu</div><div class="d">Annonce la refonte, propose l’ancienne version</div></div>${sw('pv-f-wip', v.wip >= 0, 'Fenêtre nouvelle version')}</label>
        ${v.wip >= 0 ? `<div class="pv-range"><span style="font-size:13px;color:var(--muted)">Avancement</span><input type="range" min="0" max="100" step="5" value="${v.wip}" data-act="pv-wip" aria-label="Avancement de la nouvelle version"><b>${v.wip} %</b></div>` : ''}
      </div>` : ''}
      <div class="ap-group-h"><h2 style="font-size:13px;color:var(--muted);font-weight:600">Position · ${idx + 1} sur ${S.pv.order.length}</h2></div>
      <div class="ap-group"><div class="pv-pos">
        <button class="ap-btn" type="button" data-act="pv-move" data-v="first" ${idx === 0 ? 'disabled' : ''} aria-label="Placer en premier">${icon('first')}</button>
        <button class="ap-btn" type="button" data-act="pv-move" data-v="-1" ${idx === 0 ? 'disabled' : ''}>${icon('arrowl')}Avant</button>
        <button class="ap-btn" type="button" data-act="pv-move" data-v="1" ${idx === S.pv.order.length - 1 ? 'disabled' : ''}>Après${icon('arrowr')}</button>
      </div></div>
      <button class="ap-btn ghost" style="width:100%;margin-top:12px" type="button" data-act="pv-restore">Valeurs d’origine pour ce jeu</button>
    </div>`;
}

function pvSet(id, f, v) { S.pv.g[id][f] = v; drawHome(); refreshSheet(); }
function refreshSheet() {
  const sh = document.querySelector('.ap-sheet[data-k="game"]');
  if (sh && S.pv.sel) sh.innerHTML = `<div class="pv-insp">${inspector(S.pv.sel)}</div>`;
}

async function publishHome() {
  const pv = S.pv, D = defaults(), changes = pvChanges();
  if (!changes.length) return;
  for (const id of Object.keys(pv.g)) {
    const v = pv.g[id];
    v.name = String(v.name || '').replace(/</g, '').trim().slice(0, 40) || D[id].name;
    v.sub = String(v.sub || '').replace(/</g, '').trim().slice(0, 40);
  }
  // Seules les valeurs qui diffèrent du site d'origine sont écrites.
  const games = {};
  for (const [id, v] of Object.entries(pv.g)) {
    const d = D[id], o = {};
    if (v.name !== d.name) o.name = v.name;
    if (v.sub !== d.sub) o.sub = v.sub;
    if (v.tags !== d.tags) o.tags = v.tags;
    if (v.wide !== d.wide) o.wide = v.wide;
    if (v.aband !== d.aband) o.aband = v.aband;
    if (d.wip != null && v.wip !== d.wip) o.wip = v.wip;
    if (Object.keys(o).length) games[id] = o;
  }
  const layout = { order: pv.order.join(','), v: Date.now(), ...(Object.keys(games).length ? { games } : {}) };
  const hidden = {};
  for (const c of changes) if (c.k === 'hidden') hidden[c.id] = pv.g[c.id].hidden;
  const btn = S.el.querySelector('[data-act="pv-publish"]'); if (btn) btn.disabled = true;
  try {
    if (Object.keys(hidden).length) await update(ref(db, 'hub/hidden'), hidden);
    if (changes.some(c => c.k !== 'hidden')) await set(ref(db, 'hub/layout'), layout);
  } catch (e) {
    if (btn) btn.disabled = false;
    if (isDenied(e)) { await ask({ title: 'Publication refusée', text: 'Les règles de la base ne permettent pas encore de changer l’ordre, les noms ou les filtres. Publie d’abord firebase/database.rules.phase2.json dans la console Firebase. Les jeux masqués ou affichés, eux, ont été enregistrés.', ok: 'Compris', single: true }); return; }
    toast('Échec de la publication', true); return;
  }
  for (const c of describe(changes)) logAdmin('jeu', c.msg, c.id);
  S.hidden = { ...S.hidden, ...hidden };
  S.layout = layout;
  S.pv.base = published();
  toast('Accueil publié');
  drawHome();
}

function describe(changes) {
  const out = [], seen = new Set(), pv = S.pv;
  for (const c of changes) {
    if (c.k === 'order') { out.push({ msg: 'Ordre des jeux de l’accueil modifié', id: 'accueil' }); continue; }
    const name = pv.g[c.id].name;
    if (c.k === 'hidden') out.push({ msg: `${name} ${pv.g[c.id].hidden ? 'masqué de' : 'affiché sur'} l’accueil`, id: c.id });
    else if (!seen.has(c.id + c.k)) { seen.add(c.id + c.k); out.push({ msg: `${name} : ${FIELD_LABEL[c.k]} modifié${c.k === 'name' ? ` (« ${pv.base.g[c.id].name} » → « ${name} »)` : ''}`, id: c.id }); }
  }
  return out;
}

// ── Glisser-déposer des cartes (souris, stylet ; au doigt après un appui long) ──
const drag = { on: false };
function wireDrag(box) {
  if (box.__wired) return;
  box.__wired = true;
  box.addEventListener('pointerdown', e => {
    const c = e.target.closest('.pv-card');
    if (!c || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY }, touch = e.pointerType === 'touch';
    let timer = 0, started = false;
    const begin = () => { started = true; startDrag(c, start.x, start.y, e.pointerId); };
    if (touch) timer = setTimeout(begin, 320);
    const move = ev => {
      if (started) return;
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (touch ? dist > 10 : dist > 5) { clearTimeout(timer); if (!touch) begin(); else cleanup(); }
    };
    const up = () => { clearTimeout(timer); cleanup(); };
    const cleanup = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  // Empêche le défilement de la page pendant un glisser au doigt.
  box.addEventListener('touchmove', e => { if (drag.on) e.preventDefault(); }, { passive: false });
}

function startDrag(card, x, y) {
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add('pv-ghost'); ghost.classList.remove('sel', 'ph');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  S.el.append(ghost);   // dans le panneau : mêmes variables CSS
  card.classList.add('ph');
  drag.on = true;
  document.documentElement.classList.add('pv-dragging');
  if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}
  const off = { x: x - r.left, y: y - r.top };
  let last = { x, y }, frame = 0;
  ghost.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06) rotate(-1.5deg)' }], { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
  const place = () => {
    frame = 0;
    ghost.style.left = last.x - off.x + 'px'; ghost.style.top = last.y - off.y + 'px';
    const zones = [...S.el.querySelectorAll('.pv-grid')];
    const zone = zones.find(z => { const b = z.getBoundingClientRect(); return last.x >= b.left - 20 && last.x <= b.right + 20 && last.y >= b.top - 20 && last.y <= b.bottom + 20; });
    zones.forEach(z => z.classList.toggle('drop', z === zone && z !== card.parentElement));
    if (!zone) return;
    const others = [...zone.querySelectorAll('.pv-card:not(.ph)')];
    let target = null, after = false;
    for (const o of others) {
      const b = o.getBoundingClientRect();
      if (last.x >= b.left && last.x <= b.right && last.y >= b.top && last.y <= b.bottom) { target = o; after = last.x > b.left + b.width / 2; break; }
    }
    if (!target && others.length) {
      // Sous la dernière rangée ou dans un vide : la carte la plus proche.
      let best = Infinity;
      for (const o of others) { const b = o.getBoundingClientRect(); const dd = Math.hypot(last.x - (b.left + b.width / 2), last.y - (b.top + b.height / 2)); if (dd < best) { best = dd; target = o; after = last.x > b.left + b.width / 2 || last.y > b.bottom; } }
    }
    const ref = target ? (after ? target.nextSibling : target) : null;
    if (card.parentElement === zone && (ref === card || card.nextSibling === ref)) return;
    flip(() => zone.insertBefore(card, ref));
  };
  const move = e => { last = { x: e.clientX, y: e.clientY }; if (!frame) frame = requestAnimationFrame(place); autoscroll(e.clientY); };
  const end = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    cancelAnimationFrame(frame); stopScroll();
    S.el.querySelectorAll('.pv-grid').forEach(z => z.classList.remove('drop'));
    // La carte se pose à sa nouvelle place.
    const to = card.getBoundingClientRect(), gx = parseFloat(ghost.style.left), gy = parseFloat(ghost.style.top), gw = ghost.offsetWidth, gh = ghost.offsetHeight;
    const cur = getComputedStyle(ghost).transform;
    ghost.getAnimations().forEach(a => a.cancel());
    const sx = to.width / gw, sy = to.height / gh;
    ghost.animate([{ transform: cur === 'none' ? 'none' : cur },
      { transform: `translate(${to.left - gx + (to.width - gw) / 2}px, ${to.top - gy + (to.height - gh) / 2}px) scale(${sx}, ${sy})` }],
      { duration: 260, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' })
      .finished.catch(() => {}).then(() => {
        ghost.remove(); card.classList.remove('ph');
        drag.on = false; document.documentElement.classList.remove('pv-dragging');
        const ids = z => [...S.el.querySelectorAll(`.pv-grid[data-zone="${z}"] .pv-card`)].map(c => c.dataset.id);
        const main = ids('main'), ab = ids('aband');
        // Les jeux masqués absents de l'aperçu gardent leur place relative, en fin de liste.
        const hiddenOut = S.pv.order.filter(id => !main.includes(id) && !ab.includes(id));
        ab.forEach(id => { S.pv.g[id].aband = true; }); main.forEach(id => { S.pv.g[id].aband = false; });
        S.pv.order = [...main, ...ab, ...hiddenOut];
        drawHome();
      });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

function flip(mutate) {
  const cards = [...S.el.querySelectorAll('.pv-grid .pv-card:not(.pv-ghost)')];
  const before = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
  mutate();
  for (const c of cards) {
    const a = before.get(c), b = c.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)' });
  }
}

let scrollTimer = 0;
function autoscroll(y) {
  const sc = S.el.querySelector('#ap-scroll'), b = sc.getBoundingClientRect();
  const v = y < b.top + 60 ? -12 : y > b.bottom - 60 ? 12 : 0;
  stopScroll();
  if (v) scrollTimer = setInterval(() => { sc.scrollTop += v; }, 16);
}
function stopScroll() { clearInterval(scrollTimer); scrollTimer = 0; }

// ════════════════════════════════════════════════════════════════════════════════════════════
// Audience et journal (modules existants)
// ════════════════════════════════════════════════════════════════════════════════════════════
async function mountAudienceSec() {
  const box = S.el.querySelector('.ap-sec[data-sec="audience"]');
  try {
    if (!S.audience) {
      box.innerHTML = '<div class="ap-empty">Chargement…</div>';
      const { mountAudience } = await import('./admin-audience.js');
      const root = document.createElement('div');
      box.replaceChildren(root);
      S.audience = mountAudience(root, { devEndpoint: S.dev || undefined, catalog: CATALOG });
    }
    S.audience.load();
  } catch (e) { box.innerHTML = '<div class="ap-empty"><b>Module Audience indisponible</b>Recharge la page.</div>'; }
}
function mountJournalSec() {
  const box = S.el.querySelector('.ap-sec[data-sec="journal"]');
  if (!S.journal) { const root = document.createElement('div'); root.className = 'ap-journal'; box.replaceChildren(root); S.journal = mountJournal(root); }
  S.journal.start();
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════════════════════════════════════
async function onClick(e) {
  const g = e.target.closest('[data-go]');
  if (g && S.el.contains(g)) { go(g.dataset.go); return; }
  const card = e.target.closest('.pv-card');
  if (card && !drag.on && !e.target.closest('.pv-ghost')) { S.pv.sel = S.pv.sel === card.dataset.id && innerWidth > 1100 ? null : card.dataset.id; drawHome(); return; }
  const a = e.target.closest('[data-act]');
  if (!a || a.tagName === 'INPUT' || a.tagName === 'SELECT') return;
  const act = a.dataset.act, room = a.dataset.key && S.rooms.get(a.dataset.key);
  switch (act) {
    case 'close': closeAdmin(); break;
    case 'refresh': syncRooms(); loadToday(); toast('Actualisé'); break;
    case 'room': S.live.sel = S.live.sel === a.dataset.key && innerWidth > 1100 ? null : a.dataset.key; if (S.sec !== 'live') { S.live.view = 'rooms'; go('live'); } else { S.live.view = 'rooms'; draw('live'); } break;
    case 'room-close': S.live.sel = null; closeSheet(); draw('live'); break;
    case 'lv-view': S.live.view = a.dataset.v; draw('live'); break;
    case 'copy': try { await navigator.clipboard.writeText(a.dataset.v); toast('Code copié'); } catch (_) {} break;
    case 'pmenu': playerMenu(a, room, a.dataset.p); break;
    case 'del-room': deleteRoom(room); break;
    case 'unban-room': if (room) { await update(ref(db, room.key), { banned: null }).catch(() => toast('Refusé', true)); logAdmin('joueur', `Exclusions levées pour la partie ${room.code}`, room.g.name); toast('Exclusions levées'); } break;
    case 'cleanup': cleanup(); break;
    case 'maint-off': setMaintenance(false); break;
    case 'unban': unban(a.dataset.uid); break;
    case 'reset-visits': if (await ask({ title: 'Remettre le compteur à zéro ?', text: 'L’ancien compteur de visites repart de 0. Les statistiques d’audience ne changent pas.', ok: 'Remettre à zéro', danger: true })) { await set(ref(db, 'hub/stats/visits'), 0); logAdmin('stats', 'Compteur historique de visites remis à zéro'); toast('Compteur remis à zéro'); } break;
    case 'del-all': deleteAll(); break;
    case 'edit-game': initPreview(); S.pv.sel = a.dataset.id; go('home'); break;
    case 'pv-device': S.pv.device = a.dataset.v; drawHome(); break;
    case 'pv-filter': S.pv.filter = a.dataset.v; drawHome(); break;
    case 'pv-close': S.pv.sel = null; closeSheet(); drawHome(); break;
    case 'pv-aband': pvSet(S.pv.sel, 'aband', a.dataset.v === '1'); break;
    case 'pv-tag': {
      const id = S.pv.sel, t = new Set(String(S.pv.g[id].tags).split(' ').filter(Boolean));
      t.has(a.dataset.v) ? t.delete(a.dataset.v) : t.add(a.dataset.v);
      pvSet(id, 'tags', TAGS.map(([k]) => k).filter(k => t.has(k)).join(' ')); break;
    }
    case 'pv-move': {
      const o = S.pv.order, id = S.pv.sel, i = o.indexOf(id);
      o.splice(i, 1);
      o.splice(a.dataset.v === 'first' ? 0 : Math.max(0, Math.min(o.length, i + Number(a.dataset.v))), 0, id);
      drawHome(); refreshSheet(); break;
    }
    case 'pv-restore': {
      const id = S.pv.sel, d = defaults()[id];
      Object.assign(S.pv.g[id], { name: d.name, sub: d.sub, tags: d.tags, wide: d.wide, aband: d.aband, wip: d.wip });
      drawHome(); refreshSheet(); toast('Valeurs d’origine rétablies (non publiées)'); break;
    }
    case 'pv-reset': {
      if (!(await ask({ title: 'Réinitialiser l’accueil ?', text: 'Ordre, noms, sous-titres et filtres reviennent à ceux du site d’origine, et tous les jeux sont affichés. Rien n’est publié tant que tu n’as pas cliqué sur Publier.', ok: 'Réinitialiser' }))) return;
      const D = defaults();
      S.pv.order = Object.keys(D).sort((x, y) => D[x].i - D[y].i);
      for (const [id, d] of Object.entries(D)) S.pv.g[id] = { name: d.name, sub: d.sub, tags: d.tags, wide: d.wide, aband: d.aband, wip: d.wip, hidden: false };
      drawHome(); break;
    }
    case 'pv-discard': S.pv.order = [...S.pv.base.order]; S.pv.g = JSON.parse(JSON.stringify(S.pv.base.g)); closeSheet(); drawHome(); break;
    case 'pv-publish': publishHome(); break;
  }
}

function onChange(e) {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const v = a.type === 'checkbox' ? a.checked : a.value;
  switch (a.dataset.act) {
    case 'maint': setMaintenance(v, a); break;
    case 'age': update(ref(db, 'hub/settings'), { ageGate: v }).then(() => { logAdmin('reglage', `Vérification d’âge ${v ? 'activée' : 'désactivée'}`); toast(`Vérification d’âge ${v ? 'activée' : 'désactivée'}`); }, () => { a.checked = !v; toast('Refusé', true); }); break;
    case 'lv-game': S.live.game = v; draw('live'); break;
    case 'lv-idle': S.live.idle = v; draw('live'); break;
    case 'pv-hidden': S.pv.showHidden = v; drawHome(); break;
    case 'pv-f-hidden': pvSet(S.pv.sel, 'hidden', !v); break;
    case 'pv-f-wide': pvSet(S.pv.sel, 'wide', v); break;
    case 'pv-f-wip': pvSet(S.pv.sel, 'wip', v ? Math.max(0, (defaults()[S.pv.sel] || {}).wip || 0) : -1); break;
  }
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'ap-live-q') { S.live.q = t.value.trim(); const q = S.el.querySelector('#ap-q'); if (q) q.value = t.value; draw('live'); return; }
  if (t.dataset.f && S.pv && S.pv.sel) { S.pv.g[S.pv.sel][t.dataset.f] = t.value.replace(/</g, ''); drawHome(); return; }
  if (t.dataset.act === 'pv-wip') { S.pv.g[S.pv.sel].wip = Number(t.value); t.nextElementSibling.textContent = t.value + ' %'; drawHome(); }
}

async function setMaintenance(on, input) {
  if (on && !(await ask({ title: 'Mettre le site en maintenance ?', text: 'Toutes les pages affichent l’écran de maintenance et les parties en cours sont gelées. Toi seul gardes l’accès dans cet onglet.', ok: 'Mettre en maintenance', danger: true }))) { if (input) input.checked = false; return; }
  if (on) { try { sessionStorage.setItem('gh-mx-admin', '1'); } catch (_) {} }
  try { await update(ref(db, 'hub/settings'), { maintenance: on }); } catch (_) { if (input) input.checked = !on; toast('Refusé', true); return; }
  logAdmin('reglage', `Maintenance ${on ? 'activée' : 'désactivée'}`);
  toast(on ? 'Site en maintenance' : 'Site rouvert');
}

async function deleteRoom(r) {
  if (!r) return;
  if (!(await ask({ title: `Supprimer la partie ${r.code} ?`, text: `${r.g.name} · ${plural(playersOf(r).length, 'joueur')}. Les joueurs sont renvoyés à l’accueil du jeu.`, ok: 'Supprimer', danger: true }))) return;
  try { await removeRoom(r); } catch (_) { toast('Suppression refusée', true); return; }
  logAdmin('partie', `Partie ${r.code} supprimée`, r.g.name);
  if (S.live.sel === r.key) { S.live.sel = null; closeSheet(); }
  toast('Partie supprimée');
}
async function removeRoom(r) {
  if (r.prefix === 'games') { await remove(ref(db, `ucSecret/${r.code}`)); await remove(ref(db, `ucHost/${r.code}`)); }
  await remove(ref(db, r.key));
  r.offs.forEach(f => f()); S.rooms.delete(r.key); schedule();
}

async function cleanup() {
  const idle = totals().rooms.filter(x => x.idle);
  if (!idle.length) return;
  const byGame = {};
  idle.forEach(x => { byGame[x.r.g.name] = (byGame[x.r.g.name] || 0) + 1; });
  if (!(await ask({ title: `Supprimer ${plural(idle.length, 'partie inactive', 'parties inactives')} ?`, text: `${Object.entries(byGame).map(([k, v]) => `${k} : ${v}`).join(' · ')}. Aucune n’a de joueur connecté ni de signe de vie depuis 3 h (ou elle est terminée).`, ok: 'Supprimer', danger: true }))) return;
  let n = 0;
  for (const x of idle) { try { await removeRoom(x.r); n++; } catch (_) {} }
  logAdmin('global', `${plural(n, 'partie inactive supprimée', 'parties inactives supprimées')}`, 'nettoyage');
  toast(`${plural(n, 'partie supprimée', 'parties supprimées')}`);
}

async function deleteAll() {
  if (!(await ask({ title: 'Supprimer TOUTES les parties ?', text: 'Irréversible : toutes les parties de tous les jeux, pour tous les joueurs. Écris SUPPRIMER pour confirmer.', ok: 'Tout supprimer', danger: true, input: { placeholder: 'SUPPRIMER', check: v => v === 'SUPPRIMER' ? '' : 'Écris SUPPRIMER en majuscules.' } }))) return;
  for (const g of CATALOG) { try { await remove(ref(db, g.db)); } catch (_) {} }
  await remove(ref(db, 'ucSecret')).catch(() => {}); await remove(ref(db, 'ucHost')).catch(() => {});
  for (const r of S.rooms.values()) r.offs.forEach(f => f());
  S.rooms.clear(); S.live.sel = null; schedule();
  logAdmin('global', 'Toutes les parties supprimées', 'tous les jeux');
  toast('Toutes les parties ont été supprimées');
}

// ── Joueurs ──
function playerMenu(anchor, r, key) {
  if (!r) return;
  const p = playersOf(r).find(x => x.key === key);
  if (!p) return;
  const items = [
    { t: 'Renommer', i: 'edit', f: () => renamePlayer(r, p) },
    { t: 'Exclure de la partie', i: 'kick', f: () => kick(r, p, {}), off: p.host, why: p.host ? 'L’hôte ne peut pas être exclu : supprime la partie.' : '' },
    { t: 'Exclure pour de bon', i: 'lock', f: () => kick(r, p, { ban: true }), off: p.host || !p.uid },
    '-',
    { t: 'Bannir du site', i: 'bans', danger: true, f: () => banSite(r, p), off: !p.uid },
  ];
  const note = p.host ? 'Hôte : pour l’écarter, supprime la partie.' : !p.uid ? 'Ce jeu ne relie pas ce joueur à son compte : exclusion simple seulement.' : '';
  menu(anchor, items, note);
}

const kickUpdates = (r, p) => {
  const u = {};
  if (r.g.keyed) {
    for (const n of ['members', 'players', 'presence', 'ready', 'prog']) u[`${n}/${p.uid}`] = null;
  } else {
    u[`players/${p.idx}`] = null;
    if (p.uid && p.uid !== r.f.hostUid) u[`members/${p.uid}`] = null;
    if (r.g.presence && p.presKey != null) u[`presence/${p.presKey}`] = null;
  }
  return u;
};

async function kick(r, p, { ban = false, silent = false } = {}) {
  if (!silent && !(await ask({ title: ban ? `Exclure ${p.name} pour de bon ?` : `Exclure ${p.name} ?`, text: ban ? `Retiré de la partie ${r.code} (${r.g.name}) et ne pourra plus y revenir.` : `Retiré de la partie ${r.code} (${r.g.name}). Il peut la rejoindre à nouveau tant qu’elle est dans le salon.`, ok: 'Exclure', danger: true }))) return false;
  const u = kickUpdates(r, p);
  if (ban && p.uid) u[`banned/${p.uid}`] = true;
  try { await update(ref(db, r.key), u); }
  catch (e) {
    if (ban && isDenied(e)) {   // règles pas encore publiées : on exclut au moins
      delete u[`banned/${p.uid}`];
      try { await update(ref(db, r.key), u); toast('Exclu (l’exclusion définitive attend les nouvelles règles)', true); } catch (_) { toast('Exclusion refusée', true); return false; }
    } else { toast('Exclusion refusée', true); return false; }
  }
  logAdmin('joueur', `${p.name} exclu de la partie ${r.code}${ban ? ' pour de bon' : ''}`, r.g.name);
  if (!silent) toast(`${p.name} exclu`);
  return true;
}

async function renamePlayer(r, p) {
  const max = NAME_MAX[r.prefix] || 30;
  const name = await ask({ title: `Renommer ${p.name}`, text: 'Pour un pseudo déplacé. Le joueur garde sa place dans la partie.', ok: 'Renommer',
    input: { value: p.name, max, check: v => !v.trim() ? 'Le nom ne peut pas être vide.' : /</.test(v) ? 'Caractère < interdit.' : v.trim().length > max ? `${max} caractères au plus.` : '' } });
  if (!name) return;
  const v = name.trim(), u = { [`${p.path}/name`]: v };
  if (r.prefix === 'mp' && p.uid) {
    const roster = await get(ref(db, `${r.key}/match/roster/${p.uid}`)).catch(() => null);
    if (roster && roster.exists()) u[`match/roster/${p.uid}/name`] = v;
  }
  try { await update(ref(db, r.key), u); } catch (_) { toast('Renommage refusé', true); return; }
  logAdmin('joueur', `${p.name} renommé « ${v} » dans la partie ${r.code}`, r.g.name);
  toast('Joueur renommé');
}

async function banSite(r, p) {
  const why = await ask({ title: `Bannir ${p.name} du site ?`, text: 'Il est retiré de cette partie et ne peut plus créer, rejoindre ni lire aucune partie, sur tous les jeux. Tu peux lever le bannissement dans « Bannis ».', ok: 'Bannir', danger: true,
    input: { value: '', placeholder: 'Motif (facultatif)', max: 120, optional: true, check: v => /</.test(v) ? 'Caractère < interdit.' : '' } });
  if (why === false) return;
  try { await set(ref(db, `bans/${p.uid}`), { at: Date.now(), name: String(p.name || '').replace(/</g, '').slice(0, 40), ...(why && why.trim() ? { why: why.trim() } : {}) }); }
  catch (e) { await ask({ title: 'Bannissement refusé', text: isDenied(e) ? 'Les règles de la base ne prévoient pas encore les bannissements : publie d’abord firebase/database.rules.phase2.json dans la console Firebase.' : 'Réessaie dans un instant.', ok: 'Compris', single: true }); return; }
  if (!p.host) await kick(r, p, { ban: true, silent: true });
  logAdmin('joueur', `${p.name} banni du site${why && why.trim() ? ` (${why.trim()})` : ''}`, r.g.name);
  toast(`${p.name} banni du site`);
}

async function unban(uid) {
  const b = S.bans[uid] || {};
  if (!(await ask({ title: `Lever le bannissement de ${b.name || 'ce compte'} ?`, text: 'Il pourra de nouveau jouer à tous les jeux.', ok: 'Lever' }))) return;
  try { await remove(ref(db, `bans/${uid}`)); } catch (_) { toast('Refusé', true); return; }
  logAdmin('joueur', `Bannissement de ${b.name || 'un compte'} levé`);
  toast('Bannissement levé');
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Alertes, menus, feuilles, messages
// ════════════════════════════════════════════════════════════════════════════════════════════
// Alerte façon iOS. Renvoie true / false, ou le texte saisi (false si annulé).
function ask({ title, text = '', ok = 'OK', danger = false, single = false, input = null }) {
  return new Promise(resolve => {
    const veil = document.createElement('div');
    veil.className = 'ap-veil';
    veil.innerHTML = `<div class="ap-alert" role="alertdialog" aria-modal="true" aria-labelledby="ap-al-t"><div class="body"><h3 id="ap-al-t">${esc(title)}</h3><p>${esc(text)}</p>
      ${input ? `<input type="text" maxlength="${input.max || 60}" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" aria-label="${esc(title)}"><div class="err"></div>` : ''}</div>
      <div class="acts${single ? ' one' : ''}">${single ? '' : '<button type="button" data-r="0">Annuler</button>'}<button type="button" data-r="1" class="${danger ? 'danger' : ''}">${esc(ok)}</button></div></div>`;
    S.el.append(veil);
    const field = veil.querySelector('input'), err = veil.querySelector('.err');
    const done = v => { veil.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const confirm = () => {
      if (!field) return done(true);
      const m = input.check ? input.check(field.value) : '';
      if (m) { err.textContent = m; field.focus(); return; }
      done(input.optional ? field.value : field.value || false);
    };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); confirm(); } };
    document.addEventListener('keydown', key, true);
    veil.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) b.dataset.r === '1' ? confirm() : done(false); else if (e.target === veil) done(false); });
    (field || veil.querySelector('[data-r="1"]')).focus();
    if (field) field.select();
  });
}

function menu(anchor, items, note = '') {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ap-menu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.off ? 'disabled' : ''}>${icon(it.i)}${esc(it.t)}</button>`).join('') + (note ? `<small>${esc(note)}</small>` : '');
  S.el.append(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenu(); items[b.dataset.i].f(); });
  setTimeout(() => {
    const away = e => { if (!m.contains(e.target)) closeMenu(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus(); } };
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
    m.__off = () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
  });
  m.querySelector('button:not(:disabled)')?.focus();
}
function closeMenu() { document.querySelectorAll('.ap-menu').forEach(m => { m.__off && m.__off(); m.remove(); }); }

// Feuille du bas (petits écrans) : détail d'une partie ou réglages d'un jeu.
function sheet(html, k) {
  let sh = document.querySelector(`.ap-sheet[data-k="${k}"]`);
  if (sh) { sh.innerHTML = html; return; }
  closeSheet();
  const veil = document.createElement('div'); veil.className = 'ap-veil'; veil.style.background = 'rgba(0,0,0,.35)'; veil.dataset.sheet = k;
  sh = document.createElement('div'); sh.className = 'ap-sheet'; sh.dataset.k = k; sh.innerHTML = html;
  S.el.append(veil, sh);
  const close = () => { if (k === 'room') S.live.sel = null; else if (S.pv) S.pv.sel = null; closeSheet(); draw(S.sec); };
  veil.addEventListener('click', close);
}
function closeSheet() { document.querySelectorAll('.ap-sheet, .ap-veil[data-sheet]').forEach(x => x.remove()); }

let toastTimer = 0;
function toast(text, err = false) {
  let t = S.el.querySelector('.ap-toast');
  if (!t) { t = document.createElement('div'); t.className = 'ap-toast'; t.setAttribute('role', 'status'); S.el.append(t); }
  t.textContent = text; t.classList.toggle('err', err);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
