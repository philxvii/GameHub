// Tableau à palettes : chaque caractère qui change « défile » quelques lettres avant
// de se poser, avec un petit claquement. Mouvement réduit : affichage direct.

import { h, reduced } from './dom.js';
import { sfx } from '../sfx.js';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class Flaps {
  constructor(len, cls = '') {
    this.len = len;
    this.el = h('span', { class: `flaps ${cls}`, 'aria-hidden': 'true' });
    this.cells = Array.from({ length: len }, () => { const c = h('span', { class: 'flap', text: ' ' }); this.el.append(c); return c; });
    this.text = ''.padEnd(len);
    this.timers = [];
  }
  set(value, { pad = 'end', sound = true } = {}) {
    const raw = String(value).toUpperCase().slice(0, this.len);
    const t = pad === 'start' ? raw.padStart(this.len) : raw.padEnd(this.len);
    this.timers.forEach(clearTimeout); this.timers = [];
    const instant = reduced();
    t.split('').forEach((ch, i) => {
      const cell = this.cells[i];
      cell.classList.toggle('sp', ch === ' ' && pad === 'none');
      if (this.text[i] === ch) return;
      if (instant) { cell.textContent = ch; return; }
      const steps = 3 + Math.floor(Math.random() * 4) + i % 3;
      for (let s = 0; s <= steps; s++) {
        this.timers.push(setTimeout(() => {
          cell.textContent = s === steps ? ch : ALPHA[Math.floor(Math.random() * ALPHA.length)];
          cell.classList.remove('spin'); void cell.offsetWidth; cell.classList.add('spin');
          if (sound && s % 2 === 0) sfx.flap();
        }, i * 28 + s * 55));
      }
    });
    this.text = t;
    return this;
  }
}
