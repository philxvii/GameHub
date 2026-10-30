// Dans l'ordre : cinq éléments en désordre. On les touche du plus petit au plus grand ; au cinquième, la bonne réponse
// s'affiche avec les vraies valeurs. Six séries.

import { h } from '../ui/dom.js';
import { SETS, SIZE } from '../rounds/ordre.js';

const fmt = v => (Number.isInteger(v) ? v.toLocaleString('fr-FR') : String(v).replace('.', ','));

export default function mount(root, { p, submit, progress, sfx }) {
  const rows = [];
  let k = 0, order = [], alive = true, locked = false, t0 = performance.now(), last = t0;
  const idx = h('b', { text: `1 / ${SETS}` }), pts = h('b', { text: '0' });
  const q = h('div', { class: 'od-q', 'aria-live': 'polite' }), unit = h('small', { class: 'od-unit' });
  const list = h('div', { class: 'od-list', role: 'group', 'aria-label': 'Éléments à classer' });
  const undo = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Défaire' });
  const line = h('div', { class: 'state-line' });
  undo.addEventListener('click', () => { if (locked || !order.length) return; order.pop(); paint(); });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Série ', idx), h('span', {}, 'Bien placés ', pts)), h('div', { class: 'od-head' }, q, unit), list, line, h('div', { class: 'answer-row ct-actions' }, undo));

  let good = 0;
  function build() {
    const s = p.sets[k];
    idx.textContent = `${k + 1} / ${SETS}`;
    q.textContent = s.q; unit.textContent = `Repère : ${s.unit}`;
    order = []; locked = false;
    list.replaceChildren(...s.items.map((it, x) => {
      const b = h('button', { class: 'od-item', type: 'button' }, h('span', { class: 'od-rank', 'aria-hidden': 'true' }), h('span', { class: 'od-name', text: it.n }), h('span', { class: 'od-val' }));
      b.addEventListener('pointerdown', e => { e.preventDefault(); choose(x); });
      return b;
    }));
    paint();
  }
  function paint() {
    [...list.children].forEach((b, x) => {
      const r = order.indexOf(x);
      b.classList.toggle('chosen', r >= 0);
      b.querySelector('.od-rank').textContent = r >= 0 ? String(r + 1) : '';
    });
    undo.disabled = locked || !order.length;
    line.textContent = locked ? line.textContent : order.length ? `${order.length} sur ${SIZE} : continue dans le même sens.` : 'Touche d’abord le plus petit (ou le plus ancien).';
  }
  function choose(x) {
    if (locked || !alive || order.includes(x)) return;
    order.push(x); sfx.tick(); last = performance.now(); paint();
    if (order.length === SIZE) reveal();
  }
  function reveal() {
    locked = true;
    const s = p.sets[k];
    rows.push(order.slice());
    let ok = 0;
    [...list.children].forEach((b, x) => {
      b.querySelector('.od-val').textContent = fmt(s.items[x].v);
      const place = s.truth.indexOf(x), mine = order.indexOf(x);
      b.classList.add(place === mine ? 'ok' : 'ko');
      b.querySelector('.od-rank').textContent = String(place + 1);
      if (place === mine) ok++;
    });
    good += ok; pts.textContent = String(good);
    line.textContent = ok === SIZE ? 'Dans l’ordre, parfait !' : `${ok} sur ${SIZE} à la bonne place. Le bon ordre est affiché.`;
    ok >= 3 ? sfx.good() : sfx.bad();
    progress(k + 1);
    k++;
    setTimeout(() => {
      if (!alive) return;
      if (k >= SETS) { alive = false; submit(payload()); return; }
      build();
    }, ok === SIZE ? 1500 : 2600);
  }
  const payload = () => ({ o: rows, ms: Math.round(last - t0) });
  build();
  return { partial: payload, destroy() { alive = false; } };
}
