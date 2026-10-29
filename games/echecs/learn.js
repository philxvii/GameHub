// Mode apprentissage : les leçons (positions, objectifs, textes) et les phrases du coach.
// Pur : ni DOM ni Firebase ; la page (index.html) met en scène.
//
// Une étape de leçon :
//   fen    position de départ (blancs au trait) ;
//   goal   'stars'  : ramasser les étoiles (et prendre les pièces noires) avec ses pièces, qui
//                     jouent seules, sans que les noirs répondent ;
//          'move'   : jouer l'un des coups `want` (début de notation UCI : 'b7b8' accepte toute promotion) ;
//          'escape' : sortir de l'échec ;
//          'mate'   : mater en un coup ;
//   text   la consigne ; ok : le mot de la fin ; hint : l'indice.

import { W, B, kindOf, colorOf, sqName, attackersOf, attacked, make, unmake, inCheck, legal } from './rules.js?v=4';

export const LESSONS = [
  { title: 'Le roi et la tour', steps: [
    { fen: '8/8/8/8/4K3/8/8/8 w - - 0 1', goal: 'stars', stars: ['e5', 'f5', 'f4'],
      text: 'Le roi avance d’une seule case, dans toutes les directions. Va chercher les trois étoiles.', ok: 'Le roi est lent, mais c’est la pièce à protéger : si on le capture, la partie est perdue.' },
    { fen: '8/8/8/8/8/8/8/R7 w - - 0 1', goal: 'stars', stars: ['a6', 'f6', 'f2'],
      text: 'La tour file en ligne droite, aussi loin qu’elle veut, mais ne saute jamais par-dessus une pièce.', ok: 'Une tour vaut cinq pions.' },
  ] },
  { title: 'Le fou et la dame', steps: [
    { fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', goal: 'stars', stars: ['f4', 'd6', 'a3'],
      text: 'Le fou glisse en diagonale. Il reste toute la partie sur les cases de sa couleur.', ok: 'Un fou vaut trois pions.' },
    { fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', goal: 'stars', stars: ['d6', 'h2', 'b8'],
      text: 'La dame cumule la tour et le fou : lignes droites et diagonales. C’est la pièce la plus forte.', ok: 'Une dame vaut neuf pions : ne la perds pas.' },
  ] },
  { title: 'Le cavalier et le pion', steps: [
    { fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', goal: 'stars', stars: ['c3', 'e4', 'f6'],
      text: 'Le cavalier saute en L : deux cases dans un sens, puis une sur le côté. C’est la seule pièce qui passe par-dessus les autres.', ok: 'Un cavalier vaut trois pions, comme le fou.' },
    { fen: '8/8/8/3p4/8/8/4P3/8 w - - 0 1', goal: 'stars', stars: ['e4'],
      text: 'Le pion avance tout droit, d’une case (deux à son premier coup), et prend en diagonale. Avance en e4, puis prends le pion noir.', ok: 'Le pion ne recule jamais.' },
  ] },
  { title: 'Les coups spéciaux', steps: [
    { fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', goal: 'move', want: ['e1g1', 'e1c1'],
      text: 'Le roque met le roi à l’abri en un seul coup : le roi glisse de deux cases vers une tour, qui passe de l’autre côté. Choisis ton roi, puis g1 ou c1.',
      hint: 'Clique le roi en e1 : les cases g1 et c1 s’allument.', ok: 'Roi à l’abri, tour en jeu. On ne peut pas roquer si le roi ou la tour ont déjà bougé, ni en étant en échec.' },
    { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', goal: 'move', want: ['e5d6'],
      text: 'Le pion noir vient d’avancer de deux cases et s’arrête juste à côté du tien. Tu peux le prendre « en passant », comme s’il n’avait avancé que d’une case : joue e5 en d6.',
      hint: 'Ton pion en e5 va en diagonale, sur la case vide d6.', ok: 'La prise en passant n’est possible qu’au coup qui suit.' },
    { fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', goal: 'move', want: ['b7b8'],
      text: 'Un pion qui atteint la dernière rangée se transforme, en dame presque toujours. Avance-le en b8.',
      hint: 'Le pion en b7 avance d’une case.', ok: 'Une nouvelle dame : c’est pour ça que les pions avancés sont si dangereux.' },
  ] },
  { title: 'Échec et mat', steps: [
    { fen: '4k3/8/8/8/8/8/3P4/r3K3 w - - 0 1', goal: 'escape',
      text: 'La tour noire attaque ton roi : c’est l’échec. Il faut le sauver tout de suite, en le déplaçant, en mettant une pièce devant ou en prenant l’attaquant.',
      hint: 'Le roi peut monter en e2 ou en f2.', ok: 'Sauvé. Un coup qui laisse son roi en échec est interdit.' },
    { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', goal: 'mate',
      text: 'Échec et mat : le roi est attaqué et n’a plus aucune case où fuir. C’est la fin de la partie. Trouve le mat en un coup avec la tour.',
      hint: 'Le roi noir est enfermé derrière ses propres pions.', ok: 'Le mat du couloir : un grand classique.' },
    { fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', goal: 'mate',
      text: 'À toi : mat en un coup avec la dame. Ton roi l’aide en gardant les cases autour du roi noir.',
      hint: 'La dame attaque de loin, le long de la dernière rangée.', ok: 'Bravo, tu connais les règles. Place à une vraie partie, avec le coach.' },
  ] },
];

// ══════════════════ Le coach ══════════════════
const NAME = { K: 'roi', Q: 'dame', R: 'tour', B: 'fou', N: 'cavalier', P: 'pion' };
const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export const the = p => (kindOf(p) === 'Q' || kindOf(p) === 'R' ? 'la ' : 'le ') + NAME[kindOf(p)];
const yours = (p, mine) => (mine ? (kindOf(p) === 'Q' || kindOf(p) === 'R' ? 'ta ' : 'ton ') : (kindOf(p) === 'Q' || kindOf(p) === 'R' ? 'sa ' : 'son ')) + NAME[kindOf(p)];

// Ce que fait un coup, en une phrase. `st` : la position AVANT le coup ; `me` : couleur du joueur.
export function describe(st, m, me) {
  const mine = colorOf(m.p) === me, who = mine ? 'Tu joues' : 'L’ordinateur joue';
  const u = make(st, m);
  let why;
  try {
    const them = st.side, mover = st.b[m.to];
    if (inCheck(st)) why = legal(st).length ? 'échec au roi' : 'échec et mat';
    else if (m.flag === 'k' || m.flag === 'q') why = mine ? 'ton roi est à l’abri' : 'son roi se met à l’abri';
    else if (m.promo) why = `le pion devient ${the(m.promo).replace('le ', 'un ').replace('la ', 'une ')}`;
    else if (m.cap !== '.') why = `prise de ${mine ? 'son' : 'ton'} ${NAME[kindOf(m.cap)]}`;
    else {
      // Menace : la pièce jouée attaque une pièce plus chère, ou non défendue.
      const threats = [];
      for (let s = 0; s < 64; s++) {
        const p = st.b[s];
        if (p === '.' || colorOf(p) !== them || kindOf(p) === 'K') continue;
        if (!attackersOf(st.b, s, them ^ 1).includes(m.to)) continue;
        if (VALUE[kindOf(p)] > VALUE[kindOf(mover)] || !attacked(st.b, s, them)) threats.push([VALUE[kindOf(p)], s, p]);
      }
      threats.sort((a, b) => b[0] - a[0]);
      if (threats.length) why = `menace ${yours(threats[0][2], !mine)} en ${sqName(threats[0][1])}`;
      else if ('NB'.includes(kindOf(m.p)) && ((m.from >> 3) === 0 || (m.from >> 3) === 7)) why = mine ? 'une pièce de plus en jeu' : 'il sort une pièce';
      else if (kindOf(m.p) === 'P' && [27, 28, 35, 36].includes(m.to)) why = 'de la place au centre';
    }
  } finally { unmake(st, m, u); }
  const what = m.flag === 'k' ? 'le petit roque' : m.flag === 'q' ? 'le grand roque' : `${the(m.p)} en ${sqName(m.to)}`;
  return `${who} ${what}${why ? ` : ${why}` : ''}.`;
}

// Conseil après le coup de l'ordinateur : échec, pièces en prise.
export function warning(st, hangingSquares) {
  if (inCheck(st)) return 'Ton roi est en échec : déplace-le, mets une pièce devant ou prends l’attaquant.';
  if (!hangingSquares.length) return '';
  const p = hangingSquares.map(s => [VALUE[kindOf(st.b[s])], s]).sort((a, b) => b[0] - a[0])[0][1];
  return `Attention : ${yours(st.b[p], true)} en ${sqName(p)} est en prise.${hangingSquares.length > 1 ? ' Et ce n’est pas la seule.' : ''}`;
}

export const OPENING_TIP = 'Les blancs commencent. Un bon début : avance un pion du centre (e4 ou d4), puis sors tes cavaliers et tes fous.';
export { W, B };
