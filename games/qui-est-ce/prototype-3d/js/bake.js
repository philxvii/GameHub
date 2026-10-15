// Pre-rendu des portraits (pilote par tools/bake_portraits.js) : chaque personnage, chaque
// expression, rendu en 2x puis reduit (cheveux plus nets), fond transparent, WebP.
import * as THREE from 'three';
import { createCast, createStudio, settle, EXPRESSIONS } from './game/cast.js';

const W = 480, H = 600, SS = 2;
const people = (await (await fetch('data/roster.json')).json()).personnages;
const cast = createCast(people);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * SS, H * SS, false);
const studio = createStudio(renderer, await cast.frame());
const out = document.createElement('canvas'); out.width = W; out.height = H;
const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';

window.__bake = {
  people, exprs: EXPRESSIONS, size: [W, H],
  async one(i, exprs = EXPRESSIONS, quality = 0.86) {
    const { model, rig } = await cast.build(i);
    studio.show(model);
    const res = {};
    for (const e of exprs) {
      settle(rig, e);
      studio.render();
      g.clearRect(0, 0, W, H); g.drawImage(canvas, 0, 0, W, H);
      res[e] = out.toDataURL('image/webp', quality);
    }
    studio.show(null);
    return res;
  },
};
// Essai d'un personnage hors roster (outils de casting) : { glb, coiffure, attributs, statut }.
window.__bake.custom = async (person, exprs = ['neutral'], quality = 0.9) => {
  const c = createCast([{ id: 'essai', prenom: 'Essai', statut: 'modelise', ...person }]);
  const { model, rig } = await c.build(0);
  studio.show(model);
  const res = {};
  for (const e of exprs) {
    settle(rig, e); studio.render();
    g.clearRect(0, 0, W, H); g.drawImage(canvas, 0, 0, W, H);
    res[e] = out.toDataURL('image/webp', quality);
  }
  studio.show(null);
  return res;
};
document.documentElement.dataset.ready = '1';
