// Calcul des résultats d'une manche et du bilan final. Module PUR (testé dans Node) :
// utilisé par le coordinateur, et par tous les clients pour l'écran de fin.

import { gameOf, contenders } from './machine.js';
import { ROUNDS_PER_TOURNAMENT } from './draw.js';
import { round } from './rounds/index.js';
import { rankRound, standings, tiebreakOrder, awards, FINAL_MULT } from './scoring.js';
import { scoreBac } from './petitbac.js';

export const roomInfo = m => ({ devices: Object.values(m.roster || {}).map(p => p.dev) });
export const paramsOf = m => {
  const g = gameOf(m);
  return round(g).params(m.seed, m.i, roomInfo(m));
};
export const namesOf = m => Object.fromEntries(Object.entries(m.roster || {}).map(([u, p]) => [u, p.name]));
const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

// Résultats d'une manche ordinaire : recalcul de chaque score depuis le payload.
export function computeRound(m, subs, boasts) {
  const g = gameOf(m);
  const def = round(g);
  const p = def.params(m.seed, m.i, roomInfo(m));
  const who = contenders(m);
  const scored = {};
  const entries = who.map(uid => {
    const sub = subs[uid];
    const payload = sub ? parse(sub.d) : null;
    if (!payload) return { uid, present: false, key: [Infinity] };
    const s = def.score(payload, p);
    scored[uid] = s;
    // Réponse automatique vide (le joueur n'a rien touché) : absent, 0 point.
    return { uid, present: !s.idle, key: s.key };
  });
  if (m.i >= ROUNDS_PER_TOURNAMENT) {
    return { res: null, order: tiebreakOrder(entries), scored };
  }
  const ranked = rankRound(entries, who.length, new Set(Object.keys(boasts || {})), m.i === ROUNDS_PER_TOURNAMENT - 1 ? FINAL_MULT : 1);
  const res = {};
  for (const uid of who) {
    const r = ranked[uid];
    const s = scored[uid];
    res[uid] = { rank: r.rank, base: r.base, boast: r.boast, pts: r.pts, absent: !!r.absent, tied: !!r.tied, label: s && !r.absent ? s.label : 'absent', st: JSON.stringify((s && s.stats) || {}).slice(0, 800) };
  }
  return { res, scored };
}

// Petit Bac : résultats à partir de la correction finale.
export function computeBac(m, prep, final, boasts) {
  const who = contenders(m);
  const bac = scoreBac(prep, final, who);
  const played = uid => !!prep.present[uid] && prep.answers[uid].some(a => a.status !== 'empty');
  const entries = who.map(uid => ({ uid, present: played(uid), key: bac[uid].key }));
  const ranked = rankRound(entries, who.length, new Set(Object.keys(boasts || {})), m.i === ROUNDS_PER_TOURNAMENT - 1 ? FINAL_MULT : 1);
  const res = {};
  for (const uid of who) {
    const r = ranked[uid];
    res[uid] = { rank: r.rank, base: r.base, boast: r.boast, pts: r.pts, absent: !!r.absent, tied: !!r.tied, label: played(uid) ? bac[uid].label : 'absent', st: JSON.stringify({ pts: bac[uid].pts, valid: bac[uid].valid }) };
  }
  return { res, bac };
}

// Statistiques finales (pour l'écran de fin) : calculées à partir de l'état publié.
export function finalSummary(m) {
  const roster = Object.keys(m.roster || {});
  const names = namesOf(m);
  const tbDet = parse((m.det || {})[ROUNDS_PER_TOURNAMENT] || '');
  const rows = standings(roster, m.res || {}, ROUNDS_PER_TOURNAMENT, tbDet && tbDet.order);
  const extra = {};
  m.plan.forEach((p, i) => {
    const r = (m.res || {})[i];
    if (!r) return;
    if (p.g === 'gong') {
      for (const [uid, x] of Object.entries(r)) {
        const st = parse(x.st) || {};
        if (st.best && st.best < 1000 && (!extra.bestReflex || st.best < extra.bestReflex.ms)) extra.bestReflex = { uid, ms: st.best };
      }
    }
    if (p.g === 'bac') {
      const det = parse((m.det || {})[i] || '') || {};
      const refused = [];
      Object.entries(det.cells || {}).forEach(([uid, cells]) => cells.forEach(c => { if (c.st === 'invalid' && c.t) refused.push({ uid, text: c.t }); }));
      const count = {};
      refused.forEach(x => { count[x.uid] = (count[x.uid] || 0) + 1; });
      const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) extra.doubtful = refused.find(x => x.uid === top[0]);
    }
  });
  return { rows, names, awards: awards(roster, m.res || {}, m.plan, names, extra), tiebreak: tbDet };
}
