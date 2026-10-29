// Règles du 421, sans navigateur :
//   node --test games/421/tests/rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { combo, startGame, roll, stop, settle, nextGame, current, limitOf, activeOf, botKeep, botStops, randomDice, POT } from '../rules.js';

const lobby = n => ({ phase: 'lobby', gameNum: 1, players: Array.from({ length: n }, (_, i) => ({ name: `J${i}`, tokens: 0, losses: 0 })) });
// Joue le tour du joueur courant : `rolls` = suite de tirages, gardés selon `keep`.
const turn = (g, rolls, keeps = []) => {
  const p = current(g);
  for (const [i, values] of rolls.entries()) {
    const r = roll(g, { pnum: p, keep: keeps[i - 1] || [], values });
    assert.ok(r.ok, r.reason);
    g = r.game;
    if (g.phase !== 'playing' || !g.round.cur.r) return g;   // tour terminé tout seul (dernier lancer permis)
  }
  const s = stop(g, { pnum: p });
  assert.ok(s.ok, s.reason);
  return s.game;
};

describe('Combinaisons', () => {
  test('ordre : 421, trois as, as, brelans, suites, simples, nénette', () => {
    const order = ['421', '111', '611', '211', '666', '222', '654', '321', '665', '532', '221'];
    for (let i = 1; i < order.length; i++) assert.ok(combo(order[i - 1]).rank > combo(order[i]).rank, `${order[i - 1]} > ${order[i]}`);
  });
  test('l’ordre des dés ne compte pas', () => assert.equal(combo('142').kind, '421'));
  test('valeurs en jetons', () => {
    assert.deepEqual(['421', '111', '511', '444', '543', '653', '221'].map(d => combo(d).value), [10, 7, 5, 3, 2, 1, 1]);
  });
});

describe('Une manche', () => {
  test('le premier fixe le nombre de lancers des suivants', () => {
    let g = startGame(lobby(3)).game;
    assert.equal(limitOf(g), 3);
    g = turn(g, ['653', '421'], [[0]]);              // deux lancers
    assert.equal(g.round.max, 2);
    assert.equal(limitOf(g), 2);
    const p = current(g);
    g = roll(g, { pnum: p, values: '611' }).game;
    g = roll(g, { pnum: p, keep: [1, 2], values: '511' }).game;   // deuxième lancer : fin automatique
    assert.notEqual(current(g), p);
  });
  test('coups refusés', () => {
    const g = startGame(lobby(2)).game;
    assert.equal(roll(g, { pnum: 1, values: '123' }).reason, 'turn');
    assert.equal(roll(g, { pnum: 0, values: '129' }).reason, 'dice');
    assert.equal(roll(g, { pnum: 0, keep: [0], values: '123' }).reason, 'keep');
    assert.equal(stop(g, { pnum: 0 }).reason, 'roll');
    assert.equal(roll(g, { pnum: 0, values: '123', expect: 2 }).reason, 'stale');
  });
  test('les dés gardés ne changent pas', () => {
    let g = startGame(lobby(2)).game;
    g = roll(g, { pnum: 0, values: '421' }).game;
    g = roll(g, { pnum: 0, keep: [0, 1], values: '666' }).game;
    assert.equal(g.round.cur.d, '426');
  });
  test('charge : le plus mauvais prend au pot la valeur du meilleur', () => {
    let g = startGame(lobby(3)).game;
    g = turn(g, ['421']);                            // 10 jetons
    g = turn(g, ['653']);
    g = turn(g, ['532']);
    assert.equal(g.pot, POT - 10);
    assert.equal(g.players[2].tokens, 10);
    assert.deepEqual(g.round.order, [2, 0, 1]);      // le perdant commence
  });
  test('égalités : le dernier à faire la plus mauvaise combinaison perd', () => {
    let g = startGame(lobby(3)).game;
    g = turn(g, ['532']); g = turn(g, ['611']); g = turn(g, ['532']);
    assert.equal(g.last.loser, 2);
    assert.equal(g.last.winner, 1);
  });
});

describe('Partie', () => {
  test('décharge : le perdant reçoit les jetons du gagnant, qui sort à zéro', () => {
    const g0 = startGame(lobby(2)).game;
    let g = { ...g0, pot: 0, stage: 'decharge', players: [{ name: 'A', tokens: 2, losses: 0 }, { name: 'B', tokens: 19, losses: 0 }] };
    g.round = { starter: 0, order: [0, 1], turn: 0, max: 3, results: {}, cur: { d: '', r: 0, n: 0 } };
    g = turn(g, ['543']);                            // 2 jetons
    g = turn(g, ['632']);
    assert.equal(g.phase, 'ended');
    assert.deepEqual(g.result, { loser: 1 });
    assert.equal(g.players[1].tokens, 21);
    assert.equal(g.players[1].losses, 1);
    const re = nextGame(g, { gameNum: 1 }).game;
    assert.equal(re.pot, POT);
    assert.equal(current(re), 1);                    // le perdant commence la revanche
    assert.equal(nextGame(g, { gameNum: 4 }).reason, 'stale');
  });
  test('fin de charge : qui n’a aucun jeton est déjà sorti', () => {
    let g = startGame(lobby(3)).game;
    g = { ...g, pot: 3, players: g.players.map((p, i) => ({ ...p, tokens: [10, 8, 0][i] })) };
    g = turn(g, ['421']); g = turn(g, ['222']); g = turn(g, ['653']);   // J2 prend les 3 derniers
    assert.equal(g.stage, 'decharge');
    assert.deepEqual(activeOf(g), [0, 1, 2].filter(i => g.players[i].tokens > 0));
  });
  test('les ordinateurs mènent des parties complètes, jetons conservés', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) {
      let g = startGame(lobby(2 + (k % 6))).game, guard = 0;
      while (g.phase === 'playing' && guard++ < 5000) {
        const p = current(g), d = g.round.cur.d;
        const r = d && botStops(g, d) ? stop(g, { pnum: p }) : roll(g, { pnum: p, keep: d ? botKeep(d) : [], values: randomDice(rnd) });
        assert.ok(r.ok, r.reason);
        g = r.game;
        assert.equal(g.pot + g.players.reduce((n, p) => n + p.tokens, 0), POT);
      }
      assert.equal(g.phase, 'ended');
    }
  });
});
