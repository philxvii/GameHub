// Cartes de regles montrees au lancement d'une partie, avant le premier lancer. Module PUR.
//
// Toujours les bases (3 cartes), puis une carte par mecanique active de gameConfig.
// Les chiffres viennent des constantes du moteur : une regle qui change change sa carte.
// Le premier tour attend que chaque humain ait clique « Pret » ou que BRIEF_MS soit ecoule.

import { on, MECHANICS } from './config.js';
import { roundsOf, targetOf, START_BONUS, BAIL, JAIL_TURNS, SELL_RATIO, BANKRUPT_CASH, SWAP_BONUS,
  RENT_BUILDINGS, PUBLIC_BASE_RENT } from './rules.js';
import { HAUNT_PENALTY, BET_KINDS, BET_STAKES, DEALS, DEAL_MS, WILL_MS, BONUSES, BONUS_VALUE } from './party.js';
import { PENALTY, DUEL_STAKE, MINIGAMES } from './minigames.js';

export const BRIEF_MS = 60000;

const fmt = n => `${n} $`;   // espace insecable : « 20 $ » ne se coupe pas
const sec = ms => `${Math.round(ms / 1000)} s`;

// Les mecaniques les moins evidentes d'abord.
const ORDER = ['betting', 'eventMinigames', 'duel', 'hostDeals', 'moneyTime', 'marketCrash', 'blueShell',
  'testament', 'ghost', 'secretBonuses', 'extendedAuctions', 'reactions'];

const MECHANIC_CARDS = {
  betting: () => [
    'Pendant le tour d’un autre joueur, mise ' + BET_STAKES.map(fmt).join(' ou ') + ' sur ce qui va lui arriver :',
    ...Object.values(BET_KINDS).map(k => `• il ${k.label} : ta mise ×${k.odds}`),
    'Un pari par lancer. Les paris ferment quand il lance le dé. Raté = mise perdue.',
  ],
  eventMinigames: () => [
    'La case EVENT lance souvent un mini-jeu de quelques secondes pour toute la table.',
    `Au programme : ${Object.values(MINIGAMES).map(m => m.label.toLowerCase()).join(', ')}.`,
    `La règle s’affiche avant le départ. Le dernier paie ${fmt(PENALTY)}, partagés entre les autres.`,
  ],
  duel: () => [
    'Tu t’arrêtes sur la case d’un autre pion : duel de réflexe.',
    `Le perdant donne ${fmt(DUEL_STAKE)} au gagnant.`,
  ],
  hostDeals: () => [
    'Avant ton lancer, le présentateur peut te proposer un pacte :',
    ...Object.values(DEALS).map(d => `• « ${d.label} » : +${fmt(d.reward)} si tu réussis, −${fmt(d.penalty)} sinon`),
    `${sec(DEAL_MS)} pour accepter. Sans réponse, c’est non.`,
  ],
  moneyTime: () => [
    'Dans les 3 dernières manches, ou dès qu’un joueur atteint 80 % de l’objectif :',
    'tous les loyers sont doublés jusqu’à la fin.',
  ],
  marketCrash: () => [
    'La case EVENT peut aussi secouer un groupe de villes pendant 2 manches :',
    '• bulle : ses loyers ×2',
    '• krach : ses loyers ÷2',
  ],
  blueShell: () => [
    'Des cartes Chance rares visent le joueur en tête :',
    '• Contrôle fiscal : il perd 15 % de son argent',
    '• Squat : celui qui tire encaisse le loyer de sa plus belle ville',
  ],
  testament: () => [
    'En faillite, tu choisis qui hérite de tes villes et de tes bâtiments : un joueur ou la banque.',
    `${sec(WILL_MS)} pour choisir, sinon tout va à la banque.`,
  ],
  ghost: () => [
    'Éliminé, tu restes en fantôme : une fois par manche, tu hantes une case (ni le Départ ni la prison).',
    `Le prochain qui s’y arrête perd ${fmt(HAUNT_PENALTY)}.`,
  ],
  secretBonuses: () => [
    `Trois primes de ${fmt(BONUS_VALUE)}, révélées à la fin :`,
    ...BONUSES.map(b => `• ${b.label} : ${b.desc.charAt(0).toLowerCase()}${b.desc.slice(1)}`),
    'Le classement peut basculer au dernier moment.',
  ],
  extendedAuctions: () => [
    'Une offre dans les 5 dernières secondes rajoute 5 s.',
    '« Je passe » te retire de l’enchère ; quand tous les autres ont passé, c’est adjugé.',
  ],
  reactions: () => [
    'Lance tomates, pièces, couronnes ou clowns sur la fiche d’un joueur, à tout moment.',
    'Gratuit, juste pour le fun.',
  ],
};

// Les bases : objectif et tour, villes, cases speciales et faillite.
function baseCards(game) {
  const max = roundsOf(game), target = targetOf(game);
  const mini = on(game, 'eventMinigames'), will = on(game, 'testament');
  return [
    { key: 'goal', icon: '🎯', title: 'Le but', lines: [
      `Premier à ${fmt(target)} de fortune nette${max ? `, ou le plus riche après ${max} manches` : ''}.`,
      'Fortune nette = argent + villes + bâtiments.',
      `Un seul dé ; un 6 fait rejouer. Passer par le Départ rapporte ${fmt(START_BONUS)}.`,
    ] },
    { key: 'cities', icon: '🏙️', title: 'Villes et loyers', lines: [
      'Tombe sur une ville libre : achète-la, ou laisse-la partir aux enchères.',
      `Groupe complet = loyer ×2. Ensuite, construis au début de ton tour : ×${RENT_BUILDINGS.join(', ×')}.`,
      `Gares, aéroports, ports : ${fmt(PUBLIC_BASE_RENT)} × le nombre que tu possèdes.`,
      `Revente à ${Math.round(SELL_RATIO * 100)} % pendant ton tour.`,
    ] },
    { key: 'squares', icon: '🃏', title: 'Cases spéciales', lines: [
      'Chance : une carte, un dilemme ou la roue.',
      mini ? 'Event : un mini-jeu, ou un coup du sort à 100–160 $.' : 'Event : gain ou perte de 100 à 160 $.',
      `Prison : ${JAIL_TURNS} tours, ou ${fmt(BAIL)} de caution, sans perdre ton tour.`,
      `Auction : échange de villes, +${fmt(SWAP_BONUS)} pour chacun.`,
      `Faillite sous ${fmt(BANKRUPT_CASH)} ou à 0 de fortune : ${will ? 'tu fais ton testament' : 'tes villes retournent à la banque'}.`,
    ] },
  ];
}

export function briefingCards(game) {
  const mech = ORDER.filter(k => on(game, k)).map(k => {
    const m = MECHANICS.find(x => x.key === k);
    return { key: k, icon: m.icon, title: m.label, lines: MECHANIC_CARDS[k](), special: true };
  });
  return [...baseCards(game), ...mech];
}

// Etat du briefing : { endAt, ready: { id: true } }. Absent = la partie tourne.
export const briefingActive = game => !!(game && game.phase === 'playing' && game.briefing);
const waitingFor = game => (game.players || []).filter(p => p && !p.bot && !p.bankrupt);
export function briefingDone(game, now = Date.now()) {
  const b = game.briefing;
  if (!b) return true;
  const ready = b.ready || {};
  return now >= (b.endAt || 0) || waitingFor(game).every(p => ready[p.id]);
}
export const briefingPending = game => waitingFor(game).filter(p => !((game.briefing && game.briefing.ready) || {})[p.id]);
