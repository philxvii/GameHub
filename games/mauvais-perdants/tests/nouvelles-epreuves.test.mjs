// Les cinq épreuves ajoutées le 29/10 : encre, chrono, intrus, anagramme, metronome.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { round } from '../js/rounds/index.js';
import { accepts } from '../js/rounds/anagramme.js';
import { PICK_ORDER, drawPlan, encodePicks, decodePicks } from '../js/draw.js';

const SEED = 'NEWGAMES';
const IDS = ['encre', 'chrono', 'intrus', 'anagramme', 'metronome'];

describe('nouvelles épreuves', () => {
  test('enregistrées, déterministes, dans le choix de l’hôte', () => {
    for (const id of IDS) {
      const r = round(id);
      assert.ok(r, id);
      assert.deepEqual(r.params(SEED, 1, {}), r.params(SEED, 1, {}), id);
      assert.notDeepEqual(r.params(SEED, 1, {}), r.params('AUTRE123', 1, {}), id);
      assert.ok(PICK_ORDER.includes(id), id);
    }
    assert.deepEqual(decodePicks(encodePicks(IDS)).sort(), IDS.slice().sort());
  });
  test('un tirage peut les contenir et reste de 5 manches', () => {
    const seen = new Set();
    for (let k = 0; k < 40; k++) drawPlan(`S${k}`, {}).forEach(x => seen.add(x.g));
    for (const id of IDS) assert.ok(seen.has(id), id);
    assert.equal(drawPlan('S1', {}).length, 5);
  });
  test('encre : juste +1, faux −1', () => {
    const p = round('encre').params(SEED, 0);
    const good = p.items.slice(0, 10).map(x => x.c);
    assert.equal(round('encre').score({ a: good }, p).stats.net, 10);
    assert.equal(round('encre').score({ a: good.map(c => (c + 1) % 4) }, p).stats.net < 0, true);
    assert.ok(p.items.every(x => x.w !== x.c));
  });
  test('chrono : l’écart le plus petit gagne, pas de réponse = erreur pleine', () => {
    const r = round('chrono'), p = r.params(SEED, 0);
    const perfect = r.score({ t: p.targets }, p), off = r.score({ t: p.targets.map(t => t + 700) }, p), none = r.score({}, p);
    assert.equal(perfect.stats.total, 0);
    assert.ok(perfect.key[0] < off.key[0] && off.key[0] < none.key[0]);
    assert.equal(none.idle, true);
  });
  test('intrus : plus vite et moins de ratés gagne ; incomplet derrière', () => {
    const r = round('intrus');
    const fast = r.score({ hits: 12, miss: 0, ms: 15000 }, {}), slow = r.score({ hits: 12, miss: 2, ms: 15000 }, {}), part = r.score({ hits: 9, miss: 0, ms: 15000 }, {});
    assert.ok(fast.key[1] < slow.key[1]);
    assert.ok(slow.key[0] < part.key[0]);
    assert.ok(r.score({ hits: 12, miss: 0, ms: 1 }, {}).stats.total >= 4800);   // plancher anti-triche
  });
  test('anagramme : le mot ou une anagramme de la banque est accepté', () => {
    const r = round('anagramme'), p = r.params(SEED, 0);
    assert.equal(p.items.length, 8);
    for (const it of p.items) { assert.notEqual(it.s, it.w); assert.equal(it.s.split('').sort().join(''), it.w.split('').sort().join('')); assert.ok(accepts(it, it.w)); assert.ok(!accepts(it, 'zzzzzz')); }
    assert.equal(r.score({ a: p.items.map(i => i.w), ms: 20000 }, p).stats.found, 8);
    assert.equal(r.score({ a: ['', 'x'], ms: 1 }, p).stats.found, 0);
  });
  test('métronome : le bon tempo gagne, des touches manquantes coûtent', () => {
    const r = round('metronome'), p = r.params(SEED, 0);
    const row = per => Array(7).fill(per);
    const perfect = r.score({ r: p.periods.map(row) }, p), sloppy = r.score({ r: p.periods.map(per => row(per + 120)) }, p), missing = r.score({ r: p.periods.map(per => [per, per]) }, p);
    assert.equal(perfect.stats.avg, 0);
    assert.ok(perfect.key[0] < sloppy.key[0] && sloppy.key[0] < missing.key[0]);
    assert.ok(r.params(SEED, 0).periods.every(x => x >= 520 && x <= 900));
  });
  test('payloads absurdes : jamais d’exception ni de NaN', () => {
    for (const id of IDS) {
      const r = round(id), p = r.params(SEED, 0);
      for (const j of [null, undefined, {}, { a: 5, t: 'x', r: [null, 3], hits: 1e9, miss: -4, ms: NaN }, { a: [{}, [], 'abc'], t: [NaN, -5, 1e12] }]) {
        const s = r.score(j, p);
        assert.ok(Array.isArray(s.key) && s.key.every(x => !Number.isNaN(x)), `${id} ${JSON.stringify(j)}`);
        assert.equal(typeof s.label, 'string');
      }
    }
  });
});
