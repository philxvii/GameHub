// Scène du présentateur : Gonzague (SVG animé par classes d'humeur) et son bandeau.
// Les répliques arrivent par mc/ (écrites par le coordinateur) ; on montre la plus
// récente avec un effet de télé-prompteur, et les deux précédentes en historique.

import { h, clear, reduced } from './dom.js';

const MOOD = {
  round_last: 'glee', gong_last: 'glee', tir_last: 'glee', dictee_last: 'glee', memory_last: 'glee', calcul_last: 'glee', nuage_last: 'glee', bac_last: 'glee',
  boast_fail: 'glee', drop: 'glee', final_last: 'glee', bac_weird: 'glee', coffre_fail: 'glee', absent: 'glee',
  exploit: 'shock', leader_change: 'shock', comeback: 'shock', tiny_gap: 'shock', tie: 'shock', boast_win: 'shock',
  round_win: 'envy', gong_win: 'envy', memory_win: 'envy', tir_win: 'envy', bac_bold: 'envy', final_win: 'envy',
};
const SRC = { local: 'réplique maison', gemini: 'IA · Gemini', openrouter: 'IA · OpenRouter', workersai: 'IA · Workers AI' };

export function hostInto(target) {
  const sym = document.getElementById('host');
  if (sym) [...sym.childNodes].forEach(n => target.append(n.cloneNode(true)));
}

export class Stage {
  constructor(root) {
    this.root = root;
    this.lastId = null; this.lastText = null; this.timer = null; this.talkTimer = null;
    clear(root);
    this.host = h('div', { class: 'host' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 220');
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'bob');
    // Copie du symbole (pas de <use>) : les classes d'humeur doivent atteindre les traits.
    hostInto(g);
    svg.append(g); this.host.append(svg);
    this.p = h('p', { 'aria-live': 'polite' });
    this.src = h('span', { class: 'src' });
    this.cap = h('div', { class: 'caption' }, this.src, this.p);
    this.hist = h('div', { class: 'history', 'aria-hidden': 'true' });
    root.append(this.hist, this.host, this.cap);
    this.p.textContent = '…';
  }
  // lines : { id: { t, ts, ev, src } } — on n'affiche que les nouveautés et les réécritures IA.
  update(lines) {
    const list = Object.entries(lines || {}).map(([id, l]) => ({ id, ...l })).sort((a, b) => a.ts - b.ts);
    if (!list.length) return;
    const last = list[list.length - 1];
    clear(this.hist);
    list.slice(-3, -1).forEach(l => this.hist.append(h('p', { text: l.t })));
    if (last.id === this.lastId && last.t === this.lastText) return;
    const isNew = last.id !== this.lastId;
    this.lastId = last.id; this.lastText = last.t;
    this.src.textContent = SRC[last.src] || '';
    this.type(String(last.t || ''));
    if (isNew) {
      this.cap.classList.remove('fresh'); void this.cap.offsetWidth; this.cap.classList.add('fresh');
      this.mood(MOOD[last.ev] || '');
    }
  }
  type(text) {
    clearInterval(this.timer);
    this.host.classList.add('talk');
    clearTimeout(this.talkTimer);
    if (reduced()) { this.p.textContent = text; this.talkTimer = setTimeout(() => this.host.classList.remove('talk'), 900); return; }
    let i = 0;
    this.p.textContent = '';
    this.timer = setInterval(() => {
      i = Math.min(text.length, i + 2);
      this.p.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(this.timer); this.talkTimer = setTimeout(() => this.host.classList.remove('talk'), 300); }
    }, 22);
  }
  mood(m) {
    this.host.classList.remove('glee', 'shock', 'envy');
    if (m) this.host.classList.add(m);
    this.root.classList.toggle('spot', m === 'shock');
  }
}
