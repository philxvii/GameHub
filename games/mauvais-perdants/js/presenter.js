// Ce que le présentateur remarque. Module PUR : des résultats calculés -> des
// évènements classés par importance, avec UNIQUEMENT des faits mesurés (rang,
// résultat affiché, faux départs, tirs ratés, fanfaronnade…). Le choix de la
// phrase est dans lines.js ; l'IA éventuelle reçoit les mêmes faits.

import { pickLine } from './lines.js';
import { round } from './rounds/index.js';

const MEMORY = ['chemin', 'numeros', 'damier', 'coffre', 'dejavu'];

// Seuils d'« exploit » : un score qu'on remarque, calibré sur les manches elles-mêmes.
const EXPLOIT = {
  gong: s => s.mean && s.mean < 235,
  tir: s => s.total && s.total < 15000 && s.miss <= 1,
  dictee: s => s.wpm >= 80,
  chemin: s => s.level >= 11,
  numeros: s => s.best >= 12,
  damier: s => s.level >= 10,
  coffre: s => s.best >= 10,
  dejavu: s => s.correct >= 40,
  calcul: s => s.net >= 22,
  nuage: s => s.pct <= 6,
  bac: s => s.pts >= 35,
};

// Petit écart entre 1er et 2e, dans l'unité de la manche (uniquement les manches chronométrées).
function gapText(game, a, b) {
  if (game === 'gong' && a.mean && b.mean) { const d = b.mean - a.mean; return d > 0 && d < 25 ? `${d} ms` : null; }
  if (game === 'tir' && a.total && b.total) { const d = b.total - a.total; return d > 0 && d < 500 ? `${(d / 1000).toFixed(2).replace('.', ',')} s` : null; }
  if (game === 'dictee' && a.ms && b.ms) { const d = b.ms - a.ms; return d > 0 && d < 600 ? `${(d / 1000).toFixed(2).replace('.', ',')} s` : null; }
  if (game === 'nuage' && a.pct !== undefined && b.pct !== undefined) { const d = b.pct - a.pct; return d > 0 && d <= 2 ? `${d} point${d > 1 ? 's' : ''} d'écart` : null; }
  return null;
}

// rows : [{ uid, rank, pts, boast, absent, label, stats }] triés par rang.
// ctxExtra : { lastRound: { uid: rank } (manche précédente), streaks: {uid:n}, bac: { weird, bold } }
export function roundEvents(game, rows, names, n, extra = {}) {
  const ev = [];
  const name = uid => names[uid] || '?';
  const present = rows.filter(r => !r.absent);
  if (!present.length) return ev;
  const first = present.filter(r => r.rank === 1);
  const worst = Math.max(...present.map(r => r.rank));
  const last = present.filter(r => r.rank === worst && worst > 1);
  const top = first[0];

  for (const r of rows) {
    if (r.boast < 0) ev.push({ type: 'boast_fail', pri: 9, about: 'low', ctx: { P: name(r.uid), rank: r.rank } });
    if (r.boast > 0) ev.push({ type: 'boast_win', pri: 8, about: 'top', ctx: { P: name(r.uid) } });
    if (r.absent) ev.push({ type: 'absent', pri: 3, about: 'low', ctx: { P: name(r.uid) } });
  }
  const ex = EXPLOIT[game];
  if (top && ex && ex(top.stats || {})) ev.push({ type: 'exploit', pri: 8, about: 'top', ctx: { P: name(top.uid), label: top.label } });
  if (first.length >= 2) ev.push({ type: 'tie', pri: 6, about: 'top', ctx: { A: name(first[0].uid), B: name(first[1].uid) } });
  else {
    const second = present.find(r => r.rank === 2);
    const g = second && gapText(game, top.stats || {}, second.stats || {});
    if (g) ev.push({ type: 'tiny_gap', pri: 6, about: 'top', ctx: { A: name(top.uid), B: name(second.uid), gap: g } });
  }
  if (extra.bac && extra.bac.weird) ev.push({ type: 'bac_weird', pri: 7, about: 'low', ctx: { P: name(extra.bac.weird.uid), answer: extra.bac.weird.text, cat: extra.bac.weird.cat } });
  if (extra.bac && extra.bac.bold) ev.push({ type: 'bac_bold', pri: 5, about: 'top', ctx: { P: name(extra.bac.bold.uid), answer: extra.bac.bold.text } });

  if (n >= 2 && last.length === 1 && present.length >= 2) {
    const lr = last[0];
    const again = extra.lastRound && extra.lastRound[lr.uid] === n;
    const ctx = { P: name(lr.uid), label: lr.label, again, ...(lr.stats || {}) };
    const specific = MEMORY.includes(game) ? 'memory_last' : `${game}_last`;
    if (game === 'coffre' && lr.stats && lr.stats.lastFail) ev.push({ type: 'coffre_fail', pri: 5, about: 'low', ctx: { P: name(lr.uid), ...lr.stats.lastFail } });
    ev.push({ type: specific, pri: 5, about: 'low', ctx, fallback: 'round_last' });
    ev.push({ type: 'round_last', pri: 4, about: 'low', ctx });
  }
  if (first.length === 1) {
    const ctx = { P: name(top.uid), label: top.label, streak: (extra.streaks && extra.streaks[top.uid]) || 1, wasLast: extra.lastRound && extra.lastRound[top.uid] === n && n > 2, ...(top.stats || {}) };
    const specific = MEMORY.includes(game) ? 'memory_win' : `${game}_win`;
    ev.push({ type: specific, pri: 4.5, about: 'top', ctx, fallback: 'round_win' });
    ev.push({ type: 'round_win', pri: 4, about: 'top', ctx });
  }
  return ev.sort((a, b) => b.pri - a.pri);
}

// Classement général avant/après : prev, cur = standings() ; i = manche jouée (0..4).
export function boardEvents(prev, cur, names, i, total) {
  const ev = [];
  const name = uid => names[uid] || '?';
  const lead = cur[0], second = cur[1];
  const prevLead = prev && prev.length ? prev[0] : null;
  const placeIn = (rows, uid) => (rows.find(r => r.uid === uid) || {}).place;
  if (prevLead && lead && i > 0 && lead.uid !== prevLead.uid && lead.place === 1 && cur.filter(r => r.place === 1).length === 1) {
    ev.push({ type: 'leader_change', pri: 9, ctx: { P: name(lead.uid), O: name(prevLead.uid) } });
  }
  if (prev && prev.length && i > 0) {
    for (const r of cur) {
      const from = placeIn(prev, r.uid), to = r.place;
      if (from - to >= 2) ev.push({ type: 'comeback', pri: 7, ctx: { P: name(r.uid), from, to } });
      if (to - from >= 2) ev.push({ type: 'drop', pri: 6, ctx: { P: name(r.uid), from, to } });
    }
  }
  if (lead && second) {
    const gap = lead.total - second.total;
    if (i === total - 2) ev.push({ type: 'before_final', pri: 8, ctx: { P: name(lead.uid), O: name(second.uid), total: lead.total, gap } });
    ev.push({ type: 'leader_holds', pri: 3, ctx: { P: name(lead.uid), total: lead.total, gap } });
  }
  return ev.sort((a, b) => b.pri - a.pri);
}

// Choisit jusqu'à `max` répliques : la plus importante, puis une qui parle de l'autre
// bout du classement (le vainqueur ET le dernier), sans répéter une réplique récente.
export function speakFor(events, opts, max = 2, random = Math.random) {
  const out = [];
  const used = (opts.used || []).slice();
  const abouts = new Set();
  for (const e of events) {
    if (out.length >= max) break;
    if (out.length && e.about && abouts.has(e.about)) continue;
    let line = pickLine(e.type, e.ctx, { ...opts, used }, random);
    if (!line && e.fallback) line = pickLine(e.fallback, e.ctx, { ...opts, used }, random);
    if (!line) continue;
    if (out.some(o => o.text === line.text)) continue;
    used.push(line.id);
    out.push({ ...line, ev: e.type, facts: factsOf(e) });
    if (e.about) abouts.add(e.about);
  }
  return out;
}

// Faits transmis à l'IA : courts, déjà publics dans la partie, rien d'autre.
export function factsOf(e) {
  return Object.entries(e.ctx || {})
    .filter(([k, v]) => v !== undefined && v !== null && v !== false && typeof v !== 'object')
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(' ; ').slice(0, 300);
}

export const roundTitle = id => (round(id) || {}).title || id;
