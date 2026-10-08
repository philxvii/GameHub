// Effets visuels : de 3D, pions, roue, pieces, toasts.
// Rien ici n'est lu par la logique de jeu. Aucun acces DOM a l'import :
// les tables pures (DIE_PIPS, DIE_FACE_ROTATION) se testent dans Node.
//
// Animations : Web Animations API (native) pour le de, la roue et les effets ;
// GSAP (CDN) seulement pour les trajets de pions, avec repli sans animation.

import { pawnPath, readableInk as wheelSafe } from './board.js';

export const DIE_MS = 850;
export const WHEEL_MS = 4300;
const PAWN_STEP_S = 0.24;     // duree d'un saut de case (+ ~30 % de pause)

export const hasGsap = () => typeof gsap !== 'undefined';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = el => !!el && typeof el.animate === 'function' && !reduced() && !document.hidden;

// ================================================================ toast
export function toast(message) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2600);
}

// ================================================================ de 3D
// Points sur une grille 3x3 (index 0..8). Faces opposees : somme 7.
export const DIE_PIPS = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };
// Rotation du cube qui amene la face V devant l'observateur.
export const DIE_FACE_ROTATION = { 1:[0,0], 6:[0,180], 3:[0,-90], 4:[0,90], 5:[-90,0], 2:[90,0] };

export function dieFacesHTML() {
  return [1,2,3,4,5,6].map(v => `<div class="die-face f${v}">${
    DIE_PIPS[v].map(p => `<i style="grid-area:${Math.floor(p / 3) + 1}/${(p % 3) + 1}"></i>`).join('')
  }</div>`).join('');
}

let dieAngle = { x:0, y:0 };

// Inclinaison fixe : on voit trois faces, comme un vrai de pose sur la table.
const TILT = 'rotateX(-20deg) rotateY(24deg)';
function cubeTransform(a) { return `${TILT} rotateX(${a.x}deg) rotateY(${a.y}deg)`; }

export function setDieValue(value) {
  const die = document.getElementById('die');
  if (!die) return;
  const v = Number(value);
  const valid = Number.isInteger(v) && v >= 1 && v <= 6;
  die.dataset.value = valid ? String(v) : '';
  die.setAttribute('aria-label', valid ? `Dé : ${v}` : 'Dé non lancé');
  const cube = die.querySelector('.die-cube');
  if (cube && valid) {
    const [x, y] = DIE_FACE_ROTATION[v];
    dieAngle = { x, y };
    cube.style.transform = cubeTransform(dieAngle);
  }
}

// La valeur affichee a la fin est TOUJOURS `value`, recue de rollDice ou de
// l'etat partage : l'animation ne fait que la mettre en scene.
export function animateDiceRoll(value) {
  const die = document.getElementById('die');
  if (!die) return Promise.resolve();
  const cube = die.querySelector('.die-cube');
  if (!cube || !canAnimate(cube)) { setDieValue(value); return Promise.resolve(); }
  die.classList.add('rolling');
  die.dataset.value = '';
  const [tx, ty] = DIE_FACE_ROTATION[value];
  const from = { ...dieAngle };
  // Plusieurs tours complets puis la bonne face : l'orientation finale ne depend que de `value`.
  const to = { x: tx + 360 * (2 + Math.floor(Math.random() * 2)), y: ty + 360 * (2 + Math.floor(Math.random() * 2)) };
  const spin = cube.animate([
    { transform: cubeTransform(from) },
    { transform: cubeTransform({ x: (from.x + to.x) * 0.55, y: (from.y + to.y) * 0.62 }), offset: 0.55 },
    { transform: cubeTransform(to) },
  ], { duration: DIE_MS, easing: 'cubic-bezier(.2,.7,.25,1)' });
  die.animate([
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(-34%) scale(1.08)', offset: 0.28 },
    { transform: 'translateY(0) scale(1)', offset: 0.68 },
    { transform: 'translateY(-8%) scale(1.02)', offset: 0.82 },
    { transform: 'translateY(0) scale(1)' },
  ], { duration: DIE_MS, easing: 'ease-out' });
  const shadow = die.parentElement && die.parentElement.querySelector('.die-shadow');
  if (shadow) shadow.animate([{ transform:'scale(1)', opacity:.55 }, { transform:'scale(.55)', opacity:.25, offset:.28 }, { transform:'scale(1)', opacity:.55 }], { duration: DIE_MS });
  return spin.finished.catch(() => {}).then(() => {
    die.classList.remove('rolling');
    setDieValue(value);
    die.animate([{ filter:'brightness(1.35)' }, { filter:'brightness(1)' }], { duration: 380 });
    const stage = die.closest('.dice-zone');
    if (stage) { stage.classList.remove('impact'); void stage.offsetWidth; stage.classList.add('impact'); }
  });
}

// ================================================================ pions
const pawnEls = new Map();   // playerId -> element
const pawnAt = new Map();    // playerId -> case affichee

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) + amount * 255)));
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
}

// Jeton de casino : flanc a creneaux blancs, liseré d'encre, disque central, initiale.
function pawnSVG(color, letter, uid) {
  const dark = shade(color, -0.3), light = shade(color, 0.16);
  return `<svg viewBox="0 0 40 34" aria-hidden="true">
    <defs><radialGradient id="pg${uid}" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${color}"/></radialGradient></defs>
    <ellipse cx="20" cy="22" rx="18" ry="9" fill="${dark}"/>
    <rect x="2" y="13" width="36" height="9" fill="${dark}"/>
    <path d="M6 17.6v4.6M12 20.2v4.6M28 20.2v4.6M34 17.6v4.6" stroke="#F7F0DE" stroke-width="2.6"/>
    <ellipse cx="20" cy="22" rx="18" ry="9" fill="none" stroke="#1B2420" stroke-width="1"/>
    <ellipse cx="20" cy="13" rx="18" ry="9" fill="${color}" stroke="#1B2420" stroke-width="1"/>
    <ellipse cx="20" cy="13" rx="15.6" ry="7.6" fill="none" stroke="#F7F0DE" stroke-width="2.4" stroke-dasharray="4.2 3.6"/>
    <ellipse cx="20" cy="13" rx="11.4" ry="5.5" fill="url(#pg${uid})" stroke="#F7F0DE" stroke-width=".8"/>
    <text x="20" y="16" text-anchor="middle" font-size="8" font-weight="800" fill="#FBF7EE" font-family="'Schibsted Grotesk',sans-serif" style="paint-order:stroke" stroke="rgba(27,36,32,.45)" stroke-width="1.3">${letter}</text>
  </svg>`;
}

// Rosace guillochee, comme sur un billet : courbes polaires dephasees, calculees une fois.
// Aucun fichier image : le motif est genere au chargement (quelques Ko de SVG).
export function guillocheSVG({ rings = 3, petals = 18, curves = 14, className = 'guilloche' } = {}) {
  const paths = [];
  for (let ring = 0; ring < rings; ring++) {
    const base = 96 - ring * 27, amp = 9 - ring * 2, n = petals - ring * 4;
    for (let k = 0; k < curves; k++) {
      const phase = (k / curves) * (Math.PI * 2 / n);
      let d = '';
      for (let i = 0; i <= 240; i++) {
        const t = (i / 240) * Math.PI * 2;
        const r = base + amp * Math.sin(n * t + phase * n) + amp * 0.35 * Math.sin(3 * n * t - phase);
        d += (i ? 'L' : 'M') + (r * Math.cos(t)).toFixed(1) + ' ' + (r * Math.sin(t)).toFixed(1);
      }
      paths.push(`<path d="${d}Z"/>`);
    }
  }
  return `<svg class="${className}" viewBox="-110 -110 220 220" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".45">${paths.join('')}</g></svg>`;
}

// Le montant defile jusqu'a sa nouvelle valeur (compteur de caisse).
export function rollNumber(el, from, to, format) {
  if (!el || from === to || reduced() || document.hidden) return;
  const start = performance.now(), dur = Math.min(900, 380 + Math.abs(to - from) * 0.9);
  const tick = now => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Cartes et options : elles penchent vers le pointeur, comme un objet qu'on tient.
export function enableTilt(root, selector) {
  if (!root || reduced() || !matchMedia('(hover:hover)').matches) return;
  root.addEventListener('pointermove', e => {
    const card = e.target.closest(selector);
    if (!card || card.disabled) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--tx', (((e.clientY - r.top) / r.height - 0.5) * -7).toFixed(2) + 'deg');
    card.style.setProperty('--ty', (((e.clientX - r.left) / r.width - 0.5) * 9).toFixed(2) + 'deg');
  });
  root.addEventListener('pointerout', e => {
    const card = e.target.closest(selector);
    if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--tx'); card.style.removeProperty('--ty'); }
  });
}

function geometry() {
  const grid = document.getElementById('board-grid');
  const layer = document.getElementById('pawn-layer');
  const first = grid && grid.querySelector('.square');
  if (!grid || !layer || !first || !first.offsetWidth) return null;
  return { grid, layer, cell: first.offsetWidth };
}

// Point de pose : 87 % de la hauteur, dans la zone basse reservee au pion,
// sous le nom de la ville et sous les batiments (qui restent visibles).
function ground(index) {
  const node = document.querySelector(`.square[data-index="${index}"]`);
  if (!node || !node.offsetWidth) return null;
  return { x: node.offsetLeft + node.offsetWidth / 2, y: node.offsetTop + node.offsetHeight * 0.87 };
}

function fanOffset(game, player, index, w) {
  const occupants = game.players.filter(p => p.position === index && !p.bankrupt);
  const i = occupants.findIndex(p => p.id === player.id);
  if (occupants.length <= 1 || i < 0) return { dx:0, dy:0 };
  const perRow = Math.min(occupants.length, 3);
  const row = Math.floor(i / perRow), col = i % perRow;
  const inRow = Math.min(perRow, occupants.length - row * perRow);
  const gap = w * 0.56;
  return { dx: (col - (inRow - 1) / 2) * gap, dy: -row * w * 0.42 };
}

function target(game, player, index, centered) {
  const g = ground(index);
  const el = pawnEls.get(player.id);
  if (!g || !el) return null;
  const w = el.offsetWidth || 20, h = el.offsetHeight || 17;
  const o = centered ? { dx:0, dy:0 } : fanOffset(game, player, index, w);
  return { x: g.x + o.dx - w / 2, y: g.y + o.dy - h * 0.62 };
}

function place(game, player, index) {
  const el = pawnEls.get(player.id);
  const t = target(game, player, index, false);
  if (!el || !t) return;
  if (hasGsap()) { gsap.killTweensOf(el); gsap.set(el, { x:t.x, y:t.y }); }
  else { el.getAnimations().forEach(a => a.cancel()); el.style.transform = `translate(${t.x}px,${t.y}px)`; }
}

function squareNode(index) { return document.querySelector(`.square[data-index="${index}"]`); }

function flash(index, cls, ms) {
  const node = squareNode(index);
  if (!node) return;
  node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

// Pions en route : un rendu intermediaire (ligne d'historique ecrite juste apres le
// deplacement) ne doit JAMAIS les reposer de force. C'etait le bug du « teleport ».
const moving = new Map();     // playerId -> { to, tl }
let latestGame = null;

// Rythme : un saut par case + une courte pause, pour qu'on compte les cases.
function stepTiming(n) {
  const hop = Math.max(0.12, Math.min(PAWN_STEP_S, 2.6 / n));
  return { hop, pause: hop * 0.32 };
}

function counter(el, value) {
  const badge = el.querySelector('.pawn-count');
  if (!badge) return;
  badge.textContent = value ? String(value) : '';
  badge.classList.toggle('on', !!value);
}

function settle(player, to) {
  moving.delete(player.id);
  const el = pawnEls.get(player.id);
  if (el) counter(el, 0);
  flash(to, 'landed', 900);
  // Position finale avec le decalage propre si d'autres pions partagent la case.
  if (latestGame) place(latestGame, player, to);
}

function move(game, player, from, to, delay) {
  const el = pawnEls.get(player.id);
  const path = pawnPath(from, to);
  if (!el || !path.length || document.hidden) { place(game, player, to); return; }
  const calm = reduced();
  const { hop, pause } = stepTiming(path.length);
  const lift = calm ? 0 : Math.max(10, el.offsetHeight * 1.1);
  const current = moving.get(player.id);

  if (hasGsap()) {
    const body = el.querySelector('.pawn-body');
    const shadowEl = el.querySelector('.pawn-shadow');
    // Deplacement deja en cours (carte Chance apres l'atterrissage) : on enchaine.
    const tl = current && current.tl ? current.tl : gsap.timeline({ delay: delay || 0 });
    if (!current) gsap.killTweensOf([el, body, shadowEl]);
    path.forEach((index, i) => {
      const t = target(game, player, index, i < path.length - 1);
      if (!t) return;
      tl.add(() => counter(el, i + 1))
        .to(el, { x:t.x, y:t.y, duration:hop, ease:'power2.inOut' })
        .to(body, { y:-lift, duration:hop * 0.5, ease:'power2.out' }, '<')
        .to(body, { y:0, duration:hop * 0.5, ease:'power2.in' }, '>')
        .to(shadowEl, { scale:.55, opacity:.22, duration:hop * 0.5, ease:'power2.out' }, '<-' + (hop * 0.5))
        .to(shadowEl, { scale:1, opacity:.6, duration:hop * 0.5, ease:'power2.in' }, '>')
        .add(() => flash(index, 'stepped', 420))
        .to({}, { duration: i < path.length - 1 ? pause : 0 });
    });
    if (!calm) {
      tl.to(body, { scaleY:.74, scaleX:1.16, duration:.09, ease:'power2.out', transformOrigin:'50% 100%' })
        .to(body, { scaleY:1, scaleX:1, duration:.55, ease:'elastic.out(1,.38)' });
    }
    tl.eventCallback('onComplete', () => settle(player, to));
    moving.set(player.id, { to, tl });
    // Garde-fou : sans rendu (onglet masque), la timeline ne progresse plus. On la termine.
    setTimeout(() => { const run = moving.get(player.id); if (run && run.tl === tl) tl.progress(1); }, (tl.duration() + 2) * 1000);
    return;
  }

  // Repli sans GSAP : meme trajet case par case avec la Web Animations API.
  const start = target(game, player, from, true) || target(game, player, to, false);
  const unit = hop + pause;
  const total = unit * path.length;
  const frames = [{ transform:`translate(${start.x}px,${start.y}px)`, offset:0 }];
  path.forEach((index, i) => {
    const t = target(game, player, index, i < path.length - 1);
    const prev = i === 0 ? start : target(game, player, path[i - 1], true);
    const t0 = (i * unit) / total;
    frames.push({ transform:`translate(${(prev.x + t.x) / 2}px,${(prev.y + t.y) / 2 - lift}px)`, offset: t0 + (hop * 0.5) / total });
    frames.push({ transform:`translate(${t.x}px,${t.y}px)`, offset: Math.min(1, t0 + hop / total) });
    if (i < path.length - 1) frames.push({ transform:`translate(${t.x}px,${t.y}px)`, offset: Math.min(1, (i + 1) * unit / total) });
  });
  frames[frames.length - 1].offset = 1;
  el.getAnimations().forEach(a => a.cancel());
  const end = target(game, player, to, false);
  el.style.transform = `translate(${end.x}px,${end.y}px)`;
  const anim = el.animate(frames, { duration: total * 1000, delay: (delay || 0) * 1000, easing:'linear', fill:'backwards' });
  path.forEach((index, i) => setTimeout(() => { counter(el, i + 1); flash(index, 'stepped', 420); }, ((delay || 0) + i * unit + hop) * 1000));
  moving.set(player.id, { to, tl:null, anim });
  anim.finished.catch(() => {}).then(() => settle(player, to));
}

export function syncPawns(game, { animate = false, delay = 0 } = {}) {
  const geo = geometry();
  if (!geo || !game || !game.players) return;
  latestGame = game;
  geo.layer.style.setProperty('--pawn-w', Math.round(geo.cell * 0.4) + 'px');
  const alive = new Set(game.players.filter(p => !p.bankrupt).map(p => p.id));
  pawnEls.forEach((el, id) => { if (!alive.has(id)) { if (hasGsap()) gsap.killTweensOf(el); el.remove(); pawnEls.delete(id); pawnAt.delete(id); moving.delete(id); } });
  game.players.forEach((player, idx) => {
    if (player.bankrupt) return;
    let el = pawnEls.get(player.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pawn';
      el.dataset.player = player.id;
      el.title = player.name;
      const letter = String(player.name || '?').trim().charAt(0).toUpperCase().replace(/[<&>"]/g, '');
      el.innerHTML = `<span class="pawn-ring"></span><span class="pawn-shadow"></span><span class="pawn-body">${pawnSVG(player.color || '#888888', letter, player.id)}</span><span class="pawn-count"></span>`;
      geo.layer.appendChild(el);
      pawnEls.set(player.id, el);
    }
    el.style.setProperty('--pawn', player.color || '#888');
    el.classList.toggle('pawn-active', game.phase === 'playing' && game.turnIndex === idx);
    el.classList.toggle('pawn-jailed', !!player.inJail);
    const from = pawnAt.get(player.id);
    pawnAt.set(player.id, player.position);
    const run = moving.get(player.id);
    if (run && run.to === player.position) return;            // en route : on laisse finir
    if (from === undefined || !animate || from === player.position) { if (!run) place(game, player, player.position); return; }
    move(game, player, run ? run.to : from, player.position, run ? 0 : delay);
  });
}

export function isPawnMoving(playerId) { return moving.has(playerId); }

// Redimensionnement : les trajets en cours visent d'anciennes coordonnees. On les termine.
export function finishMoves() {
  moving.forEach(run => { if (run.tl) run.tl.progress(1); else if (run.anim) run.anim.finish(); });
}

export function resetPawns() {
  pawnEls.forEach(el => { if (hasGsap()) gsap.killTweensOf(el); el.remove(); });
  pawnEls.clear(); pawnAt.clear(); moving.clear();
}

export function pawnCount() { return pawnEls.size; }

// ================================================================ effets d'argent
export function floatDelta(anchor, amount) {
  if (!anchor || !amount) return;
  const el = document.createElement('span');
  el.className = 'money-delta ' + (amount > 0 ? 'up' : 'down');
  el.textContent = (amount > 0 ? '+' : '−') + Math.abs(amount) + ' $';
  anchor.appendChild(el);
  if (!canAnimate(el)) { setTimeout(() => el.remove(), 1400); return; }
  el.animate([
    { transform:'translateY(6px) scale(.8)', opacity:0 },
    { transform:'translateY(-18px) scale(1.08)', opacity:1, offset:.25 },
    { transform:'translateY(-24px) scale(1)', opacity:1, offset:.7 },
    { transform:'translateY(-40px) scale(.96)', opacity:0 },
  ], { duration: 1500, easing:'cubic-bezier(.2,.8,.3,1)' }).finished.catch(() => {}).then(() => el.remove());
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Quelques pieces qui volent d'un point a l'autre : un loyer se VOIT passer.
export function coinBurst(fromEl, toEl, count = 6) {
  if (!fromEl || !toEl || reduced() || document.hidden) return;
  const a = centerOf(fromEl), b = centerOf(toEl);
  if (!a.x && !a.y) return;
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('i');
    coin.className = 'fly-coin';
    document.body.appendChild(coin);
    const lift = 50 + Math.random() * 40;
    const mid = { x:(a.x + b.x) / 2 + (Math.random() - .5) * 60, y: Math.min(a.y, b.y) - lift };
    coin.animate([
      { transform:`translate(${a.x}px,${a.y}px) scale(.6)`, opacity:0 },
      { transform:`translate(${a.x}px,${a.y}px) scale(1)`, opacity:1, offset:.08 },
      { transform:`translate(${mid.x}px,${mid.y}px) scale(1.1)`, opacity:1, offset:.5 },
      { transform:`translate(${b.x}px,${b.y}px) scale(.7)`, opacity:.2 },
    ], { duration: 820, delay: i * 55, easing:'cubic-bezier(.3,.6,.4,1)', fill:'both' })
      .finished.catch(() => {}).then(() => coin.remove());
  }
}

export function pulse(el, cls, ms = 900) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// Construction : le batiment apparait, rebondit, et la case s'illumine.
export function buildPop(squareEl, level) {
  if (!squareEl) return;
  pulse(squareEl, 'just-built', 1100);
  const house = squareEl.querySelectorAll('.bld')[level - 1];
  if (house && canAnimate(house)) {
    house.animate([
      { transform:'translateY(-120%) scale(.4)', opacity:0 },
      { transform:'translateY(8%) scale(1.25)', opacity:1, offset:.55 },
      { transform:'translateY(-6%) scale(.92)', offset:.78 },
      { transform:'translateY(0) scale(1)', opacity:1 },
    ], { duration: 650, easing:'cubic-bezier(.2,.8,.3,1.2)' });
  }
}

// ================================================================ roue
function arcPoint(angle, r) {
  const a = angle * Math.PI / 180;
  return [Math.sin(a) * r, -Math.cos(a) * r];
}

// Texte le long du rayon (du bord vers le centre) : la place utile est la
// longueur du rayon, pas la largeur d'arc. La police retrecit pour les mots longs.
const fit = (label, max, room) => Math.min(max, room / (label.length * 0.78)).toFixed(2);

export function wheelSVG(geometryList) {
  const segs = geometryList.map(s => {
    const [x1, y1] = arcPoint(s.start, 100), [x2, y2] = arcPoint(s.end, 100);
    const large = s.end - s.start > 180 ? 1 : 0;
    const mid = (s.start + s.end) / 2;
    const ink = wheelSafe(s.color);
    return `<g class="wseg" data-id="${s.id}">
      <path d="M0 0L${x1.toFixed(2)} ${y1.toFixed(2)}A100 100 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${s.color}"/>
      <g transform="rotate(${mid.toFixed(2)}) rotate(-90)"><text x="93" y="${s.end - s.start > 30 ? -1.5 : 2.6}" text-anchor="end" fill="${ink}" class="wl" style="font-size:${fit(s.label, 9, 64)}px">${s.label}</text>
      ${s.end - s.start > 30 ? `<text x="93" y="7" text-anchor="end" fill="${ink}" class="ws">${s.sub}</text>` : ''}</g></g>`;
  }).join('');
  const studs = Array.from({ length: 24 }, (_, i) => { const [x, y] = arcPoint(i * 15, 104); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2"/>`; }).join('');
  return `<svg class="wheel-svg" viewBox="-114 -122 228 236" role="img" aria-label="Roue de la chance">
    <circle r="110" class="wheel-rim"/><g class="wheel-studs">${studs}</g>
    <g class="wheel-rot">${segs}<circle r="100" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/></g>
    <circle r="17" class="wheel-hub"/><circle r="7" class="wheel-hub-cap"/>
    <path class="wheel-pointer" d="M0 -92L-11 -118H11Z"/>
  </svg>`;
}

// Petit decalage dans le segment, derive de l'id : identique sur tous les clients.
function jitter(seed, width) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * Math.max(0, width - 8);
}

export function wheelAngle(seg, seed) {
  return 360 * 6 - (seg.start + seg.end) / 2 + jitter(seed, seg.end - seg.start);
}

export function spinWheel(svg, seg, seed, { instant = false } = {}) {
  const rot = svg && svg.querySelector('.wheel-rot');
  if (!rot) return Promise.resolve();
  const angle = wheelAngle(seg, seed);
  const final = `rotate(${angle}deg)`;
  if (instant || !canAnimate(rot)) { rot.style.transform = final; return Promise.resolve(); }
  // Prise d'elan (petit recul), acceleration, longue deceleration, arret net.
  const anim = rot.animate([
    { transform:'rotate(0deg)', easing:'cubic-bezier(.4,0,.6,1)' },
    { transform:'rotate(-16deg)', offset:.07, easing:'cubic-bezier(.55,0,.85,.4)' },
    { transform:`rotate(${(angle * 0.3).toFixed(1)}deg)`, offset:.3, easing:'cubic-bezier(.12,.48,.18,1)' },
    { transform: final },
  ], { duration: WHEEL_MS, fill:'forwards' });
  svg.classList.add('spinning');
  return anim.finished.catch(() => {}).then(() => {
    rot.style.transform = final;
    svg.classList.remove('spinning');
    svg.classList.add('landed');
  });
}

// ================================================================ victoire
export function rainCoins(stage, count = 22) {
  if (!stage || reduced()) return;
  stage.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('i');
    coin.style.left = Math.random() * 100 + '%';
    stage.appendChild(coin);
    coin.animate([
      { transform:`translateY(-30px) rotate(${Math.random() * 180}deg)`, opacity:0 },
      { opacity:1, offset:.1 },
      { transform:`translateY(110vh) rotate(${360 + Math.random() * 360}deg)`, opacity:1 },
    ], { duration: 1700 + Math.random() * 1300, delay: Math.random() * 900, easing:'linear' })
      .finished.catch(() => {}).then(() => coin.remove());
  }
}

