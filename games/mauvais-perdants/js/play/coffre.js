// Coffre : le nombre s'affiche (barre de temps), disparaît, le champ apparaît.
// Entrée valide ; une seule validation par nombre.

import { h } from '../ui/dom.js';
import { lives as livesEl, wait } from './index.js';
import { numberFor, showMs, normalizeDigits, derive, verdictOf, answerMs, START, LIVES, MAX_LEN, TIMEOUT_GRACE_MS } from '../rounds/coffre.js';

export default function mount(root, api) {
  return api.p.mode === 'turns' && api.turn ? mountTurns(root, api) : mountSolo(root, api);
}
// ───────────── À plusieurs : élimination à tour de rôle (voir rounds/coffre.js)
function mountTurns(root, { p, now, startAt, submit, progress, sfx, turn }) {
  const me = turn.me;
  const name = u => (turn.names()[u] || '?');
  const lvl = h('b'), alive = h('b');
  const who = h('div', { class: 'turn-who', 'aria-live': 'polite' });
  const big = h('div', { class: 'bignum' });
  const barFill = h('i'), bar = h('div', { class: 'bar' }, barFill);
  const input = h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '24', 'aria-label': 'Le nombre' });
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const row = h('div', { class: 'answer-row' }, input, btn);
  const fb = h('div', { class: 'feedback' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Chiffres : ', lvl), h('span', {}, 'En lice : ', alive)), who, bar, big, fb, row);
  row.style.visibility = 'hidden';

  let turnN = -1, phase = '', dead = false, finishing = false, timer = null;
  const wrote = new Set();
  const barTo = ms => {
    barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
    barFill.style.transition = `transform ${Math.max(0, ms)}ms linear`; barFill.style.transform = 'scaleX(0)';
  };
  const write = (n, u, r) => { const k = `${n}:${u}`; if (wrote.has(k)) return; wrote.add(k); turn.write(n, u, r); };
  const payloadOf = d => verdictOf(d, me);
  const payload = () => payloadOf(derive(p, turn.log(), startAt));

  function feedbackFor(d) {
    const m = d.lastMove;
    if (!m) { fb.textContent = ''; fb.className = 'feedback'; return; }
    if (m.r === 'o') { fb.className = 'feedback ok'; fb.textContent = `${name(m.u)} : exact.`; }
    else { fb.className = 'feedback ko'; fb.textContent = `${name(m.u)} est éliminé · c’était ${m.num}`; }
  }

  function tick() {
    if (finishing) return;
    const d = derive(p, turn.log(), startAt);
    const t = now();
    lvl.textContent = String(d.len);
    alive.textContent = String(d.alive.length);
    if (d.out[me] !== undefined && !dead) { dead = true; sfx.bad(); }
    if (d.over) {
      finishing = true;
      row.style.visibility = 'hidden';
      big.textContent = d.winner === me ? '🏆' : d.winner ? '—' : '=';
      who.textContent = d.winner ? (d.winner === me ? 'Dernier en lice : tu gagnes la manche !' : `${name(d.winner)} gagne la manche.`) : 'Plus aucun nombre assez long : égalité des survivants.';
      feedbackFor(d);
      progress(d.n);
      setTimeout(() => submit(payloadOf(d)), 2600);
      return;
    }
    if (d.n !== turnN) {
      turnN = d.n; phase = ''; input.value = '';
      progress(d.n);
      feedbackFor(d);
    }
    const shows = showMs(d.len), ans = answerMs(d.len);
    const mine = d.mover === me;
    const dl = d.start + shows + ans;
    if (t < d.start) {
      if (phase !== 'wait') { phase = 'wait'; big.textContent = '…'; row.style.visibility = 'hidden'; barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; }
      who.textContent = dead ? 'Éliminé : tu regardes la suite.' : `Prochain nombre : ${d.len} chiffres`;
    } else if (t < d.start + shows) {
      if (phase !== 'show') { phase = 'show'; big.textContent = d.num; row.style.visibility = 'hidden'; barTo(d.start + shows - t); }
      who.textContent = mine ? 'Retiens-le : c’est à toi !' : `Retiens-le · ${name(d.mover)} le retapera`;
    } else {
      if (phase !== 'answer') {
        phase = 'answer';
        big.textContent = '?'.repeat(Math.min(d.len, 12));
        barTo(dl - t);
        if (mine && !dead) { row.style.visibility = 'visible'; input.focus(); }
      }
      who.textContent = mine ? 'À toi : retape le nombre !' : `${name(d.mover)} tape le nombre…`;
      // Temps écoulé : le joueur s'élimine lui-même ; les autres le font si le sien a disparu.
      if (mine && t > dl) { row.style.visibility = 'hidden'; write(d.n, me, 'x'); }
      else if (!mine && (t > dl + TIMEOUT_GRACE_MS || (!turn.online(d.mover) && t > d.start + shows + TIMEOUT_GRACE_MS))) write(d.n, d.mover, 'x');
    }
  }
  function validate() {
    const d = derive(p, turn.log(), startAt);
    if (d.over || d.mover !== me || phase !== 'answer' || wrote.has(`${d.n}:${me}`)) return;
    const got = normalizeDigits(input.value);
    if (got === null) { fb.className = 'feedback ko'; fb.textContent = 'Des chiffres seulement.'; return; }
    const ok = got === d.num;
    row.style.visibility = 'hidden';
    if (ok) sfx.good(); else sfx.bad();
    write(d.n, me, ok ? 'o' : 'x');
  }
  btn.addEventListener('click', validate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
  timer = setInterval(tick, 100);
  tick();
  return { partial: payload, destroy() { finishing = true; clearInterval(timer); } };
}

// ───────────── Seul (duel contre Gonzague) : chacun son rythme
function mountSolo(root, { p, submit, progress, sfx }) {
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
