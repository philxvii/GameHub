// Contrat commun des manches. Chaque fichier de js/rounds/ exporte un objet :
//
//   id        identifiant stable (jamais renommé : il est stocké dans les parties)
//   family    'vitesse' | 'espace' | 'memoire' | 'mots' | 'chiffres'
//   title     nom affiché ; verb : l'action en deux mots ; rules : 2-3 phrases courtes
//   playMs    durée maximale de l'action (le chrono commun)
//   unit      ce que mesure le résultat, en clair
//   tie       comment on départage, en clair (affiché avant la manche)
//   eligible(room)          false si la manche serait injuste pour ce salon (appareils)
//   params(seed, i, room)   contenu de la manche, déterministe (même graine -> même contenu)
//   score(payload, params)  -> { key:[...], label, valid, stats, idle }
//                           idle = le joueur n'a rien fait : il est compté absent (0 point)
//
// score() est PUR et défensif : le payload vient d'un client non fiable. Il est
// recalculé par le coordinateur à partir des entrées brutes (réponses, clics) en
// rejouant la graine, jamais à partir d'un score déclaré quand on peut l'éviter.
// key : tableau comparé dans l'ordre, PLUS PETIT = MEILLEUR. Deux joueurs aux clés
// égales sont ex æquo (les durées sont arrondies à une tranche annoncée).

export const FAMILIES = {
  vitesse:  { label: 'Vitesse',  icon: '⚡' },
  espace:   { label: 'Espace',   icon: '◰' },
  memoire:  { label: 'Mémoire',  icon: '◎' },
  mots:     { label: 'Mots',     icon: '✎' },
  chiffres: { label: 'Chiffres', icon: '≈' },
};

export const MAX_PAYLOAD = 4000;      // caractères JSON, aussi borné par les règles de la base

// Lecture défensive d'un payload.
export const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
export const num = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
export const int = (v, min, max, dflt) => {
  const n = num(v, min, max, NaN);
  return Number.isNaN(n) ? dflt : Math.round(n);
};
export const ints = (v, max, lo, hi) => arr(v, max).map(x => int(x, lo, hi, -1));

// Clé de non-participation : derrière tout le monde.
export const ABSENT = { key: [Infinity], label: 'absent', valid: false, stats: {} };

export function compareKeys(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] === undefined ? 0 : a[i];
    const y = b[i] === undefined ? 0 : b[i];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export const secs = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
