// Les Numéros — mémoire spatiale ordonnée. Des numéros 1..N apparaissent sur une
// grille 6×6 ; au premier toucher (sur le 1), les autres se masquent : on touche les
// cases dans l'ordre. Réussi : N+1. Raté : une vie en moins (3 vies), nouvelle
// disposition au même niveau. Les dispositions dépendent de (niveau, essai) : tout le
// monde a la même au même moment de sa partie. Les cases ne bougent jamais.

import { arr, ints, int, roundRng } from './_deps.js';

export const COLS = 6, ROWS = 6, CELLS = COLS * ROWS;
export const START = 4, MAX_N = 24, LIVES = 3;

export const layout = (seed, i, n, attempt) => roundRng(seed, i, 'numeros', `${n}:${attempt}`).sample(CELLS, n);

// Rejoue les essais : [{ n, c:[cases touchées dans l'ordre] }]. Renvoie le meilleur N réussi.
export function replay(attempts, p) {
  let n = START, lives = LIVES, best = 0;
  for (let a = 0; a < attempts.length && lives > 0 && n <= MAX_N; a++) {
    const cells = layout(p.seed, p.i, n, a);
    const got = attempts[a].c;
    const ok = got.length === n && got.every((c, j) => c === cells[j]);
    if (ok) { best = n; n++; } else lives--;
  }
  return { best, lives, next: n };
}

export default {
  id: 'numeros', family: 'espace', title: 'Les Numéros', verb: 'Mémorise',
  rules: ['Repère les numéros, puis touche le 1 : les autres se cachent.', 'Touche les cases dans l’ordre 1, 2, 3…', '3 vies. Le plus de numéros retenus gagne.'],
  playMs: 70000,
  unit: 'nombre de numéros retenus',
  eligible: () => true,
  params(seed, i) { return { seed, i, start: START, lives: LIVES }; },
  tieText: () => 'À score égal, le plus rapide (à 0,5 s près).',
  score(payload, p) {
    const attempts = arr(payload && payload.at, 40).map(x => ({ c: ints(x && x.c, MAX_N, 0, CELLS - 1) }));
    const { best, lives } = replay(attempts, p);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    return { idle: !attempts.some(x => x.c.length), key: [-best, best ? Math.round(ms / 500) : 0], label: best ? `${best} numéros` : 'aucun', valid: true, stats: { best, lives } };
  },
};
