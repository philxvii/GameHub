// Règles de Puissance 4, sans navigateur ni Firebase.
//   node --test games/puissance4/tests/rules.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, COLS, emptyBoard, toBoard, toPlayers, countPieces, lowestEmpty, isFull,
  findWin, matchOver, playMove, nextRound } from '../rules.js';

const game = (over = {}) => ({
  phase: 'playing', board: emptyBoard(), turn: 0, bo: 1, gameNum: 1, winner: null, winCells: null,
  players: [{ name: 'Alice', score: 0, uid: 'a' }, { name: 'Bob', score: 0, uid: 'b' }], ...over,
});
// Joue une suite de colonnes en alternant ; échoue si un coup est refusé.
function play(g, cols) {
  for (const col of cols) {
    const r = playMove(g, { col, pnum: Number(g.turn), expect: countPieces(toBoard(g.board)) });
    assert.ok(r.ok, `coup ${col} refusé : ${r.reason}`);
    g = r.game;
  }
  return g;
}
const key = cells => cells.map(([r, c]) => `${r},${c}`).sort().join(' ');

test('grille vide : 6×7, toutes les colonnes jouables, le pion tombe en bas', () => {
  const b = emptyBoard();
  assert.equal(b.length, ROWS); assert.ok(b.every(r => r.length === COLS && r.every(v => v === 0)));
  for (let c = 0; c < COLS; c++) assert.equal(lowestEmpty(b, c), ROWS - 1);
  const r = playMove(game(), { col: 3, pnum: 0, expect: 0 });
  assert.ok(r.ok); assert.equal(r.row, 5); assert.equal(r.game.board[5][3], 1);
  assert.equal(r.game.turn, 1); assert.deepEqual(r.game.last, { r: 5, c: 3, p: 1 });
  const r2 = playMove(r.game, { col: 3, pnum: 1, expect: 1 });
  assert.equal(r2.row, 4); assert.equal(r2.game.board[4][3], 2); assert.equal(r2.game.turn, 0);
});

test('victoire horizontale', () => {
  const g = play(game(), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(g.phase, 'win'); assert.equal(g.winner, 0);
  assert.equal(key(g.winCells), key([[5, 0], [5, 1], [5, 2], [5, 3]]));
  assert.equal(g.players[0].score, 1); assert.equal(g.players[1].score, 0);
});

test('victoire verticale', () => {
  const g = play(game(), [6, 0, 6, 0, 6, 0, 1, 0]);
  assert.equal(g.phase, 'win'); assert.equal(g.winner, 1);
  assert.equal(key(g.winCells), key([[5, 0], [4, 0], [3, 0], [2, 0]]));
  assert.equal(g.players[1].score, 1);
});

test('victoire diagonale montante (/)', () => {
  // J1 : (5,0) (4,1) (3,2) (2,3)
  const g = play(game(), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(g.phase, 'win'); assert.equal(g.winner, 0);
  assert.equal(key(g.winCells), key([[5, 0], [4, 1], [3, 2], [2, 3]]));
});

test('victoire diagonale descendante (\\)', () => {
  // J1 : (2,3) (3,4) (4,5) (5,6)
  const g = play(game(), [6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
  assert.equal(g.phase, 'win'); assert.equal(g.winner, 0);
  assert.equal(key(g.winCells), key([[2, 3], [3, 4], [4, 5], [5, 6]]));
});

test('le coup gagnant au milieu d’une ligne de 5 marque les 5 pions', () => {
  const g = play(game(), [0, 0, 1, 1, 3, 3, 4, 4, 2]);
  assert.equal(g.phase, 'win'); assert.equal(g.winCells.length, 5);
});

test('un coup qui ferme deux lignes à la fois les marque toutes les deux', () => {
  // (5,3) ferme l'horizontale du bas et la verticale de la colonne 3 (findWin seul :
  // la position est construite à la main).
  const b = emptyBoard();
  for (const c of [0, 1, 2, 3]) b[5][c] = 1;
  for (const r of [4, 3, 2]) b[r][3] = 1;
  assert.equal(key(findWin(b, 5, 3, 1)), key([[5, 0], [5, 1], [5, 2], [5, 3], [4, 3], [3, 3], [2, 3]]));
});

test('aucun faux positif : trois alignés, ou quatre interrompus', () => {
  let g = play(game(), [0, 6, 1, 6, 2]);           // trois en bas pour J1
  assert.equal(g.phase, 'playing');
  g = play(g, [3]);                                 // J2 bouche
  assert.equal(g.phase, 'playing');
  g = play(g, [4, 5, 5, 5, 6]);                     // 1,1,1,2,1,2,... : pas quatre d'affilée
  assert.equal(g.phase, 'playing');
  assert.equal(findWin(toBoard(g.board), 5, 4, 1), null);
  // Quatre de la même couleur mais séparés par le bord du plateau : jamais gagnants.
  const wrap = emptyBoard(); wrap[5][5] = wrap[5][6] = wrap[4][0] = wrap[4][1] = 1;
  assert.equal(findWin(wrap, 5, 6, 1), null);
});

test('match nul : plateau plein sans alignement', () => {
  const board = [
    [1, 1, 2, 1, 1, 2, 0],
    [2, 2, 1, 2, 2, 1, 2],
    [1, 1, 2, 1, 1, 2, 1],
    [2, 2, 1, 2, 2, 1, 2],
    [1, 1, 2, 1, 1, 2, 1],
    [2, 2, 1, 2, 2, 1, 2],
  ];
  const noLine = b => b.every((row, r) => row.every((v, c) => !v || !findWin(b, r, c, v)));
  assert.ok(noLine(board));
  // Il reste (0,6) : 20 pions J1, 21 J2, c'est à J1 de jouer le dernier coup.
  const r = playMove(game({ board, turn: 0 }), { col: 6, pnum: 0, expect: 41 });
  assert.ok(r.ok);
  assert.ok(noLine(r.game.board));
  assert.equal(r.game.phase, 'draw'); assert.equal(r.game.winner, null); assert.equal(r.game.winCells, null);
  assert.ok(isFull(r.game.board));
  assert.deepEqual(r.game.players.map(p => p.score), [0, 0]);
});

test('colonne pleine refusée, sans changer l’état', () => {
  const g = play(game(), [2, 2, 2, 2, 2, 2]);
  assert.equal(lowestEmpty(toBoard(g.board), 2), -1);
  const r = playMove(g, { col: 2, pnum: 0, expect: 6 });
  assert.deepEqual(r, { ok: false, reason: 'full' });
});

test('coup hors tour, joueur inconnu, colonne invalide : refusés', () => {
  const g = game();
  assert.equal(playMove(g, { col: 0, pnum: 1 }).reason, 'turn');
  assert.equal(playMove(g, { col: 0, pnum: 2 }).reason, 'turn');
  assert.equal(playMove(g, { col: 0, pnum: null }).reason, 'turn');
  for (const col of [-1, 7, 1.5, '3', undefined]) assert.equal(playMove(g, { col, pnum: 0 }).reason, 'col');
});

test('coup après la fin, ou avant l’arrivée du second joueur : refusé', () => {
  const won = play(game(), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(playMove(won, { col: 4, pnum: 1 }).reason, 'phase');
  assert.equal(playMove({ ...won, phase: 'draw' }, { col: 4, pnum: 1 }).reason, 'phase');
  assert.equal(playMove(game({ phase: 'lobby' }), { col: 0, pnum: 0 }).reason, 'phase');
  assert.equal(playMove(game({ players: [{ name: 'A', score: 0 }, null] }), { col: 0, pnum: 0 }).reason, 'waiting');
  assert.equal(playMove(null, { col: 0, pnum: 0 }).reason, 'missing');
});

test('double clic / état dépassé : le second envoi est refusé', () => {
  const g = game();
  const first = playMove(g, { col: 3, pnum: 0, expect: 0 });
  assert.ok(first.ok);
  // Le même clic rejoué sur l'état du serveur (déjà 1 pion) : refusé.
  assert.equal(playMove(first.game, { col: 3, pnum: 0, expect: 0 }).reason, 'turn');
  // Même tour revenu à J1 mais clic calculé deux coups plus tôt : refusé.
  const later = play(first.game, [4]);
  assert.equal(playMove(later, { col: 5, pnum: 0, expect: 0 }).reason, 'stale');
  assert.ok(playMove(later, { col: 5, pnum: 0, expect: 2 }).ok);
});

test('état Firebase abîmé : tableaux en objets, cases manquantes, joueur absent', () => {
  const raw = { 0: { 0: 0 }, 5: [1, 0, 0, 0, 0, 0, 2] };
  const b = toBoard(raw);
  assert.equal(b[5][0], 1); assert.equal(b[5][6], 2); assert.equal(countPieces(b), 2);
  assert.deepEqual(toPlayers({ 0: { name: 'A' } }), [{ name: 'A' }, null]);
  assert.deepEqual(toPlayers(undefined), [null, null]);
  const r = playMove(game({ board: raw, players: { 0: { name: 'A', score: 0 }, 1: { name: 'B', score: 0 } } }), { col: 0, pnum: 0, expect: 2 });
  assert.ok(r.ok); assert.equal(r.row, 4);
  assert.ok(!JSON.stringify(r.game).includes('undefined'));
});

test('manche suivante : plateau vide, premier joueur alterné, scores gardés', () => {
  const won = play(game({ bo: 2 }), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(matchOver(won), false);
  const r = nextRound(won, { gameNum: 1 });
  assert.ok(r.ok);
  assert.equal(r.game.phase, 'playing'); assert.equal(r.game.gameNum, 2); assert.equal(r.game.turn, 1);
  assert.equal(countPieces(r.game.board), 0);
  assert.equal(r.game.winner, null); assert.equal(r.game.winCells, null); assert.equal(r.game.last, null);
  assert.equal(r.game.players[0].score, 1);
  // Deux revanches simultanées : la seconde voit gameNum 2 et s'annule.
  assert.equal(nextRound(r.game, { gameNum: 1 }).reason, 'phase');
  const draw = { ...r.game, phase: 'draw' };
  assert.equal(nextRound(draw, { gameNum: 1 }).reason, 'stale');
  assert.equal(nextRound(draw, { gameNum: 2 }).game.turn, 0);
});

test('match terminé : pas de manche suivante, mais un nouveau match remet tout à zéro', () => {
  const won = play(game({ bo: 1 }), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(matchOver(won), true);
  assert.equal(nextRound(won, { gameNum: 1 }).reason, 'over');
  const r = nextRound(won, { gameNum: 1, fresh: true });
  assert.ok(r.ok);
  assert.equal(r.game.gameNum, 1); assert.equal(r.game.turn, 0);
  assert.deepEqual(r.game.players.map(p => p.score), [0, 0]);
  assert.equal(r.game.players[0].uid, 'a');
  // Nouveau match refusé tant que le match n'est pas fini.
  const mid = play(game({ bo: 3 }), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(nextRound(mid, { fresh: true }).reason, 'running');
});

test('partie complète jouée au hasard : jamais d’état incohérent', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 300; k++) {
    let g = game();
    for (let n = 0; n < 42 && g.phase === 'playing'; n++) {
      const legal = [...Array(COLS).keys()].filter(c => lowestEmpty(toBoard(g.board), c) !== -1);
      const r = playMove(g, { col: legal[rnd(legal.length)], pnum: g.turn, expect: n });
      assert.ok(r.ok, r.reason);
      g = r.game;
      assert.equal(countPieces(toBoard(g.board)), n + 1);
    }
    assert.ok(g.phase === 'win' || g.phase === 'draw');
    if (g.phase === 'win') {
      const b = toBoard(g.board);
      assert.ok(g.winCells.length >= 4 && g.winCells.every(([r, c]) => b[r][c] === g.winner + 1));
    } else assert.ok(isFull(toBoard(g.board)));
  }
});

test('couleurs : rouge et bleu par défaut, jamais identiques, choix au salon seulement', async () => {
  const { PALETTE, colorsOf, pickColor } = await import('../rules.js');
  assert.deepEqual(colorsOf(game()), ['rouge', 'bleu']);
  assert.deepEqual(colorsOf({}), ['rouge', 'bleu']);
  const lobby = game({ phase: 'lobby' });
  // Une couleur affichée chez l'adversaire est prise, même par défaut.
  assert.equal(pickColor(lobby, { pnum: 0, color: 'bleu' }).reason, 'taken');
  const g1 = pickColor(lobby, { pnum: 0, color: 'emeraude' });
  assert.ok(g1.ok); assert.deepEqual(colorsOf(g1.game), ['emeraude', 'bleu']);
  const g2 = pickColor(g1.game, { pnum: 1, color: 'jaune' });
  assert.deepEqual(colorsOf(g2.game), ['emeraude', 'jaune']);
  assert.equal(pickColor(g2.game, { pnum: 0, color: 'jaune' }).reason, 'taken');
  // Partie écrite par un autre client : deux fois la même couleur → l'invité est décalé.
  assert.deepEqual(colorsOf(game({ players: [{ name: 'A', color: 'bleu' }, { name: 'B', color: 'bleu' }] })), ['bleu', 'rouge']);
  // Valeurs refusées : hors palette, hors salon, siège vide ou inconnu.
  assert.equal(pickColor(lobby, { pnum: 0, color: '<b>' }).reason, 'color');
  assert.equal(pickColor(game(), { pnum: 0, color: 'jaune' }).reason, 'phase');
  assert.equal(pickColor(game({ phase: 'lobby', players: [{ name: 'A' }, null] }), { pnum: 1, color: 'jaune' }).reason, 'seat');
  assert.equal(pickColor(lobby, { pnum: 2, color: 'jaune' }).reason, 'seat');
  // Une couleur inconnue écrite dans la base retombe sur la valeur par défaut.
  assert.deepEqual(colorsOf(game({ players: [{ name: 'A', color: 'x' }, { name: 'B', color: 'rouge' }] })), ['rouge', 'bleu']);
  // La couleur traverse les coups et les manches.
  const played = playMove(game({ players: g2.game.players }), { col: 0, pnum: 0 }).game;
  assert.deepEqual(colorsOf(played), ['emeraude', 'jaune']);
  assert.ok(PALETTE.length >= 5);
});
