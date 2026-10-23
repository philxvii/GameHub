// Simulation du barème : poids égal vs finale ×2. Joueurs de niveaux différents (compétence
// latente) + bruit de manche. Mesures : le plus fort gagne-t-il ? la 5e manche change-t-elle
// le vainqueur ? le vainqueur est-il déjà connu (inrattrapable) avant la 5e manche ?
import { rankRound, slotPoints } from '../js/scoring.js';
import { rng } from '../js/rng.js';
export function simulate({ n, trials = 4000, finalWeight = 1, noise = 1, seed = 1 }) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  let bestWins = 0, decidedByFinal = 0, lockedBefore = 0, finalAlive = 0;
  for (let t = 0; t < trials; t++) {
    const skill = Array.from({ length: n }, () => gauss());
    const uids = skill.map((_, k) => 'p' + k);
    const tot = Array(n).fill(0); let before = null;
    for (let i = 0; i < 5; i++) {
      const perf = skill.map(s => s + noise * gauss());
      const res = rankRound(uids.map((uid, k) => ({ uid, key: [-perf[k]], present: true })), n);
      const w = i === 4 ? finalWeight : 1;
      if (i === 4) before = tot.slice();
      uids.forEach((u, k) => { tot[k] += res[u].pts * w; });
    }
    const lead = before.indexOf(Math.max(...before));
    const win = tot.indexOf(Math.max(...tot));
    if (win === skill.indexOf(Math.max(...skill))) bestWins++;
    if (win !== lead) decidedByFinal++;
    const sorted = before.slice().sort((a, b) => b - a);
    const gain = (slotPoints(0, n) - slotPoints(n - 1, n)) * finalWeight;
    if (sorted[0] - sorted[1] > gain) lockedBefore++;
    finalAlive += before.filter(b => Math.max(...before) - b <= gain).length;
  }
  return { n, finalWeight, bestWins: bestWins / trials, decidedByFinal: decidedByFinal / trials, lockedBefore: lockedBefore / trials, aliveAtFinal: finalAlive / trials };
}
if (process.argv[1] && process.argv[1].endsWith("sim.mjs")) {
  for (const n of [2, 4, 8]) for (const w of [1, 2]) console.log(JSON.stringify(simulate({ n, finalWeight: w })));
}
