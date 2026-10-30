// Le Compte est bon — chiffres, d'après « Des chiffres et des lettres ». Six nombres et un total à atteindre, les mêmes
// pour tous. On combine deux nombres à la fois (+, −, ×, ÷ ; pas de négatif, pas de reste) pour s'approcher du total.
// Le plus proche gagne ; à égalité, le plus rapide. Le total est toujours atteignable (il est fabriqué à partir des six
// nombres). Le score est recalculé en REJOUANT les opérations envoyées.

import { arr, int, roundRng } from './_deps.js';

export const COUNT = 6, MAX_STEPS = 5;
const POOL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 25, 50, 75, 100];
export const OPS = ['+', '−', '×', '÷'];

// Résultat de a (op) b, ou null si l'opération est interdite.
export function apply(a, b, op) {
  if (op === '+') return a + b;
  if (op === '×') return a * b;
  if (op === '−') return a > b ? a - b : null;
  if (op === '÷') return b > 0 && a % b === 0 && a !== b ? a / b : null;
  return null;
}

// Six nombres et un total atteignable : on joue des opérations au hasard jusqu'à tomber sur un total de 101 à 999.
export function puzzle(seed, i) {
  const r = roundRng(seed, i, 'compte');
  for (let tries = 0; tries < 400; tries++) {
    const nums = r.shuffle(POOL.map((_, k) => k)).slice(0, COUNT).map(k => POOL[k]);
    let list = nums.slice();
    const reached = [];
    for (let step = 0; step < MAX_STEPS && list.length > 1; step++) {
      let done = false;
      for (let t = 0; t < 30 && !done; t++) {
        const a = r.int(0, list.length - 1), b = r.int(0, list.length - 1);
        if (a === b) continue;
        const v = apply(list[a], list[b], OPS[r.int(0, 3)]);
        if (v === null) continue;
        list = list.filter((_, k) => k !== a && k !== b).concat(v);
        reached.push(v); done = true;
      }
      if (!done) break;
    }
    const ok = reached.filter((v, k) => v >= 101 && v <= 999 && k >= 2);
    if (ok.length) return { nums: nums.slice().sort((x, y) => x - y), target: ok[ok.length - 1] };
  }
  return { nums: [1, 2, 3, 4, 5, 10], target: 120 };
}

// Rejoue les opérations ([i, j, op] : indices dans la liste COURANTE) ; renvoie le meilleur écart au total.
export function replay(nums, target, steps) {
  let list = nums.slice(), best = Math.min(...list.map(v => Math.abs(v - target))), made = 0;
  for (const s of steps) {
    if (!Array.isArray(s)) break;
    const i = int(s[0], -1, 99, -1), j = int(s[1], -1, 99, -1), op = OPS[OPS.indexOf(s[2])];
    if (i < 0 || j < 0 || i === j || i >= list.length || j >= list.length || op === undefined) break;
    const v = apply(list[i], list[j], op);
    if (v === null) break;
    list = list.filter((_, k) => k !== i && k !== j).concat(v);
    made++;
    best = Math.min(best, Math.abs(v - target));
  }
  return { best, made };
}

export default {
  id: 'compte', family: 'chiffres', title: 'Le Compte est bon', verb: 'Compose',
  rules: ['Six nombres et un total à atteindre : combine-les deux par deux avec + − × ÷.', 'Pas de nombre négatif, pas de reste. Tu peux t’arrêter près du but.', 'Le plus proche du total gagne ; à égalité, le plus rapide.'],
  playMs: 90000,
  unit: 'écart au total demandé',
  eligible: () => true,
  params(seed, i) { return puzzle(seed, i); },
  ghost: () => ({ key: [3, 60], label: 'à 3 du compte' }),
  tieText: () => 'Égalité à l’écart près, puis à la seconde près.',
  score(payload, p) {
    const steps = arr(payload && payload.s, MAX_STEPS).map(x => (Array.isArray(x) ? x.slice(0, 3) : null));
    const { best, made } = replay(p.nums, p.target, steps);
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), made * 800);
    const idle = made === 0;
    return { idle, key: [best, Math.round(ms / 1000)], label: best === 0 ? 'le compte est bon' : `à ${best} du compte`, valid: true, stats: { best, made, ms } };
  },
};
