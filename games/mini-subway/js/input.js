// Contrôles de la carte : souris, tactile et stylet (Pointer Events).
//  - glisser depuis une station : nouvelle ligne (repasser sur la station précédente
//    revient en arrière ; revenir à la première station ferme une boucle) ;
//  - glisser la barre d'extrémité d'une ligne : prolonger ou raccourcir ;
//  - glisser le milieu d'un tronçon sur une station : l'insérer dans la ligne ;
//  - glisser un train sur une autre ligne : le réaffecter ;
//  - glisser (ou toucher puis toucher) une ressource du dock vers sa cible ;
//  - glisser dans le vide : déplacer la carte ; molette / pincement : zoom.
// Un simple toucher sur une station, une ligne ou un train ouvre son panneau.

import { segment, inventory, stationById, lineSegments } from './engine/sim.js';
import { MODES } from './engine/params.js';

const TAP = 7;

export class Input {
  constructor(game) {
    this.g = game;
    this.cv = game.renderer.cv;
    this.ptrs = new Map();
    this.drag = null;
    this.armed = null; // ressource sélectionnée au toucher : { kind }
    this.tool = 'build'; // Créatif : build | add | move | erase
    this.shape = 'circle';
    this.ui = { preview: null, hover: null, targets: null, selLine: null, selTrain: null, selStation: null, dimLines: false };
    const c = this.cv;
    c.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', this.onMove = e => this.move(e));
    window.addEventListener('pointerup', this.onUp = e => this.up(e));
    window.addEventListener('pointercancel', this.onCancel = e => this.cancel(e));
    c.addEventListener('wheel', e => this.wheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }
  destroy() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
  }

  get st() { return this.g.view(); }
  get R() { return this.g.renderer; }
  get readOnly() { return this.g.readOnly(); }
  local(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  world(e) { const p = this.local(e); return this.R.toWorld(p.x, p.y); }

  down(e) {
    if (e.button === 2) return;
    this.cv.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 2) { // pincement : annule tout tracé en cours
      this.abort();
      const [a, b] = [...this.ptrs.values()];
      this.drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: this.R.cam.z, c: this.R.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
      return;
    }
    if (this.ptrs.size > 2) return;
    const w = this.R.toWorld(p.x, p.y);
    const st = this.st;
    const base = { x0: p.x, y0: p.y, moved: false, id: e.pointerId, w0: w };
    if (this.armed && !this.readOnly) { this.drag = { ...base, kind: 'armed' }; return; }
    if (this.readOnly) { this.drag = { ...base, kind: 'pan', cam0: { ...this.R.cam } }; return; }
    const M = MODES[st.mode];
    if (M.stationEdit && this.tool !== 'build') {
      const s = this.R.stationAt(st, w.x, w.y);
      if (this.tool === 'move' && s) { this.drag = { ...base, kind: 'moveStation', s: s.id }; return; }
      this.drag = { ...base, kind: this.tool === 'add' ? 'addStation' : this.tool === 'erase' ? 'erase' : 'pan', s: s && s.id, cam0: { ...this.R.cam } };
      return;
    }
    const term = this.R.terminalAt(st, w.x, w.y);
    const s = this.R.stationAt(st, w.x, w.y);
    if (term && !(s && (s.x - w.x) ** 2 + (s.y - w.y) ** 2 < (12 * this.R.k) ** 2)) { this.drag = { ...base, kind: 'terminal', term }; return; }
    if (s) { this.drag = { ...base, kind: 'station', s: s.id }; return; }
    const t = this.R.trainAt(st, w.x, w.y);
    if (t) { this.drag = { ...base, kind: 'train', t: t.id }; return; }
    const seg = this.R.segmentAt(st, w.x, w.y);
    if (seg) { this.drag = { ...base, kind: 'segment', seg }; return; }
    this.drag = { ...base, kind: 'pan', cam0: { ...this.R.cam } };
  }

  move(e) {
    const st = this.st;
    if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, this.local(e));
    const d = this.drag;
    if (!d) { this.hoverAt(e); return; }
    if (d.kind === 'pinch') {
      const [a, b] = [...this.ptrs.values()];
      if (!a || !b) return;
      const z = Math.max(0.35, Math.min(3.5, d.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, d.d0)));
      this.zoomAround(d.c, (a.x + b.x) / 2, (a.y + b.y) / 2, z);
      return;
    }
    if (d.id !== e.pointerId && !(d.kind === 'res')) return;
    const p = this.local(e);
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) > TAP) { d.moved = true; this.begin(d); }
    if (!d.moved) return;
    const w = this.R.toWorld(p.x, p.y);
    if (d.kind === 'pan') {
      const c = this.R.cam;
      c.x = d.cam0.x - (p.x - d.x0) / c.z; c.y = d.cam0.y - (p.y - d.y0) / c.z;
      this.g.userCamera();
    } else if (d.kind === 'draw') this.extendDraw(d, w);
    else if (d.kind === 'insert') {
      const s = this.R.stationAt(st, w.x, w.y);
      const okS = s && !st.lines[d.l].s.includes(s.id);
      this.ui.hover = okS ? s.id : null;
      this.ui.preview.cursor = okS ? { x: s.x, y: s.y } : w;
    } else if (d.kind === 'trainDrag' || d.kind === 'res' || d.kind === 'armedDrag') {
      this.ui.preview = null;
      this.targetAt(d.res || 'move', w);
      this.g.ghost(p, d.res || 'loco');
    } else if (d.kind === 'moveStation') this.ui.preview = null, this.g.ghost(p, 'station');
  }

  // Le geste devient un glissé : on décide de son sens.
  begin(d) {
    const st = this.st;
    const M = MODES[st.mode];
    if (d.kind === 'station') {
      const l = st.lines.find(x => x.s.length < 2 && x.id < st.own.lines);
      if (!l) { this.g.toast('Toutes vos lignes sont posées : prolongez-en une par son extrémité.', 'warn'); d.kind = 'none'; return; }
      Object.assign(d, { kind: 'draw', l: l.id, seq: [d.s], loop: false, orig: [], rev: l.rev, fresh: true });
      this.ui.preview = { color: this.R.lineColor(st, l.id), seq: d.seq, loop: false, from: d.s, cursor: null };
      this.ui.targets = new Set(st.stations.map(s => s.id));
    } else if (d.kind === 'terminal') {
      const line = st.lines[d.term.l];
      const seq = d.term.end === 1 ? line.s.slice() : line.s.slice().reverse();
      Object.assign(d, { kind: 'draw', l: line.id, seq, loop: false, orig: seq.slice(), rev: line.rev, reversed: d.term.end === 0, locked: M.locked });
      this.ui.preview = { color: this.R.lineColor(st, line.id), seq, loop: false, from: seq[seq.length - 1], cursor: null };
      this.ui.selLine = line.id; this.ui.dimLines = true;
    } else if (d.kind === 'segment') {
      if (M.locked) { this.g.toast('Mode Extrême : un tracé posé ne se modifie plus.', 'warn'); d.kind = 'none'; return; }
      const sa = stationById(st, d.seg.a), sb = stationById(st, d.seg.b);
      Object.assign(d, { kind: 'insert', l: d.seg.l, a: d.seg.a, b: d.seg.b, rev: st.lines[d.seg.l].rev });
      this.ui.preview = { color: this.R.lineColor(st, d.l), seq: [], insert: { ax: sa.x, ay: sa.y, bx: sb.x, by: sb.y }, cursor: d.w0 };
      this.ui.selLine = d.l; this.ui.dimLines = true;
    } else if (d.kind === 'train') {
      if (M.locked) { this.g.toast('Mode Extrême : une locomotive posée ne se déplace plus.', 'warn'); d.kind = 'none'; return; }
      d.kind = 'trainDrag'; d.res = 'move';
      this.ui.selTrain = d.t;
    } else if (d.kind === 'armed') {
      d.kind = 'armedDrag'; d.res = this.armed.kind;
    }
  }

  extendDraw(d, w) {
    const st = this.st;
    const s = this.R.stationAt(st, w.x, w.y, 22);
    const pv = this.ui.preview;
    pv.cursor = w;
    this.ui.hover = s ? s.id : null;
    if (!s) return;
    const seq = d.seq, last = seq[seq.length - 1];
    if (s.id === last) return;
    if (d.loop) { if (s.id === seq[seq.length - 1] || s.id === seq[0]) return; d.loop = false; }
    if (seq.length >= 2 && s.id === seq[seq.length - 2]) {
      if (d.locked && seq.length <= d.orig.length) { this.g.toast('Mode Extrême : on ne raccourcit pas une ligne posée.', 'warn'); return; }
      seq.pop(); this.g.audio.ui();
    } else if (s.id === seq[0] && seq.length >= 3) {
      if (d.locked) { this.g.toast('Mode Extrême : une ligne ouverte ne se referme pas en boucle.', 'warn'); return; }
      d.loop = true; this.g.audio.ui();
    } else if (!seq.includes(s.id)) {
      // franchissement : refuse l'ajout s'il manque un pont
      const need = crossingsFor(st, seq.concat(s.id), false);
      const inv = inventory(st);
      const other = inv.used.crossings - crossingsFor(st, st.lines[d.l].s, st.lines[d.l].loop);
      if (other + need > st.own.crossings) {
        pv.bad = true;
        if (!d.warned) { this.g.toast('Il manque un pont ou un tunnel pour traverser l’eau.', 'warn'); this.g.audio.deny(); d.warned = true; }
        return;
      }
      pv.bad = false;
      seq.push(s.id); this.g.audio.ui();
    }
    pv.seq = seq; pv.loop = d.loop; pv.from = seq[seq.length - 1];
  }

  targetAt(kind, w) {
    const st = this.st;
    this.ui.targets = null; this.ui.selLine = null; this.ui.selTrain = null; this.ui.hover = null;
    if (kind === 'loco' || kind === 'express' || kind === 'move') {
      const seg = this.R.segmentAt(st, w.x, w.y) || this.lineAtStation(w);
      this.ui.dimLines = true;
      if (seg) this.ui.selLine = seg.l;
    } else if (kind === 'car') {
      const t = this.R.trainAt(st, w.x, w.y);
      if (t) this.ui.selTrain = t.id;
    } else if (kind === 'hub') {
      const s = this.R.stationAt(st, w.x, w.y);
      this.ui.targets = new Set(st.stations.filter(x => !x.hub).map(x => x.id));
      if (s && !s.hub) this.ui.hover = s.id;
    }
  }
  lineAtStation(w) {
    const st = this.st;
    const s = this.R.stationAt(st, w.x, w.y);
    if (!s) return null;
    const l = st.lines.find(x => x.s.includes(s.id));
    return l ? { l: l.id, a: s.id } : null;
  }

  up(e) {
    this.ptrs.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pinch') { if (this.ptrs.size < 2) this.drag = null; return; }
    if (d.id !== e.pointerId && d.kind !== 'res') return;
    const p = this.local(e);
    const w = this.R.toWorld(p.x, p.y);
    const st = this.st;
    this.drag = null;
    this.g.ghost(null);
    if (d.kind === 'res' && !d.moved) { this.resourceTap(d.res); return; }
    const done = () => { this.ui.preview = null; this.ui.targets = null; this.ui.hover = null; this.ui.dimLines = false; this.ui.selLine = null; this.ui.selTrain = null; };
    if (!d.moved && d.kind !== 'res') { done(); this.tap(d, w); return; }
    if (d.kind === 'draw') {
      let seq = d.seq.slice();
      if (d.reversed) seq.reverse();
      const changed = seq.join() !== (d.reversed ? d.orig.slice().reverse() : d.orig).join() || d.loop;
      if (seq.length >= 2 && changed) this.g.submit({ type: 'line', l: d.l, s: seq, loop: d.loop, rev: d.rev });
      else if (seq.length < 2 && d.orig.length >= 2) this.g.confirmDeleteLine(d.l);
    } else if (d.kind === 'insert') {
      const s = this.R.stationAt(st, w.x, w.y);
      const line = st.lines[d.l];
      if (s && !line.s.includes(s.id)) {
        const seq = line.s.slice();
        const ia = seq.indexOf(d.a), ib = seq.indexOf(d.b);
        let at;
        if (Math.abs(ia - ib) === 1) at = Math.max(ia, ib);
        else at = seq.length; // tronçon de bouclage : en fin de liste
        seq.splice(at, 0, s.id);
        this.g.submit({ type: 'line', l: d.l, s: seq, loop: line.loop, rev: d.rev });
      }
    } else if (d.kind === 'trainDrag') {
      const seg = this.R.segmentAt(st, w.x, w.y) || this.lineAtStation(w);
      if (seg) this.g.submit({ type: 'trainMove', tr: d.t, l: seg.l, at: nearestOnLine(st, seg.l, w) });
    } else if (d.kind === 'res' || d.kind === 'armedDrag') {
      this.dropResource(d.res, w, e);
    } else if (d.kind === 'moveStation') {
      this.g.submit({ type: 'stMove', s: d.s, x: w.x, y: w.y });
    }
    done();
  }

  cancel(e) { this.ptrs.delete(e.pointerId); this.abort(); }
  abort() {
    this.drag = null; this.g.ghost(null);
    Object.assign(this.ui, { preview: null, targets: null, hover: null, dimLines: false, selLine: null, selTrain: null });
  }

  tap(d, w) {
    const st = this.st;
    if (d.kind === 'armed') { this.dropResource(this.armed.kind, w); return; }
    if (d.kind === 'addStation') { this.g.submit({ type: 'stAdd', x: w.x, y: w.y, shape: this.shape }); return; }
    if (d.kind === 'erase') {
      if (d.s) this.g.submit({ type: 'stDel', s: d.s });
      else { const seg = this.R.segmentAt(st, w.x, w.y); if (seg) this.g.submit({ type: 'line', l: seg.l, s: [] }); }
      return;
    }
    if (d.kind === 'station' || d.kind === 'moveStation') { this.g.panel('station', d.s); return; }
    if (d.kind === 'train') { const t = st.trains.find(x => x.id === d.t); if (t) this.g.panel('line', t.l); return; }
    if (d.kind === 'segment') { this.g.panel('line', d.seg.l); return; }
    if (d.kind === 'terminal') { this.g.panel('line', d.term.l); return; }
    this.g.panel(null);
  }

  // Dépose une ressource sur la cible sous le pointeur.
  dropResource(kind, w, e) {
    const st = this.st;
    this.armed = null; this.g.armed(null);
    if (e && this.g.overDock(e)) return;
    if (kind === 'loco' || kind === 'express') {
      const seg = this.R.segmentAt(st, w.x, w.y) || this.lineAtStation(w);
      if (!seg) { this.g.toast('Déposez la locomotive sur une ligne.', 'warn'); return; }
      this.g.submit({ type: 'train', l: seg.l, at: nearestOnLine(st, seg.l, w), kind: kind === 'express' ? 'express' : 'base' });
    } else if (kind === 'car') {
      const t = this.R.trainAt(st, w.x, w.y);
      if (!t) { this.g.toast('Déposez le wagon sur un train.', 'warn'); return; }
      this.g.submit({ type: 'car', tr: t.id });
    } else if (kind === 'hub') {
      const s = this.R.stationAt(st, w.x, w.y);
      if (!s) { this.g.toast('Déposez le pôle d’échange sur une station.', 'warn'); return; }
      this.g.submit({ type: 'hub', s: s.id });
    }
  }

  // Ressource saisie dans le dock : glisser, ou toucher puis toucher la cible.
  startResource(kind, e) {
    this.abort();
    const p = this.local(e);
    this.drag = { kind: 'res', res: kind, x0: p.x, y0: p.y, moved: false, id: e.pointerId, fromDock: true };
    this.ptrs.set(e.pointerId, p);
  }
  resourceTap(kind) {
    this.drag = null;
    this.armed = { kind };
    this.g.armed(kind);
  }

  hoverAt(e) {
    if (e.pointerType !== 'mouse') return;
    const st = this.st;
    if (!st) return;
    const w = this.world(e);
    const s = this.R.stationAt(st, w.x, w.y);
    const term = this.R.terminalAt(st, w.x, w.y);
    const seg = !s && !term && this.R.segmentAt(st, w.x, w.y);
    const t = !s && this.R.trainAt(st, w.x, w.y);
    this.cv.style.cursor = this.armed ? 'copy' : s || term ? 'crosshair' : t || seg ? 'grab' : 'default';
  }

  wheel(e) {
    e.preventDefault();
    const p = this.local(e);
    const c = this.R.toWorld(p.x, p.y);
    const z = Math.max(0.35, Math.min(3.5, this.R.cam.z * Math.exp(-e.deltaY * 0.0015)));
    this.zoomAround(c, p.x, p.y, z);
  }
  zoomAround(c, sx, sy, z) {
    const cam = this.R.cam;
    cam.z = z;
    cam.x = c.x - (sx - this.R.W / 2) / z;
    cam.y = c.y - (sy - this.R.H / 2) / z;
    this.g.userCamera();
  }
}

function crossingsFor(st, seq, loop) {
  let n = 0;
  for (const [a, b] of lineSegments({ s: seq, loop })) n += segment(st, a, b).cross;
  return n;
}
function nearestOnLine(st, l, w) {
  let best = null, bd = Infinity;
  for (const id of st.lines[l].s) { const s = stationById(st, id); const d = (s.x - w.x) ** 2 + (s.y - w.y) ** 2; if (d < bd) { bd = d; best = id; } }
  return best;
}
