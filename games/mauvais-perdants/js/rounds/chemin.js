// Le Chemin — mémoire de séquence. Une grille 3×3 s'allume case après case ; on
// reproduit l'ordre. Chaque niveau ajoute une case à LA MÊME séquence (tirée de la
// graine) : tout le monde voit exactement la même chose. Une erreur arrête la manche.
// Le score est recalculé en rejouant les clics envoyés, niveau par niveau.

import { arr, ints, int, roundRng } from './_deps.js';

export const MAX_LEVEL = 18;
export const FLASH_MS = 480;      // durée d'allumage d'une case
export const GAP_MS = 170;        // pause entre deux cases

export function levelOf(inputs, seq) {
  let level = 0;
  for (let k = 0; k < Math.min(inputs.length, MAX_LEVEL); k++) {
    const want = seq.slice(0, k + 1);
    const got = inputs[k];
    if (got.length !== want.length || got.some((c, j) => c !== want[j])) break;
    level = k + 1;
  }
  return level;
}

export default {
  id: 'chemin', family: 'espace', title: 'Le Chemin', verb: 'Retiens',
  rules: ['Regarde les cases s’allumer.', 'Reproduis l’ordre. Une case de plus à chaque niveau.', 'Une erreur et c’est fini. Niveau le plus haut gagne.'],
  playMs: 70000,
  unit: 'longueur de séquence réussie',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'chemin');
    const seq = [];
    while (seq.length < MAX_LEVEL) {
      const c = r.int(0, 8);
      if (c !== seq[seq.length - 1]) seq.push(c);       // jamais deux fois de suite la même case
    }
    return { seq, flash: FLASH_MS, gap: GAP_MS };
  },
  ghost: () => ({ key: [-7, 60], label: 'niveau 7' }),
  tieText: () => 'À niveau égal, le plus rapide à l’atteindre (à 0,5 s près).',
  score(payload, p) {
    const inputs = arr(payload && payload.in, MAX_LEVEL).map(x => ints(x, MAX_LEVEL, 0, 8));
    const level = levelOf(inputs, p.seq);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    return { idle: !inputs.some(x => x.length), key: [-level, level ? Math.round(ms / 500) : 0], label: `niveau ${level}`, valid: true, stats: { level } };
  },
};
