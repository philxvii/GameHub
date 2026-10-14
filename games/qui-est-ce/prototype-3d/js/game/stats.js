// Statistiques entre amis et titres malicieux, stockes dans le navigateur (localStorage, comme
// le carnet de Banqueroll) : ni compte ni Firebase. L'interface (load / record) est pensee pour
// passer plus tard sur Firebase sans toucher a l'appelant.

const KEY = 'qe3d.stats.v1';

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || { games: [] }; } catch (_) { return { games: [] }; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* navigation privee : pas de memoire */ } },
};

// Titres : condition sur la partie qui vient de finir et l'historique. Ton complice, jamais blessant.
const TITLES = [
  { id: 'sherlock', name: 'Le Sherlock', hint: 'Gagner en 4 questions ou moins', test: (g) => g.won && g.questions <= 4 },
  { id: 'eclair', name: 'Éclair au chocolat', hint: 'Gagner en moins de 2 minutes', test: (g) => g.won && g.ms < 120000 },
  { id: 'culot', name: 'Le Culot', hint: 'Désigner juste avec 3 candidats ou plus', test: (g) => g.won && g.guessRight && g.candidatesLeft >= 3 },
  { id: 'revanche', name: 'La Revanche', hint: 'Gagner juste après une défaite contre le même adversaire', test: (g, h) => g.won && h.length && !h[h.length - 1].won && h[h.length - 1].opponent === g.opponent },
  { id: 'serie', name: 'Série noire', hint: '3 victoires de suite', test: (g, h) => g.won && h.slice(-2).length === 2 && h.slice(-2).every((x) => x.won) },
  { id: 'kamikaze', name: 'Le Kamikaze', hint: 'Perdre sur une désignation à l’aveugle (plus de 6 candidats)', test: (g) => !g.won && g.guessedByMe && g.candidatesLeft > 6 },
];

export function loadStats() {
  const s = store.get();
  const byOpp = {};
  for (const g of s.games) {
    const o = byOpp[g.opponent] ||= { played: 0, won: 0, questions: 0, favorite: {} };
    o.played++; if (g.won) o.won++; o.questions += g.questions;
    o.favorite[g.mySecret] = (o.favorite[g.mySecret] || 0) + 1;
  }
  for (const o of Object.values(byOpp)) {
    o.avgQuestions = o.played ? +(o.questions / o.played).toFixed(1) : 0;
    o.favoriteId = Object.entries(o.favorite).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  return { games: s.games, byOpponent: byOpp, titles: [...new Set(s.games.flatMap((g) => g.titles || []))].map((id) => TITLES.find((t) => t.id === id)) };
}

// g : { opponent, won, questions, ms, mySecret, guessRight, guessedByMe, candidatesLeft }
export function recordGame(g) {
  const s = store.get();
  const titles = TITLES.filter((t) => t.test(g, s.games)).map((t) => t.id);
  s.games.push({ ...g, titles, at: Date.now() });
  s.games = s.games.slice(-200);
  store.set(s);
  return titles.map((id) => TITLES.find((t) => t.id === id));
}

export { TITLES };
