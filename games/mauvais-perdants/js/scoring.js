// Barème du tournoi. Module PUR (testé, et simulé dans tests/sim.test.mjs).
//
// Chaque manche a son unité (ms, niveaux, mots…) : on ne les additionne JAMAIS. On
// classe les joueurs dans la manche, puis on convertit la PLACE en points :
//
//     points(place k sur N) = 10 − round(8 · k / (N − 1))        k = 0 pour le 1er
//
//   → le 1er marque 10, le dernier 2, l'écart est réparti régulièrement quel que soit
//     N (2 à 8).
//   → 5e manche « décisive » : points de place DOUBLÉS, annoncé dès le salon. La
//     simulation (tests/sim.mjs) : à 4 joueurs, le plus fort gagne 71 % des tournois
//     (72 % sans doublement) mais le vainqueur n'est plus connu d'avance avant la
//     dernière manche que dans 6 % des cas (38 % sans). Voir docs/CONCEPTION.md.
//   → ex æquo : les joueurs partagent la moyenne des places occupées (arrondie).
//   → absent ou déconnecté sans réponse : 0 point, classé derrière.
//   → Fanfaronnade (annoncée, volontaire) : 1er ou ex æquo 1er +3 ; moitié basse −3,
//     c'est-à-dire place > ⌈N/2⌉ (le 2e sur 3 n'est pas puni). Le malus s'applique en entier :
//     un dernier qui avait fanfaronné peut finir la manche à −1.
//
// Classement général : total, puis nombre de manches gagnées, puis manche de départage
// (un Gong court entre les seuls ex æquo de la 1re place). Égalité persistante :
// victoire partagée, annoncée comme telle.

import { compareKeys } from './rounds/contract.js';

export const BOAST_BONUS = 3, BOAST_MALUS = 3;
export const MIN_PLAYERS = 2, MAX_PLAYERS = 8;

export const slotPoints = (k, n) => (n <= 1 ? 10 : 10 - Math.round((8 * k) / (n - 1)));

// entries : [{ uid, key, present }] ; n : taille du tournoi ; boasts : Set des fanfarons ;
// mult : coefficient de la manche (FINAL_MULT pour la 5e). La fanfaronnade n'est pas doublée.
export const FINAL_MULT = 2;

export function rankRound(entries, n, boasts = new Set(), mult = 1) {
  const present = entries.filter(e => e.present).sort((a, b) => compareKeys(a.key, b.key));
  const out = {};
  let slot = 0;
  for (let k = 0; k < present.length;) {
    let j = k;
    while (j + 1 < present.length && compareKeys(present[j + 1].key, present[k].key) === 0) j++;
    const slots = [];
    for (let s = slot; s <= slot + (j - k); s++) slots.push(s);
    const base = mult * Math.round(slots.reduce((a, s) => a + slotPoints(s, n), 0) / slots.length);
    for (let m = k; m <= j; m++) {
      const e = present[m];
      const rank = slot + 1;                        // place affichée (1 = premier)
      let boast = 0;
      if (boasts.has(e.uid)) boast = rank === 1 ? BOAST_BONUS : rank > Math.ceil(n / 2) ? -BOAST_MALUS : 0;
      out[e.uid] = { rank, base, boast, pts: base + boast, tied: j > k };
    }
    slot += j - k + 1;
    k = j + 1;
  }
  // Absent : 0 point ; s'il avait fanfaronné, le malus tombe quand même (pas d'esquive).
  for (const e of entries) if (!e.present) { const b = boasts.has(e.uid) ? -BOAST_MALUS : 0; out[e.uid] = { rank: n, base: 0, boast: b, pts: b, absent: true }; }
  return out;
}

// res : { [roundIndex]: { [uid]: { pts, rank, absent } } } ; tb : départage { uid: position }
// (positions égales = encore ex æquo).
export function standings(roster, res, rounds = 5, tb = null) {
  const rows = roster.map(uid => {
    let total = 0, wins = 0, lasts = 0;
    const per = [];
    for (let i = 0; i < rounds; i++) {
      const r = res && res[i] && res[i][uid];
      per.push(r ? r.pts : null);
      if (!r) continue;
      total += r.pts;
      if (r.rank === 1 && !r.absent) wins++;
    }
    return { uid, total, wins, per };
  });
  // Dernières places : utile aux statistiques (pas au classement).
  for (let i = 0; i < rounds; i++) {
    const r = res && res[i];
    if (!r) continue;
    const worst = Math.max(...Object.values(r).map(x => x.rank));
    rows.forEach(row => { if (r[row.uid] && r[row.uid].rank === worst && roster.length > 1) row.lasts = (row.lasts || 0) + 1; });
  }
  const tbPos = uid => (tb && tb[uid] !== undefined ? tb[uid] : 1e9);
  rows.sort((a, b) => b.total - a.total || b.wins - a.wins || tbPos(a.uid) - tbPos(b.uid));
  // Place partagée tant que total, victoires et départage sont identiques.
  rows.forEach((row, k) => {
    const prev = rows[k - 1];
    row.place = prev && prev.total === row.total && prev.wins === row.wins && tbPos(prev.uid) === tbPos(row.uid) ? prev.place : k + 1;
  });
  return rows;
}

// Ex æquo pour la 1re place après total et victoires : faut-il un départage ?
export function needsTiebreak(rows) {
  const top = rows.filter(r => r.place === 1);
  return top.length > 1 ? top.map(r => r.uid) : null;
}

// Ordre issu de la manche de départage : { uid: position }, clés égales = même position.
// Un ex æquo sans réponse est classé derrière.
export function tiebreakOrder(entries) {
  const sorted = entries.filter(e => e.present).sort((a, b) => compareKeys(a.key, b.key));
  const out = {};
  sorted.forEach((e, k) => { out[e.uid] = k > 0 && compareKeys(e.key, sorted[k - 1].key) === 0 ? out[sorted[k - 1].uid] : k; });
  return out;
}

// Statistiques finales : uniquement des faits calculés sur la partie.
export function awards(roster, res, plan, names, extra = {}) {
  const out = [];
  const rows = standings(roster, res, plan.length);
  const name = uid => names[uid] || '?';
  const maxWins = Math.max(0, ...rows.map(r => r.wins));
  if (maxWins >= 2) {
    const w = rows.filter(r => r.wins === maxWins);
    if (w.length === 1) out.push({ id: 'wins', title: 'Razzia de manches', who: name(w[0].uid), detail: `${maxWins} manches gagnées` });
  }
  const maxLast = Math.max(0, ...rows.map(r => r.lasts || 0));
  if (maxLast >= 2 && roster.length >= 3) {
    const l = rows.filter(r => (r.lasts || 0) === maxLast);
    if (l.length === 1) out.push({ id: 'lasts', title: 'Abonnement à la dernière place', who: name(l[0].uid), detail: `${maxLast} fois en dernière place` });
  }
  // Plus belle remontée : place après la 1re manche vs place finale.
  if (plan.length >= 3 && res[0]) {
    const after1 = standings(roster, { 0: res[0] }, 1);
    let best = null;
    for (const r of rows) {
      const p1 = (after1.find(x => x.uid === r.uid) || {}).place;
      const gain = p1 - r.place;
      if (gain >= 2 && (!best || gain > best.gain)) best = { uid: r.uid, gain, from: p1, to: r.place };
    }
    if (best) out.push({ id: 'comeback', title: 'Remontée de la soirée', who: name(best.uid), detail: `de la ${best.from}e à la ${best.to}e place` });
  }
  // Fanfaronnades ratées / tenues.
  const boasts = {};
  for (const i of Object.keys(res)) for (const [uid, r] of Object.entries(res[i])) {
    if (r.boast < 0) boasts[uid] = (boasts[uid] || 0) + 1;
  }
  const bigMouth = Object.entries(boasts).sort((a, b) => b[1] - a[1])[0];
  if (bigMouth) out.push({ id: 'boast', title: 'Grande gueule punie', who: name(bigMouth[0]), detail: `${bigMouth[1]} fanfaronnade${bigMouth[1] > 1 ? 's' : ''} ratée${bigMouth[1] > 1 ? 's' : ''}` });
  if (extra.bestReflex) out.push({ id: 'reflex', title: 'Meilleur réflexe', who: name(extra.bestReflex.uid), detail: `${extra.bestReflex.ms} ms sur un signal` });
  if (extra.doubtful) out.push({ id: 'doubt', title: 'Champion des réponses douteuses', who: name(extra.doubtful.uid), detail: `« ${extra.doubtful.text} » refusée` });
  // Régularité : le plus petit écart entre sa meilleure et sa pire manche (au moins 3 manches jouées).
  const steady = rows.map(r => ({ uid: r.uid, per: r.per.filter(x => x !== null) })).filter(r => r.per.length >= 3)
    .map(r => ({ uid: r.uid, spread: Math.max(...r.per) - Math.min(...r.per) })).sort((a, b) => a.spread - b.spread);
  if (steady.length >= 2 && steady[0].spread < steady[1].spread && steady[0].spread <= 3) out.push({ id: 'steady', title: 'Métronome', who: name(steady[0].uid), detail: `jamais plus de ${steady[0].spread} pts d’écart d’une manche à l’autre` });
  return out;
}
