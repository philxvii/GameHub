// Contrôleur d'une partie : boucle à pas fixe, rendu interpolé, HUD, panneaux, fenêtres.
// Il ne connaît la simulation qu'au travers d'une « session » (solo ou réseau) :
//   session.mine()      état de mon réseau          session.other()  réseau adverse (Versus)
//   session.submit(cmd) commande (résultat immédiat en solo, différé en réseau)
//   session.update(ms)  fait avancer le temps, renvoie la fraction d'interpolation

import { step, apply, drainEvents, inventory, cfgOf, stationById, stationCapacity, trainCapacity, snapshot, gameDay, shapeName, lineSegments } from './engine/sim.js';
import { MODES, TICK_HZ, COMMON_SHAPES, RARE_SHAPES } from './engine/params.js';
import { seedLabel } from './engine/rng.js';
import { MAP_BY_ID } from './engine/maps.js';
import { Renderer, shapeSVG } from './render.js';
import { Input } from './input.js';

const DT = 1000 / TICK_HZ;
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── session solo : simulation locale, commandes appliquées immédiatement ──
export class LocalSession {
  constructor(st) { this.st = st; this.acc = 0; this.kind = 'solo'; this.log = []; }
  mine() { return this.st; }
  other() { return null; }
  canSpeed() { return true; }
  submit(cmd) {
    const r = apply(this.st, cmd);
    if (r.ok) this.log.push({ tick: this.st.tick, ...cmd });
    return r;
  }
  update(ms) {
    this.acc += Math.min(ms, 250);
    let n = 0;
    while (this.acc >= DT && n < 8) { step(this.st); this.acc -= DT; n++; }
    if (this.acc > DT * 4) this.acc = 0;
    return this.acc / DT;
  }
  destroy() {}
}

export class Game {
  constructor({ session, audio, settings, meta, onEnd, onQuit, onRestart }) {
    this.session = session; this.audio = audio; this.settings = settings; this.meta = meta;
    this.onEnd = onEnd; this.onQuit = onQuit; this.onRestart = onRestart;
    this.renderer = new Renderer($('#map'));
    this.renderer.frameless = this.renderer.W < 720; // petit écran : pas de bord de feuille visible
    this.applySettings(settings);
    this.input = new Input(this);
    this.autoCam = true;
    this.history = []; this.future = [];
    this.lastHud = 0; this.lastMood = 0; this.lastChord = 0; this.lastScore = -1;
    this.ended = false; this.rewardShown = null; this.panelState = null;
    this.peak = { lines: 0, crossings: 0 };
    this.t0 = performance.now();
    this.opp = null;
    session.bind?.(this);
    this.wire();
    this.buildDock();
    this.fit(true);
    this.raf = requestAnimationFrame(t => this.loop(t, t));
    if (settings.hints && session.kind === 'solo' && MODES[this.view().mode].id !== 'creative') this.hint('Glissez d’une station à une autre pour tracer votre première ligne.');
  }

  view() { return this.session.mine(); }
  readOnly() { const st = this.view(); return !!st.over || this.ended || !!this.session.spectator; }

  applySettings(s) {
    this.settings = s;
    const reduced = s.motion === 'reduced' || (s.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.renderer.setOptions({ theme: document.documentElement.dataset.theme === 'night' ? 'night' : 'day', palette: s.palette, contrast: s.contrast, reduced, labels: s.labels });
    this.reduced = reduced;
    if (this.oppR) this.oppR.setOptions({ theme: this.renderer.theme, palette: s.palette, reduced: true });
    if (this.dockBuilt) this.buildDock();
  }

  // ───────── boucle ─────────
  loop(now, prev) {
    if (this.dead) return;
    const dt = now - prev;
    const f = this.session.update(dt);
    const st = this.view();
    const evs = drainEvents(st);
    this.renderer.now = now;
    this.renderer.onEvents(st, evs);
    this.sound(st, evs);
    this.dt = dt;
    if (this.autoCam) this.fit(false);
    else if (this.focus) { const c = this.renderer.cam, k = this.reduced ? 1 : 1 - Math.exp(-dt / 220); c.x += (this.focus.x - c.x) * k; c.y += (this.focus.y - c.y) * k; c.z += (this.focus.z - c.z) * k; }
    this.renderer.frame(st, f, this.input.ui, now);
    const other = this.session.other();
    if (other) { drainEvents(other); this.drawOpponent(other, now); }
    if (now - this.lastHud > 100) { this.hud(st); this.lastHud = now; }
    if (now - this.lastMood > 500) { this.mood(st); this.lastMood = now; }
    this.checkModals(st);
    this.raf = requestAnimationFrame(t => this.loop(t, now));
  }

  sound(st, evs) {
    const a = this.audio;
    for (const e of evs) {
      if (e.k === 'arrive') a.arrive(e.l, e.s);
      else if (e.k === 'board') a.board();
      else if (e.k === 'deliver') a.deliver();
      else if (e.k === 'station') a.station();
      else if (e.k === 'warn') {
        a.warn(); if (this.settings.haptics) navigator.vibrate?.(60);
        const s = stationById(st, e.s);
        if (s && performance.now() - (this.lastWarnToast || 0) > 8000) { this.lastWarnToast = performance.now(); this.toast(`Station ${shapeName(s.shape)} au bord de la saturation !`, 'warn'); }
      }
      else if (e.k === 'reward') a.reward();
      else if (e.k === 'shape') { a.station(); const s = stationById(st, e.s); if (s) this.toast(`Un quartier change de visage : une station devient ${shapeName(e.to)}.`); }
      else if (e.k === 'cmd' && e.type === 'line') a.line(0);
      else if (e.k === 'loco') this.toast('Nouvelle semaine : une locomotive de plus.', 'good');
    }
  }
  mood(st) {
    const lines = st.lines.filter(l => l.s.length >= 2).length;
    const tension = Math.max(0, ...st.stations.map(s => s.o));
    this.audio.mood(Math.min(1, (lines + st.trains.length / 2) / 8), tension > 0.3 ? tension : 0, st.speed === 0);
    if (performance.now() - this.lastChord > 8000) { this.audio.advance(); this.lastChord = performance.now(); }
    const inv = inventory(st);
    this.peak.lines = Math.max(this.peak.lines, inv.used.lines);
    this.peak.crossings = Math.max(this.peak.crossings, inv.used.crossings);
  }

  // ───────── caméra ─────────
  // Zone de carte non couverte par le HUD (mesurée dans le DOM).
  measureSafe() {
    const R = this.renderer, H = R.H, W = R.W;
    const rect = sel => { const e = document.querySelector(sel); return e && !e.hidden && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
    const top = Math.max(rect('#clock')?.bottom || 0, rect('#score-card')?.bottom || 0, rect('#mp-bar')?.bottom || 0);
    const dock = rect('#dock'), cb = rect('#creative-bar'), hr = rect('.hud-right');
    let bottom = dock ? H - dock.top : 80;
    if (cb) bottom = Math.max(bottom, H - cb.top);
    const mobile = W < 720;
    if (mobile && hr) bottom = Math.max(bottom, H - hr.top);
    const right = !mobile && hr ? W - hr.left : 0;
    const opp = rect('#opp');
    R.safe = { t: top + 8, r: right + 8 + (opp && !mobile ? 0 : 0), b: bottom + 8, l: 8 };
    return R.safe;
  }
  fit(snap) {
    const st = this.view();
    const R = this.renderer;
    if (!R.safe || snap) this.measureSafe();
    if (!st.stations.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of st.stations) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    // marge : rayon de station, anneau, file d'attente (jusqu'à 6 glyphes à côté)
    const kk = R.k, w = cfgOf(st).world;
    const px = 60 + 95 * kk, py = 50 + 45 * kk;
    x0 = Math.max(-20, x0 - px); y0 = Math.max(-20, y0 - py); x1 = Math.min(w.w + 20, x1 + px); y1 = Math.min(w.h + 20, y1 + py);
    const mobile = R.W < 720;
    const sf = R.safe;
    const t = R.fitBox(x0, y0, x1, y1, { t: sf.t + 10, r: sf.r + 16, b: sf.b + 10, l: sf.l + 16 });
    t.z = Math.min(t.z, mobile ? 1.15 : 1.5);
    // Petit écran : zoom plancher (stations ≥ 12 px, voyageurs ≥ 8 px à l'écran). Si le
    // réseau ne tient plus, on centre sur les stations les plus chargées ; les autres
    // sont signalées au bord de l'écran et la carte se parcourt au doigt.
    const floor = mobile ? 0.58 : 0.3;
    if (t.z < floor) {
      t.z = floor;
      let wx = 0, wy = 0, ws = 0;
      for (const s of st.stations) { const w = 1 + s.q.length + 10 * s.o; wx += s.x * w; wy += s.y * w; ws += w; }
      const vw = (R.W - sf.l - sf.r) / floor / 2, vh = (R.H - sf.t - sf.b) / floor / 2;
      const ox = (sf.l - sf.r) / 2 / floor, oy = (sf.t - sf.b) / 2 / floor;
      t.x = Math.max(x0 + vw, Math.min(x1 - vw, wx / ws)) - ox;
      t.y = Math.max(y0 + vh, Math.min(y1 - vh, wy / ws)) - oy;
      if (x1 - x0 < vw * 2) t.x = (x0 + x1) / 2 - ox;
      if (y1 - y0 < vh * 2) t.y = (y0 + y1) / 2 - oy;
    }
    const c = R.cam;
    // lissage en temps réel (indépendant du nombre d'images par seconde)
    const k = snap || this.reduced ? 1 : 1 - Math.exp(-Math.min(this.dt || 16, 200) / 160);
    c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.z += (t.z - c.z) * k;
  }
  userCamera() { this.autoCam = false; }
  // Coopération : l'action d'un coéquipier s'éclaire sur la carte.
  peer(c) {
    const st = this.view();
    const ids = c.type === 'line' ? c.s : c.type === 'hub' ? [c.s] : c.type === 'train' ? st.lines[c.l]?.s || [] : [];
    for (const id of ids) this.renderer.ring(st, id, 'peer');
  }

  // ───────── HUD ─────────
  wire() {
    this.handlers = [];
    const on = (el, ev, fn) => { el.addEventListener(ev, fn); this.handlers.push([el, ev, fn]); };
    document.querySelectorAll('#game .sp').forEach(b => on(b, 'click', () => this.setSpeed(Number(b.dataset.speed))));
    on($('#btn-menu'), 'click', () => this.openPause());
    on($('#btn-fit'), 'click', () => { this.autoCam = true; this.fit(false); });
    on($('#btn-mute'), 'click', () => this.toggleMute());
    on($('#btn-theme'), 'click', () => this.switchTheme());
    on(window, 'resize', () => { this.renderer.resize(); this.oppR?.resize(); this.measureSafe(); });
    on(window, 'keydown', e => this.key(e));
    on(document, 'visibilitychange', () => { if (document.hidden && this.settings.pauseOnHide && this.session.kind === 'solo' && this.view().speed) { this.prevSpeed = this.view().speed; this.setSpeed(0); } });
    on($('#dock'), 'pointerdown', e => this.dockDown(e));
    on($('#dock'), 'click', e => this.dockClick(e));
    on($('#panel'), 'click', e => this.panelClick(e));
    on($('#hint'), 'click', () => { this.hint(null); this.hintKind = 'done'; });
    // Créatif
    const M = MODES[this.view().mode];
    $('#creative-bar').hidden = !M.stationEdit;
    if (M.stationEdit) {
      $('#cr-shapes').innerHTML = [...COMMON_SHAPES, ...RARE_SHAPES].map(s => `<button role="radio" aria-checked="${s === 'circle'}" data-shape="${s}" aria-label="${shapeName(s)}" title="${shapeName(s)}">${shapeSVG(s, 18)}</button>`).join('');
      on($('#creative-bar'), 'click', e => this.creativeClick(e));
      this.syncCreative();
    }
    $('#eff').hidden = !M.efficiency;
  }
  unwire() { for (const [el, ev, fn] of this.handlers) el.removeEventListener(ev, fn); }

  hud(st) {
    const cfg = cfgOf(st);
    const day = gameDay(st);
    $('#clock-day').textContent = DAYS[day % 7];
    $('#clock-week').textContent = `Semaine ${st.week + 1}` + (st.mode === 'creative' ? ' · Créatif' : '');
    const wt = cfg.time.dayTicks * cfg.time.daysPerWeek;
    $('#dial-week').style.strokeDasharray = `${((st.t % wt) / wt) * 100} 100`;
    $('#dial-hand').style.transform = `rotate(${((st.t % cfg.time.dayTicks) / cfg.time.dayTicks) * 360}deg)`;
    if (!this.dialBuilt) {
      $('#dial-days').innerHTML = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; return `<line x1="${20 + Math.cos(a) * 12.5}" y1="${20 + Math.sin(a) * 12.5}" x2="${20 + Math.cos(a) * 15}" y2="${20 + Math.sin(a) * 15}"/>`; }).join('');
      this.dialBuilt = true;
    }
    const sc = $('#score');
    if (st.score !== this.lastScore) {
      sc.textContent = st.score;
      if (this.lastScore >= 0 && !this.reduced) { sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
      this.lastScore = st.score;
    }
    const waiting = st.stations.reduce((n, s) => n + s.q.length, 0);
    const warnAt = cfg.overload.warnAt;
    const sat = st.stations.filter(s => s.o > 0);
    const crit = sat.filter(s => s.o >= warnAt).length;
    const al = $('#alert-chip');
    al.hidden = !sat.length || !!st.over;
    if (sat.length) {
      const worst = Math.max(...sat.map(s => s.o));
      al.classList.toggle('crit', crit > 0);
      al.innerHTML = `<i style="--p:${Math.round(worst * 100)}"></i>${crit ? `${crit} critique${crit > 1 ? 's' : ''}` : `${sat.length} saturée${sat.length > 1 ? 's' : ''}`}`;
      al.title = `${sat.length} station(s) au-delà de leur capacité, dont ${crit} en phase critique`;
    }
    const sub = `<span class="ss-map">${esc(MAP_BY_ID[st.map].name)} · ${MODES[st.mode].name}${waiting ? ' · ' : ''}</span>${waiting ? `${waiting} en attente` : ''}`;
    if (this.lastSub !== sub) { $('#score-sub').innerHTML = sub; this.lastSub = sub; }
    // colonne vitesse/menu toujours sous la carte d'état (dont la hauteur varie)
    const hr = document.querySelector('.hud-right');
    if (R_W(this) >= 720) hr.style.top = Math.round($('#score-card').getBoundingClientRect().bottom + 10) + 'px';
    else hr.style.top = '';
    this.measureSafe();
    if (MODES[st.mode].efficiency) {
      const e = $('#eff-fill');
      e.style.width = `${Math.round(st.eff * 100)}%`;
      e.style.background = st.eff < 0.3 ? 'var(--alert)' : st.eff < 0.6 ? 'var(--signal)' : 'var(--ok)';
      $('#eff-val').textContent = `${Math.round(st.eff * 100)} %`;
    }
    document.querySelectorAll('#game .sp').forEach(b => {
      const on = Number(b.dataset.speed) === st.speed;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      b.disabled = !this.session.canSpeed();
    });
    this.updateDock(st);
    if (this.panelState) this.renderPanel();
    if (this.session.hud) this.session.hud();
    if (this.hintKind === 'first' && st.lines.some(l => l.s.length >= 2)) {
      this.hint(st.mode === 'creative' ? null : 'Les voyageurs montent seuls. Surveillez les files : une station qui déborde trop longtemps arrête le service.');
      this.hintKind = 'second'; this.hintAt = st.t;
    } else if (this.hintKind === 'second' && (st.t - this.hintAt > cfg.time.dayTicks || st.score >= 3)) { this.hint(null); this.hintKind = 'done'; }
  }

  buildDock() {
    const st = this.view();
    const cfg = cfgOf(st);
    $('#dock-lines').innerHTML = Array.from({ length: cfg.limits.maxLines }, (_, i) =>
      `<button class="lchip" data-line="${i}" style="--c:${this.renderer.lineColor(st, i)}" aria-label="Ligne ${i + 1}"><i></i>${this.settings.palette === 'cb' || this.settings.labels === 'large' ? `<b>${i + 1}</b>` : ''}</button>`).join('');
    const res = [['loco', 'Locomotive'], ['express', 'Express'], ['car', 'Wagon'], ['bridge', 'Pont ou tunnel'], ['hub', 'Pôle d’échange']];
    $('#dock-res').innerHTML = res.map(([k, n]) => `<button class="res" data-res="${k}" aria-label="${n}" title="${n}"><svg><use href="#i-${k}"/></svg><b>0</b></button>`).join('');
    this.dockBuilt = true;
    this.dockPrev = {};
  }
  updateDock(st) {
    const inv = inventory(st);
    const unl = MODES[st.mode].unlimited;
    const nextFree = st.lines.find(l => l.s.length < 2 && l.id < st.own.lines);
    const peek = st.lines.find(l => l.s.length < 2 && l.id >= st.own.lines);
    document.querySelectorAll('#dock-lines .lchip').forEach(b => {
      const l = st.lines[Number(b.dataset.line)];
      const used = l.s.length >= 2;
      b.classList.toggle('used', used);
      b.classList.toggle('locked', !used && l.id >= st.own.lines);
      b.classList.toggle('next', !!nextFree && nextFree.id === l.id);
      b.classList.toggle('peek', !!peek && peek.id === l.id);
      b.setAttribute('aria-label', `Ligne ${l.id + 1} : ${used ? `${l.s.length} stations` : l.id >= st.own.lines ? 'verrouillée' : 'disponible'}`);
    });
    const vals = { loco: inv.free.locos, express: inv.free.express, car: inv.free.cars, bridge: inv.free.crossings, hub: inv.free.hubs };
    for (const [k, v] of Object.entries(vals)) {
      const b = document.querySelector(`#dock-res [data-res="${k}"]`);
      if (!b) continue;
      if (k === 'express') b.hidden = !st.own.express;
      b.querySelector('b').textContent = unl ? '∞' : v;
      b.classList.toggle('empty', v <= 0);
      if (this.dockPrev[k] !== undefined && v > this.dockPrev[k] && !unl) { b.classList.remove('fresh'); void b.offsetWidth; b.classList.add('fresh'); }
      this.dockPrev[k] = v;
    }
  }

  dockDown(e) {
    const b = e.target.closest('.res');
    if (!b || this.readOnly()) return;
    const k = b.dataset.res;
    if (k === 'bridge') return;
    const st = this.view();
    const inv = inventory(st);
    const free = { loco: inv.free.locos, express: inv.free.express, car: inv.free.cars, hub: inv.free.hubs }[k];
    if (free <= 0) { this.toast(k === 'hub' ? 'Aucun pôle d’échange : choisissez-en un lors d’une récompense.' : k === 'car' ? 'Aucun wagon disponible.' : 'Aucune locomotive disponible.', 'warn'); this.audio.deny(); return; }
    e.preventDefault();
    this.input.startResource(k, e);
  }
  dockClick(e) {
    const st = this.view();
    const lc = e.target.closest('.lchip');
    if (lc) {
      const l = st.lines[Number(lc.dataset.line)];
      if (l.s.length >= 2) this.panel('line', l.id);
      else if (l.id < st.own.lines) this.toast('Ligne disponible : glissez d’une station à une autre pour la tracer.');
      else this.toast('Ligne verrouillée : choisissez « Nouvelle ligne » lors d’une récompense.');
      return;
    }
    const b = e.target.closest('.res');
    if (b && b.dataset.res === 'bridge') this.toast('Les ponts et tunnels se posent d’eux-mêmes quand une ligne traverse l’eau.');
  }
  armed(kind) {
    document.querySelectorAll('#dock-res .res').forEach(b => b.classList.toggle('armed', b.dataset.res === kind));
    if (kind) this.hint({ loco: 'Touchez une ligne pour y poser la locomotive.', express: 'Touchez une ligne pour y poser l’express.', car: 'Touchez un train pour lui atteler le wagon.', hub: 'Touchez une station pour en faire un pôle d’échange.' }[kind], 0);
    else this.hint(null);
  }
  overDock(e) { const r = $('#dock').getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
  ghost(p, kind) {
    const g = $('#ghost');
    if (!p) { g.hidden = true; return; }
    const r = this.renderer.cv.getBoundingClientRect();
    g.hidden = false;
    g.style.left = r.left + p.x + 'px'; g.style.top = r.top + p.y + 'px';
    const icon = kind === 'move' ? 'loco' : kind === 'station' ? 'hub' : kind;
    if (g.dataset.k !== icon) { g.innerHTML = `<svg><use href="#i-${icon}"/></svg>`; g.dataset.k = icon; }
  }

  // ───────── commandes ─────────
  submit(cmd) {
    if (this.readOnly()) return;
    const solo = this.session.kind === 'solo';
    const creative = MODES[this.view().mode].stationEdit;
    let snap = null;
    if (solo && creative && cmd.type !== 'speed') snap = snapshot(this.view());
    const r = this.session.submit(cmd);
    if (r && r.pending) {
      // en réseau : le tracé reste affiché, estompé, jusqu'à son application par le journal
      const pv = this.input.ui.preview;
      if (cmd.type === 'line' && cmd.s.length) this.input.ui.pendingPv = { color: pv ? pv.color : this.renderer.lineColor(this.view(), cmd.l), seq: cmd.s.slice(), loop: cmd.loop, ghost: true };
      return;
    }
    this.result(r, cmd, snap);
  }
  result(r, cmd, snap) {
    if (!r) return;
    if (cmd && cmd.type === 'line') this.input.ui.pendingPv = null;
    if (!r.ok) { this.toast(r.err, 'warn'); this.audio.deny(); return; }
    if (snap) { this.history.push(snap); if (this.history.length > 60) this.history.shift(); this.future = []; }
    if (cmd && cmd.type === 'line') this.audio.line(cmd.l || 0);
    else if (cmd && cmd.type !== 'speed') this.audio.ui();
    this.hint(null);
  }
  setSpeed(v) {
    if (!this.session.canSpeed()) { this.toast('La vitesse est réglée par l’hôte de la partie.'); return; }
    this.submit({ type: 'speed', v });
  }
  undo() {
    if (this.session.kind !== 'solo' || !this.history.length) return;
    this.future.push(snapshot(this.view()));
    this.session.st = this.history.pop();
    this.audio.ui();
  }
  redo() {
    if (this.session.kind !== 'solo' || !this.future.length) return;
    this.history.push(snapshot(this.view()));
    this.session.st = this.future.pop();
    this.audio.ui();
  }
  creativeClick(e) {
    const t = e.target.closest('[data-tool]');
    if (t) { this.input.tool = t.dataset.tool; this.syncCreative(); return; }
    const s = e.target.closest('[data-shape]');
    if (s) { this.input.shape = s.dataset.shape; if (this.input.tool !== 'add') this.input.tool = 'add'; this.syncCreative(); return; }
    if (e.target.closest('#cr-traffic')) this.submit({ type: 'creative', traffic: !this.view().traffic });
    if (e.target.closest('#cr-growth')) this.submit({ type: 'creative', growth: !this.view().growthOn });
    if (e.target.closest('#cr-undo')) this.undo();
    if (e.target.closest('#cr-redo')) this.redo();
    this.syncCreative();
  }
  syncCreative() {
    document.querySelectorAll('#creative-bar [data-tool]').forEach(b => { const on = b.dataset.tool === this.input.tool; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    document.querySelectorAll('#cr-shapes [data-shape]').forEach(b => b.setAttribute('aria-checked', b.dataset.shape === this.input.shape));
    $('#cr-traffic').setAttribute('aria-pressed', this.view().traffic);
    $('#cr-growth').setAttribute('aria-pressed', this.view().growthOn);
  }

  key(e) {
    if (e.target.closest('input, select, textarea')) return;
    if (!$('#m-confirm').hidden || !$('#m-over').hidden) { if (e.key === 'Escape' && !$('#m-confirm').hidden) this.closeConfirm(false); return; }
    if (!$('#m-reward').hidden) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); const st = this.view(); if (st.speed) { this.prevSpeed = st.speed; this.setSpeed(0); } else this.setSpeed(this.prevSpeed || 1); }
    else if (k === '1') this.setSpeed(1);
    else if (k === '2') this.setSpeed(2);
    else if (k === 'Escape') { if (this.panelState || this.input.armed) { this.panel(null); this.input.armed = null; this.armed(null); } else if (!$('#m-pause').hidden) this.closePause(); else this.openPause(); }
    else if (k === 'f' || k === 'F') { this.autoCam = true; }
    else if (k === 'm' || k === 'M') this.toggleMute();
    else if (k === 'n' || k === 'N') this.switchTheme();
    else if (k === '+' || k === '=') this.zoomBy(1.2);
    else if (k === '-') this.zoomBy(1 / 1.2);
    else if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); this.redo(); }
  }
  zoomBy(f) { const R = this.renderer; R.cam.z = Math.max(0.35, Math.min(3.5, R.cam.z * f)); this.userCamera(); }
  switchTheme() {
    if (!this.toggleTheme) return;
    this.toast(this.toggleTheme() ? 'Thème Nuit.' : 'Thème Jour.');
  }
  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.set({ muted: this.settings.muted });
    this.saveSettings?.();
    $('#btn-mute use').setAttribute('href', this.settings.muted ? '#i-mute' : '#i-sound');
    this.toast(this.settings.muted ? 'Son coupé.' : 'Son rétabli.');
  }

  // ───────── messages ─────────
  toast(msg, kind = '') {
    if (!msg) return;
    const box = $('#toasts');
    if ([...box.children].some(t => t.textContent === msg)) return;
    while (box.children.length > 2) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'warn' ? 3200 : 2600);
  }
  hint(text, ms = 0) {
    const h = $('#hint');
    clearTimeout(this.hintTimer);
    if (!text) { h.hidden = true; if (this.hintKind !== 'first') this.hintKind = this.hintKind || null; return; }
    if (!this.hintKind) this.hintKind = 'first';
    h.textContent = text; h.hidden = false;
    if (ms) this.hintTimer = setTimeout(() => { h.hidden = true; }, ms);
  }

  // ───────── panneaux (station, ligne) ─────────
  panel(kind, id) {
    if (!kind) { this.panelState = null; $('#panel').hidden = true; this.input.ui.selStation = null; this.input.ui.selLine = null; return; }
    this.panelState = { kind, id };
    this.renderPanel(true);
  }
  renderPanel(place) {
    const st = this.view();
    const { kind, id } = this.panelState;
    const el = $('#panel');
    const M = MODES[st.mode];
    const inv = inventory(st);
    const ro = this.readOnly();
    let html = '', anchor = null;
    if (kind === 'station') {
      const s = stationById(st, id);
      if (!s) { this.panel(null); return; }
      anchor = s;
      this.input.ui.selStation = s.id;
      const lines = st.lines.filter(l => l.s.includes(s.id));
      const cap = stationCapacity(st, s);
      html = `<h3>${shapeSVG(s.shape, 20, 'var(--card)', 'var(--ink)', 2.4)} Station ${esc(shapeName(s.shape))}${s.hub ? ' <span class="tag">Pôle d’échange</span>' : ''}</h3>
        <p class="pinfo">${s.q.length} / ${cap} voyageurs · ${lines.length ? `${lines.length} ligne${lines.length > 1 ? 's' : ''}` : 'non reliée'}${s.o > 0 ? ` · <b style="color:var(--alert)">saturation ${Math.round(s.o * 100)} %</b>` : ''}</p>
        <div class="pq" aria-label="Destinations en attente">${s.q.slice(0, 24).map(pid => shapeSVG(st.pass[pid].d, 14)).join('') || '<span class="pinfo">File vide</span>'}</div>
        <div class="pacts">`;
      if (!ro && !s.hub && inv.free.hubs > 0) html += `<button class="btn" data-act="hub">${'<svg width="18" height="18"><use href="#i-hub"/></svg>'}Faire un pôle d’échange</button>`;
      if (!ro && s.hub && M.stationEdit) html += `<button class="btn" data-act="hubDel">Retirer le pôle d’échange</button>`;
      if (!ro && !M.locked) for (const l of lines) {
        const rest = l.s.filter(x => x !== s.id);
        html += `<button class="btn" data-act="unlink" data-l="${l.id}">Retirer de la ligne ${l.id + 1}${rest.length < 2 ? ' (la supprime)' : ''}</button>`;
      }
      if (!ro && M.stationEdit) html += `<button class="btn danger" data-act="stDel">Supprimer la station</button>`;
      html += '</div>';
    } else {
      const l = st.lines[id];
      if (!l || l.s.length < 2) { this.panel(null); return; }
      this.input.ui.selLine = l.id;
      const mid = stationById(st, l.s[Math.floor(l.s.length / 2)]);
      anchor = mid;
      const trains = st.trains.filter(t => t.l === l.id);
      const col = this.renderer.lineColor(st, l.id);
      const ride = trains.reduce((n, t) => n + t.ld.length, 0);
      html = `<h3><span class="sw" style="--c:${col}"></span>Ligne ${l.id + 1}${l.loop ? ' · boucle' : ''}</h3>
        <p class="pinfo">${l.s.length} stations · ${trains.length} train${trains.length > 1 ? 's' : ''} · ${ride} à bord</p>
        <div class="trains" style="--c:${col}">${trains.map(t => `<div class="trow"><svg><use href="#i-${t.k === 'express' ? 'express' : 'loco'}"/></svg><span>${t.k === 'express' ? 'Express' : 'Locomotive'}${t.c ? ` + ${t.c} wagon${t.c > 1 ? 's' : ''}` : ''} · ${t.ld.length}/${trainCapacity(st, t)}</span>
          ${!ro && inv.free.cars > 0 && t.c < 3 ? `<button class="icon-btn" data-act="car" data-t="${t.id}" aria-label="Atteler un wagon" title="Atteler un wagon">+</button>` : ''}
          ${!ro && !M.locked && t.c > 0 ? `<button class="icon-btn" data-act="carDel" data-t="${t.id}" aria-label="Dételer un wagon" title="Dételer un wagon">−</button>` : ''}
          ${!ro && !M.locked ? `<button class="icon-btn" data-act="trainDel" data-t="${t.id}" aria-label="Retirer ce train" title="Retirer ce train"><svg width="16" height="16"><use href="#i-close"/></svg></button>` : ''}</div>`).join('') || '<p class="pinfo">Aucun train : déposez une locomotive.</p>'}</div>
        <div class="pacts">`;
      if (!ro && inv.free.locos > 0) html += `<button class="btn" data-act="train"><svg width="18" height="18"><use href="#i-loco"/></svg>Ajouter une locomotive</button>`;
      if (!ro && inv.free.express > 0) html += `<button class="btn" data-act="express"><svg width="18" height="18"><use href="#i-express"/></svg>Ajouter un express</button>`;
      if (!ro && !M.locked && !l.loop && l.s.length >= 3) html += `<button class="btn" data-act="loop">Refermer en boucle</button>`;
      if (!ro && !M.locked && l.loop) html += `<button class="btn" data-act="unloop">Ouvrir la boucle</button>`;
      if (!ro && !M.locked) html += `<button class="btn danger" data-act="lineDel">Supprimer la ligne</button>`;
      if (M.locked) html += `<p class="pinfo">Mode Extrême : la ligne ne peut plus que s’allonger par ses extrémités.</p>`;
      html += '</div>';
    }
    html = `<button class="icon-btn pclose" data-act="close" aria-label="Fermer"><svg width="18" height="18"><use href="#i-close"/></svg></button>` + html;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.hidden = false;
    if (place && anchor) {
      const R = this.renderer, W = R.W, H = R.H, sf = R.safe || this.measureSafe();
      const w = el.offsetWidth, h = el.offsetHeight;
      // obstacle : la station, ou toute la ligne décrite (le panneau ne la couvre pas)
      const ids = kind === 'line' ? st.lines[id].s : [id];
      let ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity;
      for (const sid of ids) { const q = stationById(st, sid); if (!q) continue; const p = R.toScreen(q.x, q.y); ox0 = Math.min(ox0, p.x); oy0 = Math.min(oy0, p.y); ox1 = Math.max(ox1, p.x); oy1 = Math.max(oy1, p.y); }
      ox0 -= 34; oy0 -= 34; ox1 += 70; oy1 += 34;
      const lo = { x: sf.l + 4, y: sf.t + 4 }, hi = { x: W - sf.r - w - 4, y: H - sf.b - h - 4 };
      const clampX = x => Math.max(lo.x, Math.min(hi.x, x)), clampY = y => Math.max(lo.y, Math.min(hi.y, y));
      const cy = (oy0 + oy1) / 2 - h / 2, cx = (ox0 + ox1) / 2 - w / 2;
      const cands = [[ox1 + 10, cy], [ox0 - w - 10, cy], [cx, oy1 + 10], [cx, oy0 - h - 10], [hi.x, lo.y], [lo.x, lo.y], [hi.x, hi.y], [lo.x, hi.y]]
        .map(([x, y]) => [clampX(x), clampY(y)]);
      const overlap = ([x, y]) => Math.max(0, Math.min(x + w, ox1) - Math.max(x, ox0)) * Math.max(0, Math.min(y + h, oy1) - Math.max(y, oy0));
      let best = cands[0], bo = Infinity;
      for (const c of cands) { const o = overlap(c); if (o < bo - 1) { bo = o; best = c; } }
      el.style.bottom = 'auto';
      el.style.left = best[0] + 'px'; el.style.top = best[1] + 'px';
    }
  }
  panelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const st = this.view();
    const { kind, id } = this.panelState || {};
    const a = b.dataset.act;
    if (a === 'close') return this.panel(null);
    if (kind === 'station') {
      if (a === 'hub') this.submit({ type: 'hub', s: id });
      if (a === 'hubDel') this.submit({ type: 'hubDel', s: id });
      if (a === 'stDel') { this.submit({ type: 'stDel', s: id }); this.panel(null); }
      if (a === 'unlink') {
        const l = st.lines[Number(b.dataset.l)];
        const rest = l.s.filter(x => x !== id);
        if (rest.length < 2) this.confirmDeleteLine(l.id);
        else this.submit({ type: 'line', l: l.id, s: rest, loop: l.loop && rest.length >= 3, rev: l.rev });
      }
    } else if (kind === 'line') {
      const l = st.lines[id];
      if (a === 'train') this.submit({ type: 'train', l: id, kind: 'base' });
      if (a === 'express') this.submit({ type: 'train', l: id, kind: 'express' });
      if (a === 'car') this.submit({ type: 'car', tr: Number(b.dataset.t) });
      if (a === 'carDel') this.submit({ type: 'carDel', tr: Number(b.dataset.t) });
      if (a === 'trainDel') this.submit({ type: 'trainDel', tr: Number(b.dataset.t) });
      if (a === 'loop') this.submit({ type: 'line', l: id, s: l.s, loop: true, rev: l.rev });
      if (a === 'unloop') this.submit({ type: 'line', l: id, s: l.s, loop: false, rev: l.rev });
      if (a === 'lineDel') this.confirmDeleteLine(id);
    }
    if (this.panelState) this.renderPanel();
  }
  confirmDeleteLine(l) {
    const st = this.view();
    const line = st.lines[l];
    this.confirm(`Supprimer la ligne ${l + 1} ? Ses trains reviennent dans l’inventaire et ses voyageurs descendent à la station la plus proche.`, () => {
      this.submit({ type: 'line', l, s: [], rev: line.rev }); this.panel(null);
    }, 'Supprimer');
  }

  // ───────── fenêtres ─────────
  confirm(text, yes, label = 'Confirmer') {
    $('#cf-text').textContent = text;
    $('#cf-yes').textContent = label;
    $('#m-confirm').hidden = false;
    this.confirmYes = yes;
    $('#cf-yes').onclick = () => this.closeConfirm(true);
    $('#cf-no').onclick = () => this.closeConfirm(false);
    $('#cf-no').focus();
  }
  closeConfirm(ok) { $('#m-confirm').hidden = true; const f = this.confirmYes; this.confirmYes = null; if (ok && f) f(); }

  openPause() {
    const st = this.view();
    if (this.session.kind === 'solo' && st.speed) { this.prevSpeed = st.speed; this.submit({ type: 'speed', v: 0 }); }
    $('#pa-sub').textContent = this.session.kind === 'solo' ? 'Partie en pause' : 'Le temps continue pour les autres joueurs';
    $('#pa-seed').textContent = `Graine ${seedLabel(st.seed)} · ${MAP_BY_ID[st.map].name} · ${MODES[st.mode].name}`;
    document.querySelector('#m-pause [data-act="restart"]').hidden = this.session.kind !== 'solo';
    $('#m-pause').hidden = false;
    $('#m-pause .btn').focus();
    $('#m-pause').onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target.id === 'm-pause') this.closePause(); return; }
      const a = b.dataset.act;
      if (a === 'resume') this.closePause();
      else if (a === 'settings' || a === 'help') this.onSheet?.(a);
      else if (a === 'photo') this.exportImage();
      else if (a === 'restart') {
        const go = () => { this.closePause(); this.onRestart(); };
        if (this.settings.confirmRestart) this.confirm('Recommencer la partie ? Le score actuel sera perdu.', go, 'Recommencer'); else go();
      } else if (a === 'quit') this.confirm(this.session.kind === 'versus' ? 'Quitter le duel ? Un abandon compte comme une défaite.' : 'Quitter la partie et revenir à l’accueil ?', () => { $('#m-pause').hidden = true; this.quit(); }, 'Quitter');
    };
  }
  closePause() {
    $('#m-pause').hidden = true;
    if (this.session.kind === 'solo' && this.view().speed === 0 && !this.view().over) this.submit({ type: 'speed', v: this.prevSpeed || this.settings.speed || 1 });
  }

  checkModals(st) {
    // récompense
    if (st.reward && this.rewardShown !== st.reward.at) this.showReward(st);
    if (!st.reward && this.rewardShown !== null && !$('#m-reward').hidden) { $('#m-reward').hidden = true; this.rewardShown = null; }
    // fin
    const res = this.session.result ? this.session.result() : st.over ? { solo: true } : null;
    if (res && !this.ended) {
      this.ended = true;
      const bad = st.over && stationById(st, st.over.s);
      if (bad) { this.autoCam = false; this.focus = { x: bad.x, y: bad.y, z: Math.max(this.renderer.cam.z, 1.25) }; this.input.ui.selStation = bad.id; }
      this.endTimer = setTimeout(() => this.showOver(st, res), bad ? 1500 : 900); this.audio.over(); if (this.settings.haptics) navigator.vibrate?.([80, 60, 120]); this.input.abort(); this.panel(null); }
  }

  showReward(st) {
    this.rewardShown = st.reward.at;
    const r = st.reward;
    const cfg = cfgOf(st);
    const INFO = {
      line: ['line', 'Nouvelle ligne', 'Une couleur de plus pour ouvrir un itinéraire.'],
      carriage: ['car', r => (r.n > 1 ? `${r.n} wagons` : 'Wagon'), `+${cfg.capacity.carriageBonus} places sur un train.`],
      crossings: ['bridge', r => `${r.n} pont${r.n > 1 ? 's' : ''} ou tunnel${r.n > 1 ? 's' : ''}`, 'Pour franchir rivières et bras de mer.'],
      hub: ['hub', 'Pôle d’échange', `${cfg.capacity.interchange} places et correspondances rapides.`],
    };
    $('#rw-week').textContent = MODES[st.mode].efficiency ? 'Réseau efficace' : `Fin de la semaine ${st.week}`;
    $('#rw-granted').textContent = r.granted ? `Vous recevez ${r.granted > 1 ? `${r.granted} locomotives` : 'une locomotive'}. Choisissez une amélioration :` : r.loco ? 'Choisissez votre matériel, puis une amélioration :' : 'Choisissez une amélioration :';
    this.locoPick = 0;
    $('#rw-step1').hidden = $('#rw-step2').hidden = !r.loco;
    $('#rw-loco').innerHTML = r.loco ? r.loco.map((o, i) => `<button class="rw-opt ${i === 0 ? 'sel' : ''}" data-loco="${i}" aria-pressed="${i === 0}"><svg><use href="#i-${o.k === 'express' ? 'express' : 'loco'}"/></svg><strong>${o.k === 'express' ? `${o.n} express` : `${o.n} locomotives`}</strong><span>${o.k === 'express' ? 'Plus rapide sur les longues lignes.' : 'Deux trains classiques.'}</span></button>`).join('') : '';
    $('#rw-opts').innerHTML = r.opts.map((o, i) => {
      const [ic, name, desc] = INFO[o.k];
      return `<button class="rw-opt" data-pick="${i}"><svg><use href="#i-${ic}"/></svg><strong>${typeof name === 'function' ? name(o) : name}</strong><span>${desc}</span></button>`;
    }).join('') || '<button class="btn primary" data-pick="0">Continuer</button>';
    $('#m-reward').hidden = false;
    $('#m-reward').onclick = e => {
      const lo = e.target.closest('[data-loco]');
      if (lo) { this.locoPick = Number(lo.dataset.loco); document.querySelectorAll('#rw-loco .rw-opt').forEach(b => { const on = b === lo; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }); return; }
      const p = e.target.closest('[data-pick]');
      if (!p) return;
      $('#m-reward').hidden = true;
      this.submit({ type: 'reward', pick: Number(p.dataset.pick), loco: this.locoPick });
    };
    setTimeout(() => document.querySelector('#rw-opts [data-pick]')?.focus(), 50);
  }

  showOver(st, res) {
    const run = this.runSummary(st);
    const out = this.onEnd ? this.onEnd(run, res) : null;
    const s = stationById(st, st.over?.s);
    const day = gameDay(st);
    let title = 'Station saturée', eyebrow = 'Fin de service', cause = '';
    if (s) cause = `La station ${shapeName(s.shape)} (cerclée sur la carte) a débordé ${DAYS[(st.over ? Math.floor(st.over.t / cfgOf(st).time.dayTicks) : day) % 7].toLowerCase()}, semaine ${st.week + 1}.`;
    if (res.versus) {
      eyebrow = 'Duel terminé';
      title = res.outcome === 'win' ? 'Victoire' : res.outcome === 'lose' ? 'Défaite' : 'Égalité';
      cause = res.text;
    } else if (res.coop) { eyebrow = 'Service collectif terminé'; cause = (cause ? cause + ' ' : '') + (res.text || ''); }
    if (st.over && st.over.reason === 'forfeit' && !res.versus) { title = 'Abandon'; cause = res.text || 'Partie abandonnée.'; }
    $('#ov-eyebrow').textContent = eyebrow;
    $('#t-ov').textContent = title;
    $('#ov-score').textContent = st.score;
    $('#ov-unit').textContent = st.score > 1 ? 'voyageurs livrés' : 'voyageur livré';
    $('#ov-cause').textContent = cause;
    const badges = [];
    if (out && out.best) badges.push('Nouveau record');
    if (out && out.official !== null && out.official !== undefined) badges.push('Score officiel du défi');
    if (out && out.practice) badges.push('Entraînement (score officiel déjà enregistré)');
    if (out && out.saveFailed) badges.push('Sauvegarde locale impossible');
    for (const a of (out && out.achievements) || []) badges.push('Succès : ' + a.name);
    $('#ov-badges').innerHTML = badges.map(b => `<span class="tag">${esc(b)}</span>`).join('');
    const inv = inventory(st);
    const left = Object.keys(st.pass).length;
    const stats = [
      ['Semaines tenues', st.week + 1], ['Stations', st.stations.length], ['Lignes', inv.used.lines], ['Locomotives', st.trains.length],
      ['Wagons', inv.used.cars], ['Ponts et tunnels', inv.used.crossings], ['Correspondances', st.stats.transfers], ['Voyageurs restants', left],
      ['File la plus longue', st.stats.peak.q], ['Durée réelle', fmtDur(performance.now() - this.t0)], ['Graine', seedLabel(st.seed)],
    ];
    $('#ov-stats').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    $('#ov-again').textContent = this.session.kind === 'solo' ? (this.meta.challenge ? 'Rejouer (entraînement)' : 'Rejouer') : this.session.host ? 'Revanche' : 'Attendre la revanche';
    $('#ov-again').disabled = this.session.kind !== 'solo' && !this.session.host;
    $('#ov-again').onclick = () => { $('#m-over').hidden = true; this.onRestart(); };
    $('#ov-menu').onclick = () => { $('#m-over').hidden = true; this.quit(); };
    $('#m-over').classList.toggle('center', !!res.versus || !s);
    $('#m-over').hidden = false;
    $('#ov-again').focus();
  }

  runSummary(st) {
    return {
      map: st.map, mode: st.mode, score: st.score, week: st.week + 1, seed: st.seed, date: new Date().toISOString().slice(0, 10),
      maxLines: this.peak.lines, maxCrossings: this.peak.crossings, hubs: st.stats.hubs, loops: st.stats.loops,
    };
  }

  // Export d'une image propre de la carte (sans interface).
  exportImage() {
    const st = this.view();
    const cv = document.createElement('canvas');
    const R = new Renderer(cv, { w: 1920, h: 1200 });
    R.setOptions({ theme: this.renderer.theme, palette: this.renderer.palette, reduced: true, labels: this.settings.labels });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of st.stations) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    Object.assign(R.cam, R.fitBox(x0 - 120, y0 - 120, x1 + 160, y1 + 120, { t: 60, r: 60, b: 90, l: 60 }));
    R.now = performance.now();
    R.frame(st, 0, null, R.now);
    const c = R.ctx, T = this.renderer.theme === 'night' ? '#ECE7DB' : '#1E232B';
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.fillStyle = T; c.font = '800 34px "Bricolage Grotesque", sans-serif'; c.textBaseline = 'alphabetic';
    c.fillText('Mini Subway', 56, 1200 - 52);
    c.font = '500 18px "IBM Plex Mono", monospace';
    c.fillText(`${MAP_BY_ID[st.map].name} · ${st.score} voyageurs · semaine ${st.week + 1}`, 290, 1200 - 56);
    cv.toBlob(b => {
      if (!b) { this.toast('Export impossible dans ce navigateur.', 'warn'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `mini-subway-${st.map}-${seedLabel(st.seed)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('Image de la carte exportée.', 'good');
    });
  }

  // ───────── Versus : réseau adverse en lecture seule ─────────
  drawOpponent(other, now) {
    if (!this.oppR) {
      $('#opp').hidden = false;
      this.oppR = new Renderer($('#opp-canvas'));
      this.oppR.setOptions({ theme: this.renderer.theme, palette: this.settings.palette, reduced: true });
    }
    if (now - (this.oppLast || 0) < 100) return;
    this.oppLast = now;
    const R = this.oppR;
    R.resize();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of other.stations) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    Object.assign(R.cam, R.fitBox(x0 - 80, y0 - 80, x1 + 120, y1 + 80, { t: 6, r: 6, b: 6, l: 6 }));
    R.now = now;
    R.frame(other, 0, null, now);
    $('#opp-score').textContent = other.score;
  }

  quit() { this.destroy(); this.onQuit(); }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.endTimer);
    this.unwire();
    this.input.destroy();
    this.session.destroy();
    this.panel(null);
    this.hint(null);
    $('#opp').hidden = true;
    for (const id of ['#m-reward', '#m-pause', '#m-over', '#m-confirm']) $(id).hidden = true;
    $('#toasts').innerHTML = '';
  }
}

const R_W = g => g.renderer.W;
function fmtDur(ms) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; }
void lineSegments;
