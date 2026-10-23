// Calcul express — logique. Une suite d'opérations générées par le code (donc toujours
// justes), de plus en plus dures, identiques pour tous. Réponse fausse = −1 :
// taper n'importe quoi ne rapporte rien. « Passer » ne coûte rien.

import { arr, roundRng } from './_deps.js';

export const COUNT = 40;

export function problems(seed, i) {
  const r = roundRng(seed, i, 'calcul');
  const out = [];
  for (let k = 0; k < COUNT; k++) {
    const tier = k < 6 ? 0 : k < 14 ? 1 : k < 24 ? 2 : 3;
    const op = r.pick(tier === 0 ? ['+', '−'] : ['+', '−', '×', tier >= 2 ? '÷' : '×']);
    let a, b, ans;
    const hi = [20, 60, 120, 400][tier];
    if (op === '+') { a = r.int(2, hi); b = r.int(2, hi); ans = a + b; }
    else if (op === '−') { a = r.int(5, hi); b = r.int(1, a); ans = a - b; }
    else if (op === '×') { a = r.int(2, [9, 12, 15, 25][tier]); b = r.int(2, tier >= 2 ? 12 : 9); ans = a * b; }
    else { b = r.int(2, 12); ans = r.int(2, tier >= 3 ? 25 : 12); a = b * ans; }          // division exacte
    out.push({ q: `${a} ${op} ${b}`, a: ans });
  }
  return out;
}

export default {
  id: 'calcul', family: 'chiffres', title: 'Calcul express', verb: 'Calcule',
  rules: ['Des opérations s’enchaînent : réponds vite.', 'Juste : +1. Faux : −1. Passer : 0.', 'Le meilleur total gagne.'],
  playMs: 45000,
  unit: 'bonnes réponses moins les fausses',
  eligible: () => true,
  params(seed, i) { return { list: problems(seed, i) }; },
  tieText: () => 'À total égal, le plus de bonnes réponses.',
  score(payload, p) {
    const answers = arr(payload && payload.a, COUNT);
    let good = 0, bad = 0;
    answers.forEach((x, k) => {
      if (x === null || x === '' || x === undefined) return;          // passé
      if (Number(x) === p.list[k].a && String(x).trim() !== '') good++; else bad++;
    });
    const net = good - bad;
    return { idle: good + bad === 0, key: [-net, -good], label: `${net} pt${Math.abs(net) > 1 ? 's' : ''}`, valid: true, stats: { good, bad, net } };
  },
};
