// Le Gong : un grand panneau. Mesure locale entre l'affichage du signal (après rendu)
// et l'évènement du doigt ou de la touche (event.timeStamp, même horloge que
// performance.now()). L'animation n'est jamais la source du score.

import { h } from '../ui/dom.js';
import { keyHandler } from './index.js';

export default function mount(root, { p, submit, progress }) {
  const trials = p.trials;
  const times = [];
  let falses = 0, d = 0, state = 'idle', t0 = 0, timer = null, alive = true;
  const main = h('div', { class: 'g-main' }), sub = h('div', { class: 'g-sub' });
  const pad = h('button', { class: 'gong wait', type: 'button', 'aria-live': 'assertive' }, h('div', {}, main, sub));
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const head = h('div', { class: 'play-head' }, h('span', { text: 'Touche dès que le panneau passe au VERT' }), dots);
  root.append(head, pad);
  const drawDots = () => { dots.replaceChildren(...Array.from({ length: trials }, (_, k) => h('i', { class: k < times.length ? 'on' : '' }))); };
  const show = (cls, a, b) => { pad.className = `gong ${cls}`; main.textContent = a; sub.textContent = b || ''; };

  function arm() {
    if (!alive) return;
    state = 'wait';
    show('wait', 'Attends…', `Signal ${times.length + 1} sur ${trials}`);
    const delay = p.delays[d++ % p.delays.length];
    timer = setTimeout(() => {
      state = 'go';
      show('go', 'Maintenant !', '');
      // Deux images plus tard, le signal est réellement à l'écran.
      requestAnimationFrame(() => requestAnimationFrame(t => { t0 = performance.now(); }));
      t0 = performance.now();
    }, delay);
  }
  function hit(e) {
    if (!alive) return;
    if (e && e.cancelable) e.preventDefault();
    const at = e && e.timeStamp ? e.timeStamp : performance.now();
    if (state === 'wait') {
      clearTimeout(timer);
      falses++;
      state = 'pause';
      show('early', 'Faux départ', 'Trop tôt. On recommence ce signal.');
      setTimeout(arm, 1100);
    } else if (state === 'go') {
      state = 'pause';
      const ms = Math.max(0, Math.round(at - t0));
      times.push(ms);
      progress(times.length);
      drawDots();
      show('res', `${ms} ms`, times.length < trials ? 'Suivant…' : 'Terminé');
      if (times.length >= trials) setTimeout(() => submit({ t: times, f: falses }), 600);
      else setTimeout(arm, 900);
    }
  }
  pad.addEventListener('pointerdown', hit);
  const offKey = keyHandler(e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) hit(e); });
  drawDots();
  show('wait', 'Prêt ?', 'Le premier signal arrive');
  setTimeout(arm, 400);
  return {
    partial: () => ({ t: times, f: falses }),
    destroy() { alive = false; clearTimeout(timer); offKey(); },
  };
}
