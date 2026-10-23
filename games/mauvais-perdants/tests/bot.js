// Joueur automatique injecté dans la page par tests/multi.cjs. Il joue PAR L'INTERFACE :
// évènements pointeur sur les vraies cases, saisie dans les vrais champs, clics sur les
// vrais boutons. Il lit les paramètres de manche (window.__mp.params) comme le ferait
// un joueur qui regarde l'écran, et se trompe volontairement selon son « niveau ».
// Rien de ce fichier n'est chargé par le jeu.

window.__installBot = function (skill) {
  if (window.__botTimer) clearInterval(window.__botTimer);
  const S = { key: null, pending: false, st: {} };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const pd = el => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const later = (ms, fn) => { S.pending = true; setTimeout(() => { try { fn(); } finally { S.pending = false; } }, ms); };
  const seqClick = (els, gap, then) => {
    S.pending = true;
    els.forEach((el, k) => setTimeout(() => pd(el), k * gap));
    setTimeout(() => { S.pending = false; then && then(); }, els.length * gap + 60);
  };
  const log = window.__botLog = [];

  const PLAY = {
    gong() { const pad = $('.gong'); if (pad && pad.classList.contains('go')) later(skill.react + Math.random() * 40, () => pd($('.gong'))); },
    tir() { const t = $('.target'); if (t) later(skill.aim, () => { if (Math.random() < skill.miss) pd($('.arena')); pd($('.target')); }); },
    dictee(p) {
      const ta = $('textarea.typer');
      if (!ta || ta.disabled) return;
      S.st.i = (S.st.i || 0) + 1;
      later(skill.type, () => setVal(ta, p.phrase.slice(0, S.st.i)));
    },
    chemin(p) {
      const line = $('.state-line'), grid = $('.grid');
      if (!line || line.textContent !== 'À toi !' || grid.classList.contains('locked')) return;
      const level = Number($('.play-head b').textContent);
      if (S.st.lv === level) return;
      S.st.lv = level;
      const cells = $$('.grid .cell');
      if (level > skill.memory) return seqClick([cells[(p.seq[0] + 1) % 9]], 80);
      seqClick(p.seq.slice(0, level).map(c => cells[c]), 90);
    },
    numeros() {
      const nums = $$('.grid .cell.num:not(.hid)');
      if (!nums.length) return;
      const n = nums.length;
      const order = nums.slice().sort((a, b) => Number(a.textContent) - Number(b.textContent));
      if (n - 3 > skill.memory) return seqClick([$('.grid .cell.gone')], 80);
      seqClick(order, 110);
    },
    damier() {
      const grid = $('.grid'), line = $('.state-line');
      if (grid && grid.classList.contains('locked')) {
        const lit = $$('.grid .cell').map((c, k) => (c.classList.contains('lit') ? k : -1)).filter(k => k >= 0);
        if (lit.length) S.st.pat = lit;
        return;
      }
      if (!line || line.textContent !== 'Retrouve-les !' || !S.st.pat) return;
      const cells = $$('.grid .cell');
      const level = Number($('.play-head b').textContent);
      const pat = S.st.pat; S.st.pat = null;
      if (level > skill.memory - 1) return seqClick(cells.map((c, k) => k).filter(k => !pat.includes(k)).slice(0, 3).map(k => cells[k]), 90);
      seqClick(pat.map(k => cells[k]), 90);
    },
    coffre() {
      const big = $('.bignum'), row = $('.answer-row'), input = row && row.querySelector('input');
      if (big && /^[0-9]+$/.test(big.textContent)) S.st.num = big.textContent;
      if (!row || row.style.visibility !== 'visible' || !S.st.num) return;
      const n = S.st.num; S.st.num = null;
      later(250, () => { setVal(input, n.length - 2 > skill.memory ? '0' : n); row.querySelector('button').click(); });
    },
    dejavu() {
      const w = $('.word');
      if (!w || !w.textContent || w.textContent === S.st.last) return;
      S.st.last = w.textContent;
      S.st.seen = S.st.seen || new Set();
      S.st.n = (S.st.n || 0) + 1;
      let seen = S.st.seen.has(w.textContent);
      if (S.st.n > skill.memory * 3) seen = !seen;                // se met à se tromper
      S.st.seen.add(w.textContent);
      later(120, () => $$('.dv-actions button')[seen ? 0 : 1].click());
    },
    calcul() {
      const q = $('.calc-q'), input = $('.calc-actions input');
      if (!q || !input || q.textContent === S.st.last) return;
      S.st.last = q.textContent;
      const [a, op, b] = q.textContent.replace(' =', '').split(' ');
      let v = { '+': +a + +b, '−': a - b, '×': a * b, '÷': a / b }[op];
      S.st.n = (S.st.n || 0) + 1;
      if (S.st.n % skill.calcErr === 0) v += 1;
      later(skill.type * 6, () => { setVal(input, String(v)); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    },
    nuage() {
      const dots = $$('.cloud circle').length;
      if (dots) S.st.count = dots;
      const row = $('.answer-row');
      if (!row || row.style.visibility !== 'visible' || !S.st.count) return;
      const n = S.st.count; S.st.count = null;
      later(300, () => { setVal(row.querySelector('input'), String(Math.round(n * skill.estimate))); row.querySelector('button').click(); });
    },
    bac(p) {
      if (S.st.filled) return;
      const inputs = $$('.bac-fields input');
      if (inputs.length !== 4) return;
      S.st.filled = true;
      const L = p.letter;
      skill.bac(L).forEach((v, k) => setVal(inputs[k], v));
      later(skill.bacDelay, () => { const b = [...$$('#deck button')].find(x => x.textContent === 'J’ai fini'); b && b.click(); });
    },
  };

  function tick() {
    const sa = window.__mp, room = sa && sa.room, m = room && room.s.match;
    if (!m || S.pending) return;
    const key = `${m.tid}:${m.rk}:${m.step}`;
    if (key !== S.key) { S.key = key; S.st = {}; S.since = Date.now(); log.push(key); }
    if (m.step === 'intro') {
      const btns = $$('#deck .intro-actions button');
      const boast = btns.find(b => b.classList.contains('boast-btn'));
      if (boast && !boast.disabled && skill.boastOn && skill.boastOn.includes(m.i) && !S.st.boasted) { S.st.boasted = true; boast.click(); }
      const ready = btns.find(b => b.textContent === 'Prêt');
      if (ready && !ready.disabled && Date.now() - S.since > 600) ready.click();
      return;
    }
    if (m.step === 'vote') {
      const items = $$('.vote-item');
      if (!items.length || S.st.voted) return;
      S.st.voted = true;
      items.forEach(it => {
        const t = it.querySelector('.ans').textContent;
        const no = it.querySelector('.tog .no');
        if (no && skill.refuse && skill.refuse.test(t)) no.click();
      });
      later(500, () => { const d = [...$$('#deck button')].find(x => x.textContent === 'J’ai voté'); d && d.click(); });
      return;
    }
    if (m.step === 'board' && Date.now() - S.since > 2500) {
      const nb = $('#deck .next-btn');
      if (nb && !nb.disabled && !S.st.next) { S.st.next = true; nb.click(); }
    }
    if ((m.step === 'reveal' || m.step === 'board') && skill.skip && Date.now() - S.since > skill.skip) {
      const b = [...$$('#deck .coord-ctl button')][0];
      if (b && !S.st.skipped) { S.st.skipped = true; b.click(); }
      return;
    }
    if (m.step !== 'play') return;
    const g = m.i >= 5 ? 'gong' : m.plan[m.i].g;
    const p = sa.params();
    if (PLAY[g]) PLAY[g](p, m);
  }
  window.__botTimer = setInterval(tick, 70);
  return true;
};
