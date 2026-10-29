// Le Mot brouillé — anagrammes. Huit mots de la banque, lettres mélangées (mêmes mots, mêmes
// mélanges pour tous) : retrouver le mot. Un autre mot de la banque avec les mêmes lettres est
// aussi accepté. Le plus de mots trouvés gagne, puis le plus rapide.

import { arr, int, roundRng } from './_deps.js';
import { fold } from '../text.js';
import { WORDS } from './dejavu.js';

export const ITEMS = 8;
const clean = s => fold(s).replace(/[^a-z]/g, '');
const sig = s => clean(s).split('').sort().join('');
const POOL = WORDS.map(clean).filter(w => w.length >= 5 && w.length <= 8);
const BY_SIG = POOL.reduce((m, w) => { (m[sig(w)] = m[sig(w)] || []).push(w); return m; }, {});

// La réponse est-elle bonne pour ce mot (lui-même, ou une autre anagramme de la banque) ?
export const accepts = (item, answer) => {
  const a = clean(answer);
  return !!a && (a === item.w || (sig(a) === sig(item.w) && (BY_SIG[sig(a)] || []).includes(a)));
};

export default {
  id: 'anagramme', family: 'mots', title: 'Le Mot brouillé', verb: 'Démêle',
  rules: ['Les lettres d’un mot sont mélangées : retrouve le mot et tape-le.', 'Huit mots. Tu peux passer un mot trop dur.', 'Le plus de mots trouvés gagne, puis le plus rapide.'],
  playMs: 62000,
  unit: 'mots retrouvés',
  eligible: () => true,
  params(seed, i) {
    const r = roundRng(seed, i, 'anagramme');
    const items = r.shuffle(POOL.filter(w => BY_SIG[sig(w)].length === 1)).slice(0, ITEMS).map(w => {
      let s = w;
      for (let t = 0; t < 20 && s === w; t++) s = r.shuffle(w.split('')).join('');
      return { w, s };
    });
    return { items };
  },
  ghost: () => ({ key: [-4, 60], label: '4 mots' }),
  tieText: () => 'À nombre de mots égal, le plus rapide (à la seconde).',
  score(payload, p) {
    const a = arr(payload && payload.a, ITEMS).map(x => String(x || '').slice(0, 16));
    const found = a.filter((x, k) => p.items[k] && accepts(p.items[k], x)).length;
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    return { idle: !a.length, key: [-found, Math.round(ms / 1000)], label: `${found} mot${found > 1 ? 's' : ''}`, valid: true, stats: { found, ms } };
  },
};
