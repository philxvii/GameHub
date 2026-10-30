// Machine à états du tournoi. Module PUR : (état du match, faits observés, heure du
// serveur) -> prochaine transition, ou null. Le coordinateur l'interroge en boucle ;
// tous les autres clients ne font qu'afficher l'état. Les durées sont communes : les
// horodatages `at` (début de l'étape) et `end` (échéance) sont en heure SERVEUR.
//
//   intro ─▶ count ─▶ play ─▶ [judge ─▶ vote] ─▶ reveal ─▶ board ─▶ intro (manche suivante)
//                                                              └──▶ final (après la 5e,
//                                                                    ou après le départage)
//
// - intro  : titre, règles, fanfaronnade. Passe dès que tous les présents sont prêts.
// - count  : 3 s, puis l'action démarre au même instant pour tous.
// - play   : jusqu'à l'échéance ; se verrouille plus tôt si tous les présents ont fini.
//            La base refuse toute réponse après end + GRACE_MS (règles Firebase).
// - judge  : Petit Bac seulement, correction IA (bornée par JUDGE_MAX_MS).
// - vote   : Petit Bac, réponses douteuses ; VOTE_MS.
// - reveal : résultats de la manche ; board : classement général (passe dès que tous les
//            présents ont touché « Suite »).

import { round } from './rounds/index.js';
import { TIEBREAK_I, roundsOf } from './draw.js';

export const STEPS = ['intro', 'count', 'play', 'judge', 'vote', 'reveal', 'board', 'final'];
export const INTRO_MS = 12000;
export const COUNT_MS = 3000;
export const GRACE_MS = 2500;
export const STALL_MS = 25000;       // joueur en ligne sans aucun progrès : on ne l'attend plus (sauf Petit Bac)         // tolérance réseau après l'échéance (aussi dans les règles)
export const JUDGE_MAX_MS = 12000;
export const VOTE_MS = 18000;
export const BOARD_MS = 8000;
export const revealMs = n => 5500 + 550 * n;

// Transitions autorisées : toute autre est refusée (tests).
export const NEXT = {
  intro: ['count'], count: ['play'], play: ['judge', 'reveal'], judge: ['vote', 'reveal'],
  vote: ['reveal'], reveal: ['board', 'final'], board: ['intro', 'final'], final: [],
};
export const allowed = (from, to) => (NEXT[from] || []).includes(to);

// Départage : Gong (3 signaux), ou Calcul express (20 s) si le Gong est retiré pour ce salon.
export const gameOf = m => (m.i >= TIEBREAK_I ? (m.tbg || 'gong') : m.plan[m.i].g);
export const playMsOf = m => (m.i >= TIEBREAK_I ? (gameOf(m) === 'gong' ? 16000 : 20000) : round(gameOf(m)).playMs);
// Joueurs concernés par la manche en cours (départage : les seuls ex æquo).
export const contenders = m => (m.i >= TIEBREAK_I && m.tb ? Object.keys(m.tb) : Object.keys(m.roster || {}));

// f : { now, online:Set, ready:Set, next:Set, submitted:Set, stalled:Set, judged:bool, needsVote:bool, voted:Set,
//       tiebreak: null|[uids], skip:bool }
// Renvoie { step, at, end, i?, action? } ; `action` dit au coordinateur quoi calculer.
export function decide(m, f) {
  if (!m || m.step === 'final') return null;
  const now = f.now;
  const who = contenders(m).filter(u => f.online.has(u));
  const everyone = set => who.length > 0 && who.every(u => set.has(u));
  switch (m.step) {
    case 'intro':
      if (f.skip || now >= m.at + INTRO_MS || everyone(f.ready)) return { step: 'count', at: now, end: now + COUNT_MS };
      return null;
    case 'count':
      if (now >= m.end) return { step: 'play', at: m.end, end: m.end + playMsOf(m) };
      return null;
    case 'play':
      // Fini ou inactif : chacun a soit envoyé, soit n'a plus rien fait depuis STALL_MS (au moins un envoi).
      const stalled = gameOf(m) === 'bac' ? new Set() : (f.stalled || new Set());
      const doneOrIdle = new Set([...f.submitted, ...stalled]);
      if (now >= m.end + GRACE_MS || everyone(f.submitted) || (f.submitted.size > 0 && everyone(doneOrIdle))) {
        return gameOf(m) === 'bac' && m.i < TIEBREAK_I
          ? { step: 'judge', at: now, end: now + JUDGE_MAX_MS, action: 'judge' }
          : { step: 'reveal', at: now, end: now + revealMs(contenders(m).length), action: 'score' };
      }
      return null;
    case 'judge':
      // Le coordinateur écrit lui-même la suite quand la correction arrive ; au-delà
      // de l'échéance, il bascule en vote (jury) sans attendre l'IA.
      if (f.judged || now >= m.end) {
        return f.needsVote
          ? { step: 'vote', at: now, end: now + VOTE_MS, action: f.judged ? null : 'jury' }
          : { step: 'reveal', at: now, end: now + revealMs(contenders(m).length), action: 'score' };
      }
      return null;
    case 'vote':
      if (f.skip || now >= m.end || everyone(f.voted)) return { step: 'reveal', at: now, end: now + revealMs(contenders(m).length), action: 'score' };
      return null;
    case 'reveal':
      if (f.skip || now >= m.end) {
        if (m.i >= TIEBREAK_I) return { step: 'final', at: now, end: now, action: 'final' };
        return { step: 'board', at: now, end: now + BOARD_MS };
      }
      return null;
    case 'board':
      if (f.skip || now >= m.end || everyone(f.next || new Set())) {
        if (m.i + 1 < roundsOf(m)) return { step: 'intro', at: now, end: now + INTRO_MS, i: m.i + 1 };
        if (f.tiebreak) return { step: 'intro', at: now, end: now + INTRO_MS, i: TIEBREAK_I, tb: f.tiebreak };
        return { step: 'final', at: now, end: now, action: 'final' };
      }
      return null;
    default:
      return null;
  }
}
