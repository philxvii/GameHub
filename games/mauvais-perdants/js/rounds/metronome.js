// Le Métronome — le rythme. Quatre battements à écouter et à voir, puis le métronome se tait :
// il faut continuer à taper huit fois, au même tempo. Trois manches, tempo tiré de la graine.
// Seuls les intervalles entre tes touches comptent : la latence de l'appareil n'a aucun effet.

import { arr, int, roundRng } from './_deps.js';

export const BEATS = 4, TAPS = 8, RHYTHMS = 3;
const GAPS = TAPS - 1;

export default {
  id: 'metronome', family: 'memoire', title: 'Le Métronome', verb: 'Garde le tempo',
  rules: ['Un métronome bat quatre fois, puis se tait.', 'Continue à taper huit fois, exactement au même rythme.', 'Trois tempos : l’écart moyen le plus petit gagne.'],
  playMs: 48000,
  unit: 'écart moyen au tempo',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'metronome');
    return { periods: Array.from({ length: RHYTHMS }, () => r.int(520, 900)), beats: BEATS, taps: TAPS };
  },
  ghost: () => ({ key: [11], label: 'écart 45 ms' }),
  tieText: () => 'Égalité à 4 ms d’écart moyen près.',
  score(payload, p) {
    const rows = arr(payload && payload.r, RHYTHMS).map(row => arr(row, GAPS).map(x => int(x, 0, 3000, 0)));
    while (rows.length < RHYTHMS) rows.push([]);
    const errs = p.periods.map((per, k) => {
      const row = rows[k];
      let sum = 0;
      for (let j = 0; j < GAPS; j++) sum += j < row.length ? Math.min(per / 2, Math.abs(row[j] - per)) : per / 2;
      return sum / GAPS;
    });
    const avg = errs.reduce((a, b) => a + b, 0) / RHYTHMS;
    return { idle: rows.every(r => !r.length), key: [Math.round(avg / 4)], label: `écart ${Math.round(avg)} ms`, valid: true, stats: { avg: Math.round(avg), errs: errs.map(Math.round) } };
  },
};
