// Effets d'interface : la virgule d'antenne entre deux séquences, les confettis de la
// finale. Purement visuel : rien ici ne pilote le jeu (la machine à états reste seule
// maîtresse du temps), et tout disparaît en mouvement réduit.

import { reduced } from './dom.js';

const EASE = 'cubic-bezier(.65, 0, .35, 1)';

// Les quatre bandes de l'habillage balaient l'image ; le « 7 » tourne au passage.
export function wipe() {
  const box = document.getElementById('wipe');
  if (!box || reduced() || !box.animate) return;
  [...box.querySelectorAll('i')].forEach((b, k) => b.animate([
    { transform: 'translateX(-105%) skewX(-14deg)' },
    { transform: 'translateX(0) skewX(-14deg)', offset: .45 },
    { transform: 'translateX(0) skewX(-14deg)', offset: .55 },
    { transform: 'translateX(105%) skewX(-14deg)' },
  ], { duration: 1150, delay: k * 60, easing: EASE, fill: 'both' }));
  box.querySelector('.seven').animate([
    { opacity: 0, transform: 'scale(.6) rotate(-60deg)' },
    { opacity: 1, transform: 'scale(1) rotate(0)', offset: .45 },
    { opacity: 1, transform: 'scale(1) rotate(0)', offset: .6 },
    { opacity: 0, transform: 'scale(1.15) rotate(12deg)' },
  ], { duration: 1150, delay: 90, easing: EASE, fill: 'both' });
}

// Une seule pluie, aux couleurs de la chaîne et du vainqueur.
export function confetti(winnerColor) {
  if (reduced()) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['var(--mustard)', 'var(--orange)', 'var(--red)', 'var(--teal)', 'var(--cream)', winnerColor];
  for (let k = 0; k < 70; k++) {
    const i = document.createElement('i');
    i.style.left = `${Math.random() * 100}%`;
    i.style.background = colors[k % colors.length];
    i.style.setProperty('--dx', `${Math.round(Math.random() * 240 - 120)}px`);
    i.style.setProperty('--rr', `${Math.round(Math.random() * 900)}deg`);
    i.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
    i.style.animationDelay = `${Math.random() * 0.5}s`;
    box.append(i);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
}
