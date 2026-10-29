// Coffre : le nombre s'affiche (barre de temps), disparaît, le champ apparaît.
// Entrée valide ; une seule validation par nombre.

import { h } from '../ui/dom.js';
import { lives as livesEl, wait } from './index.js';
import { numberFor, showMs, normalizeDigits, derive, verdictOf, answerMs, START, LIVES, MAX_LEN, TIMEOUT_GRACE_MS } from '../rounds/coffre.js';

// Anti-triche : on ne colle rien dans la case de réponse (ni clic droit, ni Ctrl+V, ni glisser-déposer),
// et le nombre affiché ne se sélectionne ni ne se copie. Un chiffre se tape, c'est tout.
const NO = e => { e.preventDefault(); e.stopPropagation(); };
function noPaste(el) {
  ['paste', 'drop', 'dragover', 'contextmenu', 'cut', 'copy'].forEach(t => el.addEventListener(t, NO));
  el.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && /^[vxcz]$/i.test(e.key)) { e.preventDefault(); } if (e.key === 'Insert' && e.shiftKey) e.preventDefault(); }, true);
  el.addEventListener('input', () => { el.value = el.value.replace(/[^0-9]/g, ''); });
  return el;
}
function noCopy(el) {
  ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(t => el.addEventListener(t, NO));
  el.style.userSelect = 'none'; el.style.webkitUserSelect = 'none';
  return el;
}

export default function mount(root, api) {
  return api.p.mode === 'turns' && api.turn ? mountTurns(root, api) : mountSolo(root, api);
}
// ───────────── À plusieurs : élimination par tours (voir rounds/coffre.js)
// Un tour = tous les joueurs encore en lice jouent une fois, chacun avec SON nombre (même longueur).
// À l'écran : l'ordre de passage (qui a joué, qui joue, qui attend), une bannière « À TOI » ou
// « BOB joue », et pendant que quelqu'un tape, les autres voient ses chiffres arriver.
function mountTurns(root, { p, now, startAt, submit, progress, sfx, turn }) {
  const me = turn.me;
  const name = u => (turn.names()[u] || '?');
  const lvl = h('b'), alive = h('b'), len = h('b');
  const orderEl = h('div', { class: 'cf-order', 'aria-label': 'Ordre de passage' });
  const banner = h('div', { class: 'cf-banner', 'aria-live': 'polite' });
  const big = noCopy(h('div', { class: 'bignum' }));
  const typed = h('div', { class: 'cf-typed', 'aria-label': 'Chiffres tapés par le joueur' });
  const barFill = h('i'), bar = h('div', { class: 'bar' }, barFill);
  const input = noPaste(h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '24', 'aria-label': 'Le nombre' }));
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const row = h('div', { class: 'answer-row' }, input, btn);
  const fb = h('div', { class: 'feedback' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Tour ', lvl, ' · ', len, ' chiffres'), h('span', {}, 'En lice : ', alive)), orderEl, banner, bar, big, typed, fb, row);
  row.style.visibility = 'hidden';

  let turnN = -1, phase = '', dead = false, finishing = false, timer = null, curN = -1, orderKey = '', typedKey = '', lastSent = 0;
  const wrote = new Set();
  const barTo = ms => {
    barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; void barFill.offsetWidth;
    barFill.style.transition = `transform ${Math.max(0, ms)}ms linear`; barFill.style.transform = 'scaleX(0)';
  };
  const write = (n, u, r) => { const k = `${n}:${u}`; if (wrote.has(k)) return; wrote.add(k); turn.write(n, u, r); };
  const payloadOf = d => verdictOf(d, me);
  const payload = () => payloadOf(derive(p, turn.log(), startAt));

  // L'ordre de passage : une pastille par joueur, avec ce qu'il a fait ce tour-ci.
  const TAG = { now: 'joue', ok: 'réussi', ko: 'raté', out: 'éliminé', wait: 'attend' };
  function renderOrder(d) {
    const states = p.order.map(u => {
      const st = d.over ? (d.out[u] !== undefined ? 'out' : 'ok') : d.out[u] !== undefined ? (d.played[u] === 'x' ? 'ko' : 'out') : u === d.mover ? 'now' : d.played[u] === 'o' ? 'ok' : 'wait';
      return [u, st];
    });
    const key = states.map(([u, st]) => `${u}:${st}`).join('|') + `|${d.round}`;
    if (key === orderKey) return;
    orderKey = key;
    orderEl.replaceChildren(...states.map(([u, st]) => h('div', { class: `cf-chip ${st}${u === me ? ' me' : ''}` },
      h('span', { class: 'cf-av', style: { '--pc': turn.color(u) }, text: (name(u)[0] || '?').toUpperCase() }),
      h('b', { text: u === me ? `${name(u)} (toi)` : name(u) }), h('small', { text: TAG[st] }))));
  }
  // Les chiffres que tape le joueur dont c'est le tour, vus par les autres.
  function renderTyped(d, show) {
    let digits = '', key = '';
    if (show && !d.over && d.mover !== me) { const t = turn.typed(d.mover); digits = t && t.k === String(d.n) ? t.d : ''; key = `${d.n}:${d.len}:${digits}`; }
    if (key === typedKey) return;
    typedKey = key;
    if (!key) { typed.replaceChildren(); return; }
    typed.replaceChildren(...Array.from({ length: d.len }, (_, i) => h('span', { class: `cf-slot${digits[i] ? ' on' : ''}`, text: digits[i] || '' })));
  }
  function feedbackFor(d) {
    const m = d.lastMove;
    if (!m) { fb.textContent = ''; fb.className = 'feedback'; return; }
    const t = turn.typed(m.u), got = t && t.k === String(m.n) ? t.d : '';
    if (m.r === 'o') { fb.className = 'feedback ok'; fb.textContent = m.u === me ? 'Exact ! Tu passes.' : `${name(m.u)} : exact.`; }
    else { fb.className = 'feedback ko'; fb.textContent = `${m.u === me ? 'Raté, tu es éliminé' : `${name(m.u)} est éliminé`} · il fallait ${m.num}${got ? `, ${m.u === me ? 'tu as tapé' : 'il a tapé'} ${got}` : ''}`; }
  }
  const say = (txt, cls = '') => { banner.className = `cf-banner ${cls}`; if (banner.textContent !== txt) banner.textContent = txt; };

  function tick() {
    if (finishing) return;
    const d = derive(p, turn.log(), startAt);
    const t = now();
    lvl.textContent = String(d.round + 1);
    len.textContent = String(d.len);
    alive.textContent = String(d.alive.length);
    renderOrder(d);
    if (d.out[me] !== undefined && !dead) { dead = true; sfx.bad(); }
    if (d.over) {
      finishing = true;
      row.style.visibility = 'hidden'; renderTyped(d, false);
      big.textContent = d.winner === me ? 'GAGNÉ' : d.winner ? '—' : '=';
      say(d.winner ? (d.winner === me ? 'Dernier en lice : tu gagnes la manche !' : `${name(d.winner)} gagne la manche.`) : d.alive.length ? 'Plus aucun nombre assez long : égalité des survivants.' : 'Tout le monde a raté le même tour : égalité.', 'end');
      feedbackFor(d);
      progress(d.n);
      setTimeout(() => submit(payloadOf(d)), 2600);
      return;
    }
    if (d.n !== turnN) {
      turnN = d.n; phase = ''; input.value = ''; curN = d.n;
      progress(d.n);
      feedbackFor(d);
    }
    const shows = showMs(d.len), ans = answerMs(d.len);
    const mine = d.mover === me;
    const dl = d.start + shows + ans;
    if (t < d.start) {
      if (phase !== 'wait') { phase = 'wait'; big.textContent = '• • •'; row.style.visibility = 'hidden'; barFill.style.transition = 'none'; barFill.style.transform = 'scaleX(1)'; }
      say(mine ? 'C’est à toi dans un instant…' : `${name(d.mover)} va jouer`, mine ? 'me' : '');
      renderTyped(d, false);
    } else if (t < d.start + shows) {
      // Seul le joueur dont c'est le tour voit son nombre : les autres ne peuvent donc rien en recopier.
      if (phase !== 'show') { phase = 'show'; big.textContent = mine ? d.num : '• '.repeat(d.len).trim(); row.style.visibility = 'hidden'; barTo(d.start + shows - t); }
      say(mine ? 'À TOI ! Retiens ton nombre' : `${name(d.mover)} mémorise son nombre…`, mine ? 'me' : '');
      renderTyped(d, false);
    } else {
      if (phase !== 'answer') {
        phase = 'answer';
        big.textContent = '• '.repeat(d.len).trim();
        fb.textContent = ''; fb.className = 'feedback';
        barTo(dl - t);
        if (mine && !dead) { row.style.visibility = 'visible'; input.focus(); }
      }
      say(mine ? 'À TOI ! Tape ton nombre' : `${name(d.mover)} tape son nombre…`, mine ? 'me' : '');
      renderTyped(d, true);
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
    turn.typing(d.n, got);
    if (ok) sfx.good(); else sfx.bad();
    write(d.n, me, ok ? 'o' : 'x');
  }
  // Chaque frappe est envoyée (au plus une toutes les 120 ms) pour que les autres voient les chiffres arriver.
  input.addEventListener('input', () => {
    if (phase !== 'answer') return;
    const t = Date.now();
    if (t - lastSent < 120) { clearTimeout(input.__t); input.__t = setTimeout(() => { lastSent = Date.now(); turn.typing(curN, input.value); }, 120); return; }
    lastSent = t; turn.typing(curN, input.value);
  });
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
  const big = noCopy(h('div', { class: 'bignum', 'aria-live': 'polite' }));
  const barFill = h('i');
  const bar = h('div', { class: 'bar' }, barFill);
  const input = noPaste(h('input', { class: 'inp', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: '24', 'aria-label': 'Le nombre' }));
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
