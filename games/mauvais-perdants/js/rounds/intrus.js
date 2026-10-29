// L'Intrus — coup d'œil. Une grille de signes presque identiques, un seul est différent : le
// toucher. Douze grilles, de plus en plus grandes, les mêmes pour tous. Temps total le plus bas
// gagne ; un signe à côté ajoute 1,5 s.

import { int, roundRng } from './_deps.js';

export const GRIDS = 12, MISS_MS = 1500;
const PAIRS = [['O', 'Q'], ['b', 'd'], ['E', 'F'], ['m', 'n'], ['1', '7'], ['6', '9'], ['C', 'G'], ['p', 'q'], ['H', 'N'], ['S', '5']];

export default {
  id: 'intrus', family: 'espace', title: 'L’Intrus', verb: 'Repère',
  rules: ['Une grille de signes presque identiques : un seul est différent. Touche-le.', 'Douze grilles, de plus en plus grandes. Un signe à côté : +1,5 s.', 'Temps total le plus bas gagne.'],
  playMs: 60000,
  unit: 'temps total (pénalités comprises)',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'intrus');
    const rounds = Array.from({ length: GRIDS }, (_, k) => {
      const n = 3 + Math.floor(k / 3), pair = r.pick(PAIRS), a = r.int(0, 1);
      return { n, base: pair[a], odd: pair[1 - a], cell: r.int(0, n * n - 1) };
    });
    return { rounds };
  },
  ghost: () => ({ key: [0, 220, 1], label: '22,0 s' }),
  tieText: () => 'Égalité au dixième de seconde près, puis moins de signes ratés.',
  score(payload) {
    const hits = int(payload && payload.hits, 0, GRIDS, 0);
    const miss = int(payload && payload.miss, 0, 500, 0);
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), hits * 400);   // en dessous : pas humain
    if (hits >= GRIDS) {
      const total = ms + miss * MISS_MS;
      return { key: [0, Math.round(total / 100), miss], label: `${(total / 1000).toFixed(1).replace('.', ',')} s`, valid: true, stats: { total, miss, hits } };
    }
    return { idle: hits === 0 && miss === 0, key: [1, -hits, miss], label: `${hits}/${GRIDS} grilles`, valid: true, stats: { total: null, miss, hits } };
  },
};
