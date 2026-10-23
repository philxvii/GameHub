// Chemin : grille 3×3. Démonstration (saisie verrouillée), puis reproduction.
// Clavier : pavé numérique (7 8 9 / 4 5 6 / 1 2 3).

import { h } from '../ui/dom.js';
import { wait, keyHandler } from './index.js';
import { MAX_LEVEL } from '../rounds/chemin.js';

const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

export default function mount(root, { p, submit, progress, sfx }) {
  const inputs = [];
  let level = 1, typing = false, cur = [], t0 = performance.now(), lastOk = 0, alive = true;
  const lvl = h('b', { text: '1' });
  const line = h('div', { class: 'state-line' });
  const grid = h('div', { class: 'grid locked', style: { gridTemplateColumns: 'repeat(3, 1fr)' } });
  const cells = Array.from({ length: 9 }, (_, c) => {
    const b = h('button', { class: 'cell', type: 'button', 'aria-label': `Case ${c + 1}`, disabled: true });
    b.addEventListener('pointerdown', e => { e.preventDefault(); press(c); });
    grid.append(b);
    return b;
  });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Niveau ', lvl), h('span', { text: 'Une erreur et c’est fini' })), line, h('div', { class: 'grid-wrap' }, grid));
  const lock = on => { grid.classList.toggle('locked', on); cells.forEach(b => { b.disabled = on; }); };

  async function demo() {
    typing = false; lock(true); cur = [];
    lvl.textContent = String(level);
    line.textContent = 'Regarde…'; line.classList.remove('go');
    await wait(500);
    for (let k = 0; k < level && alive; k++) {
      const b = cells[p.seq[k]];
      b.classList.add('lit'); sfx.tick();
      await wait(p.flash);
      b.classList.remove('lit');
      await wait(p.gap);
    }
    if (!alive) return;
    line.textContent = 'À toi !'; line.classList.add('go');
    typing = true; lock(false);
  }
  function press(c) {
    if (!alive || !typing) return;
    cur.push(c);
    const k = cur.length - 1;
    const b = cells[c];
    if (c !== p.seq[k]) {
      b.classList.add('bad'); sfx.bad();
      inputs[level - 1] = cur.slice();
      return end();
    }
    b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 160);
    if (cur.length === level) {
      inputs[level - 1] = cur.slice();
      lastOk = performance.now() - t0;
      progress(level);
      sfx.good();
      typing = false; lock(true);
      if (level >= MAX_LEVEL) return end();
      level++;
      setTimeout(demo, 450);
    }
  }
  function end() {
    alive = false; typing = false; lock(true);
    line.textContent = `Terminé : niveau ${inputs.filter((x, k) => x.length === k + 1).length}`;
    setTimeout(() => submit(payload()), 700);
  }
  const payload = () => ({ in: inputs.map(x => x || []), ms: Math.round(lastOk) });
  const offKey = keyHandler(e => { if (NUMPAD[e.key] !== undefined) press(NUMPAD[e.key]); });
  demo();
  return { partial: payload, destroy() { alive = false; offKey(); } };
}
