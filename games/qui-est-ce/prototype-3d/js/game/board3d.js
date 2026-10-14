// Plateau 3D : 24 Polaroids vivants peints par UN SEUL WebGLRenderer.
//
// Un canevas pose sur le plateau (il defile avec la page : rien a repeindre au defilement),
// une seule scene (un mur, des lumieres, une carte d'ombre) ou les 24 personnages sont presents
// et invisibles : seul celui que l'on peint est montre. Le canevas garde ses pixels : on ne
// repeint que les cartes qui changent (survol a chaque image, repos ~1 fois par seconde, plein
// regime pendant un clignement ou un changement d'expression). Carte rayee : sa derniere image
// devient une <img> (plus de 3D pour elle).
//
// SUBSTITUTS (TEMPORAIRE, tant que seul character-01 existe) : chaque personnage du roster est
// le personnage 01 habille selon ses attributs (lunettes, casquette, boucles d'oreilles, barbe,
// moustache, crane rase, teinte des cheveux), rase de pres s'il n'a ni barbe ni moustache.
// Les attributs invisibles sur un substitut (genre, age, yeux) sont lisibles sur la fiche au
// survol. Quand un personnage existe vraiment, son GLB remplace le substitut (roster.json).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterRig } from '../rig.js';
import { loadGlb, computeFrame, buildSet, makeCamera, dressedClone } from '../staging.js';

const M = 'models/';
const FILES = {
  base: M + 'character-01-ict-opt.glb', shaved: M + 'character-01-ict-opt-shaved.glb',
  hair: M + 'hair/hair-curly-v41-opt.glb', capHair: M + 'accessories/cap-hair-curly-v41.glb',
  cap: M + 'accessories/cap.glb', acetate: M + 'accessories/glasses-acetate.glb', metal: M + 'accessories/glasses-metal.glb',
  hoops: M + 'accessories/earrings-hoops.glb', pearls: M + 'accessories/earrings-pearls.glb',
  beard: M + 'accessories/beard.glb', moustache: M + 'accessories/moustache.glb', full: M + 'accessories/full.glb',
};
// Teinte de la coiffure V4.1 (brune) par couleur du roster : facteur lineaire du materiau.
const HAIR_TINT = { noir: [0.42, 0.42, 0.45], brun: [1, 1, 1], blond: [2.5, 2.05, 1.4], roux: [2.0, 0.92, 0.5], gris: [2.0, 2.05, 2.2] };

export function costume(person, i) {
  const a = person.attributs, real = person.statut === 'modelise';
  const facial = a.barbe && a.moustache ? 'full' : a.barbe ? 'beard' : a.moustache ? 'moustache' : null;
  return {
    base: real || facial === 'full' ? 'base' : 'shaved',                 // barbe peinte gardee seulement avec barbe + moustache
    facial: real ? null : facial,                                          // le vrai personnage 01 reste tel que valide
    hair: a.coupe === 'chauve' ? null : a.chapeau ? 'capHair' : 'hair',
    tint: real ? null : HAIR_TINT[a.cheveux] || null,
    acc: [a.lunettes && (i % 2 ? 'metal' : 'acetate'), a.chapeau && 'cap', a.boucles_oreilles && (i % 2 ? 'pearls' : 'hoops'), !real && facial].filter(Boolean),
  };
}

export async function createBoard3D({ wrap, canvas, slots, people, look = 'casting', still = false, idle = 1.1, reduced = false, char = null }) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const need = new Set(['base', 'hair']);
  const looks = people.map((p, i) => costume(p, i));
  for (const c of looks) { need.add(c.base); if (c.hair) need.add(c.hair); c.acc.forEach((k) => need.add(k)); }
  const files = { ...FILES, ...(char ? { base: char } : {}) };
  const loaded = {}; let bytes = 0, parseMs = 0;
  await Promise.all([...need].map(async (k) => { loaded[k] = await loadGlb(loader, files[k]); bytes += loaded[k].bytes; parseMs += loaded[k].parseMs; }));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false; renderer.setScissorTest(true); renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const frame = computeFrame(loaded.base, loaded.hair);
  const set = buildSet(scene, look, frame, renderer, RoomEnvironment);
  for (const l of set.lights) if (l.castShadow) l.shadow.mapSize.set(1024, 1024);       // une carte d'ombre pour 24 portraits
  renderer.toneMappingExposure = set.look.exposure;
  const camera = makeCamera(frame);
  const tints = new Map();
  const tinted = (mat, rgb) => {
    const key = mat.uuid + rgb.join();
    if (!tints.has(key)) { const m = mat.clone(); m.color.setRGB(...rgb); tints.set(key, m); }
    return tints.get(key);
  };

  const cards = people.map((person, i) => {
    const c = looks[i];
    const model = dressedClone(loaded[c.base], c.hair ? loaded[c.hair] : { scene: new THREE.Group() }, frame, set.look.sweater);
    if (c.tint) model.traverse((o) => { if (o.isMesh && o.material.name === 'hair-cards') o.material = tinted(o.material, c.tint); });
    for (const k of c.acc) {
      const acc = SkeletonUtils.clone(loaded[k].scene);
      model.add(acc); model.updateMatrixWorld(true); model.getObjectByName('Head').attach(acc);
      acc.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    }
    model.visible = false; scene.add(model);
    const rig = new CharacterRig(model);                                         // apres les accessoires (barbe a expressions)
    if (still || reduced) rig._startBlink = () => {};
    const rest = { x: (Math.random() - 0.5) * 0.5, y: 0.05 + (Math.random() - 0.5) * 0.2, active: true };
    for (let k = 0; k < 120; k++) rig.update(1 / 60, k / 60 + i * 0.37, rest);
    return { i, person, slot: slots[i], model, rig, rest, out: false, hover: 0, hovering: false, pointer: { ...rest, active: false },
      last: 0, next: Math.random() * idle, activeUntil: 0, exprTimer: 0 };
  });

  const clock = new THREE.Timer();
  const now = () => clock.getElapsed();
  const stats = { renders: 0, painted: 0 };
  let W = 0, H = 0, paused = false;
  const IDLE_PER_FRAME = 2;                           // repeintes de repos par image : temps d'image regulier

  function rect(c) {
    const w = wrap.getBoundingClientRect(), r = c.slot.getBoundingClientRect();
    return { x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height };
  }
  function paint(c) {
    const r = c.rect;
    renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    if (c.out) return;
    camera.aspect = r.w / r.h; camera.updateProjectionMatrix();
    for (const o of cards) o.model.visible = o === c;
    set.key.intensity = set.keyI * (1 + 0.18 * c.hover);
    renderer.render(scene, camera); stats.renders++;
  }
  function resize() {
    const w = wrap.getBoundingClientRect(); W = Math.round(w.width); H = Math.round(w.height);
    renderer.setPixelRatio(still ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H, true);
    renderer.setScissor(0, 0, W, H); renderer.setClearColor(0x000000, 0); renderer.clear();
    for (const c of cards) { c.rect = rect(c); paint(c); }
  }
  // image d'une carte (derniere peinture) : decrochage, planche contact, revelation
  function snapshot(c, type = 'image/jpeg') {
    const dpr = renderer.getPixelRatio(), r = c.rect;
    const was = c.out; c.out = false; paint(c); c.out = was;
    const cv = document.createElement('canvas'); cv.width = Math.round(r.w * dpr); cv.height = Math.round(r.h * dpr);
    cv.getContext('2d').drawImage(canvas, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL(type, 0.9);
    if (was) paint(c);
    return url;
  }

  const api = {
    cards, renderer, frame, stats: () => ({ bytes, parseMs: Math.round(parseMs), memory: { ...renderer.info.memory }, programs: renderer.info.programs.length, renders: stats.renders, canvas: [canvas.width, canvas.height] }),
    resize,
    hover(i, on, pointer) { const c = cards[i]; c.hovering = on; if (pointer) c.pointer = pointer; else c.pointer = { ...c.pointer, active: false }; },
    express(list, expr, holdS = 0, after = 'neutral') {
      for (const i of list) {
        const c = cards[i]; if (c.out) continue;
        c.rig.setExpression(expr); c.activeUntil = now() + 1.5;
        clearTimeout(c.exprTimer);
        if (holdS) c.exprTimer = setTimeout(() => { c.rig.setExpression(after); c.activeUntil = now() + 1.5; }, holdS * 1000);
      }
    },
    setOut(i, out) {
      const c = cards[i]; if (c.out === out) return;
      if (out) { const img = new Image(); img.alt = ''; img.src = snapshot(c); c.slot.replaceChildren(img); c.out = true; paint(c); }
      else { c.out = false; c.slot.replaceChildren(); c.rect = rect(c); paint(c); }
    },
    portrait: (i) => snapshot(cards[i]),
    // portrait net pour la revelation et « mon personnage » : peint en grand dans un coin du
    // canevas (le plateau est alors sous un calque), puis tout le plateau est repeint
    portraitHD(i, w = 360, h = 480) {
      const c = cards[i], keep = c.rect, was = c.out;
      c.rect = { x: 0, y: 0, w: Math.min(w, W), h: Math.min(h, H) }; c.out = false;
      const url = snapshot(c); c.rect = keep; c.out = was;
      for (const k of cards) { k.rect = rect(k); paint(k); }
      return url;
    },
    pause(on) { paused = on; },                       // plateau cache (accueil) : plus aucune peinture
    paintMs(n = 24) {
      const gl = renderer.getContext(), px = new Uint8Array(4), list = cards.filter((c) => !c.out).slice(0, n);
      const t0 = performance.now(); list.forEach(paint); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return (performance.now() - t0);
    },
  };
  resize();
  new ResizeObserver(resize).observe(wrap);
  if (!still) {
    const tick = () => {
      clock.update(performance.now());
      const t = now(); let painted = 0, idlePainted = 0;
      if (paused) { requestAnimationFrame(tick); return; }
      for (const c of cards) {
        if (c.out) continue;
        c.hover += ((c.hovering ? 1 : 0) - c.hover) * 0.2;
        const live = c.hovering || c.hover > 0.01 || c.rig.blink.t0 >= 0 || t < c.activeUntil;
        const due = !reduced && t >= c.next && idlePainted < IDLE_PER_FRAME;
        if (!live && !due) continue;
        if (!live) idlePainted++;
        c.rig.update(Math.min(t - c.last, 0.25) || 1 / 60, t, c.hovering && !reduced ? c.pointer : c.rest);
        c.last = t;
        if (due) c.next = t + idle * (0.8 + Math.random() * 0.4);
        paint(c); painted++;
      }
      stats.painted = painted;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return api;
}
