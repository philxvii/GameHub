// La Question — culture générale, façon jeu télé. Dix questions à quatre réponses, les mêmes pour tous,
// dans le même ordre ; les réponses sont mélangées par la graine. Une bonne réponse = un point ; à égalité,
// le temps cumulé sur les bonnes réponses (le plus court gagne). Une erreur ne coûte rien de plus, mais pas de
// seconde chance : la question suivante arrive. Le temps est mesuré sur l'appareil.

import { arr, int, roundRng } from './_deps.js';

export const QUESTIONS = 10, LIMIT_MS = 12000, MIN_MS = 250;

// [question, bonne réponse, trois fausses réponses]
export const BANK = [
  ['Quelle est la capitale de l’Australie ?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['Combien de côtés a un hexagone ?', '6', '5', '7', '8'],
  ['Quel est le plus grand océan du monde ?', 'Le Pacifique', 'L’Atlantique', 'L’océan Indien', 'L’Arctique'],
  ['Qui a peint la Joconde ?', 'Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Botticelli'],
  ['En quelle année a eu lieu la Révolution française ?', '1789', '1769', '1799', '1815'],
  ['Quelle planète est la plus proche du Soleil ?', 'Mercure', 'Vénus', 'Mars', 'Jupiter'],
  ['Quel est le symbole chimique de l’or ?', 'Au', 'Ag', 'Or', 'Go'],
  ['Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?', '11', '9', '10', '12'],
  ['Quelle langue compte le plus de locuteurs natifs dans le monde ?', 'Le mandarin', 'L’anglais', 'L’espagnol', 'L’hindi'],
  ['Quel fleuve traverse Paris ?', 'La Seine', 'La Loire', 'Le Rhône', 'La Garonne'],
  ['Quel est le plus haut sommet des Alpes ?', 'Le mont Blanc', 'Le Cervin', 'L’Eiger', 'La Meije'],
  ['Combien de jours compte une année bissextile ?', '366', '365', '364', '367'],
  ['Qui a écrit « Les Misérables » ?', 'Victor Hugo', 'Émile Zola', 'Alexandre Dumas', 'Gustave Flaubert'],
  ['Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Le dioxyde de carbone', 'L’oxygène', 'L’azote', 'L’hélium'],
  ['Quelle est la monnaie du Japon ?', 'Le yen', 'Le won', 'Le yuan', 'Le baht'],
  ['De quel pays Lisbonne est-elle la capitale ?', 'Le Portugal', 'L’Espagne', 'L’Italie', 'La Grèce'],
  ['Combien de cordes a une guitare classique ?', '6', '4', '5', '7'],
  ['Qui a écrit « Le Petit Prince » ?', 'Antoine de Saint-Exupéry', 'Jules Verne', 'Albert Camus', 'Marcel Pagnol'],
  ['En quelle année l’homme a-t-il marché sur la Lune pour la première fois ?', '1969', '1965', '1972', '1959'],
  ['Quelle couleur obtient-on en mélangeant du bleu et du jaune ?', 'Le vert', 'L’orange', 'Le violet', 'Le marron'],
  ['Quel instrument a des touches noires et blanches ?', 'Le piano', 'Le violon', 'La flûte', 'La trompette'],
  ['Combien de minutes dans une heure et demie ?', '90', '80', '100', '120'],
  ['Quelle ville est surnommée la Ville lumière ?', 'Paris', 'Lyon', 'Marseille', 'Rome'],
  ['Quel est le plus long fleuve de France ?', 'La Loire', 'La Seine', 'Le Rhône', 'La Garonne'],
  ['Quel mammifère pond des œufs ?', 'L’ornithorynque', 'Le dauphin', 'La chauve-souris', 'Le kangourou'],
  ['Combien font 12 × 12 ?', '144', '124', '122', '148'],
  ['Qui fut le premier président de la Ve République ?', 'Charles de Gaulle', 'Georges Pompidou', 'René Coty', 'Vincent Auriol'],
  ['Quelle est la capitale du Canada ?', 'Ottawa', 'Toronto', 'Montréal', 'Vancouver'],
  ['Quel élément chimique a pour symbole O ?', 'L’oxygène', 'L’or', 'L’osmium', 'L’ozone'],
  ['Quel peintre s’est coupé une partie de l’oreille ?', 'Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Paul Cézanne'],
  ['Dans quel pays se trouve la tour de Pise ?', 'L’Italie', 'La France', 'L’Espagne', 'La Grèce'],
  ['Quel est le plus petit nombre premier ?', '2', '1', '3', '0'],
  ['Quelle mer borde Marseille ?', 'La Méditerranée', 'L’Atlantique', 'La Manche', 'La mer du Nord'],
  ['Quel sport se joue à Roland-Garros ?', 'Le tennis', 'Le golf', 'Le rugby', 'Le cyclisme'],
  ['Quel célèbre paquebot a coulé en 1912 ?', 'Le Titanic', 'Le Lusitania', 'Le Bismarck', 'Le Mayflower'],
  ['De quelle couleur est un rubis ?', 'Rouge', 'Bleu', 'Vert', 'Jaune'],
  ['Combien de planètes compte le système solaire ?', '8', '9', '7', '10'],
  ['Qui a créé le détective Sherlock Holmes ?', 'Arthur Conan Doyle', 'Agatha Christie', 'Edgar Poe', 'Jules Verne'],
  ['Quelle est la capitale de l’Espagne ?', 'Madrid', 'Barcelone', 'Séville', 'Valence'],
  ['Quel est le plus grand désert chaud du monde ?', 'Le Sahara', 'Le Gobi', 'Le Kalahari', 'L’Atacama'],
  ['Quelle est la formule chimique de l’eau ?', 'H₂O', 'CO₂', 'O₂', 'NaCl'],
  ['Quel pays a remporté la Coupe du monde de football en 1998 ?', 'La France', 'Le Brésil', 'L’Italie', 'L’Allemagne'],
  ['Quel est l’animal terrestre le plus rapide sur de courtes distances ?', 'Le guépard', 'Le lion', 'Le lévrier', 'Le cheval'],
  ['Quel compositeur a écrit « Les Quatre Saisons » ?', 'Vivaldi', 'Mozart', 'Bach', 'Beethoven'],
  ['Quelle est la plus grande planète du système solaire ?', 'Jupiter', 'Saturne', 'Neptune', 'Uranus'],
  ['Dans quel pays se trouve le Machu Picchu ?', 'Le Pérou', 'Le Mexique', 'La Bolivie', 'Le Chili'],
  ['Quelle grandeur mesure un thermomètre ?', 'La température', 'La pression', 'L’humidité', 'La vitesse du vent'],
  ['Quelle est la capitale de l’Italie ?', 'Rome', 'Milan', 'Naples', 'Venise'],
  ['Qui a découvert la pénicilline ?', 'Alexander Fleming', 'Louis Pasteur', 'Marie Curie', 'Robert Koch'],
  ['Dans quel pays se tient le carnaval de Rio ?', 'Le Brésil', 'L’Argentine', 'Le Portugal', 'La Colombie'],
  ['Combien font 7 × 8 ?', '56', '54', '48', '63'],
  ['Quelle est la plus haute montagne du monde ?', 'L’Everest', 'Le K2', 'Le Kilimandjaro', 'Le mont Blanc'],
  ['Quel est l’animal le plus lourd du monde ?', 'La baleine bleue', 'L’éléphant d’Afrique', 'Le requin-baleine', 'La girafe'],
  ['Quelle monnaie utilise l’Allemagne aujourd’hui ?', 'L’euro', 'Le mark', 'Le franc', 'La livre'],
];

// Dix questions tirées de la graine, réponses mélangées : { q, c: [4 réponses], a: indice de la bonne }.
export function questions(seed, i) {
  const r = roundRng(seed, i, 'quiz');
  return r.shuffle(BANK.map((_, k) => k)).slice(0, QUESTIONS).map(k => {
    const [q, good, ...bad] = BANK[k];
    const order = r.shuffle([0, 1, 2, 3]);
    const all = [good, ...bad];
    return { q, c: order.map(o => all[o]), a: order.indexOf(0) };
  });
}

export default {
  id: 'quiz', family: 'vitesse', title: 'La Question', verb: 'Réponds',
  rules: ['Une question, quatre réponses : touche la bonne.', 'Dix questions, les mêmes pour tout le monde. Pas de seconde chance.', 'Le plus de bonnes réponses gagne ; à égalité, le plus rapide.'],
  playMs: 130000,
  unit: 'bonnes réponses, puis temps sur les bonnes',
  eligible: () => true,
  params(seed, i) { return { qs: questions(seed, i), limit: LIMIT_MS }; },
  ghost: () => ({ key: [-6, 560], label: '6 bonnes réponses' }),
  tieText: () => 'Égalité au dixième de seconde sur les bonnes réponses.',
  score(payload, p) {
    const a = arr(payload && payload.a, QUESTIONS).map(x => int(x, -1, 3, -1));
    const t = arr(payload && payload.t, QUESTIONS).map(x => int(x, MIN_MS, LIMIT_MS, LIMIT_MS));
    let good = 0, ms = 0;
    p.qs.forEach((q, k) => { if (a[k] === q.a) { good++; ms += t[k] === undefined ? LIMIT_MS : t[k]; } });
    const idle = a.every(x => x < 0);
    return { idle, key: [-good, Math.round(ms / 100)], label: `${good} bonne${good > 1 ? 's' : ''} réponse${good > 1 ? 's' : ''}`, valid: true, stats: { good, ms } };
  },
};
