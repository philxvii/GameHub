// La Dictée — vitesse de frappe. Tout le monde recopie LA MÊME phrase : on compare le
// temps pour la terminer exactement, pas un « mots par minute » brut. Accents et
// majuscules ne comptent pas (« e » vaut « é ») : aucun clavier n'est avantagé.
// Manche retirée du tirage si le salon mêle claviers tactiles et physiques.

import { int, secs, roundRng, fold, half } from './_deps.js';

export const PHRASES = [
  'Le jury a délibéré pendant trois secondes et il regrette déjà.',
  'Un pigeon voyageur a refusé de livrer ce message par fierté.',
  'Sur ce plateau, la modestie est restée coincée au vestiaire.',
  'Le chronomètre tourne et ta dignité suit la même pente.',
  'Personne ne gagne par hasard, mais certains perdent avec talent.',
  'La caméra deux filme ton échec sous son meilleur angle.',
  'Un buzzer rouge attend patiemment ta prochaine erreur.',
  'Les projecteurs chauffent, le public retient son souffle.',
  'Ce tableau de scores ne ment jamais, il se contente de juger.',
  'Le présentateur a lissé sa moustache avant de te juger.',
  'Trois candidats, une seule couronne et beaucoup trop d’ego.',
  'Le régisseur a coupé le son quand tu as commencé à chanter.',
];

// Comparaison tolérante : sans accents ni majuscules, apostrophes unifiées.
export const loose = s => fold(String(s || '').replace(/[’‘`]/g, "'")).replace(/\s+/g, ' ');
export function correctPrefix(typed, phrase) {
  const a = loose(typed), b = loose(phrase);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export default {
  id: 'dictee', family: 'vitesse', title: 'La Dictée', verb: 'Tape',
  rules: ['Recopie la phrase, exactement.', 'Accents et majuscules : facultatifs.', 'Le premier à la terminer gagne.'],
  playMs: 45000,
  unit: 'temps pour recopier la phrase',
  // Équité : tous au clavier tactile, ou tous au clavier physique.
  eligible: room => new Set(room.devices || []).size <= 1,
  params(seed, i, room) {
    const r = roundRng(seed, i, 'dictee');
    return { phrase: PHRASES[r.pick(half(PHRASES, room))] };
  },
  // 45 mots/min sur la phrase tirée.
  ghost: p => { const ms = Math.round((loose(p.phrase).length / 5) / 45 * 60000); return { key: [0, Math.round(ms / 100)], label: `${secs(ms)} · 45 mots/min` }; },
  tieText: () => 'Égalité au dixième de seconde près.',
  score(payload, p) {
    const typed = String((payload && payload.typed) || '').slice(0, 200);
    const len = loose(p.phrase).length;
    const done = correctPrefix(typed, p.phrase) >= len && loose(typed).length === len;
    const ms = Math.max(int(payload && payload.ms, 0, 600000, 600000), len * 40);   // > 300 mots/min : rehaussé
    if (done) {
      const wpm = Math.round((len / 5) / (ms / 60000));
      return { key: [0, Math.round(ms / 100)], label: `${secs(ms)} · ${wpm} mots/min`, valid: true, stats: { ms, wpm, done: true } };
    }
    const pre = correctPrefix(typed, p.phrase);
    return { idle: !typed.trim(), key: [1, -pre], label: `${Math.round(100 * pre / len)} % tapé`, valid: true, stats: { ms: null, prefix: pre, done: false } };
  },
};
