// Déjà vu ? — mémoire verbale. Un mot à la fois : « Déjà vu » ou « Nouveau ».
// Le flot de mots est FIXÉ par la graine et ne dépend pas des réponses : tout le
// monde voit la même suite, dans le même ordre. 3 erreurs et c'est fini.

import { arr, int, roundRng, fold } from './_deps.js';

export const LIVES = 3, LENGTH = 120;

// Banque originale : noms communs concrets, faciles à lire, sans quasi-doublons.
export const WORDS = (
  'abeille ancre ardoise armoire artichaut assiette autruche avion baignoire balai baleine ballon banane ' +
  'banc barque bateau béret bibelot bijou biscuit bocal bougie bouilloire boussole bouteille brosse ' +
  'brouette buffet cabane cactus cadenas cafetière caillou calèche camion canard canapé carafe carotte ' +
  'cartable casque casserole castor cerise chaise chameau chapeau château chaussette cheminée chenille ' +
  'chouette cigale citron clairon clocher coffre colibri comète concombre coquillage corbeau cornichon ' +
  'couronne crayon crocodile cuillère dauphin dé dentelle diamant dindon dragon écharpe échelle écureuil ' +
  'éléphant enclume éponge escargot étoile éventail falaise fauteuil fenêtre fléchette flûte fontaine ' +
  'fourchette fourmi framboise fromage fusée gâteau gant girafe glaçon gondole gorille grenouille grille ' +
  'guitare hamac hamster harpe hérisson hibou horloge iguane igloo jardin jonquille jupe kangourou kiwi ' +
  'lampe lanterne lapin lavabo libellule limace lion loupe lune lutin mandarine manteau marmite marteau ' +
  'masque méduse melon menhir miroir moufle moulin mouton navet nuage oignon orange orchidée ours ' +
  'palmier panier pantoufle papillon parapluie passoire pastèque peigne pélican perroquet phare piano ' +
  'pinceau pingouin pirogue placard planète plume poire poireau poivron pomme potiron poubelle poussin ' +
  'radeau radis raquette renard requin robinet roseau sablier sandale sapin sardine sauterelle savon ' +
  'scooter serpent sifflet singe sirène soucoupe statue tabouret tambour tapis taupe téléphone tortue ' +
  'toupie tracteur train trampoline trompette tulipe valise vélo violon volcan wagon yaourt zèbre'
).split(' ');

// Suite déterministe : après 4 mots, ~45 % de répétitions d'un mot déjà montré
// (jamais le mot précédent), sinon un mot neuf.
export function stream(seed, i) {
  const r = roundRng(seed, i, 'dejavu');
  const fresh = r.shuffle(WORDS);
  const shown = [];
  const out = [];
  for (let k = 0; k < LENGTH; k++) {
    const canRepeat = shown.length >= 4;
    if (canRepeat && (r() < 0.45 || !fresh.length)) {
      let w;
      do { w = r.pick(shown); } while (w === out[out.length - 1].w && shown.length > 1);
      out.push({ w, seen: true });
    } else {
      const w = fresh.pop();
      shown.push(w);
      out.push({ w, seen: false });
    }
  }
  return out;
}

export function replay(answers, words) {
  let lives = LIVES, correct = 0, errors = 0;
  for (let k = 0; k < answers.length && k < words.length && lives > 0; k++) {
    if (answers[k] === (words[k].seen ? 1 : 0)) correct++;
    else { errors++; lives--; }
  }
  return { correct, errors, lives };
}

export default {
  id: 'dejavu', family: 'memoire', title: 'Déjà vu ?', verb: 'Reconnais',
  rules: ['Un mot s’affiche. Se l’est-on déjà montré plus tôt dans cette manche ? Oui : touche « Déjà vu ». Non, c’est la première fois : touche « Nouveau ».', 'Exemple : pomme, chaise, pomme → Nouveau (jamais vu), Nouveau (jamais vu), Déjà vu (pomme est déjà passé). Le tout premier mot est toujours « Nouveau ».', '3 erreurs et c’est fini. Le plus de bonnes réponses gagne.'],
  playMs: 60000,
  unit: 'bonnes réponses',
  eligible: () => true,
  params(seed, i) { return { words: stream(seed, i), lives: LIVES }; },
  ghost: () => ({ key: [-20, 2, 100], label: '20 bonnes' }),
  tieText: () => 'À score égal, moins d’erreurs, puis le plus rapide.',
  score(payload, p) {
    const answers = arr(payload && payload.a, LENGTH).map(x => (x === 1 || x === true ? 1 : 0));
    const res = replay(answers, p.words);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    return { idle: !answers.length, key: [-res.correct, res.errors, Math.round(ms / 500)], label: `${res.correct} bonnes`, valid: true, stats: res };
  },
};

export const _fold = fold;   // pour les tests : unicité de la banque après normalisation
