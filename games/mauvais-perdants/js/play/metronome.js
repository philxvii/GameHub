// Le Métronome : quatre battements (vus et entendus), puis il se tait et on continue seul.
// On ne mesure que les intervalles entre les touches : aucune latence d'appareil dans le score.

import { h } from '../ui/dom.js';
import { wait, keyHandler } from './index.js';
import { RHYTHMS } from '../rounds/metronome.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const rows = [];
  let k = 0, alive = true, listening = false, taps = [], timer = null;
  const idx = h('b', { text: `1 / ${RHYTHMS}` });
  const pulse = h('div', { class: 'mt-pulse' });
  const pips = h('div', { class: 'mt-pips', 'aria-hidden': 'true' }, Array.from({ length: p.taps }, () => h('i')));
  const line = h('div', { class: 'state-line' });
  const pad = h('button', { class: 'btn btn-main mt-pad', type: 'button', text: 'TAPE' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Tempo ', idx), h('span', { text: 'Continue au même rythme' })), pulse, pips, line, pad);
  pad.disabled = true;

  const beat = () => { pulse.classList.remove('hit'); void pulse.offsetWidth; pulse.classList.add('hit'); };
  async function round() {
    const per = p.periods[k];
    idx.textContent = `${k + 1} / ${RHYTHMS}`;
    taps = []; listening = false; pad.disabled = true;
    [...pips.children].forEach(i => { i.className = ''; });
    line.textContent = 'Écoute le tempo…';
    await wait(700);
    for (let b = 0; b < p.beats && alive; b++) { beat(); sfx.tick(); await wait(per); }
    if (!alive) return;
    line.textContent = `À toi : ${p.taps} touches, même rythme, sans aide.`;
    listening = true; pad.disabled = false;
    clearTimeout(timer);
    timer = setTimeout(() => { if (listening) finishRound(); }, per * (p.taps + 3));
  }
  function tap() {
    if (!alive || !listening) return;
    taps.push(performance.now());
    pips.children[taps.length - 1].classList.add('on');
    pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit');
    clearTimeout(timer);
    if (taps.length >= p.taps) finishRound();
    else timer = setTimeout(() => { if (listening) finishRound(); }, p.periods[k] * 3);
  }
  function finishRound() {
    listening = false; pad.disabled = true; clearTimeout(timer);
    const per = p.periods[k];
    const gaps = taps.slice(1).map((t, j) => Math.round(t - taps[j]));
    rows.push(gaps);
    const err = gaps.length ? Math.round(gaps.reduce((a, g) => a + Math.min(per / 2, Math.abs(g - per)), 0) / gaps.length) : Math.round(per / 2);
    line.textContent = gaps.length < p.taps - 1 ? `Il manquait des touches. Écart ≈ ${err} ms.` : err <= 30 ? `Métronome humain : ${err} ms d’écart !` : `Écart moyen : ${err} ms`;
    err <= 40 ? sfx.good() : sfx.bad();
    k++;
    progress(k, `${k - 1}${Math.min(9999, err).toString(36)}`);
    if (k >= RHYTHMS) { alive = false; setTimeout(() => submit(payload()), 1500); return; }
    setTimeout(() => { if (alive) round(); }, 1500);
  }
  pad.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  const offKey = keyHandler(e => { if (e.repeat) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } });
  const payload = () => ({ r: rows });
  round();
  return { partial: payload, destroy() { alive = false; listening = false; clearTimeout(timer); offKey(); } };
}
