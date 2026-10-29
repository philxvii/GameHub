// L'Intrus : une grille de signes presque identiques, toucher celui qui est différent.
// Un signe à côté : +1,5 s (calculé par le score).

import { h } from '../ui/dom.js';
import { GRIDS } from '../rounds/intrus.js';

export default function mount(root, { p, submit, progress, sfx }) {
  let k = 0, miss = 0, t0 = performance.now(), last = t0, alive = true;
  const idx = h('b', { text: `1 / ${GRIDS}` });
  const missEl = h('b', { text: '0' });
  const grid = h('div', { class: 'odd-grid', role: 'application', 'aria-label': 'Grille de signes' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Grille ', idx), h('span', {}, 'Ratés ', missEl)), h('div', { class: 'odd-wrap' }, grid));

  function build() {
    const g = p.rounds[k];
    idx.textContent = `${k + 1} / ${GRIDS}`;
    grid.style.gridTemplateColumns = `repeat(${g.n}, 1fr)`;
    grid.style.setProperty('--n', g.n);
    grid.replaceChildren(...Array.from({ length: g.n * g.n }, (_, c) => {
      const b = h('button', { class: 'odd-cell', type: 'button', text: c === g.cell ? g.odd : g.base, 'aria-label': 'Signe' });
      b.addEventListener('pointerdown', e => { e.preventDefault(); press(c, b); });
      return b;
    }));
  }
  function press(c, b) {
    if (!alive) return;
    if (c !== p.rounds[k].cell) {
      miss++; missEl.textContent = String(miss); sfx.bad();
      b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 400);
      return;
    }
    last = performance.now(); sfx.good();
    k++;
    progress(k);
    if (k >= GRIDS) { alive = false; grid.replaceChildren(); submit(payload()); return; }
    build();
  }
  const payload = () => ({ hits: k, miss, ms: Math.round(last - t0) });
  build();
  return { partial: payload, destroy() { alive = false; } };
}
