// Tests du moteur de Mini Subway (sans navigateur) :
//   node --test games/mini-subway/tests/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, apply, inventory, audit, stateHash, snapshot, cfgOf, segment, routes,
  trainCapacity, stationCapacity, nextStop, drainEvents, reachable,
} from '../js/engine/sim.js';
import { MAPS, buildConfig, inWater, inPark } from '../js/engine/maps.js';
import { COMMON_SHAPES, RARE_SHAPES, MODES } from '../js/engine/params.js';
import { dailyChallenge, weeklyChallenge, newProfile, recordRun, isUnlocked, migrateProfile } from '../js/engine/progress.js';
import { segPath, polyLen } from '../js/engine/geom.js';
import { botTurn } from '../js/engine/autoplay.js';

const run = (st, n) => { for (let i = 0; i < n; i++) step(st); };
// Partie contrôlée : ni croissance ni trafic automatiques, stations posées à la main.
function lab({ map = 'haut-plateau', mode = 'classic', stations = null, seed = 7, patch = null } = {}) {
  const st = createGame({ map, mode, seed, patch });
  st.growthOn = false; st.traffic = false;
  st.nextWeek = Infinity; // pas de récompense hebdomadaire (elle suspend le temps en solo)
  if (stations) {
    st.stations = stations.map(([x, y, shape], i) => ({ id: i + 1, x, y, shape, q: [], o: 0, hub: false, born: 0, np: 0, h: [], pk: 0 }));
    st.nextId = stations.length + 1;
    st.geoVer++; st.netVer++;
  }
  return st;
}
function addPass(st, sid, d) {
  const p = { id: st.nextId++, d, s: sid, tr: -1, rd: st.t, b: st.t };
  st.pass[p.id] = p;
  st.stations.find(s => s.id === sid).q.push(p.id);
  return p;
}
const ok = r => assert.ok(r.ok, r.err);
const ko = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.err, re); };
const runUntil = (st, cond, max = 20000) => { for (let i = 0; i < max && !cond(); i++) step(st); return cond(); };

describe('cartes et géographie', () => {
  test('chaque carte se construit, stations de départ sur la terre ferme', () => {
    assert.ok(MAPS.length >= 6);
    for (const m of MAPS) {
      const cfg = buildConfig(m.id);
      assert.ok(cfg.palette.lines.length >= cfg.limits.maxLines, m.id + ' : assez de couleurs');
      for (const s of m.start) assert.equal(inWater(cfg, s.x, s.y), false, `${m.id} départ dans l'eau`);
      for (const s of m.start) assert.equal(inPark(cfg, s.x, s.y), false, `${m.id} départ dans un parc`);
    }
  });
  test('particularités de cartes lues dans les données', () => {
    assert.equal(buildConfig('haut-plateau').capacity.station, 5);
    assert.equal(buildConfig('haut-plateau').limits.startingLines, 2);
    assert.ok(!buildConfig('haut-plateau').rewards.available.includes('crossings'));
    assert.equal(buildConfig('archipel-corail').capacity.train, 4);
    assert.equal(buildConfig('archipel-corail').rewards.carriagesPerReward, 2);
    assert.equal(buildConfig('lagune-haute').rewards.locosPerWeek, 2);
    assert.equal(buildConfig('lagune-haute').start.length, 5);
    assert.ok(buildConfig('delta-sauge').rewards.locoChoice);
    assert.ok(buildConfig('delta-sauge').modifiers.shapeChange);
    assert.equal(buildConfig('val-dorme').capacity.station, 6);
  });
  test('tracé octilinéaire symétrique', () => {
    const a = { id: 1, x: 0, y: 0 }, b = { id: 2, x: 100, y: 40 };
    const p = segPath(a, b), q = segPath(b, a);
    assert.deepEqual(p, [q[4], q[5], q[2], q[3], q[0], q[1]]);
    assert.ok(Math.abs(polyLen(p) - (60 + 40 * Math.SQRT2)) < 1e-9);
  });
});

describe('graine et croissance', () => {
  test('même graine = même partie ; graine différente = autre partie', () => {
    const a = createGame({ map: 'val-dorme', seed: 42 }), b = createGame({ map: 'val-dorme', seed: 42 }), c = createGame({ map: 'val-dorme', seed: 43 });
    for (let i = 0; i < 8000; i++) { step(a); step(b); step(c); if (i % 50 === 0) { botTurn(a); botTurn(b); botTurn(c); } }
    assert.equal(stateHash(a), stateHash(b));
    assert.notEqual(stateHash(a), stateHash(c));
  });
  test('les stations apparaissent sur terre, espacées, hors des parcs', () => {
    for (const m of MAPS) {
      const st = createGame({ map: m.id, seed: 3, mode: 'infinite' });
      run(st, 20000);
      const cfg = cfgOf(st);
      assert.ok(st.stations.length > m.start.length + 5, m.id + ' : croissance');
      for (const s of st.stations) {
        assert.equal(inWater(cfg, s.x, s.y), false);
        assert.equal(inPark(cfg, s.x, s.y), false);
        for (const o of st.stations) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.y - s.y) >= cfg.growth.minSpacing - 1e-9);
      }
    }
  });
  test('formes spéciales : uniques et jamais deux de suite', () => {
    const st = createGame({ map: 'val-dorme', mode: 'infinite', seed: 11, patch: { growth: { rareChance: 0.6, rareFromWeek: 0 } } });
    run(st, 40000);
    const shapes = st.stations.map(s => s.shape);
    const rares = shapes.filter(s => RARE_SHAPES.includes(s));
    assert.ok(rares.length >= 2);
    assert.equal(new Set(rares).size, rares.length);
    for (let i = 1; i < shapes.length; i++) assert.ok(!(RARE_SHAPES.includes(shapes[i]) && RARE_SHAPES.includes(shapes[i - 1])), 'deux rares consécutives');
  });
  test('station qui change de forme (modificateur de carte)', () => {
    const st = createGame({ map: 'delta-sauge', mode: 'infinite', seed: 5 });
    let changed = null;
    for (let i = 0; i < 3 * 1960 + 10; i++) { step(st); for (const e of drainEvents(st)) if (e.k === 'shape') changed = e; if (st.reward) apply(st, { type: 'reward', pick: 0 }); }
    assert.ok(changed, 'changement de forme à la semaine 3');
    assert.ok(RARE_SHAPES.includes(changed.to) && COMMON_SHAPES.includes(changed.from));
  });
  test('voyageurs : destination = autre forme présente, files non uniformes', () => {
    const st = createGame({ map: 'val-dorme', mode: 'infinite', seed: 9 });
    run(st, 6000);
    for (const p of Object.values(st.pass)) {
      const s = st.stations.find(x => x.id === p.s);
      assert.notEqual(p.d, s.shape);
      assert.ok(st.stations.some(x => x.shape === p.d));
    }
    for (const s of st.stations) for (let i = 2; i < s.q.length; i++) {
      const d = [s.q[i - 2], s.q[i - 1], s.q[i]].map(id => st.pass[id].d);
      assert.ok(!(d[0] === d[1] && d[1] === d[2]), 'trois destinations identiques de suite');
    }
  });
  test('Versus : même séquence d’apparitions quels que soient les réseaux', () => {
    const a = createGame({ map: 'val-dorme', seed: 77, multi: true, indep: true });
    const b = createGame({ map: 'val-dorme', seed: 77, multi: true, indep: true });
    apply(a, { type: 'line', l: 0, s: [1, 2] });
    apply(b, { type: 'line', l: 0, s: [2, 3] }); // réseau différent dès le départ
    for (let i = 0; i < 12000; i++) { step(a); step(b); if (i % 40 === 0) botTurn(a); if (i % 90 === 45) botTurn(b); }
    assert.notEqual(JSON.stringify(a.lines), JSON.stringify(b.lines), 'réseaux différents');
    const n = Math.min(a.stations.length, b.stations.length);
    assert.ok(n >= 6, n + ' stations communes');
    const sig = st => st.stations.slice(0, n).map(s => `${s.x},${s.y},${s.shape},${s.born}`).join(';');
    assert.equal(sig(a), sig(b));
  });
});

describe('lignes', () => {
  const three = [[200, 200, 'circle'], [400, 200, 'triangle'], [600, 200, 'square'], [400, 420, 'circle']];
  test('création, validations, limites', () => {
    const st = lab({ stations: three });
    ko(apply(st, { type: 'line', l: 0, s: [1] }), /deux stations/);
    ko(apply(st, { type: 'line', l: 0, s: [1, 2, 1] }), /une fois/);
    ko(apply(st, { type: 'line', l: 0, s: [1, 99] }), /inconnue/);
    ko(apply(st, { type: 'line', l: 0, s: [1, 2], loop: true }), /trois/);
    ko(apply(st, { type: 'line', l: 2, s: [1, 2] }), /pas encore disponible/); // Haut-Plateau : 2 lignes au départ
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    assert.equal(st.trains.length, 1, 'locomotive posée d’office');
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] })); // prolongement
    ok(apply(st, { type: 'line', l: 0, s: [4, 1, 2, 3] })); // par l'autre extrémité
    ok(apply(st, { type: 'line', l: 1, s: [4, 2] })); // station partagée
    assert.equal(inventory(st).free.lines, 0);
    ko(apply(st, { type: 'line', l: 1, s: [4, 2], rev: 0 }), /autre joueur/);
    assert.deepEqual(audit(st), []);
  });
  test('franchissement de l’eau : ressource exigée, compteur exact, restituée', () => {
    const st = lab({ map: 'val-dorme' }); // carré (3) de l'autre côté de la rivière
    st.own.crossings = 1;
    ok(apply(st, { type: 'line', l: 0, s: [1, 3] }));
    assert.equal(segment(st, 1, 3).cross, 1);
    assert.equal(inventory(st).used.crossings, 1);
    ko(apply(st, { type: 'line', l: 1, s: [2, 3] }), /pont/);
    assert.equal(segment(st, 1, 2).cross, 0);
    ok(apply(st, { type: 'line', l: 0, s: [] }));
    assert.equal(inventory(st).free.crossings, 1, 'pont rendu à la suppression');
    ok(apply(st, { type: 'line', l: 1, s: [2, 3] }));
  });
  test('croisement visuel sans correspondance', () => {
    const st = lab({ stations: [[100, 300, 'circle'], [500, 300, 'square'], [300, 100, 'triangle'], [300, 500, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    ok(apply(st, { type: 'line', l: 1, s: [3, 4] }));
    const p = addPass(st, 1, 'triangle');
    assert.equal(reachable(st, p), false, 'deux lignes qui se croisent sans station commune');
  });
  test('boucle : circulation sans demi-tour', () => {
    const st = lab({ stations: [[200, 200, 'circle'], [500, 200, 'triangle'], [500, 500, 'square'], [200, 500, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3, 4], loop: true }));
    const line = st.lines[0];
    assert.deepEqual(nextStop(line, 4, 1), { nx: 1, dir: 1 });
    assert.deepEqual(nextStop({ s: [1, 2, 3], loop: false }, 3, 1), { nx: 2, dir: -1 });
    const t = st.trains[0];
    const visits = [];
    for (let i = 0; i < 3000; i++) { step(st); if (t.st === 'dwell' && visits[visits.length - 1] !== t.b) visits.push(t.b); }
    assert.deepEqual(visits.slice(0, 6), [1, 2, 3, 4, 1, 2]);
  });
  test('modification sous un train : il finit son tronçon, ses voyageurs restent', () => {
    const st = lab({ stations: [[200, 200, 'circle'], [500, 200, 'triangle'], [800, 200, 'square']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] }));
    addPass(st, 1, 'square');
    runUntil(st, () => st.trains[0].st === 'move' && st.trains[0].ld.length === 1);
    ok(apply(st, { type: 'line', l: 0, s: [2, 3] })); // retire la station de départ
    assert.equal(st.trains[0].ld.length, 1);
    assert.ok(runUntil(st, () => st.score === 1));
    assert.deepEqual(audit(st), []);
  });
  test('suppression d’une ligne : trains rendus, voyageurs déposés sans disparaître', () => {
    const st = lab({ stations: [[200, 200, 'circle'], [500, 200, 'triangle'], [800, 200, 'square']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] }));
    addPass(st, 1, 'square'); addPass(st, 1, 'square');
    runUntil(st, () => st.trains[0].ld.length === 2 && st.trains[0].st === 'move');
    const before = Object.keys(st.pass).length;
    ok(apply(st, { type: 'line', l: 0, s: [] }));
    assert.equal(st.trains.length, 0);
    assert.equal(inventory(st).free.locos, cfgOf(st).limits.startingLocomotives);
    assert.equal(Object.keys(st.pass).length, before);
    assert.deepEqual(audit(st), []);
  });
});

describe('voyageurs et routage', () => {
  test('livraison simple, comptée une seule fois', () => {
    const st = lab({ stations: [[200, 200, 'circle'], [500, 200, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    addPass(st, 1, 'triangle');
    assert.ok(runUntil(st, () => st.score === 1));
    run(st, 2000);
    assert.equal(st.score, 1);
    assert.equal(Object.keys(st.pass).length, 0);
  });
  test('choix parmi plusieurs stations de la bonne forme : la plus proche', () => {
    const st = lab({ stations: [[100, 200, 'triangle'], [400, 200, 'circle'], [1300, 200, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] }));
    Object.assign(st.trains[0], { a: 3, b: 3, dir: -1, nx: 2 }); // le train part de l'extrémité lointaine
    const p = addPass(st, 2, 'triangle');
    const rt = routes(st);
    assert.ok(Number.isFinite(rt.D.triangle[rt.idx.get(2)]));
    const deliveredAt = [];
    for (let i = 0; i < 6000 && st.score === 0; i++) { step(st); for (const e of drainEvents(st)) if (e.k === 'deliver') deliveredAt.push(e.s); }
    assert.deepEqual(deliveredAt, [1]);
    void p;
  });
  test('correspondance entre deux lignes, avec coût de transfert', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [400, 200, 'square'], [400, 500, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    ok(apply(st, { type: 'line', l: 1, s: [2, 3] }));
    addPass(st, 1, 'triangle');
    let transferAt = -1, boardAgain = -1;
    for (let i = 0; i < 8000 && st.score === 0; i++) {
      step(st);
      for (const e of drainEvents(st)) {
        if (e.k === 'transfer') transferAt = st.t;
        if (e.k === 'board' && transferAt > 0 && boardAgain < 0) boardAgain = st.t;
      }
    }
    assert.equal(st.score, 1);
    assert.equal(st.stats.transfers, 1);
    assert.ok(boardAgain - transferAt >= cfgOf(st).trains.transferTicks, 'la correspondance prend du temps');
  });
  test('pôle d’échange : correspondance plus rapide, capacité 18', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [400, 200, 'square'], [400, 500, 'triangle']] });
    st.own.hubs = 1;
    const s2 = st.stations[1];
    assert.equal(stationCapacity(st, s2), 5);
    ok(apply(st, { type: 'hub', s: 2 }));
    ko(apply(st, { type: 'hub', s: 2 }), /déjà/);
    ko(apply(st, { type: 'hubDel', s: 2 }), /définitif/);
    assert.equal(stationCapacity(st, s2), 18);
    assert.equal(inventory(st).free.hubs, 0);
  });
  test('itinéraire impossible puis possible après modification', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [400, 200, 'square'], [700, 200, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    const p = addPass(st, 1, 'triangle');
    run(st, 1500);
    assert.equal(st.pass[p.id].s, 1, 'reste à quai');
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] }));
    assert.ok(runUntil(st, () => st.score === 1));
  });
  test('capacité du train, wagon', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [900, 200, 'triangle']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    const t = st.trains[0];
    for (let i = 0; i < 10; i++) addPass(st, 1, 'triangle');
    runUntil(st, () => t.st === 'move');
    assert.equal(t.ld.length, 6);
    assert.equal(st.stations[0].q.length, 4);
    ko(apply(st, { type: 'car', tr: t.id }), /wagon/);
    st.own.cars = 1;
    ok(apply(st, { type: 'car', tr: t.id }));
    assert.equal(trainCapacity(st, t), 12);
    assert.equal(inventory(st).free.cars, 0);
  });
  test('plusieurs trains, limite par ligne, réaffectation sans duplication', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [500, 200, 'triangle'], [500, 600, 'square']] });
    st.own.locos = 6;
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    ok(apply(st, { type: 'line', l: 1, s: [2, 3] }));
    for (let i = 0; i < 3; i++) ok(apply(st, { type: 'train', l: 0 }));
    ko(apply(st, { type: 'train', l: 0 }), /maximum/);
    const t = st.trains.find(x => x.l === 0);
    ok(apply(st, { type: 'trainMove', tr: t.id, l: 1 }));
    assert.equal(st.trains.filter(x => x.id === t.id).length, 1);
    assert.equal(st.trains.filter(x => x.l === 0).length, 3);
    assert.equal(inventory(st).used.locos, 5);
  });
  test('express plus rapide que la locomotive de base', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [1100, 200, 'triangle']] });
    st.own.express = 1;
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    ok(apply(st, { type: 'train', l: 0, kind: 'express' }));
    run(st, 30);
    const [base, exp] = st.trains;
    assert.ok(exp.T < base.T);
  });
});

describe('surcharge et modes', () => {
  const crowd = st => { for (let i = 0; i < 9; i++) addPass(st, 1, 'triangle'); };
  test('Classique : surcharge prolongée = fin de partie, station fautive connue', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [500, 200, 'triangle']] });
    crowd(st);
    run(st, cfgOf(st).overload.graceTicks - 2);
    assert.equal(st.over, null);
    run(st, 5);
    assert.equal(st.over.s, 1);
    const sc = st.score; run(st, 100); assert.equal(st.score, sc, 'plus rien ne bouge');
  });
  test('l’anneau redescend quand la file se vide', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [500, 200, 'triangle']] });
    crowd(st);
    run(st, 300);
    const o = st.stations[0].o;
    assert.ok(o > 0.3);
    st.pass = {}; st.stations[0].q = [];
    run(st, 100);
    assert.ok(st.stations[0].o < o - 0.15);
  });
  test('l’anneau est suspendu pendant qu’un train est à quai', () => {
    const st = lab({ stations: [[100, 200, 'circle'], [500, 200, 'square']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    crowd(st); // destinations triangle : introuvables, le train reste à quai sans les prendre
    st.trains[0].dw = -100000; // à quai indéfiniment
    st.trains[0].nx = null;
    run(st, 200);
    assert.equal(st.stations[0].o, 0);
  });
  test('Infini : jamais de fin, efficacité et récompense au seuil', () => {
    const st = lab({ mode: 'infinite', stations: [[100, 200, 'circle'], [500, 200, 'triangle']] });
    crowd(st);
    run(st, 3000);
    assert.equal(st.over, null);
    assert.ok(st.eff < 0.5);
    st.eff = 0.999;
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    runUntil(st, () => !!st.reward, 4000);
    assert.ok(st.reward, 'récompense au seuil d’efficacité');
  });
  test('Extrême : placements verrouillés, prolongement seul permis', () => {
    const st = lab({ mode: 'extreme', stations: [[100, 200, 'circle'], [400, 200, 'triangle'], [700, 200, 'square']] });
    ok(apply(st, { type: 'line', l: 0, s: [1, 2] }));
    ko(apply(st, { type: 'line', l: 0, s: [] }), /Extrême/);
    ko(apply(st, { type: 'line', l: 0, s: [3, 2] }), /Extrême/);
    ok(apply(st, { type: 'line', l: 0, s: [1, 2, 3] }));
    ko(apply(st, { type: 'trainDel', tr: st.trains[0].id }), /Extrême/);
    ko(apply(st, { type: 'trainMove', tr: st.trains[0].id, l: 0 }), /Extrême/);
    st.own.cars = 1;
    ok(apply(st, { type: 'car', tr: st.trains[0].id }));
    ko(apply(st, { type: 'carDel', tr: st.trains[0].id }), /Extrême/);
  });
  test('Créatif : stations éditables, ressources illimitées, pas de défaite', () => {
    const st = createGame({ map: 'val-dorme', mode: 'creative', seed: 1 });
    assert.ok(inventory(st).free.locos > 50);
    ok(apply(st, { type: 'stAdd', x: 300, y: 430, shape: 'star' }));
    ko(apply(st, { type: 'stAdd', x: 305, y: 435, shape: 'circle' }), /impossible/);
    ko(apply(st, { type: 'stAdd', x: 300, y: 590, shape: 'circle' }), /impossible/); // dans la rivière
    const id = st.stations[st.stations.length - 1].id;
    ok(apply(st, { type: 'stMove', s: id, x: 340, y: 470 }));
    ok(apply(st, { type: 'line', l: 0, s: [1, id] }));
    ok(apply(st, { type: 'stDel', s: id }));
    assert.equal(st.lines[0].s.length, 0, 'ligne devenue trop courte supprimée');
    ok(apply(st, { type: 'creative', growth: true }));
    for (let i = 0; i < 9; i++) addPass(st, 1, 'triangle');
    run(st, 3000);
    assert.equal(st.over, null);
    ko(apply(createGame({ map: 'val-dorme' }), { type: 'stAdd', x: 300, y: 300, shape: 'star' }), /Créatif/);
  });
  test('pause et vitesse 2× pilotées par l’horloge de simulation', () => {
    const st = createGame({ map: 'val-dorme', seed: 1 });
    ok(apply(st, { type: 'speed', v: 0 }));
    run(st, 100);
    assert.equal(st.t, 0);
    assert.equal(st.tick, 100);
    ok(apply(st, { type: 'speed', v: 2 }));
    run(st, 100);
    assert.equal(st.t, 200);
    ko(apply(st, { type: 'speed', v: 3 }));
  });
  test('modes : comportements distincts', () => {
    assert.deepEqual(Object.keys(MODES), ['classic', 'infinite', 'extreme', 'creative']);
    assert.ok(MODES.classic.lose && MODES.extreme.lose && !MODES.infinite.lose && !MODES.creative.lose);
    assert.ok(MODES.extreme.locked && !MODES.classic.locked);
  });
});

describe('récompenses', () => {
  test('fin de semaine : locomotive + choix entre deux améliorations distinctes', () => {
    const st = createGame({ map: 'val-dorme', seed: 2 });
    const locos = st.own.locos;
    runUntil(st, () => !!st.reward, 3000);
    assert.equal(st.t, 1960);
    assert.equal(st.own.locos, locos + 1);
    assert.equal(st.reward.opts.length, 2);
    assert.notEqual(st.reward.opts[0].k, st.reward.opts[1].k);
    const t = st.t; run(st, 50); assert.equal(st.t, t, 'solo : le temps attend le choix');
    const pick = st.reward.opts[0];
    const before = { ...st.own };
    ok(apply(st, { type: 'reward', pick: 0 }));
    const key = { line: 'lines', carriage: 'cars', crossings: 'crossings', hub: 'hubs' }[pick.k];
    assert.equal(st.own[key], before[key] + pick.n);
    ko(apply(st, { type: 'reward', pick: 0 }), /Aucune/);
  });
  test('ligne proposée seulement sous le maximum', () => {
    const st = createGame({ map: 'val-dorme', seed: 2 });
    st.traffic = false;
    st.own.lines = cfgOf(st).limits.maxLines;
    for (let w = 0; w < 6; w++) {
      runUntil(st, () => !!st.reward, 3000);
      assert.ok(!st.reward.opts.some(o => o.k === 'line'));
      apply(st, { type: 'reward', pick: 0 });
    }
  });
  test('exceptions de carte : choix de locomotive express, deux locomotives par semaine', () => {
    const d = createGame({ map: 'delta-sauge', seed: 2 });
    d.traffic = false;
    runUntil(d, () => !!d.reward, 3000);
    assert.equal(d.reward.loco.length, 2);
    ok(apply(d, { type: 'reward', pick: 0, loco: 1 }));
    assert.equal(d.own.express, 1);
    const l = createGame({ map: 'lagune-haute', seed: 2 });
    l.traffic = false;
    const n = l.own.locos;
    runUntil(l, () => !!l.reward, 3000);
    assert.equal(l.own.locos, n + 2);
  });
  test('multijoueur : la récompense n’arrête pas le temps et se choisit d’office', () => {
    const st = createGame({ map: 'val-dorme', seed: 2, multi: true });
    st.traffic = false;
    runUntil(st, () => !!st.reward, 3000);
    run(st, 405);
    assert.equal(st.reward, null);
    assert.ok(st.t > 2300);
  });
});

describe('robustesse', () => {
  test('longue partie automatique : intégrité, aucun doublon, temps de calcul', () => {
    for (const m of MAPS) {
      const st = createGame({ map: m.id, seed: 1234 });
      const stats = { cmds: 0, rejected: 0, picks: {} };
      const t0 = performance.now();
      let ticks = 0;
      for (; ticks < 72000 && !st.over; ticks++) {
        step(st);
        if (ticks % 40 === 0) botTurn(st, stats);
        if (ticks % 4000 === 0) assert.deepEqual(audit(st), [], m.id);
      }
      const ms = performance.now() - t0;
      assert.deepEqual(audit(st), [], m.id);
      assert.ok(st.score > 50, `${m.id} : ${st.score} livrés`);
      assert.ok(ms / ticks < 1, `${m.id} : ${(ms / ticks).toFixed(3)} ms/tick`);
      console.log(`  ${m.id.padEnd(16)} score ${String(st.score).padStart(5)} · semaine ${st.week} · ${st.stations.length} stations · ${(ms / ticks * 1000).toFixed(0)} µs/tick · ${st.over ? 'fin' : 'tient'}`);
    }
  });
  test('instantané : reprise identique à la partie continue', () => {
    const a = createGame({ map: 'baie-brumes', seed: 99 });
    for (let i = 0; i < 5000; i++) { step(a); if (i % 40 === 0) botTurn(a); }
    const b = snapshot(a);
    for (let i = 0; i < 3000; i++) { step(a); step(b); if (i % 40 === 0) { botTurn(a); botTurn(b); } }
    assert.equal(stateHash(a), stateHash(b));
  });
});

describe('défis et progression', () => {
  test('défi du jour : même graine pour tous, change chaque jour', () => {
    const a = dailyChallenge(new Date('2026-10-15T08:00:00Z')), b = dailyChallenge(new Date('2026-10-15T22:00:00Z'));
    assert.deepEqual(a, b);
    assert.notEqual(dailyChallenge(new Date('2026-10-16T08:00:00Z')).seed, a.seed);
  });
  test('défi de la semaine : modificateurs reproductibles', () => {
    const a = weeklyChallenge(new Date('2026-10-12T00:00:00Z')), b = weeklyChallenge(new Date('2026-10-18T23:00:00Z'));
    assert.equal(a.key, b.key);
    assert.deepEqual(a.mods, b.mods);
    assert.equal(a.mods.length, 2);
    const st = createGame({ map: a.map, seed: a.seed, patch: a.patch });
    assert.ok(cfgOf(st));
  });
  test('records, tentative officielle unique, succès, déblocage, migration', () => {
    const p = newProfile();
    assert.equal(isUnlocked(p, 'haut-plateau'), false);
    const r1 = recordRun(p, { map: 'val-dorme', mode: 'classic', kind: 'daily', challenge: 'daily:x', score: 420, week: 6, maxLines: 3, maxCrossings: 1, hubs: 0, loops: 0, seed: 1, date: 'd' });
    assert.equal(r1.best, true);
    assert.equal(r1.official, 420);
    assert.ok(r1.achievements.some(a => a.id === 'first100'));
    assert.ok(r1.achievements.some(a => a.id === 'sober'));
    const r2 = recordRun(p, { map: 'val-dorme', mode: 'classic', kind: 'daily', challenge: 'daily:x', score: 500, week: 6, maxLines: 4, maxCrossings: 1, hubs: 0, loops: 0, seed: 1, date: 'd' });
    assert.equal(r2.official, null, 'deuxième tentative = entraînement');
    assert.equal(p.challenges['daily:x'].official, 420);
    assert.equal(p.records['val-dorme:classic'].best, 500);
    assert.equal(isUnlocked(p, 'haut-plateau'), true);
    const m = migrateProfile({ records: { a: 1 }, settings: { sfx: 0.1 } });
    assert.equal(m.settings.sfx, 0.1);
    assert.equal(m.settings.music, 0.5);
    assert.deepEqual(m.records, { a: 1 });
  });
});
