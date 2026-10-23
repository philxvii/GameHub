// Damier : motif affiché d'un coup, puis masqué ; retrouver toutes les cases.
// Le nombre d'erreurs permises (3 par niveau) et les vies (3) sont affichés.

import { h } from '../ui/dom.js';
import { lives as livesEl, wait } from './index.js';
import { pattern, sizeOf, countOf, showMs, LIVES, MISTAKES, MAX_LEVEL } from '../rounds/damier.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const attempts = [];
  let level = 1, lives = LIVES, a = 0, target = new Set(), found = new Set(), wrong = new Set(), clicks = [], busy = true, t0 = performance.now(), lastOk = 0, alive = true, best = 0, cells = [];
  const lvl = h('b', { text: '1' });
  const errs = h('b', { text: `0/${MISTAKES}` });
  const lifeBox = h('span');
  const line = h('div', { class: 'state-line' });
  const grid = h('div', { class: 'grid locked' });
  const wrap = h('div', { class: 'grid-wrap' }, grid);
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Niveau ', lvl, ' · erreurs ', errs), lifeBox), line, wrap);

  function build(size) {
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    cells = Array.from({ length: size * size }, (_, c) => {
      const b = h('button', { class: 'cell', type: 'button', 'aria-label': `Case ${c + 1}`, disabled: true });
      b.addEventListener('pointerdown', e => { e.preventDefault(); press(c); });
      grid.append(b);
      return b;
    });
  }
  async function round() {
    busy = true;
    const size = sizeOf(level);
    build(size);
    grid.classList.add('locked');
    const pat = pattern(p.seed, p.i, level, a);
    target = new Set(pat); found = new Set(); wrong = new Set(); clicks = [];
    lvl.textContent = String(level);
    errs.textContent = `0/${MISTAKES}`;
    lifeBox.replaceChildren(livesEl(lives, LIVES));
    line.textContent = `Retiens ${countOf(level)} cases…`; line.classList.remove('go');
    await wait(350);
    pat.forEach(c => cells[c].classList.add('lit'));
    await wait(showMs(level));
    if (!alive) return;
    pat.forEach(c => cells[c].classList.remove('lit'));
    line.textContent = 'Retrouve-les !'; line.classList.add('go');
    grid.classList.remove('locked');
    cells.forEach(b => { b.disabled = false; });
    busy = false;
  }
  async function press(c) {
    if (!alive || busy) return;
    if (found.has(c) || wrong.has(c)) return;          // recliquer ne compte pas
    clicks.push(c);
    if (target.has(c)) { found.add(c); cells[c].classList.add('good'); sfx.good(); }
    else { wrong.add(c); cells[c].classList.add('bad'); sfx.bad(); errs.textContent = `${wrong.size}/${MISTAKES}`; }
    if (wrong.size >= MISTAKES) {
      busy = true;
      attempts.push({ c: clicks.slice() }); a++; lives--;
      target.forEach(x => { if (!found.has(x)) cells[x].classList.add('lit'); });
      lifeBox.replaceChildren(livesEl(lives, LIVES));
      if (lives <= 0) return end();
      line.textContent = `Raté. ${lives} vie${lives > 1 ? 's' : ''}.`;
      await wait(1200);
      if (alive) round();
    } else if (found.size === target.size) {
      busy = true;
      attempts.push({ c: clicks.slice() }); a++;
      best = level; lastOk = performance.now() - t0;
      progress(best);
      if (level >= MAX_LEVEL) return end();
      level++;
      line.textContent = 'Parfait.';
      await wait(550);
      if (alive) round();
    }
  }
  function end() {
    alive = false;
    line.textContent = `Terminé : niveau ${best}`;
    setTimeout(() => submit(payload()), 800);
  }
  const payload = () => ({ at: attempts, ms: Math.round(lastOk) });
  round();
  return { partial: payload, destroy() { alive = false; } };
}
