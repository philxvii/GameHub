// Tirage des manches du tournoi. Module PUR.
//
// Règles (affichées dans le salon) :
//  - une manche par famille : vitesse, espace, mémoire, mots, chiffres — cinq tâches
//    vraiment différentes, jamais deux fois la même manche ;
//  - une manche inéquitable pour ce salon (ex. La Dictée avec claviers tactiles ET
//    physiques) est retirée AVANT le tirage ; si une famille n'a plus de manche, une
//    autre manche est prise ailleurs, sans deux familles identiques à la suite ;
//  - à la revanche, on évite les manches du tournoi précédent quand c'est possible ;
//  - le Petit Bac (la plus longue, et la seule jugée) n'ouvre ni ne clôt le tournoi : il ne
//    vaut jamais double ;
//  - l'hôte choisit les manches proposées (une seule suffit) et leur nombre (2 à 10, 5 par défaut) :
//    autant de manches choisies que demandé ou moins, le tournoi les joue toutes, une fois chacune,
//    dans un ordre tiré au sort ; davantage, le nombre voulu est tiré comme ci-dessus. Si l'équité les retire toutes, on revient au tirage complet ;
//  - aucune pondération cachée : seule la graine décide, et elle est enregistrée.

import { ROUNDS, FAMILIES } from './rounds/index.js';
import { rng, hash } from './rng.js';

export const ROUNDS_PER_TOURNAMENT = 5; // nombre de manches par défaut
export const MIN_ROUNDS = 2;
export const MAX_ROUNDS = 10;
// Indice du départage dans match.res / match.det / match.i : toujours après la dernière manche possible.
export const TIEBREAK_I = MAX_ROUNDS;
export const FAMILY_ORDER = Object.keys(FAMILIES);

export const eligibleRounds = room => ROUNDS.filter(r => r.eligible(room || {}));

// Manches choisies par l'hôte, rangées dans cfg.v (le seul champ libre autorisé par les règles
// de la base pour cfg) : 1 = toutes ; sinon 2 + masque de bits, dans l'ordre FIXE ci-dessous.
// Une nouvelle manche s'ajoute toujours EN FIN de liste (les masques déjà écrits restent justes).
export const PICK_ORDER = ['gong', 'tir', 'dictee', 'chemin', 'numeros', 'damier', 'coffre', 'dejavu', 'bac', 'calcul', 'nuage', 'prix', 'encre', 'chrono', 'intrus', 'anagramme', 'metronome', 'quiz', 'cadenas', 'paires', 'compte', 'ordre'];
export const MIN_PICKS = 1;
// Nombre de manches du tournoi (hors départage) : la longueur du tirage, 1 à MAX_ROUNDS.
// Le départage garde l'indice TIEBREAK_I, quel que soit ce nombre.
export const roundsOf = m => Math.min(MAX_ROUNDS, ((m && m.plan) || []).length) || ROUNDS_PER_TOURNAMENT;
// cfg.v = masque des épreuves + COUNT_STEP × nombre de manches voulu (0 = le défaut, 5). Les anciennes
// valeurs (< COUNT_STEP) restent donc valables. COUNT_STEP est fixe : il ne dépend pas de PICK_ORDER.
const COUNT_STEP = 2 ** 24;
export function encodePicks(ids, count = 0) {
  const set = new Set(ids);
  const mask = PICK_ORDER.every(id => set.has(id)) ? 1 : 2 + PICK_ORDER.reduce((m, id, k) => (set.has(id) ? m + 2 ** k : m), 0);
  return mask + (clampRounds(count) === ROUNDS_PER_TOURNAMENT ? 0 : clampRounds(count) * COUNT_STEP);
}
export const clampRounds = c => (Number.isInteger(Number(c)) && Number(c) >= MIN_ROUNDS ? Math.min(MAX_ROUNDS, Number(c)) : ROUNDS_PER_TOURNAMENT);
export const decodeCount = v => { const n = Math.floor(Number(v) / COUNT_STEP); return n >= MIN_ROUNDS ? clampRounds(n) : ROUNDS_PER_TOURNAMENT; };
export function decodePicks(v) {
  const n = Number(v) % COUNT_STEP;
  if (!Number.isInteger(n) || n < 2 || n >= 2 + 2 ** PICK_ORDER.length) return PICK_ORDER.slice();
  const mask = n - 2;
  const ids = PICK_ORDER.filter((id, k) => Math.floor(mask / 2 ** k) % 2 === 1);
  return ids.length >= MIN_PICKS ? ids : PICK_ORDER.slice();
}

function noAdjacent(list) {
  for (let k = 1; k < list.length; k++) if (list[k].f === list[k - 1].f) return false;
  return true;
}

export function drawPlan(seed, room = {}, recent = [], allowed = null, count = ROUNDS_PER_TOURNAMENT) {
  const r = rng(hash(`plan:${seed}`));
  const eligible = eligibleRounds(room);
  const chosen = allowed ? eligible.filter(x => allowed.includes(x.id)) : eligible;
  // Choix court : on joue exactement les manches choisies. Rien de jouable : tirage complet.
  if (chosen.length && chosen.length < Math.min(count, ROUNDS_PER_TOURNAMENT)) {
    const few = r.shuffle(chosen.map(x => ({ g: x.id, f: x.family })));
    if (few.length > 2 && few[0].g === 'bac') few.push(few.shift());
    return few;
  }
  const pool = chosen.length ? chosen : eligible;
  const picks = [];
  for (const fam of FAMILY_ORDER) {
    const inFam = pool.filter(x => x.family === fam);
    if (!inFam.length) continue;
    // Une manche par famille, jamais une manche de la partie précédente : une famille qui n'a que des
    // manches récentes (le Petit Bac est seul dans « Mots ») est sautée, et une autre famille comble.
    const fresh = inFam.filter(x => !recent.includes(x.id));
    if (!fresh.length) continue;
    const choice = r.pick(fresh);
    picks.push({ g: choice.id, f: fam });
  }
  // Famille vide : compléter avec une manche restante, de préférence jamais jouée récemment.
  while (picks.length < count) {
    const left = pool.filter(x => !picks.some(p => p.g === x.id));
    if (!left.length) break;
    const fresh = left.filter(x => !recent.includes(x.id));
    const choice = r.pick(fresh.length ? fresh : left);
    picks.push({ g: choice.id, f: choice.family });
  }
  // Moins de manches que de familles : on en garde au hasard (le Petit Bac ne reste pas s'il y en a moins de trois).
  if (picks.length > count) {
    const keep = r.shuffle(picks.filter(p => count >= 3 || p.g !== 'bac'));
    picks.splice(0, picks.length, ...(keep.length >= count ? keep.slice(0, count) : r.shuffle(picks).slice(0, count)));
  }
  // Ordre : mélange, sans deux familles consécutives ni Petit Bac en ouverture.
  let order = r.shuffle(picks);
  for (let tries = 0; tries < 200; tries++) {
    if (noAdjacent(order) && order[0].g !== 'bac' && order[order.length - 1].g !== 'bac') break;
    order = r.shuffle(picks);
  }
  return order;
}
