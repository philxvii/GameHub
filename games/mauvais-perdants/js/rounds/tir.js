// Le Stand de tir — précision. 20 cibles, une à la fois, aux mêmes positions pour
// tout le monde. Les positions sont relatives à une arène CARRÉE (0..1) : la cible a
// la même taille relative sur un téléphone et sur un écran large. Un tir à côté
// ajoute 300 ms : le spam ne paie pas.

import { int, secs, roundRng } from './_deps.js';

export const TARGETS = 20;
export const MISS_MS = 300;
export const RADIUS = 0.06;       // rayon de la cible, en fraction du côté de l'arène

export default {
  id: 'tir', family: 'vitesse', title: 'Le Stand de tir', verb: 'Vise',
  rules: ['Touche les 20 cibles, une par une.', 'Chaque tir à côté : +0,3 s.', 'Temps total le plus bas gagne.'],
  playMs: 40000,
  unit: 'temps total (pénalités comprises)',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'tir');
    const pts = [];
    let prev = { x: 0.5, y: 0.5 };
    while (pts.length < TARGETS) {
      const x = 0.1 + r() * 0.8, y = 0.1 + r() * 0.8;
      if (Math.hypot(x - prev.x, y - prev.y) < 0.28) continue;   // pas deux cibles collées
      prev = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
      pts.push(prev);
    }
    return { targets: pts, radius: RADIUS };
  },
  tieText: () => 'Égalité au dixième de seconde près, puis moins de tirs ratés.',
  score(payload, p) {
    const hits = int(payload && payload.hits, 0, TARGETS, 0);
    const miss = int(payload && payload.miss, 0, 500, 0);
    // 300 ms par cible : en dessous, ce n'est pas humain (positions aléatoires) ; le temps est rehaussé.
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), hits * 300);
    if (hits >= TARGETS) {
      const total = ms + miss * MISS_MS;
      return { key: [0, Math.round(total / 100), miss], label: secs(total), valid: true, stats: { total, miss, hits } };
    }
    return { idle: hits === 0, key: [1, -hits, miss], label: `${hits}/${TARGETS} cibles`, valid: true, stats: { total: null, miss, hits } };
  },
};
