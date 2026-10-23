// Le Nuage — estimation. Un nuage de points s'affiche 2,5 s : combien y en a-t-il ?
// Trois nuages, générés par le code (le nombre exact est connu, rien n'est inventé).
// L'écart se mesure en rapport (logarithme) : se tromper de 20 sur 40 pèse plus que
// de 20 sur 150. Le plus petit écart cumulé gagne.

import { arr, int, roundRng } from './_deps.js';

export const CLOUDS = 3, SHOW_MS = 2500;
export const MISSING = Math.log(4);       // pas de réponse : comme se tromper d'un facteur 4

export function clouds(seed, i) {
  const r = roundRng(seed, i, 'nuage');
  const ranges = [[18, 45], [45, 95], [90, 170]];
  return ranges.map(([lo, hi], k) => {
    const n = r.int(lo, hi);
    const dots = [];
    let guard = 0;
    while (dots.length < n && guard++ < 20000) {
      const d = { x: Math.round((0.04 + r() * 0.92) * 1000) / 1000, y: Math.round((0.04 + r() * 0.92) * 1000) / 1000, s: r.int(0, 2) };
      if (dots.every(o => Math.hypot(o.x - d.x, o.y - d.y) > 0.028)) dots.push(d);   // points jamais superposés
    }
    return { n: dots.length, dots, k };
  });
}

export const errorOf = (guess, n) => {
  const g = Number(guess);
  if (!Number.isFinite(g) || g <= 0) return MISSING;
  return Math.min(MISSING, Math.abs(Math.log(g / n)));
};

export default {
  id: 'nuage', family: 'chiffres', title: 'Le Nuage', verb: 'Estime',
  rules: ['Un nuage de points s’affiche 2,5 secondes.', 'Combien de points ? Trois nuages.', 'Le plus petit écart cumulé gagne.'],
  playMs: 40000,
  unit: 'écart moyen à la vraie valeur',
  eligible: () => true,
  params(seed, i) { return { clouds: clouds(seed, i), show: SHOW_MS }; },
  tieText: () => 'Égalité à 1 % d’écart près.',
  score(payload, p) {
    const answers = arr(payload && payload.a, CLOUDS).map(x => int(x, 0, 100000, 0));
    while (answers.length < CLOUDS) answers.push(0);
    const errs = p.clouds.map((c, k) => errorOf(answers[k], c.n));
    const sum = errs.reduce((a, b) => a + b, 0);
    const pct = Math.round((Math.exp(sum / CLOUDS) - 1) * 100);
    return { idle: answers.every(x => !x), key: [Math.round(sum * 100)], label: `écart ${pct} %`, valid: true, stats: { pct, answers, truth: p.clouds.map(c => c.n) } };
  },
};
