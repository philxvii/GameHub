// Le Cadenas — déduction, façon Mastermind. Un code secret de quatre chiffres tous différents, le même pour tous.
// À chaque essai, chaque chiffre se colore : vert (bien placé), jaune (dans le code, mal placé), gris (absent).
// Dix essais au plus. Le moins d'essais gagne ; à égalité, le plus rapide. Le score est RECALCULÉ en rejouant les
// essais envoyés : un client qui annoncerait « trouvé en 1 coup » sans que ses essais le prouvent n'y gagne rien.

import { arr, int, roundRng } from './_deps.js';

export const LEN = 4, MAX_TRIES = 10;

export function secretFor(seed, i) {
  const r = roundRng(seed, i, 'cadenas');
  return r.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, LEN).join('');
}

// Réponse du cadenas : bien placés (b) et bons mais mal placés (m).
export function feedback(secret, guess) {
  let b = 0, m = 0;
  for (let k = 0; k < LEN; k++) { if (guess[k] === secret[k]) b++; else if (secret.includes(guess[k])) m++; }
  return { b, m };
}

// Couleur de chaque chiffre de l'essai : 'b' vert (bien placé), 'm' jaune (dans le code, mal placé), 'x' gris (absent).
// Les chiffres du code étant tous différents, il n'y a aucune ambiguïté.
export function marks(secret, guess) {
  return [...guess].map((c, k) => (c === secret[k] ? 'b' : secret.includes(c) ? 'm' : 'x'));
}

export const validGuess = g => typeof g === 'string' && /^[0-9]{4}$/.test(g) && new Set(g).size === LEN;

// Rejoue les essais : { tries, solved, best } (best = meilleur essai, bien placés comptant double).
export function replay(secret, guesses) {
  let tries = 0, best = 0, solved = false;
  for (const g of guesses) {
    if (!validGuess(g)) continue;
    tries++;
    const f = feedback(secret, g);
    best = Math.max(best, f.b * 2 + f.m);
    if (f.b === LEN) { solved = true; break; }
    if (tries >= MAX_TRIES) break;
  }
  return { tries, solved, best };
}

export default {
  id: 'cadenas', family: 'espace', title: 'Le Cadenas', verb: 'Déchiffre',
  rules: ['Un code de quatre chiffres tous différents, le même pour tout le monde.', 'Chaque essai colore tes chiffres : vert = bien placé, jaune = dans le code mais mal placé, gris = pas dans le code.', 'Dix essais au plus. Le moins d’essais gagne ; à égalité, le plus rapide.'],
  playMs: 100000,
  unit: 'nombre d’essais pour ouvrir le cadenas',
  eligible: () => true,
  params(seed, i) { return { secret: secretFor(seed, i), len: LEN, max: MAX_TRIES }; },
  ghost: () => ({ key: [0, 7, 60], label: 'ouvert en 7 essais' }),
  tieText: () => 'Égalité au nombre d’essais, puis à la seconde près.',
  score(payload, p) {
    const guesses = arr(payload && payload.g, MAX_TRIES + 2).map(x => String(x == null ? '' : x).slice(0, 8));
    const { tries, solved, best } = replay(p.secret, guesses);
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), tries * 1500);
    if (solved) return { key: [0, tries, Math.round(ms / 1000)], label: `ouvert en ${tries} essai${tries > 1 ? 's' : ''}`, valid: true, stats: { tries, solved: true, ms } };
    return { idle: tries === 0, key: [1, -best, tries], label: tries ? 'cadenas fermé' : 'aucun essai', valid: true, stats: { tries, solved: false, best } };
  },
};
