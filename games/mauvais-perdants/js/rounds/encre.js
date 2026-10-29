// L'Encre — le test de Stroop. Un mot de couleur s'affiche, écrit dans une AUTRE couleur :
// il faut toucher la couleur de l'encre, pas celle du mot. 30 secondes, une suite fixée par
// la graine (même suite pour tous). Juste +1, faux −1 : taper au hasard ne paie pas.

import { arr, int, roundRng } from './_deps.js';

export const COLORS = [
  { name: 'ROUGE', css: '#e8472b' }, { name: 'BLEU', css: '#3b8ed0' },
  { name: 'VERT', css: '#3fae6a' }, { name: 'JAUNE', css: '#ecb23a' },
];
export const LENGTH = 90;

export function stream(seed, i) {
  const r = roundRng(seed, i, 'encre');
  const out = [];
  for (let k = 0; k < LENGTH; k++) {
    const w = r.int(0, 3);
    let c = r.int(0, 3);
    if (c === w) c = (c + 1 + r.int(0, 2)) % 4;       // jamais le même : toujours piégeux
    out.push({ w, c });
  }
  return out;
}

export default {
  id: 'encre', family: 'vitesse', title: 'L’Encre', verb: 'Lis la couleur',
  rules: ['Un mot de couleur s’affiche, écrit dans une AUTRE couleur. Touche la couleur de l’encre, pas celle du mot.', 'Exemple : le mot ROUGE écrit en bleu → touche BLEU.', 'Juste +1, faux −1. 30 secondes : le plus de points gagne.'],
  playMs: 32000,
  unit: 'points (juste +1, faux −1)',
  eligible: () => true,
  params(seed, i) { return { items: stream(seed, i) }; },
  ghost: () => ({ key: [-16, 1], label: '16 points' }),
  tieText: () => 'À score égal, moins d’erreurs.',
  score(payload, p) {
    const a = arr(payload && payload.a, LENGTH).map(x => int(x, -1, 3, -1));
    let good = 0, bad = 0;
    a.forEach((x, k) => { if (x >= 0 && p.items[k]) { if (x === p.items[k].c) good++; else bad++; } });
    const net = good - bad;
    return { idle: !a.length, key: [-net, bad], label: `${net} pt${Math.abs(net) > 1 ? 's' : ''}`, valid: true, stats: { net, good, bad } };
  },
};
