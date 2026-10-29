// Règles du 421 : fonctions pures, sans Firebase ni DOM. Partagées par la page, les joueurs
// ordinateur et les tests.
//
// La partie est un objet tel qu'il est stocké sous qd/<code> :
//   { phase: 'lobby'|'playing'|'ended', players: [{ name, uid, bot?, tokens, losses }, …],
//     pot, stage: 'charge'|'decharge', gameNum,
//     round: { starter, order: [pnum…], turn, max, results: { pnum: 'abc' }, cur: { d, r, n, by, keep, prev } },
//     last: { winner, loser, value, best, worst, stage }, result: { loser } }
// Dés : une chaîne de trois chiffres ('421'), plus sûre dans Firebase qu'un tableau.
//
// Déroulé : 21 jetons au pot. Chaque manche, chacun lance trois dés (trois lancers au plus, en
// gardant les dés qu'il veut) ; le premier fixe, par le nombre de lancers qu'il a utilisés, le
// maximum des suivants. Le plus mauvais prend autant de jetons que vaut la meilleure combinaison :
// au pot pendant la charge, au gagnant de la manche pendant la décharge. Qui n'a plus de jetons
// pendant la décharge est sorti ; le dernier à en garder perd la partie.

export const POT = 21, MAX_PLAYERS = 8;
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// ══════════════════ Combinaisons ══════════════════
// rank : plus grand = meilleur ; value : jetons que la combinaison fait prendre au perdant.
export function combo(dice) {
  const d = String(dice).split('').map(Number).sort((a, b) => b - a);
  const [a, b, c] = d, key = d.join('');
  if (key === '421') return { key, kind: '421', rank: 1000, value: 10, label: '421' };
  if (key === '111') return { key, kind: 'aces', rank: 907, value: 7, label: 'Trois as' };
  if (b === 1 && c === 1) return { key, kind: 'aces', rank: 900 + a, value: a, label: `${a} et deux as` };
  if (a === b && b === c) return { key, kind: 'brelan', rank: 700 + a, value: 3, label: `Brelan de ${a}` };
  if (a - 1 === b && b - 1 === c) return { key, kind: 'suite', rank: 600 + a, value: 2, label: `Suite ${key}` };
  if (key === '221') return { key, kind: 'nenette', rank: 0, value: 1, label: 'Nénette' };
  return { key, kind: 'simple', rank: 100 + (a * 100 + b * 10 + c) / 1000, value: 1, label: key };
}
export const validDice = d => typeof d === 'string' && /^[1-6]{3}$/.test(d);

// ══════════════════ Joueurs ══════════════════
export const toPlayers = raw => (Array.isArray(raw) ? raw : Object.keys(raw || {}).sort((a, b) => a - b).map(k => raw[k]));
const seated = g => toPlayers(g.players).map((p, i) => p && i).filter(i => i !== false && i !== null && i !== undefined);
// En jeu : tous pendant la charge ; pendant la décharge, ceux qui ont encore des jetons.
export const activeOf = g => seated(g).filter(i => g.stage !== 'decharge' || num(toPlayers(g.players)[i].tokens) > 0);
const toResults = raw => raw && typeof raw === 'object' ? raw : {};

// Ordre d'une manche : on part du joueur `starter`, dans l'ordre des places.
function orderFrom(g, starter) {
  const act = activeOf(g);
  const i = Math.max(0, act.indexOf(starter));
  return [...act.slice(i), ...act.slice(0, i)];
}
// `cur` : dés du joueur au trait (d), lancers faits (r). n compte tous les lancers de la partie et
// by / keep / prev décrivent le dernier : la page sait ainsi quels dés faire rouler, même quand
// ce lancer a terminé le tour (et la manche).
const newRound = (g, starter, cur = {}) => ({ starter, order: orderFrom(g, starter), turn: 0, max: 3, results: {},
  cur: { d: '', r: 0, n: num(cur.n), by: cur.by ?? null, keep: cur.keep || '', prev: cur.prev || '' } });

// Le joueur au trait et le nombre de lancers qui lui sont permis.
export const current = g => (g?.round ? g.round.order?.[g.round.turn] ?? null : null);
export const limitOf = g => (g.round.turn === 0 ? 3 : Math.max(1, Math.min(3, num(g.round.max) || 3)));

// ══════════════════ Partie ══════════════════
export function startGame(g) {
  if (!g || g.phase !== 'lobby') return { ok: false, reason: 'phase' };
  if (seated(g).length < 2) return { ok: false, reason: 'waiting' };
  const players = toPlayers(g.players).map(p => p && { ...p, tokens: 0, losses: num(p.losses) });
  const next = { ...g, phase: 'playing', players, pot: POT, stage: 'charge', last: null, result: null };
  next.round = newRound(next, seated(next)[0]);
  return { ok: true, game: next };
}

// Lancer : `keep` = indices des dés gardés (aucun au premier lancer), `values` = trois dés tirés
// par le lanceur ; seuls ceux qui ne sont pas gardés servent. `expect` = lancers déjà faits.
export function roll(g, { pnum, keep = [], values, expect }) {
  if (!g || g.phase !== 'playing' || !g.round) return { ok: false, reason: 'phase' };
  if (current(g) !== pnum) return { ok: false, reason: 'turn' };
  const cur = g.round.cur || { d: '', r: 0, n: 0 }, r = num(cur.r);
  if (expect !== undefined && expect !== r) return { ok: false, reason: 'stale' };
  if (r >= limitOf(g)) return { ok: false, reason: 'limit' };
  if (!validDice(values)) return { ok: false, reason: 'dice' };
  const held = [...new Set(keep)].filter(i => i === 0 || i === 1 || i === 2);
  if (r === 0 && held.length) return { ok: false, reason: 'keep' };
  if (held.length === 3) return { ok: false, reason: 'keep' };
  const d = [0, 1, 2].map(i => (held.includes(i) ? cur.d[i] : values[i])).join('');
  const next = { ...g, round: { ...g.round, cur: { d, r: r + 1, n: num(cur.n) + 1, keep: held.join(''), by: pnum, prev: '' } } };
  // Plus de lancer possible : le tour s'arrête de lui-même.
  return r + 1 >= limitOf(next) ? stop(next, { pnum }) : { ok: true, game: next };
}

// S'arrêter : la combinaison est retenue, la main passe ; au dernier joueur, la manche se règle.
export function stop(g, { pnum }) {
  if (!g || g.phase !== 'playing' || !g.round) return { ok: false, reason: 'phase' };
  if (current(g) !== pnum) return { ok: false, reason: 'turn' };
  const cur = g.round.cur || {};
  if (!num(cur.r) || !validDice(cur.d)) return { ok: false, reason: 'roll' };
  const round = { ...g.round, results: { ...toResults(g.round.results), [pnum]: cur.d } };
  if (round.turn === 0) round.max = num(cur.r);
  round.turn += 1;
  round.cur = { d: '', r: 0, n: num(cur.n), by: pnum, keep: cur.keep || '', prev: cur.d };
  const next = { ...g, round };
  return { ok: true, game: round.turn >= round.order.length ? settle(next) : next };
}

// Règlement de la manche. Égalités : le meilleur est le premier à l'avoir fait ; le plus mauvais,
// le dernier (il jouait en connaissant les autres).
export function settle(g) {
  const { order } = g.round, res = toResults(g.round.results);
  let best = order[0], worst = order[0];
  for (const p of order) {
    const r = combo(res[p]).rank;
    if (r > combo(res[best]).rank) best = p;
    if (r <= combo(res[worst]).rank) worst = p;
  }
  const value = combo(res[best]).value, players = toPlayers(g.players).map(p => p && { ...p });
  let pot = num(g.pot), stage = g.stage, moved;
  if (stage === 'charge') {
    moved = Math.min(value, pot);
    pot -= moved; players[worst].tokens = num(players[worst].tokens) + moved;
  } else {
    moved = Math.min(value, num(players[best].tokens));
    players[best].tokens -= moved; players[worst].tokens = num(players[worst].tokens) + moved;
  }
  const last = { winner: best, loser: worst, value: moved, best: res[best], worst: res[worst], stage, results: res, order };
  let next = { ...g, players, pot, last };
  if (stage === 'charge' && pot === 0) next.stage = 'decharge';
  // Fin : pendant la décharge, il ne reste qu'un joueur avec des jetons.
  const left = activeOf(next);
  if (next.stage === 'decharge' && left.length <= 1) {
    const loser = left[0] ?? worst;
    next.players = next.players.map((p, i) => p && (i === loser ? { ...p, losses: num(p.losses) + 1 } : p));
    return { ...next, phase: 'ended', round: null, lastRoll: g.round.cur, result: { loser } };
  }
  next.round = newRound(next, left.includes(worst) ? worst : left[0], g.round.cur);
  return next;
}

// Revanche : jetons rendus au pot ; le perdant commence.
export function nextGame(g, { gameNum } = {}) {
  if (!g || g.phase !== 'ended') return { ok: false, reason: 'phase' };
  const n = Math.max(1, Math.trunc(num(g.gameNum)) || 1);
  if (gameNum !== undefined && gameNum !== n) return { ok: false, reason: 'stale' };
  const players = toPlayers(g.players).map(p => p && { ...p, tokens: 0 });
  const next = { ...g, players, gameNum: n + 1, phase: 'playing', pot: POT, stage: 'charge', last: null, result: null };
  next.round = newRound(next, g.result?.loser ?? seated(next)[0]);
  return { ok: true, game: next };
}

// ══════════════════ Joueurs ordinateur ══════════════════
// Que garder ? On vise le 421 quand on en tient deux morceaux, les as quand on en a, sinon une
// paire pour le brelan ; la meilleure combinaison possible gardée telle quelle.
export function botKeep(d) {
  const v = d.split('').map(Number), c = combo(d);
  if (c.rank >= 600) return [0, 1, 2];
  const pick = want => { const out = []; want.forEach(x => { const i = v.findIndex((y, k) => y === x && !out.includes(k)); if (i >= 0) out.push(i); }); return out; };
  const parts = pick([4, 2, 1]);
  if (parts.length === 2) return parts;
  const ones = v.map((x, i) => x === 1 && i).filter(i => i !== false);
  if (ones.length) return ones;
  const pair = v.find((x, i) => v.indexOf(x) !== i);
  if (pair) return v.map((x, i) => x === pair && i).filter(i => i !== false);
  return [v.indexOf(Math.max(...v))];
}
// S'arrêter ? Oui quand rien n'est à relancer ; sinon, quand on bat déjà le plus mauvais de la
// manche avec une combinaison sûre (le premier joueur, lui, cherche toujours mieux).
export function botStops(g, d) {
  const keep = botKeep(d), r = num(g.round.cur.r);
  if (r >= limitOf(g) || keep.length === 3) return true;
  const c = combo(d).rank, res = toResults(g.round.results);
  const others = Object.values(res).map(x => combo(x).rank);
  if (!others.length) return c >= 700;
  return c > Math.min(...others) && c >= 600;
}

export const randomDice = (rnd = Math.random) => Array.from({ length: 3 }, () => 1 + Math.floor(rnd() * 6)).join('');
