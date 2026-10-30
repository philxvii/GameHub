// Dans l'ordre — culture et estimation. Six séries de cinq éléments à ranger du plus petit au plus grand (hauteurs,
// dates, distances…), les mêmes pour tous, présentés dans le même désordre. Chaque élément à sa bonne place = un
// point (30 au plus) ; à égalité, le plus rapide. Les valeurs sont des ordres de grandeur connus et stables.

import { arr, int, roundRng } from './_deps.js';

export const SETS = 6, SIZE = 5;

// [question, unité, [[nom, valeur], ...]] : valeurs toutes différentes dans une série. Plus de cinq éléments : on en tire cinq.
export const BANK = [
  ['Du plus petit au plus grand monument', 'hauteur en mètres', [['Arc de triomphe', 50], ['Statue de la Liberté', 93], ['Tour Eiffel', 330], ['Empire State Building', 443], ['Burj Khalifa', 828]]],
  ['Du plus ancien au plus récent', 'année', [['Découverte de l’Amérique par Colomb', 1492], ['Révolution française', 1789], ['Naufrage du Titanic', 1912], ['Premiers pas sur la Lune', 1969], ['Chute du mur de Berlin', 1989]]],
  ['Du plus court au plus long fleuve', 'longueur en kilomètres', [['La Seine', 777], ['La Loire', 1006], ['Le Rhin', 1233], ['Le Danube', 2850], ['Le Nil', 6650]]],
  ['Du plus petit au plus grand territoire', 'surface en kilomètres carrés', [['Le Vatican', 0.44], ['Monaco', 2], ['Le Luxembourg', 2586], ['La France', 551695], ['La Russie', 17098242]]],
  ['Du plus proche au plus lointain du Soleil', 'distance au Soleil', [['Mercure', 58], ['Vénus', 108], ['La Terre', 150], ['Mars', 228], ['Jupiter', 778]]],
  ['Du plus léger au plus lourd animal', 'poids en kilogrammes', [['Un chat', 4], ['Un labrador', 30], ['Un cheval', 500], ['Une girafe', 1200], ['Un éléphant d’Afrique', 5000], ['Une baleine bleue', 150000]]],
  ['Du plus ancien au plus récent', 'année d’invention', [['L’imprimerie de Gutenberg', 1450], ['Le téléphone', 1876], ['Le cinéma des frères Lumière', 1895], ['L’avion des frères Wright', 1903], ['L’iPhone', 2007]]],
  ['Du plus lent au plus rapide', 'vitesse en kilomètres par heure', [['Un escargot', 0.05], ['Un piéton', 5], ['Un cycliste', 20], ['Un guépard', 110], ['Un avion de ligne', 900]]],
  ['Du moins haut au plus haut sommet', 'altitude en mètres', [['Le Ben Nevis', 1345], ['Le mont Fuji', 3776], ['Le mont Blanc', 4805], ['Le Kilimandjaro', 5895], ['L’Everest', 8849]]],
  ['Du plus petit au plus grand diamètre', 'diamètre en kilomètres', [['Mercure', 4879], ['Mars', 6779], ['La Terre', 12742], ['Saturne', 116460], ['Jupiter', 139820]]],
  ['Du plus ancien au plus récent film', 'année de sortie', [['Le Parrain', 1972], ['Star Wars', 1977], ['Jurassic Park', 1993], ['Titanic', 1997], ['Matrix', 1999]]],
];

// Séries tirées de la graine : { q, unit, items: [{ n, v }] } dans un ordre mélangé ; truth = indices triés par valeur.
export function sets(seed, i) {
  const r = roundRng(seed, i, 'ordre');
  return r.shuffle(BANK.map((_, k) => k)).slice(0, SETS).map(k => {
    const [q, unit, all] = BANK[k];
    const picked = all.length > SIZE ? r.shuffle(all.map((_, x) => x)).slice(0, SIZE).map(x => all[x]) : all;
    const items = r.shuffle(picked.map(([n, v]) => ({ n, v })));
    const truth = items.map((_, x) => x).sort((a, b) => items[a].v - items[b].v);
    return { q, unit, items, truth };
  });
}

export default {
  id: 'ordre', family: 'chiffres', title: 'Dans l’ordre', verb: 'Classe',
  rules: ['Cinq éléments en désordre : touche-les du plus petit au plus grand (ou du plus ancien au plus récent).', 'Six séries, les mêmes pour tout le monde.', 'Chaque élément à sa place : un point. Le plus de points gagne ; à égalité, le plus rapide.'],
  playMs: 90000,
  unit: 'éléments mis à leur bonne place',
  eligible: () => true,
  params(seed, i) { return { sets: sets(seed, i) }; },
  ghost: () => ({ key: [-16, 110], label: '16 sur 30 bien placés' }),
  tieText: () => 'Égalité au nombre de places, puis à la seconde près.',
  score(payload, p) {
    const rows = arr(payload && payload.o, SETS).map(x => arr(x, SIZE).map(y => int(y, -1, SIZE - 1, -1)));
    let good = 0, done = 0;
    p.sets.forEach((s, k) => {
      const o = rows[k];
      if (!o || o.length < SIZE || new Set(o).size < SIZE || o.some(y => y < 0)) return;
      done++;
      s.truth.forEach((t, pos) => { if (o[pos] === t) good++; });
    });
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), done * 2500);
    return { idle: done === 0, key: [-good, Math.round(ms / 500)], label: `${good} sur ${SETS * SIZE} bien placés`, valid: true, stats: { good, done, ms } };
  },
};
