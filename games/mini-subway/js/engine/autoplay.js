// Joueur automatique simple : anime l'écran d'accueil et sert aux tests de longue durée,
// au déterminisme et au calibrage (mesures du cahier §18.3). Il n'utilise que des
// commandes publiques, comme un joueur.

import { apply, inventory, stationCapacity } from './sim.js';

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function botTurn(st, stats = null) {
  if (st.over) return;
  const go = cmd => { const r = apply(st, cmd); if (stats) { stats.cmds++; if (!r.ok) stats.rejected++; } return r; };
  if (st.reward) {
    const order = ['carriage', 'line', 'crossings', 'hub'];
    const opts = st.reward.opts;
    let pick = 0;
    for (const k of order) { const i = opts.findIndex(o => o.k === k); if (i >= 0) { pick = i; break; } }
    if (stats) stats.picks[opts[pick]?.k || 'none'] = (stats.picks[opts[pick]?.k || 'none'] || 0) + 1;
    go({ type: 'reward', pick, loco: 1 });
  }
  const pos = id => st.stations.find(x => x.id === id);
  const onLine = new Set(st.lines.flatMap(l => l.s));
  for (const s of st.stations.filter(x => !onLine.has(x.id))) {
    const inv = inventory(st);
    const active = st.lines.filter(l => l.s.length >= 2);
    // Option la moins coûteuse : nouvelle ligne, prolongement ou insertion dans un tronçon.
    const opts = [];
    if (inv.free.lines > 0 || active.length === 0) {
      const l = st.lines.find(x => x.s.length < 2 && x.id < st.own.lines);
      const cand = st.stations.filter(o => o !== s && o.shape !== s.shape).sort((a, b) => d2(a, s) - d2(b, s));
      const near = cand.find(o => onLine.has(o.id)) || cand[0];
      if (l && near) opts.push({ cost: Math.sqrt(d2(near, s)) * (active.length < 3 ? 0.4 : 0.8), cmd: { type: 'line', l: l.id, s: [s.id, near.id] } });
    }
    for (const l of active) {
      if (!l.loop) {
        opts.push({ cost: Math.sqrt(d2(pos(l.s[0]), s)), cmd: { type: 'line', l: l.id, s: [s.id, ...l.s] } });
        opts.push({ cost: Math.sqrt(d2(pos(l.s[l.s.length - 1]), s)), cmd: { type: 'line', l: l.id, s: [...l.s, s.id] } });
      }
      for (let i = 1; i < l.s.length; i++) {
        const a = pos(l.s[i - 1]), b = pos(l.s[i]);
        const seq = l.s.slice(); seq.splice(i, 0, s.id);
        opts.push({ cost: (Math.sqrt(d2(a, s)) + Math.sqrt(d2(s, b)) - Math.sqrt(d2(a, b))) * 1.15, cmd: { type: 'line', l: l.id, s: seq, loop: l.loop } });
      }
    }
    opts.sort((a, b) => a.cost - b.cost);
    for (const o of opts) if (go(o.cmd).ok) { onLine.add(s.id); break; }
  }
  const inv = inventory(st);
  const load = l => l.s.reduce((n, id) => n + (pos(id)?.q.length || 0), 0) / (1 + st.trains.filter(t => t.l === l.id).length);
  const busy = st.lines.filter(l => l.s.length >= 2).sort((a, b) => load(b) - load(a));
  if (inv.free.locos > 0) for (const l of busy) if (go({ type: 'train', l: l.id }).ok) break;
  if (inv.free.express > 0) for (const l of busy) if (go({ type: 'train', l: l.id, kind: 'express' }).ok) break;
  if (inv.free.cars > 0 && st.trains.length) {
    const t = st.trains.slice().sort((a, b) => b.ld.length - a.ld.length || a.c - b.c)[0];
    go({ type: 'car', tr: t.id });
  }
  if (inv.free.hubs > 0) {
    const s = st.stations.filter(x => !x.hub).sort((a, b) => b.q.length / stationCapacity(st, b) - a.q.length / stationCapacity(st, a))[0];
    if (s) go({ type: 'hub', s: s.id });
  }
}
