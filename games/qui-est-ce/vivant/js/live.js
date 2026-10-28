// Les quatre personnages de Qui est-ce ? en 3D temps reel dans la fenetre du hub : un canevas WebGL
// par visage, pose sur sa case. Le regard, la tete, le clignement et la respiration viennent du rig
// du prototype (rig.js) ; le hub choisit l'expression (sourire, mefiance, surprise).
// Chargement : modeles telecharges avec progression, puis personnages construits un par un (la page
// reste fluide) et premiere image peinte hors ecran, pour que les shaders soient deja compiles.
import * as THREE from 'three';
import { createCast, createStudio, ASPECT } from './cast.js';
import { progress } from './staging.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));   // rend la main au navigateur

// `quiet` : attente avant chaque etape lourde (construction, premier rendu : ~0,2 s chacune). Le hub
// y fait patienter le prechargement tant que l'utilisateur bouge, pour qu'il ne sente rien.
export async function createLive(hosts, { reduced = false, onProgress = () => {}, quiet = breathe, urgent = () => true } = {}) {
  const base = new URL('../', import.meta.url);
  const [people, sizes] = await Promise.all([fetch(new URL('roster.json', base)).then((r) => r.json()), fetch(new URL('sizes.json', base)).then((r) => r.json())]);
  const cast = createCast(people);
  // Octets a recevoir : fichiers distincts de tous les personnages. Octets = 85 % de la barre, le reste = construction.
  const files = new Set(people.flatMap((_, i) => cast.urls(i)).concat(cast.urls(0)));
  const total = [...files].reduce((n, u) => n + (sizes[u.split('/models/')[1]] || 0), 0) || 1;
  let got = 0, built = 0;
  const report = () => onProgress(Math.min(0.99, 0.85 * Math.min(1, got / total) + 0.15 * (built / hosts.length)));
  progress.onBytes = (n) => { got += n; report(); };
  progress.urgent = urgent;

  const frame = await cast.frame();
  const items = [];
  // Telechargement de tout en parallele (le cache du chargeur sert ensuite chaque personnage).
  await Promise.all(people.map((_, i) => cast.preload(i)));
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .25s linear';
    host.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio * 2, 3));
    const studio = createStudio(renderer, frame);
    await quiet();
    const { model, rig } = await cast.build(i, { reduced });
    studio.show(model);
    for (let k = 0; k < 90; k++) rig.update(1 / 60, k / 60, { x: 0, y: 0.05, active: true });   // pose stable
    const it = { host, canvas, renderer, studio, rig, painted: false, w: 0, h: 0 };
    const r = host.getBoundingClientRect();
    if (r.width) { it.w = Math.round(r.width); it.h = Math.round(r.width / ASPECT); renderer.setSize(it.w, it.h, false); }
    // Shaders compiles en parallele par le GPU (KHR_parallel_shader_compile) plutot qu'au premier rendu.
    if (renderer.compileAsync) await renderer.compileAsync(studio.scene, studio.camera).catch(() => {});
    await quiet();
    studio.render();                                          // premiere image peinte maintenant, pas au premier affichage
    items.push(it); built++; report();
  }
  progress.onBytes = null;
  progress.urgent = () => false;
  onProgress(1);

  let ptr = null, raf = 0, last = 0, t = 0;
  function fit(it) {
    const r = it.host.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.width / ASPECT);
    if (w && (w !== it.w || h !== it.h)) { it.w = w; it.h = h; it.renderer.setSize(w, h, false); }
    return r;
  }
  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min((now - last) / 1000 || 1 / 60, 0.05); last = now; t += dt;
    for (const it of items) {
      const r = fit(it); if (!r.width) continue;
      let p = { x: 0, y: 0.05, active: false };
      if (ptr && !reduced) {
        p = { x: clamp((ptr.x - (r.left + r.width / 2)) / (r.width * 2.4), -1, 1), y: clamp(-(ptr.y - (r.top + r.height * 0.42)) / (r.height * 1.5), -1, 1), active: true };
      } else if (reduced) p.active = true;
      it.rig.update(dt, t, p);
      it.studio.render();
      if (!it.painted) { it.painted = true; it.canvas.style.opacity = '1'; it.host.classList.add('live'); }
    }
  }
  return {
    start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frameLoop); } },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    point(p) { ptr = p; },
    express(i, e) { items[i]?.rig.setExpression(e); },
    dispose() { this.stop(); items.forEach((it) => it.renderer.dispose()); },
  };
}
