// Plateau de 24 portraits vivants (prototype de l'architecture du jeu, hors production).
//
// Un seul WebGLRenderer, un seul canevas pose sur le plateau (il defile avec la page : rien a
// redessiner au defilement). Une seule scene : un mur, des lumieres, une carte d'ombre ; les
// 24 personnages y sont tous, invisibles, et seul celui que l'on peint est montre. Le canevas
// garde ses pixels (preserveDrawingBuffer) : on ne repeint que les cartes qui changent.
//   - carte survolee ou au clavier : animee a chaque image (regard, tete, expression) ;
//   - carte au repos : repeinte environ une fois par seconde (respiration), a plein regime
//     le temps d'un clignement ; les cartes sont decalees les unes des autres ;
//   - carte decrochee : sa derniere image devient une <img> que le CSS anime.
//
// ?char=<glb> personnage (defaut : character-01-ict.glb, l'optimise attend G1) ;
// ?look=salon|dossier|casting mise en scene ; ?still rendu fige (captures) ; ?seed hasard fige (tests) ;
// ?idle=<s> periode de rafraichissement des cartes au repos (defaut 1,1 s).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterRig } from './rig.js';
import { LOOKS, loadGlb, seedRandom, computeFrame, buildSet, makeCamera, dressedClone } from './staging.js';

const Q = new URLSearchParams(location.search);
const CHAR = Q.get('char') || 'models/character-01-ict.glb';
const HAIR = 'models/hair/hair-curly-v41-opt.glb';
const LOOK = LOOKS[Q.get('look')] ? Q.get('look') : 'salon';
const STILL = Q.has('still');
const IDLE_S = +(Q.get('idle') || 1.1);               // rafraichissement d'une carte au repos (s)
const DPR_MAX = 2;
const $ = (s, el = document) => el.querySelector(s);
if (STILL || Q.has('seed')) seedRandom();                       // ?seed : hasard fige, boucle active (tests)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Questions du jeu : libelle et predicat sur les attributs de data/roster.json.
const QUESTIONS = [
  ['Est-ce une femme ?', (a) => a.genre === 'femme'],
  ['Est-ce un homme ?', (a) => a.genre === 'homme'],
  ['Le modèle est-il jeune ?', (a) => a.age === 'jeune'],
  ["Le modèle est-il d'âge mûr ?", (a) => a.age === 'adulte'],
  ['Le modèle est-il âgé ?', (a) => a.age === 'senior'],
  ['A-t-il les cheveux noirs ?', (a) => a.cheveux === 'noir'],
  ['A-t-il les cheveux bruns ?', (a) => a.cheveux === 'brun'],
  ['A-t-il les cheveux blonds ?', (a) => a.cheveux === 'blond'],
  ['A-t-il les cheveux roux ?', (a) => a.cheveux === 'roux'],
  ['A-t-il les cheveux gris ?', (a) => a.cheveux === 'gris'],
  ['Est-il chauve ?', (a) => a.coupe === 'chauve'],
  ['A-t-il les cheveux courts ?', (a) => a.coupe === 'court'],
  ['A-t-il les cheveux mi-longs ?', (a) => a.coupe === 'mi-long'],
  ['A-t-il les cheveux longs ?', (a) => a.coupe === 'long'],
  ['A-t-il les cheveux bouclés ?', (a) => a.cheveux_boucles],
  ['A-t-il les yeux marron ?', (a) => a.yeux === 'marron'],
  ['A-t-il les yeux bleus ?', (a) => a.yeux === 'bleu'],
  ['A-t-il les yeux verts ?', (a) => a.yeux === 'vert'],
  ['Porte-t-il des lunettes ?', (a) => a.lunettes],
  ['Porte-t-il un chapeau ?', (a) => a.chapeau],
  ['A-t-il une barbe ?', (a) => a.barbe],
  ['A-t-il une moustache ?', (a) => a.moustache],
  ["Porte-t-il des boucles d'oreilles ?", (a) => a.boucles_oreilles],
];

const board = $('#board'), canvas = $('#gl'), wrap = $('.board-wrap');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false; renderer.setScissorTest(true);
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const cards = [];
let set, camera, frame, secret = null, busy = false;
const stats = { t0: performance.now(), loadMs: 0, glbBytes: 0, parseMs: 0, renders: 0 };

function slotRect(c) {                                // position du portrait dans le canevas (px CSS)
  const w = wrap.getBoundingClientRect(), r = c.slot.getBoundingClientRect();
  return { x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height };
}

function resize() {
  const w = wrap.getBoundingClientRect();
  const dpr = STILL ? 1 : Math.min(devicePixelRatio, DPR_MAX);
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.round(w.width), Math.round(w.height), true);
  renderer.setScissor(0, 0, w.width, w.height); renderer.setClearColor(0x000000, 0); renderer.clear();
  for (const c of cards) { c.rect = slotRect(c); paint(c); }           // tout repeindre tout de suite
}

// Peint une carte dans sa fenetre : seul son personnage est visible dans la scene partagee.
function paint(c) {
  const H = canvas.clientHeight, r = c.rect;
  renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setClearColor(0x000000, 0); renderer.clear();
  if (c.out) return;
  camera.aspect = r.w / r.h; camera.updateProjectionMatrix();
  for (const o of cards) o.model.visible = o === c;
  set.key.intensity = set.keyI * (1 + 0.25 * c.hover);           // la lampe du tableau survole monte un peu
  renderer.render(scene, camera);
  stats.renders++;
}

// Derniere image d'une carte (pour le decrochage anime en CSS).
function snapshot(c) {
  const dpr = renderer.getPixelRatio(), r = c.rect;
  const cv = document.createElement('canvas'); cv.width = Math.round(r.w * dpr); cv.height = Math.round(r.h * dpr);
  paint(c);
  cv.getContext('2d').drawImage(canvas, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr, 0, 0, cv.width, cv.height);
  const img = new Image(); img.alt = ''; img.src = cv.toDataURL('image/jpeg', 0.92);
  return img;
}

function setOut(c, out) {
  if (c.out === out) return;
  if (out) {
    c.slot.replaceChildren(snapshot(c));
    c.out = true; paint(c);                                       // la fenetre du canevas se vide
  } else {
    c.out = false; c.slot.replaceChildren(); c.dirty = true;
  }
  c.el.classList.toggle('out', out);
  c.el.setAttribute('aria-pressed', String(out));
  c.el.setAttribute('aria-label', `${c.person.prenom}${out ? ', décroché' : ''}`);
  $('#left').textContent = String(cards.filter((k) => !k.out).length);
}

function express(c, expr, holdS = 0, after = 'neutral') {
  c.rig.setExpression(expr);
  c.activeUntil = now() + 1.4;                                    // le visage s'anime : plein regime
  clearTimeout(c.exprTimer);
  if (holdS) c.exprTimer = setTimeout(() => { c.rig.setExpression(after); c.activeUntil = now() + 1.4; }, holdS * 1000);
}

const clock = new THREE.Timer();
const now = () => clock.getElapsed();

function build(base, hair, roster) {
  frame = computeFrame(base, hair);
  set = buildSet(scene, LOOK, frame, renderer, RoomEnvironment);
  for (const l of set.lights) if (l.castShadow) l.shadow.mapSize.set(1024, 1024);   // une carte d'ombre partagee par 24 portraits
  renderer.toneMappingExposure = set.look.exposure;
  camera = makeCamera(frame);
  roster.forEach((person, i) => {
    const el = document.createElement('article');
    el.className = 'card'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', person.prenom);
    el.innerHTML = `<div class="frame"><div class="portrait"></div></div>
      <div class="cartel"><p class="name">${person.prenom}</p><p class="num">Salle 1 · n° ${String(i + 1).padStart(2, '0')}</p><span class="dot" aria-hidden="true"></span></div>
      <p class="gone" aria-hidden="true">Retiré de l'accrochage</p>`;
    board.append(el);
    const model = dressedClone(base, hair, frame, set.look.sweater);
    model.visible = false; scene.add(model);
    const rig = new CharacterRig(model);
    if (STILL || reduced) rig._startBlink = () => {};
    const c = { i, person, el, slot: $('.portrait', el), model, rig, out: false, dirty: true, hover: 0, hovering: false,
      pointer: { x: 0, y: 0.05, active: false }, last: 0, next: Math.random() * IDLE_S, activeUntil: 0 };
    // Chaque portrait a sa propre pose de repos : un leger regard de cote, decale.
    c.rest = { x: (Math.random() - 0.5) * 0.5, y: 0.05 + (Math.random() - 0.5) * 0.2, active: true };
    for (let k = 0; k < 120; k++) rig.update(1 / 60, k / 60 + i * 0.37, c.rest);
    cards.push(c);
    wire(c);
  });
}

function wire(c) {
  const el = c.el;
  const point = (x, y) => {
    const r = c.slot.getBoundingClientRect();
    c.pointer = { x: THREE.MathUtils.clamp((x - r.left) / r.width * 2 - 1, -1, 1) * 0.9,
      y: THREE.MathUtils.clamp(-((y - r.top) / r.height * 2 - 0.75), -1, 1) * 0.8, active: !reduced };
  };
  el.addEventListener('pointermove', (e) => point(e.clientX, e.clientY));
  el.addEventListener('pointerenter', () => { c.hovering = true; });
  el.addEventListener('pointerleave', () => { c.hovering = false; c.pointer = { ...c.pointer, active: false }; });
  el.addEventListener('focus', () => { c.hovering = true; c.pointer = { x: 0, y: 0.05, active: !reduced }; });
  el.addEventListener('blur', () => { c.hovering = false; c.pointer = { ...c.pointer, active: false }; });
  el.addEventListener('click', () => { if (!busy) setOut(c, !c.out); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) setOut(c, !c.out); return; }
    const cols = getComputedStyle(board).gridTemplateColumns.split(' ').length;
    const to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (to !== undefined) { e.preventDefault(); cards[THREE.MathUtils.clamp(c.i + to, 0, cards.length - 1)].el.focus(); }
  });
}

// ── Partie de demonstration : une question, la reponse du personnage secret ──
function setupGame() {
  const sel = $('#question');
  sel.innerHTML = QUESTIONS.map(([q], i) => `<option value="${i}">${q}</option>`).join('');
  secret = cards[Math.floor(Math.random() * cards.length)];
  $('#ask').addEventListener('click', () => ask(+sel.value));
  $('#reset').addEventListener('click', () => {
    for (const c of cards) { setOut(c, false); c.el.classList.remove('won'); express(c, 'neutral'); }
    secret = cards[Math.floor(Math.random() * cards.length)];
    $('#answer').textContent = ''; $('#ask').disabled = false;
  });
}

function ask(qi) {
  if (busy) return;
  busy = true;
  const [label, test] = QUESTIONS[qi];
  const yes = !!test(secret.person.attributs);
  const live = cards.filter((c) => !c.out);
  live.forEach((c) => express(c, 'suspicious'));                  // question posee : mefiance
  $('#answer').textContent = '…';
  setTimeout(() => {
    $('#answer').textContent = `${label.replace(/ \?$/, '')} : ${yes ? 'oui' : 'non'}.`;
    const drop = live.filter((c) => !!test(c.person.attributs) !== yes);
    drop.forEach((c, k) => setTimeout(() => setOut(c, true), 90 * k));
    setTimeout(() => {
      const left = cards.filter((c) => !c.out);
      left.forEach((c) => express(c, 'smile', 1.8));              // bonne reponse : sourire
      if (left.length === 1) {                                     // fin : surprise puis pastille rouge
        const w = left[0];
        express(w, 'surprised', 1.6, 'smile');
        w.el.classList.add('won');
        $('#answer').textContent = `C'est ${w.person.prenom}.`;
        $('#ask').disabled = true;
      }
      busy = false;
    }, 90 * drop.length + 450);
  }, 1100);
}

// ── Boucle : ne repeint que ce qui change ──
function frameTick() {
  clock.update(performance.now());
  const t = now();
  let painted = 0;
  for (const c of cards) {
    if (c.out) continue;
    c.hover += ((c.hovering ? 1 : 0) - c.hover) * 0.2;
    const blinking = c.rig.blink.t0 >= 0;
    const live = c.hovering || c.hover > 0.01 || blinking || t < c.activeUntil;
    const idle = !reduced && t >= c.next;
    if (!(live || idle || c.dirty)) continue;
    const dt = Math.min(t - c.last, 0.25) || 1 / 60;
    c.rig.update(dt, t, c.hovering ? c.pointer : c.rest);
    c.last = t; c.dirty = false;
    if (idle) c.next = t + IDLE_S * (0.8 + Math.random() * 0.4);
    paint(c); painted++;
  }
  stats.lastPainted = painted;
  requestAnimationFrame(frameTick);
}

// ── Mesures (tools/test-board.js) ──
function measures() {
  const tris = (root) => {                                         // maillages vraiment dessines (coques masquees exclues)
    let n = 0;
    root.traverse((m) => {
      if (!m.isMesh) return;
      for (let p = m; p && p !== root; p = p.parent) if (!p.visible) return;
      n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    });
    return n;
  };
  window.__board = {
    cards, secret: () => secret.person.prenom, ask, setOut: (i, v) => setOut(cards[i], v),
    info: () => ({ cards: cards.length, loadMs: Math.round(stats.loadMs), glbBytes: stats.glbBytes, parseMs: Math.round(stats.parseMs),
      trianglesPerCard: Math.round(tris(cards[0].model)), memory: { ...renderer.info.memory }, programs: renderer.info.programs.length,
      canvas: [canvas.width, canvas.height], dpr: renderer.getPixelRatio(), renders: stats.renders }),
    // Cout de repeindre n cartes (synchronise par readPixels) ; 24 = premier affichage.
    paintMs(n = 24, reps = 3) {
      const gl = renderer.getContext(), px = new Uint8Array(4), list = cards.filter((c) => !c.out).slice(0, n);
      list.forEach(paint); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let k = 0; k < reps; k++) { list.forEach(paint); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return (performance.now() - t0) / reps;
    },
    pose: (i) => { const s = cards[i].rig.state; return { eye: s.eye.yaw, head: s.head.yaw }; },
    lastPainted: () => stats.lastPainted,
  };
}

async function main() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [base, hair, roster] = await Promise.all([
    loadGlb(loader, CHAR), loadGlb(loader, HAIR),
    fetch('data/roster.json').then((r) => r.json()).then((d) => d.personnages),
  ]);
  stats.glbBytes = base.bytes + hair.bytes; stats.parseMs = base.parseMs + hair.parseMs;
  await document.fonts.ready;
  build(base, hair, roster);
  setupGame();
  resize();
  new ResizeObserver(() => resize()).observe(wrap);
  stats.loadMs = performance.now() - stats.t0;
  measures();
  document.title = 'Qui est-ce ? — plateau 3D';
  document.documentElement.dataset.ready = '1';
  if (!STILL) requestAnimationFrame(frameTick);
}

main().catch((e) => { $('#note').textContent = 'Erreur : ' + e.message; console.error(e); });
