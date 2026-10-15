// Sauvegarde locale (navigateur) : profil, records, réglages. Aucune donnée personnelle.
import { migrateProfile, newProfile } from './engine/progress.js';

const KEY = 'mini-subway:profile';
let profile = null;
let failed = false;

export function load() {
  if (profile) return profile;
  try { profile = migrateProfile(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch (_) { profile = newProfile(); failed = true; }
  return profile;
}
// Renvoie false si le navigateur refuse l'écriture (navigation privée, quota).
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); failed = false; return true; }
  catch (_) { failed = true; return false; }
}
export const saveFailed = () => failed;
export function reset() { profile = newProfile(); return save(); }
