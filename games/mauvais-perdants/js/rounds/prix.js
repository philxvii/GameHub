// L'Étiquette — estimation de prix, façon jeu télévisé. Cinq produits de supermarché, le même
// pour tout le monde au même instant (horloge du serveur) : 12 s pour écrire son prix, puis
// 4 s d'étiquette rouge avec le vrai prix. L'écart se mesure en rapport (logarithme), comme au
// Nuage. Le plus petit écart cumulé gagne.
//
// Produits et prix : Open Food Facts / Open Prices (données libres, ODbL ; photos CC BY-SA,
// crédit affiché dans le jeu). Prix = médiane des relevés non promotionnels en France depuis
// juin 2024 (au moins 14 relevés par produit), relevés le 27/10/2026.

import { arr, num, roundRng } from './_deps.js';

export const ITEMS_PER_ROUND = 5;
export const GUESS_MS = 12000, SHOW_MS = 4000, LEAD_MS = 600;
export const SLOT_MS = GUESS_MS + SHOW_MS;
export const MISSING = Math.log(4);       // pas de réponse : comme se tromper d'un facteur 4

// [code-barres, produit, marque, contenance, prix médian en euros]
export const CATALOG = [
  ['3017620422003', "Nutella", "Ferrero", "400 g", 3.73],
  ['3017620425035', "Nutella, le grand pot", "Ferrero", "1 kg", 6.68],
  ['3178530410105', "Petites madeleines", "St Michel", "500 g", 2.71],
  ['8076809513753', "Pesto alla Genovese", "Barilla", "190 g", 2.44],
  ['8000300312102', "Crunch, tablette", "Nestlé", "2 × 100 g", 2.75],
  ['5000159560498', "Snickers", "Mars", "5 barres", 2.45],
  ['8000500384794', "Kinder Tronky", "Ferrero", "5 barres", 2.49],
  ['7622210720566', "Chocolat au lait du pays alpin", "Milka", "300 g", 4.59],
  ['8711327374515', "Peanut Butter Cup", "Ben & Jerry’s", "465 ml", 3.68],
  ['8711327370708', "Chocolate Fudge Brownie", "Ben & Jerry’s", "465 ml", 3.9],
  ['8000500385807', "Kinder Duo", "Ferrero", "150 g", 2.95],
  ['7622210601988', "Granola L’Original", "LU", "200 g", 1.71],
  ['3178530402728', "Madeleines pur beurre", "Bonne Maman", "300 g", 3.55],
  ['3329770077003', "Skyr nature", "Yoplait", "800 g", 3.39],
  ['3155251205500', "Beurre doux", "Président", "250 g", 2.76],
  ['7622202028199', "Mikado chocolat noir", "LU", "100 g", 2.19],
  ['3178530404142', "Petits quatre-quarts", "Bonne Maman", "300 g", 3.95],
  ['8712566361601', "Sauce samouraï", "Amora", "255 g", 1.98],
  ['8000500242612', "Schoko-Bons", "Ferrero", "225 g", 4.16],
  ['3228857002351', "American Sandwich complet", "Harrys", "900 g", 2.4],
  ['3176571983008', "Lait demi-écrémé Viva", "Candia", "1 L", 1.37],
  ['3415581101010', "Glace vanille", "Häagen-Dazs", "460 ml", 4.79],
  ['3083681095296', "Ratatouille", "Cassegrain", "380 g", 3.23],
  ['8720182461247', "Moutarde forte", "Amora", "185 g", 1.89],
  ['7622201809638', "Napolitain", "LU", "6 gâteaux", 1.85],
  ['3487400006929', "Riz à la méditerranéenne", "Ben’s Original", "220 g", 1.47],
  ['5053990155354', "Pringles Sour Cream & Onion", "Pringles", "175 g", 1.95],
  ['5000112611861', "Coca-Cola", "Coca-Cola", "1,75 L", 2.41],
  ['8000500025857', "Kinder Bueno", "Ferrero", "129 g", 2.75],
  ['8076800195057', "Spaghetti n° 5", "Barilla", "500 g", 1.19],
  ['5449000283900', "Coca-Cola, le pack", "Coca-Cola", "6 × 33 cl", 4.25],
  ['5410041040807', "Pim’s framboise", "LU", "150 g", 1.69],
  ['3046920027885', "Excellence noir, fleur de sel", "Lindt", "100 g", 2.38],
  ['7622400893094', "Milka Tendre au lait", "Milka", "2 × 100 g", 3.27],
  ['3046920029759', "Excellence 90 % cacao", "Lindt", "100 g", 2.48],
  ['8000500310397', "Nutella Biscuits", "Ferrero", "166 g", 2.52],
  ['3176571744012', "Candy’Up fraise", "Candia", "6 × 20 cl", 2.88],
  ['3415581114713', "Salted Caramel", "Häagen-Dazs", "400 ml", 5.47],
  ['7613034975416', "Extrême Chocolat", "Nestlé", "6 cônes", 4.6],
  ['3033491279713', "Danette chocolat", "Danone", "4 × 125 g", 1.59],
  ['3228021170046', "Emmental râpé", "Président", "200 g", 2.05],
  ['3048282322646', "Lulu l’Ourson chocolat", "LU", "150 g", 1.72],
  ['8711327608665', "Magnum amande", "Magnum", "4 bâtonnets", 3.59],
  ['3083680002929', "Macédoine de légumes", "Bonduelle", "265 g", 0.99],
  ['7622210137258', "Oreo Double Crème", "Oreo", "157 g", 1.47],
  ['8000500267103', "Kinder Délice", "Ferrero", "10 gâteaux", 3.83],
  ['3017760038331', "La Barquette chocolat", "LU", "120 g", 1.45],
];

export function items(seed, i) {
  const r = roundRng(seed, i, 'prix');
  return r.shuffle(CATALOG.map((c, k) => k)).slice(0, ITEMS_PER_ROUND).map(k => {
    const [code, name, brand, qty, price] = CATALOG[k];
    return { code, name, brand, qty, price };
  });
}

// Où en est la manche à l'instant t (ms depuis le départ) : produit k, à estimer ou révélé.
export function slotAt(t) {
  const x = Math.max(0, t - LEAD_MS);
  const k = Math.floor(x / SLOT_MS);
  if (k >= ITEMS_PER_ROUND) return { k: ITEMS_PER_ROUND, done: true };
  const inSlot = x - k * SLOT_MS;
  return { k, reveal: inSlot >= GUESS_MS, left: Math.max(0, Math.ceil((GUESS_MS - inSlot) / 1000)) };
}

export const errorOf = (guess, price) => {
  const g = Number(guess);
  if (!Number.isFinite(g) || g <= 0) return MISSING;
  return Math.min(MISSING, Math.abs(Math.log(g / price)));
};

// « 1,20 € », « 9 500 » : la saisie accepte la virgule, les espaces et le symbole.
export function parsePrice(text) {
  const s = String(text || '').replace(/[\s €]/g, '').replace(',', '.');
  if (!/^[0-9]{1,7}(\.[0-9]{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export const euros = n => `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default {
  id: 'prix', family: 'chiffres', title: 'L’Étiquette', verb: 'Estime',
  rules: ['Un produit de supermarché s’affiche, le même pour tout le monde.', 'Tu as 12 secondes pour écrire son prix, puis l’étiquette tombe.', 'Cinq produits : le plus petit écart cumulé gagne.'],
  playMs: LEAD_MS + ITEMS_PER_ROUND * SLOT_MS + 2000,
  unit: 'écart moyen au vrai prix',
  eligible: () => true,
  params(seed, i) { return { items: items(seed, i) }; },
  // Écart moyen de 25 % : 5 × ln(1,25).
  ghost: () => ({ key: [Math.round(ITEMS_PER_ROUND * Math.log(1.25) * 100)], label: 'écart 25 %' }),
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
