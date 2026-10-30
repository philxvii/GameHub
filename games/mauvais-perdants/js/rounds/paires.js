// Les Paires — mémoire. Seize cartes face cachée, huit paires de signes, la même disposition pour tous. On retourne
// deux cartes : identiques, elles restent ; sinon elles se recachent. Le moins de coups gagne ; à égalité, le plus
// rapide. Le score est recalculé en rejouant la suite des cartes retournées (indices 0 à 15).

import { arr, int, roundRng } from './_deps.js';

export const PAIRS = 8, CARDS = 16;

// Disposition : seize numéros de signe (0 à 7), chacun deux fois, mélangés par la graine.
export function layout(seed, i) {
  const r = roundRng(seed, i, 'paires');
  return r.shuffle(Array.from({ length: CARDS }, (_, k) => k % PAIRS));
}

// Rejoue : { tries, matched } (un coup = deux cartes retournées). Un geste impossible (carte déjà trouvée, même carte
// deux fois de suite) est ignoré.
export function replay(cards, flips) {
  const done = new Set();
  let tries = 0, pending = -1;
  for (const f of flips) {
    if (f < 0 || f >= CARDS || done.has(f)) continue;
    if (pending < 0) { pending = f; continue; }
    if (f === pending) continue;
    tries++;
    if (cards[f] === cards[pending]) { done.add(f); done.add(pending); }
    pending = -1;
    if (done.size >= CARDS) break;
  }
  return { tries, matched: done.size / 2 };
}

export default {
  id: 'paires', family: 'memoire', title: 'Les Paires', verb: 'Retrouve',
  rules: ['Seize cartes face cachée, huit paires de signes.', 'Retourne deux cartes : identiques, elles restent ; sinon elles se recachent.', 'Le moins de coups pour toutes les trouver gagne ; à égalité, le plus rapide.'],
  playMs: 90000,
  unit: 'nombre de coups pour trouver les huit paires',
  eligible: () => true,
  params(seed, i) { return { cards: layout(seed, i) }; },
  ghost: () => ({ key: [0, 15, 45], label: '15 coups' }),
  tieText: () => 'Égalité au nombre de coups, puis à la seconde près.',
  score(payload, p) {
    const flips = arr(payload && payload.f, 400).map(x => int(x, -1, CARDS - 1, -1));
    const { tries, matched } = replay(p.cards, flips);
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), tries * 900);
    if (matched >= PAIRS) return { key: [0, tries, Math.round(ms / 1000)], label: `${tries} coups`, valid: true, stats: { tries, matched, ms } };
    return { idle: tries === 0, key: [1, -matched, tries], label: `${matched}/${PAIRS} paires`, valid: true, stats: { tries, matched } };
  },
};
