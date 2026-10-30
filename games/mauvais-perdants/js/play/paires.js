// Les Paires : seize cartes, huit paires de signes dessinés (aucun emoji). On retourne deux cartes ; identiques, elles
// restent ; sinon elles se recachent après un court instant. Le dos de la carte porte le « 7 » de Canal 7.

import { h, svg } from '../ui/dom.js';
import { PAIRS, CARDS } from '../rounds/paires.js';

const INK = '#1d140e';
const COL = ['#e5542a', '#e9b23a', '#1d6b66', '#d8321e', '#503425', '#3a8fc4', '#2f9e6a', '#7a6650'];
// Huit signes géométriques, dessinés à la main (viewBox 40 × 40).
const SHAPES = [
  c => `<circle cx="20" cy="20" r="13" fill="${c}" stroke="${INK}" stroke-width="2.4"/>`,
  c => `<rect x="7" y="7" width="26" height="26" rx="3" fill="${c}" stroke="${INK}" stroke-width="2.4"/>`,
  c => `<path d="M20 6 L35 33 H5 Z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  c => `<path d="M20 4 L35 20 L20 36 L5 20 Z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  c => `<path d="M15 6h10v9h9v10h-9v9H15v-9H6V15h9z" fill="${c}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  c => `<path d="M20 4l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="${c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  c => `<circle cx="20" cy="20" r="12" fill="none" stroke="${c}" stroke-width="7"/><circle cx="20" cy="20" r="15.5" fill="none" stroke="${INK}" stroke-width="1.8"/><circle cx="20" cy="20" r="8.5" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
  c => `<path d="M8 8h6v24H8zM17 8h6v24h-6zM26 8h6v24h-6z" fill="${c}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
];
const face = n => svg(`<svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true" focusable="false">${SHAPES[n](COL[n])}</svg>`);

export default function mount(root, { p, submit, progress, sfx }) {
  const flips = [];
  let first = -1, busy = false, matched = 0, tries = 0, alive = true, t0 = performance.now(), last = t0;
  const cards = [];
  const tr = h('b', { text: '0' }), pr = h('b', { text: `0 / ${PAIRS}` });
  const grid = h('div', { class: 'pr-grid', role: 'application', 'aria-label': 'Cartes à retourner' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Coups ', tr), h('span', {}, 'Paires ', pr)), grid);
  for (let c = 0; c < CARDS; c++) {
    const inner = h('div', { class: 'pr-inner' }, h('div', { class: 'pr-back', 'aria-hidden': 'true' }, h('span', { text: '7' })), h('div', { class: 'pr-face' }, face(p.cards[c])));
    const b = h('button', { class: 'pr-card', type: 'button', 'aria-label': `Carte ${c + 1}` }, inner);
    b.addEventListener('pointerdown', e => { e.preventDefault(); flip(c); });
    cards.push(b); grid.append(b);
  }
  function flip(c) {
    if (!alive || busy || cards[c].classList.contains('up') || cards[c].classList.contains('done')) return;
    flips.push(c); last = performance.now(); sfx.tick();
    progress(matched, `${(flips.length % 36).toString(36)}${c.toString(36)}`);   // la carte qu'il retourne
    cards[c].classList.add('up');
    if (first < 0) { first = c; return; }
    tries++; tr.textContent = String(tries);
    const a = first; first = -1; busy = true;
    if (p.cards[a] === p.cards[c]) {
      matched++; pr.textContent = `${matched} / ${PAIRS}`; sfx.good();
      setTimeout(() => { cards[a].classList.add('done'); cards[c].classList.add('done'); busy = false; }, 350);
      progress(matched, `${(flips.length % 36).toString(36)}${c.toString(36)}`);
      if (matched >= PAIRS) { alive = false; setTimeout(() => submit(payload()), 1200); }
    } else {
      setTimeout(() => { cards[a].classList.remove('up'); cards[c].classList.remove('up'); busy = false; }, 850);
    }
  }
  const payload = () => ({ f: flips, ms: Math.round(last - t0) });
  return { partial: payload, destroy() { alive = false; } };
}
