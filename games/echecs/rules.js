// Règles des échecs : fonctions pures, sans Firebase ni DOM. Partagées par la page, le
// moteur de l'ordinateur (bot.js, dans un Worker) et les tests.
//
// Cases : 0 = a1, 7 = h1, 56 = a8, 63 = h8 (case = rangée × 8 + colonne).
// Pièces : une lettre, majuscule pour les blancs (PNBRQK), minuscule pour les noirs, '.' = vide.
//
// La partie est un objet tel qu'il est stocké sous ec/<code> :
//   { phase: 'lobby'|'playing'|'ended', players: [{ name, score, uid }, …], gameNum, tc,
//     moves: ['e2e4', 'e7e5', …], clock: { left: [blancs, noirs], at }, drawOffer, result }
// La position n'est jamais stockée : elle se déduit des coups, rejoués et vérifiés un par un.
// Un coup est validé ici, dans la transaction Firebase, contre l'état du serveur.

export const W = 0, B = 1;
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
export const sqOf = n => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
export const colorOf = p => (p === '.' ? -1 : p < 'a' ? W : B);
export const kindOf = p => p.toUpperCase();
export const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

// ══════════════════ Tables de déplacement, calculées une fois ══════════════════
const step = (s, df, dr) => {
  const f = (s & 7) + df, r = (s >> 3) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
};
const jumps = d => Array.from({ length: 64 }, (_, s) => d.map(([a, b]) => step(s, a, b)).filter(t => t >= 0));
const ray = ([df, dr]) => Array.from({ length: 64 }, (_, s) => {
  const out = [];
  for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) out.push(t);
  return out;
});
const KNIGHT = jumps([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
const KING = jumps([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(ray);
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(ray);
const SLIDES = { B: DIAG, R: ORTH, Q: [...DIAG, ...ORTH] };
// Droits de roque perdus quand une pièce part de (ou arrive sur) une case : roi ou tour d'origine.
// Bits : 1 = petit roque blanc, 2 = grand roque blanc, 4 = petit roque noir, 8 = grand roque noir.
const RIGHTS = Array(64).fill(15);
RIGHTS[4] = 12; RIGHTS[0] = 13; RIGHTS[7] = 14; RIGHTS[60] = 3; RIGHTS[56] = 7; RIGHTS[63] = 11;

// ══════════════════ Position ══════════════════
export function parseFEN(fen = START) {
  const [placement, side, castle = '-', ep = '-', half = '0', full = '1'] = String(fen).trim().split(/\s+/);
  const b = Array(64).fill('.');
  let r = 7, f = 0;
  for (const ch of placement) {
    if (ch === '/') { r--; f = 0; }
    else if (ch >= '1' && ch <= '8') f += Number(ch);
    else { b[r * 8 + f] = ch; f++; }
  }
  let rights = 0;
  [['K', 1], ['Q', 2], ['k', 4], ['q', 8]].forEach(([c, bit]) => { if (castle.includes(c)) rights |= bit; });
  return { b, side: side === 'b' ? B : W, castle: rights, ep: ep !== '-' ? sqOf(ep) : -1, half: Number(half) || 0, full: Number(full) || 1, kings: [b.indexOf('K'), b.indexOf('k')] };
}

export function toFEN(st) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', n = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.b[r * 8 + f];
      if (p === '.') n++;
      else { if (n) row += n; n = 0; row += p; }
    }
    rows.push(row + (n || ''));
  }
  const c = ['K', 'Q', 'k', 'q'].filter((_, i) => st.castle & (1 << i)).join('') || '-';
  return `${rows.join('/')} ${st.side === W ? 'w' : 'b'} ${c} ${st.ep >= 0 ? sqName(st.ep) : '-'} ${st.half} ${st.full}`;
}

export const clone = st => ({ ...st, b: st.b.slice(), kings: st.kings.slice() });

// La case `sq` est-elle attaquée par le camp `by` ?
export function attacked(b, sq, by) {
  const [P, N, Bp, R, Q, K] = by === W ? 'PNBRQK' : 'pnbrqk';
  for (const t of KNIGHT[sq]) if (b[t] === N) return true;
  for (const t of KING[sq]) if (b[t] === K) return true;
  const f = sq & 7;
  if (by === W) {
    if (f > 0 && sq >= 9 && b[sq - 9] === P) return true;
    if (f < 7 && sq >= 7 && b[sq - 7] === P) return true;
  } else {
    if (f > 0 && sq + 7 < 64 && b[sq + 7] === P) return true;
    if (f < 7 && sq + 9 < 64 && b[sq + 9] === P) return true;
  }
  for (const line of DIAG) for (const t of line[sq]) { const p = b[t]; if (p === '.') continue; if (p === Bp || p === Q) return true; break; }
  for (const line of ORTH) for (const t of line[sq]) { const p = b[t]; if (p === '.') continue; if (p === R || p === Q) return true; break; }
  return false;
}

export const inCheck = st => attacked(st.b, st.kings[st.side], st.side ^ 1);

// Coups pseudo-légaux (le roi peut rester en échec : `legal` filtre). `noisy` : prises et
// promotions seulement (recherche de calme du moteur).
// Un coup : { from, to, p (pièce jouée), cap (pièce prise ou '.'), promo?, flag }
// flag : 'n' normal, 'd' double pas de pion, 'e' prise en passant, 'k' petit roque, 'q' grand roque.
export function pseudo(st, noisy = false) {
  const { b, side } = st, out = [];
  const enemy = p => p !== '.' && colorOf(p) !== side;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (p === '.' || colorOf(p) !== side) continue;
    const k = kindOf(p);
    if (k === 'P') {
      const dir = side === W ? 8 : -8, last = side === W ? 7 : 0, home = side === W ? 1 : 6, one = s + dir;
      const add = (to, cap, flag) => {
        if ((to >> 3) === last) for (const q of 'qrbn') out.push({ from: s, to, p, cap, promo: side === W ? q.toUpperCase() : q, flag });
        else out.push({ from: s, to, p, cap, flag });
      };
      if (b[one] === '.') {
        if (!noisy || (one >> 3) === last) add(one, '.', 'n');
        if (!noisy && (s >> 3) === home && b[one + dir] === '.') out.push({ from: s, to: one + dir, p, cap: '.', flag: 'd' });
      }
      for (const df of [-1, 1]) {
        const f = (s & 7) + df;
        if (f < 0 || f > 7) continue;
        const to = one + df;
        if (enemy(b[to])) add(to, b[to], 'n');
        else if (to === st.ep) out.push({ from: s, to, p, cap: side === W ? 'p' : 'P', flag: 'e' });
      }
    } else if (k === 'N' || k === 'K') {
      for (const to of (k === 'N' ? KNIGHT : KING)[s]) {
        const t = b[to];
        if (t === '.') { if (!noisy) out.push({ from: s, to, p, cap: '.', flag: 'n' }); }
        else if (enemy(t)) out.push({ from: s, to, p, cap: t, flag: 'n' });
      }
      if (k === 'K' && !noisy) castles(st, s, out);
    } else {
      for (const line of SLIDES[k]) for (const to of line[s]) {
        const t = b[to];
        if (t === '.') { if (!noisy) out.push({ from: s, to, p, cap: '.', flag: 'n' }); continue; }
        if (enemy(t)) out.push({ from: s, to, p, cap: t, flag: 'n' });
        break;
      }
    }
  }
  return out;
}

// Roques : cases vides entre roi et tour, roi ni en échec ni de passage sur une case attaquée.
function castles(st, s, out) {
  const { b, side, castle } = st, them = side ^ 1, p = b[s];
  const e = side === W ? 4 : 60, rook = side === W ? 'R' : 'r';
  if (s !== e) return;
  const free = (...q) => q.every(x => b[x] === '.'), safe = (...q) => q.every(x => !attacked(b, x, them));
  if (castle & (side === W ? 1 : 4) && b[e + 3] === rook && free(e + 1, e + 2) && safe(e, e + 1, e + 2))
    out.push({ from: e, to: e + 2, p, cap: '.', flag: 'k' });
  if (castle & (side === W ? 2 : 8) && b[e - 4] === rook && free(e - 1, e - 2, e - 3) && safe(e, e - 1, e - 2))
    out.push({ from: e, to: e - 2, p, cap: '.', flag: 'q' });
}

// Joue le coup sur la position (modifiée en place) ; renvoie de quoi le défaire.
export function make(st, m) {
  const u = { castle: st.castle, ep: st.ep, half: st.half };
  const b = st.b;
  b[m.from] = '.';
  if (m.flag === 'e') b[m.to + (st.side === W ? -8 : 8)] = '.';
  b[m.to] = m.promo || m.p;
  if (m.flag === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = '.'; }
  else if (m.flag === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = '.'; }
  if (m.p === 'K' || m.p === 'k') st.kings[st.side] = m.to;
  st.castle &= RIGHTS[m.from] & RIGHTS[m.to];
  st.ep = m.flag === 'd' ? (m.from + m.to) >> 1 : -1;
  st.half = m.p === 'P' || m.p === 'p' || m.cap !== '.' ? 0 : st.half + 1;
  if (st.side === B) st.full++;
  st.side ^= 1;
  return u;
}

export function unmake(st, m, u) {
  st.side ^= 1;
  if (st.side === B) st.full--;
  const b = st.b;
  b[m.from] = m.p;
  if (m.flag === 'e') { b[m.to] = '.'; b[m.to + (st.side === W ? -8 : 8)] = m.cap; }
  else b[m.to] = m.cap;
  if (m.flag === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = '.'; }
  else if (m.flag === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = '.'; }
  if (m.p === 'K' || m.p === 'k') st.kings[st.side] = m.from;
  st.castle = u.castle; st.ep = u.ep; st.half = u.half;
}

export function legal(st, noisy = false) {
  const out = [], me = st.side;
  for (const m of pseudo(st, noisy)) {
    const u = make(st, m);
    if (!attacked(st.b, st.kings[me], me ^ 1)) out.push(m);
    unmake(st, m, u);
  }
  return out;
}

export const uciOf = m => sqName(m.from) + sqName(m.to) + (m.promo ? m.promo.toLowerCase() : '');
export const findMove = (st, uci) => legal(st).find(m => uciOf(m) === uci) || null;

// Notation algébrique (lettres anglaises KQRBN ; la page les affiche en figurines).
export function san(st, m, moves = legal(st)) {
  let s;
  if (m.flag === 'k') s = 'O-O';
  else if (m.flag === 'q') s = 'O-O-O';
  else {
    const k = kindOf(m.p), x = m.cap !== '.' ? 'x' : '';
    if (k === 'P') s = (x ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + kindOf(m.promo) : '');
    else {
      const rivals = moves.filter(o => o.p === m.p && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (rivals.length) {
        if (!rivals.some(o => (o.from & 7) === (m.from & 7))) dis = FILES[m.from & 7];
        else if (!rivals.some(o => (o.from >> 3) === (m.from >> 3))) dis = String((m.from >> 3) + 1);
        else dis = sqName(m.from);
      }
      s = k + dis + x + sqName(m.to);
    }
  }
  const u = make(st, m);
  if (inCheck(st)) s += legal(st).length ? '+' : '#';
  unmake(st, m, u);
  return s;
}

export const fromSAN = (st, text) => {
  const want = String(text).replace(/[+#!?]/g, '').replace(/0/g, 'O');
  const moves = legal(st);
  return moves.find(m => san(st, m, moves).replace(/[+#]/g, '') === want) || null;
};

// Clé de répétition : pièces, trait, roques, et prise en passant seulement si elle est jouable.
export function keyOf(st) {
  let ep = '-';
  if (st.ep >= 0 && legal(st).some(m => m.flag === 'e')) ep = sqName(st.ep);
  return `${st.b.join('')}${st.side}${st.castle}${ep}`;
}

// Matériel insuffisant pour mater, des deux côtés : rois seuls, roi et une pièce mineure,
// ou seulement des fous tous sur des cases de même couleur.
export function insufficient(b) {
  const minors = [];
  for (let s = 0; s < 64; s++) {
    const k = kindOf(b[s]);
    if (k === 'P' || k === 'R' || k === 'Q') return false;
    if (k === 'N' || k === 'B') minors.push([k, s]);
  }
  if (minors.length <= 1) return true;
  return minors.every(([k]) => k === 'B') && new Set(minors.map(([, s]) => ((s >> 3) + (s & 7)) % 2)).size === 1;
}

// Le camp `side` peut-il encore mater (perte au temps : sinon c'est nulle) ?
export function canMate(b, side) {
  let minors = 0;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (p === '.' || colorOf(p) !== side) continue;
    const k = kindOf(p);
    if (k === 'P' || k === 'R' || k === 'Q') return true;
    if (k === 'N' || k === 'B') minors++;
  }
  return minors >= 2;
}

// Fin de partie dans la position : { reason, winner: couleur | -1 (nulle) } ou null.
export function outcome(st, keys = []) {
  const moves = legal(st);
  if (!moves.length) return inCheck(st) ? { reason: 'mate', winner: st.side ^ 1 } : { reason: 'stalemate', winner: -1 };
  if (insufficient(st.b)) return { reason: 'material', winner: -1 };
  if (st.half >= 100) return { reason: 'fifty', winner: -1 };
  const k = keys[keys.length - 1];
  if (k && keys.filter(x => x === k).length >= 3) return { reason: 'repetition', winner: -1 };
  return null;
}

// Rejoue une liste de coups depuis la position de départ, en vérifiant chacun.
// Renvoie { st, keys, sans, moves (coups détaillés) } ou null si un coup est illégal.
export function replay(list, fen = START) {
  const st = parseFEN(fen), keys = [keyOf(st)], sans = [], moves = [];
  for (const uci of list) {
    const all = legal(st), m = all.find(x => uciOf(x) === uci);
    if (!m) return null;
    sans.push(san(st, m, all));
    make(st, m);
    keys.push(keyOf(st));
    moves.push(m);
  }
  return { st, keys, sans, moves };
}

// Pièces prises par chaque camp, dans l'ordre : [prises par les blancs, prises par les noirs].
export const capturedBy = moves => [moves.filter((m, i) => i % 2 === 0 && m.cap !== '.').map(m => m.cap), moves.filter((m, i) => i % 2 === 1 && m.cap !== '.').map(m => m.cap)];

// ══════════════════ La partie (état partagé) ══════════════════
// Cadences : temps de base et ajout par coup, en millisecondes. `libre` : sans pendule.
export const TIME = {
  libre: null,
  b5: { base: 5 * 60e3, inc: 0 },
  r10: { base: 10 * 60e3, inc: 0 },
  r15: { base: 15 * 60e3, inc: 5e3 },
};
export const tcOf = g => (Object.hasOwn(TIME, g?.tc) ? g.tc : 'libre');
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

export const toPlayers = raw => [raw?.[0] || null, raw?.[1] || null];
// Firebase rend un tableau, ou un objet si des clés manquent : on revient à une liste ordonnée.
export const toMoves = raw => (Array.isArray(raw) ? raw : Object.keys(raw || {}).sort((a, b) => a - b).map(k => raw[k]))
  .filter(s => typeof s === 'string' && UCI_RE.test(s));
// Le joueur qui a les blancs alterne à chaque partie : l'hôte commence.
export const whiteOf = g => ((Math.max(1, Math.trunc(num(g?.gameNum)) || 1) - 1) % 2);
export const playerOf = (g, color) => (color === W ? whiteOf(g) : 1 - whiteOf(g));
export const colorOfPlayer = (g, pnum) => (pnum === whiteOf(g) ? W : B);

const freshClock = (g, now) => { const t = TIME[tcOf(g)]; return t ? { left: [t.base, t.base], at: now } : null; };

// Temps restant de chaque couleur à l'instant `now`. La pendule ne tourne qu'après le premier
// coup de chaque camp (personne ne perd au temps sans avoir joué).
export function clockNow(g, now) {
  if (!TIME[tcOf(g)] || !g.clock) return null;
  const left = [num(g.clock.left?.[0]), num(g.clock.left?.[1])];
  const ply = toMoves(g.moves).length;
  if (g.phase === 'playing' && ply >= 2) left[ply % 2] -= Math.max(0, now - num(g.clock.at));
  return left;
}

// Termine la partie : `winner` est une couleur, ou -1 pour la nulle (un demi-point chacun).
function finish(g, winner, reason) {
  const pts = [0, 1].map(i => winner === -1 ? .5 : (colorOfPlayer(g, i) === winner ? 1 : 0));
  const players = toPlayers(g.players).map((p, i) => p && { ...p, score: num(p.score) + pts[i] });
  return { ...g, phase: 'ended', players, drawOffer: null, result: { winner: winner === -1 ? -1 : playerOf(g, winner), reason } };
}

export function startGame(g, { now }) {
  if (!g || g.phase !== 'lobby') return { ok: false, reason: 'phase' };
  if (!toPlayers(g.players)[1]) return { ok: false, reason: 'waiting' };
  return { ok: true, game: { ...g, phase: 'playing', moves: [], clock: freshClock(g, now), drawOffer: null, result: null } };
}

// Joue `uci` pour `pnum`. `expect` = nombre de coups que le joueur voyait au clic : un clic
// parti d'un état dépassé (double clic, retard réseau) est refusé.
// Renvoie { ok: true, game, san } ou { ok: false, reason }.
export function playMove(g, { pnum, uci, expect, now }) {
  if (!g) return { ok: false, reason: 'missing' };
  if (g.phase !== 'playing') return { ok: false, reason: 'phase' };
  const players = toPlayers(g.players);
  if (!players[0] || !players[1]) return { ok: false, reason: 'waiting' };
  const list = toMoves(g.moves);
  if (expect !== undefined && expect !== list.length) return { ok: false, reason: 'stale' };
  const r = replay(list);
  if (!r) return { ok: false, reason: 'corrupt' };
  const side = r.st.side;
  if (pnum !== playerOf(g, side)) return { ok: false, reason: 'turn' };
  const all = legal(r.st), m = all.find(x => uciOf(x) === uci);
  if (!m) return { ok: false, reason: 'illegal' };

  let clock = g.clock || null;
  const t = TIME[tcOf(g)];
  if (t) {
    const left = clockNow(g, now);
    // Drapeau tombé avant le coup : la partie est perdue au temps, le coup n'est pas joué.
    if (left[side] <= 0) return { ok: true, game: flag(g, r.st, side), timeout: true };
    if (list.length >= 2) left[side] += t.inc;
    clock = { left, at: now };
  }
  const text = san(r.st, m, all);
  make(r.st, m);
  r.keys.push(keyOf(r.st));
  const next = { ...g, moves: [...list, uci], clock, drawOffer: null };
  const end = outcome(r.st, r.keys);
  return { ok: true, game: end ? finish(next, end.winner, end.reason) : next, san: text };
}

// Perte au temps de `side` ; nulle si l'adversaire n'a plus de quoi mater.
const flag = (g, st, side) => (canMate(st.b, side ^ 1) ? finish(g, side ^ 1, 'time') : finish(g, -1, 'time-draw'));

// N'importe quel membre constate la chute du drapeau du camp au trait.
export function claimTime(g, { now }) {
  if (!g || g.phase !== 'playing') return { ok: false, reason: 'phase' };
  const left = clockNow(g, now);
  if (!left) return { ok: false, reason: 'untimed' };
  const r = replay(toMoves(g.moves));
  if (!r) return { ok: false, reason: 'corrupt' };
  if (left[r.st.side] > 0) return { ok: false, reason: 'running' };
  return { ok: true, game: flag(g, r.st, r.st.side) };
}

export function resign(g, { pnum }) {
  if (!g || g.phase !== 'playing') return { ok: false, reason: 'phase' };
  if (pnum !== 0 && pnum !== 1) return { ok: false, reason: 'seat' };
  return { ok: true, game: finish(g, colorOfPlayer(g, pnum) ^ 1, 'resign') };
}

// Nulle : l'un propose, l'autre accepte ou refuse. Jouer un coup retire la proposition.
export function offerDraw(g, { pnum }) {
  if (!g || g.phase !== 'playing') return { ok: false, reason: 'phase' };
  if (pnum !== 0 && pnum !== 1) return { ok: false, reason: 'seat' };
  if (g.drawOffer === 1 - pnum) return { ok: true, game: finish(g, -1, 'agreed') };
  return { ok: true, game: { ...g, drawOffer: pnum } };
}
export function answerDraw(g, { pnum, accept }) {
  if (!g || g.phase !== 'playing') return { ok: false, reason: 'phase' };
  if (g.drawOffer !== 1 - pnum) return { ok: false, reason: 'none' };
  return { ok: true, game: accept ? finish(g, -1, 'agreed') : { ...g, drawOffer: null } };
}

// Partie suivante : échiquier remis en place, couleurs échangées, scores conservés.
// `gameNum` attendu : deux clics « Revanche » simultanés n'en lancent qu'une.
export function nextRound(g, { gameNum, now }) {
  if (!g || g.phase !== 'ended') return { ok: false, reason: 'phase' };
  const n = Math.max(1, Math.trunc(num(g.gameNum)) || 1);
  if (gameNum !== undefined && gameNum !== n) return { ok: false, reason: 'stale' };
  const next = { ...g, gameNum: n + 1, phase: 'playing', moves: [], drawOffer: null, result: null };
  next.clock = freshClock(next, now);
  return { ok: true, game: next };
}
