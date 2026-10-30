// Le Chrono caché : le chrono part, disparaît au bout de 2 s, il faut stopper à la durée demandée.
// Le temps se mesure avec l'horloge de l'appareil (performance.now), pas avec le réseau.

import { h } from '../ui/dom.js';
import { wait, keyHandler } from './index.js';

const fmt = ms => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

export default function mount(root, { p, submit, progress, sfx }) {
  const times = [];
  let k = 0, alive = true, running = false, t0 = 0, tick = null;
  const idx = h('b', { text: `1 / ${p.targets.length}` });
  const goal = h('div', { class: 'chrono-goal' });
  const num = h('div', { class: 'chrono-num' });
  const line = h('div', { class: 'state-line' });
  const stop = h('button', { class: 'btn btn-main chrono-stop', type: 'button', text: 'STOP' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Essai ', idx), h('span', { text: 'Stoppe de tête' })), goal, num, line, stop);
  stop.disabled = true;

  async function attempt() {
    const target = p.targets[k];
    idx.textContent = `${k + 1} / ${p.targets.length}`;
    goal.textContent = `Arrête-toi à ${fmt(target)}`;
    num.className = 'chrono-num'; num.textContent = '0,00 s';
    line.textContent = 'Prêt…'; stop.disabled = true;
    await wait(900);
    if (!alive) return;
    line.textContent = 'Le chrono disparaît bientôt : garde le tempo dans ta tête.';
    t0 = performance.now(); running = true; stop.disabled = false;
    tick = setInterval(() => {
      const e = performance.now() - t0;
      if (e < p.show) num.textContent = fmt(e);
      else { num.textContent = '? , ? ?'; num.classList.add('hidden'); }
      if (e > target * 2) end(true);
    }, 30);
  }
  function end(timeout) {
    if (!running) return;
    running = false; clearInterval(tick); stop.disabled = true;
    const target = p.targets[k];
    const t = timeout ? 0 : Math.round(performance.now() - t0);
    const err = timeout ? target : Math.min(target, Math.abs(t - target));
    times.push(timeout ? 0 : t);
    num.classList.remove('hidden');
    num.textContent = timeout ? 'Trop tard' : fmt(t);
    num.classList.add(err <= 150 ? 'ok' : err <= 500 ? 'near' : 'far');
    line.textContent = timeout ? 'Pas de STOP : essai perdu.' : err <= 50 ? `Presque parfait : ${err} ms d’écart !` : `${t > target ? 'Trop long' : 'Trop court'} de ${fmt(err)}`;
    err <= 150 ? sfx.good() : sfx.bad();
    progress(k + 1, `${k}${t > target ? 'p' : 'n'}${Math.min(99999, err).toString(36)}`);
    k++;
    if (k >= p.targets.length) { alive = false; setTimeout(() => submit(payload()), 1600); return; }
    setTimeout(() => { if (alive) attempt(); }, 1700);
  }
  stop.addEventListener('pointerdown', e => { e.preventDefault(); end(false); });
  const offKey = keyHandler(e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(false); } });
  const payload = () => ({ t: times });
  attempt();
  return { partial: payload, destroy() { alive = false; running = false; clearInterval(tick); offKey(); } };
}
