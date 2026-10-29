// Échiquier des Échecs, en 2D : marqueterie d'érable et de noyer (CSS), pièces Staunton
// dessinées en SVG, animées par l'API Web Animations. Léger : aucune bibliothèque, aucun rendu
// tant que rien ne bouge.
//
// Ce module ne fait que DESSINER et ANIMER : l'état vient de index.html (déjà validé par les
// règles). Les cases accessibles (boutons, clavier, lecteurs d'écran) sont posées par la page
// par-dessus ; `pick` traduit un point de l'écran en case.
//
// Cases : 0 = a1 … 63 = h8. Une pièce est un élément placé par `transform: translate()` en
// unités de case ; le soulèvement passe par les propriétés `translate` et `scale`, qui se
// composent avec le placement sans le toucher.

const NS = 'http://www.w3.org/2000/svg';
const isWhite = p => p < 'a';

// ══════════════════ Pièces (viewBox 100 × 100, socle en bas) ══════════════════
const BASE = ['M24 92Q20 92 20 88Q20 84 25 83H75Q80 84 80 88Q80 92 76 92Z', 'M30 83L33 76H67L70 83Z'];
const COLLAR = y => `M35 ${y}Q50 ${y - 6} 65 ${y}Q50 ${y + 5} 35 ${y}Z`;
const SHAPES = {
  P: { fill: [...BASE, 'M41 51C41 62 36 70 33 76H67C64 70 59 62 59 51Z', COLLAR(52)], circles: [[50, 36, 13]] },
  R: { fill: [...BASE, 'M36 76L39 46H61L64 76Z', 'M34 47H66L64 41H36Z', 'M31 41V22H39V28H46V22H54V28H61V22H69V41Z'], line: ['M37 35H63'] },
  N: { fill: [...BASE, 'M33 76C33 66 38 60 43 55C37 56 31 57 27 53C23 49 25 43 30 39C36 34 38 27 43 21L42 12L49 18C61 18 71 29 70 46C69 60 66 69 67 76Z'],
    line: ['M57 23Q66 33 64 47', 'M29 47q2 1.5 4 0'], dots: [[43, 30, 2.6]] },
  B: { fill: [...BASE, 'M41 76C41 66 44 60 45 54H55C56 60 59 66 59 76Z', COLLAR(55), 'M50 16C38 27 34 39 39 50H61C66 39 62 27 50 16Z'], circles: [[50, 13, 4.5]],
    line: ['M55 27L46 39'] },
  Q: { fill: [...BASE, 'M40 76C41 65 44 57 45 51H55C56 57 59 65 60 76Z', COLLAR(52), 'M35 48L28 22L40 35L44 17L50 33L56 17L60 35L72 22L65 48Z'],
    circles: [[28, 20, 4], [44, 15, 4], [56, 15, 4], [72, 20, 4]], line: ['M37 43Q50 39 63 43'] },
  K: { fill: [...BASE, 'M40 76C41 65 44 57 45 51H55C56 57 59 65 60 76Z', COLLAR(52),
    'M35 48C29 37 33 29 42 30C46 30 49 33 50 36C51 33 54 30 58 30C67 29 71 37 65 48Z', 'M47.5 8h5v7h6v5h-6v12h-5v-12h-6v-5h6Z'], line: ['M37 43Q50 39 63 43'] },
};
// Les pièces sont des <symbol> partagés, ajoutés une fois au document.
function defineSymbols() {
  if (document.getElementById('ec-pieces')) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'ec-pieces'; svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  let h = `<defs>
    <linearGradient id="ec-gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbf2"/><stop offset=".55" stop-color="#ecdfc4"/><stop offset="1" stop-color="#c8b28a"/></linearGradient>
    <linearGradient id="ec-gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a584a"/><stop offset=".45" stop-color="#2c221c"/><stop offset="1" stop-color="#0d0907"/></linearGradient></defs>`;
  for (const [k, s] of Object.entries(SHAPES)) for (const c of 'wb') {
    const fill = c === 'w' ? 'url(#ec-gw)' : 'url(#ec-gb)', edge = c === 'w' ? '#3d2d1c' : '#000', ink = c === 'w' ? '#3d2d1c' : 'rgba(255,236,206,.55)';
    h += `<symbol id="ec-${c}${k}" viewBox="0 0 100 100"><g fill="${fill}" stroke="${edge}" stroke-width="2.2" stroke-linejoin="round">`;
    h += s.fill.map(d => `<path d="${d}"/>`).join('') + (s.circles || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    h += `</g><g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round">${(s.line || []).map(d => `<path d="${d}"/>`).join('')}</g>`;
    h += (s.dots || []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/>`).join('') + '</symbol>';
  }
  svg.innerHTML = h;
  document.body.prepend(svg);
}

export function createBoard2D(host) {
  defineSymbols();
  host.classList.add('b2');
  host.insertAdjacentHTML('afterbegin', '<div class="b2-frame" aria-hidden="true"></div><div class="b2-sqs" aria-hidden="true"></div><div class="b2-coords" aria-hidden="true"></div><div class="b2-pcs" aria-hidden="true"></div>');
  const sqLayer = host.querySelector('.b2-sqs'), pcLayer = host.querySelector('.b2-pcs'), coords = host.querySelector('.b2-coords');
  const squares = [];
  for (let s = 0; s < 64; s++) {
    const d = document.createElement('div');
    d.className = 'b2-sq ' + (((s >> 3) + (s & 7)) % 2 ? 'l' : 'd');
    // Chaque placage a son propre morceau de bois.
    d.style.backgroundPosition = `${(s * 37) % 100}% ${(s * 53) % 100}%`;
    sqLayer.appendChild(d); squares.push(d);
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden;
  let color = 0;                                         // côté d'où l'on regarde
  const cell = s => (color === 0 ? [s & 7, 7 - (s >> 3)] : [7 - (s & 7), s >> 3]);
  const T = s => { const [c, r] = cell(s); return `translate(${c * 100}%, ${r * 100}%)`; };
  function layout() {
    squares.forEach((d, s) => { const [c, r] = cell(s); d.style.gridColumn = c + 1; d.style.gridRow = r + 1; });
    let h = '';
    for (let i = 0; i < 8; i++) {
      const f = color === 0 ? i : 7 - i, r = color === 0 ? 7 - i : i;
      h += `<span class="fx" style="left:${(i + .5) * 100 / 8}%">${'abcdefgh'[f]}</span><span class="ry" style="top:${(i + .5) * 100 / 8}%">${r + 1}</span>`;
    }
    coords.innerHTML = h;
  }

  let at = Array(64).fill(null), gen = 0, running = [];
  const track = a => { running.push(a); a.finished.catch(() => {}).finally(() => { running = running.filter(x => x !== a); }); return a; };
  const stopAll = () => { const r = running; running = []; r.forEach(a => a.cancel()); };
  function makePiece(p) {
    const el = document.createElement('div');
    el.className = 'b2-pc';
    el.innerHTML = `<svg viewBox="0 0 100 100"><use href="#ec-${isWhite(p) ? 'w' : 'b'}${p.toUpperCase()}"/></svg>`;
    el.dataset.p = p;
    pcLayer.appendChild(el);
    return el;
  }
  const place = (el, s) => { el.style.transform = T(s); el.dataset.sq = s; el.classList.remove('up', 'fallen', 'drag'); el.style.translate = ''; };

  function setPosition(b) {
    gen++;
    stopAll();
    lifted = -1;
    const next = Array(64).fill(null);
    for (let s = 0; s < 64; s++) {
      const el = at[s];
      if (!el) continue;
      if (b[s] === el.dataset.p) { next[s] = el; place(el, s); } else el.remove();
    }
    for (let s = 0; s < 64; s++) if (b[s] !== '.' && !next[s]) { const el = makePiece(b[s]); place(el, s); next[s] = el; }
    at = next;
  }

  // ══════════════════ Coups ══════════════════
  // Un trajet en arc : la pièce se soulève (plus grande, ombre plus longue), glisse, se pose.
  function glide(el, from, to, { lift = 16, ms = 340, delay = 0 } = {}) {
    el.style.transform = to;
    if (reduced()) return Promise.resolve();
    el.classList.add('air');
    const a = track(el.animate([
      { transform: from },
      { transform: `${mid(from, to)} translateY(-${lift}%) scale(1.13)`, offset: .5 },
      { transform: to },
    ], { duration: ms, delay, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'backwards' }));
    return a.finished.catch(() => {}).finally(() => {
      el.classList.remove('air');
      if (!reduced()) track(el.animate([{ scale: '1 1' }, { scale: '1.05 .93' }, { scale: '1 1' }], { duration: 160, easing: 'ease-out' }));
    });
  }
  // Milieu de deux `translate(x%, y%)`.
  const nums = t => (t.match(/-?[\d.]+%/g) || ['0%', '0%']).slice(0, 2).map(parseFloat);
  const mid = (a, b) => { const [ax, ay] = nums(a), [bx, by] = nums(b); return `translate(${(ax + bx) / 2}%, ${(ay + by) / 2}%)`; };

  async function animateMove(m, after) {
    stopAll();
    marks({});
    const my = ++gen;
    const mover = at[m.from];
    if (!mover) { setPosition(after.b); return; }
    const capSq = m.flag === 'e' ? m.to + (isWhite(m.p) ? -8 : 8) : m.to;
    const victim = m.cap !== '.' ? at[capSq] : null;
    const dist = Math.hypot((m.to & 7) - (m.from & 7), (m.to >> 3) - (m.from >> 3));
    const knight = m.p.toUpperCase() === 'N', dragged = mover.classList.contains('drag');
    const ms = dragged ? 200 : Math.round(Math.min(520, 250 + dist * 40) * (knight ? 1.1 : 1));
    const from = mover.style.transform;
    mover.classList.remove('up', 'drag');
    mover.style.zIndex = 5;
    const jobs = [glide(mover, from, T(m.to), { lift: dragged ? 4 : knight ? 34 : 12 + dist * 2, ms })];
    if (victim) {
      // La pièce prise bascule sous le choc et s'efface vers le bord.
      const [fc] = cell(m.from), [tc] = cell(m.to), dir = tc >= fc ? 1 : -1;
      victim.style.zIndex = 4;
      jobs.push(reduced() ? Promise.resolve() : track(victim.animate([
        { transform: T(capSq), opacity: 1 },
        { transform: `${T(capSq)} translate(${dir * 40}%, 6%) rotate(${dir * 80}deg) scale(.85)`, opacity: 0 },
      ], { duration: 420, delay: ms * .7, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })).finished.catch(() => {}));
    }
    if (m.flag === 'k' || m.flag === 'q') {
      const rf = m.flag === 'k' ? m.to + 1 : m.to - 2, rt = m.flag === 'k' ? m.to - 1 : m.to + 1, rook = at[rf];
      if (rook) jobs.push(glide(rook, T(rf), T(rt), { lift: 22, ms: 360, delay: ms * .5 }));
    }
    await Promise.all(jobs);
    if (gen !== my) return;
    if (m.promo && !reduced()) {
      // Promotion : le pion s'illumine, la nouvelle pièce pousse à sa place.
      await track(mover.animate([{ filter: 'brightness(1)', scale: '1' }, { filter: 'brightness(2.2) drop-shadow(0 0 12px #ffd37a)', scale: '.6' }], { duration: 240, fill: 'forwards' })).finished.catch(() => {});
      if (gen !== my) return;
      mover.querySelector('use').setAttribute('href', `#ec-${isWhite(m.promo) ? 'w' : 'b'}${m.promo.toUpperCase()}`);
      mover.dataset.p = m.promo;
      await track(mover.animate([{ filter: 'brightness(2.2) drop-shadow(0 0 12px #ffd37a)', scale: '.6' }, { filter: 'brightness(1)', scale: '1' }], { duration: 380, easing: 'cubic-bezier(.22,1.4,.36,1)' })).finished.catch(() => {});
      if (gen !== my) return;
    }
    mover.style.zIndex = '';
    if (victim) victim.remove();
    at[capSq] = at[capSq] === victim ? null : at[capSq];
    at[m.to] = mover; at[m.from] = null;
    if (m.flag === 'k' || m.flag === 'q') { const rf = m.flag === 'k' ? m.to + 1 : m.to - 2, rt = m.flag === 'k' ? m.to - 1 : m.to + 1; at[rt] = at[rf]; at[rf] = null; }
    setPosition(after.b);
  }

  // ══════════════════ Marques ══════════════════
  // { selected, targets: [{ sq, cap }], last: [from, to], check, hover, stars: [sq], risk: [sq] }
  function marks({ selected = -1, targets = [], last = null, check = -1, hover = -1, stars = [], risk = [] } = {}) {
    const tg = new Map(targets.map(t => [t.sq, t]));
    squares.forEach((d, s) => {
      d.classList.toggle('sel', s === selected);
      d.classList.toggle('last', !!last && (s === last[0] || s === last[1]));
      d.classList.toggle('hov', s === hover);
      d.classList.toggle('tgt', tg.has(s));
      d.classList.toggle('cap', !!tg.get(s)?.cap);
      d.classList.toggle('star', stars.includes(s));
      d.classList.toggle('risk', risk.includes(s));
      if (s === check && !d.classList.contains('chk')) { d.classList.add('chk'); d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse'); }
      if (s !== check) d.classList.remove('chk', 'pulse');
    });
  }
  // Sélection : la pièce choisie se soulève un peu.
  let lifted = -1;
  function lift(s) {
    if (lifted >= 0) at[lifted]?.classList.remove('up');
    lifted = s;
    if (s >= 0) at[s]?.classList.add('up');
  }
  function refuse(s) {
    const el = at[s];
    if (el && !reduced()) el.animate([{ translate: '0 0' }, { translate: '-7% 0' }, { translate: '7% 0' }, { translate: '-3% 0' }, { translate: '0 0' }], { duration: 220, composite: 'add' });
  }

  // ══════════════════ Viser, glisser ══════════════════
  function pick(x, y) {
    const r = host.getBoundingClientRect();
    const c = Math.floor((x - r.left) / r.width * 8), row = Math.floor((y - r.top) / r.height * 8);
    if (c < 0 || c > 7 || row < 0 || row > 7) return -1;
    return color === 0 ? (7 - row) * 8 + c : row * 8 + (7 - c);
  }
  let dragging = null;
  function dragStart(s) { stopAll(); dragging = at[s] || null; dragging?.classList.add('drag'); }
  function dragTo(x, y) {
    if (!dragging) return;
    const r = host.getBoundingClientRect(), u = r.width / 8;
    const cx = Math.max(-.5, Math.min(7.5, (x - r.left) / u - .5)), cy = Math.max(-.5, Math.min(7.5, (y - r.top) / u - .62));
    dragging.style.transform = `translate(${cx * 100}%, ${cy * 100}%)`;
  }
  function dragCancel() {
    const el = dragging; dragging = null;
    if (!el) return;
    el.classList.remove('drag');
    glide(el, el.style.transform, T(Number(el.dataset.sq)), { lift: 4, ms: 200 });
  }
  function dragEnd() { dragging = null; }
  function screenOf(s) {
    const r = host.getBoundingClientRect(), [c, row] = cell(s), u = r.width / 8;
    return { x: r.left + (c + .5) * u, y: r.top + row * u };
  }

  // ══════════════════ Fins de partie ══════════════════
  // Mat, abandon, temps : le roi vaincu se couche ; la lumière se resserre sur le vainqueur.
  function mate(loser, winner) {
    const k = at[loser];
    squares[winner]?.classList.add('win');
    host.classList.add('over');
    if (!k) return;
    k.classList.add('fallen');
    if (reduced()) return;
    const dir = (loser & 7) < 4 ? 1 : -1;
    track(k.animate([
      { transform: T(loser), offset: 0 },
      { transform: `${T(loser)} translateY(-8%)`, offset: .25 },
      { transform: `${T(loser)} translate(${dir * 18}%, 8%) rotate(${dir * 84}deg)` },
    ], { duration: 900, delay: 250, easing: 'cubic-bezier(.55,0,.6,1)', fill: 'forwards' }));
  }
  function draw(kings) { kings.forEach(s => squares[s]?.classList.add('drawn')); host.classList.add('over'); }
  function clearEnd() {
    host.classList.remove('over');
    squares.forEach(d => d.classList.remove('win', 'drawn'));
    at.forEach((el, s) => { if (el?.classList.contains('fallen')) { el.getAnimations().forEach(a => a.cancel()); place(el, s); } });
  }

  // Ouverture : les pièces tombent sur l'échiquier en vague, rangée après rangée.
  function intro() {
    if (reduced()) return Promise.resolve();
    return Promise.all(at.map((el, s) => {
      if (!el) return null;
      const r = s >> 3, order = r < 4 ? r : 7 - r;
      return track(el.animate([
        { transform: `${T(s)} translateY(-140%)`, opacity: 0 },
        { transform: `${T(s)} translateY(4%)`, opacity: 1, offset: .8 },
        { transform: T(s) },
      ], { duration: 520, delay: order * 120 + (s & 7) * 30 + (r < 4 ? 0 : 60), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'backwards' })).finished.catch(() => {});
    }));
  }

  // Changer de côté : les pièces glissent vers leur nouvelle place.
  function setOrientation(c, animate = true) {
    if (c === color) return;
    color = c;
    layout();
    const turn = animate && !reduced();
    host.classList.toggle('turning', turn);
    at.forEach((el, s) => { if (el) el.style.transform = T(s); });
    if (turn) setTimeout(() => host.classList.remove('turning'), 700);
  }
  layout();

  const noop = () => {};
  return {
    ready: Promise.resolve(), setTheme: noop, setSlot: noop, idle: noop, parallax: noop, paint: noop,
    setOrientation, setPosition, animateMove, marks, lift, refuse, pick, dragStart, dragTo, dragCancel, dragEnd, mate, draw, clearEnd, intro, screenOf,
    inspect: () => ({ pieces: at.filter(Boolean).map(el => el.dataset.p).join(''), color }),
  };
}
