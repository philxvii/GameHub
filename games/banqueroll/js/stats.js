// Carnet local des parties : quelques compteurs par prenom, sur cet appareil seulement.
// Aucune donnee sensible : des prenoms et des nombres. Pas de compte, pas de serveur.
// Sert au recapitulatif (« ton carnet ») et aux rivalites du presentateur.

import { gameStatsByName } from './party.js';

const KEY = 'banqueroll-stats-v1';
const empty = () => ({ players: {}, rivals: {}, seen: [] });

export function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && raw.players ? { ...empty(), ...raw } : empty();
  } catch (e) { return empty(); }
}

function save(stats) {
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) { /* stockage bloque : tant pis */ }
}

// Enregistre une partie terminee, une seule fois (code + instant de fin).
export function recordGame(game) {
  if (!game || game.phase !== 'finished') return null;
  const id = `${game.code}:${game.finishedAt || game.winnerId}`;
  const stats = loadStats();
  if (stats.seen.includes(id)) return stats;
  const { players, ruins } = gameStatsByName(game);
  Object.entries(players).forEach(([name, s]) => {
    const cur = stats.players[name] = stats.players[name] || {};
    Object.entries(s).forEach(([k, v]) => { cur[k] = (cur[k] || 0) + v; });
  });
  ruins.forEach(([ruiner, victim]) => { const k = `${ruiner}>${victim}`; stats.rivals[k] = (stats.rivals[k] || 0) + 1; });
  stats.seen = [...stats.seen, id].slice(-80);
  save(stats);
  return stats;
}

// Combien de fois `ruiner` a deja ruine `victim` (parties terminees sur cet appareil).
export const rivalryCount = (ruiner, victim, stats = loadStats()) => stats.rivals[`${ruiner}>${victim}`] || 0;

// La rivalite la plus forte entre les joueurs presents.
export function topRivalry(names, stats = loadStats()) {
  let best = null;
  Object.entries(stats.rivals).forEach(([k, n]) => {
    const [a, b] = k.split('>');
    if (names.includes(a) && names.includes(b) && (!best || n > best.n)) best = { ruiner: a, victim: b, n };
  });
  return best;
}
