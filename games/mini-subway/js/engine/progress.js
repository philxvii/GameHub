// Défis déterministes, records, déblocages et succès : logique pure (le stockage
// navigateur est dans js/store.js). Les défis sont comparables entre joueurs parce que
// la graine, la carte et les modificateurs dérivent uniquement de la date UTC.

import { hashString } from './rng.js';
import { MAPS, MAP_BY_ID } from './maps.js';
import { deepMerge } from './params.js';

export const PROFILE_VERSION = 1;
const BASE_MAPS = MAPS.filter(m => !m.unlock).map(m => m.id);

export const CHALLENGE_MODS = {
  fewCrossings: { name: 'Ponts rares', desc: 'Un seul pont au départ, un par récompense.', patch: { limits: { startingCrossings: 1 }, rewards: { crossingsPerReward: 1 } } },
  fastGrowth: { name: 'Ville pressée', desc: 'Les stations apparaissent plus vite.', patch: { growth: { intervalStartTicks: 480, intervalMinTicks: 150 } } },
  smallTrains: { name: 'Rames courtes', desc: 'Quatre places par locomotive.', patch: { capacity: { train: 4 } } },
  fourLines: { name: 'Quatre lignes', desc: 'Pas plus de quatre lignes sur la carte.', patch: { limits: { maxLines: 4 } } },
  squares: { name: 'Quartiers carrés', desc: 'Les carrés deviennent fréquents.', patch: { shapes: { weights: { square: 3.6 } } } },
  tight: { name: 'Quais étroits', desc: 'Cinq voyageurs par station avant l’alerte.', patch: { capacity: { station: 5 } } },
};

export const utcDay = d => d.toISOString().slice(0, 10);
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

// Défi du jour : même carte, même graine pour tous les joueurs pendant la journée UTC.
export function dailyChallenge(now = new Date()) {
  const key = utcDay(now);
  const seed = hashString('daily:' + key);
  return { id: 'daily:' + key, kind: 'daily', key, seed, map: BASE_MAPS[seed % BASE_MAPS.length], mode: 'classic', mods: [], patch: null, title: 'Défi du jour' };
}

// Défi de la semaine : deux modificateurs fixes et un objectif de construction.
export function weeklyChallenge(now = new Date()) {
  const key = isoWeek(now);
  const seed = hashString('weekly:' + key);
  const keys = Object.keys(CHALLENGE_MODS);
  const a = keys[seed % keys.length];
  const rest = keys.filter(k => k !== a);
  const b = rest[Math.floor(seed / 7) % rest.length];
  const mods = [a, b];
  const patch = mods.reduce((p, k) => deepMerge(p, CHALLENGE_MODS[k].patch), {});
  const goal = { score: 300, maxLines: mods.includes('fourLines') ? 4 : 5 };
  return { id: 'weekly:' + key, kind: 'weekly', key, seed, map: BASE_MAPS[(seed >>> 3) % BASE_MAPS.length], mode: 'classic', mods, patch, goal, title: 'Défi de la semaine' };
}

export function newProfile() {
  return {
    v: PROFILE_VERSION, records: {}, history: [], achievements: {}, challenges: {}, played: {}, totals: { delivered: 0, games: 0 },
    settings: { theme: 'day', palette: 'standard', contrast: false, motion: 'auto', music: 0.5, sfx: 0.7, muted: false, speed: 1, pauseOnHide: true, hints: true, confirmRestart: true, labels: 'normal', haptics: true },
  };
}

// Migration : tout profil ancien ou incomplet est complété sans perdre les records.
export function migrateProfile(p) {
  const base = newProfile();
  if (!p || typeof p !== 'object') return base;
  const out = { ...base, ...p, settings: { ...base.settings, ...(p.settings || {}) }, totals: { ...base.totals, ...(p.totals || {}) } };
  out.v = PROFILE_VERSION;
  return out;
}

export function isUnlocked(profile, mapId) {
  const m = MAP_BY_ID[mapId];
  if (!m || !m.unlock) return true;
  const u = m.unlock;
  if (u.any) return Object.entries(profile.records).some(([k, r]) => k.endsWith(':' + u.mode) && r.best >= u.score);
  const r = profile.records[`${u.map}:${u.mode}`];
  return !!r && r.best >= u.score;
}
export function unlockText(mapId) {
  const u = MAP_BY_ID[mapId].unlock;
  if (!u) return '';
  return u.any ? `Livrez ${u.score} voyageurs en Classique sur n’importe quelle carte.` : `Livrez ${u.score} voyageurs en Classique sur ${MAP_BY_ID[u.map].name}.`;
}

export const ACHIEVEMENTS = [
  { id: 'first100', name: 'Premier service', desc: 'Livrer 100 voyageurs en une partie.', test: r => r.score >= 100 },
  { id: 'week5', name: 'Cinq semaines', desc: 'Tenir jusqu’à la semaine 5.', test: r => r.week >= 5 },
  { id: 'k1', name: 'Mille voyageurs', desc: 'Livrer 1 000 voyageurs en une partie.', test: r => r.score >= 1000 },
  { id: 'sober', name: 'Sobriété', desc: '300 voyageurs avec trois lignes au plus.', test: r => r.score >= 300 && r.maxLines <= 3 && r.mode !== 'creative' },
  { id: 'dry', name: 'Pieds secs', desc: '200 voyageurs sans pont ni tunnel.', test: r => r.score >= 200 && r.maxCrossings === 0 && r.mode !== 'creative' },
  { id: 'hub', name: 'Grand nœud', desc: 'Ouvrir un pôle d’échange.', test: r => r.hubs > 0 && r.mode !== 'creative' },
  { id: 'loop', name: 'Ceinture', desc: 'Faire circuler une ligne en boucle.', test: r => r.loops > 0 },
  { id: 'extreme', name: 'Sans retour', desc: '250 voyageurs en mode Extrême.', test: r => r.mode === 'extreme' && r.score >= 250 },
  { id: 'daily', name: 'Rendez-vous', desc: 'Terminer un défi du jour.', test: r => r.kind === 'daily' },
  { id: 'team', name: 'Équipe de nuit', desc: 'Terminer une partie en Coopération.', test: r => r.kind === 'coop' },
  { id: 'duel', name: 'Aiguilleur', desc: 'Gagner un duel en Versus.', test: r => r.kind === 'versus' && r.won },
];

// Enregistre une partie terminée : records, défis, succès. Renvoie ce qui est nouveau.
export function recordRun(profile, run) {
  const out = { best: false, achievements: [], official: null };
  const key = `${run.map}:${run.mode}`;
  profile.totals.games++;
  profile.totals.delivered += run.score;
  profile.played[run.map] = true;
  if (run.kind === 'solo' || run.kind === 'daily' || run.kind === 'weekly') {
    const r = profile.records[key] || { best: 0, week: 0, games: 0 };
    r.games++;
    if (run.score > r.best) { r.best = run.score; r.week = run.week; r.seed = run.seed; r.date = run.date; out.best = true; }
    profile.records[key] = r;
  }
  if (run.challenge) {
    const c = profile.challenges[run.challenge] || { attempts: 0, official: null, best: 0 };
    c.attempts++;
    // Une seule tentative officielle : la première terminée ; les suivantes sont de l'entraînement.
    if (c.official === null) { c.official = run.score; out.official = run.score; c.goal = run.goalMet || false; }
    c.best = Math.max(c.best, run.score);
    profile.challenges[run.challenge] = c;
  }
  profile.history.unshift({ map: run.map, mode: run.mode, kind: run.kind, score: run.score, week: run.week, seed: run.seed, date: run.date });
  profile.history.length = Math.min(profile.history.length, 30);
  for (const a of ACHIEVEMENTS) {
    if (!profile.achievements[a.id] && a.test(run)) { profile.achievements[a.id] = run.date; out.achievements.push(a); }
  }
  return out;
}
