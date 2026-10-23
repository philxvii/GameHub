// Hasard reproductible : toute donnée de manche (séquences, chiffres, mots, positions,
// lettre du Petit Bac) découle de la graine du tournoi. Tous les clients d'un salon
// calculent donc exactement le même contenu, et le coordinateur peut rejouer une
// partie pour recalculer un score. Module PUR, sans DOM.

// Empreinte 32 bits d'une chaîne (FNV-1a).
export function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Générateur mulberry32 : rapide, suffisant pour du jeu, identique sur tous les moteurs JS.
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));   // bornes incluses
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.shuffle = arr => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  // k éléments distincts parmi 0..n-1
  next.sample = (n, k) => next.shuffle([...Array(n).keys()]).slice(0, k);
  return next;
}

// Sous-graine stable d'une manche : tournoi + rang + jeu (+ suffixe éventuel).
export const roundRng = (seed, index, gameId, extra = '') => rng(hash(`${seed}:${index}:${gameId}:${extra}`));

// Graine de tournoi lisible (débogage, reproduction d'une session de test).
export function newSeed(random = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += A[Math.floor(random() * A.length)];
  return s;
}
