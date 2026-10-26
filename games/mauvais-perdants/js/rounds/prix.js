// L'Étiquette — estimation de prix. Cinq objets du quotidien, l'un après l'autre : combien
// ça coûte ? Les prix sont des moyennes indicatives constatées en France en 2025 (arrondies) ;
// l'écart se mesure en rapport (logarithme), comme au Nuage : se tromper de 1 € sur une
// baguette pèse autant que de 300 € sur une machine à laver. Le plus petit écart cumulé gagne.

import { arr, num, roundRng } from './_deps.js';

export const ITEMS_PER_ROUND = 5;
export const MISSING = Math.log(4);       // pas de réponse : comme se tromper d'un facteur 4

// [objet, précision, prix en euros]
export const CATALOG = [
  ['Une baguette', 'en boulangerie', 1.1],
  ['Un timbre lettre verte', 'à La Poste', 1.4],
  ['Un ticket de métro', 'à Paris, à l’unité', 2.5],
  ['Un expresso', 'au comptoir', 1.7],
  ['Un litre de lait', 'demi-écrémé, en supermarché', 1.1],
  ['Une douzaine d’œufs', 'plein air, en supermarché', 3.5],
  ['Un kilo de bananes', 'en supermarché', 2],
  ['Un kilo de tomates', 'en saison, au marché', 3.5],
  ['Une tablette de chocolat noir', '100 g, en supermarché', 2],
  ['Un pack de six bouteilles d’eau', '1,5 L, en supermarché', 3],
  ['Un paquet de vingt cigarettes', 'au bureau de tabac', 12.5],
  ['Une pizza margherita', 'en pizzeria', 12],
  ['Un kebab-frites', 'au snack du coin', 9],
  ['Un menu fast-food', 'burger, frites, boisson', 11],
  ['Un livre de poche', 'neuf, en librairie', 9],
  ['Une place de cinéma', 'plein tarif, en grande ville', 12],
  ['Une coupe homme', 'chez le coiffeur', 25],
  ['Une heure de baby-sitting', 'en ville', 11],
  ['Une boîte de six macarons', 'en pâtisserie', 15],
  ['Un bouquet de douze roses', 'chez le fleuriste', 30],
  ['Une bouteille de champagne', 'entrée de gamme, en supermarché', 25],
  ['Un sapin de Noël', 'naturel, 1,5 m', 40],
  ['Un jean', 'basique, en magasin', 40],
  ['Une paire de baskets', 'de sport, marque connue', 100],
  ['Un abonnement à une salle de sport', 'low cost, par mois', 30],
  ['Une nuit d’hôtel', 'deux étoiles, en province', 70],
  ['Un aller Paris–Marseille', 'en TGV, réservé à l’avance', 60],
  ['Un plein d’essence', '50 litres de sans-plomb', 90],
  ['Un passeport', 'adulte, timbre fiscal', 86],
  ['Une amende', 'téléphone tenu en conduisant', 135],
  ['Le billet du sommet de la tour Eiffel', 'adulte, en ascenseur', 36],
  ['Un vol en montgolfière', 'une heure, par personne', 250],
  ['Un vélo de ville', 'neuf, entrée de gamme', 300],
  ['Une trottinette électrique', 'neuve, entrée de gamme', 300],
  ['Une machine à laver', 'neuve, entrée de gamme', 350],
  ['Un téléviseur 4K', '55 pouces, entrée de gamme', 400],
  ['Une console de jeux de salon', 'neuve', 500],
  ['Un réfrigérateur combiné', 'neuf', 500],
  ['Un smartphone haut de gamme', 'neuf', 1200],
  ['Le SMIC mensuel', 'net, temps plein', 1430],
  ['Un permis de conduire', 'forfait 20 h en auto-école', 1800],
  ['Un mètre carré à Paris', 'prix moyen à l’achat', 9500],
  ['Une petite citadine', 'neuve, entrée de gamme', 16000],
];

export function items(seed, i) {
  const r = roundRng(seed, i, 'prix');
  return r.shuffle(CATALOG.map((c, k) => k)).slice(0, ITEMS_PER_ROUND).map(k => ({ name: CATALOG[k][0], hint: CATALOG[k][1], price: CATALOG[k][2] }));
}

export const errorOf = (guess, price) => {
  const g = Number(guess);
  if (!Number.isFinite(g) || g <= 0) return MISSING;
  return Math.min(MISSING, Math.abs(Math.log(g / price)));
};

// « 1,20 € », « 9 500 € » : la saisie accepte la virgule, les espaces et le symbole.
export function parsePrice(text) {
  const s = String(text || '').replace(/[\s €]/g, '').replace(',', '.');
  if (!/^[0-9]{1,7}(\.[0-9]{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export const euros = n => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export default {
  id: 'prix', family: 'chiffres', title: 'L’Étiquette', verb: 'Estime',
  rules: ['Cinq objets du quotidien, l’un après l’autre.', 'Tape leur prix en euros, à vue de nez.', 'Le plus petit écart cumulé gagne.'],
  playMs: 50000,
  unit: 'écart moyen au vrai prix',
  eligible: () => true,
  params(seed, i) { return { items: items(seed, i) }; },
  // Écart moyen de 30 % : 5 × ln(1,3).
  ghost: () => ({ key: [Math.round(ITEMS_PER_ROUND * Math.log(1.3) * 100)], label: 'écart 30 %' }),
  tieText: () => 'Égalité à 1 % d’écart près.',
  score(payload, p) {
    const answers = arr(payload && payload.a, ITEMS_PER_ROUND).map(x => num(x, 0, 10000000, 0));
    while (answers.length < ITEMS_PER_ROUND) answers.push(0);
    const errs = p.items.map((it, k) => errorOf(answers[k], it.price));
    const sum = errs.reduce((a, b) => a + b, 0);
    const pct = Math.round((Math.exp(sum / ITEMS_PER_ROUND) - 1) * 100);
    return { idle: answers.every(x => !x), key: [Math.round(sum * 100)], label: `écart ${pct} %`, valid: true, stats: { pct, answers, truth: p.items.map(it => it.price) } };
  },
};
