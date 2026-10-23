// Le Coffre — mémoire des nombres. Un nombre s'affiche, disparaît, on le retape.
// Réussi : un chiffre de plus. 2 vies : une erreur redonne un nouveau nombre de même
// longueur. Les chiffres sont des CHAÎNES (les zéros comptent) ; le premier chiffre
// n'est jamais 0 pour éviter toute ambiguïté de lecture. Départ à 3 chiffres.

import { arr, int, roundRng } from './_deps.js';

export const START = 3, MAX_LEN = 20, LIVES = 2;
export const showMs = len => Math.min(5200, 700 + 320 * len);

export function numberFor(seed, i, len, attempt) {
  const r = roundRng(seed, i, 'coffre', `${len}:${attempt}`);
  let s = String(r.int(1, 9));
  while (s.length < len) s += String(r.int(0, 9));
  return s;
}

// La réponse n'est acceptée que si elle ne contient QUE des chiffres (espaces retirés).
export const normalizeDigits = v => {
  const s = String(v == null ? '' : v).replace(/\s+/g, '');
  return /^[0-9]{0,24}$/.test(s) ? s : null;
};

export function replay(answers, p) {
  let len = START, lives = LIVES, best = 0;
  const log = [];
  for (let a = 0; a < answers.length && lives > 0 && len <= MAX_LEN; a++) {
    const want = numberFor(p.seed, p.i, len, a);
    const got = normalizeDigits(answers[a]);
    const ok = got === want;
    log.push({ want, got, ok });
    if (ok) { best = len; len++; } else lives--;
  }
  return { best, lives, log };
}

export default {
  id: 'coffre', family: 'memoire', title: 'Le Coffre', verb: 'Retiens',
  rules: ['Un nombre s’affiche puis disparaît : retape-le.', 'Un chiffre de plus à chaque réussite. Départ : 3 chiffres.', '2 vies. Le plus long nombre retenu gagne.'],
  playMs: 70000,
  unit: 'chiffres retenus',
  eligible: () => true,
  params(seed, i) { return { seed, i, start: START, lives: LIVES }; },
  tieText: () => 'À longueur égale, le plus rapide (à 0,5 s près).',
  score(payload, p) {
    const answers = arr(payload && payload.a, 40).map(x => String(x == null ? '' : x).slice(0, 24));
    const { best, log } = replay(answers, p);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    const lastFail = log.filter(l => !l.ok).pop();
    return { idle: !answers.length, key: [-best, best ? Math.round(ms / 500) : 0], label: best ? `${best} chiffres` : 'aucun', valid: true, stats: { best, lastFail: lastFail ? { want: lastFail.want, got: lastFail.got } : null } };
  },
};
