// Déjà vu ? : un mot, deux boutons. Clavier : V (ou ←) déjà vu, N (ou →) nouveau.

import { h } from '../ui/dom.js';
import { lives as livesEl, keyHandler } from './index.js';
import { LIVES } from '../rounds/dejavu.js';

export default function mount(root, { p, submit, progress, sfx }) {
  const answers = [];
  let k = 0, lives = LIVES, score = 0, alive = true, t0 = performance.now(), locked = false;
  const sc = h('b', { text: '0' });
  const lifeBox = h('span');
  const word = h('div', { class: 'word', 'aria-live': 'polite' });
  const fb = h('div', { class: 'feedback' });
  const seen = h('button', { class: 'btn btn-brass', type: 'button' }, 'Déjà vu', h('span', { class: 'kbd', text: 'déjà passé · touche V' }));
  const fresh = h('button', { class: 'btn btn-main', type: 'button' }, 'Nouveau', h('span', { class: 'kbd', text: '1re fois · touche N' }));
  const hint = h('div', { class: 'state-line' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Bonnes réponses ', sc), lifeBox), hint, word, fb, h('div', { class: 'dv-actions' }, seen, fresh));
  const draw = () => {
    word.textContent = p.words[k].w; lifeBox.replaceChildren(livesEl(lives, LIVES));
    hint.textContent = k === 0 ? 'Premier mot : tu ne l’as jamais vu, donc « Nouveau ».' : 'Ce mot est-il déjà apparu plus tôt dans cette manche ?';
  };
  function answer(v) {
    if (!alive || locked) return;
    locked = true; setTimeout(() => { locked = false; }, 120);   // un toucher = une réponse
    const ok = v === (p.words[k].seen ? 1 : 0);
    answers.push(v);
    if (ok) { score++; sc.textContent = String(score); fb.className = 'feedback ok'; fb.textContent = '✓'; sfx.good(); }
    else { lives--; fb.className = 'feedback ko'; fb.textContent = p.words[k].seen ? '✕ Raté : ce mot était déjà passé avant' : '✕ Raté : c’était la 1re fois que ce mot venait'; sfx.bad(); }
    progress(score, k + 1);   // le mot en cours, pour ceux qui regardent
    k++;
    if (lives <= 0 || k >= p.words.length) { alive = false; word.textContent = `${score} bonnes`; setTimeout(() => submit(payload()), 700); return; }
    draw();
  }
  seen.addEventListener('click', () => answer(1));
  fresh.addEventListener('click', () => answer(0));
  const offKey = keyHandler(e => {
    if (e.repeat) return;
    if (e.key === 'v' || e.key === 'V' || e.key === 'ArrowLeft') answer(1);
    if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') answer(0);
  });
  const payload = () => ({ a: answers, ms: Math.round(performance.now() - t0) });
  draw();
  return { partial: payload, destroy() { alive = false; offKey(); } };
}
