// Correction du Petit Bac. Module PUR (testé dans Node).
//
//   1. prepare()   contrôles déterministes : vide, lettre, longueur ; regroupe les
//                  réponses identiques (même clé normalisée dans la même catégorie)
//   2. aiItems()   ce qui part au correcteur : une entrée par réponse DISTINCTE, avec un
//                  identifiant opaque (ni pseudo, ni uid) — une même réponse reçoit donc
//                  le même verdict pour tous les joueurs
//   3. parseJudge() valide strictement la sortie du correcteur (schéma, identifiants,
//                  tailles) ; tout écart => l'entrée devient « ambiguous »
//   4. resolve()   verdict final : IA sûre d'elle (confiance >= seuil) => valid/invalid ;
//                  sinon vote des autres joueurs (refusée seulement à la majorité stricte)
//   5. scoreBac()  barème annoncé, appliqué par le code. L'IA n'attribue aucun point.

import { cleanAnswer, answerKey, firstLetter, fold, forPrompt, ANSWER_MAX } from './text.js';
import { POINTS, SLOTS } from './rounds/bac.js';

export const CONFIDENCE = 0.6;
// Un seul joueur ne peut jamais faire tomber la réponse d'un autre : il faut au moins deux
// refus, et la majorité stricte des votants admis (auteurs exclus).
export const MIN_REFUSALS = 2;
// Réponse qui ressemble à une consigne adressée au correcteur : elle n'est JAMAIS envoyée à
// l'IA (elle pourrait viser les autres réponses du lot) et part directement au vote.
export const SUSPECT = /\b(valid|invalid|ambigu\w*|ignor\w*|r[eè]gles?|consignes?|prompt|instructions?|r[ée]ponds?|json|syst[eè]me|verdicts?|correcteur|tout(es)? les)\b/i;
export const VERDICTS = ['valid', 'invalid', 'ambiguous'];
export const MAX_ITEMS = 64;          // 8 joueurs × 4 catégories ; au-delà, refus du lot
export const REASON_MAX = 120;

// subs : { uid: { a:[4 chaînes] } } ; renvoie les réponses et les groupes distincts.
export function prepare(subs, params, roster) {
  const letter = fold(params.letter);
  const answers = {};            // uid -> [{ text, key, status, group }]
  const groups = {};             // gid -> { cat, k, text, key, uids:[] }
  const byKey = {};
  for (const uid of roster) {
    const raw = (subs[uid] && Array.isArray(subs[uid].a)) ? subs[uid].a : [];
    answers[uid] = [];
    for (let k = 0; k < SLOTS; k++) {
      const text = cleanAnswer(raw[k]);
      const key = answerKey(text);
      let status = 'pending', group = null;
      if (!text || key.length < 2) status = 'empty';
      else if (firstLetter(text) !== letter) status = 'letter';
      else {
        const id = `${k}:${key}`;
        if (!byKey[id]) {
          const gid = `g${Object.keys(groups).length}`;
          byKey[id] = gid;
          groups[gid] = { cat: params.cats[k], k, text, key, uids: [], suspect: SUSPECT.test(text) };
        }
        group = byKey[id];
        groups[group].uids.push(uid);
      }
      answers[uid].push({ text, key, status, group });
    }
  }
  return { answers, groups };
}

// Lot pour le correcteur : uniquement des données, bornées, sans identité de joueur.
export function aiItems(prep, params) {
  const items = Object.entries(prep.groups).filter(([, g]) => !g.suspect).map(([id, g]) => ({ id, category: g.cat, answer: forPrompt(g.text, ANSWER_MAX) }));
  return { letter: params.letter, categories: params.cats, items: items.slice(0, MAX_ITEMS) };
}

const clamp01 = x => (Number.isFinite(Number(x)) ? Math.min(1, Math.max(0, Number(x))) : 0);
const short = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// Validation stricte de la sortie du correcteur. Renvoie { ok, verdicts:{gid:{v,why,conf}} }.
// Inconnu, dupliqué, mal formé, manquant => ignoré (l'entrée restera « ambiguous »).
export function parseJudge(data, prep) {
  const out = {};
  if (!data || typeof data !== 'object' || !Array.isArray(data.results) || data.results.length > MAX_ITEMS) return { ok: false, verdicts: out };
  for (const r of data.results) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.submissionId || r.id || '');
    if (!prep.groups[id] || out[id]) continue;
    if (!VERDICTS.includes(r.verdict)) continue;
    out[id] = { v: r.verdict, why: short(r.shortReason, REASON_MAX), conf: clamp01(r.confidence) };
  }
  return { ok: Object.keys(out).length > 0, verdicts: out };
}

// Étape IA -> verdict provisoire par groupe : 'valid' | 'invalid' | 'vote'.
export function triage(prep, verdicts, threshold = CONFIDENCE) {
  const res = {};
  for (const gid of Object.keys(prep.groups)) {
    if (prep.groups[gid].suspect) { res[gid] = { s: 'vote', why: 'Ressemble à une consigne : décidée par le vote.', src: 'jury' }; continue; }
    const v = verdicts && verdicts[gid];
    if (v && v.v !== 'ambiguous' && v.conf >= threshold) res[gid] = { s: v.v, why: v.why, src: 'ia' };
    else res[gid] = { s: 'vote', why: v ? v.why : '', src: v ? 'ia' : 'jury' };
  }
  return res;
}

// Vote : votes = { voterUid: { gid: true(refus) } }. Votants admis : joueurs du tournoi
// qui ne sont pas auteurs de la réponse. Refusée s'il y a au moins MIN_REFUSALS refus ET
// plus de refus que la moitié des votants admis. Sinon acceptée (bénéfice du doute) :
// en duel (2 joueurs), un seul refus suffit : l'autre joueur est le seul juge possible,
// sans quoi n'importe quelle suite de lettres passerait.
export function resolve(prep, tri, votes, roster) {
  const final = {};
  for (const [gid, t] of Object.entries(tri)) {
    if (t.s !== 'vote') { final[gid] = { ...t }; continue; }
    const authors = new Set(prep.groups[gid].uids);
    const voters = roster.filter(u => !authors.has(u));
    const no = voters.filter(u => votes && votes[u] && votes[u][gid] === true).length;
    const need = roster.length === 2 ? 1 : MIN_REFUSALS;     // duel : l'autre joueur est le seul juge
    final[gid] = { s: no >= need && no * 2 > voters.length ? 'invalid' : 'valid', why: t.why, src: 'vote', no, of: voters.length };
  }
  return final;
}

// Barème : valide et seule dans sa catégorie 10, valide partagée 5, sinon 0.
export function scoreBac(prep, final, roster) {
  const out = {};
  for (const uid of roster) {
    let pts = 0, valid = 0;
    const cells = prep.answers[uid].map(a => {
      if (a.status !== 'pending') return { ...a, st: a.status, pts: 0 };
      const f = final[a.group] || { s: 'invalid' };
      if (f.s !== 'valid') return { ...a, st: 'invalid', why: f.why, pts: 0 };
      const shared = prep.groups[a.group].uids.length > 1;
      const p = shared ? POINTS.shared : POINTS.unique;
      pts += p; valid++;
      return { ...a, st: shared ? 'shared' : 'unique', why: f.why, pts: p };
    });
    out[uid] = { pts, valid, cells, key: [-pts, -valid], label: `${pts} pts` };
  }
  return out;
}

// Groupes soumis au vote, pour l'écran de vote.
export const voteList = (prep, tri) => Object.entries(tri).filter(([, t]) => t.s === 'vote').map(([gid]) => ({ gid, ...prep.groups[gid] }));
