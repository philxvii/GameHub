// L'Étiquette : un objet, un champ de prix, Valider. Le vrai prix n'est pas montré pendant la
// manche (les autres jouent encore) : il apparaît au verdict.

import { h } from '../ui/dom.js';
import { parsePrice, ITEMS_PER_ROUND } from '../rounds/prix.js';

const SAID = ['Noté. On ne juge pas. Pas encore.', 'Enregistré. Le marché appréciera.', 'C’est noté. Courageux.', 'Vu. La régie fait la grimace.'];

export default function mount(root, { p, submit, progress }) {
  const answers = [];
  let k = 0, alive = true;
  const idx = h('b', { text: `1 / ${ITEMS_PER_ROUND}` });
  const name = h('div', { class: 'pc-name' });
  const hint = h('div', { class: 'pc-hint' });
  const card = h('div', { class: 'price-card' }, h('span', { class: 'pc-tag', text: 'Combien ?' }), name, hint);
  const input = h('input', { class: 'inp', inputmode: 'decimal', autocomplete: 'off', maxlength: '12', placeholder: '0 €', 'aria-label': 'Prix en euros' });
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const fb = h('div', { class: 'feedback' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Objet ', idx), h('span', { text: 'Prix en euros, au jugé' })), card, fb, h('div', { class: 'answer-row' }, input, btn));

  function draw() {
    const it = p.items[k];
    idx.textContent = `${k + 1} / ${ITEMS_PER_ROUND}`;
    name.textContent = it.name;
    hint.textContent = it.hint;
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    input.value = '';
    input.focus();
  }
  function validate() {
    if (!alive) return;
    const v = parsePrice(input.value);
    if (v === null) { fb.className = 'feedback ko'; fb.textContent = 'Un prix en euros, par exemple 12 ou 3,50'; return; }
    answers.push(v);
    progress(answers.length);
    fb.className = 'feedback'; fb.textContent = SAID[k % SAID.length];
    k++;
    if (k >= ITEMS_PER_ROUND) { alive = false; submit({ a: answers }); return; }
    draw();
  }
  btn.addEventListener('click', validate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
  draw();
  return { partial: () => ({ a: answers }), destroy() { alive = false; } };
}
