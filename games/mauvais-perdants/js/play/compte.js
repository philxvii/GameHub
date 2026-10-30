// Le Compte est bon : six nombres, un total. Touche un nombre, une opération, un second nombre : ils fusionnent.
// « Défaire » annule la dernière opération. On peut s'arrêter près du but avec « Je m'arrête là ».

import { h } from '../ui/dom.js';
import { OPS, MAX_STEPS, apply } from '../rounds/compte.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const steps = [];
  let list = p.nums.slice(), a = -1, op = null, alive = true, t0 = performance.now(), last = t0, done = false;
  const best = h('b'), tiles = h('div', { class: 'ct-tiles', role: 'group', 'aria-label': 'Nombres disponibles' });
  const opsEl = h('div', { class: 'ct-ops', role: 'group', 'aria-label': 'Opérations' });
  const line = h('div', { class: 'state-line' });
  const target = h('div', { class: 'ct-target', 'aria-label': 'Total à atteindre' }, h('small', { text: 'Le total' }), h('b', { text: String(p.target) }));
  const undo = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Défaire' });
  const stop = h('button', { class: 'btn btn-main', type: 'button', text: 'Je m’arrête là' });
  undo.addEventListener('click', () => { if (done) return; steps.pop(); rebuild(); });
  stop.addEventListener('click', () => finish());
  const opBtn = {};
  OPS.forEach(o => { const b = h('button', { class: 'ct-op', type: 'button', text: o, 'aria-label': { '+': 'plus', '−': 'moins', '×': 'fois', '÷': 'divisé par' }[o] }); b.addEventListener('click', () => pickOp(o)); opBtn[o] = b; opsEl.append(b); });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Écart : ', best), h('span', { text: `${MAX_STEPS} opérations au plus` })), target, tiles, opsEl, line, h('div', { class: 'answer-row ct-actions' }, undo, stop));

  function rebuild() {
    list = p.nums.slice();
    for (const [i, j, o] of steps) { const v = apply(list[i], list[j], o); list = list.filter((_, k) => k !== i && k !== j).concat(v); }
    a = -1; op = null; draw();
  }
  const gap = () => Math.min(...list.map(v => Math.abs(v - p.target)));
  function draw() {
    best.textContent = String(gap());
    tiles.replaceChildren(...list.map((v, k) => {
      const b = h('button', { class: `ct-tile${k === a ? ' sel' : ''}${v === p.target ? ' hit' : ''}`, type: 'button', text: String(v) });
      b.addEventListener('pointerdown', e => { e.preventDefault(); pickTile(k); });
      return b;
    }));
    OPS.forEach(o => { opBtn[o].classList.toggle('sel', o === op); opBtn[o].disabled = a < 0 || done; });
    undo.disabled = !steps.length || done;
    line.textContent = done ? '' : a < 0 ? 'Touche un nombre.' : !op ? 'Choisis une opération.' : 'Touche le second nombre.';
  }
  function pickTile(k) {
    if (done || !alive) return;
    if (a < 0 || !op) { a = a === k ? -1 : k; draw(); return; }
    if (k === a) { a = -1; op = null; draw(); return; }
    const v = apply(list[a], list[k], op);
    if (v === null) { sfx.bad(); line.textContent = op === '÷' ? 'Division impossible : il faut un résultat entier.' : 'Pas de nombre négatif.'; op = null; draw(); line.textContent = 'Opération impossible, choisis-en une autre.'; return; }
    steps.push([a, k, op]); last = performance.now(); sfx.good();
    list = list.filter((_, i) => i !== a && i !== k).concat(v);
    a = -1; op = null;
    progress(steps.length);
    draw();
    if (v === p.target) { line.textContent = 'Le compte est bon !'; finish(1100); }
    else if (steps.length >= MAX_STEPS || list.length < 2) finish(900);
  }
  function pickOp(o) { if (done || a < 0) return; op = op === o ? null : o; draw(); }
  function finish(delay = 0) { if (done) return; done = true; draw(); setTimeout(() => { if (alive) { alive = false; submit(payload()); } }, delay); }
  const payload = () => ({ s: steps, ms: Math.round(last - t0) });
  draw();
  return { partial: payload, destroy() { alive = false; } };
}
