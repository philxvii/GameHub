// Cartes originales de Mini Subway : données seules. Chaque carte surcharge DEFAULTS
// (params.js) ; la géographie est décrite par quelques points de contrôle lissés.
//
// water : { river: [[x,y]...], width } | { area: [[x,y]...] } (zone fermée lissée)
// land  : îles (zones fermées) qui annulent l'eau qui les recouvre
// parks : zones fermées où aucune station n'apparaît (les lignes peuvent les traverser)

import { DEFAULTS, deepMerge } from './params.js';
import { riverPolygon, catmull, pointInPoly, bbox } from './geom.js';

export const MAPS = [
  {
    id: 'val-dorme', name: "Val-d'Orme", tagline: 'Une rivière paresseuse coupe la ville en deux.',
    center: [790, 480],
    start: [{ x: 690, y: 430, shape: 'circle' }, { x: 905, y: 392, shape: 'triangle' }, { x: 800, y: 690, shape: 'square' }],
    water: [
      { river: [[-80, 620], [250, 566], [520, 604], [770, 548], [1010, 476], [1250, 522], [1680, 470]], width: [44, 64] },
      { area: [[1170, 180], [1290, 160], [1350, 236], [1288, 306], [1180, 286]] },
    ],
    parks: [[[330, 240], [470, 214], [520, 318], [384, 352]], [[560, 780], [690, 800], [660, 880], [540, 860]]],
    palette: { lines: ['#E0412F', '#2A6FD6', '#1E9E62', '#F2A516', '#8A4FD3', '#12A7C4', '#E0599A'] },
  },
  {
    id: 'baie-brumes', name: 'Baie des Brumes', tagline: 'Un port ouvert sur la mer, et une île qui attend son métro.',
    center: [740, 470],
    start: [{ x: 620, y: 470, shape: 'circle' }, { x: 850, y: 350, shape: 'triangle' }, { x: 790, y: 610, shape: 'square' }],
    water: [{ area: [[1180, -120], [1760, -120], [1760, 1120], [640, 1120], [720, 930], [930, 830], [1050, 660], [960, 540], [1100, 430], [1070, 240]] }],
    land: [[[1300, 390], [1430, 370], [1490, 470], [1410, 572], [1296, 548], [1250, 470]]],
    parks: [[[420, 200], [560, 180], [590, 270], [450, 300]]],
    palette: { waterDay: '#B7D3E3', landDay: '#F2EEE6', lines: ['#D94436', '#1F7AC8', '#2DA35A', '#EFA81C', '#0BB0C4', '#9B59D0', '#F07A3A'] },
    limits: { startingCrossings: 2 },
  },
  {
    id: 'delta-sauge', name: 'Delta Sauge', tagline: 'Deux bras de fleuve, des quartiers qui changent de visage.',
    center: [800, 450],
    start: [{ x: 615, y: 330, shape: 'circle' }, { x: 1000, y: 320, shape: 'triangle' }, { x: 790, y: 650, shape: 'square' }],
    water: [
      { river: [[860, -80], [842, 150], [806, 320], [792, 440]], width: 46 },
      { river: [[792, 440], [650, 560], [470, 700], [300, 900], [210, 1080]], width: [44, 70] },
      { river: [[792, 440], [930, 580], [1080, 700], [1240, 880], [1340, 1080]], width: [44, 70] },
    ],
    parks: [[[1180, 200], [1300, 190], [1320, 290], [1200, 300]]],
    palette: { landDay: '#F0EEE2', waterDay: '#C2DAD2', lines: ['#C8402E', '#2F6DB5', '#3A9A4E', '#E9A21B', '#7D52C4', '#17A0B4', '#D2568E'] },
    limits: { startingCrossings: 4 },
    growth: { rareFromWeek: 1, rareShapes: ['star', 'diamond', 'pentagon', 'gem', 'egg'] },
    rewards: { locoChoice: { standard: 2, express: 1 } },
    modifiers: { shapeChange: { everyWeeks: 3, firstWeek: 3 } },
  },
  {
    id: 'haut-plateau', name: 'Haut-Plateau', tagline: 'Pas une goutte d’eau, mais une ville dense et pressée.',
    center: [800, 500], unlock: { any: true, mode: 'classic', score: 350 },
    start: [{ x: 720, y: 455, shape: 'circle' }, { x: 900, y: 530, shape: 'triangle' }, { x: 805, y: 335, shape: 'square' }],
    water: [],
    parks: [
      [[300, 300], [470, 260], [520, 400], [360, 450]],
      [[1060, 220], [1210, 240], [1220, 360], [1080, 360]],
      [[640, 700], [820, 690], [860, 800], [660, 830]],
    ],
    palette: { landDay: '#F3EEE6', parkDay: '#D7E4C9', lines: ['#DB3B3B', '#2B66C9', '#25996A', '#F0A020', '#8F4CC9', '#E0599A', '#3F4A5A'] },
    limits: { startingLines: 2, maxLines: 6, startingCrossings: 0 },
    capacity: { station: 5 },
    growth: { intervalStartTicks: 540, intervalMinTicks: 170 },
    rewards: { available: ['line', 'carriage', 'hub'] },
  },
  {
    id: 'archipel-corail', name: 'Archipel Corail', tagline: 'Des îles, des ponts, et des rames étroites.',
    center: [800, 500], unlock: { map: 'baie-brumes', mode: 'classic', score: 350 },
    start: [{ x: 700, y: 470, shape: 'circle' }, { x: 905, y: 445, shape: 'triangle' }, { x: 800, y: 585, shape: 'square' }],
    water: [{ area: [[-200, -200], [1800, -200], [1800, 1200], [-200, 1200]], raw: true }],
    land: [
      [[560, 380], [760, 330], [1000, 360], [1080, 480], [980, 640], [760, 680], [580, 600], [520, 480]],
      [[200, 160], [400, 140], [450, 280], [300, 360], [180, 290]],
      [[1180, 180], [1400, 170], [1450, 330], [1300, 420], [1170, 320]],
      [[180, 690], [400, 660], [450, 820], [300, 900], [160, 820]],
      [[1170, 680], [1400, 650], [1460, 820], [1280, 900], [1160, 820]],
      [[700, 790], [880, 780], [900, 900], [720, 920]],
    ],
    palette: { waterDay: '#AED3DC', landDay: '#F4EEDF', parkDay: '#DCE5C8', lines: ['#E2533A', '#2669C2', '#16956C', '#F2B01E', '#7A4FC7', '#0C9DB8', '#DC5390'] },
    limits: { startingCrossings: 4 },
    capacity: { train: 4 },
    growth: { minSpacing: 84, startHalf: [380, 250] },
    rewards: { carriagesPerReward: 2 },
  },
  {
    id: 'lagune-haute', name: 'Lagune Haute', tagline: 'Une ville en anneau autour de sa lagune.',
    center: [800, 490], unlock: { map: 'delta-sauge', mode: 'classic', score: 350 },
    start: [
      { x: 545, y: 430, shape: 'circle' }, { x: 1060, y: 410, shape: 'triangle' }, { x: 800, y: 735, shape: 'square' },
      { x: 805, y: 250, shape: 'circle' }, { x: 560, y: 640, shape: 'triangle' },
    ],
    water: [{ area: [[690, 370], [900, 350], [990, 470], [905, 610], [715, 630], [630, 500]] }],
    parks: [[[1150, 640], [1300, 620], [1320, 740], [1180, 760]]],
    palette: { waterDay: '#BBD6E2', lines: ['#D64A3A', '#2E72CF', '#2D9C5C', '#EDA519', '#8650CC', '#14A5BE', '#E25C98'] },
    limits: { maxLines: 6, startingCrossings: 2 },
    growth: { rareFromWeek: 1 },
    rewards: { locosPerWeek: 2 },
    vehicleClass: 'tram',
  },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));

// Assemble la configuration complète d'une partie : défauts + carte + modificateurs de
// défi, puis géométrie générée (polygones d'eau, d'îles, de parcs).
export function buildConfig(mapId, patch = null) {
  const m = MAP_BY_ID[mapId];
  if (!m) throw new Error('carte inconnue : ' + mapId);
  let cfg = deepMerge(DEFAULTS, {
    id: m.id, name: m.name, center: m.center, start: m.start,
    limits: m.limits || {}, capacity: m.capacity || {}, growth: m.growth || {}, rewards: m.rewards || {},
    modifiers: m.modifiers || {}, palette: m.palette || {}, vehicleClass: m.vehicleClass || 'standard',
  });
  if (patch) cfg = deepMerge(cfg, patch);
  cfg.water = (m.water || []).map(w => (w.river ? riverPolygon(w.river, w.width) : w.raw ? w.area.flat() : catmull(w.area, 8, true)));
  cfg.land = (m.land || []).map(p => catmull(p, 8, true));
  cfg.parks = (m.parks || []).map(p => catmull(p, 8, true));
  cfg.waterBox = cfg.water.map(bbox);
  return cfg;
}

export function inWater(cfg, x, y) {
  let wet = false;
  for (let i = 0; i < cfg.water.length && !wet; i++) {
    const b = cfg.waterBox[i];
    if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && pointInPoly(x, y, cfg.water[i])) wet = true;
  }
  if (!wet) return false;
  for (const l of cfg.land) if (pointInPoly(x, y, l)) return false;
  return true;
}

export const inPark = (cfg, x, y) => cfg.parks.some(p => pointInPoly(x, y, p));
