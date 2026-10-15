// Paramètres de Mini Subway. Toutes les valeurs « variables » ou « à calibrer » du cahier
// sont ici (valeurs par défaut) et surchargées carte par carte dans maps.js. Le moteur ne
// contient aucune exception liée au nom d'une carte.
//
// Unités : distances en unités de carte (monde de 1600 × 1000), temps en ticks de
// simulation (TICK_HZ ticks par seconde à vitesse 1×).

export const TICK_HZ = 20;
export const RULES_VERSION = 1;

// Formes : communes (destinations fréquentes) et spéciales (rares, souvent uniques).
export const COMMON_SHAPES = ['circle', 'triangle', 'square'];
export const RARE_SHAPES = ['star', 'diamond', 'pentagon', 'cross', 'egg', 'gem', 'wedge'];
export const SHAPE_NAMES = {
  circle: 'cercle', triangle: 'triangle', square: 'carré', star: 'étoile', diamond: 'losange',
  pentagon: 'pentagone', cross: 'croix', egg: 'œuf', gem: 'gemme', wedge: 'chevron',
};

export const DEFAULTS = {
  world: { w: 1600, h: 1000 },
  limits: {
    startingLines: 3, maxLines: 7, startingLocomotives: 3, startingCrossings: 3,
    startingCarriages: 0, startingHubs: 0, maxLocomotivesPerLine: 4,
  },
  capacity: { station: 6, byShape: {}, train: 6, carriageBonus: 6, interchange: 18 },
  time: { dayTicks: 280, daysPerWeek: 7 },
  overload: {
    threshold: null,          // null = capacité de la station ; sinon seuil fixe
    graceTicks: 760,          // remplissage complet de l'anneau (38 s à 1×)
    recoveryRate: 1.6,        // vitesse de vidange relative quand la file redescend
    pauseWhileServed: true,   // l'anneau ne progresse pas pendant qu'un train est à quai
    warnAt: 0.4,              // seuil d'alerte sonore / visuelle renforcée
  },
  trains: {
    speed: 3.4, accelRatio: 0.18, minDwellTicks: 8, boardTicks: 3, hubBoardTicks: 2,
    transferTicks: 40, hubTransferTicks: 10, waitCost: 50, stopCost: 14,
  },
  // Classes de matériel : multiplicateur de vitesse et places en plus de la rame de base.
  vehicles: { standard: { speed: 1, cap: 0 }, express: { speed: 1.6, cap: 0 }, tram: { speed: 0.75, cap: 2 } },
  growth: {
    enabled: true,
    firstStationTicks: 420, intervalStartTicks: 760, intervalMinTicks: 240, intervalDropPerWeek: 70,
    jitter: 0.3, maxStations: 56, minSpacing: 92, lineClearance: 24, edgeMargin: 46,
    startHalf: [360, 230], growHalfPerWeek: [130, 85],
    rareFromWeek: 2, rareChance: 0.12, maxPerRare: 1, rareShapes: ['star', 'diamond', 'pentagon', 'cross'],
    attempts: 40,
  },
  shapes: { weights: { circle: 6, triangle: 3.3, square: 2.1 } },
  passengers: { intervalTicks: 270, intervalJitter: 0.45, firstDelayTicks: 70, growthPerWeek: 0.18, rareDestWeight: 1.1 },
  rewards: {
    locosPerWeek: 1, locoChoice: null, choices: 2,
    available: ['line', 'carriage', 'crossings', 'hub'],
    carriagesPerReward: 1, crossingsPerReward: 2, hubsPerReward: 1, linesPerReward: 1,
  },
  infinite: { gainPerDelivery: 0.014, lossPerExcess: 0.00005, decay: 0.00002, resetTo: 0.25 },
  modifiers: { shapeChange: null },
  palette: {
    landDay: '#F1EDE3', landNight: '#121821', waterDay: '#BCD7DE', waterNight: '#1D3344',
    parkDay: '#DDE7D0', parkNight: '#17261F',
    lines: ['#E0412F', '#2A6FD6', '#1E9E62', '#F2A516', '#8A4FD3', '#12A7C4', '#E0599A'],
  },
};

// Modes : comportements distincts (cahier §8). Les modes multijoueurs réutilisent ceux-ci.
export const MODES = {
  classic: { id: 'classic', name: 'Classique', lose: true, weekly: true, efficiency: false, locked: false, unlimited: false, stationEdit: false },
  infinite: { id: 'infinite', name: 'Infini', lose: false, weekly: false, efficiency: true, locked: false, unlimited: false, stationEdit: false },
  extreme: { id: 'extreme', name: 'Extrême', lose: true, weekly: true, efficiency: false, locked: true, unlimited: false, stationEdit: false },
  creative: { id: 'creative', name: 'Créatif', lose: false, weekly: false, efficiency: false, locked: false, unlimited: true, stationEdit: true },
};

export const UNLIMITED = 99;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}
