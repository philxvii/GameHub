// Page des directions artistiques : le personnage 01 mis en scene trois fois (decor,
// lumiere, cadre) sans toucher au visage, a la coiffure ni au rig valides.
//
// ?still : rendu fige et deterministe (captures de reports/da/) ; ?char=<glb> : personnage.
// Une carte de demonstration par direction (son propre rendu WebGL, pour que les animations
// CSS de la carte s'appliquent aussi a la 3D) ; les miniatures du plateau sont des images
// rendues une fois, dans six poses.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterRig } from './rig.js';
import { LOOKS, loadGlb, seedRandom, computeFrame, buildSet, makeCamera, dressedClone } from './staging.js';
import { sfx } from './da-sfx.js';

const Q = new URLSearchParams(location.search);
const CHAR = Q.get('char') || 'models/character-01-ict.glb';
const HAIR = 'models/hair/hair-curly-v41-opt.glb';
const STILL = Q.has('still');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
if (STILL) seedRandom();                                         // hasard fige pour des captures stables

// ── Une carte de demonstration ──
class Stage {
  constructor(section, base, hair, frame) {
    this.section = section; this.look = LOOKS[section.dataset.look];
    this.card = $('.card.live', section); this.canvas = $('.stage', this.card);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: STILL });
    r.setPixelRatio(STILL ? 1.5 : Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.look.exposure;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    const scene = this.scene = new THREE.Scene();
    Object.assign(this, buildSet(scene, section.dataset.look, frame, r, RoomEnvironment));
    this.camera = makeCamera(frame);
    const model = this.model = dressedClone(base, hair, frame, this.look.sweater);
    scene.add(model);
    this.rig = new CharacterRig(model);
    if (STILL) this.rig._startBlink = () => {};
    this.pointer = { x: 0, y: 0.05, active: false };
    this.flash = 0; this.hover = 0; this.simT = 0;
  }

  size(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  fit() { const r = this.canvas.getBoundingClientRect(); this.size(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))); }

  // Pose stabilisee (pour les miniatures et les captures)
  settle(expr, look) {
    this.rig.setExpression(expr);
    for (let i = 0; i < 240; i++) { this.simT += 1 / 60; this.rig.update(1 / 60, this.simT, look); }
  }

  render(dt = 0) {
    // Survol : le dossier deplace sa lampe, la casting declenche un flash, le salon monte sa lampe.
    const k = this.key, L = this.section.dataset.look;
    if (L === 'dossier') k.position.set(this.keyBase.x + this.pointer.x * 0.25 * this.hover, this.keyBase.y + this.pointer.y * 0.15 * this.hover, this.keyBase.z);
    if (L === 'salon') k.intensity = this.keyI * (1 + 0.28 * this.hover);
    this.renderer.toneMappingExposure = this.look.exposure * (1 + 0.55 * this.flash);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.renderer.render(this.scene, this.camera);
  }

  snapshots(names) {
    const poses = [['neutral', { x: 0, y: 0.05, active: true }], ['smile', { x: 0.3, y: 0.05, active: true }],
      ['suspicious', { x: 0, y: 0.05, active: true }], ['surprised', { x: 0, y: 0.1, active: true }],
      ['neutral', { x: -0.9, y: 0.05, active: true }], ['neutral', { x: 0.9, y: 0.05, active: true }]];
    const out = [];
    this.size(300, 400);
    for (const [expr, look] of poses) { this.settle(expr, look); this.render(); out.push(this.canvas.toDataURL('image/jpeg', 0.9)); }
    this.settle('neutral', { x: 0, y: 0.05, active: true });
    return out.map((src, i) => ({ src, name: names[i] }));
  }
}

// ── Miniatures du plateau ──
const MARKS = {
  dossier: () => '<p class="mark" aria-hidden="true">Écarté</p>',
  casting: () => '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M14 12 C40 38 62 60 88 90"/><path pathLength="1" d="M86 10 C60 40 38 62 12 88"/></svg>',
  salon: () => '<p class="mark" aria-hidden="true">Retiré</p>',
};
const CAPTIONS = {
  dossier: (c, i) => `N° ${String(i + 2).padStart(2, '0')} · ${c.prenom}`,
  casting: (c, i) => `${12 + i}A · ${c.prenom}`,
  salon: (c) => c.prenom,
};
function board(stage, roster) {
  const L = stage.section.dataset.look;
  const el = $('.board', stage.section);
  const people = roster.slice(1, 7);
  stage.snapshots(people.map((c) => c.prenom)).forEach(({ src }, i) => {
    const f = document.createElement('figure');
    f.className = 'mini'; f.tabIndex = 0;
    f.innerHTML = `<img alt="" src="${src}">${MARKS[L]()}<figcaption>${CAPTIONS[L](people[i], i)}</figcaption>`;
    f.setAttribute('aria-label', people[i].prenom);
    if (i === 2) f.classList.add('out');                          // un personnage deja ecarte
    const toggle = () => { f.classList.toggle('out'); play(L, 'out'); };
    f.addEventListener('click', toggle);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    el.append(f);
  });
}

const SOUNDS = { dossier: { out: 'stamp', ask: 'type', win: 'drawer' }, casting: { out: 'marker', ask: 'shutter', win: 'flash' }, salon: { out: 'thunk', ask: 'step', win: 'bell' } };
function play(look, what) { if (!STILL) sfx(SOUNDS[look][what]); }

// Contraste WCAG des paires de la palette, calcule sur les jetons de la section.
function contrast(section) {
  const cs = getComputedStyle(section);
  const lum = (hex) => {
    const v = hex.trim().replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const pal = $('.palette', section);
  const parts = pal.dataset.pairs.split(' ').map((p) => {
    const [a, b] = p.split('/');
    const la = lum(cs.getPropertyValue('--' + a)), lb = lum(cs.getPropertyValue('--' + b));
    const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    return `${a} sur ${b} ${r.toFixed(1).replace('.', ',')}:1 ${r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA grand texte' : 'insuffisant'}`;
  });
  $('.contrast', section).textContent = 'Contrastes : ' + parts.join(' · ');
}

async function main() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [base, hair, roster] = await Promise.all([
    loadGlb(loader, CHAR), loadGlb(loader, HAIR),
    fetch('data/roster.json').then((r) => r.json()).then((d) => d.personnages),
  ]);
  await document.fonts.ready;
  const frame = computeFrame(base, hair);
  const stages = $$('.dir').map((sec) => new Stage(sec, base, hair, frame));
  for (const st of stages) {
    contrast(st.section);
    board(st, roster);
    st.fit(); st.settle('neutral', { x: 0, y: 0.05, active: true }); st.render();
    wire(st);
  }
  if (STILL) { document.title = 'da-ready'; return; }
  addEventListener('resize', () => stages.forEach((st) => st.fit()));
  const timer = new THREE.Timer();
  renderLoop(stages, timer);
}

function wire(st) {
  const L = st.section.dataset.look, card = st.card;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    st.pointer = { x: THREE.MathUtils.clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1) * 0.9,
      y: THREE.MathUtils.clamp(-((e.clientY - r.top) / r.height * 2 - 0.8), -1, 1) * 0.8, active: true };
  });
  card.addEventListener('pointerenter', () => { st.hovering = true; if (L === 'casting') { st.flash = 1; card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); sfx('flash'); } });
  card.addEventListener('pointerleave', () => { st.hovering = false; st.pointer = { ...st.pointer, active: false }; });
  const eliminate = () => {
    const out = card.classList.toggle('out');
    st.rig.setExpression(out ? 'surprised' : 'neutral');
    if (out) setTimeout(() => st.rig.setExpression('neutral'), 1400);
    play(L, 'out');
  };
  card.addEventListener('click', eliminate);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); eliminate(); } });
  const actions = $('.q-actions', st.section);
  for (const b of $$('.btn', actions)) b.addEventListener('click', () => {
    st.rig.setExpression('suspicious'); play(L, 'ask');
    setTimeout(() => st.rig.setExpression('neutral'), 1600);
  });
  const win = document.createElement('button');
  win.className = 'btn'; win.textContent = { dossier: 'Affaire classée', casting: "C'est lui", salon: 'Pastille rouge' }[L];
  win.addEventListener('click', () => {
    card.classList.remove('out'); card.classList.toggle('won');
    if (L === 'dossier') { const m = $('.mark', card); m.textContent = card.classList.contains('won') ? 'Affaire classée' : 'Écarté'; card.classList.toggle('out', card.classList.contains('won')); }
    st.rig.setExpression(card.classList.contains('won') ? 'smile' : 'neutral'); play(L, 'win');
  });
  actions.append(win);
  for (const b of $$('[data-sfx]', st.section)) if (!b.closest('.q-actions')) b.addEventListener('click', () => sfx(b.dataset.sfx));
}

function renderLoop(stages, timer) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = (ts) => {
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.1), t = timer.getElapsed();
    for (const st of stages) {
      const r = st.canvas.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;             // hors ecran : rien
      st.hover += ((st.hovering ? 1 : 0) - st.hover) * Math.min(1, dt * 6);
      st.rig.update(dt, t, reduced ? { x: 0, y: 0.05, active: false } : st.pointer);
      st.render(dt);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((e) => { $('#note').textContent = 'Erreur : ' + e.message; console.error(e); });
