// Coffre : le nombre s'affiche (barre de temps), disparaît, le champ apparaît.
// Entrée valide ; une seule validation par nombre.

import { h } from '../ui/dom.js';
import { lives as livesEl, wait } from './index.js';
import { numberFor, showMs, normalizeDigits, START, LIVES, MAX_LEN } from '../rounds/coffre.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const answers = [];
  let len = START, lives = LIVES, a = 0, t0 = performance.now(), lastOk = 0, alive = true, best = 0, open = false;
  const lvl = h('b', { text: String(len) });
  const lifeBox = h('span');
  const big = h('div', { class: 'bignum', 'aria-live': 'polite' });
  const barFill = h('i');
  const bar = h('div', { class: 'bar' }, barFill);
  const input = h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '24', 'aria-label': 'Le nombre' });
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const row = h('div', { class: 'answer-row' }, input, btn);
  const fb = h('div', { class: 'feedback' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Chiffres : ', lvl), lifeBox), bar, big, fb, row);

  async function show() {
    open = false;
    row.style.visibility = 'hidden';
    input.value = '';
    lvl.textContent = String(len);
    lifeBox.replaceChildren(livesEl(lives, LIVES));
    const num = numberFor(p.seed, p.i, len, a);
    big.textContent = num;
    const ms = showMs(len);
    barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
    barFill.style.transition = `transform ${ms}ms linear`; barFill.style.transform = 'scaleX(0)';
    await wait(ms);
    if (!alive) return;
    big.textContent = '?'.repeat(Math.min(len, 12));
    row.style.visibility = 'visible';
    open = true;
    input.focus();
  }
  async function validate() {
    if (!alive || !open) return;
    const got = normalizeDigits(input.value);
    if (got === null) { fb.className = 'feedback ko'; fb.textContent = 'Des chiffres seulement.'; return; }
    open = false;                                     // pas de double validation
    const want = numberFor(p.seed, p.i, len, a);
    answers.push(got); a++;
    if (got === want) {
      best = len; lastOk = performance.now() - t0; progress(best);
      fb.className = 'feedback ok'; fb.textContent = 'Exact.'; sfx.good();
      if (len >= MAX_LEN) return end();
      len++;
    } else {
      lives--;
      fb.className = 'feedback ko'; fb.textContent = `C’était ${want}`; sfx.bad();
      if (lives <= 0) return end();
    }
    await wait(900);
    fb.textContent = '';
    if (alive) show();
  }
  function end() {
    alive = false;
    row.style.visibility = 'hidden';
    big.textContent = best ? `${best} chiffres` : '—';
    setTimeout(() => submit(payload()), 900);
  }
  btn.addEventListener('click', validate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
  const payload = () => ({ a: answers, ms: Math.round(lastOk) });
  show();
  return { partial: payload, destroy() { alive = false; } };
}
