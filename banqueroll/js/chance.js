// Chance : cartes, dilemmes et roue. Fonctions PURES.
//
// Regle multijoueur : tout l'aleatoire est tire UNE fois, par drawChance, dans
// le client du joueur actif. Le resultat (y compris les tirages secondaires :
// pile ou face, destination de teleportation...) est stocke dans game.event.
// Les autres clients ne tirent jamais rien : ils animent le resultat partage.
//
// Chaque resolution renvoie un "Outcome" :
//   { updates, text, then, meta }
//   then = 'end'              -> l'appelant termine le tour (planNextTurn)
//        | { move, from }     -> l'appelant ecrit et resout la case d'arrivee
//        | { action }         -> une decision supplementaire est attendue

import { BOARD, de, START_INDEX, crossesStart, isPublic, isOwnable } from './board.js';
import {
  START_BONUS, ownedBy, levelOf, playerById, indexOfPlayer, alivePlayers, netWorth,
  tradeable, jailUpdates, buildCost,
} from './rules.js';

// ------------------------------------------------------------ outils
function ledger(game) {
  const updates = {};
  const key = i => `players/${i}/cash`;
  return {
    updates,
    cash(i) { return updates[key(i)] !== undefined ? updates[key(i)] : (game.players[i].cash || 0); },
    add(i, delta) { updates[key(i)] = this.cash(i) + delta; },
    set(k, v) { updates[k] = v; },
  };
}

const money = n => `${n < 0 ? '−' : '+'}${Math.abs(n)} $`;
const opponents = (game, me) => alivePlayers(game).filter(p => p.id !== me.id);
const richest = (game, me) => [...opponents(game, me)].sort((a, b) => netWorth(game, b) - netWorth(game, a))[0] || null;
const poorest = (game, me) => [...opponents(game, me)].sort((a, b) => netWorth(game, a) - netWorth(game, b))[0] || null;
const byPrice = (game, list, dir = 1) => [...list].sort((a, b) => dir * (BOARD[a].price - BOARD[b].price));

function moveTo(game, L, idx, from, to, withStartBonus = true) {
  L.set(`players/${idx}/position`, to);
  const steps = (to - from + BOARD.length) % BOARD.length;
  if (withStartBonus && (to === START_INDEX || crossesStart(from, steps))) L.add(idx, START_BONUS);
  return { move: to, from };
}

// ------------------------------------------------------------ cartes
export const CARDS = [
  { id:'crypto', title:'Coup de génie involontaire', text:'Ton memecoin a fait ×40 pendant que tu dormais. +150 $.',
    run(g, me, i, L) { L.add(i, 150); return 'end'; } },
  { id:'scooter', title:'Flashé', text:'31 km/h en trottinette sur un trottoir. −100 $.',
    run(g, me, i, L) { L.add(i, -100); return 'end'; } },
  { id:'birthday', title:'Joyeux anniversaire', text:'Chaque adversaire te verse 50 $, à contrecœur.',
    run(g, me, i, L) {
      opponents(g, me).forEach(p => { const j = indexOfPlayer(g, p.id); L.add(j, -50); L.add(i, 50); });
      return 'end';
    } },
  { id:'round', title:'Tournée générale', text:'Tu as voulu impressionner. Tu paies 40 $ à chaque adversaire.',
    run(g, me, i, L) {
      opponents(g, me).forEach(p => { const j = indexOfPlayer(g, p.id); L.add(j, 40); L.add(i, -40); });
      return 'end';
    } },
  { id:'bankerror', title:'Erreur de la banque', text:'Bug informatique en ta faveur. +120 $. Personne n’en parlera.',
    run(g, me, i, L) { L.add(i, 120); return 'end'; } },
  { id:'repairs', title:'Inspection des normes', text:'40 $ par bâtiment que tu possèdes.',
    run(g, me, i, L) {
      const count = ownedBy(g, me.id).reduce((n, pos) => n + levelOf(g, pos), 0);
      L.add(i, -40 * count);
      return 'end';
    } },
  { id:'forward3', title:'Coup d’accélérateur', text:'Avance de 3 cases.',
    run(g, me, i, L) { return moveTo(g, L, i, me.position, (me.position + 3) % BOARD.length); } },
  { id:'back2', title:'Marche arrière', text:'Recule de 2 cases.',
    run(g, me, i, L) { return moveTo(g, L, i, me.position, (me.position - 2 + BOARD.length) % BOARD.length, false); } },
  { id:'start', title:'Retour aux sources', text:'Va directement au Départ et touche 200 $.',
    run(g, me, i, L) { return moveTo(g, L, i, me.position, START_INDEX); } },
  { id:'jail', title:'Garde à vue', text:'Va directement en prison. Ne touche pas les 200 $.',
    run(g, me, i, L) { Object.entries(jailUpdates(g, i)).forEach(([k, v]) => L.set(k, v)); return 'end'; } },
  { id:'transit', title:'Correspondance', text:'Avance jusqu’à la prochaine propriété publique.',
    run(g, me, i, L) {
      let to = me.position;
      do { to = (to + 1) % BOARD.length; } while (!isPublic(BOARD[to]));
      return moveTo(g, L, i, me.position, to);
    } },
];

// ------------------------------------------------------------ dilemmes
// options(g, me) -> [{id, label}] ; resolve(g, me, i, L, choice, detail) -> then
// afk : option appliquee par l'hote si le joueur ne choisit pas a temps.
export const DILEMMAS = [
  {
    id:'taxman', title:'Le fisc sonne.', prompt:'Contrôle surprise. Tu vas payer, la seule question est comment.', afk:'A',
    available: () => true,
    planB(g, me) {
      const built = byPrice(g, ownedBy(g, me.id).filter(p => levelOf(g, p) > 0), -1)[0];
      if (built !== undefined) return { kind:'demolish', pos: built, label:`Démolir 1 bâtiment à ${BOARD[built].name} (aucun remboursement)` };
      const cheap = byPrice(g, ownedBy(g, me.id).filter(p => tradeable(g, p)))[0];
      if (cheap !== undefined) return { kind:'cede', pos: cheap, label:`Céder ${BOARD[cheap].name} à la banque (aucun remboursement)` };
      return { kind:'jail', label:'Aller en prison plutôt que payer' };
    },
    options(g, me) { return [{ id:'A', label:'Payer 300 $' }, { id:'B', label: this.planB(g, me).label }]; },
    resolve(g, me, i, L, choice) {
      if (choice === 'A') { L.add(i, -300); return 'end'; }
      const b = this.planB(g, me);
      if (b.kind === 'demolish') L.set(`buildings/${b.pos}`, levelOf(g, b.pos) - 1 || null);
      else if (b.kind === 'cede') L.set(`ownership/${b.pos}`, null);
      else Object.entries(jailUpdates(g, i)).forEach(([k, v]) => L.set(k, v));
      return 'end';
    },
  },
  {
    id:'faust', title:'Pacte faustien.', prompt:'Un inconnu en costume trois pièces te tend un contrat et un stylo.', afk:'B',
    available: () => true,
    options: () => [{ id:'A', label:'Prendre 500 $ — mais tu passes ton prochain tour' }, { id:'B', label:'Refuser (il ne se passe rien)' }],
    resolve(g, me, i, L, choice) {
      if (choice === 'A') { L.add(i, 500); L.set(`players/${i}/skipNext`, true); }
      return 'end';
    },
  },
  {
    id:'loan', title:'Prêt toxique.', prompt:'Une banque très accommodante te propose de l’argent tout de suite.', afk:'B',
    available: (g, me) => !!poorest(g, me) && ownedBy(g, me.id).some(p => tradeable(g, p)),
    options(g, me) {
      const who = poorest(g, me);
      return [{ id:'A', label:`Encaisser 700 $ — ${who.name} choisit une de tes propriétés et la garde` },
              { id:'B', label:'Refuser et payer 50 $ de frais de dossier' }];
    },
    resolve(g, me, i, L, choice) {
      if (choice === 'B') { L.add(i, -50); return 'end'; }
      L.add(i, 700);
      return { action:{ type:'seize', playerId: me.id, chooserId: poorest(g, me).id, victimId: me.id } };
    },
  },
  {
    id:'double', title:'Quitte ou double.', prompt:'Une pièce. Deux faces. Aucune pitié.', afk:'B',
    available: () => true,
    options: () => [{ id:'A', label:'Pile ou face : +400 $ ou −400 $' }, { id:'B', label:'Prendre 100 $ et rentrer chez toi' }],
    resolve(g, me, i, L, choice, detail) {
      if (choice === 'B') { L.add(i, 100); return 'end'; }
      L.add(i, detail && detail.coin === 'win' ? 400 : -400);
      return 'end';
    },
  },
  {
    id:'shortcut', title:'Raccourci douteux.', prompt:'Un type louche connaît un passage. Il demande juste une petite participation.', afk:'B',
    available: () => true,
    options: () => [{ id:'A', label:'Filer au Départ : +200 $, mais 150 $ de péage' }, { id:'B', label:'Avancer de 4 cases, à l’aveugle' }],
    resolve(g, me, i, L, choice) {
      if (choice === 'A') { L.add(i, -150); return moveTo(g, L, i, me.position, START_INDEX); }
      return moveTo(g, L, i, me.position, (me.position + 4) % BOARD.length);
    },
  },
  {
    id:'robin', title:'Robin des bois.', prompt:'La redistribution, c’est maintenant. Dans un sens ou dans l’autre.', afk:'A',
    available: (g, me) => opponents(g, me).length > 0,
    options(g, me) {
      return [{ id:'A', label:`Prendre 150 $ à ${richest(g, me).name}` },
              { id:'B', label:`Donner 100 $ à ${poorest(g, me).name} et rejouer immédiatement` }];
    },
    resolve(g, me, i, L, choice) {
      if (choice === 'A') {
        const j = indexOfPlayer(g, richest(g, me).id); L.add(j, -150); L.add(i, 150);
      } else {
        const j = indexOfPlayer(g, poorest(g, me).id); L.add(j, 100); L.add(i, -100);
        L.set('extraRoll', me.id);
      }
      return 'end';
    },
  },
  {
    id:'insider', title:'Délit d’initié.', prompt:'Un ami d’ami « travaille dans la finance ». Il a un tuyau.', afk:'B',
    available: (g, me) => ownedBy(g, me.id).length > 0,
    options: () => [{ id:'A', label:'Payer 150 $ : ton prochain loyer encaissé est triplé' }, { id:'B', label:'Rester honnête (rien)' }],
    resolve(g, me, i, L, choice) {
      if (choice === 'A') { L.add(i, -150); L.set(`players/${i}/rentBoost`, 3); }
      return 'end';
    },
  },
];

// ------------------------------------------------------------ roue
export const WHEEL = [
  { id:'jackpot',  label:'JACKPOT',     sub:'+1 000 $',      weight:1,   color:'#F6C62F' },
  { id:'minus500', label:'−500 $',      sub:'Aïe',           weight:2,   color:'#E2574C' },
  { id:'reroll',   label:'RELANCE',     sub:'Rejoue',        weight:2,   color:'#58B7F2' },
  { id:'raid',     label:'RAFLE',       sub:'Rachète-leur',  weight:1,   color:'#C63C75' },
  { id:'plus300',  label:'+300 $',      sub:'Correct',       weight:2,   color:'#8AD21F' },
  { id:'jail',     label:'PRISON',      sub:'3 tours',       weight:1,   color:'#3A3D45' },
  { id:'triple',   label:'LOYER ×3',    sub:'Prochain loyer', weight:1.5, color:'#F28C22' },
  { id:'fire',     label:'LIQUIDATION', sub:'Vente à 50 %',  weight:1,   color:'#A86429' },
  { id:'teleport', label:'TÉLÉPORT',    sub:'Case surprise', weight:1.5, color:'#7446C4' },
  { id:'swap',     label:'ÉCHANGE',     sub:'Forcé',         weight:1,   color:'#2F9B78' },
  { id:'nothing',  label:'RIEN',        sub:'Littéralement', weight:1,   color:'#9AA4A8' },
];
export const WHEEL_TOTAL = WHEEL.reduce((s, w) => s + w.weight, 0);

// Angles (degres) de chaque segment, proportionnels a sa probabilite :
// la taille affichee dit la verite sur les chances.
export function wheelGeometry() {
  let acc = 0;
  return WHEEL.map(seg => {
    const start = acc / WHEEL_TOTAL * 360;
    acc += seg.weight;
    return { ...seg, start, end: acc / WHEEL_TOTAL * 360 };
  });
}

function pickWeighted(rng) {
  let r = rng() * WHEEL_TOTAL;
  for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].weight; if (r < 0) return i; }
  return WHEEL.length - 1;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// Proprietes adverses qu'on peut racheter au prix fort.
export function raidTargets(game, me) {
  return Object.entries(game.ownership || {})
    .map(([pos, owner]) => ({ pos:Number(pos), owner }))
    .filter(o => o.owner !== me.id && tradeable(game, o.pos) && BOARD[o.pos].price <= (me.cash || 0)
      && !(playerById(game, o.owner) || {}).bankrupt);
}

// ------------------------------------------------------------ tirage
export function drawChance(game, playerId, rng = Math.random) {
  const me = playerById(game, playerId);
  const r = rng();
  if (r < 0.42) {
    const card = pick(CARDS, rng);
    return { kind:'card', key: card.id, detail:{} };
  }
  if (r < 0.74) {
    const list = DILEMMAS.filter(d => d.available(game, me));
    const d = pick(list, rng);
    return { kind:'dilemma', key: d.id, detail:{ coin: rng() < 0.5 ? 'win' : 'lose' } };
  }
  const seg = pickWeighted(rng);
  const detail = {};
  const id = WHEEL[seg].id;
  if (id === 'teleport') {
    const spots = BOARD.map((_, i) => i).filter(i => i !== 0 && i !== 7 && i !== me.position);
    detail.dest = pick(spots, rng);
  }
  if (id === 'swap') {
    const mine = ownedBy(game, me.id).filter(p => tradeable(game, p));
    const theirs = Object.entries(game.ownership || {})
      .filter(([pos, o]) => o !== me.id && tradeable(game, Number(pos)) && !(playerById(game, o) || {}).bankrupt)
      .map(([pos]) => Number(pos));
    if (mine.length && theirs.length) { detail.mine = pick(mine, rng); detail.theirs = pick(theirs, rng); }
  }
  return { kind:'wheel', key: id, seg, detail };
}

// ------------------------------------------------------------ resolutions
export function resolveCard(game, playerId, cardId) {
  const card = CARDS.find(c => c.id === cardId);
  const i = indexOfPlayer(game, playerId);
  const me = game.players[i];
  const L = ledger(game);
  const before = L.cash(i);
  const then = card.run(game, me, i, L);
  const delta = L.cash(i) - before;
  let text = `${me.name} pioche « ${card.title} » : ${card.text}`;
  if (card.id === 'repairs') text = delta ? `${me.name} subit une inspection : ${money(delta)} pour ses bâtiments.` : `${me.name} subit une inspection. Rien à inspecter. C’est presque triste.`;
  return { updates: L.updates, text, then, meta:{ t:'chance', kind:'card', key: card.id, p: playerId, amt: delta } };
}

export function dilemmaOptions(game, playerId, key) {
  const d = DILEMMAS.find(x => x.id === key);
  const me = playerById(game, playerId);
  return d && me ? d.options(game, me) : [];
}

export function resolveDilemma(game, playerId, key, choice, detail = {}) {
  const d = DILEMMAS.find(x => x.id === key);
  const i = indexOfPlayer(game, playerId);
  const me = game.players[i];
  const L = ledger(game);
  const before = L.cash(i);
  const label = (d.options(game, me).find(o => o.id === choice) || {}).label || choice;
  const then = d.resolve(game, me, i, L, choice, detail);
  const delta = L.cash(i) - before;
  let text = `${me.name} choisit : ${label}.`;
  if (key === 'double' && choice === 'A') text += detail.coin === 'win' ? ' Pile : +400 $.' : ' Face : −400 $. Raté.';
  return { updates: L.updates, text, then, meta:{ t:'chance', kind:'dilemma', key, choice, p: playerId, amt: delta, coin: detail.coin } };
}

export function resolveWheel(game, playerId, segId, detail = {}) {
  const i = indexOfPlayer(game, playerId);
  const me = game.players[i];
  const L = ledger(game);
  const before = L.cash(i);
  let then = 'end';
  let text = '';
  switch (segId) {
    case 'jackpot': L.add(i, 1000); text = `JACKPOT ! ${me.name} empoche 1 000 $.`; break;
    case 'plus300': L.add(i, 300); text = `${me.name} gagne 300 $ à la roue.`; break;
    case 'minus500': L.add(i, -500); text = `La roue prend 500 $ à ${me.name}.`; break;
    case 'jail':
      Object.entries(jailUpdates(game, i)).forEach(([k, v]) => L.set(k, v));
      text = `La roue envoie ${me.name} en prison.`; break;
    case 'reroll': L.set('extraRoll', me.id); text = `${me.name} gagne un lancer supplémentaire.`; break;
    case 'triple': L.set(`players/${i}/rentBoost`, 3); text = `Le prochain loyer encaissé par ${me.name} sera triplé.`; break;
    case 'teleport': {
      const dest = Number.isInteger(detail.dest) ? detail.dest : (me.position + 5) % BOARD.length;
      then = moveTo(game, L, i, me.position, dest, false);
      text = `Téléportation : ${me.name} atterrit à ${BOARD[dest].name}.`; break;
    }
    case 'fire': {
      const best = byPrice(game, ownedBy(game, me.id).filter(p => isOwnable(BOARD[p])), -1)[0];
      if (best === undefined) { L.add(i, -100); text = `Rien à liquider chez ${me.name} : la roue se contente de 100 $.`; break; }
      const value = Math.round((BOARD[best].price + levelOf(game, best) * (BOARD[best].type === 'property' ? buildCost(best) : 0)) * 0.5);
      L.set(`ownership/${best}`, null); L.set(`buildings/${best}`, null); L.add(i, value);
      text = `Liquidation : ${BOARD[best].name} part à la banque pour ${value} $.`; break;
    }
    case 'swap': {
      const ok = Number.isInteger(detail.mine) && Number.isInteger(detail.theirs)
        && game.ownership && game.ownership[detail.mine] === me.id && tradeable(game, detail.mine)
        && game.ownership[detail.theirs] && game.ownership[detail.theirs] !== me.id && tradeable(game, detail.theirs);
      if (!ok) { text = `Échange forcé… mais personne n’a rien à échanger avec ${me.name}.`; break; }
      const other = playerById(game, game.ownership[detail.theirs]);
      L.set(`ownership/${detail.mine}`, other.id); L.set(`ownership/${detail.theirs}`, me.id);
      text = `Échange forcé : ${BOARD[detail.mine].name} (${me.name}) ↔ ${BOARD[detail.theirs].name} (${other.name}).`;
      break;
    }
    case 'raid':
      if (!raidTargets(game, me).length) { L.add(i, 150); text = `Rafle annulée faute de cible : ${me.name} touche 150 $ de compensation.`; break; }
      then = { action:{ type:'steal', playerId: me.id } };
      text = `${me.name} peut racheter une propriété adverse au prix fort.`; break;
    default: text = `La roue s’arrête sur RIEN. ${me.name} a fait tout ça pour ça.`;
  }
  return { updates: L.updates, text, then, meta:{ t:'chance', kind:'wheel', key: segId, p: playerId, amt: L.cash(i) - before } };
}

// Rafle : achat force au prix d'achat, paye au proprietaire.
export function resolveSteal(game, playerId, pos) {
  const i = indexOfPlayer(game, playerId);
  const me = game.players[i];
  const target = raidTargets(game, me).find(t => t.pos === pos);
  if (!target) return null;
  const L = ledger(game);
  const j = indexOfPlayer(game, target.owner);
  const price = BOARD[pos].price;
  L.add(i, -price); L.add(j, price); L.set(`ownership/${pos}`, me.id);
  return { updates: L.updates, text:`${me.name} rafle ${BOARD[pos].name} à ${game.players[j].name} pour ${price} $.`, then:'end',
           meta:{ t:'steal', p: me.id, o: target.owner, pos, amt: -price } };
}

// Pret toxique : l'adversaire choisit une propriete de la victime et la garde.
export function resolveSeize(game, chooserId, victimId, pos) {
  if (!game.ownership || game.ownership[pos] !== victimId || !tradeable(game, pos)) return null;
  const chooser = playerById(game, chooserId), victim = playerById(game, victimId);
  return { updates:{ [`ownership/${pos}`]: chooserId }, then:'end',
           text:`${chooser.name} choisit ${BOARD[pos].name} dans le portefeuille ${de(victim.name)}. Le prêt était toxique.`,
           meta:{ t:'seize', p: victimId, o: chooserId, pos } };
}

// Choix automatique de l'hote si le preneur ne se decide pas : la plus chere.
export function autoSeizePick(game, victimId) {
  return byPrice(game, ownedBy(game, victimId).filter(p => tradeable(game, p)), -1)[0];
}
