// Tirage des cinq manches. Module PUR.
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
//  - aucune pondération cachée : seule la graine décide, et elle est enregistrée.

import { ROUNDS, FAMILIES } from './rounds/index.js';
import { rng, hash } from './rng.js';

export const ROUNDS_PER_TOURNAMENT = 5;
export const FAMILY_ORDER = Object.keys(FAMILIES);

export const eligibleRounds = room => ROUNDS.filter(r => r.eligible(room || {}));

function noAdjacent(list) {
  for (let k = 1; k < list.length; k++) if (list[k].f === list[k - 1].f) return false;
  return true;
}

export function drawPlan(seed, room = {}, recent = []) {
  const r = rng(hash(`plan:${seed}`));
  const pool = eligibleRounds(room);
  const picks = [];
  for (const fam of FAMILY_ORDER) {
    const inFam = pool.filter(x => x.family === fam);
    if (!inFam.length) continue;
    const fresh = inFam.filter(x => !recent.includes(x.id));
    const choice = r.pick(fresh.length ? fresh : inFam);
    picks.push({ g: choice.id, f: fam });
  }
  // Famille vide : compléter avec une manche restante, de préférence jamais jouée récemment.
  while (picks.length < ROUNDS_PER_TOURNAMENT) {
    const left = pool.filter(x => !picks.some(p => p.g === x.id));
    if (!left.length) break;
    const fresh = left.filter(x => !recent.includes(x.id));
    const choice = r.pick(fresh.length ? fresh : left);
    picks.push({ g: choice.id, f: choice.family });
  }
  // Ordre : mélange, sans deux familles consécutives ni Petit Bac en ouverture.
  let order = r.shuffle(picks);
  for (let tries = 0; tries < 200; tries++) {
    if (noAdjacent(order) && order[0].g !== 'bac' && order[order.length - 1].g !== 'bac') break;
    order = r.shuffle(picks);
  }
  return order;
}
