// L'ordinateur, dans un Worker : la page ne gèle jamais pendant qu'il réfléchit.
// Recherche alpha-bêta à approfondissement itératif, recherche de calme sur les prises,
// évaluation matérielle et tables de placement (« Simplified Evaluation Function »,
// T. Michniewski). Les niveaux jouent sur la profondeur, le temps et une part d'imprécision.
//
// Message reçu : { id, fen, level } ; réponse : { id, uci }.

import { W, parseFEN, pseudo, legal, make, unmake, attacked, inCheck, uciOf, kindOf, colorOf } from './rules.js';

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
// Tables vues des blancs, rangée 8 en haut (comme un diagramme).
const T = {
  P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  E: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
const at = (s, color) => (color === W ? (7 - (s >> 3)) * 8 + (s & 7) : s);   // index dans la table

// Score du point de vue du camp au trait.
function evaluate(st) {
  const b = st.b;
  let heavy = 0;
  for (let s = 0; s < 64; s++) { const k = kindOf(b[s]); if (k === 'Q') heavy += 900; else if (k === 'R') heavy += 500; else if (k === 'N' || k === 'B') heavy += 325; }
  const endgame = heavy <= 1600;
  let score = 0;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (p === '.') continue;
    const k = kindOf(p), c = colorOf(p);
    const v = VALUE[k] + (k === 'K' ? (endgame ? T.E : T.K) : T[k])[at(s, c)];
    score += c === W ? v : -v;
  }
  return st.side === W ? score : -score;
}

const MATE = 100000;
let nodes = 0, deadline = 0, killers = [];
class Timeout extends Error {}

// Ordre des coups : celui de la ligne principale, puis les prises (la plus grosse victime par la
// plus petite pièce), les promotions, les coups « tueurs » de ce niveau, puis le reste.
function order(moves, ply, best) {
  const k = killers[ply] || [];
  for (const m of moves) {
    let s = 0;
    if (best && m.from === best.from && m.to === best.to && m.promo === best.promo) s = 1e6;
    else if (m.cap !== '.') s = 1e5 + 10 * VALUE[kindOf(m.cap)] - VALUE[kindOf(m.p)];
    else if (m.promo) s = 9e4 + VALUE[kindOf(m.promo)];
    else if (k.some(x => x.from === m.from && x.to === m.to)) s = 8e4;
    m.s = s;
  }
  return moves.sort((a, b) => b.s - a.s);
}

function quiesce(st, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) throw new Timeout();
  const stand = evaluate(st);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const me = st.side;
  for (const m of order(pseudo(st, true), ply)) {
    const u = make(st, m);
    if (attacked(st.b, st.kings[me], me ^ 1)) { unmake(st, m, u); continue; }
    const v = -quiesce(st, -beta, -alpha, ply + 1);
    unmake(st, m, u);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(st, depth, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) throw new Timeout();
  if (st.half >= 100) return 0;
  const check = inCheck(st);
  if (check) depth++;                         // on ne s'arrête pas en plein échec
  if (depth <= 0) return quiesce(st, alpha, beta, ply);
  const me = st.side;
  let any = false;
  for (const m of order(pseudo(st), ply)) {
    const u = make(st, m);
    if (attacked(st.b, st.kings[me], me ^ 1)) { unmake(st, m, u); continue; }
    any = true;
    const v = -search(st, depth - 1, -beta, -alpha, ply + 1);
    unmake(st, m, u);
    if (v >= beta) {
      if (m.cap === '.') killers[ply] = [m, ...(killers[ply] || [])].slice(0, 2);
      return beta;
    }
    if (v > alpha) alpha = v;
  }
  if (!any) return check ? -MATE + ply : 0;
  return alpha;
}

// Niveaux : profondeur maximale, temps, imprécision (en centièmes de pion) ajoutée aux coups.
const LEVELS = {
  debutant: { depth: 2, ms: 400, noise: 160 },
  club: { depth: 3, ms: 900, noise: 30 },
  maitre: { depth: 12, ms: 1600, noise: 0 },
};

export function think(fen, level = 'club') {
  const L = LEVELS[level] || LEVELS.club, st = parseFEN(fen);
  const root = legal(st);
  if (!root.length) return null;
  if (root.length === 1) return uciOf(root[0]);
  nodes = 0; killers = []; deadline = Date.now() + L.ms;
  const jitter = new Map(root.map(m => [m, (Math.random() * 2 - 1) * L.noise]));
  let best = root[0], scores = new Map();
  for (let depth = 1; depth <= L.depth; depth++) {
    try {
      const now = new Map();
      // Sans imprécision, seul le meilleur coup compte : la fenêtre se resserre à chaque coup.
      let alpha = -MATE - 1;
      for (const m of order(root, 0, best)) {
        const u = make(st, m);
        const v = -search(st, depth - 1, -MATE - 1, -alpha, 1);
        if (!L.noise && v > alpha) alpha = v;
        unmake(st, m, u);
        now.set(m, v);
      }
      scores = now;
      best = [...scores.keys()].reduce((a, m) => (scores.get(m) + jitter.get(m) > scores.get(a) + jitter.get(a) ? m : a));
      if (Math.abs(scores.get(best)) > MATE - 100) break;       // mat trouvé : inutile d'aller plus loin
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;
    }
  }
  return uciOf(best);
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = e => {
    const { id, fen, level } = e.data || {};
    let uci = null;
    try { uci = think(fen, level); } catch (_) {}
    self.postMessage({ id, uci });
  };
}
