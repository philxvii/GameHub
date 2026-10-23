// Scenes animees des cartes de regles : peu de texte, on montre. Aucun etat, aucune dependance reseau.
//
// Chaque scene est une boucle de 7 s faite d'acteurs (emoji, etiquettes) positionnes en %
// dans une scene. Un acteur porte UNE animation : apparition (in), deplacement (mv), pop,
// secousse (shake), texte qui monte (fl), halo (flash). Les images cles sont generees ici
// pour tous les instants utiles, le CSS statique ne garde que l'habillage (party.css).

import { BET_KINDS } from './party.js';

const T = [6, 16, 26, 36, 46, 56, 66, 76];   // instants de depart possibles, en % de la boucle

let cssDone = false;
export function ensureAnimCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  let css = '';
  for (const t of T) {
    css += `@keyframes ba-in${t}{0%,${t - 1}%{opacity:0;transform:scale(.4)}${t + 4}%{opacity:1;transform:scale(1.15)}${t + 7}%{opacity:1;transform:none}93%{opacity:1}98%,100%{opacity:0}}`;
    css += `@keyframes ba-mv${t}{0%{opacity:0;transform:none}3%{opacity:1;transform:none}${t}%{opacity:1;transform:none}${t + 14}%,94%{opacity:1;transform:translate(var(--dx,0),var(--dy,0))}98%,100%{opacity:0;transform:translate(var(--dx,0),var(--dy,0))}}`;
    css += `@keyframes ba-pop${t}{0%,${t}%{transform:none}${t + 4}%{transform:scale(1.4)}${t + 9}%,100%{transform:none}}`;
    css += `@keyframes ba-shake${t}{0%,${t}%{transform:none}${t + 2}%{transform:translateX(-6px) rotate(-6deg)}${t + 4}%{transform:translateX(6px) rotate(6deg)}${t + 6}%{transform:translateX(-4px)}${t + 8}%,100%{transform:none}}`;
    css += `@keyframes ba-fl${t}{0%,${t - 1}%{opacity:0;transform:translateY(6px)}${t + 3}%{opacity:1;transform:translateY(0)}${t + 14}%{opacity:1;transform:translateY(-16px)}${t + 20}%,100%{opacity:0;transform:translateY(-22px)}}`;
    css += `@keyframes ba-flash${t}{0%,${t}%{box-shadow:0 0 0 2px var(--ink)}${t + 4}%,${t + 14}%{box-shadow:0 0 0 2px var(--ink),0 0 0 6px var(--brass-hi)}${t + 20}%,100%{box-shadow:0 0 0 2px var(--ink)}}`;
    css += `@keyframes ba-out${t}{0%,${t}%{opacity:1;transform:none}${t + 8}%,100%{opacity:0;transform:scale(.6)}}`;
    css += `@keyframes ba-swap${t}{0%,${t - 1}%{opacity:0}${t + 3}%,${t + 22}%{opacity:1}${t + 26}%,100%{opacity:0}}`;
    css += `.ba.in${t}{animation-name:ba-in${t}}.ba.mv${t}{animation-name:ba-mv${t}}.ba.pop${t}{animation-name:ba-pop${t}}`
      + `.ba.shake${t}{animation-name:ba-shake${t}}.ba.fl${t}{animation-name:ba-fl${t}}.ba.flash${t}{animation-name:ba-flash${t}}`
      + `.ba.out${t}{animation-name:ba-out${t}}.ba.swap${t}{animation-name:ba-swap${t}}`;
  }
  const el = document.createElement('style');
  el.id = 'ba-keyframes';
  el.textContent = css;
  document.head.appendChild(el);
}

// Un acteur : classe d'animation, contenu, position (style).
const A = (cls, html, style = '') => `<span class="ba ${cls}" style="${style}">${html}</span>`;
const tag = (cls, text, style = '', tone = '') => A(cls, `<b class="ba-tag ${tone}">${text}</b>`, style);
const tile = (cls, label, style = '', color = '#c9b993') => A(cls, `<i class="ba-tile" style="--c:${color}">${label}</i>`, style);

// Le pari : mise sur un autre joueur, le des roule, le pari est regle.
function betScene() {
  const k = BET_KINDS;
  return [
    tag('in6', 'Tour de Léa', 'left:6%;top:6%'),
    A('in6', '♟️', 'left:10%;top:30%;font-size:2.2rem'),
    A('in36', '🎲', 'left:30%;top:30%;font-size:2rem'),
    tile('flash56', '🏠', 'left:62%;top:30%', '#d98f7f'),
    A('mv46', '♟️', 'left:10%;top:30%;font-size:2.2rem;--dx:58%;--dy:0'),
    tag('in16', `💸 ${k.rent.short} ×${k.rent.odds}`, 'left:8%;top:62%', 'on-rent'),
    tag('in16', `⛓️ ${k.jail.short} ×${k.jail.odds}`, 'left:38%;top:62%'),
    tag('in16', `🎲 ${k.six.short} ×${k.six.odds}`, 'left:68%;top:62%'),
    A('mv26', '🪙', 'left:20%;top:84%;font-size:1.5rem;--dx:-8%;--dy:-30px'),
    A('fl56', '<b class="ba-gain">+20 $</b>', 'left:20%;top:50%'),
  ].join('');
}

const SCENES = {
  goal: p => [
    '<i class="ba-track"><i class="ba-fill"></i></i>',
    A('mv6', '🪙', 'left:6%;top:22%;font-size:1.7rem;--dx:0;--dy:34px'),
    A('in16', '💵', 'left:30%;top:14%;font-size:1.7rem'),
    A('in36', '🏙️', 'left:52%;top:12%;font-size:1.7rem'),
    A('pop66', '🏆', 'left:84%;top:22%;font-size:2.4rem'),
    tag('in46', p && p.n ? `${p.n} $` : '🏁', 'left:70%;top:62%', 'gold'),
  ].join(''),
  cities: () => [
    tile('in6', 'Paris', 'left:6%;top:48%', '#6f4ab2'), tile('in6', 'Rome', 'left:36%;top:48%', '#c93d35'), tile('in6', 'Tokyo', 'left:66%;top:48%', '#2f8f5a'),
    A('mv6', '♟️', 'left:8%;top:14%;font-size:2.2rem;--dx:30%;--dy:0'),
    tag('in26', '🏙️ Acheter', 'left:28%;top:2%'),
    A('in36', '🚩', 'left:46%;top:30%;font-size:1.6rem'),
    A('mv46', '🧍', 'left:70%;top:14%;font-size:2rem;--dx:-24%;--dy:0'),
    A('mv56', '💵', 'left:50%;top:18%;font-size:1.6rem;--dx:20%;--dy:0'),
    A('fl66', '<b class="ba-gain">+ loyer</b>', 'left:60%;top:6%'),
  ].join(''),
  squares: () => [
    tile('flash6', '🃏<small>Chance</small>', 'left:4%;top:30%', '#d7a23a'),
    tile('flash26', '🎪<small>Event</small>', 'left:27%;top:30%', '#3f87b8'),
    tile('flash46', '⛓️<small>Prison</small>', 'left:50%;top:30%', '#8b8776'),
    tile('flash66', '🔨<small>Auction</small>', 'left:73%;top:30%', '#b23a2e'),
    A('mv6', '♟️', 'left:10%;top:6%;font-size:1.8rem;--dx:0;--dy:0'),
  ].join(''),
  betting: betScene,
  eventMinigames: () => [
    A('pop6', '⏱️', 'left:42%;top:6%;font-size:2.2rem'),
    A('shake16', '🧍', 'left:8%;top:56%;font-size:2rem'), A('shake26', '🧍', 'left:30%;top:56%;font-size:2rem'),
    A('shake36', '🧍', 'left:52%;top:56%;font-size:2rem'), A('in46', '😵', 'left:74%;top:56%;font-size:2rem'),
    tag('in16', '⚡ Tape vite !', 'left:30%;top:30%'),
    A('fl56', '<b class="ba-loss">− 100 $</b>', 'left:70%;top:34%'),
  ].join(''),
  duel: () => [
    A('mv6', '🧍', 'left:8%;top:40%;font-size:2.4rem;--dx:24%;--dy:0'),
    A('mv6', '🧍', 'left:80%;top:40%;font-size:2.4rem;--dx:-24%;--dy:0'),
    A('pop36', '⚔️', 'left:44%;top:12%;font-size:2.6rem'),
    A('mv46', '💵', 'left:66%;top:44%;font-size:1.6rem;--dx:-44%;--dy:0'),
    A('fl56', '<b class="ba-gain">+ mise</b>', 'left:20%;top:20%'),
  ].join(''),
  hostDeals: () => [
    A('in6', '🎙️', 'left:8%;top:10%;font-size:2.6rem'),
    tag('in16', '« Fais un 6 ! »', 'left:30%;top:14%'),
    tag('in26', '✅ Oui', 'left:28%;top:56%', 'ok'), tag('in26', '❌ Non', 'left:56%;top:56%'),
    A('shake46', '🎲', 'left:80%;top:48%;font-size:2rem'),
    A('fl56', '<b class="ba-gain">+ prime</b>', 'left:74%;top:22%'),
  ].join(''),
  moneyTime: () => [
    A('in6', '⏰', 'left:8%;top:8%;font-size:2.4rem'),
    tile('out36', '<b>50 $</b>', 'left:34%;top:30%', '#c93d35'),
    tile('swap36', '<b>100 $</b>', 'left:34%;top:30%', '#c93d35'),
    tag('in36', 'Loyers ×2', 'left:60%;top:20%', 'gold'),
  ].join(''),
  marketCrash: () => [
    tile('out36', '<b>50 $</b>', 'left:10%;top:30%', '#2f8f5a'), tile('swap6', '<b>100 $</b>', 'left:10%;top:30%', '#2f8f5a'),
    A('in6', '📈', 'left:50%;top:16%;font-size:2.4rem'),
    tile('swap56', '<b>25 $</b>', 'left:10%;top:30%', '#c93d35'),
    A('in56', '📉', 'left:72%;top:16%;font-size:2.4rem'),
    tag('in6', 'Bulle ×2', 'left:44%;top:62%', 'ok'), tag('in56', 'Krach ÷2', 'left:68%;top:62%'),
  ].join(''),
  blueShell: () => [
    A('in6', '👑', 'left:74%;top:6%;font-size:1.6rem'), A('shake46', '🧍', 'left:74%;top:34%;font-size:2.4rem'),
    A('mv16', '🔵', 'left:8%;top:44%;font-size:2rem;--dx:60%;--dy:-18px'),
    A('pop46', '💥', 'left:64%;top:22%;font-size:2.4rem'),
    A('fl56', '<b class="ba-loss">− 15 %</b>', 'left:76%;top:12%'),
  ].join(''),
  testament: () => [
    A('out26', '🧍', 'left:10%;top:40%;font-size:2.4rem'), A('in26', '💀', 'left:10%;top:40%;font-size:2.4rem'),
    A('mv36', '📜', 'left:22%;top:44%;font-size:2rem;--dx:36%;--dy:-8px'),
    A('in56', '🧍', 'left:74%;top:40%;font-size:2.4rem'), A('in56', '🏙️', 'left:86%;top:18%;font-size:1.6rem'),
    tag('in46', '→ héritier', 'left:46%;top:10%'),
  ].join(''),
  ghost: () => [
    A('mv6', '👻', 'left:8%;top:14%;font-size:2.4rem;--dx:44%;--dy:0'),
    tile('flash26', '👻', 'left:52%;top:46%', '#8b8776'),
    A('mv36', '🧍', 'left:80%;top:46%;font-size:2.2rem;--dx:-26%;--dy:0'),
    A('shake56', '😱', 'left:54%;top:16%;font-size:2rem'),
    A('fl56', '<b class="ba-loss">− 50 $</b>', 'left:64%;top:8%'),
  ].join(''),
  secretBonuses: () => [
    A('in6', '✉️', 'left:10%;top:36%;font-size:2.4rem'), A('in6', '✉️', 'left:40%;top:36%;font-size:2.4rem'), A('in6', '✉️', 'left:70%;top:36%;font-size:2.4rem'),
    A('swap46', '🏅', 'left:10%;top:36%;font-size:2.4rem'), A('swap56', '🏅', 'left:40%;top:36%;font-size:2.4rem'), A('swap66', '🏅', 'left:70%;top:36%;font-size:2.4rem'),
    tag('in46', '?', 'left:44%;top:6%', 'gold'),
  ].join(''),
  extendedAuctions: () => [
    A('shake16', '🔨', 'left:8%;top:12%;font-size:2.4rem'),
    tag('in6', '⏳ 3 s', 'left:34%;top:12%'),
    tag('in26', '🙋 +20 $', 'left:30%;top:52%', 'ok'),
    A('pop36', '<b class="ba-gain">+5 s !</b>', 'left:64%;top:16%'),
    tag('in56', '✋ Je passe', 'left:62%;top:56%'),
  ].join(''),
  reactions: () => [
    A('in6', '🧍', 'left:70%;top:46%;font-size:2.4rem'),
    A('mv6', '🍅', 'left:8%;top:66%;font-size:1.8rem;--dx:62%;--dy:-30px'),
    A('mv26', '🪙', 'left:8%;top:30%;font-size:1.8rem;--dx:62%;--dy:6px'),
    A('mv46', '👑', 'left:8%;top:10%;font-size:1.8rem;--dx:62%;--dy:30px'),
    A('mv66', '🤡', 'left:8%;top:50%;font-size:1.8rem;--dx:62%;--dy:-4px'),
  ].join(''),
};

// Une phrase par carte ; le detail complet reste dans « Details ». null = on garde la 1re ligne.
const CAPS = {
  cities: 'Tu tombes sur une ville : achète-la. Les autres te paient un loyer.',
  squares: 'Chance, Event, Prison, Auction : chaque case a son effet.',
  betting: 'Parie sur ce qui arrive à un autre joueur. Bien vu : tu gagnes. Raté : ta mise est perdue.',
  eventMinigames: 'Mini-jeu pour toute la table : le plus lent paie.',
  duel: 'Même case qu’un autre pion : duel de réflexe, le perdant paie.',
  hostDeals: 'Le présentateur te propose un pacte : réussis-le pour une prime.',
  moneyTime: 'Fin de partie : tous les loyers sont doublés.',
  marketCrash: 'Un groupe de villes flambe (×2) ou s’effondre (÷2).',
  blueShell: 'Le premier est visé : contrôle fiscal ou squat.',
  testament: 'En faillite, tu choisis qui hérite de tes villes.',
  ghost: 'Éliminé, tu hantes une case : le prochain qui s’y arrête paie.',
  secretBonuses: 'Trois primes secrètes, révélées à la fin.',
  extendedAuctions: 'Offre à la dernière seconde : +5 s. Ou passe.',
  reactions: 'Lance une tomate ou une couronne, pour le fun.',
};

export function sceneHTML(card) {
  const f = SCENES[card.key];
  return f ? `<div class="ba-stage" aria-hidden="true">${f(card)}</div>` : '';
}
export const captionOf = card => CAPS[card.key] || card.lines[0] || '';
