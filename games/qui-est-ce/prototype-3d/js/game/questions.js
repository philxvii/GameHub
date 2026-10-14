// Questions du jeu, tirees des attributs de data/roster.json. Pur : utilisable dans Node.
// Chaque question : { id, label, short, test(attributs) -> bool }.

export const QUESTIONS = [
  { id: 'femme', label: 'Est-ce une femme ?', short: 'Femme ?', test: (a) => a.genre === 'femme' },
  { id: 'jeune', label: 'Est-ce un ou une jeune ?', short: 'Jeune ?', test: (a) => a.age === 'jeune' },
  { id: 'senior', label: "A-t-il passé la cinquantaine ?", short: 'Senior ?', test: (a) => a.age === 'senior' },
  { id: 'chauve', label: 'Est-il chauve ?', short: 'Chauve ?', test: (a) => a.coupe === 'chauve' },
  { id: 'cheveux-noirs', label: 'A-t-il les cheveux noirs ?', short: 'Cheveux noirs ?', test: (a) => a.cheveux === 'noir' },
  { id: 'cheveux-bruns', label: 'A-t-il les cheveux bruns ?', short: 'Cheveux bruns ?', test: (a) => a.cheveux === 'brun' },
  { id: 'cheveux-blonds', label: 'A-t-il les cheveux blonds ?', short: 'Blond ?', test: (a) => a.cheveux === 'blond' },
  { id: 'cheveux-roux', label: 'A-t-il les cheveux roux ?', short: 'Roux ?', test: (a) => a.cheveux === 'roux' },
  { id: 'cheveux-gris', label: 'A-t-il les cheveux gris ?', short: 'Cheveux gris ?', test: (a) => a.cheveux === 'gris' },
  { id: 'courts', label: 'A-t-il les cheveux courts ?', short: 'Cheveux courts ?', test: (a) => a.coupe === 'court' },
  { id: 'longs', label: 'A-t-il les cheveux longs ?', short: 'Cheveux longs ?', test: (a) => a.coupe === 'long' },
  { id: 'mi-longs', label: 'A-t-il les cheveux mi-longs ?', short: 'Mi-longs ?', test: (a) => a.coupe === 'mi-long' },
  { id: 'boucles', label: 'A-t-il les cheveux bouclés ?', short: 'Bouclés ?', test: (a) => a.cheveux_boucles },
  { id: 'yeux-bleus', label: 'A-t-il les yeux bleus ?', short: 'Yeux bleus ?', test: (a) => a.yeux === 'bleu' },
  { id: 'yeux-verts', label: 'A-t-il les yeux verts ?', short: 'Yeux verts ?', test: (a) => a.yeux === 'vert' },
  { id: 'yeux-marron', label: 'A-t-il les yeux marron ?', short: 'Yeux marron ?', test: (a) => a.yeux === 'marron' },
  { id: 'lunettes', label: 'Porte-t-il des lunettes ?', short: 'Lunettes ?', test: (a) => a.lunettes },
  { id: 'chapeau', label: 'Porte-t-il une casquette ?', short: 'Casquette ?', test: (a) => a.chapeau },
  { id: 'barbe', label: 'A-t-il une barbe ?', short: 'Barbe ?', test: (a) => a.barbe },
  { id: 'moustache', label: 'A-t-il une moustache ?', short: 'Moustache ?', test: (a) => a.moustache },
  { id: 'boucles-oreilles', label: "Porte-t-il des boucles d'oreilles ?", short: "Boucles d'oreilles ?", test: (a) => a.boucles_oreilles },
];

export const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Question qui coupe le mieux un groupe de candidats (la plus proche de la moitie).
export function bestQuestion(candidates, people, asked = new Set()) {
  let best = null, score = Infinity;
  for (const q of QUESTIONS) {
    if (asked.has(q.id)) continue;
    const yes = candidates.filter((i) => q.test(people[i].attributs)).length;
    if (yes === 0 || yes === candidates.length) continue;
    const s = Math.abs(2 * yes - candidates.length);
    if (s < score) { best = q; score = s; }
  }
  return best;
}
