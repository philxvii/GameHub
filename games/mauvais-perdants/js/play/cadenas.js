// Le Cadenas : quatre chiffres tous différents, dix essais. Après chaque essai, deux jetons disent combien de chiffres
// sont bien placés (jeton plein) et combien sont bons mais mal placés (jeton creux). Clavier ou pavé à l'écran.

import { h } from '../ui/dom.js';
import { keyHandler } from './index.js';
import { LEN, MAX_TRIES, feedback } from '../rounds/cadenas.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const guesses = [];
  let cur = '', alive = true, t0 = performance.now(), last = t0, over = false;
  const tries = h('b', { text: `0 / ${MAX_TRIES}` });
  const slots = h('div', { class: 'cd-slots', 'aria-label': 'Ton essai' }, Array.from({ length: LEN }, () => h('span', { class: 'cd-slot' })));
  const hist = h('ol', { class: 'cd-hist', 'aria-label': 'Essais précédents' });
  const msg = h('div', { class: 'state-line' });
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
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Essais ', tries), h('span', { text: 'Chiffres tous différents' })), slots, msg, pad, hist);

  function draw() {
    [...slots.children].forEach((s, k) => { s.textContent = cur[k] || ''; s.classList.toggle('on', k === cur.length && !over); s.classList.toggle('full', !!cur[k]); });
    for (const d in keys) keys[d].disabled = cur.includes(d) || over;
    go.disabled = cur.length < LEN || over;
  }
  function type(d) { if (over || cur.length >= LEN || cur.includes(d)) return; cur += d; msg.textContent = ''; draw(); }
  function back() { if (over) return; cur = cur.slice(0, -1); draw(); }
  function validate() {
    if (over || cur.length < LEN) return;
    const g = cur, f = feedback(p.secret, g);
    guesses.push(g); last = performance.now(); cur = '';
    tries.textContent = `${guesses.length} / ${MAX_TRIES}`;
    const row = h('li', { class: 'cd-row' }, h('span', { class: 'cd-guess', text: g.split('').join(' ') }),
      h('span', { class: 'cd-pegs', 'aria-label': `${f.b} bien placé${f.b > 1 ? 's' : ''}, ${f.m} mal placé${f.m > 1 ? 's' : ''}` },
        ...Array.from({ length: f.b }, () => h('i', { class: 'peg b' })), ...Array.from({ length: f.m }, () => h('i', { class: 'peg m' }))),
      h('small', { text: `${f.b} bien · ${f.m} mal` }));
    hist.prepend(row);
    progress(guesses.length);
    if (f.b === LEN) { over = true; sfx.good(); msg.textContent = `Ouvert en ${guesses.length} essai${guesses.length > 1 ? 's' : ''} !`; draw(); setTimeout(() => { if (alive) { alive = false; submit(payload()); } }, 1400); return; }
    if (guesses.length >= MAX_TRIES) { over = true; sfx.bad(); msg.textContent = `Le code était ${p.secret}`; draw(); setTimeout(() => { if (alive) { alive = false; submit(payload()); } }, 1800); return; }
    sfx.tick();
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
