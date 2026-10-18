// Règles de Puissance 4 : fonctions pures, sans Firebase ni DOM.
//
// La partie est un objet tel qu'il est stocké sous p4/<code> :
//   { phase: 'lobby'|'playing'|'win'|'draw', board: 6×7 (0 vide, 1 ou 2),
//     turn: 0|1, players: [{ name, score, uid }, …], bo, gameNum,
//     winner, winCells, last: { r, c, p } }
// Un coup est validé ici, dans la transaction Firebase, contre l'état du serveur :
// jamais contre ce que l'interface affichait au moment du clic.

export const ROWS = 6, COLS = 7;

export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// Firebase rend un tableau, ou un objet si des clés manquent : on revient à 6×7 nombres.
export function toBoard(raw) {
  const b = emptyBoard();
  if (!raw) return b;
  for (let r = 0; r < ROWS; r++) {
    const row = raw[r];
    if (!row) continue;
    for (let c = 0; c < COLS; c++) {
      const v = Number(row[c]);
      b[r][c] = v === 1 || v === 2 ? v : 0;
    }
  }
  return b;
}

export const toPlayers = raw => [raw?.[0] || null, raw?.[1] || null];

export const countPieces = board => board.reduce((n, row) => n + row.filter(Boolean).length, 0);

export function lowestEmpty(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r;
  return -1;
}

export const isFull = board => board[0].every(v => v !== 0);

// Toutes les cases alignées avec (row, col) par lignes de 4 ou plus : un seul coup
// peut en fermer deux à la fois (croix), et une ligne peut compter 5 pions.
export function findWin(board, row, col, player) {
  const out = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[row, col]];
    for (const s of [1, -1]) {
      for (let i = 1; i < COLS; i++) {
        const r = row + dr * i * s, c = col + dc * i * s;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) break;
        line.push([r, c]);
      }
    }
    if (line.length >= 4) out.push(...line);
  }
  if (!out.length) return null;
  const seen = new Set();
  return out.filter(([r, c]) => !seen.has(r * COLS + c) && seen.add(r * COLS + c))
    .sort((a, b) => a[1] - b[1] || b[0] - a[0]);
}

// Le match (best-of) est fini quand le vainqueur de la manche atteint `bo` victoires.
export function matchOver(game) {
  if (game.phase !== 'win') return false;
  const p = toPlayers(game.players)[game.winner];
  return !!p && (p.score || 0) >= (Number(game.bo) || 1);
}

// Joue `col` pour `pnum`. `expect` = nombre de pions que le joueur voyait au clic :
// un clic parti d'un état dépassé (double clic, retard réseau) est refusé.
// Renvoie { ok: true, game, row } ou { ok: false, reason }.
export function playMove(game, { col, pnum, expect }) {
  if (!game) return { ok: false, reason: 'missing' };
  if (game.phase !== 'playing') return { ok: false, reason: 'phase' };
  const players = toPlayers(game.players);
  if (!players[0] || !players[1]) return { ok: false, reason: 'waiting' };
  if (pnum !== 0 && pnum !== 1) return { ok: false, reason: 'turn' };
  if (Number(game.turn) !== pnum) return { ok: false, reason: 'turn' };
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return { ok: false, reason: 'col' };
  const board = toBoard(game.board);
  if (expect !== undefined && expect !== countPieces(board)) return { ok: false, reason: 'stale' };
  const row = lowestEmpty(board, col);
  if (row === -1) return { ok: false, reason: 'full' };

  const p = pnum + 1;
  board[row][col] = p;
  const win = findWin(board, row, col, p);
  const next = { ...game, board, last: { r: row, c: col, p } };
  if (win) {
    next.phase = 'win';
    next.winner = pnum;
    next.winCells = win;
    next.players = players.map((pl, i) => pl && { ...pl, score: (pl.score || 0) + (i === pnum ? 1 : 0) });
  } else if (isFull(board)) {
    next.phase = 'draw';
    next.winner = null;
    next.winCells = null;
  } else {
    next.turn = 1 - pnum;
    next.winner = null;
    next.winCells = null;
  }
  return { ok: true, game: next, row };
}

// Manche suivante, après une victoire ou un nul : plateau vide, le premier joueur
// alterne. `fresh` (match terminé) remet aussi les scores à zéro.
// `gameNum` attendu : deux clics « Revanche » simultanés n'en lancent qu'une.
export function nextRound(game, { gameNum, fresh = false } = {}) {
  if (!game || (game.phase !== 'win' && game.phase !== 'draw')) return { ok: false, reason: 'phase' };
  const num = Number(game.gameNum) || 1;
  if (gameNum !== undefined && gameNum !== num) return { ok: false, reason: 'stale' };
  if (matchOver(game) !== fresh) return { ok: false, reason: fresh ? 'running' : 'over' };
  const players = toPlayers(game.players).map(p => p && (fresh ? { ...p, score: 0 } : p));
  const n = fresh ? 1 : num + 1;
  return { ok: true, game: {
    ...game, players, board: emptyBoard(), phase: 'playing',
    turn: (n - 1) % 2, gameNum: n, winner: null, winCells: null, last: null,
  } };
}

// Couleurs de pions, choisies par chaque joueur au salon. Rouge et bleu par défaut ; les deux
// joueurs n'ont jamais la même (la marque point / croissant reste en plus de la couleur).
export const PALETTE = ['rouge', 'bleu', 'jaune', 'ivoire', 'emeraude', 'corail'];
export const DEFAULT_COLORS = ['rouge', 'bleu'];

export function colorsOf(game) {
  const p = toPlayers(game?.players);
  const a = PALETTE.includes(p[0]?.color) ? p[0].color : DEFAULT_COLORS[0];
  let b = PALETTE.includes(p[1]?.color) ? p[1].color : DEFAULT_COLORS[1];
  if (b === a) b = [...DEFAULT_COLORS, ...PALETTE].find(x => x !== a);
  return [a, b];
}

// Choisir sa couleur : seulement au salon, et pas celle que l'adversaire affiche déjà.
export function pickColor(game, { pnum, color }) {
  if (!game || game.phase !== 'lobby') return { ok: false, reason: 'phase' };
  if (!PALETTE.includes(color)) return { ok: false, reason: 'color' };
  const players = toPlayers(game.players);
  if ((pnum !== 0 && pnum !== 1) || !players[pnum]) return { ok: false, reason: 'seat' };
  if (colorsOf(game)[1 - pnum] === color) return { ok: false, reason: 'taken' };
  players[pnum] = { ...players[pnum], color };
  return { ok: true, game: { ...game, players } };
}
