// Le Chrono caché — le sens du temps. Un chrono démarre, puis disparaît au bout de 2 secondes :
// il faut toucher STOP pile à la durée demandée. Trois essais, durées tirées de la graine.
// Le temps est mesuré sur l'appareil (latence réseau exclue). Pas de STOP à 2 × la durée :
// l'essai compte comme une erreur de la durée entière.

import { arr, int, roundRng } from './_deps.js';

export const TRIES = 3, SHOW_MS = 2000;

export default {
  id: 'chrono', family: 'chiffres', title: 'Le Chrono caché', verb: 'Sens le temps',
  rules: ['Un chrono démarre, puis disparaît au bout de 2 secondes.', 'Touche STOP pile à la durée demandée, de tête.', 'Trois essais : l’écart total le plus petit gagne.'],
  playMs: 52000,
  unit: 'écart total aux durées demandées',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'chrono');
    const pool = r.shuffle([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5]).slice(0, TRIES);
    return { targets: pool.map(s => s * 1000), show: SHOW_MS };
  },
  ghost: () => ({ key: [23], label: 'écart 0,45 s' }),
  tieText: () => 'Égalité à 20 ms d’écart total près.',
  score(payload, p) {
    const t = arr(payload && payload.t, TRIES).map(x => int(x, 0, 30000, -1));
    while (t.length < TRIES) t.push(-1);
    const errs = p.targets.map((g, k) => (t[k] < 0 ? g : Math.min(g, Math.abs(t[k] - g))));
    const total = errs.reduce((a, b) => a + b, 0);
    const idle = t.every(x => x < 0);
    return { idle, key: [Math.round(total / 20)], label: `écart ${(total / 1000).toFixed(2).replace('.', ',')} s`, valid: true, stats: { total, errs } };
  },
};
