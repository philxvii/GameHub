// Plateau : donnees pures, sans DOM ni Firebase. Importable tel quel dans Node.
//
// L'ORDRE DES 28 CASES EST UNE CONTRAINTE PRODUIT. Il est verifie par
// tools/check-static.js : ne le rearrange jamais pour des raisons de design.

export const BOARD = [
  {id:'chance',name:'Chance',type:'chance'},
  {id:'jakarta',name:'Jakarta',type:'property',price:170,group:'Pink'},
  {id:'berlin',name:'Berlin',type:'property',price:180,group:'Pink'},
  {id:'moscow',name:'Moscow',type:'property',price:200,group:'Orange'},
  {id:'railway',name:'Railway',type:'station',price:200,group:'Public'},
  {id:'toronto',name:'Toronto',type:'property',price:200,group:'Orange'},
  {id:'seoul',name:'Seoul',type:'property',price:200,group:'Orange'},
  {id:'jail',name:'Jail',type:'jail'},
  {id:'zurich',name:'Zurich',type:'property',price:250,group:'DarkGreen'},
  {id:'riyadh',name:'Riyadh',type:'property',price:250,group:'DarkGreen'},
  {id:'sydney',name:'Sydney',type:'property',price:300,group:'Brown'},
  {id:'event-right',name:'Event',type:'event'},
  {id:'beijing',name:'Beijing',type:'property',price:300,group:'Brown'},
  {id:'dubai',name:'Dubai',type:'property',price:300,group:'Brown'},
  {id:'auction',name:'Auction',type:'auction'},
  {id:'paris',name:'Paris',type:'property',price:350,group:'Purple'},
  {id:'hong-kong',name:'Hong Kong',type:'property',price:350,group:'Purple'},
  {id:'london',name:'London',type:'property',price:420,group:'Red'},
  {id:'airport',name:'Airport',type:'airport',price:200,group:'Public'},
  {id:'tokyo',name:'Tokyo',type:'property',price:420,group:'Red'},
  {id:'new-york',name:'New York',type:'property',price:450,group:'Red'},
  {id:'start',name:'Start',type:'start'},
  {id:'rio',name:'Rio',type:'property',price:100,group:'Olive'},
  {id:'delhi',name:'Delhi',type:'property',price:100,group:'Olive'},
  {id:'event-left',name:'Event',type:'event'},
  {id:'boat',name:'Boat',type:'station',price:150,group:'Public'},
  {id:'cairo',name:'Cairo',type:'property',price:150,group:'LightBlue'},
  {id:'madrid',name:'Madrid',type:'property',price:150,group:'LightBlue'}
];

export const CHANCE_INDEX = 0;
export const JAIL_INDEX = 7;
export const AUCTION_INDEX = 14;
export const START_INDEX = 21;

// Groupes du fichier de regles. Bangkok n'existe pas sur ce plateau (sa place
// est un Event) : le bleu clair se joue donc a deux, Madrid + Cairo.
// Une couleur par groupe : c'est elle qui dit au joueur ce qui se collectionne.
export const GROUP_COLORS = {
  Pink:'#C63C75', Orange:'#F28C22', DarkGreen:'#2F9B78', Brown:'#A86429', Red:'#F1564A',
  Purple:'#7446C4', LightBlue:'#58B7F2', Olive:'#86BF45', Public:'#9AA4A8'
};
export const GROUP_LABELS = {
  Pink:'Rose', Orange:'Orange', DarkGreen:'Vert foncé', Brown:'Brun', Red:'Rouge',
  Purple:'Violet', LightBlue:'Bleu clair', Olive:'Olive', Public:'Public'
};

// Cases speciales seulement : les villes prennent la couleur de leur groupe.
export const SQUARE_COLORS = {
  start:'#D5D7D8', airport:'#F5C94A', auction:'#F6C62F', jail:'#C7CDD0', railway:'#9AA4A8',
  chance:'#B8BDC1', boat:'#9BA6AA', 'event-left':'#F5C63B', 'event-right':'#F5C63B'
};

export const isOwnable = sq => !!sq && (sq.type === 'property' || sq.type === 'station' || sq.type === 'airport');
export const isPublic = sq => !!sq && (sq.type === 'station' || sq.type === 'airport');

// groupe -> indices des villes. Les proprietes publiques ne forment pas de groupe :
// leur loyer se multiplie par le nombre possede (voir rules.rentFor).
export const GROUPS = BOARD.reduce((acc, sq, i) => {
  if (sq.type === 'property') (acc[sq.group] = acc[sq.group] || []).push(i);
  return acc;
}, {});

export function getSquareColor(square) {
  return SQUARE_COLORS[square.id] || GROUP_COLORS[square.group] || '#D5D7D8';
}

// Encre du prix : celle qui offre le meilleur contraste WCAG reel sur le bandeau.
export const INK_DARK = '#1D242C', INK_LIGHT = '#FFFFFF';

export function relativeLuminance(color) {
  const channels = [1, 3, 5].map(i => {
    const u = parseInt(color.slice(i, i + 2), 16) / 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function readableInk(color) {
  if (!color || color.charAt(0) !== '#' || color.length !== 7) return INK_DARK;
  return contrastRatio(INK_DARK, color) >= contrastRatio(INK_LIGHT, color) ? INK_DARK : INK_LIGHT;
}

export function squareLabelText(square) {
  return ({ start:'DÉPART', jail:'PRISON', event:'ÉVÈNEMENT', chance:'CHANCE', auction:'ÉCHANGE',
            station:'TRANSPORT', airport:'TRANSPORT' })[square.type] || square.type.toUpperCase();
}

// Grille 8x8 : haut gauche->droite, droite haut->bas, bas droite->gauche, gauche bas->haut.
function boardLayout() {
  const layout = [];
  for (let c = 1; c <= 8; c++) layout.push({ r:1, c });
  for (let r = 2; r <= 7; r++) layout.push({ r, c:8 });
  for (let c = 8; c >= 1; c--) layout.push({ r:8, c });
  for (let r = 7; r >= 2; r--) layout.push({ r, c:1 });
  return layout;
}
export const BOARD_LAYOUT = boardLayout();

export function sideOf(index) {
  const { r, c } = BOARD_LAYOUT[index];
  if ((r === 1 || r === 8) && (c === 1 || c === 8)) return 'corner';
  if (r === 1) return 'top';
  if (r === 8) return 'bottom';
  return c === 1 ? 'left' : 'right';
}

// Le Depart est l'index 21, pas 0 : la prime se calcule par franchissement.
export function crossesStart(from, steps) {
  const toStart = (START_INDEX - from + BOARD.length) % BOARD.length;
  return toStart > 0 && toStart <= steps;
}

// Chemin case par case, dans le sens le plus court (certaines cartes font reculer).
export function pawnPath(from, to) {
  const max = BOARD.length;
  const forward = (to - from + max) % max;
  const backward = (from - to + max) % max;
  const path = [];
  if (forward <= backward) { for (let i = 1; i <= forward; i++) path.push((from + i) % max); }
  else { for (let i = 1; i <= backward; i++) path.push((from - i + max) % max); }
  return path;
}

// « de » + prenom avec elision : « Tour d’Alice », « Tour de Bob ».
const VOWEL = /^[aeiouyhàâäéèêëîïôöùûüœæ]/i;
export const que = name => (VOWEL.test(String(name)) ? 'qu’' : 'que ') + name;
export const de = name => (VOWEL.test(String(name)) ? 'd’' : 'de ') + name;
