// Mini Subway : accueil, menus, réglages, lancement des parties (solo et multijoueur).
// Le multijoueur (Firebase) n'est chargé qu'à la demande : le solo marche hors ligne.

import * as store from './store.js';
import { MAPS, MAP_BY_ID } from './engine/maps.js';
import { MODES } from './engine/params.js';
import { createGame, apply, drainEvents } from './engine/sim.js';
import { hashString, seedLabel } from './engine/rng.js';
import { botTurn } from './engine/autoplay.js';
import { dailyChallenge, weeklyChallenge, CHALLENGE_MODS, recordRun, isUnlocked, unlockText, ACHIEVEMENTS } from './engine/progress.js';
import { Renderer, shapeSVG } from './render.js';
import { Audio } from './audio.js';
import { Game, LocalSession } from './game.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const profile = store.load();
const S = profile.settings;
const audio = new Audio();
audio.set({ music: S.music, sfx: S.sfx, muted: S.muted });
let game = null, lobby = null, attract = null;
let pick = { map: profile.lastMap && MAP_BY_ID[profile.lastMap] ? profile.lastMap : 'val-dorme', mode: profile.lastMode || 'classic' };

const MODE_DESC = {
  classic: 'Acheminez un maximum de voyageurs. Chaque fin de semaine apporte une locomotive et une amélioration au choix. Une station qui déborde trop longtemps met fin au service.',
  infinite: 'Pas de défaite : construisez et observez. Une jauge d’efficacité monte quand le réseau livre bien ; pleine, elle offre une récompense.',
  extreme: 'Les règles du Classique, mais chaque placement est définitif : une ligne ne peut plus que s’allonger, trains et wagons restent où vous les posez.',
  creative: 'Ressources illimitées, aucune défaite. Posez, déplacez et effacez des stations, réglez le trafic, annulez à volonté.',
};

// ───────── thème et réglages ─────────
function applyTheme() {
  const night = S.theme === 'night' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = night ? 'night' : 'day';
  root.dataset.contrast = S.contrast ? 'high' : 'normal';
  root.dataset.motion = S.motion === 'reduced' ? 'reduced' : 'normal';
  $('meta[name="theme-color"]').content = night ? '#121821' : '#F1EDE3';
  audio.set({ music: S.music, sfx: S.sfx, muted: S.muted });
  if (game) game.applySettings(S);
  if (attract) attract.R.setOptions({ theme: night ? 'night' : 'day', palette: S.palette, reduced: reducedMotion() });
  $$('.map-card canvas').forEach(c => c.dataset.drawn = '');
  if (!$('#p-play').hidden) renderMaps();
}
const reducedMotion = () => S.motion === 'reduced' || (S.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function saveSettings() { if (!store.save()) toastMenu('Impossible d’enregistrer : stockage du navigateur indisponible.'); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ───────── écrans et panneaux ─────────
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'menu') startAttract(); else stopAttract();
}
let lastFocus = null;
function openSheet(name) {
  closeSheets();
  const el = $('#p-' + name);
  if (!el) return;
  lastFocus = document.activeElement;
  ({ play: renderPlay, challenges: renderChallenges, records: renderRecords, settings: renderSettings, help: renderHelp, multi: renderMulti })[name]?.();
  el.hidden = false;
  el.querySelector('[data-close]')?.focus();
}
function closeSheets() { $$('.sheet').forEach(s => (s.hidden = true)); }
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) { audio.unlock(); audio.ui(); openSheet(o.dataset.open); return; }
  if (e.target.closest('[data-close]')) { closeSheets(); if (game) gameSheetClosed(); lastFocus?.focus?.(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $$('.sheet').some(s => !s.hidden)) { e.stopImmediatePropagation(); closeSheets(); if (game) gameSheetClosed(); }
}, true);
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Les panneaux Réglages/Aide s'ouvrent aussi en jeu, par-dessus la partie.
function gameSheetClosed() { $('#menu').classList.remove('active', 'overlay'); }
function openInGame(name) {
  $('#menu').classList.add('active', 'overlay');
  openSheet(name);
}

function toastMenu(msg) { const n = $('#mp-status'); if (n) { n.textContent = msg; n.classList.add('err'); } }

// ───────── écran d'accueil animé ─────────
function startAttract() {
  if (attract) return;
  const cv = $('#attract');
  const R = new Renderer(cv);
  R.setOptions({ theme: document.documentElement.dataset.theme, palette: S.palette, reduced: reducedMotion() });
  const map = MAPS[Math.floor(Math.random() * 3)].id;
  const st = createGame({ map, mode: 'infinite', seed: (Math.random() * 2 ** 32) >>> 0 });
  const ses = new LocalSession(st);
  // Prélude : la ville a déjà quelques lignes quand l'accueil s'affiche.
  for (let i = 0; i < 1800; i++) { ses.update(50); if (i % 30 === 0) botTurn(st); }
  attract = { R, ses, st, n: 0 };
  const loop = (t, prev) => {
    if (!attract) return;
    const dt = reducedMotion() ? 0 : t - prev;
    const f = ses.update(dt);
    if ((attract.n += dt) > 1500) { attract.n = 0; botTurn(st); }
    const wide = R.W > 720;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of st.stations) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    const target = R.fitBox(x0 - 90, y0 - 90, x1 + 140, y1 + 90, wide ? { t: 40, r: 40, b: 40, l: R.W * 0.42 } : { t: 24, r: 16, b: R.H * 0.64, l: 16 });
    const c = R.cam; c.x += (target.x - c.x) * 0.02; c.y += (target.y - c.y) * 0.02; c.z += (target.z - c.z) * 0.02;
    if (!attract.snapped) { Object.assign(c, target); attract.snapped = true; }
    R.now = t;
    R.onEvents(st, drainEvents(st));
    R.frame(st, f, null, t);
    attract.raf = requestAnimationFrame(n => loop(n, t));
  };
  attract.raf = requestAnimationFrame(t => loop(t, t));
  window.addEventListener('resize', attract.onResize = () => R.resize());
}
function stopAttract() {
  if (!attract) return;
  cancelAnimationFrame(attract.raf);
  window.removeEventListener('resize', attract.onResize);
  attract = null;
}

// ───────── Jouer ─────────
function renderPlay() { renderMaps(); renderModes(); }
function renderMaps() {
  const box = $('#map-list');
  box.innerHTML = MAPS.map(m => {
    const unl = isUnlocked(profile, m.id);
    const rec = profile.records[`${m.id}:${pick.mode}`];
    return `<button class="map-card ${unl ? '' : 'locked'}" role="radio" aria-checked="${pick.map === m.id}" data-map="${m.id}" ${unl ? '' : `aria-disabled="true" title="${esc(unlockText(m.id))}"`}>
      <canvas width="320" height="200" data-thumb="${m.id}"></canvas>
      ${unl ? '' : '<span class="lock"><svg><use href="#i-lock"/></svg>Verrouillée</span>'}
      <span class="mc-txt"><strong>${esc(m.name)}</strong><small>${unl ? (rec ? `Record ${rec.best}` : esc(m.tagline)) : esc(unlockText(m.id))}</small></span></button>`;
  }).join('');
  box.querySelectorAll('canvas[data-thumb]').forEach(c => thumb(c, c.dataset.thumb));
  box.onclick = e => {
    const b = e.target.closest('[data-map]');
    if (!b) return;
    if (b.classList.contains('locked')) { $('#mode-desc').textContent = '🔒 ' + unlockText(b.dataset.map); return; }
    pick.map = b.dataset.map; audio.ui();
    box.querySelectorAll('[data-map]').forEach(x => x.setAttribute('aria-checked', x === b));
    renderModes();
  };
}
function thumb(cv, mapId) {
  const R = new Renderer(cv, { w: 320, h: 200 });
  R.setOptions({ theme: document.documentElement.dataset.theme, palette: S.palette, reduced: true });
  const st = createGame({ map: mapId, seed: 1 });
  Object.assign(R.cam, R.fitBox(0, 0, 1600, 1000, { t: 0, r: 0, b: 0, l: 0 }));
  R.cam.z *= 1.18; R.cam.x = st.stations.reduce((a, s) => a + s.x, 0) / st.stations.length; R.cam.y = st.stations.reduce((a, s) => a + s.y, 0) / st.stations.length;
  R.now = 0;
  R.frame(st, 0, null, 0);
}
function renderModes() {
  $('#mode-list').innerHTML = Object.values(MODES).map(m => `<button class="chip ${pick.mode === m.id ? 'on' : ''}" role="radio" aria-checked="${pick.mode === m.id}" data-mode="${m.id}">${m.name}</button>`).join('');
  $('#mode-desc').textContent = MODE_DESC[pick.mode];
  $('#mode-list').onclick = e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    pick.mode = b.dataset.mode; audio.ui();
    renderModes(); renderMaps();
  };
}
$('#start-solo').addEventListener('click', () => {
  audio.unlock();
  if (!isUnlocked(profile, pick.map)) return;
  const raw = $('#seed-input').value.trim().toUpperCase();
  const seed = raw ? hashString('seed:' + raw) : (Math.random() * 2 ** 32) >>> 0;
  profile.lastMap = pick.map; profile.lastMode = pick.mode; saveSettings();
  startSolo({ map: pick.map, mode: pick.mode, seed });
});

function startSolo(opts) {
  closeSheets();
  if (game) { game.destroy(); game = null; }
  const st = createGame({ map: opts.map, mode: opts.mode, seed: opts.seed, patch: opts.patch || null });
  if (S.speed === 2) apply(st, { type: 'speed', v: 2 });
  show('game');
  audio.startMusic();
  game = new Game({
    session: new LocalSession(st), audio, settings: S,
    meta: { challenge: opts.challenge || null, kind: opts.kind || 'solo' },
    onEnd: run => endSolo(run, opts),
    onQuit: () => { game = null; audio.stopMusic(); show('menu'); refreshMenu(); },
    onRestart: () => startSolo({ ...opts, seed: opts.challenge ? opts.seed : (Math.random() * 2 ** 32) >>> 0 }),
  });
  game.saveSettings = saveSettings;
  game.onSheet = name => openInGame(name);
}

function endSolo(run, opts) {
  run.kind = opts.kind || 'solo';
  if (opts.challenge) {
    run.challenge = opts.challenge;
    if (opts.goal) run.goalMet = run.score >= opts.goal.score && run.maxLines <= opts.goal.maxLines;
  }
  const already = opts.challenge && profile.challenges[opts.challenge] && profile.challenges[opts.challenge].official !== null;
  const out = recordRun(profile, run);
  out.practice = !!already;
  out.saveFailed = !store.save();
  for (const a of out.achievements) setTimeout(() => audio.achieve(), 400);
  return out;
}

// ───────── Défis ─────────
function renderChallenges() {
  const now = new Date();
  const list = [dailyChallenge(now), weeklyChallenge(now)];
  $('#challenge-list').innerHTML = `<p class="note">Graine, ville et modificateurs dépendent seulement de la date (UTC) : tout le monde joue la même partie. Les résultats restent sur cet appareil ; la première partie terminée compte comme tentative officielle, les suivantes comme entraînement.</p>` + list.map(c => {
    const r = profile.challenges[c.id];
    const mods = c.mods.map(k => `<span class="tag mod" title="${esc(CHALLENGE_MODS[k].desc)}">${esc(CHALLENGE_MODS[k].name)}</span>`).join('');
    return `<article class="ch-card"><header><h3>${c.title}</h3><span class="ch-key">${c.key}</span></header>
      <div class="ch-meta"><span class="tag">${esc(MAP_BY_ID[c.map].name)}</span><span class="tag">Classique</span><span class="tag">Graine ${seedLabel(c.seed)}</span>${mods}</div>
      ${c.mods.length ? `<p class="ch-res">${c.mods.map(k => esc(CHALLENGE_MODS[k].desc)).join(' ')}</p>` : ''}
      ${c.goal ? `<p class="ch-res">Objectif : ${c.goal.score} voyageurs avec ${c.goal.maxLines} lignes au plus.</p>` : ''}
      <p class="ch-res">${r ? `Score officiel : <b>${r.official}</b>${c.goal ? (r.goal ? ' · objectif atteint' : ' · objectif manqué') : ''} · meilleur entraînement : ${r.best} · ${r.attempts} partie${r.attempts > 1 ? 's' : ''}` : 'Une tentative officielle, puis entraînement libre.'}</p>
      <button class="btn ${r ? '' : 'primary'}" data-ch="${c.kind}">${r ? 'S’entraîner' : 'Jouer la tentative officielle'}</button></article>`;
  }).join('');
  $('#challenge-list').onclick = e => {
    const b = e.target.closest('[data-ch]');
    if (!b) return;
    const c = list.find(x => x.kind === b.dataset.ch);
    audio.unlock();
    startSolo({ map: c.map, mode: 'classic', seed: c.seed, patch: c.patch, challenge: c.id, kind: c.kind, goal: c.goal });
  };
}

// ───────── Records et succès ─────────
function renderRecords() {
  const modes = Object.values(MODES).filter(m => m.id !== 'creative');
  const rows = MAPS.map(m => `<tr><td>${esc(m.name)}</td>${modes.map(md => { const r = profile.records[`${m.id}:${md.id}`]; return `<td class="num">${r ? r.best : '—'}</td>`; }).join('')}</tr>`).join('');
  const got = Object.keys(profile.achievements).length;
  $('#records-body').innerHTML = `
    <h3 class="label">Meilleurs scores (voyageurs livrés)</h3>
    <table class="rec-table"><thead><tr><th>Ville</th>${modes.map(m => `<th style="text-align:right">${m.name}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <p class="note">${profile.totals.games} partie${profile.totals.games > 1 ? 's' : ''} · ${profile.totals.delivered} voyageurs livrés au total. Records enregistrés sur cet appareil uniquement.</p>
    <h3 class="label">Succès · ${got} / ${ACHIEVEMENTS.length}</h3>
    <div class="ach-grid">${ACHIEVEMENTS.map((a, i) => `<div class="ach ${profile.achievements[a.id] ? 'got' : ''}"><span class="ach-ico" aria-hidden="true">${shapeSVG(['circle', 'triangle', 'square', 'star', 'diamond', 'pentagon', 'cross', 'egg', 'gem', 'wedge', 'circle'][i], 16)}</span><strong>${esc(a.name)}</strong><span>${esc(a.desc)}</span><span class="sr">${profile.achievements[a.id] ? 'Obtenu' : 'À obtenir'}</span></div>`).join('')}</div>
    <h3 class="label">Dernières parties</h3>
    ${profile.history.length ? `<table class="rec-table"><tbody>${profile.history.slice(0, 10).map(h => `<tr><td>${esc(MAP_BY_ID[h.map]?.name || h.map)} · ${MODES[h.mode]?.name || h.mode}${h.kind !== 'solo' ? ` · ${h.kind}` : ''}</td><td class="num">${h.score}</td><td class="num">sem. ${h.week}</td><td class="num">${seedLabel(h.seed)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Aucune partie terminée pour l’instant.</p>'}`;
}

// ───────── Réglages ─────────
const SETTINGS = [
  ['theme', 'Thème', 'seg', [['day', 'Jour'], ['night', 'Nuit'], ['auto', 'Système']]],
  ['palette', 'Couleurs des lignes', 'seg', [['standard', 'Standard'], ['cb', 'Daltonien']], 'Palette distincte et numéros sur les lignes.'],
  ['contrast', 'Contraste renforcé', 'toggle'],
  ['labels', 'Taille des voyageurs', 'seg', [['normal', 'Normale'], ['large', 'Grande']]],
  ['motion', 'Animations', 'seg', [['auto', 'Système'], ['reduced', 'Réduites'], ['full', 'Complètes']]],
  ['music', 'Musique', 'range'], ['sfx', 'Effets sonores', 'range'], ['muted', 'Couper tout le son', 'toggle'],
  ['speed', 'Vitesse au départ', 'seg', [[1, '1×'], [2, '2×']]],
  ['pauseOnHide', 'Pause quand l’onglet est masqué', 'toggle'],
  ['confirmRestart', 'Confirmer avant de recommencer', 'toggle'],
  ['hints', 'Conseils de départ', 'toggle'],
  ['haptics', 'Vibrations', 'toggle', null, 'Sur mobile, lors des alertes.'],
];
function renderSettings() {
  const body = $('#settings-body');
  body.innerHTML = SETTINGS.map(([k, label, type, opts, help]) => {
    const v = S[k];
    let ctl = '';
    if (type === 'seg') ctl = `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([o, n]) => `<button class="chip ${v === o ? 'on' : ''}" role="radio" aria-checked="${v === o}" data-set="${k}" data-val="${o}">${n}</button>`).join('')}</div>`;
    else if (type === 'toggle') ctl = `<button class="toggle" role="switch" aria-checked="${!!v}" aria-label="${esc(label)}" data-set="${k}"></button>`;
    else ctl = `<input type="range" min="0" max="1" step="0.05" value="${v}" aria-label="${esc(label)}" data-set="${k}">`;
    return `<div class="set"><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span>${ctl}</div>`;
  }).join('') + `
    <h3 class="label">Données</h3>
    <div class="set"><span>Résumé de progression<small>Fichier JSON : records, succès, réglages.</small></span><button class="btn small" id="set-export">Exporter</button></div>
    <div class="set"><span>Réinitialiser<small>Efface records, succès et réglages de cet appareil.</small></span><button class="btn small danger" id="set-reset">Effacer</button></div>`;
  body.onclick = e => {
    const b = e.target.closest('[data-set]');
    if (b && b.tagName === 'BUTTON') {
      const k = b.dataset.set;
      const def = SETTINGS.find(x => x[0] === k);
      S[k] = def[2] === 'toggle' ? !S[k] : (typeof S[k] === 'number' ? Number(b.dataset.val) : b.dataset.val);
      saveSettings(); applyTheme(); renderSettings(); audio.ui();
      return;
    }
    if (e.target.id === 'set-export') {
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mini-subway-progression.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    if (e.target.id === 'set-reset') confirmBox('Effacer records, succès et réglages enregistrés sur cet appareil ?', 'Effacer', () => { store.reset(); location.reload(); });
  };
  body.oninput = e => {
    const r = e.target.closest('input[type="range"]');
    if (!r) return;
    S[r.dataset.set] = Number(r.value);
    audio.set({ music: S.music, sfx: S.sfx });
    saveSettings();
  };
}
function confirmBox(text, label, yes) {
  $('#cf-text').textContent = text; $('#cf-yes').textContent = label;
  $('#m-confirm').hidden = false;
  $('#cf-yes').onclick = () => { $('#m-confirm').hidden = true; yes(); };
  $('#cf-no').onclick = () => { $('#m-confirm').hidden = true; };
  $('#cf-no').focus();
}

// ───────── Aide ─────────
function renderHelp() {
  const shapes = ['circle', 'triangle', 'square', 'star', 'diamond', 'pentagon', 'cross', 'egg', 'gem', 'wedge'];
  const names = { circle: 'Cercle', triangle: 'Triangle', square: 'Carré', star: 'Étoile', diamond: 'Losange', pentagon: 'Pentagone', cross: 'Croix', egg: 'Œuf', gem: 'Gemme', wedge: 'Chevron' };
  $('#help-body').innerHTML = `
    <h3>Le but</h3>
    <p>Chaque voyageur porte la forme de sa destination : il veut rejoindre <b>n’importe quelle</b> station de cette forme. Reliez les stations par des lignes, les trains font le reste. Une station dont la file dépasse sa capacité se couvre d’un anneau : s’il se referme, le service s’arrête.</p>
    <div class="shape-row">${shapes.map(s => `<span>${shapeSVG(s, 18, 'var(--card)', 'var(--ink)', 2.2)}${names[s]}</span>`).join('')}</div>
    <p style="margin-top:8px">Les trois premières formes sont courantes ; les autres sont rares, souvent uniques sur la carte.</p>
    <h3>Construire</h3>
    <ul>
      <li><b>Nouvelle ligne</b> : glissez d’une station à l’autre. Repassez sur la station précédente pour revenir en arrière, revenez à la première pour fermer une boucle.</li>
      <li><b>Prolonger ou raccourcir</b> : glissez la barre au bout d’une ligne.</li>
      <li><b>Insérer une station</b> : glissez le milieu d’un tronçon jusqu’à elle.</li>
      <li><b>Ressources</b> : glissez une locomotive sur une ligne, un wagon sur un train, un pôle d’échange sur une station — ou touchez la ressource puis sa cible.</li>
      <li><b>Ponts et tunnels</b> : consommés automatiquement quand une ligne traverse l’eau, rendus quand le tronçon disparaît.</li>
      <li>Touchez une station, une ligne ou un train pour ouvrir son panneau (retirer une station d’une ligne, ajouter des wagons, supprimer…).</li>
    </ul>
    <h3>Commandes</h3>
    <ul>
      <li><span class="kbd">Espace</span> pause / reprise · <span class="kbd">1</span> vitesse normale · <span class="kbd">2</span> vitesse rapide</li>
      <li><span class="kbd">Échap</span> menu · <span class="kbd">F</span> recentrer · <span class="kbd">M</span> son · <span class="kbd">+</span> <span class="kbd">−</span> zoom</li>
      <li>Molette ou pincement : zoom · glisser dans le vide : déplacer la carte</li>
      <li>Créatif : <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> annuler, <span class="kbd">Ctrl</span>+<span class="kbd">Y</span> rétablir</li>
    </ul>
    <h3>Modes</h3>
    <ul>${Object.values(MODES).map(m => `<li><b>${m.name}</b> : ${MODE_DESC[m.id]}</li>`).join('')}</ul>
    <h3>Multijoueur</h3>
    <ul>
      <li><b>Coopération</b> (2 à 4) : un réseau, un inventaire et un score communs. L’hôte règle la pause et la vitesse ; la première personne qui choisit la récompense décide pour tous.</li>
      <li><b>Versus</b> (2) : même ville, mêmes apparitions, deux réseaux. Le premier réseau saturé perd ; à la même seconde, le plus grand nombre de voyageurs livrés l’emporte.</li>
      <li>L’hôte fait foi : il n’y a pas de serveur arbitre, les résultats ne sont pas des classements vérifiés.</li>
    </ul>`;
}

// ───────── Multijoueur ─────────
let mpKind = 'coop';
function renderMulti() {
  $('#mp-name').value = profile.name || '';
  $('#mp-map').innerHTML = MAPS.filter(m => isUnlocked(profile, m.id)).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('#mp-status').textContent = ''; $('#mp-status').classList.remove('err');
}
$('#mp-kind').addEventListener('click', e => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  mpKind = b.dataset.kind;
  $$('#mp-kind .chip').forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
  $('#mp-mode-wrap').hidden = mpKind === 'versus';
});
function mpName() {
  const n = $('#mp-name').value.trim().replace(/[<>]/g, '').slice(0, 20);
  if (!n) { mpStatus('Indiquez votre nom.', true); $('#mp-name').focus(); return null; }
  profile.name = n; saveSettings();
  return n;
}
function mpStatus(t, err) { const n = $('#mp-status'); n.textContent = t; n.classList.toggle('err', !!err); }
async function loadNet() {
  try { return await import('./net.js'); }
  catch (e) { mpStatus('Connexion au service multijoueur impossible (hors ligne ?).', true); throw e; }
}
$('#mp-create').addEventListener('click', async () => {
  const name = mpName(); if (!name) return;
  audio.unlock();
  mpStatus('Création du salon…');
  try {
    const net = await loadNet();
    const l = await net.createRoom({ kind: mpKind, map: $('#mp-map').value, mode: mpKind === 'versus' ? 'classic' : $('#mp-mode').value, name });
    enterLobby(l);
  } catch (e) { mpStatus(net_err(e), true); }
});
async function join(code) {
  const name = mpName(); if (!name) return;
  audio.unlock();
  code = code.trim().toUpperCase();
  if (!/^[A-Z]{3,5}-[0-9]{2}$/.test(code)) { mpStatus('Code invalide : il ressemble à « RAIL-42 ».', true); return; }
  mpStatus('Connexion au salon…');
  try {
    const net = await loadNet();
    enterLobby(await net.joinRoom(code, name));
  } catch (e) { mpStatus(net_err(e), true); }
}
$('#mp-join').addEventListener('click', () => join($('#mp-code').value));
$('#mp-code').addEventListener('keydown', e => { if (e.key === 'Enter') join($('#mp-code').value); });
const net_err = e => (e && e.userMessage) || 'Erreur réseau : réessayez.';

function enterLobby(l) {
  lobby = l;
  try { sessionStorage.setItem('ms-room', l.code); } catch (_) {}
  closeSheets();
  show('lobby');
  l.onChange = renderLobby;
  l.onStart = session => startNet(session);
  l.onClosed = msg => { lobby = null; forgetRoom(); if (game) { game.destroy(); game = null; } show('menu'); openSheet('multi'); mpStatus(msg, true); };
  renderLobby(l.info());
}
function renderLobby(info) {
  if (!info) return;
  $('#lobby-kind').textContent = info.kind === 'versus' ? 'Versus · 2 joueurs' : 'Coopération · 2 à 4 joueurs';
  $('#lobby-title').textContent = info.isHost ? 'Votre salon' : 'Salon';
  $('#lobby-code').textContent = info.code;
  $('#lobby-cfg').textContent = `${MAP_BY_ID[info.map].name} · ${MODES[info.mode].name}`;
  const cols = MAP_BY_ID[info.map].palette.lines;
  $('#lobby-players').innerHTML = info.players.map((p, i) => `<li><span class="dot" style="background:${cols[i % cols.length]}"></span><span class="pname">${esc(p.name)}${p.uid === info.me ? ' (vous)' : ''}</span><span class="pstate ${!p.online ? 'off' : p.ready || p.host ? 'ready' : ''}">${!p.online ? 'hors ligne' : p.host ? 'hôte' : p.ready ? 'prêt' : 'en attente'}</span></li>`).join('');
  const max = info.kind === 'versus' ? 2 : 4;
  const others = info.players.filter(p => !p.host);
  const allReady = others.length >= 1 && others.every(p => p.ready && p.online);
  $('#lobby-start').hidden = !info.isHost;
  $('#lobby-start').disabled = !allReady || info.players.length > max;
  $('#lobby-ready').hidden = info.isHost;
  const meP = info.players.find(p => p.uid === info.me);
  $('#lobby-ready').textContent = meP && meP.ready ? 'Je ne suis plus prêt' : 'Je suis prêt';
  $('#lobby-status').textContent = info.error || (info.isHost ? (others.length ? (allReady ? 'Tout le monde est prêt.' : 'En attente des autres joueurs…') : 'Partagez le code pour inviter.') : 'L’hôte lancera la partie quand tout le monde sera prêt.');
  $('#lobby-status').classList.toggle('err', !!info.error);
}
$('#lobby-ready').addEventListener('click', () => lobby && lobby.toggleReady());
$('#lobby-start').addEventListener('click', () => lobby && lobby.start().catch(e => renderLobby({ ...lobby.info(), error: net_err(e) })));
$('#lobby-leave').addEventListener('click', async () => { const l = lobby; lobby = null; forgetRoom(); if (l) await l.leave(); show('menu'); openSheet('multi'); });
function forgetRoom() { try { sessionStorage.removeItem('ms-room'); } catch (_) {} }
$('#lobby-copy').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?join=${encodeURIComponent($('#lobby-code').textContent)}${new URLSearchParams(location.search).has('emu') ? '&emu' : ''}`;
  try { await navigator.clipboard.writeText(url); $('#lobby-copy').textContent = 'Lien copié'; } catch (_) { $('#lobby-copy').textContent = url; }
  setTimeout(() => { $('#lobby-copy').textContent = 'Copier le lien'; }, 2000);
});

function startNet(session) {
  if (game) { game.destroy(); game = null; }
  show('game');
  audio.startMusic();
  game = new Game({
    session, audio, settings: S, meta: { kind: session.kind },
    onEnd: (run, res) => {
      run.kind = session.kind; run.won = res.outcome === 'win';
      const out = recordRun(profile, run);
      out.saveFailed = !store.save();
      return out;
    },
    onQuit: () => { game = null; audio.stopMusic(); const l = lobby; lobby = null; forgetRoom(); l?.leave(); show('menu'); refreshMenu(); },
    onRestart: () => lobby && lobby.rematch(),
  });
  game.saveSettings = saveSettings;
  game.onSheet = name => openInGame(name);
}

// ───────── démarrage ─────────
function refreshMenu() {
  $('#menu-last').textContent = `${MODES[pick.mode].name} · ${MAP_BY_ID[pick.map].name}`;
  const d = dailyChallenge();
  const r = profile.challenges[d.id];
  $('#menu-daily').textContent = r ? `Défi du jour : ${r.official}` : `Défi du jour · ${MAP_BY_ID[d.map].name}`;
}
applyTheme();
refreshMenu();
show('menu');
const q = new URLSearchParams(location.search);
let resume = null;
try { resume = sessionStorage.getItem('ms-room'); } catch (_) {}
if (!q.get('join') && resume && profile.name) { openSheet('multi'); $('#mp-code').value = resume; mpStatus('Reprise de la partie en cours…'); join(resume).then(() => { if (!lobby) forgetRoom(); }); }
if (q.get('join')) { openSheet('multi'); $('#mp-code').value = q.get('join').toUpperCase(); if (profile.name) setTimeout(() => join($('#mp-code').value), 50); }

// Accès de test (outils locaux) : état courant, sans effet sur le jeu.
window.__ms = { get game() { return game; }, get profile() { return profile; }, startSolo, get lobby() { return lobby; } };
