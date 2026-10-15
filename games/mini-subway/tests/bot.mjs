// Joueur automatique simple : sert aux tests de longue durée, au déterminisme et au
// calibrage (mesures du cahier §18.3). Il n'utilise que des commandes publiques.

import { apply, inventory, stationCapacity, segment } from '../js/engine/sim.js';

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function botTurn(st, stats = null) {
  if (st.over) return;
  const log = (cmd, r) => { if (stats) { stats.cmds++; if (!r.ok) stats.rejected++; } return r; };
  const go = cmd => log(cmd, apply(st, cmd));
  if (st.reward) {
    const order = ['carriage', 'line', 'crossings', 'hub'];
    const opts = st.reward.opts;
    let pick = 0;
    for (const k of order) { const i = opts.findIndex(o => o.k === k); if (i >= 0) { pick = i; break; } }
    if (stats) stats.picks[opts[pick]?.k || 'none'] = (stats.picks[opts[pick]?.k || 'none'] || 0) + 1;
    go({ type: 'reward', pick, loco: 1 });
  }
  const onLine = new Set(st.lines.flatMap(l => l.s));
  const loose = st.stations.filter(s => !onLine.has(s.id));
  for (const s of loose) {
    const inv = inventory(st);
    const active = st.lines.filter(l => l.s.length >= 2);
    // Nouvelle ligne si possible, sinon prolongement de l'extrémité la plus proche.
    if (inv.free.lines > 0 || active.length === 0) {
      const l = st.lines.find(x => x.s.length < 2 && x.id < st.own.lines);
      const others = st.stations.filter(o => o !== s && o.shape !== s.shape).sort((a, b) => d2(a, s) - d2(b, s));
      if (l && others.length && go({ type: 'line', l: l.id, s: [s.id, others[0].id] }).ok) continue;
    }
    let best = null;
    for (const l of active) {
      if (l.loop) continue;
      for (const end of [0, l.s.length - 1]) {
        const e = st.stations.find(x => x.id === l.s[end]);
        const dd = d2(e, s);
        if (!best || dd < best.dd) best = { l, end, dd };
      }
    }
    if (best) {
      const seq = best.end === 0 ? [s.id, ...best.l.s] : [...best.l.s, s.id];
      go({ type: 'line', l: best.l.id, s: seq });
    }
  }
  const inv = inventory(st);
  if (inv.free.locos > 0) {
    const busy = st.lines.filter(l => l.s.length >= 2).sort((a, b) => b.s.length - a.s.length);
    for (const l of busy) if (go({ type: 'train', l: l.id }).ok) break;
  }
  if (inv.free.express > 0) {
    const l = st.lines.find(x => x.s.length >= 2);
    if (l) go({ type: 'train', l: l.id, kind: 'express' });
  }
  if (inv.free.cars > 0 && st.trains.length) {
    const t = st.trains.slice().sort((a, b) => b.ld.length - a.ld.length || a.c - b.c)[0];
    go({ type: 'car', tr: t.id });
  }
  if (inv.free.hubs > 0) {
    const s = st.stations.filter(x => !x.hub).sort((a, b) => b.q.length / stationCapacity(st, b) - a.q.length / stationCapacity(st, a))[0];
    if (s) go({ type: 'hub', s: s.id });
  }
  void segment;
}
