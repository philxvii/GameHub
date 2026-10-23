// Le Damier — mémoire visuelle. Des cases s'allument ensemble, puis s'éteignent :
// retrouve-les toutes. 3 erreurs dans un niveau = une vie perdue (3 vies). Le niveau
// L demande L+2 cases ; la grille grandit par paliers annoncés (3×3, 4×4, 5×5, 6×6).

import { arr, ints, int, roundRng } from './_deps.js';

export const LIVES = 3, MISTAKES = 3, MAX_LEVEL = 20;
export const sizeOf = level => (level <= 2 ? 3 : level <= 5 ? 4 : level <= 9 ? 5 : 6);
export const countOf = level => level + 2;
export const showMs = level => 900 + 90 * countOf(level);

export const pattern = (seed, i, level, attempt) => {
  const s = sizeOf(level);
  return roundRng(seed, i, 'damier', `${level}:${attempt}`).sample(s * s, countOf(level));
};

// Un essai : clics dans l'ordre. Réussi si toutes les cases sont trouvées avant la 3e erreur.
export function judgeAttempt(target, clicks) {
  const want = new Set(target), found = new Set(), wrong = new Set();
  for (const c of clicks) {
    if (want.has(c)) found.add(c);
    else wrong.add(c);                     // recliquer une case fausse ne compte qu'une fois
    if (wrong.size >= MISTAKES) return { ok: false, found: found.size, wrong: wrong.size };
    if (found.size === want.size) return { ok: true, found: found.size, wrong: wrong.size };
  }
  return { ok: false, found: found.size, wrong: wrong.size, unfinished: true };
}

export function replay(attempts, p) {
  let level = 1, lives = LIVES, best = 0;
  for (let a = 0; a < attempts.length && lives > 0 && level <= MAX_LEVEL; a++) {
    const res = judgeAttempt(pattern(p.seed, p.i, level, a), attempts[a].c);
    if (res.ok) { best = level; level++; } else lives--;
  }
  return { best, lives };
}

export default {
  id: 'damier', family: 'espace', title: 'Le Damier', verb: 'Retrouve',
  rules: ['Des cases s’allument une seconde : retiens-les.', 'Retrouve-les toutes. 3 erreurs = une vie perdue.', '3 vies. Niveau le plus haut gagne.'],
  playMs: 70000,
  unit: 'niveau atteint',
  eligible: () => true,
  params(seed, i) { return { seed, i, lives: LIVES, mistakes: MISTAKES }; },
  tieText: () => 'À niveau égal, le plus rapide (à 0,5 s près).',
  score(payload, p) {
    const attempts = arr(payload && payload.at, 40).map(x => ({ c: ints(x && x.c, 60, 0, 35) }));
    const { best, lives } = replay(attempts, p);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    return { idle: !attempts.some(x => x.c.length), key: [-best, best ? Math.round(ms / 500) : 0], label: `niveau ${best}`, valid: true, stats: { level: best, lives } };
  },
};
