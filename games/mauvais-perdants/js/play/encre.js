// L'Encre : le mot s'affiche dans une autre couleur, on touche la couleur de l'encre.
// Clavier : 1 2 3 4 (rouge, bleu, vert, jaune). Juste +1, faux −1.

import { h } from '../ui/dom.js';
import { keyHandler } from './index.js';
import { COLORS } from '../rounds/encre.js';

export default function mount(root, { p, endAt, now, submit, progress, sfx }) {
  const answers = [];
  let k = 0, net = 0, alive = true;
  const sc = h('b', { text: '0' });
  const word = h('div', { class: 'ink-word', 'aria-live': 'polite' });
  const fb = h('div', { class: 'feedback' });
  const barFill = h('i'), bar = h('div', { class: 'bar' }, barFill);
  const btns = COLORS.map((c, i) => {
    const b = h('button', { class: 'ink-btn', type: 'button', style: { '--k': c.css } }, c.name, h('span', { class: 'kbd', text: String(i + 1) }));
    b.addEventListener('pointerdown', e => { e.preventDefault(); answer(i); });
    return b;
  });
  root.append(h('div', { class: 'play-head' }, h('span', { text: 'Touche la couleur de l’ENCRE' }), h('span', {}, 'Points ', sc)), bar, word, fb, h('div', { class: 'ink-actions' }, btns));
  const total = Math.max(1000, endAt - now());
  barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
  barFill.style.transition = `transform ${total}ms linear`; barFill.style.transform = 'scaleX(0)';
  const draw = () => {
    const it = p.items[k];
    word.textContent = COLORS[it.w].name;
    word.style.color = COLORS[it.c].css;
  };
  function answer(i) {
    if (!alive || k >= p.items.length) return;
    const good = i === p.items[k].c;
    answers.push(i);
    net += good ? 1 : -1;
    fb.className = `feedback ${good ? 'ok' : 'ko'}`;
    fb.textContent = good ? '✓' : `✕ c’était ${COLORS[p.items[k].c].name}`;
    good ? sfx.good() : sfx.bad();
    sc.textContent = String(net);
    k++;
    progress(net, k);
    if (k >= p.items.length) { alive = false; submit(payload()); return; }
    draw();
  }
  const offKey = keyHandler(e => { if (e.repeat) return; const i = '1234'.indexOf(e.key); if (i >= 0) answer(i); });
  const payload = () => ({ a: answers });
  draw();
  return { partial: payload, destroy() { alive = false; offKey(); } };
}
