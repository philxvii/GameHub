// Le Petit Bac — manche signature. Une lettre, quatre catégories, un chrono commun.
// Le CODE vérifie : réponse présente, longueur, première lettre (sans article ni
// accent), doublons. Le CORRECTEUR IA ne juge que l'appartenance à la catégorie des
// réponses qui ont passé ces contrôles. Le code applique ensuite le barème annoncé :
// valide et unique 10, valide mais partagée 5, sinon 0. Voir js/petitbac.js.

import { roundRng } from './_deps.js';

export const LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('');     // sans K Q W X Y Z : trop rares
// Catégories retenues parce qu'elles se corrigent de façon fiable ; exclues : couleurs,
// célébrités, marques, films (trop contestables ou trop datés).
export const CATEGORIES = [
  'Pays', 'Ville', 'Animal', 'Fruit ou légume', 'Métier', 'Prénom',
  'Objet de la maison', 'Sport ou loisir', 'Plat ou aliment', 'Vêtement ou accessoire', 'Partie du corps',
  'Boisson', 'Instrument de musique', 'Moyen de transport', 'Meuble', 'Outil', 'Fleur ou arbre',
  'Dessert ou pâtisserie', 'Fleuve ou montagne', 'Ustensile de cuisine',
];
export const SLOTS = 4;
export const POINTS = { unique: 10, shared: 5, none: 0 };

export default {
  id: 'bac', family: 'mots', title: 'Le Petit Bac', verb: 'Écris',
  rules: ['Une lettre, quatre catégories : un mot par case.', 'Valide et unique : 10. Valide mais trouvée par un autre : 5.', 'Correction par IA ; une réponse douteuse passe au vote (deux refus et la majorité pour la refuser).'],
  playMs: 70000,
  unit: 'points de Petit Bac',
  // En solo, sans correcteur IA, personne ne pourrait refuser une réponse : retiré du tirage.
  eligible: room => !(room.solo && !room.ai),
  params(seed, i) {
    const r = roundRng(seed, i, 'bac');
    return { letter: r.pick(LETTERS), cats: r.shuffle(CATEGORIES).slice(0, SLOTS) };
  },
  tieText: () => 'À points égaux, le plus de réponses valides.',
  // Le score du Petit Bac dépend de la correction : voir petitbac.js (scoreBac).
  score: null,
};
