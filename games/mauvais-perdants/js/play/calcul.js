// Calcul express : une opération, un champ numérique, Valider / Passer.

import { h } from '../ui/dom.js';
import { COUNT } from '../rounds/calcul.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const answers = [];
  let k = 0, net = 0, alive = true;
  const sc = h('b', { text: '0' });
  const q = h('div', { class: 'calc-q', 'aria-live': 'polite' });
  const fb = h('div', { class: 'feedback' });
  const input = h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '6', 'aria-label': 'Ta réponse' });
  const ok = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const skip = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Passer' });
  root.append(h('div', { class: 'play-head' }, h('span', { text: 'Juste +1 · Faux −1 · Passer 0' }), h('span', {}, 'Total ', sc)), q, fb, h('div', { class: 'calc-actions' }, input, ok, skip));
  const draw = () => { q.textContent = `${p.list[k].q} =`; input.value = ''; input.focus(); };
  function next(v) {
    if (!alive) return;
    if (v !== null) {
      const s = String(v).trim();
      if (!/^-?[0-9]{1,6}$/.test(s)) { fb.className = 'feedback ko'; fb.textContent = 'Un nombre'; return; }
      v = Number(s);
      const good = v === p.list[k].a;
      net += good ? 1 : -1;
      fb.className = `feedback ${good ? 'ok' : 'ko'}`;
      fb.textContent = good ? '✓' : `✕ ${p.list[k].a}`;
      good ? sfx.good() : sfx.bad();
    } else { fb.className = 'feedback'; fb.textContent = 'passé'; }
    answers.push(v);
    sc.textContent = String(net);
    progress(net, k + 1);   // indice de la question en cours, pour ceux qui regardent
    k++;
    if (k >= COUNT) { alive = false; submit(payload()); return; }
    draw();
  }
  ok.addEventListener('click', () => next(input.value));
  skip.addEventListener('click', () => next(null));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(input.value); } });
  const payload = () => ({ a: answers });
  draw();
  return { partial: payload, destroy() { alive = false; } };
}
