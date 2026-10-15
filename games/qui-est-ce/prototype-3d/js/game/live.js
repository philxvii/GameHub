// Rendu vivant d'UNE carte a la fois : un seul canevas WebGL, pose exactement sur la photo de la
// carte active (survol, focus clavier, toucher, selection). Meme studio que les portraits
// pre-rendus (cast.js) : l'image fixe dessous et le personnage vivant dessus coincident ; on
// passe de l'un a l'autre par un fondu court, sans saut de lumiere ni de cadre.
//
// Le canevas ne peint QUE sa propre case (il a sa taille) : aucune image egaree possible
// hors de la carte. Rien n'est calcule quand aucune carte n'est active. Les personnages charges
// restent en memoire (4 au plus) ; au-dela, le plus ancien est libere.

import * as THREE from 'three';
import { createStudio, ASPECT } from './cast.js';

const KEEP = 4;

export function createLive({ host, cast, reduced = false }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'live'; canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = canvas.style.height = '0px';            // aucune taille tant qu'il n'est pose sur aucune carte
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio * 2, 3));       // sur-echantillonne comme les portraits (rendus en 2x) : memes cheveux
  let studio = null;
  const models = new Map();                  // i -> { model, rig, used }
  const timer = new THREE.Timer();
  let active = null, pointer = { x: 0, y: 0.05, active: false }, raf = 0, shownAt = 0, token = 0;
  let pending = new Map();                   // i -> expression a appliquer

  async function get(i) {
    if (!studio) studio = createStudio(renderer, await cast.frame());
    if (!models.has(i)) {
      const m = await cast.build(i, { reduced });
      if (pending.has(i)) { m.rig.setExpression(pending.get(i)); pending.delete(i); }
      for (let k = 0; k < 90; k++) m.rig.update(1 / 60, k / 60, { x: 0, y: 0.05, active: true });   // pose stable, comme le portrait
      models.set(i, m);
      if (models.size > KEEP) {                // le plus ancien est libere
        const old = [...models.entries()].filter(([k]) => k !== i).sort((a, b) => a[1].used - b[1].used)[0];
        if (old) { models.delete(old[0]); release(old[1].model); }
      }
    }
    const m = models.get(i); m.used = performance.now(); return m;
  }

  // Memoire GPU d'un modele quitte : ce que plus aucun modele garde n'utilise. Les donnees restent
  // dans le cache du chargeur : si le personnage revient, Three.js les renvoie au GPU.
  function release(model) {
    const used = new Set();
    for (const { model: m } of models.values()) m.traverse((o) => { if (o.isMesh) { used.add(o.geometry); for (const x of [].concat(o.material)) used.add(x); } });
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!used.has(o.geometry)) o.geometry.dispose();
      for (const x of [].concat(o.material)) if (!used.has(x)) { for (const k in x) if (x[k]?.isTexture) x[k].dispose(); x.dispose(); }
    });
  }

  function place(shot) {
    const h = host.getBoundingClientRect(), r = shot.getBoundingClientRect();
    canvas.style.left = `${r.left - h.left}px`; canvas.style.top = `${r.top - h.top}px`;
    const w = Math.round(r.width), hh = Math.round(r.width / ASPECT);
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(hh * renderer.getPixelRatio())) renderer.setSize(w, hh);
  }

  function frame() {
    raf = 0;
    if (!active) return;
    timer.update(performance.now());
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    active.m.rig.update(dt || 1 / 60, t, reduced ? { x: 0, y: 0.05, active: true } : pointer);
    studio.render();
    if (!canvas.classList.contains('on') && performance.now() - shownAt > 30) canvas.classList.add('on');   // premiere image peinte : fondu
    raf = requestAnimationFrame(frame);
  }

  return {
    canvas,
    // Active la carte i (sa photo : `shot`) ; le canevas ne se montre qu'une fois la 1re image peinte.
    async show(i, shot, ptr) {
      if (ptr) pointer = ptr;
      if (active && active.i === i) { place(shot); return; }
      const my = ++token;
      canvas.classList.remove('on');
      const m = await get(i);
      if (my !== token) return;                 // une autre carte a ete activee entre-temps
      active = { i, m, shot }; place(shot); studio.show(m.model); shownAt = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    point(ptr) { pointer = ptr; },
    hide(i) {
      if (i !== undefined && active && active.i !== i) return;
      token++; active = null; canvas.classList.remove('on');
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    reposition() { if (active) place(active.shot); },
    express(i, expr) {
      const m = models.get(i);
      if (m) m.rig.setExpression(expr); else pending.set(i, expr);
    },
    preload: (i) => cast.preload(i),
    stats: () => ({ loaded: models.size, active: active?.i ?? null, yaw: active ? +active.m.rig.state.eye.yaw.toFixed(3) : 0, memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length || 0 }),
  };
}
