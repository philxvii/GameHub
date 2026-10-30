// Le Cadenas : quatre chiffres tous différents, dix essais. Chaque essai colore tes chiffres, comme au Wordle :
// vert = bien placé, jaune = dans le code mais mal placé, gris = pas dans le code. Le pavé retient ce que tu sais déjà.

import { h } from '../ui/dom.js';
import { keyHandler } from './index.js';
import { LEN, MAX_TRIES, feedback, marks } from '../rounds/cadenas.js';

const NAME = { b: 'bien placé', m: 'mal placé', x: 'pas dans le code' };
const RANK = { x: 1, m: 2, b: 3 };

export default function mount(root, { p, submit, progress, sfx }) {
  const guesses = [];
  const known = {};                                   // chiffre -> meilleur état connu
  let cur = '', alive = true, t0 = performance.now(), last = t0, over = false;
  const tries = h('div', { class: 'cd-pips', 'aria-label': `Essais restants : ${MAX_TRIES}` }, Array.from({ length: MAX_TRIES }, () => h('i')));
  const slots = h('div', { class: 'cd-slots', 'aria-label': 'Ton essai' }, Array.from({ length: LEN }, () => h('span', { class: 'cd-slot' })));
  const hist = h('ol', { class: 'cd-hist', 'aria-label': 'Essais précédents' });
  const msg = h('div', { class: 'state-line' });
  const legend = h('div', { class: 'cd-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'cd-tile b' }), 'bien placé'), h('span', {}, h('i', { class: 'cd-tile m' }), 'mal placé'), h('span', {}, h('i', { class: 'cd-tile x' }), 'pas dans le code'));
  const pad = h('div', { class: 'cd-pad', role: 'group', 'aria-label': 'Pavé numérique' });
  const keys = {};
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach(d => {
    const b = h('button', { class: 'cd-key', type: 'button', text: String(d) });
    b.addEventListener('pointerdown', e => { e.preventDefault(); type(String(d)); });
    keys[d] = b; pad.append(b);
  });
  const del = h('button', { class: 'cd-key cd-act', type: 'button', text: 'Effacer' });
  const go = h('button', { class: 'cd-key cd-go', type: 'button', text: 'Essayer' });
  del.addEventListener('pointerdown', e => { e.preventDefault(); back(); });
  go.addEventListener('pointerdown', e => { e.preventDefault(); validate(); });
  pad.append(del, go);
  root.append(h('div', { class: 'play-head' }, h('span', { text: 'Devine le code à 4 chiffres' }), tries), legend, h('div', { class: 'cd-wrap' }, h('div', { class: 'cd-main' }, slots, msg, pad), hist));

  function draw() {
    if (!over) [...slots.children].forEach((s, k) => { s.textContent = cur[k] || ''; s.classList.toggle('on', k === cur.length && !over); s.classList.toggle('full', !!cur[k]); });
    for (const d in keys) { keys[d].disabled = cur.includes(d) || over; keys[d].dataset.k = known[d] || ''; }
    go.disabled = cur.length < LEN || over;
    [...tries.children].forEach((x, k) => x.classList.toggle('on', k < guesses.length));
    tries.setAttribute('aria-label', `Essais restants : ${MAX_TRIES - guesses.length}`);
  }
  // Fin de manche : le code se dévoile en grand, tuile par tuile, à la place de la saisie.
  function reveal(won) {
    over = true;
    slots.className = 'cd-slots cd-final';
    slots.replaceChildren(...[...p.secret].map((c, k) => h('span', { class: `cd-tile big ${won ? 'b' : 'x'}`, style: { animationDelay: `${k * 120}ms` }, text: c })));
    slots.setAttribute('aria-label', `Le code était ${p.secret}`);
  }
  function type(d) { if (over || cur.length >= LEN || cur.includes(d)) return; cur += d; msg.textContent = ''; draw(); }
  function back() { if (over) return; cur = cur.slice(0, -1); draw(); }
  function validate() {
    if (over || cur.length < LEN) return;
    const g = cur, mk = marks(p.secret, g), f = feedback(p.secret, g);
    guesses.push(g); last = performance.now(); cur = '';
    mk.forEach((m, k) => { if (!known[g[k]] || RANK[m] > RANK[known[g[k]]]) known[g[k]] = m; });
    const row = h('li', { class: 'cd-row', 'aria-label': g.split('').map((c, k) => `${c} ${NAME[mk[k]]}`).join(', ') },
      ...[...g].map((c, k) => h('span', { class: `cd-tile big ${mk[k]}`, style: { animationDelay: `${k * 90}ms` }, text: c })));
    hist.prepend(row);
    progress(guesses.length, `${(guesses.length - 1) % 10}${g}`);   // son dernier essai
    if (f.b === LEN) { reveal(true); sfx.good(); msg.textContent = `Ouvert en ${guesses.length} essai${guesses.length > 1 ? 's' : ''} !`; draw(); setTimeout(() => { if (alive) { alive = false; submit(payload()); } }, 1500); return; }
    if (guesses.length >= MAX_TRIES) { reveal(false); sfx.bad(); msg.textContent = `Raté : voici le code.`; draw(); setTimeout(() => { if (alive) { alive = false; submit(payload()); } }, 2000); return; }
    sfx.tick();
    msg.textContent = f.b ? `${f.b} chiffre${f.b > 1 ? 's' : ''} à la bonne place. Encore ${MAX_TRIES - guesses.length} essai${MAX_TRIES - guesses.length > 1 ? 's' : ''}.` : `Aucun à la bonne place. Encore ${MAX_TRIES - guesses.length} essai${MAX_TRIES - guesses.length > 1 ? 's' : ''}.`;
    draw();
  }
  const offKey = keyHandler(e => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); type(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') { e.preventDefault(); validate(); }
  });
  const payload = () => ({ g: guesses, ms: Math.round(last - t0) });
  draw();
  return { partial: payload, destroy() { alive = false; offKey(); } };
}
