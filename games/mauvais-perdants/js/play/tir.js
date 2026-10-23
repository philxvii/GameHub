// Stand de tir : arène carrée, positions relatives communes. Le chrono part au premier
// tir réussi (cible 1), s'arrête à la 20e. Tir à côté : +0,3 s (calculé par le score).

import { h } from '../ui/dom.js';
import { TARGETS } from '../rounds/tir.js';

export default function mount(root, { p, submit, progress, sfx }) {
  let k = 0, miss = 0, t0 = 0, last = 0, alive = true;
  const count = h('b', { text: `0 / ${TARGETS}` });
  const missEl = h('b', { text: '0' });
  const arena = h('div', { class: 'arena', role: 'application', 'aria-label': 'Arène de tir' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Cibles ', count), h('span', {}, 'Ratés ', missEl)), h('div', { class: 'arena-wrap' }, arena));
  const target = h('button', { class: 'target first', type: 'button', 'aria-label': 'Cible' });
  arena.append(target);
  function place() {
    const t = p.targets[k];
    const size = p.radius * 2 * 100;
    Object.assign(target.style, { left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${size}%`, height: `${size}%` });
    target.classList.toggle('first', k === 0);
    target.classList.remove('hitme'); void target.offsetWidth;
  }
  target.addEventListener('pointerdown', e => {
    if (!alive) return;
    e.preventDefault(); e.stopPropagation();
    const t = e.timeStamp || performance.now();
    if (k === 0) t0 = t;
    last = t;
    k++;
    sfx.good();
    count.textContent = `${k} / ${TARGETS}`;
    progress(k);
    if (k >= TARGETS) { alive = false; target.remove(); submit({ hits: k, miss, ms: Math.round(last - t0) }); return; }
    place();
  });
  arena.addEventListener('pointerdown', e => {
    if (!alive || k === 0) return;          // avant la première cible, rien ne compte
    miss++;
    missEl.textContent = String(miss);
    const r = arena.getBoundingClientRect();
    const dot = h('span', { class: 'miss-dot', style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } });
    arena.append(dot);
    setTimeout(() => dot.remove(), 520);
  });
  place();
  return {
    partial: () => ({ hits: k, miss, ms: k ? Math.round(last - t0) : 0 }),
    destroy() { alive = false; },
  };
}
