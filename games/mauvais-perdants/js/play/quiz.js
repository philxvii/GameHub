// La Question : une question, quatre réponses, douze secondes. Pas de seconde chance. Le temps se mesure sur
// l'appareil. Après chaque réponse, la bonne s'allume une seconde, puis la question suivante arrive.

import { h } from '../ui/dom.js';
import { QUESTIONS, LIMIT_MS, MIN_MS } from '../rounds/quiz.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const a = [], t = [];
  let k = 0, t0 = 0, alive = true, locked = false, timer = null, good = 0;
  const idx = h('b', { text: `1 / ${QUESTIONS}` }), score = h('b', { text: '0' });
  const barFill = h('i'), bar = h('div', { class: 'bar' }, barFill);
  const q = h('div', { class: 'qz-q', 'aria-live': 'polite' });
  const list = h('div', { class: 'qz-list', role: 'group', 'aria-label': 'Réponses' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Question ', idx), h('span', {}, 'Bonnes ', score)), bar, q, list);

  function show() {
    const cur = p.qs[k];
    locked = false;
    idx.textContent = `${k + 1} / ${QUESTIONS}`;
    q.textContent = cur.q;
    list.replaceChildren(...cur.c.map((txt, c) => {
      const b = h('button', { class: 'qz-ans', type: 'button' }, h('span', { class: 'qz-key', 'aria-hidden': 'true', text: 'ABCD'[c] }), h('span', { class: 'qz-txt', text: txt }));
      b.addEventListener('pointerdown', e => { e.preventDefault(); pick(c); });
      return b;
    }));
    barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
    barFill.style.transition = `transform ${LIMIT_MS}ms linear`; barFill.style.transform = 'scaleX(0)';
    t0 = performance.now();
    clearTimeout(timer);
    timer = setTimeout(() => pick(-1), LIMIT_MS);
  }
  function pick(c) {
    if (locked || !alive) return;
    locked = true; clearTimeout(timer);
    const cur = p.qs[k], ms = Math.max(MIN_MS, Math.round(performance.now() - t0));
    a.push(c); t.push(Math.min(LIMIT_MS, ms));
    const ok = c === cur.a;
    if (ok) { good++; score.textContent = String(good); sfx.good(); } else sfx.bad();
    [...list.children].forEach((b, x) => { b.disabled = true; if (x === cur.a) b.classList.add('ok'); else if (x === c) b.classList.add('ko'); });
    barFill.style.transition = 'none';
    progress(k + 1, `${k}${c < 0 ? 'z' : c}`);          // sa réponse : visible des autres une fois leur manche finie
    k++;
    setTimeout(() => {
      if (!alive) return;
      if (k >= QUESTIONS) { alive = false; submit(payload()); return; }
      show();
    }, ok ? 800 : 1300);
  }
  const payload = () => ({ a, t });
  show();
  return { partial: payload, destroy() { alive = false; clearTimeout(timer); } };
}
