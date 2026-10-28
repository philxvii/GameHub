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
import { db, auth, adminSignOut } from './firebase.js';
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
  // Rubriques : le contour du dé du logo, et ce qu'il contient dit la rubrique.
  overview: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="8.8" cy="8.8" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.2" cy="8.8" r="1.35" fill="currentColor" stroke="none"/><circle cx="8.8" cy="15.2" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.2" cy="15.2" r="1.35" fill="currentColor" stroke="none"/>',
  live: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M8.6 15.4a4.8 4.8 0 0 1 0-6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8"/>',
  home: '<rect x="3.5" y="5.5" width="10" height="14" rx="2.6"/><path d="M13.5 8.5l3.6-1.4a2 2 0 0 1 2.6 1.2l2.6 7.4a2 2 0 0 1-1.2 2.6l-4 1.4"/><circle cx="8.5" cy="12.5" r="1.35" fill="currentColor" stroke="none"/>',
  audience: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8.5 16v-2M12 16v-5M15.5 16V8.5"/>',
  bans: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="9" cy="9" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.35" fill="currentColor" stroke="none"/><path d="M5.5 18.5l13-13"/>',
  settings: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M7.5 9.5h9M7.5 14.5h9"/><circle cx="14" cy="9.5" r="1.6" fill="var(--ap-card,#fff)"/><circle cx="10" cy="14.5" r="1.6" fill="var(--ap-card,#fff)"/>',
  journal: '<path d="M6.5 3.5h8l3.5 3.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 4 18V6a2.5 2.5 0 0 1 2.5-2.5Z"/><path d="M8 11h8M8 14.5h8M8 18h5"/>',
  pause: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M10 9v6M14 9v6"/>',
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>',
};
const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

const SECTIONS = [
  { id: 'overview', label: 'Vue d’ensemble', short: 'Aperçu', ico: 'overview' },
  { id: 'live', label: 'En direct', short: 'Direct', ico: 'live' },
  { id: 'home', label: 'Accueil', short: 'Accueil', ico: 'home' },
  { id: 'audience', label: 'Audience', short: 'Audience', ico: 'audience' },
  { id: 'bans', label: 'Bannis', short: 'Bannis', ico: 'bans' },
  { id: 'settings', label: 'Réglages', short: 'Réglages', ico: 'settings' },
  { id: 'journal', label: 'Journal', short: 'Journal', ico: 'journal' },
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
  offset: 0, visitors: 0, online: {}, waiting: {}, waitingN: 0,
  rooms: new Map(),              // "prefix/code" -> { g, prefix, code, f: {champ: valeur}, offs }
  settings: { ageGate: true, maintenance: false }, hidden: {}, layout: null, layoutDenied: false,
  bans: {}, bansDenied: false, visits: null, recent: [], today: null, mx: null, mxRange: '7d',
  live: { view: 'rooms', game: 'all', q: '', idle: false, sel: null },
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
  if (S.pv && pvChanges().length) notify('Brouillon de l’accueil gardé', { icon: 'home', sub: 'Non publié · il t’attend jusqu’au rechargement de la page' });
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
        ${SECTIONS.map((s, i) => `${i === 4 ? '<div class="ap-nav-h">Gestion</div>' : ''}<button class="ap-item" type="button" data-go="${s.id}"><span class="ap-ico">${icon(s.ico)}</span>${s.label}<span class="ap-badge" data-badge="${s.id}" hidden></span></button>`).join('')}
      </nav>
      <div class="ap-side-foot">
        <div class="ap-theme" role="group" aria-label="Apparence">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, t]) => `<button type="button" data-theme-set="${k}" aria-pressed="false">${icon(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'auto')}${t}</button>`).join('')}</div>
        <div class="ap-me"><b>${esc(initial(who))}</b><span title="${esc(who)}">${esc(who)}</span></div>
        <button class="ap-back" type="button" data-act="close">${icon('back')}Retour au site</button>
        <button class="ap-out" type="button" data-act="logout">${icon('kick')}Se déconnecter</button>
      </div>
    </aside>
    <div class="ap-main">
      <header class="ap-bar"><h1 id="ap-title"></h1><span class="ap-sub" id="ap-sub"></span><div class="ap-tools" id="ap-tools"></div>
        <button class="ap-icon-btn ap-th" type="button" data-theme-toggle aria-label="Changer d’apparence">${icon('moon')}</button>
        <button class="ap-icon-btn ap-x" type="button" data-act="close" aria-label="Retour au site">${icon('close')}</button></header>
      <div class="ap-scroll" id="ap-scroll">${SECTIONS.map(s => `<section class="ap-sec" data-sec="${s.id}" hidden aria-label="${s.label}"></section>`).join('')}</div>
    </div>
    <nav class="ap-tabs" aria-label="Rubriques">${SECTIONS.map(s => `<button type="button" data-go="${s.id}">${icon(s.ico)}<span>${s.short}</span>${s.id === 'live' ? '<i hidden></i>' : ''}</button>`).join('')}</nav>
  </div>`;
  const root = S.el;
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-theme-set], [data-theme-toggle]');
    if (!t) return;
    e.stopPropagation();
    setTheme(t.dataset.themeSet || (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }, true);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref() === 'auto') setTheme('auto', true); });
  syncTheme();
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

// ── Apparence : même réglage que le site (gh-theme) ; « Auto » suit l'appareil ──
function themePref() { try { const t = localStorage.getItem('gh-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (_) { return 'auto'; } }
function setTheme(pref, quiet = false) {
  const html = document.documentElement;
  const t = pref === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
  try { if (pref === 'auto') localStorage.removeItem('gh-theme'); else localStorage.setItem('gh-theme', pref); } catch (_) {}
  if (html.dataset.theme !== t) {
    html.classList.add('ap-theming', 'theming');
    html.dataset.theme = t;
    clearTimeout(setTheme.t); setTheme.t = setTimeout(() => html.classList.remove('ap-theming', 'theming'), 520);
  }
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'dark' ? '#0D0B12' : '#F5F6F8';
  const hubBtn = document.getElementById('theme-toggle'); if (hubBtn) hubBtn.setAttribute('aria-label', t === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
  syncTheme();
  if (!quiet) notify(pref === 'auto' ? 'Apparence automatique' : t === 'dark' ? 'Mode sombre' : 'Mode clair',
    { icon: pref === 'auto' ? 'auto' : t === 'dark' ? 'moon' : 'sun', sub: pref === 'auto' ? 'Suit le réglage de l’appareil' : 'Appliqué aussi au site' });
}
function syncTheme() {
  const pref = themePref();
  S.el.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pref)));
  const tg = S.el.querySelector('[data-theme-toggle]');
  if (tg) tg.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
}

function onKey(e) {
  if (!S.open || S.el.classList.contains('hidden')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const q = S.el.querySelector(innerWidth > 820 ? '#ap-q' : '#ap-live-q') || S.el.querySelector('#ap-q'); if (innerWidth <= 820 && S.sec !== 'live') go('live'); setTimeout(() => (S.el.querySelector(innerWidth > 820 ? '#ap-q' : '#ap-live-q'))?.focus(), 30); return; }
  const inField = e.target.matches && e.target.matches('input, textarea, select');
  if (S.sec === 'home' && S.pv && !inField) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); pvUndo(e.shiftKey); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); pvUndo(true); return; }
    if (e.altKey && S.pv.sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveSel(e.key === 'ArrowLeft' ? -1 : 1); return; }
  }
  if (e.key !== 'Escape') return;
  if (document.querySelector('.ap-veil:not([data-sheet]), .ap-menu')) return;   // la fenêtre ouverte se ferme d'abord
  e.stopImmediatePropagation();
  if (S.live.sel && S.sec === 'live') { S.live.sel = null; draw('live'); return; }
  if (S.pv && (S.pv.sel || S.pv.sheet) && S.sec === 'home') { S.pv.sel = null; S.pv.sheet = false; closeSheet(); drawHome(); return; }
  if (S.live.sel && document.querySelector('.ap-sheet')) { S.live.sel = null; closeSheet(); draw('live'); return; }
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
  sub('hub/waiting', v => { S.waiting = v || {}; countVisitors(); purgeWaiting(); schedule(); });   // écran de maintenance
  // Les règles de la base ne laissent lire que ces deux réglages, un par un (jamais hub/settings d'un bloc).
  sub('hub/settings/maintenance', v => { S.settings.maintenance = v === true; schedule(); });
  sub('hub/settings/ageGate', v => { S.settings.ageGate = v !== false; schedule(); });
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
  S.waitingN = Object.values(S.waiting).filter(v => v && t - v.t < 180000).length;
}

// Entrées de l'écran de maintenance abandonnées (onglet tué sans pouvoir se retirer) : effacées après 10 min.
function purgeWaiting() {
  const t = now();
  for (const [k, v] of Object.entries(S.waiting)) if (!(v && t - v.t < 600000)) remove(ref(db, `hub/waiting/${k}`)).catch(() => {});
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
  if (raf || !S.open || S.editing) return;
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
const tile = k => `<span class="tile">${icon(k)}</span>`;

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
    ${maint ? `<div class="ap-note mxnote">${icon('pause')}<div><b>Le site est en maintenance.</b><br>Les visiteurs voient l’écran de maintenance, les parties sont gelées.</div><button class="ap-btn primary" type="button" data-act="maint-off">Rouvrir le site</button></div>` : ''}
    <div class="ap-kpis">
      <button class="ap-kpi" type="button" data-go="live"><span class="k"><span class="ap-dot on"></span>${maint ? 'Sur l’écran de maintenance' : 'Sur le site maintenant'}</span><span class="n">${nf.format(maint ? S.waitingN : S.visitors + t.onNow)}</span><span class="s">${maint ? 'personnes devant l’écran, en direct' : `${plural(S.visitors, 'sur l’accueil', 'sur l’accueil')} · ${plural(t.onNow, 'en partie', 'en partie')}`}</span></button>
      <button class="ap-kpi" type="button" data-go="live"><span class="k">Joueurs en partie</span><span class="n">${nf.format(t.inGame)}</span><span class="s">${t.onNow} connecté${t.onNow > 1 ? 's' : ''}, présence vérifiée</span></button>
      <button class="ap-kpi" type="button" data-go="live"><span class="k">Parties actives</span><span class="n">${nf.format(t.active.length)}</span><span class="s">${t.idle ? `${plural(t.idle, 'inactive')} à nettoyer` : 'aucune partie fantôme'}</span></button>
      <button class="ap-kpi" type="button" data-go="audience"><span class="k">Pages vues · 24 h</span><span class="n">${d ? nf.format(d.totals.views) : '—'}</span><span class="s">${d ? (d.previous ? `${delta(d.totals.views, d.previous.views)} vs les 24 h d’avant` : `${nf.format(d.totals.entries)} arrivées`) : (S.todayErr || 'Chargement…')}</span></button>
    </div>
    <div class="ov-grid">
      <section class="ov-b ov-live">
        <div class="ap-group-h"><h2>Parties en cours</h2><button class="link" type="button" data-go="live">Tout voir</button></div>
        <div class="ap-group ap-rooms">${rooms.length ? rooms.map(roomRow).join('') : '<div class="ap-empty"><b>Aucune partie en cours</b>Les nouvelles parties s’affichent ici en direct.</div>'}</div>
      </section>
      <section class="ov-b ov-ctrl">
        <div class="ap-group-h"><h2>Contrôles rapides</h2></div>
        <div class="ap-group">
          <div class="ap-row ico">${tile('pause')}<div class="main"><div class="t">Maintenance</div><div class="d">Ferme tout le site, gèle les parties</div></div>${sw('maint', maint, 'Maintenance', true)}</div>
          <div class="ap-row ico">${tile('lock')}<div class="main"><div class="t">Vérification d’âge</div><div class="d">Date de naissance avant d’entrer</div></div>${sw('age', S.settings.ageGate !== false, 'Vérification d’âge')}</div>
          <button class="ap-row ico" type="button" data-go="home">${tile('home')}<div class="main"><div class="t">Modifier l’accueil</div><div class="d">Ordre, noms, jeux masqués</div></div>${icon('chev', 'chev')}</button>
          <button class="ap-row ico" type="button" data-go="bans">${tile('bans')}<div class="main"><div class="t">Bannis</div><div class="d">${S.bansDenied ? 'Règles de la base à publier' : plural(Object.keys(S.bans).length, 'compte banni', 'comptes bannis')}</div></div>${icon('chev', 'chev')}</button>
          ${t.idle ? `<button class="ap-row ico" type="button" data-act="cleanup">${tile('broom')}<div class="main"><div class="t">Nettoyer les parties inactives</div><div class="d">${plural(t.idle, 'partie')} sans signe de vie</div></div>${icon('chev', 'chev')}</button>` : ''}
        </div>
      </section>
      <section class="ov-b ov-home">
        <div class="ap-group-h"><h2>Accueil</h2><p>${visibleCount} jeu${visibleCount > 1 ? 'x' : ''} affiché${visibleCount > 1 ? 's' : ''} sur ${shown.length}</p></div>
        <div class="ap-group"><div class="ap-shelf">${shown.map(id => `<button type="button" class="${S.hidden[id] ? 'off' : ''}" data-act="edit-game" data-id="${id}"><img src="${cover(BY_ID[id])}" alt="" loading="lazy" decoding="async"><span>${esc(nameFor(id))}</span></button>`).join('')}</div></div>
      </section>
      <section class="ov-b ov-log">
        <div class="ap-group-h"><h2>Dernières actions</h2><button class="link" type="button" data-go="journal">Journal</button></div>
        <div class="ap-group">${S.recent.length ? S.recent.slice(0, 5).map(e => `<div class="ap-row"><div class="main"><div class="t">${esc(e.msg)}</div><div class="d">${esc(CATS[e.cat] || e.cat)}${e.target ? ' · ' + esc(e.target) : ''}</div></div><span class="v">${ago(e.ts)}</span></div>`).join('') : '<div class="ap-empty">Aucune action pour l’instant.</div>'}</div>
      </section>
    </div>
    ${mxCard(true)}`);
}

// ── Écran de maintenance : combien de personnes y sont tombées, et d'où (service de mesure, page « maintenance ») ──
const MX_RANGES = [['24h', '24 h'], ['7d', '7 j'], ['30d', '30 j'], ['90d', '90 j']];
async function loadMx() {
  try {
    const res = await fetch(`${S.dev || ''}/_stats/summary?range=${S.mxRange}&game=maintenance`, { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
    if (res.status === 400) throw new Error('Nouvelle version du service de mesure à publier');
    if (!res.ok) throw new Error('Service indisponible');
    S.mx = await res.json(); S.mxErr = null;
  } catch (e) { S.mx = null; S.mxErr = e.message || 'Indisponible'; }
  schedule();
}

function mxCard(big) {
  const d = S.mx, total = d ? d.totals.views : 0;
  const row = (label, n, tot, av) => `<div class="mx-li"><span class="mx-av">${esc(av)}</span><span class="t">${esc(label)}</span><span class="v"><b>${nf.format(n)}</b>${tot ? Math.round(n / tot * 100) + ' %' : ''}</span><span class="mx-bar"><i style="width:${tot ? Math.max(3, n / tot * 100) : 0}%"></i></span></div>`;
  const regions = (() => { try { return new Intl.DisplayNames('fr', { type: 'region' }); } catch (_) { return null; } })();
  const country = c => c === 'ZZ' ? 'Inconnu' : (regions && regions.of(c)) || c;
  const sum = x => x.rows.reduce((s, r) => s + r.n, 0) + x.other;
  const block = (title, rows, tot, label, av, other) => `<div><h4>${title}</h4>${rows.length || other ? rows.slice(0, 5).map(r => row(label(r), r.n, tot, av(r))).join('') + (other ? row(title === 'Villes' ? 'Ville inconnue' : `Autres (moins de ${d.kMin} chacun)`, other, tot, '…') : '') : '<p class="ap-foot" style="margin:6px 0">Rien d’assez fréquent pour être affiché.</p>'}</div>`;
  const body = !d ? `<div class="ap-empty">${esc(S.mxErr || 'Chargement…')}</div>`
    : !total ? `<div class="ap-empty"><b>Personne pour l’instant</b>Aucune vue de l’écran de maintenance sur cette période.</div>`
    : `<div class="mx-grid">
        ${block('Villes', d.cities.rows, total, r => r.name, r => r.country, d.cities.other)}
        ${block('Pays', d.countries.rows, sum(d.countries), r => country(r.key), r => r.key === 'ZZ' ? '?' : r.key, d.countries.other)}
        ${block('Venus de', d.refs.rows, sum(d.refs), r => r.key === 'direct' ? 'Accès direct (lien, favori, adresse tapée)' : r.key, r => (r.key === 'direct' ? '↗' : r.key[0].toUpperCase()), d.refs.other)}
      </div>`;
  return `
    <div class="ap-group-h"><h2>Écran de maintenance</h2>
      <div class="ap-seg" role="group" aria-label="Période">${MX_RANGES.map(([k, t]) => `<button type="button" data-act="mx-range" data-v="${k}" aria-pressed="${S.mxRange === k}">${t}</button>`).join('')}</div></div>
    <div class="ap-card mx-card${big ? ' big' : ''}">
      <div class="mx-head">
        <div><span class="mx-n">${d ? nf.format(total) : '—'}</span><span class="mx-l">vue${total > 1 ? 's' : ''} de l’écran de maintenance${d ? ` · ${MX_RANGES.find(r => r[0] === S.mxRange)[1]}` : ''}</span>
          ${d && d.previous ? `<span class="mx-l">${nf.format(d.totals.entries)} arrivée${d.totals.entries > 1 ? 's' : ''} depuis l’extérieur</span>` : ''}</div>
        <div class="mx-live"><span class="ap-dot ${S.waitingN ? 'on' : ''}"></span><b>${nf.format(S.waitingN)}</b> devant l’écran en ce moment</div>
      </div>
      ${body}
      <p class="ap-foot" style="margin:12px 0 0">Une vue = un chargement de l’écran (un rechargement compte de nouveau). Ville et pays approximatifs, déduits par Cloudflare ; aucun identifiant ni IP n’est gardé.</p>
    </div>`;
}

async function loadToday() {
  loadMx();
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

// Carte d'une partie : affiche du jeu, code, avatars des joueurs (point = présence), état.
function roomCard(x) {
  const r = x.r, [ph, phc] = phaseOf(r.f.phase);
  const av = x.players.slice(0, 5).map(p => `<span class="lv-av ${p.st === 'on' ? 'on' : p.st === 'off' ? 'off' : 'na'}" title="${esc(p.name)}">${esc(initial(p.name))}</span>`).join('')
    + (x.players.length > 5 ? `<span class="lv-av more">+${x.players.length - 5}</span>` : '');
  return `<div class="lv-card${x.idle ? ' idle' : ''}" role="button" tabindex="0" data-act="room" data-key="${esc(r.key)}" aria-selected="${S.live.sel === r.key}">
    <div class="lv-top"><img src="${cover(r.g)}" alt="" loading="lazy" decoding="async"><span class="lv-grad"></span>
      <span class="lv-code">${esc(r.code)}</span>${!x.idle && x.on ? '<span class="lv-live"><i></i>Live</span>' : ''}</div>
    <div class="lv-body"><div class="lv-name">${esc(r.g.name)}</div><div class="lv-av-row">${av || '<span class="lv-none">Aucun joueur</span>'}</div></div>
    <div class="lv-foot"><span class="ap-pill ${x.idle ? '' : phc}">${x.idle ? 'Inactive' : ph}</span><span class="lv-when">${plural(x.players.length, 'joueur')}${x.last ? ' · ' + ago(x.last) : x.created ? ' · ' + ago(x.created) : ''}</span></div>
  </div>`;
}

function drawLive(box) {
  const t = totals(), maint = S.settings.maintenance === true;
  const counts = {};
  t.rooms.forEach(x => { counts[x.r.g.id] = (counts[x.r.g.id] || 0) + 1; });
  tools(`<div class="ap-seg" role="group" aria-label="Affichage"><button type="button" data-act="lv-view" data-v="rooms" aria-pressed="${S.live.view === 'rooms'}">Parties</button><button type="button" data-act="lv-view" data-v="players" aria-pressed="${S.live.view === 'players'}">Joueurs</button></div>
    <input class="ap-field" id="ap-live-q" type="search" placeholder="Joueur, code…" aria-label="Rechercher un joueur ou une partie" value="${esc(S.live.q)}" style="width:170px">
    <button class="ap-btn" type="button" data-act="cleanup" ${t.idle ? '' : 'disabled'}>${icon('broom')}Nettoyer${t.idle ? ` (${t.idle})` : ''}</button>`,
    `${plural(t.active.length, 'partie active', 'parties actives')} · temps réel`);
  const rooms = liveFilter(t.rooms);
  const tiles = `<div class="lv-tiles">${[[maint ? 'Sur l’écran de maintenance' : 'Sur l’accueil', maint ? S.waitingN : S.visitors, true], ['Connectés en partie', t.onNow, true], ['Joueurs en parties actives', t.inGame, false], ['Parties inactives', t.idle, false]]
    .map(([k, v, live]) => `<div class="lv-tile"><span class="k">${live ? '<i class="ap-dot on"></i>' : ''}${k}</span><b>${nf.format(v)}</b></div>`).join('')}</div>`;
  const chip = (id, label, n, g) => `<button type="button" class="lv-chip" data-act="lv-game" data-v="${id}" aria-pressed="${S.live.game === id}">${g ? `<img src="${cover(g)}" alt="" loading="lazy" decoding="async">` : ''}<b>${esc(label)}</b><em>${n}</em></button>`;
  const rail = `<div class="lv-bar"><div class="lv-rail" role="group" aria-label="Filtrer par jeu">${chip('all', 'Tous', t.rooms.length)}${CATALOG.filter(g => counts[g.id] || S.live.game === g.id).map(g => chip(g.id, g.name, counts[g.id] || 0, g)).join('')}</div>
    <label class="lv-idle-t">Inactives ${sw('lv-idle', S.live.idle, 'Montrer les parties inactives')}</label></div>`;
  const head = tiles + rail;
  if (S.live.sel && !S.rooms.has(S.live.sel)) S.live.sel = null;
  if (S.live.view === 'players') {
    const rows = [];
    for (const x of rooms) for (const p of x.players) rows.push({ x, p });
    const q = S.live.q.toLowerCase();
    const list = rows.filter(({ x, p }) => !q || `${p.name} ${x.r.code} ${x.r.g.name}`.toLowerCase().includes(q))
      .sort((a, b) => (a.p.st === 'on' ? 0 : 1) - (b.p.st === 'on' ? 0 : 1) || String(a.p.name).localeCompare(String(b.p.name), 'fr'));
    paint(box, head + `<div class="ap-group">${list.length ? `<table class="ap-table"><thead><tr><th>Joueur</th><th>Jeu</th><th class="hide-s">Partie</th><th>Statut</th><th></th></tr></thead><tbody>
      ${list.map(({ x, p }) => `<tr><td><span class="who"><span class="ap-av" style="background:${avColor(p.name)}">${esc(initial(p.name))}</span>${esc(p.name)}${p.host ? icon('crown', 'ap-host') : ''}</span></td>
        <td>${esc(x.r.g.name)}</td><td class="hide-s"><button class="ap-code" type="button" data-act="room" data-key="${esc(x.r.key)}">${esc(x.r.code)}</button></td>
        <td>${status(p)}</td><td class="r"><button class="ap-icon-btn" type="button" data-act="pmenu" data-key="${esc(x.r.key)}" data-p="${esc(p.key)}" aria-label="Actions pour ${esc(p.name)}">${icon('more')}</button></td></tr>`).join('')}
      </tbody></table>` : `<div class="ap-empty"><b>${q ? 'Aucun joueur ne correspond' : 'Personne en partie'}</b>${q ? 'Essaie un autre nom ou un code.' : 'Les joueurs apparaissent ici dès qu’ils rejoignent une partie.'}</div>`}</div>`);
    return;
  }
  const act = rooms.filter(x => !x.idle), ina = rooms.filter(x => x.idle);
  const filtered = S.live.game !== 'all' || S.live.q;
  const empty = `<div class="lv-empty"><span class="lv-die" aria-hidden="true"></span><b>${filtered ? 'Aucune partie pour ce filtre' : 'Aucune partie en cours'}</b>${filtered ? 'Essaie un autre jeu ou une autre recherche.' : 'Les parties apparaissent ici dès qu’un joueur en crée une.'}</div>`;
  if (innerWidth > 1100 && rooms.length) {
    // Console : la liste des parties à gauche, le panneau de pilotage de la partie choisie à droite.
    // Une partie est toujours choisie (la première), le panneau n'est jamais vide.
    if (!S.live.sel || !rooms.some(x => x.r.key === S.live.sel)) S.live.sel = rooms[0].r.key;
    const group = (title, list) => list.length ? `<div class="lv-h"><h3>${title}</h3><span>${list.length}</span></div>${list.map(roomItem).join('')}` : '';
    const was = S.live.pane; S.live.pane = S.live.sel;
    paint(box, head + `<div class="lv-console"><div class="lv-list">${group('Actives', act)}${group('Inactives', ina)}</div><aside class="lv-pane">${roomPane(S.rooms.get(S.live.sel))}</aside></div>`);
    const pane = box.querySelector('.lv-pane-in');
    if (was && was !== S.live.sel && pane && !matchMedia('(prefers-reduced-motion:reduce)').matches)
      pane.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)' });
    return;
  }
  const sec = (title, list) => list.length ? `<div class="lv-h"><h3>${title}</h3><span>${list.length}</span></div><div class="lv-grid">${list.map(roomCard).join('')}</div>` : '';
  paint(box, head + `<div class="ap-md solo"><div>${rooms.length ? sec('Actives', act) + sec('Inactives', ina) : empty}</div></div>`);
  if (S.live.sel && innerWidth <= 1100) sheet(roomDetail(S.rooms.get(S.live.sel)), 'room');
}

// Ligne de la liste des parties (grand écran) : affiche, jeu, code, joueurs, état.
function roomItem(x) {
  const r = x.r, [ph, phc] = phaseOf(r.f.phase);
  const av = x.players.slice(0, 4).map(p => `<span class="lv-av ${p.st === 'on' ? 'on' : p.st === 'off' ? 'off' : 'na'}" title="${esc(p.name)}">${esc(initial(p.name))}</span>`).join('')
    + (x.players.length > 4 ? `<span class="lv-av more">+${x.players.length - 4}</span>` : '');
  return `<button class="lv-item${x.idle ? ' idle' : ''}" type="button" data-act="room" data-key="${esc(r.key)}" aria-selected="${S.live.sel === r.key}">
    <span class="lv-th"><img src="${cover(r.g)}" alt="" loading="lazy" decoding="async">${!x.idle && x.on ? '<i></i>' : ''}</span>
    <span class="lv-it-main"><b>${esc(r.g.name)}</b><em>${esc(r.code)} · ${plural(x.players.length, 'joueur')}</em></span>
    <span class="lv-it-r"><span class="lv-stack">${av}</span><small class="${x.idle ? '' : phc}">${x.idle ? 'Inactive' : ph}${x.last ? ' · ' + ago(x.last).replace('il y a ', '') : ''}</small></span>
  </button>`;
}

// Panneau de pilotage d'une partie : affiche, chiffres, joueurs avec leurs actions, suppression.
function roomPane(r) {
  if (!r) return '';
  const x = roomInfo(r), [ph, phc] = phaseOf(r.f.phase);
  const banned = Object.keys(r.f.banned || {});
  const stat = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
  const since = t => t ? ago(t).replace('il y a ', '') : '—';
  const rows = x.players.length ? x.players.map(p => `<div class="lv-pr"><span class="ap-av" style="background:${avColor(p.name)}">${esc(initial(p.name))}</span>
      <div class="main"><div class="t">${esc(p.name)}${p.host ? icon('crown', 'ap-host') : ''}</div><div class="d">${p.host ? 'Hôte · ' : ''}${p.st === 'on' ? 'En ligne' : p.st === 'off' ? 'Absent' : 'Présence non suivie par ce jeu'}</div></div>
      <span class="ap-dot ${p.st === 'on' ? 'on' : p.st === 'off' ? 'off' : ''}"></span>
      <button class="ap-btn sm" type="button" data-act="kick" data-key="${esc(r.key)}" data-p="${esc(p.key)}" ${p.host ? 'disabled title="Hôte : supprime la partie pour l’écarter"' : ''}>Exclure</button>
      <button class="ap-icon-btn" type="button" data-act="pmenu" data-key="${esc(r.key)}" data-p="${esc(p.key)}" aria-label="Autres actions pour ${esc(p.name)}">${icon('more')}</button></div>`).join('')
    : '<div class="ap-empty">Aucun joueur.</div>';
  return `<div class="lv-pane-in ap-card">
    <div class="lv-hero"><img src="${cover(r.g)}" alt=""><span class="lv-grad"></span>
      <div class="lv-hero-top"><span class="ap-pill ${x.idle ? '' : phc}">${x.idle ? 'Inactive' : ph}</span>${!x.idle && x.on ? '<span class="lv-live"><i></i>Live</span>' : ''}</div>
      <div class="lv-hero-main"><div><h3>${esc(r.g.name)}</h3><span>${plural(x.players.length, 'joueur')}</span></div>
        <button class="lv-copy" type="button" data-act="copy" data-v="${esc(r.code)}" aria-label="Copier le code ${esc(r.code)}">${esc(r.code)}${icon('copy')}</button></div></div>
    <div class="lv-stats">${stat(r.g.presence ? `${x.on}/${x.players.length}` : nf.format(x.players.length), r.g.presence ? 'Connectés' : 'Inscrits')}${stat(since(x.created), 'Créée')}${stat(since(x.last), 'Dernier signe')}</div>
    <div class="lv-ph"><h4>Joueurs</h4><span>${x.players.length}</span></div>
    <div class="lv-pl">${rows}</div>
    ${banned.length ? `<div class="ap-row"><div class="main"><div class="t">${plural(banned.length, 'compte exclu', 'comptes exclus')} de cette partie</div><div class="d">Ils ne peuvent plus y revenir</div></div><button class="ap-btn sm" type="button" data-act="unban-room" data-key="${esc(r.key)}">Tout lever</button></div>` : ''}
    <div class="lv-actions"><button class="ap-btn" type="button" data-act="copy" data-v="${esc(r.code)}">${icon('copy')}Copier le code</button><button class="ap-btn danger" type="button" data-act="del-room" data-key="${esc(r.key)}">${icon('trash')}Supprimer la partie</button></div>
  </div>`;
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
      <div class="ap-row ico">${tile('pause')}<div class="main"><div class="t">Maintenance</div><div class="d">Toutes les pages affichent l’écran de maintenance, les parties sont gelées</div></div>${sw('maint', S.settings.maintenance === true, 'Maintenance', true)}</div>
      <div class="ap-row ico">${tile('lock')}<div class="main"><div class="t">Vérification d’âge</div><div class="d">Demande la date de naissance avant d’entrer</div></div>${sw('age', S.settings.ageGate !== false, 'Vérification d’âge')}</div>
    </div>
    <div class="ap-group-h"><h2>Session</h2></div>
    <div class="ap-group">
      <button class="ap-row ico" type="button" data-act="logout">${tile('kick')}<div class="main"><div class="t">Se déconnecter</div><div class="d">Quitte l’administration sur cet appareil et efface l’accès admin</div></div>${icon('chev', 'chev')}</button>
    </div>
    <div class="ap-group-h"><h2>Parties</h2></div>
    <div class="ap-group">
      <div class="ap-row ico">${tile('broom')}<div class="main"><div class="t">Parties inactives</div><div class="d">${t.idle ? `${plural(t.idle, 'partie')} sans joueur connecté ni signe de vie depuis 3 h` : 'Aucune pour l’instant'}</div></div><button class="ap-btn sm" type="button" data-act="cleanup" ${t.idle ? '' : 'disabled'}>Nettoyer</button></div>
    </div>
    <div class="ap-group-h"><h2>Compteur historique</h2></div>
    <div class="ap-group">
      <div class="ap-row ico">${tile('audience')}<div class="main"><div class="t">Visites comptées : ${S.visits == null ? '—' : nf.format(S.visits)}</div><div class="d">Ancien compteur de l’accueil, sans période. La rubrique Audience le remplace.</div></div><button class="ap-btn sm" type="button" data-act="reset-visits">Remettre à zéro</button></div>
    </div>
    <div class="ap-group-h"><h2 style="color:var(--ap-red)">Zone sensible</h2></div>
    <div class="ap-group">
      <button class="ap-row ico danger" type="button" data-act="del-all">${tile('trash')}<div class="main"><div class="t">Supprimer toutes les parties</div><div class="d">Toutes les parties de tous les jeux, annulable quelques secondes</div></div></button>
    </div>`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Accueil : aperçu modifiable
// ════════════════════════════════════════════════════════════════════════════════════════════
// Brouillon S.pv = { order, g: { id: fiche }, site, base (version en ligne), sel, sheet, device,
// showHidden, filter, hist, fut }. Rien ne part en ligne avant « Publier ». Chaque changement
// est annulable (Ctrl Z / Ctrl Maj Z, ou les flèches de la barre).
const defaults = () => (window.hubDefaults ? window.hubDefaults() : {});
const siteDefaults = () => (window.hubSiteDefaults ? window.hubSiteDefaults() : { title: 'On joue ?', lede: '{n} jeux en ligne, sans compte.', surprise: true, chips: TAGS.map(([k]) => k).join(' ') });
const BADGES = ['Nouveau', 'Populaire', 'Mis à jour', 'Exclusif'];
const clone = v => JSON.parse(JSON.stringify(v));
const defaultOrder = () => { const D = defaults(); return Object.keys(D).sort((a, b) => D[a].i - D[b].i); };
const nextOf = (d, o) => d.next ? d.next.map((x, k) => (o && o[k] && o[k].t) ? { t: o[k].t, s: o[k].s || '' } : { ...x }) : null;

function order() {
  if (S.pv) return S.pv.order;
  const D = defaults(), o = String((S.layout && S.layout.order) || '').split(',').filter(id => D[id]);
  return [...o, ...defaultOrder().filter(id => !o.includes(id))];
}
function nameFor(id) { return (S.pv && S.pv.g[id] && S.pv.g[id].name) || (S.layout && S.layout.games && S.layout.games[id] && S.layout.games[id].name) || (defaults()[id] || {}).name || BY_ID[id]?.name || id; }

// Version en ligne : défauts du hub + hub/layout + hub/hidden.
function published() {
  const D = defaults(), L = S.layout || {}, over = L.games || {}, g = {};
  for (const [id, d] of Object.entries(D)) {
    const o = over[id] || {};
    g[id] = { name: o.name || d.name, sub: o.sub ?? d.sub, tags: o.tags ?? d.tags, wide: o.wide ?? d.wide, aband: o.aband ?? d.aband,
      wip: d.wip == null ? null : (o.wip ?? d.wip), hidden: !!S.hidden[id], badge: o.badge || '', soon: !!o.soon, next: nextOf(d, o.next) };
  }
  const o = String(L.order || '').split(',').filter(id => D[id]);
  return { order: [...o, ...defaultOrder().filter(id => !o.includes(id))], g, site: { ...siteDefaults(), ...(L.site || {}) } };
}

function initPreview() {
  if (!S.pv) { const p = published(); S.pv = { ...clone(p), base: p, sel: null, sheet: false, device: innerWidth <= 820 ? 'mobile' : innerWidth <= 1100 ? 'tablet' : 'desktop', showHidden: true, filter: 'all', hist: [], fut: [] }; }
}
// Le brouillon suit la version en ligne tant qu'il n'a pas été modifié.
function refreshBase() {
  if (!S.pv) return;
  const fresh = published();
  if (!pvChanges().length) Object.assign(S.pv, clone(fresh));
  S.pv.base = fresh;
}

// Historique du brouillon.
const draftOf = () => clone({ order: S.pv.order, g: S.pv.g, site: S.pv.site });
function pvRecord() { S.pv.hist.push(draftOf()); if (S.pv.hist.length > 80) S.pv.hist.shift(); S.pv.fut = []; }
function pvEdit(fn) { pvRecord(); fn(); drawHome(); refreshSheet(); }
function pvUndo(redo = false) {
  const from = redo ? S.pv.fut : S.pv.hist, to = redo ? S.pv.hist : S.pv.fut;
  if (!from.length) return;
  to.push(draftOf()); Object.assign(S.pv, from.pop());
  drawHome(); refreshSheet();
}

const FIELD_LABEL = { name: 'nom', sub: 'sous-titre', tags: 'filtres', wide: 'carte large', aband: 'rangée', wip: 'fenêtre « nouvelle version »', hidden: 'visibilité',
  badge: 'pastille', soon: 'statut', next: 'textes « à venir »' };
const SITE_LABEL = { title: 'titre', lede: 'phrase d’accroche', surprise: 'bouton « Surprends-moi »', chips: 'filtres affichés' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function pvChanges() {
  if (!S.pv) return [];
  const { base, g, order: o, site } = S.pv, out = [];
  if (o.join() !== base.order.join()) out.push({ k: 'order' });
  for (const id of Object.keys(g)) for (const f of Object.keys(FIELD_LABEL)) if (!same(g[id][f], base.g[id][f])) out.push({ k: f, id });
  for (const f of Object.keys(SITE_LABEL)) if (!same(site[f], base.site[f])) out.push({ k: 'site', f });
  return out;
}

const STATUS = v => v.hidden ? 'off' : v.soon ? 'soon' : 'on';

function drawHome() {
  const box = S.el.querySelector('.ap-sec[data-sec="home"]');
  if (!box || !S.pv) return;
  refreshBase();
  const pv = S.pv, n = pvChanges().length, wide = innerWidth > 1100;
  tools(`<div class="ap-seg" role="group" aria-label="Historique"><button type="button" data-act="pv-undo" aria-label="Annuler (Ctrl Z)" title="Annuler (Ctrl Z)" ${pv.hist.length ? '' : 'disabled'}>${icon('undo')}</button><button type="button" data-act="pv-redo" aria-label="Rétablir (Ctrl Maj Z)" title="Rétablir (Ctrl Maj Z)" ${pv.fut.length ? '' : 'disabled'} style="transform:scaleX(-1)">${icon('undo')}</button></div>
    <div class="ap-seg" role="group" aria-label="Appareil">${[['desktop', 'Ordinateur'], ['tablet', 'Tablette'], ['mobile', 'Mobile']].map(([k, t]) => `<button type="button" data-act="pv-device" data-v="${k}" aria-pressed="${pv.device === k}">${t}</button>`).join('')}</div>
    <button class="ap-btn" type="button" data-act="pv-page">Haut de page</button>
    <a class="ap-btn" href="./" target="_blank" rel="noopener">Voir le site ↗</a>`,
    'Glisse les cartes pour les ranger, touche-en une pour la régler');
  const card = id => {
    const v = pv.g[id], d = defaults()[id] || {};
    if (!d.cover || (v.hidden && !pv.showHidden)) return '';
    const changed = pvChanges().some(c => c.id === id);
    const out = pv.filter !== 'all' && !String(v.tags).split(' ').includes(pv.filter);
    const badge = v.badge || (v.soon ? 'Bientôt' : '');
    const flags = [v.hidden ? `<span>${icon('eyeoff')}Masqué</span>` : '', v.wip != null && v.wip >= 0 ? `<span>${v.wip} %</span>` : ''].join('');
    return `<div class="pv-card${v.hidden ? ' off' : ''}${v.soon ? ' soon' : ''}${pv.sel === id ? ' sel' : ''}${v.wide ? ' wide' : ''}${changed ? ' changed' : ''}${out ? ' out' : ''}" data-id="${id}" tabindex="0" role="button" aria-label="${esc(v.name)}${v.hidden ? ', masqué' : v.soon ? ', bientôt' : ''}">
      <img src="${esc(d.cover)}" alt="" draggable="false" decoding="async">${badge ? `<span class="pv-pill">${esc(badge)}</span>` : ''}<span class="pv-badges">${flags}</span>
      <span class="pv-cap"><b>${esc(v.name)}</b><small>${esc(v.sub)}</small></span></div>`;
  };
  const main = pv.order.filter(id => pv.g[id] && !pv.g[id].aband), ab = pv.order.filter(id => pv.g[id] && pv.g[id].aband);
  const count = main.filter(id => !pv.g[id].hidden && !pv.g[id].soon).length;
  const lede = esc(pv.site.lede).split('{n}').join(WORDS[count] || count);
  const shownChips = pv.site.chips.split(' ');
  const panel = wide ? `<aside class="pv-insp ap-card" aria-label="${pv.sel ? 'Réglages du jeu' : 'Haut de page'}">${pv.sel ? inspector(pv.sel) : pagePanel()}</aside>` : '';
  const html = `
    ${S.layoutDenied ? rulesNote() : ''}
    <div class="pv-wrap">
      <div class="pv-stage"><div class="pv-window ${pv.device}">
        <div class="pv-chrome"><i></i><i></i><i></i><span>roulia.me</span></div>
        <div class="pv-page">
          <div class="pv-top"><i></i>GameHub<em>${S.visitors} en ligne</em></div>
          <div class="pv-intro"><div><h2>${esc(pv.site.title)}</h2><p>${lede}</p></div>
            <div class="pv-controls"><div class="pv-chips">${[['all', 'Tous'], ...TAGS.filter(([k]) => shownChips.includes(k))].map(([k, t]) => `<button type="button" data-act="pv-filter" data-v="${k}" aria-pressed="${pv.filter === k}">${t}</button>`).join('')}</div>
            ${pv.site.surprise ? '<span class="pv-surprise">Surprends-moi</span>' : ''}</div></div>
          <div class="pv-grid" data-zone="main">${main.map(card).join('')}</div>
          <div class="pv-aband-h">Abandonnés · bouton discret, visible s’il reste un jeu affiché</div>
          <div class="pv-grid pv-aband" data-zone="aband">${ab.map(card).join('')}</div>
        </div>
      </div></div>
      ${panel}
    </div>
    <div class="pv-publish${n ? '' : ' gone'}" role="status"><span><b>${n}</b> modification${n > 1 ? 's' : ''} non publiée${n > 1 ? 's' : ''}</span>
      <button class="ap-btn ghost" type="button" data-act="pv-discard">Tout annuler</button><button class="ap-btn primary" type="button" data-act="pv-publish">Publier</button></div>`;
  if (!drag.on) {
    const aside = box.querySelector('.pv-insp');
    const typing = aside && aside.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=range], textarea');
    if (typing && panel) {
      // Saisie en cours : l'aperçu et la barre se mettent à jour, le panneau reste tel quel.
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      box.querySelector('.pv-stage').replaceWith(tmp.querySelector('.pv-stage'));
      box.querySelector('.pv-publish').replaceWith(tmp.querySelector('.pv-publish'));
      box.__html = null;
    } else paint(box, html);
    wireDrag(box);
  }
  if (pv.sheet && !wide && !document.querySelector('.ap-sheet[data-k="game"]')) sheet(`<div class="pv-insp">${pv.sel ? inspector(pv.sel) : pagePanel()}</div>`, 'game');
  badges();
}

const sectionH = t => `<div class="ap-group-h"><h2 style="font-size:12.5px;color:var(--muted);font-weight:600">${t}</h2></div>`;

function pagePanel() {
  const pv = S.pv, shown = pv.site.chips.split(' '), all = Object.values(pv.g);
  return `
    <div class="pv-insp-h"><span class="pv-page-ico">${icon('home')}</span><div style="flex:1;min-width:0"><h3>Haut de page</h3><p>${all.filter(v => !v.hidden && !v.soon).length} jeux jouables · ${all.filter(v => v.soon && !v.hidden).length} bientôt · ${all.filter(v => v.hidden).length} masqués</p></div>
      ${innerWidth > 1100 ? '' : `<button class="ap-icon-btn" type="button" data-act="pv-close" aria-label="Fermer">${icon('close')}</button>`}</div>
    <div style="padding:0 12px 14px">
      <div class="ap-group">
        <label class="ap-row"><span class="t" style="flex:none">Titre</span><input type="text" data-site="title" maxlength="40" value="${esc(pv.site.title)}"></label>
        <label class="ap-row pv-col"><span class="t">Phrase d’accroche</span><textarea data-site="lede" maxlength="160" rows="2">${esc(pv.site.lede)}</textarea><span class="d">{n} devient le nombre de jeux en lettres</span></label>
        <label class="ap-row"><div class="main"><div class="t">Bouton « Surprends-moi »</div><div class="d">Tire un jeu au hasard</div></div>${sw('pv-site-surprise', pv.site.surprise, 'Bouton Surprends-moi')}</label>
      </div>
      ${sectionH('Filtres proposés aux visiteurs')}
      <div class="ap-group"><div class="pv-tags">${TAGS.map(([k, t]) => `<button type="button" data-act="pv-chip" data-v="${k}" aria-pressed="${shown.includes(k)}">${t}</button>`).join('')}</div></div>
      ${sectionH('Aperçu')}
      <div class="ap-group">
        <label class="ap-row"><div class="main"><div class="t">Montrer les jeux masqués</div><div class="d">Grisés dans l’aperçu, invisibles pour les visiteurs</div></div>${sw('pv-hidden', pv.showHidden, 'Montrer les jeux masqués')}</label>
      </div>
      <button class="ap-btn ghost" style="width:100%;margin-top:12px" type="button" data-act="pv-reset">Revenir à l’accueil d’origine</button>
      <p class="ap-foot" style="text-align:center">Touche une carte de l’aperçu pour régler ce jeu.</p>
    </div>`;
}

function inspector(id) {
  const v = S.pv.g[id], d = defaults()[id] || {};
  const idx = S.pv.order.indexOf(id);
  const live = totals().rooms.filter(x => x.r.g.id === id && !x.idle);
  const players = live.reduce((s, x) => s + x.players.length, 0);
  const tags = String(v.tags).split(' ').filter(Boolean);
  const st = STATUS(v);
  const custom = v.badge && !BADGES.includes(v.badge);
  return `
    <div class="pv-insp-h"><img src="${esc(d.cover)}" alt=""><div style="flex:1;min-width:0"><h3>${esc(v.name)}</h3><p>${live.length ? `${plural(live.length, 'partie')} · ${plural(players, 'joueur')} en ce moment` : 'Aucune partie en cours'}</p></div>
      <button class="ap-icon-btn" type="button" data-act="pv-close" aria-label="Fermer">${icon('close')}</button></div>
    <div style="padding:0 12px 14px">
      <div class="ap-seg pv-status" role="group" aria-label="Statut">
        ${[['on', 'Disponible'], ['soon', 'Bientôt'], ['off', 'Masqué']].map(([k, t]) => `<button type="button" data-act="pv-status" data-v="${k}" aria-pressed="${st === k}">${t}</button>`).join('')}</div>
      <p class="ap-foot" style="margin:6px 4px 0">${st === 'on' ? 'Visible et jouable.' : st === 'soon' ? 'Visible, grisé, ne s’ouvre pas encore.' : 'Retiré de l’accueil ; sa page se ferme aussi.'}</p>
      ${sectionH('Carte')}
      <div class="ap-group">
        <label class="ap-row"><span class="t" style="flex:none">Nom</span><input type="text" data-f="name" maxlength="40" value="${esc(v.name)}" placeholder="${esc(d.name)}"></label>
        <label class="ap-row"><span class="t" style="flex:none">Sous-titre</span><input type="text" data-f="sub" maxlength="40" value="${esc(v.sub)}" placeholder="${esc(d.sub)}"></label>
        <label class="ap-row"><div class="main"><div class="t">Grande carte</div><div class="d">Mobile : toute la largeur · tablette : deux colonnes</div></div>${sw('pv-f-wide', v.wide, 'Grande carte')}</label>
        <div class="ap-row"><span class="t" style="flex:1">Rangée</span><div class="ap-seg"><button type="button" data-act="pv-aband" data-v="0" aria-pressed="${!v.aband}">Principale</button><button type="button" data-act="pv-aband" data-v="1" aria-pressed="${!!v.aband}">Abandonnés</button></div></div>
      </div>
      ${sectionH('Pastille')}
      <div class="ap-group"><div class="pv-tags">
        <button type="button" data-act="pv-badge" data-v="" aria-pressed="${!v.badge}">Aucune</button>
        ${BADGES.map(b => `<button type="button" data-act="pv-badge" data-v="${esc(b)}" aria-pressed="${v.badge === b}">${esc(b)}</button>`).join('')}</div>
        <label class="ap-row"><span class="t" style="flex:none">Autre</span><input type="text" data-badge maxlength="16" value="${custom ? esc(v.badge) : ''}" placeholder="Texte libre, 16 caractères"></label></div>
      ${sectionH('Filtres de l’accueil')}
      <div class="ap-group"><div class="pv-tags">${TAGS.map(([k, t]) => `<button type="button" data-act="pv-tag" data-v="${k}" aria-pressed="${tags.includes(k)}">${t}</button>`).join('')}</div></div>
      ${v.wip != null ? `${sectionH('Nouvelle version en préparation')}
      <div class="ap-group">
        <label class="ap-row"><div class="main"><div class="t">Fenêtre avant le jeu</div><div class="d">Annonce la refonte, propose l’ancienne version</div></div>${sw('pv-f-wip', v.wip >= 0, 'Fenêtre nouvelle version')}</label>
        ${v.wip >= 0 ? `<div class="pv-range"><span style="font-size:13px;color:var(--muted)">Avancement</span><input type="range" min="0" max="100" step="5" value="${v.wip}" data-act="pv-wip" aria-label="Avancement de la nouvelle version"><b>${v.wip} %</b></div>
        ${(v.next || []).map((x, k) => `<div class="ap-row pv-col"><span class="d">À venir ${k + 1}</span><input type="text" class="pv-next-t" data-next="${k}" data-part="t" maxlength="40" value="${esc(x.t)}" placeholder="Titre"><input type="text" class="pv-next-s" data-next="${k}" data-part="s" maxlength="120" value="${esc(x.s)}" placeholder="Détail"></div>`).join('')}` : ''}
      </div>` : ''}
      ${sectionH(`Position · ${idx + 1} sur ${S.pv.order.length}`)}
      <div class="ap-group"><div class="pv-pos">
        <button class="ap-btn" type="button" data-act="pv-move" data-v="first" ${idx === 0 ? 'disabled' : ''} aria-label="Placer en premier">${icon('first')}</button>
        <button class="ap-btn" type="button" data-act="pv-move" data-v="-1" ${idx === 0 ? 'disabled' : ''}>${icon('arrowl')}Avant</button>
        <button class="ap-btn" type="button" data-act="pv-move" data-v="1" ${idx === S.pv.order.length - 1 ? 'disabled' : ''}>Après${icon('arrowr')}</button>
      </div></div>
      <p class="ap-foot">Astuce : Alt + ← / → déplace la carte sélectionnée.</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <a class="ap-btn" style="flex:1" href="${esc(d.href)}" target="_blank" rel="noopener">Ouvrir le jeu ↗</a>
        <button class="ap-btn ghost" style="flex:1" type="button" data-act="pv-restore">Valeurs d’origine</button>
      </div>
    </div>`;
}

function refreshSheet() {
  const sh = document.querySelector('.ap-sheet[data-k="game"]');
  if (sh) sh.innerHTML = `<div class="pv-insp">${S.pv.sel ? inspector(S.pv.sel) : pagePanel()}</div>`;
  // Panneau latéral : redessiné sauf pendant une saisie.
  const aside = S.el.querySelector('.ap-sec[data-sec="home"] aside.pv-insp');
  if (aside && !aside.contains(document.activeElement?.matches?.('input[type=text], input[type=range], textarea') ? document.activeElement : null)) aside.innerHTML = S.pv.sel ? inspector(S.pv.sel) : pagePanel();
}

function moveSel(delta) {
  const id = S.pv.sel; if (!id) return;
  pvEdit(() => {
    const o = S.pv.order, i = o.indexOf(id);
    o.splice(i, 1);
    o.splice(delta === 'first' ? 0 : Math.max(0, Math.min(o.length, i + delta)), 0, id);
  });
}

// Évènements de l'éditeur. Renvoie true si l'évènement le concernait.
function homeClick(e) {
  if (!S.pv) return false;
  const card = e.target.closest('.pv-card');
  if (card && !drag.on && !e.target.closest('.pv-ghost')) {
    S.pv.sel = S.pv.sel === card.dataset.id && innerWidth > 1100 ? null : card.dataset.id;
    S.pv.sheet = true; closeSheet(); drawHome(); return true;
  }
  const a = e.target.closest('[data-act^="pv-"]');
  if (!a || a.tagName === 'INPUT') return false;
  const pv = S.pv, id = pv.sel, v = a.dataset.v;
  switch (a.dataset.act) {
    case 'pv-undo': pvUndo(); break;
    case 'pv-redo': pvUndo(true); break;
    case 'pv-device': pv.device = v; drawHome(); break;
    case 'pv-filter': pv.filter = v; drawHome(); break;
    case 'pv-page': pv.sel = null; pv.sheet = true; closeSheet(); drawHome(); break;
    case 'pv-close': pv.sel = null; pv.sheet = false; closeSheet(); drawHome(); break;
    case 'pv-status': pvEdit(() => { pv.g[id].hidden = v === 'off'; pv.g[id].soon = v === 'soon'; }); break;
    case 'pv-aband': pvEdit(() => { pv.g[id].aband = v === '1'; }); break;
    case 'pv-badge': pvEdit(() => { pv.g[id].badge = v; }); break;
    case 'pv-tag': pvEdit(() => {
      const t = new Set(String(pv.g[id].tags).split(' ').filter(Boolean));
      t.has(v) ? t.delete(v) : t.add(v);
      pv.g[id].tags = TAGS.map(([k]) => k).filter(k => t.has(k)).join(' ');
    }); break;
    case 'pv-chip': pvEdit(() => {
      const t = new Set(pv.site.chips.split(' ').filter(Boolean));
      t.has(v) ? t.delete(v) : t.add(v);
      pv.site.chips = TAGS.map(([k]) => k).filter(k => t.has(k)).join(' ');
      if (pv.filter !== 'all' && !t.has(pv.filter)) pv.filter = 'all';
    }); break;
    case 'pv-move': moveSel(v === 'first' ? 'first' : Number(v)); break;
    case 'pv-restore': {
      const d = defaults()[id];
      pvEdit(() => Object.assign(pv.g[id], { name: d.name, sub: d.sub, tags: d.tags, wide: d.wide, aband: d.aband, wip: d.wip, badge: '', soon: false, next: nextOf(d), hidden: false }));
      notify('Valeurs d’origine rétablies', { icon: 'undo', sub: `${d.name} · brouillon, à publier`, undo: () => pvUndo() });
      break;
    }
    case 'pv-reset': {
      const D = defaults();
      pvEdit(() => {
        pv.order = defaultOrder(); pv.site = siteDefaults();
        for (const [k, d] of Object.entries(D)) pv.g[k] = { name: d.name, sub: d.sub, tags: d.tags, wide: d.wide, aband: d.aband, wip: d.wip, hidden: false, badge: '', soon: false, next: nextOf(d) };
      });
      notify('Accueil d’origine', { icon: 'home', sub: 'Brouillon : rien n’est en ligne avant Publier', undo: () => pvUndo() });
      break;
    }
    case 'pv-discard':
      pvEdit(() => Object.assign(pv, clone({ order: pv.base.order, g: pv.base.g, site: pv.base.site })));
      notify('Modifications annulées', { icon: 'undo', sub: 'L’aperçu revient à la version en ligne', undo: () => pvUndo() });
      break;
    case 'pv-publish': publishHome(); break;
    default: return false;
  }
  return true;
}

function homeChange(a, v) {
  if (!S.pv) return false;
  const pv = S.pv, id = pv.sel;
  switch (a.dataset.act) {
    case 'pv-hidden': pv.showHidden = v; drawHome(); refreshSheet(); break;
    case 'pv-site-surprise': pvEdit(() => { pv.site.surprise = v; }); break;
    case 'pv-f-wide': pvEdit(() => { pv.g[id].wide = v; }); break;
    case 'pv-f-wip': pvEdit(() => { pv.g[id].wip = v ? Math.max(0, (defaults()[id] || {}).wip || 0) : -1; }); break;
    case 'pv-wip': break;   // déjà pris en compte pendant le glissement
    default: return false;
  }
  return true;
}

// Saisie : une seule entrée d'historique par champ, au premier caractère tapé.
let typingIn = null;
function homeInput(t) {
  if (!S.pv) return false;
  const pv = S.pv, id = pv.sel;
  const key = t.dataset.f || t.dataset.site || (t.dataset.next != null ? 'n' + t.dataset.next + t.dataset.part : '') || (t.hasAttribute('data-badge') ? 'badge' : '') || (t.dataset.act === 'pv-wip' ? 'wip' : '');
  if (!key) return false;
  if (typingIn !== t) { pvRecord(); typingIn = t; }
  const val = t.value.replace(/</g, '');
  if (t.dataset.f) pv.g[id][t.dataset.f] = val;
  else if (t.dataset.site) pv.site[t.dataset.site] = val;
  else if (t.dataset.next != null) pv.g[id].next[+t.dataset.next][t.dataset.part] = val;
  else if (key === 'badge') pv.g[id].badge = val.trim();
  else if (key === 'wip') { pv.g[id].wip = Number(t.value); t.nextElementSibling.textContent = t.value + ' %'; }
  drawHome();
  return true;
}
addEventListener('focusout', () => { typingIn = null; }, true);

async function publishHome() {
  const pv = S.pv, D = defaults(), SD = siteDefaults(), changes = pvChanges();
  if (!changes.length) return;
  for (const id of Object.keys(pv.g)) {
    const v = pv.g[id];
    v.name = String(v.name || '').replace(/</g, '').trim().slice(0, 40) || D[id].name;
    v.sub = String(v.sub || '').replace(/</g, '').trim().slice(0, 40);
    v.badge = String(v.badge || '').replace(/</g, '').trim().slice(0, 16);
  }
  pv.site.title = String(pv.site.title || '').replace(/</g, '').trim().slice(0, 40) || SD.title;
  pv.site.lede = String(pv.site.lede || '').replace(/</g, '').trim().slice(0, 160);
  // Seules les valeurs qui diffèrent du site d'origine sont écrites.
  const games = {};
  for (const [id, v] of Object.entries(pv.g)) {
    const d = D[id], o = {};
    for (const f of ['name', 'sub', 'tags', 'wide', 'aband']) if (v[f] !== d[f]) o[f] = v[f];
    if (d.wip != null && v.wip !== d.wip) o.wip = v.wip;
    if (v.badge) o.badge = v.badge;
    if (v.soon) o.soon = true;
    if (v.next && !same(v.next, d.next)) o.next = Object.fromEntries(v.next.map((x, k) => [k, { t: String(x.t).trim().slice(0, 40) || d.next[k].t, s: String(x.s).trim().slice(0, 120) }]));
    if (Object.keys(o).length) games[id] = o;
  }
  const site = {};
  for (const f of Object.keys(SITE_LABEL)) if (!same(pv.site[f], SD[f])) site[f] = pv.site[f];
  const layout = { order: pv.order.join(','), v: Date.now(), ...(Object.keys(games).length ? { games } : {}), ...(Object.keys(site).length ? { site } : {}) };
  const hidden = {};
  for (const c of changes) if (c.k === 'hidden') hidden[c.id] = pv.g[c.id].hidden;
  const prevLayout = S.layout || null, prevHidden = {};
  for (const id of Object.keys(hidden)) prevHidden[id] = !!S.hidden[id];
  const btn = S.el.querySelector('[data-act="pv-publish"]'); if (btn) btn.disabled = true;
  try {
    if (Object.keys(hidden).length) await update(ref(db, 'hub/hidden'), hidden);
    if (changes.some(c => c.k !== 'hidden')) await set(ref(db, 'hub/layout'), layout);
  } catch (e) {
    if (btn) btn.disabled = false;
    notify('Publication refusée', { kind: 'err', sub: isDenied(e) ? 'Règles de la base à publier (les jeux masqués, eux, sont enregistrés)' : 'Réessaie dans un instant' }); return;
  }
  for (const c of describe(changes)) logAdmin('jeu', c.msg, c.id);
  S.hidden = { ...S.hidden, ...hidden };
  S.layout = layout;
  pv.base = published();
  notify('Accueil publié', { kind: 'ok', icon: 'home', sub: `${plural(changes.length, 'modification')} en ligne`,
    undo: async () => {
      await update(ref(db, 'hub/hidden'), prevHidden).catch(() => {});
      if (changes.some(c => c.k !== 'hidden')) await set(ref(db, 'hub/layout'), prevLayout).catch(() => {});
      logAdmin('jeu', 'Publication de l’accueil annulée', 'accueil');
    } });
  drawHome();
}

function describe(changes) {
  const out = [], seen = new Set(), pv = S.pv;
  const site = changes.filter(c => c.k === 'site').map(c => SITE_LABEL[c.f]);
  if (site.length) out.push({ msg: `Haut de l’accueil modifié (${site.join(', ')})`, id: 'accueil' });
  for (const c of changes) {
    if (c.k === 'site') continue;
    if (c.k === 'order') { out.push({ msg: 'Ordre des jeux de l’accueil modifié', id: 'accueil' }); continue; }
    const name = pv.g[c.id].name;
    if (c.k === 'hidden') out.push({ msg: `${name} ${pv.g[c.id].hidden ? 'masqué de' : 'affiché sur'} l’accueil`, id: c.id });
    else if (c.k === 'soon') out.push({ msg: `${name} ${pv.g[c.id].soon ? 'passé en « Bientôt »' : 'de nouveau disponible'}`, id: c.id });
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
        pvRecord();
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
  if (homeClick(e)) return;
  const a = e.target.closest('[data-act]');
  if (!a || a.tagName === 'INPUT' || a.tagName === 'SELECT') return;
  const act = a.dataset.act, room = a.dataset.key && S.rooms.get(a.dataset.key);
  switch (act) {
    case 'close': closeAdmin(); break;
    case 'logout': logout(); break;
    case 'mx-range': S.mxRange = a.dataset.v; S.mx = null; loadMx(); schedule(); break;
    case 'refresh': syncRooms(); loadToday(); notify('Actualisé', { icon: 'undo' }); break;
    case 'room': S.live.glide = true; S.live.sel = a.dataset.key; if (S.sec !== 'live') { S.live.view = 'rooms'; go('live'); } else { S.live.view = 'rooms'; draw('live'); } break;
    case 'room-close': S.live.glide = true; S.live.sel = null; closeSheet(); draw('live'); break;
    case 'lv-view': S.live.view = a.dataset.v; draw('live'); break;
    case 'lv-game': S.live.game = a.dataset.v; draw('live'); break;
    case 'copy': try { await navigator.clipboard.writeText(a.dataset.v); notify('Code copié', { icon: 'copy', sub: a.dataset.v }); } catch (_) {} break;
    case 'pmenu': playerMenu(a, room, a.dataset.p); break;
    case 'kick': { const p = room && playersOf(room).find(x => x.key === a.dataset.p); if (p) kick(room, p, {}); break; }
    case 'del-room': deleteRoom(room); break;
    case 'unban-room': if (room) unbanRoom(room); break;
    case 'cleanup': cleanup(); break;
    case 'maint-off': setMaintenance(false); break;
    case 'unban': unban(a.dataset.uid); break;
    case 'reset-visits': resetVisits(); break;
    case 'del-all': deleteAll(); break;
    case 'edit-game': initPreview(); S.pv.sel = a.dataset.id; S.pv.sheet = true; go('home'); break;
  }
}

function onChange(e) {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const v = a.type === 'checkbox' ? a.checked : a.value;
  switch (a.dataset.act) {
    case 'maint': setMaintenance(v, a); break;
    case 'age': setAgeGate(v, a); break;
    case 'lv-game': S.live.game = v; draw('live'); break;
    case 'lv-idle': S.live.idle = v; draw('live'); break;
    default: homeChange(a, v);
  }
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'ap-live-q') { S.live.q = t.value.trim(); const q = S.el.querySelector('#ap-q'); if (q) q.value = t.value; draw('live'); return; }
  homeInput(t);
}

// Actions immédiates, sans confirmation : chaque action importante affiche une notification, avec
// « Annuler » quand on peut revenir en arrière (l'état d'avant est relu juste avant l'action).
// Déconnexion : l'action est journalisée, le cookie admin du portier est effacé, le compte Google est quitté.
async function logout() {
  try { await logAdmin('connexion', 'Déconnexion de l’administration', 'Google'); } catch (_) {}
  try { await fetch('/__gh/logout', { method: 'POST' }); } catch (_) {}
  try { await adminSignOut(); } catch (_) {}
  stop();
  S.el.classList.add('hidden');
  document.documentElement.style.overflow = '';
  location.reload();
}

async function setMaintenance(on, input) {
  if (on) { try { sessionStorage.setItem('gh-mx-admin', '1'); } catch (_) {} }
  try { await update(ref(db, 'hub/settings'), { maintenance: on }); } catch (_) { if (input) input.checked = !on; notify('Action refusée', { kind: 'err' }); return; }
  S.settings.maintenance = on; schedule();
  logAdmin('reglage', `Maintenance ${on ? 'activée' : 'désactivée'}`);
  notify(on ? 'Site en maintenance' : 'Site rouvert', {
    kind: on ? 'warn' : 'ok', icon: on ? 'pause' : 'live',
    sub: on ? 'Les visiteurs voient l’écran de maintenance, les parties sont gelées' : 'Les visiteurs ont de nouveau accès au site',
    undo: () => setMaintenance(!on),
  });
}

async function setAgeGate(on, input) {
  try { await update(ref(db, 'hub/settings'), { ageGate: on }); } catch (_) { if (input) input.checked = !on; notify('Action refusée', { kind: 'err' }); return; }
  S.settings.ageGate = on; schedule();
  logAdmin('reglage', `Vérification d’âge ${on ? 'activée' : 'désactivée'}`);
  notify(`Vérification d’âge ${on ? 'activée' : 'désactivée'}`, { icon: 'lock', sub: on ? 'La date de naissance est demandée à l’entrée' : 'Le site s’ouvre sans vérification', undo: () => setAgeGate(!on) });
}

// Copie d'une partie (et des secrets d'Undercover) avant suppression, pour pouvoir la remettre.
async function snapshot(r) {
  const [room, sec, host] = await Promise.all([get(ref(db, r.key)),
    r.prefix === 'games' ? get(ref(db, `ucSecret/${r.code}`)) : null, r.prefix === 'games' ? get(ref(db, `ucHost/${r.code}`)) : null]);
  return { key: r.key, code: r.code, room: room.val(), sec: sec && sec.val(), host: host && host.val() };
}
async function restore(snaps) {
  for (const x of snaps) {
    if (!x.room) continue;
    // Mauvais Perdants : présence et réponses doivent porter l'heure du serveur, on ne les remet pas.
    if (x.key.startsWith('mp/')) { delete x.room.presence; delete x.room.start; delete x.room.subs; }
    await set(ref(db, x.key), x.room).catch(() => {});
    if (x.sec) await set(ref(db, `ucSecret/${x.code}`), x.sec).catch(() => {});
    if (x.host) await set(ref(db, `ucHost/${x.code}`), x.host).catch(() => {});
  }
  syncRooms();
}

async function deleteRoom(r) {
  if (!r) return;
  let snap;
  try { snap = await snapshot(r); await removeRoom(r); } catch (_) { notify('Suppression refusée', { kind: 'err', sub: r.prefix === 'wr' ? 'Règles de la base à publier (WikiRace)' : 'Réessaie dans un instant' }); return; }
  logAdmin('partie', `Partie ${r.code} supprimée`, r.g.name);
  if (S.live.sel === r.key) { S.live.sel = null; closeSheet(); }
  notify('Partie supprimée', { icon: 'trash', sub: `${r.g.name} · ${r.code}`, undo: async () => { await restore([snap]); logAdmin('partie', `Partie ${r.code} restaurée`, r.g.name); } });
}
async function removeRoom(r) {
  if (r.prefix === 'games') { await remove(ref(db, `ucSecret/${r.code}`)); await remove(ref(db, `ucHost/${r.code}`)); }
  await remove(ref(db, r.key));
  r.offs.forEach(f => f()); S.rooms.delete(r.key); schedule();
}

async function cleanup() {
  const idle = totals().rooms.filter(x => x.idle);
  if (!idle.length) return;
  const snaps = [];
  let refused = 0;
  for (const x of idle) { try { snaps.push(await snapshot(x.r)); await removeRoom(x.r); } catch (_) { refused++; } }
  if (!snaps.length) { notify('Nettoyage refusé', { kind: 'err', sub: 'Règles de la base à publier (WikiRace)' }); return; }
  logAdmin('global', `${plural(snaps.length, 'partie inactive supprimée', 'parties inactives supprimées')}`, 'nettoyage');
  notify(`${plural(snaps.length, 'partie inactive supprimée', 'parties inactives supprimées')}`, { icon: 'broom', kind: refused ? 'warn' : '', sub: refused ? `${plural(refused, 'partie refusée', 'parties refusées')} : règles de la base à publier` : 'Sans joueur connecté ni signe de vie',
    undo: async () => { await restore(snaps); logAdmin('global', `${plural(snaps.length, 'partie restaurée', 'parties restaurées')}`, 'nettoyage'); } });
}

async function deleteAll() {
  const snaps = [];
  for (const r of [...S.rooms.values()]) { try { snaps.push(await snapshot(r)); } catch (_) {} }
  for (const g of CATALOG) { try { await remove(ref(db, g.db)); } catch (_) {} }
  await remove(ref(db, 'ucSecret')).catch(() => {}); await remove(ref(db, 'ucHost')).catch(() => {});
  for (const r of S.rooms.values()) r.offs.forEach(f => f());
  S.rooms.clear(); S.live.sel = null; schedule();
  logAdmin('global', 'Toutes les parties supprimées', 'tous les jeux');
  notify('Toutes les parties supprimées', { kind: 'warn', icon: 'trash', sub: `${plural(snaps.length, 'partie')}, tous jeux confondus`,
    undo: async () => { await restore(snaps); logAdmin('global', 'Parties restaurées après suppression globale', 'tous les jeux'); } });
}

// ── Joueurs ──
function playerMenu(anchor, r, key) {
  if (!r) return;
  const p = playersOf(r).find(x => x.key === key);
  if (!p) return;
  const items = [
    { t: 'Renommer', i: 'edit', f: () => renamePlayer(r, p, anchor) },
    { t: 'Exclure de la partie', i: 'kick', f: () => kick(r, p, {}), off: p.host },
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

// Exclut le joueur ; renvoie de quoi le remettre (valeurs d'avant), ou null en cas d'échec.
async function kick(r, p, { ban = false, silent = false } = {}) {
  const u = kickUpdates(r, p);
  if (ban && p.uid) u[`banned/${p.uid}`] = true;
  const before = {};
  await Promise.all(Object.keys(u).map(async k => { const snap = await get(ref(db, `${r.key}/${k}`)).catch(() => null); before[k] = snap ? snap.val() : null; }));
  let partial = false;
  try { await update(ref(db, r.key), u); }
  catch (e) {
    if (!(ban && isDenied(e))) { notify('Exclusion refusée', { kind: 'err' }); return null; }
    delete u[`banned/${p.uid}`]; delete before[`banned/${p.uid}`]; partial = true;   // règles pas encore publiées : on exclut au moins
    try { await update(ref(db, r.key), u); } catch (_) { notify('Exclusion refusée', { kind: 'err' }); return null; }
  }
  logAdmin('joueur', `${p.name} exclu de la partie ${r.code}${ban && !partial ? ' pour de bon' : ''}`, r.g.name);
  if (r.prefix === 'mp') for (const k of Object.keys(before)) if (k.startsWith('presence/')) before[k] = null;
  const undo = async () => { await update(ref(db, r.key), before).catch(() => {}); logAdmin('joueur', `${p.name} réintégré dans la partie ${r.code}`, r.g.name); };
  if (!silent) notify(`${p.name} exclu`, { icon: ban ? 'lock' : 'kick', kind: partial ? 'warn' : '', undo,
    sub: partial ? 'Exclusion définitive impossible : règles de la base à publier' : `${r.g.name} · ${r.code}${ban ? ' · ne peut plus revenir' : ''}` });
  return { undo };
}

// Renommage sur place : le nom devient un champ dans sa ligne. Entrée enregistre, Échap annule.
function inlineEdit(anchor, value, max) {
  return new Promise(resolve => {
    const row = anchor && anchor.closest('.ap-row, tr');
    const slot = row && (row.querySelector('.who') || row.querySelector('.t'));
    if (!slot) return resolve(null);
    S.editing = true;
    const keep = slot.innerHTML;
    slot.innerHTML = `<input class="ap-inline" type="text" maxlength="${max}" value="${esc(value)}" aria-label="Nouveau nom">`;
    const f = slot.querySelector('input');
    f.focus(); f.select();
    let done = false;
    const end = v => { if (done) return; done = true; S.editing = false; slot.innerHTML = keep; resolve(v); schedule(); };
    f.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = f.value.trim(); if (!v || /</.test(v)) { f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); return; } end(v); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); }
    });
    f.addEventListener('blur', () => { const v = f.value.trim(); end(v && !/</.test(v) && v !== value ? v : null); });
  });
}

async function renamePlayer(r, p, anchor) {
  const max = NAME_MAX[r.prefix] || 30;
  const name = await inlineEdit(anchor, p.name, max);
  if (!name || name === p.name) return;
  const v = name.trim(), u = { [`${p.path}/name`]: v }, back = { [`${p.path}/name`]: p.name };
  if (r.prefix === 'mp' && p.uid) {
    const roster = await get(ref(db, `${r.key}/match/roster/${p.uid}`)).catch(() => null);
    if (roster && roster.exists()) { u[`match/roster/${p.uid}/name`] = v; back[`match/roster/${p.uid}/name`] = roster.val().name; }
  }
  try { await update(ref(db, r.key), u); } catch (_) { notify('Renommage refusé', { kind: 'err' }); return; }
  logAdmin('joueur', `${p.name} renommé « ${v} » dans la partie ${r.code}`, r.g.name);
  notify('Joueur renommé', { icon: 'edit', sub: `${p.name} → ${v}`, undo: () => update(ref(db, r.key), back).catch(() => {}) });
}

async function banSite(r, p) {
  try { await set(ref(db, `bans/${p.uid}`), { at: Date.now(), name: String(p.name || '').replace(/</g, '').slice(0, 40) }); }
  catch (e) { notify('Bannissement refusé', { kind: 'err', sub: isDenied(e) ? 'Règles de la base à publier' : 'Réessaie dans un instant' }); return; }
  const k = p.host ? null : await kick(r, p, { ban: true, silent: true });
  logAdmin('joueur', `${p.name} banni du site`, r.g.name);
  notify(`${p.name} banni du site`, { kind: 'warn', icon: 'bans', sub: 'Plus aucun accès aux parties, sur tous les jeux',
    undo: async () => { await remove(ref(db, `bans/${p.uid}`)).catch(() => {}); if (k) await k.undo(); logAdmin('joueur', `Bannissement de ${p.name} annulé`); } });
}

async function unban(uid) {
  const b = S.bans[uid] || {};
  try { await remove(ref(db, `bans/${uid}`)); } catch (_) { notify('Action refusée', { kind: 'err' }); return; }
  logAdmin('joueur', `Bannissement de ${b.name || 'un compte'} levé`);
  notify('Bannissement levé', { icon: 'bans', sub: `${b.name || 'Ce compte'} peut de nouveau jouer`, undo: () => set(ref(db, `bans/${uid}`), b).catch(() => {}) });
}

async function unbanRoom(r) {
  const before = r.f.banned;
  try { await update(ref(db, r.key), { banned: null }); } catch (_) { notify('Action refusée', { kind: 'err' }); return; }
  logAdmin('joueur', `Exclusions levées pour la partie ${r.code}`, r.g.name);
  notify('Exclusions levées', { icon: 'lock', sub: `${r.g.name} · ${r.code}`, undo: () => update(ref(db, r.key), { banned: before }).catch(() => {}) });
}

async function resetVisits() {
  try { await set(ref(db, 'hub/stats/visits'), 0); } catch (_) { notify('Action refusée', { kind: 'err' }); return; }
  logAdmin('stats', 'Compteur historique de visites remis à zéro');
  notify('Compteur remis à zéro', { icon: 'audience', sub: 'Les statistiques d’audience ne changent pas' });
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// Alertes, menus, feuilles, messages
// ════════════════════════════════════════════════════════════════════════════════════════════
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
  const close = () => { if (k === 'room') S.live.sel = null; else if (S.pv) { S.pv.sel = null; S.pv.sheet = false; } closeSheet(); draw(S.sec); };
  veil.addEventListener('click', close);
}
function closeSheet() { document.querySelectorAll('.ap-sheet, .ap-veil[data-sheet]').forEach(x => x.remove()); }

// Notification façon iOS : descend du haut, icône, titre, détail, « Annuler » quelques secondes.
let notifTimer = 0;
function notify(title, { sub = '', kind = '', icon: ic = 'info', undo = null } = {}) {
  let n = S.el.querySelector('.ap-notif');
  if (!n) { n = document.createElement('div'); n.className = 'ap-notif'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); S.el.append(n); }
  n.dataset.kind = kind;
  n.innerHTML = `<span class="ico">${icon(kind === 'err' ? 'warn' : ic)}</span><span class="txt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${undo ? '<button type="button" class="undo">Annuler</button>' : ''}`;
  n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
  if (undo) n.querySelector('.undo').addEventListener('click', async () => {
    n.classList.remove('show'); clearTimeout(notifTimer);
    await undo();
    notify('Action annulée', { icon: 'undo' });
  }, { once: true });
  // Le trait du bas se vide pendant la durée d'affichage ; il s'arrête avec la souris et repart à sa sortie.
  const hide = ms => {
    clearTimeout(notifTimer); notifTimer = setTimeout(() => n.classList.remove('show'), ms);
    n.style.setProperty('--dur', ms + 'ms'); n.dataset.t = n.dataset.t === 'a' ? 'b' : 'a';   // change d'animation : le trait repart de zéro
  };
  hide(undo ? 6000 : 3200);
  n.onmouseenter = () => clearTimeout(notifTimer);
  n.onmouseleave = () => hide(2200);
}
const toast = (text, err = false) => notify(text, { kind: err ? 'err' : '' });
