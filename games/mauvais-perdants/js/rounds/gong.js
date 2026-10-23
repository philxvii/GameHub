// Le Gong — réflexes. Le panneau passe au rouge vif : toucher le plus vite possible.
// 5 signaux, délais tirés de la graine (identiques pour tous). Toucher avant le signal
// = faux départ : l'essai est rejoué avec le délai suivant, et le faux départ est
// compté (départage). Le temps est mesuré sur l'appareil, entre l'affichage du signal
// et l'évènement du doigt : la latence réseau n'entre pas dans la mesure.

import { arr, int, roundRng } from './_deps.js';

export const TRIALS = 5;
export const PENALTY_MS = 1000;   // essai manquant ou anticipé (< 100 ms : impossible humainement)
export const MIN_MS = 100;

export default {
  id: 'gong', family: 'vitesse', title: 'Le Gong', verb: 'Réagis',
  rules: ['Attends que le panneau passe au ROUGE, puis touche-le.', 'Cinq signaux. Toucher trop tôt = faux départ.', 'Temps moyen le plus bas gagne.'],
  playMs: 32000,
  unit: 'temps de réaction moyen',
  // Tactile et souris mélangés : l'écart de latence matérielle (plusieurs dizaines de ms)
  // déciderait seul. Retirée du tirage (le départage final reste un Gong court).
  eligible: room => new Set(room.devices || []).size <= 1,
  params(seed, i, room = {}) {
    const r = roundRng(seed, i, 'gong');
    // Salon mêlant tactile et souris : la tranche d'égalité s'élargit (latence matérielle).
    const mixed = new Set(room.devices || []).size > 1;
    // Départage (après la 5e manche) : 3 signaux seulement.
    return { delays: Array.from({ length: 14 }, () => r.int(1300, 3300)), bucket: mixed ? 30 : 15, trials: i >= 5 ? 3 : TRIALS };
  },
  tieText: p => `Temps comparés par tranches de ${p.bucket} ms (même tranche = égalité), puis moins de faux départs.`,
  score(payload, p) {
    const n = p.trials || TRIALS;
    const t = arr(payload && payload.t, n).map(x => int(x, 0, 5000, PENALTY_MS)).map(x => (x < MIN_MS ? PENALTY_MS : Math.min(x, PENALTY_MS)));
    while (t.length < n) t.push(PENALTY_MS);
    const f = int(payload && payload.f, 0, 50, 0);
    const mean = t.reduce((a, b) => a + b, 0) / n;
    const best = Math.min(...t);
    const idle = !arr(payload && payload.t, n).length && !f;
    return { idle, key: [Math.round(mean / p.bucket), f], label: `${Math.round(mean)} ms`, valid: true, stats: { mean: Math.round(mean), best, falses: f, misses: t.filter(x => x === PENALTY_MS).length } };
  },
};
