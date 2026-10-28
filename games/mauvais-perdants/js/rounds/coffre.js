// Le Coffre — mémoire des nombres. Un nombre s'affiche, disparaît, on le retape.
// Réussi : un chiffre de plus. 2 vies : une erreur redonne un nouveau nombre de même
// longueur. Les chiffres sont des CHAÎNES (les zéros comptent) ; le premier chiffre
// n'est jamais 0 pour éviter toute ambiguïté de lecture. Départ à 3 chiffres.
//
// DEUX MODES. Seul (duel contre Gonzague) : chacun son rythme, le plus long nombre gagne.
// À plusieurs : ÉLIMINATION À TOUR DE RÔLE. Le même nombre s'affiche pour tout le monde,
// puis seul le joueur dont c'est le tour le retape. Exact : le nombre s'allonge d'un
// chiffre et le suivant joue. Faux ou trop lent : éliminé. Le dernier en lice gagne, les
// éliminés sont classés dans l'ordre inverse de leur sortie. L'état de la partie est un
// journal `turns/<n>/<uid>` ({ r: 'o'|'x', t: heure serveur }), écrit une fois par entrée :
// tout le monde en déduit, avec derive(), qui joue, quel nombre, et quand.

import { arr, int, roundRng } from './_deps.js';

export const START = 3, MAX_LEN = 20, LIVES = 2;
export const showMs = len => Math.min(5200, 700 + 320 * len);

export function numberFor(seed, i, len, attempt) {
  const r = roundRng(seed, i, 'coffre', `${len}:${attempt}`);
  let s = String(r.int(1, 9));
  while (s.length < len) s += String(r.int(0, 9));
  return s;
}

// La réponse n'est acceptée que si elle ne contient QUE des chiffres (espaces retirés).
export const normalizeDigits = v => {
  const s = String(v == null ? '' : v).replace(/\s+/g, '');
  return /^[0-9]{0,24}$/.test(s) ? s : null;
};

// ───────────── mode élimination
export const LEAD_MS = 1500, PAUSE_MS = 1300, TIMEOUT_GRACE_MS = 3000, CAP_MS = 998, WIN_MS = 999;
export const answerMs = len => 8000 + 1000 * len;     // temps pour retaper une fois le nombre caché

// Ordre de passage : tiré au sort (graine), identique chez tous.
export function turnOrder(seed, i, uids) {
  return roundRng(seed, i, 'coffre', 'ordre').shuffle([...uids].sort());
}

// log : { [n]: { [uid]: { r: 'o'|'x', t } } }. Rejoue la partie dans l'ordre des tours et
// renvoie l'état courant : qui joue (mover), quel nombre, quand il apparaît (start), les
// éliminés (out[uid] = tour), et `over` quand il ne reste qu'un joueur ou que le nombre
// maximal est dépassé. Seule l'entrée du joueur dont c'est le tour compte.
export function derive(p, log, startAt) {
  const order = p.order;
  const alive = new Set(order);
  const out = {}, failLen = {}, passed = {};
  let oks = 0, last = -1, lastMove = null, prevT = startAt - PAUSE_MS + LEAD_MS;
  for (let n = 0; n < 400; n++) {
    const len = START + oks;
    if (alive.size <= 1 || len > MAX_LEN) return { over: true, n, len, alive: [...alive], out, failLen, passed, oks, lastMove, winner: alive.size === 1 ? [...alive][0] : null };
    let mover = null;
    for (let k = 1; k <= order.length; k++) { const u = order[(last + k + order.length) % order.length]; if (alive.has(u)) { mover = u; break; } }
    const e = log && log[n] && log[n][mover];
    if (!e || (e.r !== 'o' && e.r !== 'x')) return { over: false, n, mover, len, num: numberFor(p.seed, p.i, len, n), start: prevT + PAUSE_MS, alive: [...alive], out, failLen, passed, oks, lastMove };
    lastMove = { n, u: mover, r: e.r, len, num: numberFor(p.seed, p.i, len, n) };
    if (e.r === 'o') { oks++; passed[mover] = (passed[mover] || 0) + 1; } else { alive.delete(mover); out[mover] = n; failLen[mover] = len; }
    last = order.indexOf(mover);
    prevT = Number(e.t) || prevT;
  }
  return { over: true, n: 400, len: START + oks, alive: [...alive], out, failLen, passed, oks, lastMove, winner: null };
}

// Ce que vaut un joueur d'après le journal (derive) : éliminé au tour n, dernier en lice, ou encore en lice.
// C'est cette valeur, jamais celle déclarée par un client, qui sert au classement.
export function verdictOf(d, uid) {
  if (d.out && d.out[uid] !== undefined) return { o: d.out[uid], l: d.failLen[uid] };
  if (d.over && d.winner === uid) return { o: WIN_MS, l: d.len };
  return { o: CAP_MS, l: d.len };
}

export function replay(answers, p) {
  let len = START, lives = LIVES, best = 0;
  const log = [];
  for (let a = 0; a < answers.length && lives > 0 && len <= MAX_LEN; a++) {
    const want = numberFor(p.seed, p.i, len, a);
    const got = normalizeDigits(answers[a]);
    const ok = got === want;
    log.push({ want, got, ok });
    if (ok) { best = len; len++; } else lives--;
  }
  return { best, lives, log };
}

export default {
  id: 'coffre', family: 'memoire', title: 'Le Coffre', verb: 'Retiens',
  rules: ['Un nombre s’affiche pour tout le monde, puis disparaît.', 'Chacun son tour, le joueur désigné le retape. Exact : il s’allonge d’un chiffre. Faux ou trop lent : éliminé.', 'Le dernier en lice gagne.'],
  playMs: 150000,
  unit: 'chiffres retenus',
  eligible: () => true,
  // À plusieurs : élimination à tour de rôle ; seul : duel contre Gonzague, chacun son rythme.
  params(seed, i, room) {
    const solo = !room || room.solo || !room.who || room.who.length < 2;
    return { seed, i, start: START, lives: LIVES, mode: solo ? 'solo' : 'turns', order: solo ? [] : turnOrder(seed, i, room.who) };
  },
  ghost: () => ({ key: [-7, 60], label: '7 chiffres' }),
  tieText: p => (p && p.mode === 'turns' ? 'Encore plusieurs en lice à la fin du temps : ex æquo.' : 'À longueur égale, le plus rapide (à 0,5 s près).'),
  score(payload, p) {
    if (p && p.mode === 'turns') {
      // o : tour de l'élimination (WIN_MS = dernier en lice, CAP_MS = encore en lice à la fin du temps) ; l : longueur ratée.
      const o = int(payload && payload.o, 0, WIN_MS, -1), l = int(payload && payload.l, 0, MAX_LEN + 1, 0);
      if (o < 0) return { idle: true, key: [0], label: 'aucun', valid: true, stats: { best: 0, lastFail: null } };
      const label = o === WIN_MS ? 'dernier en lice' : o === CAP_MS ? 'encore en lice' : `éliminé à ${l} chiffres`;
      return { idle: false, key: [-o], label, valid: true, stats: { best: o >= CAP_MS ? Math.max(l, START) : Math.max(0, l - 1), lastFail: null } };
    }
    const answers = arr(payload && payload.a, 40).map(x => String(x == null ? '' : x).slice(0, 24));
    const { best, log } = replay(answers, p);
    const ms = int(payload && payload.ms, 0, 600000, 600000);
    const lastFail = log.filter(l => !l.ok).pop();
    return { idle: !answers.length, key: [-best, best ? Math.round(ms / 500) : 0], label: best ? `${best} chiffres` : 'aucun', valid: true, stats: { best, lastFail: lastFail ? { want: lastFail.want, got: lastFail.got } : null } };
  },
};
