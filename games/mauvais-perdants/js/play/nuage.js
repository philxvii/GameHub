// Nuage : points affichés 2,5 s (SVG), puis estimation. Trois nuages.

import { h } from '../ui/dom.js';
import { wait } from './index.js';

const NS = 'http://www.w3.org/2000/svg';

export default function mount(root, { p, submit, progress, sfx }) {
  const answers = [];
  let k = 0, alive = true, open = false;
  const idx = h('b', { text: `1 / ${p.clouds.length}` });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'cloud'); svg.setAttribute('aria-label', 'Nuage de points');
  const barFill = h('i');
  const input = h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '5', 'aria-label': 'Combien de points ?' });
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const row = h('div', { class: 'answer-row' }, input, btn);
  const line = h('div', { class: 'state-line' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Nuage ', idx), h('span', { text: 'Combien de points ?' })), h('div', { class: 'bar' }, barFill), svg, line, row);

  async function show() {
    open = false;
    row.style.visibility = 'hidden';
    idx.textContent = `${k + 1} / ${p.clouds.length}`;
    svg.replaceChildren();
    p.clouds[k].dots.forEach(d => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', d.x * 100); c.setAttribute('cy', d.y * 100); c.setAttribute('r', [0.9, 1.2, 1.5][d.s]);
      svg.append(c);
    });
    line.textContent = 'Regarde bien…';
    barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
    barFill.style.transition = `transform ${p.show}ms linear`; barFill.style.transform = 'scaleX(0)';
    sfx.tick();
    await wait(p.show);
    if (!alive) return;
    svg.replaceChildren();
    line.textContent = 'Combien ?';
    row.style.visibility = 'visible';
    input.value = '';
    open = true;
    input.focus();
  }
  async function validate() {
    if (!alive || !open) return;
    const s = input.value.trim();
    if (!/^[0-9]{1,5}$/.test(s)) { line.textContent = 'Un nombre entier'; return; }
    open = false;
    const guess = Number(s), truth = p.clouds[k].n;
    answers.push(guess);
    progress(answers.length);
    // Le vrai compte, tout de suite : « C'était 73 points (tu as dit 60) ».
    row.style.visibility = 'hidden';
    line.textContent = `C’était ${truth} points · tu as dit ${guess}`;
    await wait(1600);
    if (!alive) return;
    k++;
    if (k >= p.clouds.length) { alive = false; row.style.visibility = 'hidden'; line.textContent = 'Réponses enregistrées'; submit(payload()); return; }
    show();
  }
  btn.addEventListener('click', validate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
  const payload = () => ({ a: answers });
  show();
  return { partial: payload, destroy() { alive = false; } };
}
