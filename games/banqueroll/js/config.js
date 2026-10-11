// Configuration de partie : quelles mecaniques sont actives. Module PUR.
//
// La configuration est choisie par le createur et ecrite UNE fois dans
// game.gameConfig, puis jamais modifiee (la revanche la recopie telle quelle).
// Une partie sans gameConfig (creee avant ce systeme) est CLASSIQUE.
//
// Ajouter une mecanique : une entree dans MECHANICS (OFF par defaut, donc OFF
// en Classique), puis l'ajouter aux presets qui doivent l'activer. Le moteur
// interroge on(game, cle) : il n'y a pas d'autre interrupteur ailleurs.

export const MECHANICS = [
  // Interactions et spectacle
  { key:'reactions',        icon:'🍅', label:'Réactions rapides',  family:'show',    desc:'Tomates, pièces, couronnes et clowns lancés sur les fiches.' },
  { key:'extendedAuctions', icon:'🔨', label:'Enchères tendues',   family:'show',    desc:'Prolongation de dernière seconde, « Je passe », historique des offres.' },
  { key:'eventMinigames',   icon:'⚡', label:'Mini-jeux EVENT',    family:'show',    desc:'La case EVENT lance un mini-jeu pour toute la table. Le dernier paie.' },
  { key:'duel',             icon:'🤺', label:'Duels',              family:'show',    desc:'Deux pions sur la même case : duel de réflexe, 50 $ en jeu.' },
  { key:'betting',          icon:'🎲', label:'Paris',              family:'show',    desc:'Pendant le tour d’un autre, mise sur loyer, prison ou 6.' },
  { key:'hostDeals',        icon:'🤝', label:'Pactes du présentateur', family:'show', desc:'Le présentateur propose un marché risqué. 12 secondes pour répondre.' },
  { key:'testament',        icon:'📜', label:'Testament',          family:'show',    desc:'En faillite, tu choisis qui hérite de tes biens : la banque ou un joueur.' },
  { key:'ghost',            icon:'👻', label:'Fantômes',           family:'show',    desc:'Les joueurs en faillite restent et hantent une case par manche.' },
  { key:'secretBonuses',    icon:'🏅', label:'Primes secrètes',    family:'show',    desc:'Trois primes de 300 $ révélées à la fin. Le classement peut basculer.' },
  // Economie
  { key:'moneyTime',        icon:'⏱️', label:'Money Time',         family:'economy', desc:'Fin de partie : loyers doublés (3 dernières manches ou 80 % de l’objectif).' },
  { key:'blueShell',        icon:'🎯', label:'Carapace du leader', family:'economy', desc:'Cartes Chance rares qui frappent le joueur en tête.' },
  { key:'marketCrash',      icon:'📈', label:'Bulle et krach',     family:'economy', desc:'Un groupe voit ses loyers ×2 ou ÷2 pendant 2 manches.' },
];
export const MECHANIC_KEYS = MECHANICS.map(m => m.key);

const all = () => MECHANIC_KEYS.slice();
const show = () => MECHANICS.filter(m => m.family === 'show').map(m => m.key);

export const PRESETS = {
  classic: { icon:'🎲', label:'Classique', tagline:'Banqueroll tel quel. Aucune nouvelle mécanique.', keys: [] },
  party:   { icon:'🎭', label:'Party',     tagline:'Interactions, mini-jeux et spectacle. L’économie reste sage.', keys: [...show(), 'moneyTime'] },
  chaos:   { icon:'🔥', label:'Chaos',     tagline:'Tout est activé. Personne n’est à l’abri.', keys: all() },
  custom:  { icon:'⚙️', label:'Personnalisé', tagline:'Tu choisis chaque mécanique.', keys: null },
};
export const PRESET_ORDER = ['classic', 'chaos', 'party', 'custom'];

// Construit la configuration figee d'une nouvelle partie.
export function makeConfig(preset = 'classic', picks = []) {
  const p = PRESETS[preset] ? preset : 'classic';
  const keys = p === 'custom' ? picks.filter(k => MECHANIC_KEYS.includes(k)) : PRESETS[p].keys;
  const config = { preset: p };
  MECHANIC_KEYS.forEach(k => { config[k] = keys.includes(k); });
  return config;
}

// Lecture normalisee : absente ou incomplete -> les cles manquantes valent OFF.
export function gameConfig(game) {
  const raw = (game && game.gameConfig) || null;
  if (!raw) return makeConfig('classic');
  const config = { preset: PRESETS[raw.preset] ? raw.preset : 'custom' };
  MECHANIC_KEYS.forEach(k => { config[k] = raw[k] === true; });
  return config;
}

export const on = (game, key) => gameConfig(game)[key] === true;
export const activeMechanics = game => MECHANICS.filter(m => on(game, m.key));
export const isClassic = game => activeMechanics(game).length === 0;
