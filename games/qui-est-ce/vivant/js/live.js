// Les quatre personnages de Qui est-ce ? en 3D temps reel dans la fenetre du hub : un canevas WebGL
// par visage, pose sur sa case. Le regard, la tete, le clignement et la respiration viennent du rig
// du prototype (rig.js) ; le hub choisit l'expression (sourire, mefiance, surprise).
import * as THREE from 'three';
import { createCast, createStudio, ASPECT } from './cast.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function createLive(hosts, { reduced = false } = {}) {
  const people = await (await fetch(new URL('../roster.json', import.meta.url))).json();
  const cast = createCast(people);
  const frame = await cast.frame();
  const items = await Promise.all(hosts.map(async (host, i) => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .25s linear';
    host.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio * 2, 3));
    const studio = createStudio(renderer, frame);
    const { model, rig } = await cast.build(i, { reduced });
    studio.show(model);
    for (let k = 0; k < 90; k++) rig.update(1 / 60, k / 60, { x: 0, y: 0.05, active: true });   // pose stable
    return { host, canvas, renderer, studio, rig, painted: false, w: 0, h: 0 };
  }));

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
    dispose() { this.stop(); items.forEach(it => it.renderer.dispose()); },
  };
}
