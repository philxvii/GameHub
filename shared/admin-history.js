// Historique des parties de l'admin : à la fin d'une partie, le panneau en range un résumé dans
// history/<id> (vainqueur, scores, qui a gagné quoi) avant que la partie ne soit nettoyée.
// Ce module est pur : il lit le contenu d'une partie et en tire un résumé court, sans toucher à la base.
// Les règles de la base (firebase/build-rules.js, nœud history) bornent chaque champ.

const nf = new Intl.NumberFormat('fr-FR');
const clip = (v, n) => String(v ?? '').replace(/</g, '‹').trim().slice(0, n);
const money = n => `${nf.format(Math.round(n || 0))} $`;
const list = v => (Array.isArray(v) ? v : Object.values(v || {})).filter(x => x && typeof x === 'object');
// Joueurs par position (trous conservés) : l'index sert à retrouver le vainqueur ou le rôle.
const slots = v => (Array.isArray(v) ? v : Object.values(v || {}));
const num = v =>(typeof v === 'number' && isFinite(v) ? v : 0);
const many = (n, one, plural = one + 's') => `${nf.format(n)} ${n > 1 ? plural : one}`;
const names = rows => rows.map(r => r.n).join(' et ');

const ENDED = /^(ended|end|finished|gameover|win|draw)$/;

// Une partie est terminée selon la phase propre à chaque jeu. Roulette n'a pas de fin : une table reste ouverte.
export function isEnded(g, f) {
  if (g.id === 'roulette') return false;
  if (g.id === 'quiestce') return f.phase === 'round-over' && !!(f.roundResult && f.roundResult.matchOver);
  return ENDED.test(f.phase || '');
}

// Identifiant stable : la même partie n'est archivée qu'une fois. Puissance 4 et les Échecs enchaînent des manches sous le même code.
export function archiveId(g, code, f) {
  return `${g.db}-${code}-${num(f.createdAt)}${g.id === 'puissance4' || g.id === 'echecs' ? '-' + (f.gameNum || 1) : ''}`.slice(0, 90);
}

// Places 1, 2, 3… ; deux scores identiques partagent la place.
function rank(rows, better) {
  rows.sort((a, b) => better(a, b));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.r = p && better(p, r) === 0 ? p.r : i + 1; r.w = r.r === 1; });
  return rows;
}
const winLine = (rows, one, tie = 'terminent ex æquo') => {
  const w = rows.filter(r => r.w);
  return !w.length ? 'Partie terminée' : w.length === 1 ? `${w[0].n} ${one}` : `${names(w)} ${tie}`;
};

const ROLES = { civil: 'Civil', undercover: 'Undercover', mrwhite: 'Mr White' };
const ROUND_TITLES = { bac: 'Le Petit Bac', calcul: 'Calcul express', chemin: 'Le Chemin', coffre: 'Le Coffre', damier: 'Le Damier', dejavu: 'Déjà vu ?', dictee: 'La Dictée', gong: 'Le Gong', nuage: 'Le Nuage', numeros: 'Les Numéros', prix: 'L’Étiquette', tir: 'Le Stand de tir' };

const SUMMARY = {
  banqueroll(d) {
    const fin = (d.trail && d.trail.final) || {};
    const rows = rank(list(d.players).map(p => ({ id: p.id, n: p.name, v: typeof fin[p.id] === 'number' ? fin[p.id] : num(p.cash), out: !!p.bankrupt })),
      (a, b) => (b.id === d.winnerId) - (a.id === d.winnerId) || b.v - a.v);
    rows.forEach(r => { r.s = money(r.v); if (r.out) r.x = 'Faillite'; r.w = r.id === d.winnerId; if (r.w) r.r = 1; });
    const w = rows.find(r => r.w);
    const byId = Object.fromEntries(rows.map(r => [r.id, r.n]));
    return {
      win: w ? `${w.n} remporte la partie` : 'Partie terminée', sub: w ? `Fortune nette : ${w.s}` : '',
      rows,
      k: list(d.bonuses).filter(b => b.winners && b.winners.length).map(b => ({ t: `Prime · ${b.label}`, w: b.winners.map(id => byId[id] || '?').join(' et '), d: `+${money(b.value)}` })),
    };
  },

  mauvaisperdants(d) {
    const m = d.match || {}, roster = m.roster || {}, res = m.res || {}, plan = list(m.plan);
    const rounds = Math.min(5, plan.length) || 5;
    const rows = rank(Object.entries(roster).map(([uid, p]) => {
      let total = 0, wins = 0;
      for (let i = 0; i < rounds; i++) { const x = res[i] && res[i][uid]; if (!x) continue; total += num(x.pts); if (x.rank === 1 && !x.absent) wins++; }
      return { uid, n: p && p.name, total, wins };
    }), (a, b) => b.total - a.total || b.wins - a.wins);
    rows.forEach(r => { r.s = `${nf.format(r.total)} pts`; if (r.wins) r.x = `${many(r.wins, 'manche gagnée', 'manches gagnées')}`; });
    const k = [];
    for (let i = 0; i < rounds; i++) {
      const r = res[i]; if (!r) continue;
      const win = Object.entries(r).filter(([, x]) => x && x.rank === 1 && !x.absent).map(([uid, x]) => ({ n: roster[uid] && roster[uid].name || '?', pts: num(x.pts) }));
      if (win.length) k.push({ t: ROUND_TITLES[plan[i] && plan[i].g] || `Manche ${i + 1}`, w: names(win), d: `${win[0].pts} pts` });
    }
    return { win: winLine(rows, 'remporte le tournoi'), sub: rows[0] ? `${many(rounds, 'manche')} · ${rows[0].s}` : '', rows, k };
  },

  undercover(d) {
    const rv = d.reveal || {}, roles = slots(rv.roles);
    const camp = d.winner, side = camp === 'civils' ? 'civil' : camp;
    const rows = slots(d.players).map((p, i) => p && { n: p.name, x: ROLES[roles[i]] || '', w: roles[i] === side }).filter(Boolean);
    rows.sort((a, b) => b.w - a.w);
    rows.forEach((r, i) => { r.r = r.w ? 1 : 2; });
    const label = camp === 'civils' ? 'Les civils gagnent' : camp === 'undercover' ? 'Les undercovers gagnent' : camp === 'mrwhite' ? 'Mr White gagne' : 'Partie terminée';
    return {
      win: label, sub: rv.civilWord ? `Mots : « ${clip(rv.civilWord, 30)} » contre « ${clip(rv.undercoverWord, 30)} »` : '', rows,
      k: [{ t: 'Camp gagnant', w: names(rows.filter(r => r.w)) || '—', d: ROLES[side] || '' }],
    };
  },

  uno(d) {
    const rows = rank(list(d.players).map(p => ({ n: p.name, left: Array.isArray(p.hand) ? p.hand.length : 0 })),
      (a, b) => (b.n === d.winner) - (a.n === d.winner) || a.left - b.left);
    rows.forEach(r => { r.w = r.n === d.winner; if (r.w) { r.r = 1; r.s = 'Main vide'; } else r.s = many(r.left, 'carte restante', 'cartes restantes'); });
    return { win: d.winner ? `${clip(d.winner, 30)} remporte la partie` : 'Partie terminée', rows, k: [] };
  },

  puissance4(d) {
    const w = d.winner;
    const rows = slots(d.players).map((p, i) => p && { n: p.name, s: many(num(p.score), 'victoire'), w: w === i }).filter(Boolean).sort((a, b) => b.w - a.w);
    rows.forEach((r, i) => { r.r = r.w ? 1 : i + 1; });
    const won = rows.find(r => r.w);
    return { win: won ? `${won.n} aligne quatre` : 'Match nul', sub: d.gameNum > 1 ? `Manche n° ${d.gameNum}` : '', rows, k: [] };
  },

  echecs(d) {
    const res = d.result || {}, w = res.winner, plies = (Array.isArray(d.moves) ? d.moves : Object.values(d.moves || {})).length;
    const why = { mate: 'par échec et mat', resign: 'par abandon', time: 'au temps' }[res.reason] || '';
    const rows = slots(d.players).map((p, i) => p && { n: p.name, s: `${num(p.score)} pt${num(p.score) > 1 ? 's' : ''}`, w: w === i }).filter(Boolean).sort((a, b) => b.w - a.w);
    rows.forEach((r, i) => { r.r = w === -1 ? 1 : r.w ? 1 : i + 1; });
    const won = rows.find(r => r.w);
    return { win: won ? `${won.n} gagne ${why}`.trim() : 'Partie nulle', sub: `${many(Math.ceil(plies / 2), 'coup')}${d.gameNum > 1 ? ` · partie n° ${d.gameNum}` : ''}`, rows, k: [] };
  },

  quiestce(d) {
    const rr = d.roundResult || {};
    const rows = rank(slots(d.players).map((p, i) => p && { n: p.name, v: num(p.score), win: rr.winner === i }).filter(Boolean), (a, b) => b.v - a.v || (b.win - a.win));
    rows.forEach(r => { r.s = many(r.v, 'manche gagnée', 'manches gagnées'); });
    if (rows[0]) rows.forEach(r => { r.w = r.win; r.r = r.win ? 1 : 2; });
    rows.sort((a, b) => b.w - a.w || b.v - a.v);
    const w = rows.find(r => r.w);
    return { win: w ? `${w.n} remporte le match` : 'Partie terminée', sub: rows.length === 2 ? `${rows[0].v} à ${rows[1].v}` : '', rows, k: [] };
  },

  bataille(d) {
    const sunk = pn => list(d.ships && d.ships[pn]).filter(s => s.sunk).length;
    const rows = slots(d.players).map((p, i) => p && { n: p.name, s: many(sunk(1 - i), 'navire coulé', 'navires coulés'), w: d.winner === i }).filter(Boolean).sort((a, b) => b.w - a.w);
    rows.forEach((r, i) => { r.r = r.w ? 1 : 2; });
    const w = rows.find(r => r.w);
    return { win: w ? `${w.n} coule toute la flotte` : 'Partie terminée', rows, k: [] };
  },

  minigolf(d) {
    const rows = rank(list(d.players).map(p => ({ n: p.name, v: slots(p.scores).reduce((s, x) => s + num(x), 0) })), (a, b) => a.v - b.v);
    rows.forEach(r => { r.s = many(r.v, 'coup'); });
    const w = rows.find(r => r.w);
    return { win: winLine(rows, 'gagne'), sub: w ? `${w.s} sur le parcours` : '', rows, k: [] };
  },

  minisubway(d) {
    const out = String((d.result && d.result.outcome) || ''), uid = out.startsWith('win:') ? out.slice(4) : null;
    const rows = Object.entries(d.players || {}).filter(([, p]) => p).map(([u, p]) => ({ n: p.name, w: u === uid })).sort((a, b) => b.w - a.w);
    rows.forEach(r => { r.r = r.w ? 1 : 2; });
    const w = rows.find(r => r.w);
    return { win: w ? `${w.n} remporte le duel` : out === 'draw' ? 'Match nul' : out === 'coop-lose' ? 'Défaite collective' : 'Partie terminée', rows, k: [] };
  },
};

// Résumé prêt à être écrit dans history/<id>. null si la partie n'a rien de lisible.
export function summarize(g, code, d, last) {
  if (!d || typeof d !== 'object') return null;
  let s;
  try { s = (SUMMARY[g.id] || (() => ({ win: 'Partie terminée', rows: [], k: [] })))(d); } catch (_) { s = { win: 'Partie terminée', rows: [], k: [] }; }
  const e = { g: g.id, code, at: Math.round(num(d.finishedAt) || num(d.updatedAt) || num(last) || Date.now()) };
  if (num(d.createdAt)) e.from = Math.round(d.createdAt);
  e.win = clip(s.win, 140);
  if (s.sub) e.sub = clip(s.sub, 140);
  const p = s.rows.slice(0, 12).map(r => {
    const o = { n: clip(r.n, 30) || '?' };
    if (typeof r.r === 'number') o.r = r.r;
    if (r.s) o.s = clip(r.s, 48);
    if (typeof r.w === 'boolean') o.w = r.w;
    if (r.x) o.x = clip(r.x, 60);
    return o;
  });
  if (p.length) e.p = p;
  const k = s.k.slice(0, 12).map(x => { const o = { t: clip(x.t, 40) || '—', w: clip(x.w, 80) || '—' }; if (x.d) o.d = clip(x.d, 80); return o; });
  if (k.length) e.k = k;
  return e;
}
