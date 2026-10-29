// Règles des Échecs, sans navigateur :
//   node --test games/echecs/tests/rules.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, B, START, parseFEN, toFEN, legal, make, unmake, san, fromSAN, uciOf, replay, outcome, insufficient,
  startGame, playMove, claimTime, resign, offerDraw, answerDraw, nextRound, clockNow, whiteOf, colorOfPlayer, toMoves,
} from '../rules.js';
import { think } from '../bot.js';

function perft(st, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of legal(st)) { const u = make(st, m); n += perft(st, d - 1); unmake(st, m, u); }
  return n;
}
// Joue une suite en notation algébrique, renvoie les coups au format UCI.
const ucis = (line, fen = START) => {
  const st = parseFEN(fen);
  return line.split(' ').map(s => { const m = fromSAN(st, s); assert.ok(m, `coup introuvable : ${s}`); make(st, m); return uciOf(m); });
};

describe('Génération des coups (perft, positions de référence)', () => {
  const cases = [
    ['position initiale', START, [20, 400, 8902, 197281]],
    ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
    ['finale de tours et pions', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['promotions et roques', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ];
  for (const [name, fen, want] of cases) test(name, () => {
    const st = parseFEN(fen);
    assert.deepEqual(want.map((_, i) => perft(st, i + 1)), want);
    assert.equal(toFEN(st), fen);               // la position est intacte après make/unmake
  });
});

describe('Coups spéciaux et notation', () => {
  test('petit et grand roque', () => {
    const st = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    assert.ok(fromSAN(st, 'O-O') && fromSAN(st, 'O-O-O'));
    make(st, fromSAN(st, 'O-O'));
    assert.equal(toFEN(st), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });
  test('pas de roque en échec, ni à travers une case attaquée', () => {
    assert.equal(fromSAN(parseFEN('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O'), null);
    assert.equal(fromSAN(parseFEN('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O'), null);
    assert.ok(fromSAN(parseFEN('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'O-O-O'));   // b1 attaquée : permis
  });
  test('prise en passant', () => {
    const r = replay(ucis('e4 a6 e5 d5 exd6'));
    assert.equal(r.st.b[35], '.');                 // le pion noir de d5 a disparu
    assert.equal(r.sans[4], 'exd6');
  });
  test('promotion, avec choix de la pièce', () => {
    const st = parseFEN('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    assert.equal(legal(st).filter(m => m.from === 48).length, 4);
    assert.equal(san(st, fromSAN(st, 'a8=N')), 'a8=N');
  });
  test('levée d’ambiguïté', () => {
    const st = parseFEN('k7/8/8/8/8/8/8/KR5R w - - 0 1');
    assert.ok(fromSAN(st, 'Rbd1') && fromSAN(st, 'Rhd1'));
  });
});

describe('Fins de partie', () => {
  test('mat du berger', () => {
    const r = replay(ucis('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#'));
    assert.deepEqual(outcome(r.st, r.keys), { reason: 'mate', winner: W });
  });
  test('pat', () => {
    assert.deepEqual(outcome(parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), { reason: 'stalemate', winner: -1 });
  });
  test('matériel insuffisant', () => {
    assert.ok(insufficient(parseFEN('8/8/8/4k3/8/8/2N5/4K3 w - - 0 1').b));
    assert.ok(insufficient(parseFEN('8/8/2b5/4k3/8/8/4B3/4K3 w - - 0 1').b));   // fous de même couleur
    assert.ok(!insufficient(parseFEN('8/8/3b4/4k3/8/8/4B3/4K3 w - - 0 1').b));
  });
  test('triple répétition', () => {
    const r = replay(ucis('Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8'));
    assert.deepEqual(outcome(r.st, r.keys), { reason: 'repetition', winner: -1 });
  });
  test('cinquante coups', () => {
    assert.equal(outcome(parseFEN('8/8/8/4k3/8/8/R7/4K3 w - - 100 80'))?.reason, 'fifty');
  });
});

describe('La partie partagée', () => {
  const lobby = (tc = 'libre') => ({ phase: 'lobby', tc, gameNum: 1, moves: [], players: [{ name: 'Alice', score: 0 }, { name: 'Bob', score: 0 }] });
  const start = (tc, now = 0) => startGame(lobby(tc), { now }).game;
  const play = (g, line, now = 0) => {
    for (const uci of ucis(line, START).slice(toMoves(g.moves).length)) {
      const pnum = toMoves(g.moves).length % 2 === 0 ? whiteOf(g) : 1 - whiteOf(g);
      const r = playMove(g, { pnum, uci, now });
      assert.ok(r.ok, r.reason);
      g = r.game;
    }
    return g;
  };

  test('lancement : il faut deux joueurs', () => {
    assert.equal(startGame({ ...lobby(), players: [{ name: 'A' }, null] }, { now: 0 }).reason, 'waiting');
    assert.equal(start().phase, 'playing');
  });
  test('coups refusés : hors tour, illégal, état dépassé, partie finie', () => {
    const g = start();
    assert.equal(playMove(g, { pnum: 1, uci: 'e2e4', now: 0 }).reason, 'turn');
    assert.equal(playMove(g, { pnum: 0, uci: 'e2e5', now: 0 }).reason, 'illegal');
    assert.equal(playMove(g, { pnum: 0, uci: 'e2e4', expect: 3, now: 0 }).reason, 'stale');
    const done = resign(g, { pnum: 0 }).game;
    assert.equal(playMove(done, { pnum: 1, uci: 'e7e5', now: 0 }).reason, 'phase');
  });
  test('mat : point au vainqueur, revanche couleurs échangées', () => {
    const g = play(start(), 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#');
    assert.equal(g.phase, 'ended');
    assert.deepEqual(g.result, { winner: 0, reason: 'mate' });
    assert.equal(g.players[0].score, 1);
    const next = nextRound(g, { gameNum: 1, now: 0 }).game;
    assert.equal(next.gameNum, 2);
    assert.equal(colorOfPlayer(next, 0), B);
    assert.equal(nextRound(g, { gameNum: 5, now: 0 }).reason, 'stale');
  });
  test('nulle : proposée, acceptée, un demi-point chacun ; un coup retire l’offre', () => {
    let g = offerDraw(start(), { pnum: 0 }).game;
    assert.equal(g.drawOffer, 0);
    assert.equal(answerDraw(g, { pnum: 0, accept: true }).reason, 'none');
    assert.equal(playMove(g, { pnum: 0, uci: 'e2e4', now: 0 }).game.drawOffer, null);
    g = answerDraw(g, { pnum: 1, accept: true }).game;
    assert.equal(g.result.reason, 'agreed');
    assert.deepEqual(g.players.map(p => p.score), [.5, .5]);
  });
  test('pendule : ajout par coup, drapeau constaté, coup refusé après la chute', () => {
    let g = play(start('r15', 0), 'e4 e5', 1000);
    assert.deepEqual(clockNow(g, 1000), [900e3, 900e3]);   // la pendule part après le premier coup de chaque camp
    g = play(g, 'e4 e5 Nf3', 11000);                     // les blancs ont réfléchi 10 s
    assert.equal(clockNow(g, 11000)[W], 900e3 - 10e3 + 5e3);
    const late = 11000 + 900e3 + 6e3;                    // les noirs dépassent leur temps
    assert.equal(claimTime(g, { now: 11000 }).reason, 'running');
    const flagged = claimTime(g, { now: late }).game;
    assert.deepEqual(flagged.result, { winner: 0, reason: 'time' });
    const r = playMove(g, { pnum: 1, uci: 'b8c6', now: late });
    assert.ok(r.timeout && r.game.result.reason === 'time');
  });
  test('temps écoulé, l’adversaire peut encore mater : perte au temps', () => {
    const g = { ...start('b5', 0), moves: ucis('e4 e5'), clock: { left: [1, 1], at: 0 } };
    assert.equal(claimTime(g, { now: 10 }).game.result.reason, 'time');
  });
});

describe('L’ordinateur', () => {
  test('voit le mat en un', () => assert.equal(think('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'maitre'), 'a1a8'));
  test('pare la menace de mat', () => {
    const uci = think('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 'club');
    const st = parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3');
    make(st, legal(st).find(m => uciOf(m) === uci));
    assert.ok(!legal(st).some(m => { const u = make(st, m); const mate = outcome(st)?.reason === 'mate'; unmake(st, m, u); return mate; }));
  });
  test('répond dans le temps au niveau maître', () => {
    const t = Date.now();
    assert.ok(think(START, 'maitre'));
    assert.ok(Date.now() - t < 2500);
  });
});
