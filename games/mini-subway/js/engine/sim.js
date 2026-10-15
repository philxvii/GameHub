// Moteur de simulation de Mini Subway : pur, déterministe, sans DOM.
//
// - L'état est un objet JSON (sérialisable, hachable, rejouable).
// - `step(st)` avance d'un tick de pas fixe (TICK_HZ par seconde réelle) ; la vitesse
//   (pause 0×, 1×, 2×) règle le nombre de sous-pas de temps de jeu par tick.
// - Toute action du joueur est une commande validée par `apply(st, cmd)`.
// - Les caches dérivés (géométrie, tables de routage) vivent hors de l'état.
// Seules les opérations + − × ÷ et √ interviennent : résultat identique partout.

import { RULES_VERSION, MODES, UNLIMITED, COMMON_SHAPES, RARE_SHAPES, SHAPE_NAMES } from './params.js';
import { buildConfig, inWater, inPark } from './maps.js';
import { rand, weighted, hashString } from './rng.js';
import { segPath, polyLen, pointAt, dist, distToPoly } from './geom.js';

// ───────────────────────── configuration et caches ─────────────────────────

const CFG = new Map();
export function cfgOf(st) {
  const key = st.map + '|' + JSON.stringify(st.patch || null);
  if (!CFG.has(key)) CFG.set(key, buildConfig(st.map, st.patch));
  return CFG.get(key);
}
const modeOf = st => MODES[st.mode];
const weekTicks = cfg => cfg.time.dayTicks * cfg.time.daysPerWeek;

// Caches dérivés par état : géométrie des tronçons et tables de routage.
const DER = new WeakMap();
function der(st) {
  let d = DER.get(st);
  if (!d) DER.set(st, (d = { geoVer: -1, seg: new Map(), rtVer: -1, rt: null, ev: [] }));
  if (d.geoVer !== st.geoVer) { d.seg.clear(); d.geoVer = st.geoVer; }
  return d;
}

// Événements pour le rendu et l'audio (hors état : n'influencent jamais la simulation).
function emit(st, e) { const d = der(st); if (d.ev.length < 400) d.ev.push(e); }
export function drainEvents(st) { const d = der(st); const ev = d.ev; d.ev = []; return ev; }

export const stationById = (st, id) => st.stations.find(s => s.id === id) || null;
const trainById = (st, id) => st.trains.find(t => t.id === id) || null;

// Géométrie d'un tronçon (a → b) : points, longueur, nombre de franchissements d'eau.
export function segment(st, aId, bId) {
  const d = der(st);
  const key = aId < bId ? aId + '-' + bId : bId + '-' + aId;
  let g = d.seg.get(key);
  if (!g) {
    const a = stationById(st, Math.min(aId, bId)), b = stationById(st, Math.max(aId, bId));
    const pts = segPath(a, b);
    g = { pts, len: polyLen(pts), cross: countCrossings(cfgOf(st), pts) };
    d.seg.set(key, g);
  }
  if (aId <= bId) return g;
  return { pts: [g.pts[4], g.pts[5], g.pts[2], g.pts[3], g.pts[0], g.pts[1]], len: g.len, cross: g.cross };
}

// Nombre d'entrées dans l'eau le long du tracé (une ressource par entrée).
export function countCrossings(cfg, pts) {
  if (!cfg.water.length) return 0;
  const L = polyLen(pts);
  let n = 0, wet = false;
  for (let d = 0; d <= L; d += 5) {
    const p = pointAt(pts, d);
    const w = inWater(cfg, p.x, p.y);
    if (w && !wet) n++;
    wet = w;
  }
  return n;
}

// Tronçons d'une ligne (paires d'ids consécutifs, boucle comprise).
export function lineSegments(line) {
  const out = [];
  for (let i = 1; i < line.s.length; i++) out.push([line.s[i - 1], line.s[i]]);
  if (line.loop && line.s.length > 2) out.push([line.s[line.s.length - 1], line.s[0]]);
  return out;
}
const lineCrossings = (st, line) => lineSegments(line).reduce((n, [a, b]) => n + segment(st, a, b).cross, 0);

// ───────────────────────── inventaire ─────────────────────────

// Ressources libres = possédées − placées : jamais de compteur désynchronisé.
export function inventory(st) {
  const used = { lines: 0, locos: 0, express: 0, cars: 0, crossings: 0, hubs: 0 };
  for (const l of st.lines) if (l.s.length >= 2) { used.lines++; used.crossings += lineCrossings(st, l); }
  for (const t of st.trains) { if (t.k === 'express') used.express++; else used.locos++; used.cars += t.c; }
  for (const s of st.stations) if (s.hub) used.hubs++;
  const free = {};
  for (const k of Object.keys(used)) free[k] = st.own[k] - used[k];
  return { own: st.own, used, free };
}

export const trainCapacity = (st, t) => {
  const cfg = cfgOf(st);
  const cls = t.k === 'express' ? 'express' : cfg.vehicleClass;
  return cfg.capacity.train + (cfg.vehicles[cls] || { cap: 0 }).cap + t.c * cfg.capacity.carriageBonus;
};
export const stationCapacity = (st, s) => {
  const cfg = cfgOf(st);
  if (s.hub) return cfg.capacity.interchange;
  const base = cfg.capacity.byShape[s.shape] ?? cfg.capacity.station;
  return cfg.overload.threshold ?? base;
};

// ───────────────────────── création ─────────────────────────

export function createGame({ map, mode = 'classic', seed = 1, patch = null, multi = false, indep = false, handicaps = null }) {
  const st = {
    v: RULES_VERSION, map, mode, seed: seed >>> 0, patch, tick: 0, t: 0, speed: 1,
    multi, indep, // indep : apparitions indépendantes du réseau (Versus, même séquence pour tous)
    // Extension future (handicaps/pénalités dynamiques, cahier §25.5) : champ versionné,
    // lu par applyHandicaps() ; vide dans cette livraison, sans aucun effet.
    handicaps: handicaps || { v: 1, list: [] },
    rng: { w: hashString('w' + seed), p: hashString('p' + seed), r: hashString('r' + seed) },
    nextId: 1, geoVer: 0, netVer: 0,
    stations: [], pass: {}, lines: [], trains: [],
    own: {}, score: 0, week: 0, nextWeek: 0, nextStation: 0, lastRare: false,
    reward: null, eff: 0.5, over: null,
    growthOn: true, traffic: true,
    stats: { transfers: 0, spawned: 0, delivered: 0, hubs: 0, loops: 0, peak: { s: 0, q: 0 } },
  };
  const cfg = cfgOf(st);
  const M = modeOf(st);
  if (!M) throw new Error('mode inconnu : ' + mode);
  const L = cfg.limits;
  st.own = M.unlimited
    ? { lines: cfg.limits.maxLines, locos: UNLIMITED, express: UNLIMITED, cars: UNLIMITED, crossings: UNLIMITED, hubs: UNLIMITED }
    : { lines: L.startingLines, locos: L.startingLocomotives, express: 0, cars: L.startingCarriages, crossings: L.startingCrossings, hubs: L.startingHubs };
  for (let i = 0; i < cfg.limits.maxLines; i++) st.lines.push({ id: i, s: [], loop: false, rev: 0 });
  for (const p of cfg.start) addStation(st, p.x, p.y, p.shape);
  st.nextWeek = weekTicks(cfg);
  st.nextStation = cfg.growth.firstStationTicks;
  if (st.mode === 'creative') st.growthOn = false;
  if (!cfg.growth.enabled) st.growthOn = false;
  return st;
}

function addStation(st, x, y, shape) {
  const cfg = cfgOf(st);
  const s = { id: st.nextId++, x, y, shape, q: [], o: 0, hub: false, born: st.t, np: 0, h: [], pk: 0 };
  s.np = st.t + cfg.passengers.firstDelayTicks + Math.floor(rand(st.rng, 'p') * cfg.passengers.intervalTicks * 0.5);
  st.stations.push(s);
  st.netVer++;
  emit(st, { k: 'station', s: s.id });
  return s;
}

// ───────────────────────── boucle de simulation ─────────────────────────

export function step(st) {
  st.tick++;
  if (st.over) return;
  if (st.reward && !st.multi) return; // en solo, le choix de récompense suspend le temps
  for (let i = 0; i < st.speed; i++) { sub(st); if (st.over) return; }
}

function sub(st) {
  const cfg = cfgOf(st), M = modeOf(st);
  st.t++;
  applyHandicaps(st);
  // Semaines : récompense (Classique/Extrême) et modificateurs de carte.
  if (st.t >= st.nextWeek) {
    st.week++;
    st.nextWeek += weekTicks(cfg);
    emit(st, { k: 'week', w: st.week });
    if (M.weekly) offerReward(st, true);
    const sc = cfg.modifiers.shapeChange;
    if (sc && st.week >= sc.firstWeek && (st.week - sc.firstWeek) % sc.everyWeeks === 0) shapeChange(st);
  }
  if (st.reward && st.multi && st.t - st.reward.at > 400) chooseReward(st, 0, 0, true);
  if (st.growthOn && st.t >= st.nextStation) spawnStation(st);
  if (st.traffic) for (const s of st.stations) if (st.t >= s.np) spawnPassenger(st, s);
  for (const t of st.trains) moveTrain(st, t);
  updateOverload(st);
  if (M.efficiency) updateEfficiency(st);
}

// Point d'application des handicaps dynamiques (version future). Aucun effet ici : la
// liste est toujours vide et toute entrée inconnue est ignorée.
export function applyHandicaps(st) {
  if (!st.handicaps || !st.handicaps.list.length) return;
}

const weekFloat = st => st.t / weekTicks(cfgOf(st));

// ── croissance de la ville ──
function spawnStation(st) {
  const cfg = cfgOf(st), g = cfg.growth;
  const wf = weekFloat(st);
  const interval = Math.max(g.intervalMinTicks, g.intervalStartTicks - g.intervalDropPerWeek * wf);
  st.nextStation = st.t + Math.max(40, Math.floor(interval * (1 + g.jitter * (rand(st.rng, 'w') * 2 - 1))));
  if (st.stations.length >= g.maxStations) return;
  const W = cfg.world, cx = cfg.center[0], cy = cfg.center[1];
  const hx = Math.min(W.w, g.startHalf[0] + g.growHalfPerWeek[0] * wf);
  const hy = Math.min(W.h, g.startHalf[1] + g.growHalfPerWeek[1] * wf);
  const m = g.edgeMargin;
  let pos = null;
  for (let k = 0; k < g.attempts; k++) {
    const x = Math.round(Math.max(m, Math.min(W.w - m, cx + (rand(st.rng, 'w') * 2 - 1) * hx)));
    const y = Math.round(Math.max(m, Math.min(W.h - m, cy + (rand(st.rng, 'w') * 2 - 1) * hy)));
    if (!pos && placeable(st, x, y, g.minSpacing, !st.indep)) pos = [x, y];
  }
  // Forme : une station rare de temps en temps, jamais deux de suite.
  const r = rand(st.rng, 'w'), r2 = rand(st.rng, 'w');
  let shape = null;
  if (st.week >= g.rareFromWeek && !st.lastRare && r < g.rareChance) {
    const options = g.rareShapes.filter(sh => st.stations.filter(s => s.shape === sh).length < g.maxPerRare);
    if (options.length) shape = options[Math.floor(r2 * options.length)];
  }
  if (!shape) shape = weighted(st.rng, 'w', COMMON_SHAPES.map(sh => [sh, cfg.shapes.weights[sh] ?? 1]));
  else rand(st.rng, 'w'); // même nombre de tirages quelle que soit la branche
  if (!pos) return;
  st.lastRare = RARE_SHAPES.includes(shape);
  addStation(st, pos[0], pos[1], shape);
}

export function placeable(st, x, y, spacing, avoidLines) {
  const cfg = cfgOf(st);
  if (inWater(cfg, x, y) || inPark(cfg, x, y)) return false;
  if (x < 20 || y < 20 || x > cfg.world.w - 20 || y > cfg.world.h - 20) return false;
  for (const s of st.stations) if (dist(s.x, s.y, x, y) < spacing) return false;
  // Pas de station posée sur un tracé existant (faux lien visuel).
  if (avoidLines) for (const l of st.lines) for (const [a, b] of lineSegments(l)) {
    if (distToPoly(x, y, segment(st, a, b).pts) < cfg.growth.lineClearance) return false;
  }
  return true;
}

function shapeChange(st) {
  const cfg = cfgOf(st);
  const commons = st.stations.filter(s => COMMON_SHAPES.includes(s.shape) && st.t - s.born > 200);
  const target = cfg.growth.rareShapes.find(sh => !st.stations.some(s => s.shape === sh));
  const pick = commons.length ? commons[Math.floor(rand(st.rng, 'w') * commons.length)] : null;
  if (!pick || !target) return;
  const old = pick.shape;
  pick.shape = target;
  // Les voyageurs qui attendaient ici pour la nouvelle forme gardent un but cohérent.
  for (const pid of pick.q) if (st.pass[pid].d === target) st.pass[pid].d = old;
  st.netVer++;
  emit(st, { k: 'shape', s: pick.id, from: old, to: target });
}

// ── voyageurs ──
function spawnPassenger(st, s) {
  const cfg = cfgOf(st), P = cfg.passengers;
  const interval = P.intervalTicks / (1 + P.growthPerWeek * weekFloat(st));
  s.np = st.t + Math.max(20, Math.floor(interval * (1 + P.intervalJitter * (rand(st.rng, 'p') * 2 - 1))));
  const shapes = [];
  for (const o of st.stations) if (o.shape !== s.shape && !shapes.includes(o.shape)) shapes.push(o.shape);
  if (!shapes.length) return;
  const items = shapes.map(sh => [sh, COMMON_SHAPES.includes(sh) ? cfg.shapes.weights[sh] ?? 1 : P.rareDestWeight]);
  let d = weighted(st.rng, 'p', items);
  const u = rand(st.rng, 'p');
  // Jamais trois destinations identiques de suite : on retire alors la forme du tirage.
  if (s.h[0] === d && s.h[1] === d && items.length > 1) {
    const rest = items.filter(([sh]) => sh !== d);
    let r = u * rest.reduce((a, [, w]) => a + w, 0);
    d = rest[rest.length - 1][0];
    for (const [sh, w] of rest) if ((r -= w) < 0) { d = sh; break; }
  }
  const p = { id: st.nextId++, d, s: s.id, tr: -1, rd: st.t, b: st.t };
  st.pass[p.id] = p;
  s.q.push(p.id);
  s.h = [d, s.h[0]];
  st.stats.spawned++;
  emit(st, { k: 'spawn', s: s.id });
}

// ── routage ──
// Graphe : un nœud « quai » par station, un nœud (station, ligne) par arrêt desservi.
// quai → arrêt : attente moyenne de la ligne (demi-intervalle entre deux trains) ;
// arrêt → quai : correspondance (gratuite à destination) ; arrêt → arrêt suivant : temps
// de trajet + arrêt. Dijkstra inverse depuis les stations de chaque forme cible.
// Recalculé seulement quand le réseau (lignes, trains, stations) change.
export function routes(st) {
  const d = der(st);
  if (d.rtVer === st.netVer && d.rt) return d.rt;
  const cfg = cfgOf(st), T = cfg.trains;
  const n = st.stations.length;
  const idx = new Map(st.stations.map((s, i) => [s.id, i]));
  const node = new Map(); // "l:stationId" → index
  let N = n;
  const lines = st.lines.filter(l => l.s.length >= 2);
  for (const l of lines) for (const sid of l.s) node.set(l.id + ':' + sid, N++);
  const pred = Array.from({ length: N }, () => []); // pred[v] = [[u, w, kind]]
  for (const l of lines) {
    const wait = lineWait(st, l);
    for (const sid of l.s) {
      const v = node.get(l.id + ':' + sid), p = idx.get(sid);
      pred[v].push([p, wait, 0]);         // quai → arrêt
      pred[p].push([v, 0, 1]);            // arrêt → quai (poids selon la cible)
    }
    const dirs = loopDirs(st, l);
    for (const [a, b] of lineSegments(l)) {
      const w = segWeight(st, a, b);
      const A = node.get(l.id + ':' + a), B = node.get(l.id + ':' + b);
      if (dirs.fwd) pred[B].push([A, w, 0]);
      if (dirs.back) pred[A].push([B, w, 0]);
    }
  }
  const transfer = st.stations.map(s => (s.hub ? T.hubTransferTicks : T.transferTicks));
  const D = {};
  const shapes = [...new Set(st.stations.map(s => s.shape))];
  for (const sh of shapes) {
    const dist = new Float64Array(N).fill(Infinity);
    const heap = new Heap();
    st.stations.forEach((s, i) => { if (s.shape === sh) { dist[i] = 0; heap.push(i, 0); } });
    while (heap.size) {
      const [v, dv] = heap.pop();
      if (dv > dist[v]) continue;
      for (const [u, w, kind] of pred[v]) {
        // arrêt → quai : 0 si le quai est une destination, sinon temps de correspondance
        const ww = kind === 1 ? (st.stations[v].shape === sh ? 0 : transfer[v]) : w;
        const nd = dv + ww;
        if (nd < dist[u]) { dist[u] = nd; heap.push(u, nd); }
      }
    }
    D[sh] = dist;
  }
  d.rt = { D, idx, node };
  d.rtVer = st.netVer;
  return d.rt;
}

// Attente moyenne à un arrêt : demi-intervalle entre deux passages (Infinity sans train).
export function lineWait(st, l) {
  const n = st.trains.filter(t => t.l === l.id).length;
  if (!n) return Infinity;
  let round = 0;
  for (const [a, b] of lineSegments(l)) round += segWeight(st, a, b);
  if (!l.loop) round *= 2;
  return Math.max(cfgOf(st).trains.waitCost * 0.2, round / n / 2);
}

// Sens de circulation possibles : ligne ouverte = les deux ; boucle = sens des trains.
function loopDirs(st, l) {
  if (!l.loop) return { fwd: true, back: true };
  const tr = st.trains.filter(t => t.l === l.id);
  if (!tr.length) return { fwd: true, back: true };
  return { fwd: tr.some(t => t.dir > 0), back: tr.some(t => t.dir < 0) };
}

function segWeight(st, a, b) {
  const T = cfgOf(st).trains;
  return segment(st, a, b).len / (T.speed * (1 - T.accelRatio / 2)) + T.stopCost;
}

const EPS = 0.01;
// Valeur d'un trajet pour un voyageur : reste à parcourir depuis l'arrêt suivant.
function viaCost(st, rt, p, lineId, sid, nx) {
  const D = rt.D[p.d];
  if (!D) return Infinity;
  const v = rt.node.get(lineId + ':' + nx);
  return v === undefined ? Infinity : segWeight(st, sid, nx) + D[v];
}
// Monter maintenant si ce train fait au moins aussi bien que l'optimum attendu à quai
// (qui inclut l'attente du meilleur train) : on ne laisse pas filer un bon train.
function wantsBoard(st, rt, p, s, lineId, nx) {
  const D = rt.D[p.d];
  if (!D) return false;
  const best = D[rt.idx.get(s.id)];
  const c = viaCost(st, rt, p, lineId, s.id, nx);
  return Number.isFinite(c) && c <= best + EPS;
}
function shouldAlight(st, rt, p, s, lineId, nx) {
  const D = rt.D[p.d];
  const T = cfgOf(st).trains;
  const stay = nx == null ? Infinity : viaCost(st, rt, p, lineId, s.id, nx);
  const alight = D ? (s.hub ? T.hubTransferTicks : T.transferTicks) + D[rt.idx.get(s.id)] : Infinity;
  if (!Number.isFinite(stay)) return true; // plus de chemin à bord : descente explicite
  return alight + EPS < stay;
}
export function reachable(st, p) {
  const rt = routes(st);
  const D = rt.D[p.d];
  const at = p.s >= 0 ? rt.idx.get(p.s) : undefined;
  return !!D && at !== undefined && Number.isFinite(D[at]);
}

// ── trains ──
function lineOf(st, id) { return st.lines[id]; }

// Arrêt suivant depuis b selon le sens (demi-tour aux terminus des lignes ouvertes).
export function nextStop(line, b, dir) {
  const n = line.s.length;
  const i = line.s.indexOf(b);
  if (i < 0 || n < 2) return { nx: null, dir };
  if (line.loop) return { nx: line.s[(i + dir + n) % n], dir };
  if (i + dir < 0 || i + dir >= n) dir = -dir;
  return { nx: line.s[i + dir], dir };
}

function segTicks(st, t, len) {
  const cfg = cfgOf(st);
  const cls = t.k === 'express' ? 'express' : cfg.vehicleClass;
  const v = cfg.trains.speed * (cfg.vehicles[cls] || { speed: 1 }).speed;
  return Math.max(4, Math.ceil(len / (v * (1 - cfg.trains.accelRatio))));
}

function moveTrain(st, t) {
  if (t.st === 'dwell') return dwell(st, t);
  t.t++;
  if (t.t >= t.T) arrive(st, t);
}

function arrive(st, t) {
  t.st = 'dwell'; t.w = 0; t.dw = 0; t.g = false; t.t = t.T;
  const line = lineOf(st, t.l);
  const r = nextStop(line, t.b, t.dir);
  t.nx = r.nx; t.dir = r.dir;
  emit(st, { k: 'arrive', s: t.b, l: t.l, tr: t.id });
}

function dwell(st, t) {
  const cfg = cfgOf(st), T = cfg.trains;
  t.dw++;
  if (t.w > 0) { t.w--; return; }
  const s = stationById(st, t.b);
  const line = lineOf(st, t.l);
  if (!s || line.s.indexOf(s.id) < 0) { relocate(st, t); return; }
  if (t.nx == null || line.s.indexOf(t.nx) < 0) { const r = nextStop(line, s.id, t.dir); t.nx = r.nx; t.dir = r.dir; }
  const bt = s.hub ? T.hubBoardTicks : T.boardTicks;
  const rt = routes(st);
  // 1. descente : arrivés, puis correspondances
  for (let i = 0; i < t.ld.length; i++) {
    const p = st.pass[t.ld[i]];
    if (p.d === s.shape) {
      t.ld.splice(i, 1);
      delete st.pass[p.id];
      st.score++; st.stats.delivered++;
      if (modeOf(st).efficiency) st.eff = Math.min(1, st.eff + cfg.infinite.gainPerDelivery);
      emit(st, { k: 'deliver', s: s.id, l: t.l });
      t.w = bt; return;
    }
  }
  for (let i = 0; i < t.ld.length; i++) {
    const p = st.pass[t.ld[i]];
    if (shouldAlight(st, rt, p, s, t.l, t.nx)) {
      t.ld.splice(i, 1);
      p.tr = -1; p.s = s.id; p.rd = st.t + (s.hub ? T.hubTransferTicks : T.transferTicks);
      s.q.push(p.id);
      st.stats.transfers++;
      emit(st, { k: 'transfer', s: s.id });
      t.w = bt; return;
    }
  }
  // 2. montée, dans l'ordre de la file, tant qu'il reste de la place
  if (t.ld.length < trainCapacity(st, t) && t.nx != null) {
    for (let i = 0; i < s.q.length; i++) {
      const p = st.pass[s.q[i]];
      if (p.rd <= st.t && wantsBoard(st, rt, p, s, t.l, t.nx)) {
        s.q.splice(i, 1);
        p.s = -1; p.tr = t.id;
        t.ld.push(p.id);
        emit(st, { k: 'board', s: s.id });
        t.w = bt; return;
      }
    }
  }
  // 3. départ
  if (t.dw >= T.minDwellTicks && t.nx != null) depart(st, t);
}

function depart(st, t) {
  t.a = t.b; t.b = t.nx; t.nx = null;
  t.T = segTicks(st, t, segment(st, t.a, t.b).len);
  t.t = 0; t.st = 'move';
}

// Ligne raccourcie sous le train : il reprend au premier arrêt valide, passagers à bord.
function relocate(st, t) {
  const line = lineOf(st, t.l);
  const at = line.s.includes(t.a) ? t.a : line.s[0];
  t.a = t.b = at; t.st = 'dwell'; t.w = 0; t.dw = 0; t.t = 0; t.T = 1; t.g = false;
  const r = nextStop(line, at, t.dir || 1);
  t.nx = r.nx; t.dir = r.dir;
  emit(st, { k: 'relocate', tr: t.id });
}

// Après modification d'une ligne : chaque train garde sa position quand c'est possible.
function remapTrains(st, line) {
  for (const t of st.trains) {
    if (t.l !== line.id) continue;
    const ia = line.s.indexOf(t.a), ib = line.s.indexOf(t.b), n = line.s.length;
    if (t.st === 'dwell') {
      if (ib < 0) relocate(st, t);
      else { const r = nextStop(line, t.b, t.dir); t.nx = r.nx; t.dir = r.dir; }
      continue;
    }
    const adj = ia >= 0 && ib >= 0 && (Math.abs(ia - ib) === 1 || (line.loop && Math.abs(ia - ib) === n - 1));
    if (adj) {
      t.g = false;
      t.dir = line.loop ? (ib === (ia + 1) % n ? 1 : -1) : ib > ia ? 1 : -1;
    } else if (ib >= 0) {
      t.g = true; // finit son tronçon (fantôme) puis reprend la ligne à b
    } else if (ia >= 0) {
      const a = t.a; t.a = t.b; t.b = a; t.t = Math.max(0, t.T - t.t); t.g = true; t.dir = -t.dir;
    } else relocate(st, t);
  }
}

// Débarque les voyageurs d'un train retiré à la station la plus proche (état explicite).
function unloadTrain(st, t) {
  const s = stationById(st, t.b) || stationById(st, t.a) || st.stations[0];
  const T = cfgOf(st).trains;
  for (const pid of t.ld) {
    const p = st.pass[pid];
    p.tr = -1; p.s = s.id; p.rd = st.t + T.transferTicks;
    s.q.push(pid);
  }
  t.ld = [];
}

// ── surcharge ──
function updateOverload(st) {
  const cfg = cfgOf(st), O = cfg.overload, M = modeOf(st);
  const served = new Set();
  for (const t of st.trains) if (t.st === 'dwell') served.add(t.b);
  for (const s of st.stations) {
    const q = s.q.length;
    if (q > s.pk) s.pk = q;
    if (q > st.stats.peak.q) st.stats.peak = { s: s.id, q };
    const cap = stationCapacity(st, s);
    const before = s.o;
    if (q > cap) { if (!(O.pauseWhileServed && served.has(s.id))) s.o = Math.min(1, s.o + 1 / O.graceTicks); }
    else s.o = Math.max(0, s.o - O.recoveryRate / O.graceTicks);
    if (before < O.warnAt && s.o >= O.warnAt) emit(st, { k: 'warn', s: s.id });
    if (s.o >= 1 && M.lose && !st.over) {
      st.over = { s: s.id, t: st.t, reason: 'overload' };
      emit(st, { k: 'over', s: s.id });
    }
  }
}

function updateEfficiency(st) {
  const cfg = cfgOf(st), I = cfg.infinite;
  let excess = 0;
  for (const s of st.stations) excess += Math.max(0, s.q.length - stationCapacity(st, s));
  if (st.eff >= 1 && !st.reward) { offerReward(st, true); st.eff = I.resetTo; return; }
  st.eff = Math.max(0, st.eff - excess * I.lossPerExcess - I.decay);
}

// ── récompenses ──
function offerReward(st, withLoco) {
  const cfg = cfgOf(st), R = cfg.rewards;
  let loco = null;
  if (withLoco) {
    if (R.locoChoice) loco = [{ k: 'locos', n: R.locoChoice.standard }, { k: 'express', n: R.locoChoice.express }];
    else st.own.locos += R.locosPerWeek;
  }
  const avail = R.available.filter(k => k !== 'line' || st.own.lines < cfg.limits.maxLines);
  const opts = [];
  const pool = avail.slice();
  while (opts.length < R.choices && pool.length) {
    const k = pool.splice(Math.floor(rand(st.rng, 'r') * pool.length), 1)[0];
    const n = { line: R.linesPerReward, carriage: R.carriagesPerReward, crossings: R.crossingsPerReward, hub: R.hubsPerReward }[k];
    opts.push({ k, n });
  }
  if (!opts.length && !loco) { emit(st, { k: 'loco' }); return; }
  st.reward = { at: st.t, opts, loco, granted: withLoco && !loco ? R.locosPerWeek : 0 };
  emit(st, { k: 'reward' });
}

function chooseReward(st, pick, locoPick, auto) {
  const r = st.reward;
  if (r.loco) {
    const l = r.loco[locoPick] || r.loco[0];
    if (l.k === 'express') st.own.express += l.n; else st.own.locos += l.n;
  }
  const o = r.opts[pick];
  if (o) {
    if (o.k === 'line') st.own.lines = Math.min(cfgOf(st).limits.maxLines, st.own.lines + o.n);
    else if (o.k === 'carriage') st.own.cars += o.n;
    else if (o.k === 'crossings') st.own.crossings += o.n;
    else if (o.k === 'hub') st.own.hubs += o.n;
  }
  st.reward = null;
  emit(st, { k: 'rewarded', o: o ? o.k : null, auto: !!auto });
}

// ───────────────────────── commandes ─────────────────────────

const ok = () => ({ ok: true });
const no = err => ({ ok: false, err });

export function apply(st, cmd) {
  const h = HANDLERS[cmd && cmd.type];
  if (!h) return no('Commande inconnue.');
  if (st.over && cmd.type !== 'speed') return no('La partie est terminée.');
  const r = h(st, cmd);
  if (r.ok) emit(st, { k: 'cmd', type: cmd.type, by: cmd.by });
  return r;
}

const locked = st => modeOf(st).locked;
const creative = st => modeOf(st).stationEdit;

const HANDLERS = {
  // Pose, prolonge, raccourcit, réordonne ou supprime une ligne (s = [] : suppression).
  line(st, { l, s, loop = false, rev }) {
    const cfg = cfgOf(st);
    const line = st.lines[l];
    if (!line) return no('Ligne inconnue.');
    if (rev !== undefined && rev !== line.rev) return no('Cette ligne vient d’être modifiée par un autre joueur.');
    if (!Array.isArray(s)) return no('Tracé invalide.');
    const wasActive = line.s.length >= 2;
    if (!wasActive && l >= st.own.lines) return no('Ligne pas encore disponible.');
    if (s.length === 0) {
      if (!wasActive) return no('Ligne déjà vide.');
      if (locked(st)) return no('Mode Extrême : une ligne posée ne se retire plus.');
      for (const t of st.trains.filter(t => t.l === l)) unloadTrain(st, t);
      st.trains = st.trains.filter(t => t.l !== l);
      line.s = []; line.loop = false; line.rev++;
      st.netVer++;
      return ok();
    }
    if (s.length < 2) return no('Une ligne relie au moins deux stations.');
    if (loop && s.length < 3) return no('Une boucle relie au moins trois stations.');
    if (new Set(s).size !== s.length) return no('Une station ne figure qu’une fois par ligne.');
    if (!s.every(id => stationById(st, id))) return no('Station inconnue.');
    if (locked(st) && wasActive && !extends_(line, s, loop)) return no('Mode Extrême : on ne peut que prolonger une ligne par ses extrémités.');
    const trial = { id: l, s, loop };
    let usedOthers = 0;
    for (const o of st.lines) if (o.id !== l && o.s.length >= 2) usedOthers += lineCrossings(st, o);
    const need = lineCrossings(st, trial);
    if (usedOthers + need > st.own.crossings) return no('Il manque un pont ou un tunnel pour franchir l’eau.');
    line.s = s.slice(); line.loop = !!loop; line.rev++;
    if (loop) st.stats.loops++;
    st.netVer++;
    remapTrains(st, line);
    // Une nouvelle ligne reçoit d'office une locomotive libre.
    if (!wasActive) {
      const inv = inventory(st);
      if (inv.free.locos > 0) placeTrain(st, l, s[0], 'base');
      else if (inv.free.express > 0) placeTrain(st, l, s[0], 'express');
    }
    void cfg;
    return ok();
  },
  train(st, { l, at, kind = 'base' }) {
    const line = st.lines[l];
    if (!line || line.s.length < 2) return no('Posez d’abord une ligne.');
    const inv = inventory(st);
    if ((kind === 'express' ? inv.free.express : inv.free.locos) <= 0) return no('Aucune locomotive disponible.');
    if (st.trains.filter(t => t.l === l).length >= cfgOf(st).limits.maxLocomotivesPerLine) return no('Cette ligne a déjà son maximum de locomotives.');
    placeTrain(st, l, line.s.includes(at) ? at : line.s[0], kind);
    return ok();
  },
  trainMove(st, { tr, l, at }) {
    if (locked(st)) return no('Mode Extrême : une locomotive posée ne se déplace plus.');
    const t = trainById(st, tr), line = st.lines[l];
    if (!t) return no('Train inconnu.');
    if (!line || line.s.length < 2) return no('Ligne de destination inactive.');
    if (t.l !== l && st.trains.filter(x => x.l === l).length >= cfgOf(st).limits.maxLocomotivesPerLine) return no('Cette ligne a déjà son maximum de locomotives.');
    unloadTrain(st, t);
    t.l = l;
    const where = line.s.includes(at) ? at : line.s[0];
    t.a = t.b = where; t.st = 'dwell'; t.w = 0; t.dw = 0; t.t = 0; t.T = 1; t.g = false;
    t.dir = loopDir(st, line);
    const r = nextStop(line, where, t.dir); t.nx = r.nx; t.dir = r.dir;
    st.netVer++;
    return ok();
  },
  trainDel(st, { tr }) {
    if (locked(st)) return no('Mode Extrême : une locomotive posée ne se retire plus.');
    const t = trainById(st, tr);
    if (!t) return no('Train inconnu.');
    unloadTrain(st, t);
    st.trains = st.trains.filter(x => x !== t);
    st.netVer++;
    return ok();
  },
  car(st, { tr }) {
    const t = trainById(st, tr);
    if (!t) return no('Train inconnu.');
    if (inventory(st).free.cars <= 0) return no('Aucun wagon disponible.');
    if (t.c >= 3) return no('Ce train tracte déjà trois wagons.');
    t.c++;
    return ok();
  },
  carDel(st, { tr }) {
    if (locked(st)) return no('Mode Extrême : un wagon posé ne se retire plus.');
    const t = trainById(st, tr);
    if (!t || t.c <= 0) return no('Aucun wagon à retirer.');
    if (t.ld.length > trainCapacity(st, t) - cfgOf(st).capacity.carriageBonus) return no('Le wagon est occupé : attendez que la rame se vide.');
    t.c--;
    return ok();
  },
  hub(st, { s }) {
    const x = stationById(st, s);
    if (!x) return no('Station inconnue.');
    if (x.hub) return no('Cette station est déjà un pôle d’échange.');
    if (inventory(st).free.hubs <= 0) return no('Aucun pôle d’échange disponible.');
    x.hub = true; st.stats.hubs++;
    st.netVer++;
    return ok();
  },
  hubDel(st, { s }) {
    if (!creative(st)) return no('Un pôle d’échange est définitif (sauf en mode Créatif).');
    const x = stationById(st, s);
    if (!x || !x.hub) return no('Pas de pôle d’échange ici.');
    x.hub = false; st.netVer++;
    return ok();
  },
  reward(st, { pick = 0, loco = 0 }) {
    if (!st.reward) return no('Aucune récompense en attente.');
    if (st.reward.opts.length && !st.reward.opts[pick]) return no('Choix invalide.');
    chooseReward(st, pick, loco, false);
    return ok();
  },
  speed(st, { v }) {
    if (![0, 1, 2].includes(v)) return no('Vitesse invalide.');
    st.speed = v;
    return ok();
  },
  forfeit(st) { st.over = { s: 0, t: st.t, reason: 'forfeit' }; return ok(); },
  // ── mode Créatif : édition des stations ──
  stAdd(st, { x, y, shape }) {
    if (!creative(st)) return no('Réservé au mode Créatif.');
    if (!COMMON_SHAPES.includes(shape) && !RARE_SHAPES.includes(shape)) return no('Forme inconnue.');
    if (!placeable(st, Math.round(x), Math.round(y), 56, false)) return no('Emplacement impossible (eau, parc ou trop près d’une station).');
    addStation(st, Math.round(x), Math.round(y), shape);
    return ok();
  },
  stDel(st, { s }) {
    if (!creative(st)) return no('Réservé au mode Créatif.');
    const x = stationById(st, s);
    if (!x) return no('Station inconnue.');
    for (const line of st.lines) {
      if (!line.s.includes(s)) continue;
      const rest = line.s.filter(id => id !== s);
      const loop = line.loop && rest.length >= 3;
      if (rest.length < 2) HANDLERS.line(st, { l: line.id, s: [] });
      else { line.s = rest; line.loop = loop; line.rev++; st.netVer++; remapTrains(st, line); }
    }
    for (const t of st.trains) if (t.a === s || t.b === s) relocate(st, t);
    for (const pid of x.q) delete st.pass[pid]; // retrait explicite par l'éditeur
    st.stations = st.stations.filter(o => o !== x);
    st.netVer++; st.geoVer++;
    return ok();
  },
  stMove(st, { s, x, y }) {
    if (!creative(st)) return no('Réservé au mode Créatif.');
    const o = stationById(st, s);
    if (!o) return no('Station inconnue.');
    const ox = o.x, oy = o.y;
    o.x = -9999; o.y = -9999;
    const okPos = placeable(st, Math.round(x), Math.round(y), 56, false);
    o.x = ox; o.y = oy;
    if (!okPos) return no('Emplacement impossible.');
    o.x = Math.round(x); o.y = Math.round(y);
    st.geoVer++; st.netVer++;
    // Les crossings dépendent du tracé : refuser si l'inventaire ne suffit plus n'a pas
    // de sens en Créatif (illimité) ; les trains en route se recalent.
    for (const t of st.trains) if (t.st === 'move') t.T = segTicks(st, t, segment(st, t.a, t.b).len), t.t = Math.min(t.t, t.T - 1);
    return ok();
  },
  stShape(st, { s, shape }) {
    if (!creative(st)) return no('Réservé au mode Créatif.');
    const o = stationById(st, s);
    if (!o || !(COMMON_SHAPES.includes(shape) || RARE_SHAPES.includes(shape))) return no('Forme inconnue.');
    o.shape = shape;
    for (const pid of o.q) if (st.pass[pid].d === shape) delete st.pass[pid];
    o.q = o.q.filter(pid => st.pass[pid]);
    st.netVer++;
    return ok();
  },
  creative(st, { growth, traffic }) {
    if (!creative(st)) return no('Réservé au mode Créatif.');
    if (growth !== undefined) { st.growthOn = !!growth; if (st.growthOn) st.nextStation = Math.max(st.nextStation, st.t + 40); }
    if (traffic !== undefined) st.traffic = !!traffic;
    return ok();
  },
};

function extends_(line, s, loop) {
  const o = line.s;
  if (line.loop) return false;
  if (loop) return s.length === o.length && s.every((v, i) => v === o[i]);
  const prefix = o.every((v, i) => s[i] === v);
  const suffix = o.every((v, i) => s[s.length - o.length + i] === v);
  const rev = o.slice().reverse();
  const revPrefix = rev.every((v, i) => s[i] === v);
  const revSuffix = rev.every((v, i) => s[s.length - o.length + i] === v);
  return s.length >= o.length && (prefix || suffix || revPrefix || revSuffix);
}

function loopDir(st, line) {
  if (!line.loop) return 1;
  const n = st.trains.filter(t => t.l === line.id).length;
  return n % 2 === 0 ? 1 : -1;
}

function placeTrain(st, l, at, kind) {
  const line = st.lines[l];
  const t = { id: st.nextId++, l, k: kind === 'express' ? 'express' : 'base', c: 0, a: at, b: at, dir: 1, t: 0, T: 1, st: 'dwell', w: 0, dw: 0, nx: null, ld: [], g: false };
  t.dir = loopDir(st, line);
  if (!line.loop && line.s.indexOf(at) === line.s.length - 1) t.dir = -1;
  st.trains.push(t);
  const r = nextStop(line, at, t.dir); t.nx = r.nx; t.dir = r.dir;
  st.netVer++;
  emit(st, { k: 'train', l });
  return t;
}

// ───────────────────────── outils ─────────────────────────

// Empreinte de l'état : détecte une dérive entre deux clients.
export function stateHash(st) { return hashString(JSON.stringify(st)); }
export const snapshot = st => JSON.parse(JSON.stringify(st));

// Position interpolable d'un train pour le rendu (f = fraction de tick écoulée).
export function trainPos(st, t, f = 0) {
  if (t.st === 'dwell') { const s = stationById(st, t.b); return s ? { x: s.x, y: s.y, dx: 1, dy: 0, a: t.a, b: t.b, d: 0, len: 0 } : null; }
  const g = segment(st, t.a, t.b);
  const r = cfgOf(st).trains.accelRatio;
  const u = Math.min(1, (t.t + f) / t.T);
  const e = ease(u, r);
  const p = pointAt(g.pts, e * g.len);
  return { ...p, a: t.a, b: t.b, d: e * g.len, len: g.len };
}
// Profil de vitesse trapézoïdal : accélère, roule, freine.
export function ease(u, r) {
  const vm = 1 / (1 - r);
  if (u < r) return (0.5 * vm * u * u) / r;
  if (u > 1 - r) return 1 - (0.5 * vm * (1 - u) * (1 - u)) / r;
  return vm * (u - r / 2);
}

export const gameDay = st => Math.floor(st.t / cfgOf(st).time.dayTicks);

// Issue d'un duel Versus (cahier §25.3) vue par `me` : le premier réseau tombé perd ;
// tombés au même tick, le plus de voyageurs livrés gagne, sinon match nul.
// null tant que les deux réseaux tiennent.
export function duelOutcome(me, op) {
  if (!me.over && !op.over) return null;
  if (me.over && op.over) return me.score > op.score ? 'win' : me.score < op.score ? 'lose' : 'draw';
  return me.over ? 'lose' : 'win';
}
export const shapeName = sh => SHAPE_NAMES[sh] || sh;

// Diagnostic d'intégrité (tests et mode debug) : chaque voyageur existe une seule fois.
export function audit(st) {
  const seen = new Map();
  const errs = [];
  for (const s of st.stations) for (const pid of s.q) { seen.set(pid, (seen.get(pid) || 0) + 1); if (st.pass[pid]?.s !== s.id) errs.push('quai ' + pid); }
  for (const t of st.trains) for (const pid of t.ld) { seen.set(pid, (seen.get(pid) || 0) + 1); if (st.pass[pid]?.tr !== t.id) errs.push('train ' + pid); }
  for (const id of Object.keys(st.pass)) if (seen.get(Number(id)) !== 1) errs.push('voyageur ' + id + ' x' + (seen.get(Number(id)) || 0));
  const inv = inventory(st);
  for (const [k, v] of Object.entries(inv.free)) if (v < 0) errs.push('inventaire ' + k + ' ' + v);
  for (const t of st.trains) if (t.ld.length > trainCapacity(st, t)) errs.push('surcharge train ' + t.id);
  return errs;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a; a.push([v, p]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][1] <= a[i][1]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}
