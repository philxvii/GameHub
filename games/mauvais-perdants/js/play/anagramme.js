// Le Mot brouillé : les lettres sont mélangées, on tape le mot. Entrée valide, « Passer » saute.

import { h } from '../ui/dom.js';
import { accepts, ITEMS } from '../rounds/anagramme.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const answers = [];
  let k = 0, found = 0, alive = true, lastOk = 0;
  const t0 = performance.now();
  const idx = h('b', { text: `1 / ${ITEMS}` });
  const sc = h('b', { text: '0' });
  const tiles = h('div', { class: 'tiles', 'aria-label': 'Lettres mélangées' });
  const fb = h('div', { class: 'feedback' });
  const input = h('input', { class: 'inp', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '12', 'aria-label': 'Le mot' });
  const ok = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const skip = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Passer' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Mot ', idx), h('span', {}, 'Trouvés ', sc)), tiles, fb, h('div', { class: 'answer-row' }, input, ok, skip));

  const draw = () => {
    idx.textContent = `${k + 1} / ${ITEMS}`;
    tiles.replaceChildren(...p.items[k].s.toUpperCase().split('').map((c, i) => h('span', { class: 'tile', style: { animationDelay: `${i * 40}ms` }, text: c })));
    input.value = ''; input.focus();
  };
  function next(v) {
    if (!alive) return;
    if (v !== null) {
      if (!accepts(p.items[k], v)) { fb.className = 'feedback ko'; fb.textContent = 'Ce n’est pas ça, essaie encore ou passe.'; sfx.bad(); input.select(); return; }
      found++; lastOk = performance.now() - t0; sfx.good();
      fb.className = 'feedback ok'; fb.textContent = `✓ ${p.items[k].w.toUpperCase()}`;
    } else { fb.className = 'feedback'; fb.textContent = `passé : c’était ${p.items[k].w.toUpperCase()}`; }
    answers.push(v === null ? '' : v);
    sc.textContent = String(found);
    k++;
    progress(found, k);
    if (k >= ITEMS) { alive = false; submit(payload()); return; }
    draw();
  }
  ok.addEventListener('click', () => next(input.value));
  skip.addEventListener('click', () => next(null));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(input.value); } });
  const payload = () => ({ a: answers, ms: Math.round(lastOk || performance.now() - t0) });
  draw();
  return { partial: payload, destroy() { alive = false; } };
}
