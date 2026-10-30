// Les cinq épreuves « jeu télé » ajoutées le 30/10 : quiz, cadenas, paires, compte, ordre.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { round } from '../js/rounds/index.js';
import { QUESTIONS, BANK } from '../js/rounds/quiz.js';
import { feedback, marks, validGuess, replay as cadReplay, LEN, MAX_TRIES } from '../js/rounds/cadenas.js';
import { replay as prReplay, layout, PAIRS } from '../js/rounds/paires.js';
import { apply, replay as ctReplay, puzzle, COUNT } from '../js/rounds/compte.js';
import { sets, BANK as ODRE, SIZE, SETS } from '../js/rounds/ordre.js';
import { PICK_ORDER, drawPlan, encodePicks, decodePicks } from '../js/draw.js';
import { compareKeys } from '../js/rounds/contract.js';
import { readFileSync } from 'node:fs';
import { decide, NO_STALL } from '../js/machine.js';

const SEED = 'TELEJEUX';
const IDS = ['quiz', 'cadenas', 'paires', 'compte', 'ordre'];

describe('cinq épreuves jeu télé : enregistrement', () => {
  test('enregistrées, déterministes, dans le choix de l’hôte, tirables', () => {
    for (const id of IDS) {
      const r = round(id);
      assert.ok(r, id);
      assert.deepEqual(r.params(SEED, 1, {}), r.params(SEED, 1, {}), id);
      assert.notDeepEqual(r.params(SEED, 1, {}), r.params('AUTRE123', 1, {}), id);
      assert.ok(PICK_ORDER.includes(id), id);
    }
    assert.deepEqual(decodePicks(encodePicks(IDS)).sort(), IDS.slice().sort());
    const seen = new Set();
    for (let k = 0; k < 120; k++) drawPlan(`T${k}`, {}).forEach(x => seen.add(x.g));
    for (const id of IDS) assert.ok(seen.has(id), id);
  });
});

describe('La Question', () => {
  test('banque saine : quatre réponses différentes, la bonne en tête', () => {
    assert.ok(BANK.length >= 45);
    for (const [q, ...c] of BANK) { assert.ok(q.endsWith('?'), q); assert.equal(c.length, 4, q); assert.equal(new Set(c).size, 4, q); }
    assert.equal(new Set(BANK.map(b => b[0])).size, BANK.length, 'pas de question en double');
  });
  test('dix questions, bonne réponse retrouvée après mélange', () => {
    const p = round('quiz').params(SEED, 0);
    assert.equal(p.qs.length, QUESTIONS);
    for (const q of p.qs) { assert.equal(q.c.length, 4); assert.ok(q.a >= 0 && q.a < 4); const src = BANK.find(b => b[0] === q.q); assert.equal(q.c[q.a], src[1]); }
  });
  test('score : bonnes réponses d’abord, puis le temps sur les bonnes ; pas humain = plancher', () => {
    const r = round('quiz'), p = r.params(SEED, 0);
    const all = p.qs.map(q => q.a), wrong = p.qs.map(q => (q.a + 1) % 4);
    const fast = r.score({ a: all, t: all.map(() => 1000) }, p), slow = r.score({ a: all, t: all.map(() => 5000) }, p);
    const half = r.score({ a: all.map((x, k) => (k < 5 ? x : wrong[k])), t: all.map(() => 500) }, p);
    assert.equal(fast.stats.good, QUESTIONS);
    assert.ok(compareKeys(fast.key, slow.key) < 0 && compareKeys(slow.key, half.key) < 0);
    assert.equal(r.score({ a: all, t: all.map(() => 0) }, p).stats.ms, QUESTIONS * 250, 'temps nul relevé au plancher');
    assert.equal(r.score({}, p).idle, true);
  });
});

describe('Le Cadenas', () => {
  test('retour du cadenas : bien placés et mal placés', () => {
    assert.deepEqual(feedback('1234', '1234'), { b: 4, m: 0 });
    assert.deepEqual(feedback('1234', '4321'), { b: 0, m: 4 });
    assert.deepEqual(feedback('1234', '1567'), { b: 1, m: 0 });
    assert.deepEqual(feedback('1234', '2178'), { b: 0, m: 2 });
    assert.ok(validGuess('1234') && !validGuess('1123') && !validGuess('12a4') && !validGuess('123'));
  });
  test('couleur de chaque chiffre : vert bien placé, jaune mal placé, gris absent', () => {
    assert.deepEqual(marks('3412', '3051'), ['b', 'x', 'x', 'm']);
    assert.deepEqual(marks('3412', '3142'), ['b', 'm', 'm', 'b']);
    assert.deepEqual(marks('3412', '3412'), ['b', 'b', 'b', 'b']);
    assert.deepEqual(marks('3412', '0567'), ['x', 'x', 'x', 'x']);
  });
  test('code de quatre chiffres tous différents, rejeu : un essai invalide est ignoré', () => {
    const p = round('cadenas').params(SEED, 0);
    assert.equal(p.secret.length, LEN); assert.equal(new Set(p.secret).size, LEN);
    assert.deepEqual(cadReplay(p.secret, ['1123', p.secret]), { tries: 1, solved: true, best: 8 });
  });
  test('score : moins d’essais gagne, non résolu derrière, essai gratuit impossible', () => {
    const r = round('cadenas'), p = r.params(SEED, 0);
    const wrong = ['0123', '4567', '8901'].map(g => (g === p.secret ? '9876' : g));
    const one = r.score({ g: [p.secret], ms: 5000 }, p), three = r.score({ g: [...wrong, p.secret], ms: 20000 }, p);
    const none = r.score({ g: wrong }, p);
    assert.equal(one.stats.tries, 1); assert.equal(three.stats.tries, 4);
    assert.ok(compareKeys(one.key, three.key) < 0 && compareKeys(three.key, none.key) < 0);
    assert.equal(r.score({ g: [...Array(MAX_TRIES + 1).fill('0123'), p.secret] }, p).stats.solved, false, 'plus d’essais que permis');
    assert.equal(r.score({}, p).idle, true);
  });
});

describe('Les Paires', () => {
  test('seize cartes, huit paires, disposition identique pour tous', () => {
    const c = layout(SEED, 0);
    assert.equal(c.length, 16);
    for (let s = 0; s < PAIRS; s++) assert.equal(c.filter(x => x === s).length, 2);
    assert.deepEqual(layout(SEED, 0), c);
  });
  test('rejeu : un coup = deux cartes ; gestes impossibles ignorés ; toutes trouvées = fini', () => {
    const c = layout(SEED, 0), pairs = [];
    for (let s = 0; s < PAIRS; s++) pairs.push(c.flatMap((x, i) => (x === s ? [i] : [])));
    const perfect = pairs.flat();
    assert.deepEqual(prReplay(c, perfect), { tries: PAIRS, matched: PAIRS });
    assert.equal(prReplay(c, [pairs[0][0], pairs[0][0], pairs[0][1], pairs[0][0], 99, -3]).matched, 1, 'même carte deux fois, carte déjà trouvée, indices faux');
  });
  test('score : moins de coups gagne, partiel derrière', () => {
    const r = round('paires'), p = r.params(SEED, 0);
    const pairs = [];
    for (let s = 0; s < PAIRS; s++) pairs.push(p.cards.flatMap((x, i) => (x === s ? [i] : [])));
    const ideal = r.score({ f: pairs.flat(), ms: 30000 }, p);
    const miss = [pairs[0][0], pairs[1][0], ...pairs.flat()];
    const sloppy = r.score({ f: miss, ms: 30000 }, p);
    const partial = r.score({ f: pairs.slice(0, 3).flat(), ms: 10000 }, p);
    assert.equal(ideal.stats.tries, PAIRS); assert.equal(sloppy.stats.tries, PAIRS + 1);
    assert.ok(compareKeys(ideal.key, sloppy.key) < 0 && compareKeys(sloppy.key, partial.key) < 0);
    assert.equal(r.score({}, p).idle, true);
  });
});

describe('Le Compte est bon', () => {
  test('opérations permises : pas de négatif, pas de reste', () => {
    assert.equal(apply(7, 3, '+'), 10); assert.equal(apply(7, 3, '−'), 4); assert.equal(apply(3, 7, '−'), null);
    assert.equal(apply(6, 3, '÷'), 2); assert.equal(apply(7, 2, '÷'), null); assert.equal(apply(5, 5, '÷'), null); assert.equal(apply(4, 3, '×'), 12);
  });
  test('toujours six nombres et un total atteignable, pour 200 graines', () => {
    for (let k = 0; k < 200; k++) {
      const pz = puzzle(`C${k}`, k % 5);
      assert.equal(pz.nums.length, COUNT);
      assert.ok(pz.target >= 101 && pz.target <= 999, `total ${pz.target}`);
    }
  });
  test('rejeu : un écart nul se prouve ; une opération interdite arrête le rejeu', () => {
    const nums = [3, 4, 5, 6, 7, 10], target = 17;
    assert.equal(ctReplay(nums, target, []).best, 7, 'sans rien faire : le plus proche des nombres de départ (10)');
    assert.equal(ctReplay(nums, target, [[5, 4, '+']]).best, 0, '10 + 7 = 17');
    assert.equal(ctReplay(nums, target, [[0, 1, '−'], [5, 4, '+']]).made, 0, 'une soustraction négative interdit tout ce qui suit');
    assert.equal(ctReplay(nums, target, [[0, 0, '+']]).made, 0, 'même nombre deux fois');
    assert.equal(ctReplay(nums, target, [[0, 9, '+']]).made, 0, 'indice hors liste');
  });
  test('score : le plus proche gagne, puis le plus rapide ; rien fait = absent', () => {
    const r = round('compte');
    const p = { nums: [3, 4, 5, 6, 7, 10], target: 17 };
    const exact = r.score({ s: [[5, 4, '+']], ms: 4000 }, p), close = r.score({ s: [[0, 1, '+']], ms: 3000 }, p);
    assert.equal(exact.label, 'le compte est bon');
    assert.ok(compareKeys(exact.key, close.key) < 0);
    assert.equal(r.score({}, p).idle, true);
  });
});

describe('Dans l’ordre', () => {
  test('banque saine : valeurs toutes différentes dans une série', () => {
    for (const [q, unit, items] of ODRE) { assert.ok(q && unit && items.length >= SIZE, q); assert.equal(new Set(items.map(i => i[1])).size, items.length, q); }
  });
  test('six séries de cinq, vérité = indices triés par valeur', () => {
    const s = sets(SEED, 0);
    assert.equal(s.length, SETS);
    for (const x of s) {
      assert.equal(x.items.length, SIZE);
      const vals = x.truth.map(t => x.items[t].v);
      assert.deepEqual(vals, vals.slice().sort((a, b) => a - b));
    }
  });
  test('score : chaque élément bien placé compte ; réponse invalide ignorée', () => {
    const r = round('ordre'), p = r.params(SEED, 0);
    const perfect = r.score({ o: p.sets.map(s => s.truth), ms: 60000 }, p);
    const reversed = r.score({ o: p.sets.map(s => s.truth.slice().reverse()), ms: 60000 }, p);
    const dup = r.score({ o: p.sets.map(() => [0, 0, 1, 2, 3]), ms: 60000 }, p);
    assert.equal(perfect.stats.good, SETS * SIZE);
    assert.ok(reversed.stats.good < SETS * SIZE);
    assert.equal(dup.stats.good, 0);
    assert.ok(compareKeys(perfect.key, reversed.key) < 0);
    assert.equal(r.score({}, p).idle, true);
  });
});

describe('page du jeu', () => {
  test('aucun identifiant HTML en double (le sélecteur de manches avait le même id que le nombre de candidats)', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dup = ids.filter((x, k) => ids.indexOf(x) !== k);
    assert.deepEqual(dup, []);
  });
});

describe('deux parties qui se suivent : jamais le même contenu', () => {
  const room = tid => ({ tid, who: ['a', 'b'], solo: false });
  const keys = {
    quiz: p => p.qs.map(q => q.q),
    ordre: p => p.sets.map(s => s.q + s.unit),
    prix: p => p.items.map(i => i.code),
    dictee: p => [p.phrase],
  };
  test('graines différentes, numéros de partie consécutifs : aucun élément en commun', () => {
    for (const [id, key] of Object.entries(keys)) {
      for (let k = 0; k < 60; k++) {
        const a = key(round(id).params(`G${k}`, 1, room(`t${40 + k}`))), b = key(round(id).params(`H${k}`, 3, room(`t${41 + k}`)));
        assert.deepEqual(a.filter(x => b.includes(x)), [], `${id} : ${a} / ${b}`);
      }
    }
  });
  test('sans numéro de partie connu (tests, solo ancien) : aucune restriction, rien ne casse', () => {
    for (const id of Object.keys(keys)) assert.ok(keys[id](round(id).params(SEED, 0, {})).length > 0, id);
  });
});

describe('joueur qui réfléchit : jamais compté absent', () => {
  const F = (o = {}) => ({ now: 1000, online: new Set(['a', 'b']), ready: new Set(), voted: new Set(), submitted: new Set(), judged: false, needsVote: true, tiebreak: null, skip: false, ...o });
  const base = id => ({ tid: 't1', rk: 'r0', i: 0, step: 'play', at: 0, end: 90000, plan: [{ g: id }], roster: { a: {}, b: {} }, seq: 1 });
  test('épreuves de réflexion : un joueur sans progrès depuis 25 s n’est pas écarté', () => {
    for (const id of ['compte', 'cadenas', 'quiz', 'ordre', 'paires', 'anagramme', 'bac']) {
      assert.ok(NO_STALL.includes(id), id);
      assert.equal(decide(base(id), F({ now: 40000, submitted: new Set(['a']), stalled: new Set(['b']) })), null, `${id} : on attend b`);
    }
  });
  test('épreuves continues : un joueur figé depuis 25 s n’est plus attendu (comme avant)', () => {
    assert.equal(decide(base('gong'), F({ now: 40000, submitted: new Set(['a']), stalled: new Set(['b']) })).step, 'reveal');
  });
  test('Compte : « Je m’arrête là » sans opération est une manche jouée, un rendu vide est absent', () => {
    const r = round('compte'), p = { nums: [3, 4, 5, 6, 7, 10], target: 17 };
    assert.equal(r.score({ s: [], ms: 20000 }, p).idle, false);
    assert.equal(r.score({}, p).idle, true);
  });
});
