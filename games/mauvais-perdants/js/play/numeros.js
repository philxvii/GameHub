// Numéros : grille 6×6 fixe. Numéros visibles jusqu'au premier toucher, puis masqués.

import { h } from '../ui/dom.js';
import { lives as livesEl, wait } from './index.js';
import { layout, COLS, CELLS, START, LIVES, MAX_N } from '../rounds/numeros.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const attempts = [];
  let n = START, lives = LIVES, a = 0, pos = [], clicks = [], hidden = false, busy = true, t0 = performance.now(), lastOk = 0, alive = true, best = 0;
  const lvl = h('b', { text: String(n) });
  const lifeBox = h('span');
  const line = h('div', { class: 'state-line' });
  const grid = h('div', { class: 'grid', style: { gridTemplateColumns: `repeat(${COLS}, 1fr)` } });
  const cells = Array.from({ length: CELLS }, (_, c) => {
    const b = h('button', { class: 'cell gone', type: 'button', 'aria-label': `Case ${c + 1}` });
    b.addEventListener('pointerdown', e => { e.preventDefault(); press(c); });
    grid.append(b);
    return b;
  });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Numéros : ', lvl), lifeBox), line, h('div', { class: 'grid-wrap' }, grid));
  const drawLives = () => lifeBox.replaceChildren(livesEl(lives, LIVES));

  function setup() {
    pos = layout(p.seed, p.i, n, a);
    clicks = []; hidden = false; busy = false;
    lvl.textContent = String(n);
    drawLives();
    cells.forEach(b => { b.className = 'cell gone'; b.textContent = ''; });
    pos.forEach((c, k) => { cells[c].className = 'cell num'; cells[c].textContent = String(k + 1); });
    line.textContent = 'Repère les numéros, puis touche le 1';
  }
  async function press(c) {
    if (!alive || busy) return;
    const k = clicks.length;
    clicks.push(c);
    if (!hidden) {
      hidden = true;
      pos.forEach(x => { cells[x].classList.add('hid'); });
      line.textContent = 'Dans l’ordre !';
    }
    if (pos[k] !== c) {
      busy = true;
      cells[c].className = 'cell bad'; cells[c].textContent = '';
      pos.forEach((x, j) => { cells[x].className = j < k ? 'cell good' : 'cell num'; cells[x].textContent = String(j + 1); });
      sfx.bad();
      attempts.push({ c: clicks.slice() });
      a++; lives--;
      drawLives();
      if (lives <= 0) return end();
      line.textContent = `Raté. ${lives} vie${lives > 1 ? 's' : ''}.`;
      await wait(1300);
      if (alive) setup();
      return;
    }
    cells[c].className = 'cell gone'; cells[c].textContent = '';
    if (clicks.length === n) {
      busy = true;
      attempts.push({ c: clicks.slice() });
      a++; best = n; lastOk = performance.now() - t0;
      progress(best);
      sfx.good();
      if (n >= MAX_N) return end();
      n++;
      line.textContent = 'Bien. Un de plus.';
      await wait(600);
      if (alive) setup();
    }
  }
  function end() {
    alive = false;
    line.textContent = best ? `Terminé : ${best} numéros` : 'Terminé';
    setTimeout(() => submit(payload()), 800);
  }
  const payload = () => ({ at: attempts, ms: Math.round(lastOk) });
  setup();
  return { partial: payload, destroy() { alive = false; } };
}
