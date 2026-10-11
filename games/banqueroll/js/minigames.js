// Mini-jeux : catalogue, tirage, classement et paiements. Module PUR.
//
// Deroulement (voir party-actions.js) :
//   1. le client qui declenche (case EVENT ou duel) tire le jeu et ses parametres
//      UNE fois et les ecrit dans game.minigame ;
//   2. chaque participant envoie une entree { v, ok } (son temps, sa reponse, sa mise) ;
//      l'hote envoie celles des bots, simulees avec un seul tirage ;
//   3. l'HOTE resout une seule fois avec resolveMinigame : classement et paiements
//      sont calcules ici, a partir des entrees, de facon deterministe.
// Les fantomes jouent pour l'honneur : ils sont classes mais ne paient ni ne gagnent.

import { BOARD, isOwnable } from './board.js';
import { playerById, indexOfPlayer } from './rules.js';

export const PENALTY = 100;      // le dernier paie 100 $, partages entre les autres
export const DUEL_STAKE = 50;    // duel : le perdant paie 50 $ au gagnant
export const BLIND_EXTRA = 50;   // enchere a l'aveugle : le plus petit paie 50 $ au gagnant
export const INTRO_MS = 4500;    // annonce + regle + compte a rebours : le temps de lire avant le depart

const COLORS = [
  { id:'rouge', hex:'#C63A2F', shape:'●' }, { id:'bleu', hex:'#2F7FC1', shape:'■' },
  { id:'vert', hex:'#2E8F62', shape:'▲' }, { id:'jaune', hex:'#D99A1E', shape:'◆' },
];
export const MEMORY_COLORS = COLORS;
const BAITS = ['Clique ici pour 500 $', 'Bouton gratuit', 'Réclame ton bonus', 'Appuie, c’est sans risque', 'Récupère ton loyer'];
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// better : 'low' = le plus petit score gagne (temps) ; 'trap' et 'blind' ont leurs regles.
export const MINIGAMES = {
  reflex: { label:'Réflexe', rule:'Clique quand l’écran devient VERT. Trop tôt, tu perds.', duration: 6500, better:'low',
    gen: rng => ({ wait: 1500 + Math.floor(rng() * 2600) }) },
  mash:   { label:'Mitraillette', rule:'20 clics. Le plus vite possible.', duration: 7000, better:'low',
    gen: () => ({ target: 20 }) },
  math:   { label:'Calcul éclair', rule:'Trouve le bon résultat. Vite.', duration: 7000, better:'low',
    gen: rng => {
      const a = 120 + Math.floor(rng() * 380), b = 15 + Math.floor(rng() * 95);
      const plus = rng() < 0.5;
      const answer = plus ? a + b : a - b;
      const set = new Set([answer]);
      for (const d of [10, -10, 5, -5, 20, -20, 15]) { if (set.size >= 4) break; set.add(answer + d); }
      const choices = [...set].sort(() => rng() - 0.5);
      return { a, b, op: plus ? '+' : '−', answer, choices };
    } },
  city:   { label:'Trouve la ville', rule:'Clique la bonne case sur le plateau.', duration: 7500, better:'low',
    gen: rng => ({ target: pick(BOARD.map((s, i) => i).filter(i => BOARD[i].type === 'property'), rng) }) },
  memory: { label:'Mémoire', rule:'Retiens la suite, puis rejoue-la.', duration: 9500, better:'low',
    gen: rng => ({ seq: Array.from({ length: 4 }, () => pick(COLORS, rng).id), show: 2800 }) },
  trap:   { label:'Le piège', rule:'NE CLIQUE PAS.', duration: 6000, better:'trap',
    gen: rng => ({ bait: pick(BAITS, rng) }) },
  blind:  { label:'Enchère à l’aveugle', rule:'Mise en secret. Le plus gros prend le pot, le plus petit paie.', duration: 7500, better:'blind',
    gen: () => ({ options: [0, 20, 50, 100] }) },
};
export const EVENT_GAMES = Object.keys(MINIGAMES);

// Tirage d'un mini-jeu de case EVENT.
export function drawMinigame(rng = Math.random) {
  const kind = pick(EVENT_GAMES, rng);
  return { kind, params: MINIGAMES[kind].gen(rng) };
}
// Duel : toujours un reflexe, a deux.
export const drawDuel = (rng = Math.random) => ({ kind: 'reflex', params: MINIGAMES.reflex.gen(rng) });

// Valide une entree envoyee par un client : forme et bornes (un client ne peut pas tricher grossierement).
export function cleanEntry(kind, entry, params = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const v = Math.max(0, Math.min(60000, Math.round(Number(entry.v) || 0)));
  if (kind === 'blind') return { v: (params.options || [0, 20, 50, 100]).includes(v) ? v : 0, ok: true };
  if (kind === 'reflex') return { v: Math.max(80, v), ok: entry.ok === true };   // moins de 80 ms : impossible pour un humain
  return { v, ok: entry.ok === true };
}

// Entree simulee d'un bot (un seul tirage, par l'hote). delay : quand l'envoyer apres le depart.
export function botEntry(kind, params, rng = Math.random) {
  const r = rng();
  switch (kind) {
    case 'reflex': { if (r < 0.06) return { delay: Math.max(200, (params.wait || 2000) - 300), entry: { v: 0, ok: false } };
      const v = 230 + Math.floor(rng() * 330); return { delay: (params.wait || 2000) + v, entry: { v, ok: true } }; }
    case 'mash': { const v = 3300 + Math.floor(rng() * 3200); return r < 0.1 ? { delay: 6600, entry: { v: 6900, ok: false } } : { delay: v, entry: { v, ok: true } }; }
    case 'math': { const v = 1400 + Math.floor(rng() * 3300); return { delay: v, entry: { v, ok: r < 0.85 } }; }
    case 'city': { const v = 1800 + Math.floor(rng() * 3600); return { delay: v, entry: { v, ok: r < 0.75 } }; }
    case 'memory': { const v = (params.show || 2800) + 1500 + Math.floor(rng() * 3000); return { delay: v, entry: { v, ok: r < 0.8 } }; }
    case 'trap': { if (r < 0.25) { const v = 900 + Math.floor(rng() * 4200); return { delay: v, entry: { v, ok: false } }; } return null; }
    case 'blind': { const opts = params.options || [0, 20, 50, 100]; return { delay: 1500 + Math.floor(rng() * 4000), entry: { v: opts[Math.floor(rng() * opts.length)], ok: true } }; }
    default: return null;
  }
}

// Score comparable (plus petit = meilleur) pour les jeux en temps. Echec ou absence : Infinity.
const timeScore = e => (e && e.ok ? e.v : Infinity);

// Classe les participants et calcule les paiements. Deterministe : memes entrees -> meme resultat.
// Renvoie { rows, winnerIds, loserId, payments:[{from,to,amt}], updates, text, nobody }
export function resolveMinigame(game, mg) {
  const def = MINIGAMES[mg.kind] || MINIGAMES.reflex;
  const entries = mg.entries || {};
  const ids = (mg.participants || []).filter(id => playerById(game, id));
  const payer = id => { const p = playerById(game, id); return !!p && !p.bankrupt; };   // les fantomes ne paient pas
  const order = id => ids.indexOf(id);
  const rows = ids.map(id => ({ pid: id, entry: entries[id] || null, ghost: !payer(id) }));
  const payments = [];
  let winnerIds = [], loserId = null;
  const duel = mg.origin === 'duel';

  if (def.better === 'trap') {
    // Le premier qui clique perd ; si personne ne clique, personne ne paie.
    rows.forEach(r => { r.score = r.entry ? r.entry.v : Infinity; r.label = r.entry ? `a cliqué (${(r.entry.v / 1000).toFixed(1)} s)` : 'a résisté'; });
    rows.sort((a, b) => a.score - b.score || order(a.pid) - order(b.pid));
    const clicker = rows.find(r => !r.ghost && r.entry);
    if (clicker) loserId = clicker.pid;
    winnerIds = rows.filter(r => !r.entry && !r.ghost).map(r => r.pid);
  } else if (def.better === 'blind') {
    // Chacun mise en secret ; le plus gros prend le pot ; le plus petit paie un supplement au gagnant.
    const cashOf = id => Math.max(0, (playerById(game, id) || {}).cash || 0);
    rows.forEach(r => { r.bid = r.ghost ? 0 : Math.min(r.entry ? r.entry.v : 0, cashOf(r.pid)); r.score = -r.bid; r.label = `${r.bid} $`; });
    rows.sort((a, b) => b.bid - a.bid || order(a.pid) - order(b.pid));
    const live = rows.filter(r => !r.ghost);
    const top = live.length ? live[0].bid : 0;
    const low = live.length ? live[live.length - 1].bid : 0;
    if (top > 0) {
      winnerIds = live.filter(r => r.bid === top).map(r => r.pid);
      const pot = live.reduce((s, r) => s + r.bid, 0);
      live.forEach(r => { if (r.bid > 0) payments.push({ from: r.pid, to: null, amt: r.bid }); });     // les mises vont au pot
      const share = Math.floor(pot / winnerIds.length);
      winnerIds.forEach(w => payments.push({ from: null, to: w, amt: share }));
      const lows = live.filter(r => r.bid === low);
      if (low < top && lows.length === 1) {
        loserId = lows[0].pid;
        payments.push({ from: loserId, to: winnerIds[0], amt: BLIND_EXTRA });
      }
    }
  } else {
    // Jeux en temps : le plus rapide gagne, le dernier (ou celui qui echoue) paie.
    rows.forEach(r => {
      r.score = timeScore(r.entry);
      r.label = !r.entry ? 'pas de réponse' : !r.entry.ok ? (mg.kind === 'reflex' && r.entry.v === 0 ? 'trop tôt !' : 'raté') : `${(r.entry.v / 1000).toFixed(2)} s`;
    });
    // Ex aequo en echec : absent avant erreur, puis ordre des joueurs (deterministe).
    rows.sort((a, b) => a.score - b.score || (a.entry ? 1 : 0) - (b.entry ? 1 : 0) || order(a.pid) - order(b.pid));
    const live = rows.filter(r => !r.ghost);
    const best = rows.find(r => r.score < Infinity);
    if (best) winnerIds = [best.pid];
    const allFailed = live.length && live.every(r => r.score === Infinity);
    if (!allFailed && live.length >= 2) loserId = live[live.length - 1].pid;
    if (loserId && winnerIds.includes(loserId)) loserId = null;
  }

  // Paiement standard : le dernier paie PENALTY partages entre les autres (duel : DUEL_STAKE au gagnant).
  if (def.better !== 'blind' && loserId) {
    if (duel) {
      const w = winnerIds.find(id => id !== loserId);
      if (w) payments.push({ from: loserId, to: w, amt: DUEL_STAKE });
    } else {
      const others = ids.filter(id => id !== loserId && payer(id));
      const share = others.length ? Math.floor(PENALTY / others.length) : 0;
      others.forEach(id => payments.push({ from: loserId, to: id, amt: share }));
    }
  }

  // Ecritures : un seul total par joueur.
  const delta = {};
  payments.forEach(p => {
    if (p.from) delta[p.from] = (delta[p.from] || 0) - p.amt;
    if (p.to) delta[p.to] = (delta[p.to] || 0) + p.amt;
  });
  const updates = {};
  Object.entries(delta).forEach(([id, d]) => {
    if (!d || !payer(id)) return;
    const i = indexOfPlayer(game, id);
    updates[`players/${i}/cash`] = (game.players[i].cash || 0) + d;
  });
  rows.forEach((r, i) => { r.rank = i + 1; r.delta = delta[r.pid] || 0; });

  const name = id => (playerById(game, id) || {}).name || '?';
  let text;
  if (duel) {
    text = loserId && winnerIds[0] ? `Duel : ${name(winnerIds[0])} dégaine plus vite et prend ${DUEL_STAKE} $ à ${name(loserId)}.`
      : 'Duel nul : personne n’a tiré proprement. Personne ne paie.';
  } else if (def.better === 'trap') {
    text = loserId ? `Le piège : ${name(loserId)} a cliqué. ${PENALTY} $ pour les autres.` : 'Le piège : personne n’a cliqué. Une table de saints.';
  } else if (def.better === 'blind') {
    text = winnerIds.length ? `Enchère à l’aveugle : ${winnerIds.map(name).join(' et ')} ${winnerIds.length > 1 ? 'raflent' : 'rafle'} le pot${loserId ? `, ${name(loserId)} paie ${BLIND_EXTRA} $ de plus` : ''}.`
      : 'Enchère à l’aveugle : personne n’a misé. Pot vide.';
  } else {
    text = loserId ? `${def.label} : ${name(winnerIds[0])} gagne, ${name(loserId)} termine à la dernière place et paie ${PENALTY} $ aux autres.`
      : `${def.label} : personne n’a réussi. Personne ne paie, tout le monde a honte.`;
  }
  return {
    rows: rows.map(r => ({ pid: r.pid, rank: r.rank, label: r.label, delta: r.delta, ghost: r.ghost })),
    winnerIds, loserId, payments, updates, text, nobody: !loserId && !winnerIds.length,
  };
}

export const isCityTarget = (params, index) => Number(index) === Number(params.target) && isOwnable(BOARD[index]);
