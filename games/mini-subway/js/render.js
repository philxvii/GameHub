// Rendu canvas de Mini Subway. Lit l'état du moteur, ne le modifie jamais.
// Direction artistique : carte de transport imprimée — papier chaud, encre profonde,
// eau hachurée, lignes franches. Palette Nuit et palette Daltonien dédiées.

import { cfgOf, segment, lineSegments, stationCapacity, trainCapacity, ease, stationById } from './engine/sim.js';
import { pointAt, polyLen } from './engine/geom.js';
import { inWater } from './engine/maps.js';

export const CB_LINES = ['#D55E00', '#0072B2', '#009E73', '#E69F00', '#CC79A7', '#56B4E9', '#3B3B3B'];

const THEMES = {
  day: { ink: '#1E232B', ink2: '#5B6270', paper: '#FFFDF8', alert: '#E2462F', warn: '#E89A1C', hatch: 'rgba(30,60,80,0.10)', grid: 'rgba(30,35,43,0.035)', shade: 'rgba(30,35,43,0.14)', glyph: '#1E232B' },
  night: { ink: '#E9E4D8', ink2: '#9AA3B2', paper: '#1A212C', alert: '#FF6A4D', warn: '#FFB23E', hatch: 'rgba(160,210,240,0.08)', grid: 'rgba(233,228,216,0.03)', shade: 'rgba(0,0,0,0.35)', glyph: '#E9E4D8' },
};

const ST_R = 12.5;          // rayon d'une station
const LINE_W = 9;           // épaisseur d'une ligne
const PAX = 8;              // taille d'un voyageur

export class Renderer {
  constructor(canvas, fixed = null) {
    this.cv = canvas;
    this.fixed = fixed; // taille imposée (export d'image) : { w, h }
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 800, y: 500, z: 1 };
    this.theme = 'day'; this.palette = 'standard'; this.contrast = false; this.reduced = false; this.labels = 'normal';
    this.anim = new Map();       // effets éphémères : id → {k, t0, ...}
    this.fx = [];
    this.waterCache = new Map(); // tronçon → intervalles sur l'eau
    this.patterns = {};
    this.resize();
  }

  setOptions({ theme, palette, contrast, reduced, labels }) {
    if (theme) this.theme = theme;
    if (palette) this.palette = palette;
    if (contrast !== undefined) this.contrast = contrast;
    if (reduced !== undefined) this.reduced = reduced;
    if (labels) this.labels = labels;
    this.patterns = {};
  }

  resize() {
    if (this.fixed) { this.dpr = 1; this.W = this.fixed.w; this.H = this.fixed.h; this.cv.width = this.W; this.cv.height = this.H; return; }
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  }

  // ── caméra ──
  toWorld(sx, sy) { const c = this.cam; return { x: (sx - this.W / 2) / c.z + c.x, y: (sy - this.H / 2) / c.z + c.y }; }
  toScreen(wx, wy) { const c = this.cam; return { x: (wx - c.x) * c.z + this.W / 2, y: (wy - c.y) * c.z + this.H / 2 }; }
  // Facteur de lisibilité : quand on dézoome fort, stations et lignes restent lisibles.
  get k() { return Math.max(1, Math.min(1.7, 0.92 / this.cam.z)); }

  fitBox(x0, y0, x1, y1, pad = { t: 90, r: 40, b: 110, l: 40 }) {
    const w = Math.max(1, this.W - pad.l - pad.r), h = Math.max(1, this.H - pad.t - pad.b);
    const z = Math.min(w / (x1 - x0), h / (y1 - y0));
    return { x: (x0 + x1) / 2 - (pad.l - pad.r) / 2 / z, y: (y0 + y1) / 2 - (pad.t - pad.b) / 2 / z, z };
  }

  colors(st) {
    const cfg = cfgOf(st);
    return this.palette === 'cb' ? CB_LINES : cfg.palette.lines;
  }
  lineColor(st, l) {
    const c = this.colors(st)[l % 7];
    return this.theme === 'night' && this.palette !== 'cb' ? lighten(c, 0.12) : c;
  }

  // ── image ──
  frame(st, f, ui, now) {
    const { ctx } = this;
    const T = THEMES[this.theme];
    const cfg = cfgOf(st);
    this.now = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme === 'night' ? cfg.palette.landNight : cfg.palette.landDay;
    ctx.fillRect(0, 0, this.W, this.H);
    const c = this.cam;
    ctx.setTransform(this.dpr * c.z, 0, 0, this.dpr * c.z, this.dpr * (this.W / 2 - c.x * c.z), this.dpr * (this.H / 2 - c.y * c.z));
    this.drawGeo(cfg, T);
    const off = this.lineOffsets(st);
    this.drawHalos(st, T);
    this.drawLines(st, T, off, ui);
    if (ui && ui.pendingPv) { this.ctx.globalAlpha = 0.5; this.drawPreview(st, T, ui.pendingPv); this.ctx.globalAlpha = 1; }
    if (ui && ui.preview) this.drawPreview(st, T, ui.preview);
    this.drawTrains(st, T, off, f, ui);
    this.drawStations(st, T, ui, off);
    if (this.palette === 'cb' || this.labels === 'large') this.drawLineLabels(st, T, off);
    this.drawFx(T);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOffscreen(st, T);
  }

  drawGeo(cfg, T) {
    const { ctx } = this;
    const night = this.theme === 'night';
    const W = cfg.world;
    // cadre du monde : feuille de papier posée sur un fond plus sombre, bord encré
    if (this.frameless) { ctx.fillStyle = night ? shade(cfg.palette.landNight, 0.035) : shade(cfg.palette.landDay, 0.025); ctx.fillRect(-4000, -4000, W.w + 8000, W.h + 8000); }
    else { ctx.fillStyle = T.shade; ctx.fillRect(4, 6, W.w, W.h); }
    ctx.fillStyle = night ? shade(cfg.palette.landNight, 0.035) : shade(cfg.palette.landDay, 0.025);
    ctx.fillRect(0, 0, W.w, W.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W.w, W.h); ctx.clip();
    ctx.fillStyle = this.pattern('grain'); ctx.fillRect(0, 0, W.w, W.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 100; x < W.w; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, W.h); }
    for (let y = 100; y < W.h; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W.w, y); }
    ctx.stroke();
    for (const p of cfg.parks) {
      path(ctx, p, true);
      ctx.fillStyle = night ? cfg.palette.parkNight : cfg.palette.parkDay; ctx.fill();
      ctx.fillStyle = this.pattern('dots'); ctx.fill();
    }
    // Eau : halo de rive, liseré, aplat, hachures. Les liserés sont tracés AVANT les
    // aplats : là où deux bras se rejoignent, l'aplat recouvre le liseré intérieur.
    const water = night ? cfg.palette.waterNight : cfg.palette.waterDay;
    const edge = night ? 'rgba(150,200,230,0.32)' : 'rgba(40,90,110,0.30)';
    ctx.lineJoin = 'round';
    for (const w of cfg.water) { path(ctx, w, true); ctx.strokeStyle = night ? 'rgba(120,180,220,0.10)' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 14; ctx.stroke(); }
    for (const w of cfg.water) { path(ctx, w, true); ctx.strokeStyle = edge; ctx.lineWidth = 2.8; ctx.stroke(); }
    for (const w of cfg.water) { path(ctx, w, true); ctx.fillStyle = water; ctx.fill(); }
    for (const w of cfg.water) { path(ctx, w, true); ctx.fillStyle = this.pattern('hatch'); ctx.fill(); }
    for (const l of cfg.land) {
      path(ctx, l, true);
      ctx.strokeStyle = night ? 'rgba(120,180,220,0.12)' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 12; ctx.stroke();
      ctx.strokeStyle = edge; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = night ? shade(cfg.palette.landNight, 0.035) : shade(cfg.palette.landDay, 0.025); ctx.fill();
      ctx.globalAlpha = night ? 0.6 : 1; ctx.fillStyle = this.pattern('grain'); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (this.frameless) return;
    ctx.strokeStyle = night ? 'rgba(233,228,216,0.28)' : 'rgba(30,35,43,0.35)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, W.w, W.h);
  }

  pattern(kind) {
    if (this.patterns[kind]) return this.patterns[kind];
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const night = this.theme === 'night';
    if (kind === 'grain') {
      c.width = c.height = 128;
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = night ? `rgba(255,255,255,${0.03 + rnd() * 0.04})` : `rgba(60,50,30,${0.015 + rnd() * 0.03})`;
        g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd(), 1 + rnd());
      }
    } else if (kind === 'hatch') {
      c.width = c.height = 16;
      g.strokeStyle = THEMES[this.theme].hatch; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(0, 16); g.lineTo(16, 0); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(12, 20); g.lineTo(20, 12); g.stroke();
    } else if (kind === 'dots') {
      c.width = c.height = 14;
      g.fillStyle = night ? 'rgba(170,220,170,0.10)' : 'rgba(60,110,50,0.13)';
      g.beginPath(); g.arc(3.5, 3.5, 1.1, 0, 7); g.arc(10.5, 10.5, 1.1, 0, 7); g.fill();
    }
    return (this.patterns[kind] = this.ctx.createPattern(c, 'repeat'));
  }

  // Lignes qui partagent un tronçon : décalées côte à côte, dans un ordre stable.
  lineOffsets(st) {
    const use = new Map();
    for (const l of st.lines) for (const [a, b] of lineSegments(l)) {
      const key = a < b ? a + '-' + b : b + '-' + a;
      if (!use.has(key)) use.set(key, []);
      use.get(key).push(l.id);
    }
    const off = new Map();
    const gap = LINE_W * 1.08 * this.k;
    for (const [key, ids] of use) ids.forEach((id, i) => off.set(id + ':' + key, (i - (ids.length - 1) / 2) * gap));
    return off;
  }

  // Tracé (orienté a → b) d'une ligne sur un tronçon, décalage compris.
  segPts(st, off, l, a, b) {
    const key = a < b ? a + '-' + b : b + '-' + a;
    const o = off.get(l + ':' + key) || 0;
    const canon = segment(st, Math.min(a, b), Math.max(a, b)).pts;
    const p = o ? offsetPoly(canon, o) : canon;
    return a <= b ? p : [p[4], p[5], p[2], p[3], p[0], p[1]];
  }

  drawLines(st, T, off, ui) {
    const { ctx } = this;
    const k = this.k;
    const cfg = cfgOf(st);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const dim = ui && ui.dimLines;
    // ponts / tunnels : enveloppe d'encre et de papier là où le tronçon passe sur l'eau
    for (const l of st.lines) for (const [a, b] of lineSegments(l)) {
      const pts = this.segPts(st, off, l.id, a, b);
      for (const [d0, d1] of this.wetIntervals(cfg, st, l.id, a, b, pts)) {
        // symbole cartographique d'ouvrage : deux parapets encrés et leurs barbules
        const sub = subPath(pts, d0 - 6, d1 + 6);
        const o = (LINE_W / 2 + 3.2) * k;
        ctx.strokeStyle = T.ink; ctx.lineWidth = 1.6 * k; ctx.lineCap = 'butt';
        for (const side of [-1, 1]) {
          const q = offsetPoly(sub, side * o);
          path(ctx, q, false); ctx.stroke();
          for (const [ix, sgn] of [[0, -1], [q.length - 2, 1]]) {
            const dir = ix === 0 ? pointAt(q, 0) : pointAt(q, polyLen(q));
            const bx = q[ix], by = q[ix + 1];
            ctx.beginPath(); ctx.moveTo(bx, by);
            ctx.lineTo(bx + (sgn * dir.dx + side * -dir.dy) * 5 * k, by + (sgn * dir.dy + side * dir.dx) * 5 * k); ctx.stroke();
          }
        }
        ctx.lineCap = 'round';
      }
    }
    for (const l of st.lines) {
      if (l.s.length < 2) continue;
      const col = this.lineColor(st, l.id);
      const sel = ui && ui.selLine === l.id;
      ctx.globalAlpha = dim && !sel ? 0.35 : 1;
      if (sel) {
        for (const [a, b] of lineSegments(l)) { path(ctx, this.segPts(st, off, l.id, a, b), false); ctx.strokeStyle = col; ctx.globalAlpha = 0.25; ctx.lineWidth = (LINE_W + 10) * k; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = col; ctx.lineWidth = LINE_W * k;
      for (const [a, b] of lineSegments(l)) { path(ctx, this.segPts(st, off, l.id, a, b), false); ctx.stroke(); }
      if (!l.loop) for (const end of [0, 1]) this.drawTerminal(st, l, end, col, T, off);
      ctx.globalAlpha = 1;
    }
  }

  // Extrémité de ligne : prolongement court terminé par une barre (poignée de prolongement).
  // Extrémité de ligne : prolongement court terminé par une barre (poignée de prolongement).
  // Plusieurs extrémités sur une même station s'écartent pour ne pas s'empiler, et
  // évitent les tronçons qui en partent.
  terminalGeom(st, l, end, off) {
    const key = st.netVer + ':' + st.geoVer + ':' + this.k.toFixed(3);
    if (this.termKey !== key) { this.termKey = key; this.terms = new Map(); this.termUsed = new Map(); }
    const tk = l.id + ':' + end;
    if (this.terms.has(tk)) return this.terms.get(tk);
    const s = l.s, n = s.length;
    const a = end ? s[n - 1] : s[0], b = end ? s[n - 2] : s[1];
    const pts = this.segPts(st, off, l.id, b, a);
    const ex = pts[4], ey = pts[5];
    let dx = pts[4] - pts[2], dy = pts[5] - pts[3];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    // directions déjà prises à cette station : tronçons sortants et autres extrémités
    if (!this.termUsed.has(a)) {
      const used = [];
      for (const o of st.lines) for (const [p, q] of lineSegments(o)) {
        if (p !== a && q !== a) continue;
        const g = segment(st, p, q).pts;
        const vx = p === a ? g[2] - g[0] : g[2] - g[4], vy = p === a ? g[3] - g[1] : g[3] - g[5];
        const vl = Math.hypot(vx, vy); if (vl > 0.1) used.push([vx / vl, vy / vl]);
      }
      this.termUsed.set(a, used);
    }
    const used = this.termUsed.get(a);
    let best = [dx, dy];
    for (const rot of [0, 0.6, -0.6, 1.1, -1.1, 1.57, -1.57]) {
      const c = Math.cos(rot), si = Math.sin(rot);
      const cand = [dx * c - dy * si, dx * si + dy * c];
      if (used.every(([ux, uy]) => cand[0] * ux + cand[1] * uy < 0.82)) { best = cand; break; }
    }
    used.push(best);
    [dx, dy] = best;
    const L = 26 * this.k;
    const g = { x0: ex, y0: ey, x1: ex + dx * L, y1: ey + dy * L, dx, dy, station: a };
    this.terms.set(tk, g);
    return g;
  }
  drawTerminal(st, l, end, col, T, off) {
    const { ctx } = this;
    const g = this.terminalGeom(st, l, end, off);
    const k = this.k;
    ctx.strokeStyle = col; ctx.lineWidth = LINE_W * k; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x1, g.y1); ctx.stroke();
    ctx.lineCap = 'round';
    const w = 11 * k;
    ctx.beginPath(); ctx.moveTo(g.x1 - g.dy * w, g.y1 + g.dx * w); ctx.lineTo(g.x1 + g.dy * w, g.y1 - g.dx * w); ctx.stroke();
  }

  wetIntervals(cfg, st, l, a, b, pts) {
    const key = l + ':' + a + '-' + b + ':' + st.geoVer + ':' + pts[2].toFixed(1);
    let r = this.waterCache.get(key);
    if (r) return r;
    r = [];
    if (cfg.water.length) {
      const L = polyLen(pts);
      let start = -1;
      for (let d = 0; d <= L + 0.01; d += 4) {
        const p = pointAt(pts, d);
        const w = inWater(cfg, p.x, p.y);
        if (w && start < 0) start = d;
        if (!w && start >= 0) { r.push([start, d]); start = -1; }
      }
      if (start >= 0) r.push([start, L]);
    }
    if (this.waterCache.size > 2000) this.waterCache.clear();
    this.waterCache.set(key, r);
    return r;
  }

  drawPreview(st, T, pv) {
    const { ctx } = this;
    const k = this.k;
    const col = pv.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const seq = pv.seq.filter(id => stationById(st, id));
    const segs = [];
    for (let i = 1; i < seq.length; i++) segs.push(segment(st, seq[i - 1], seq[i]).pts);
    if (pv.loop && seq.length > 2) segs.push(segment(st, seq[seq.length - 1], seq[0]).pts);
    // tracé en cours : halo papier, trait estompé et âme pointillée (≠ ligne posée)
    ctx.globalAlpha = pv.ghost ? 0.4 : 1;
    for (const pts of segs) { path(ctx, pts, false); ctx.strokeStyle = T.paper; ctx.lineWidth = (LINE_W + 6) * k; ctx.stroke(); }
    ctx.globalAlpha = pv.ghost ? 0.35 : 0.62;
    for (const pts of segs) { path(ctx, pts, false); ctx.strokeStyle = col; ctx.lineWidth = LINE_W * k; ctx.stroke(); }
    ctx.globalAlpha = pv.ghost ? 0.5 : 0.95;
    ctx.setLineDash([6 * k, 6 * k]);
    for (const pts of segs) { path(ctx, pts, false); ctx.strokeStyle = T.paper; ctx.lineWidth = 2.4 * k; ctx.stroke(); }
    ctx.setLineDash([]);
    if (pv.insert) { // tronçon tiré vers une nouvelle station
      ctx.setLineDash([2, 14 * k]);
      path(ctx, [pv.insert.ax, pv.insert.ay, pv.cursor.x, pv.cursor.y, pv.insert.bx, pv.insert.by], false); ctx.stroke();
      ctx.setLineDash([]);
    }
    // fil vers le curseur
    if (pv.cursor && pv.from) {
      const s = stationById(st, pv.from);
      if (s) {
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 4 * k;
        ctx.strokeStyle = pv.bad ? T.alert : col;
        if (pv.bad) ctx.setLineDash([5 * k, 5 * k]);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(pv.cursor.x, pv.cursor.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = T.paper; ctx.lineWidth = 3.5 * k;
        ctx.beginPath(); ctx.arc(pv.cursor.x, pv.cursor.y, 8 * k, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  trainGeom(st, t, off, f) {
    if (t.st === 'dwell') {
      const s = stationById(st, t.b);
      if (!s) return null;
      // à quai : posé sur le tracé, juste avant la station, orienté vers l'arrêt suivant
      if (t.nx != null && stationById(st, t.nx)) {
        const pts = this.segPts(st, off, t.l, t.b, t.nx);
        const L = polyLen(pts);
        const p = pointAt(pts, Math.min(L * 0.45, (ST_R + 17) * this.k));
        return { x: p.x, y: p.y, dx: p.dx, dy: p.dy };
      }
      return { x: s.x, y: s.y, dx: 1, dy: 0 };
    }
    const r = cfgOf(st).trains.accelRatio;
    const u = Math.min(1, (t.t + f) / t.T);
    const pts = t.g ? segment(st, t.a, t.b).pts : this.segPts(st, off, t.l, t.a, t.b);
    return pointAt(pts, ease(u, r) * polyLen(pts));
  }

  drawTrains(st, T, off, f, ui) {
    const { ctx } = this;
    const k = this.k;
    for (const t of st.trains) {
      const g = this.trainGeom(st, t, off, f);
      if (!g) continue;
      const col = this.lineColor(st, t.l);
      const ang = Math.atan2(g.dy, g.dx);
      const sel = ui && ui.selTrain === t.id;
      ctx.save();
      ctx.translate(g.x, g.y); ctx.rotate(ang); ctx.scale(k, k);
      const Lc = 26, Wc = 16, gap = 3.5;
      // voitures : ombre portée, caisse couleur de ligne cerclée d'encre (se détache du trait)
      for (let i = t.c; i >= 0; i--) {
        const x = -i * (Lc + gap);
        ctx.fillStyle = T.shade;
        rrect(ctx, x - Lc / 2 + 1.5, -Wc / 2 + 2.2, Lc, Wc, 4); ctx.fill();
        if (i === 0 && t.k === 'express') {
          ctx.beginPath(); ctx.moveTo(x - Lc / 2 + 4, -Wc / 2); ctx.lineTo(x + Lc / 2 - 6, -Wc / 2); ctx.quadraticCurveTo(x + Lc / 2 + 6, 0, x + Lc / 2 - 6, Wc / 2); ctx.lineTo(x - Lc / 2 + 4, Wc / 2); ctx.arcTo(x - Lc / 2, Wc / 2, x - Lc / 2, 0, 4); ctx.arcTo(x - Lc / 2, -Wc / 2, x, -Wc / 2, 4); ctx.closePath();
        } else rrect(ctx, x - Lc / 2, -Wc / 2, Lc, Wc, 4);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = sel ? 3 : 1.8; ctx.strokeStyle = sel ? '#F2A516' : T.ink; ctx.stroke();
        if (i === 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x + Lc / 2 - 4.5, -Wc / 2 + 3, 1.8, Wc - 6); }
      }
      // voyageurs à bord : glyphes blancs cerclés d'encre, grille 3 × 2 par voiture
      const per = Math.max(1, Math.ceil(trainCapacity(st, t) / (t.c + 1)));
      const cols = Math.ceil(per / 2);
      t.ld.forEach((pid, i) => {
        const p = st.pass[pid];
        if (!p) return;
        const car = Math.floor(i / per), j = i % per;
        const cx = -car * (Lc + gap) - Lc / 2 + 5.5 + (j % cols) * ((Lc - 13) / Math.max(1, cols - 1));
        const cy = j < cols ? -3.6 : 3.6;
        shapePath(ctx, p.d, cx, cy, 2.9);
        ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(20,24,30,0.55)'; ctx.stroke();
      });
      ctx.restore();
    }
  }

  // Halo d'alerte des stations critiques, sous les lignes (ne teinte pas leur couleur).
  drawHalos(st, T) {
    const { ctx } = this;
    const k = this.k, warn = cfgOf(st).overload.warnAt;
    for (const s of st.stations) {
      if (s.o < warn) continue;
      const pulse = this.reduced ? 1 : 1 + 0.07 * Math.sin(this.now / 130);
      const r = (s.hub ? ST_R * 1.45 : ST_R) * k;
      ctx.fillStyle = T.alert; ctx.globalAlpha = 0.2 + (this.reduced ? 0 : 0.08 * Math.sin(this.now / 130));
      ctx.beginPath(); ctx.arc(s.x, s.y, (r + 19 * k) * pulse, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Numéros de ligne (palette daltonienne, grands repères) : au bout de chaque ligne,
  // dessinés après les stations pour n'être jamais masqués.
  drawLineLabels(st, T, off) {
    const { ctx } = this;
    const k = this.k;
    for (const l of st.lines) {
      if (l.s.length < 2) continue;
      const col = this.lineColor(st, l.id);
      const spots = l.loop ? [] : [0, 1].map(end => { const g = this.terminalGeom(st, l, end, off); return [g.x1 + g.dx * 15 * k, g.y1 + g.dy * 15 * k]; });
      if (l.loop) { const pts = this.segPts(st, off, l.id, l.s[0], l.s[1]); const m = pointAt(pts, polyLen(pts) / 2); spots.push([m.x - m.dy * 16 * k, m.y + m.dx * 16 * k]); }
      for (const [cx, cy] of spots) {
        ctx.fillStyle = T.paper; ctx.strokeStyle = col; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(cx, cy, 10 * k, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = T.ink; ctx.font = `700 ${12 * k}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(l.id + 1), cx, cy + 0.5);
      }
    }
  }

  drawStations(st, T, ui, off) {
    const { ctx } = this;
    const k = this.k;
    const lineCount = new Map();
    const dirs = new Map(); // directions des tronçons au départ de chaque station
    const addDir = (id, x, y) => { const l = Math.hypot(x, y); if (l > 0.1) { if (!dirs.has(id)) dirs.set(id, []); dirs.get(id).push([x / l, y / l]); } };
    for (const l of st.lines) {
      for (const id of l.s) lineCount.set(id, (lineCount.get(id) || 0) + 1);
      for (const [a, b] of lineSegments(l)) {
        const p = segment(st, a, b).pts;
        addDir(a, p[2] - p[0], p[3] - p[1]); addDir(b, p[2] - p[4], p[3] - p[5]);
      }
      if (l.s.length >= 2 && !l.loop && off) for (const end of [0, 1]) { const g = this.terminalGeom(st, l, end, off); addDir(g.station, g.dx, g.dy); }
    }
    const O = cfgOf(st).overload;
    const SIDES = [['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1]];
    for (const s of st.stations) {
      const born = this.anim.get('st' + s.id);
      let sc = 1;
      if (born && !this.reduced) {
        const u = (this.now - born) / 650;
        if (u < 1) sc = backOut(Math.max(0, u));
        else this.anim.delete('st' + s.id);
      }
      const r = (s.hub ? ST_R * 1.45 : ST_R) * k * sc;
      const n = lineCount.get(s.id) || 0;
      const hl = ui && ui.targets && ui.targets.has(s.id);
      const hover = ui && ui.hover === s.id;
      const crit = s.o >= O.warnAt;
      // anneau de surcharge : compte à rebours à l'encre (distinct des couleurs de ligne) ;
      // en phase critique, halo d'alerte pulsé et intérieur teinté.
      if (s.o > 0) {
        const pulse = crit && !this.reduced ? 1 + 0.07 * Math.sin(this.now / 130) : 1;
        const R = r + 10 * k;
        ctx.lineCap = 'butt';
        ctx.lineWidth = 9 * k; ctx.strokeStyle = T.paper; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 6 * k; ctx.strokeStyle = T.shade; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = T.ink; ctx.beginPath(); ctx.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + s.o * Math.PI * 2); ctx.stroke();
        ctx.lineCap = 'round';
      }
      if (hl || hover) {
        ctx.fillStyle = hover ? 'rgba(242,165,22,0.34)' : 'rgba(242,165,22,0.16)';
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 14 * k, 0, 7); ctx.fill();
      }
      if (n === 0 && st.mode !== 'creative') {
        ctx.setLineDash([2.5 * k, 4.5 * k]); ctx.strokeStyle = T.ink2; ctx.lineWidth = 1.3 * k;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 6 * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
      const lw = (n >= 2 ? 4.4 : 3.3) * k * (this.contrast ? 1.25 : 1);
      if (s.hub) {
        shapePath(ctx, s.shape, s.x, s.y, r + 5 * k); ctx.fillStyle = T.paper; ctx.fill();
        ctx.lineWidth = lw * 0.8; ctx.strokeStyle = T.ink; ctx.stroke();
      }
      shapePath(ctx, s.shape, s.x, s.y, r);
      ctx.fillStyle = T.paper; ctx.fill();
      if (crit) { ctx.fillStyle = T.alert; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.lineWidth = lw; ctx.strokeStyle = T.ink; ctx.stroke();
      if (ui && ui.selStation === s.id) { ctx.strokeStyle = '#F2A516'; ctx.lineWidth = 2.5 * k; shapePath(ctx, s.shape, s.x, s.y, r + 7 * k); ctx.stroke(); }
      // côté de la file : celui qu'aucun tronçon n'occupe
      const ds = dirs.get(s.id) || [];
      let side = 'right', best = Infinity;
      for (const [name, sx, sy] of SIDES) {
        const worst = ds.reduce((m, [dx, dy]) => Math.max(m, dx * sx + dy * sy), -1);
        if (worst < best - 0.05) { best = worst; side = name; }
      }
      this.drawQueue(st, s, r + (s.o > 0 ? 8 * k : 0), T, side);
    }
  }

  // File d'attente : rangées de 6 glyphes à droite de la station ; au-delà de la
  // capacité, les glyphes passent en couleur d'alerte.
  // File d'attente : rangées de 6 glyphes posées sur une étiquette papier, du côté de la
  // station le moins encombré par les lignes ; au-delà de deux rangées, compteur « +n ».
  // Les voyageurs au-delà de la capacité passent en couleur d'alerte.
  drawQueue(st, s, r, T, side) {
    if (!s.q.length) return;
    const { ctx } = this;
    let k = this.k * (this.labels === 'large' ? 1.22 : 1) * (this.contrast ? 1.1 : 1);
    k = Math.max(k, 7 / (PAX * this.cam.z)); // lisible même très dézoomé (mobile)
    const cap = stationCapacity(st, s);
    const per = 6, size = PAX * k, gap = size * 1.45;
    const shown = Math.min(s.q.length, per * 2);
    const rows = Math.ceil(shown / per), colsN = Math.min(per, shown);
    const more = s.q.length - shown;
    const w = colsN * gap, h = rows * gap;
    const pad = 3 * k;
    let x0, y0;
    if (side === 'left') { x0 = s.x - r - 9 * this.k - w; y0 = s.y - h / 2; }
    else if (side === 'up') { x0 = s.x - w / 2; y0 = s.y - r - 9 * this.k - h; }
    else if (side === 'down') { x0 = s.x - w / 2; y0 = s.y + r + 9 * this.k; }
    else { x0 = s.x + r + 9 * this.k; y0 = s.y - h / 2; }
    ctx.fillStyle = T.paper; ctx.globalAlpha = 0.88;
    rrect(ctx, x0 - pad, y0 - pad, w + pad * 2 - (gap - size), h + pad * 2 - (gap - size), 4 * k); ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < shown; i++) {
      const p = st.pass[s.q[i]];
      if (!p) continue;
      const x = x0 + (i % per) * gap + size / 2, y = y0 + Math.floor(i / per) * gap + size / 2;
      ctx.globalAlpha = p.rd > st.t ? 0.45 : 1;
      shapePath(ctx, p.d, x, y, size / 2);
      ctx.fillStyle = i >= cap ? T.alert : T.glyph; ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (more) {
      ctx.fillStyle = s.q.length > cap ? T.alert : T.ink;
      ctx.font = `600 ${10.5 * k}px "IBM Plex Mono", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (side === 'left') { ctx.textAlign = 'right'; ctx.fillText('+' + more, x0 - 3 * k, y0 + h - gap / 2); }
      else ctx.fillText('+' + more, x0 + colsN * gap + 2 * k, y0 + h - gap / 2);
    }
  }

  // Stations en alerte hors de l'écran : flèche au bord avec l'anneau du compte à rebours.
  drawOffscreen(st, T) {
    const { ctx } = this;
    const sf = this.safe || { t: 70, r: 20, b: 90, l: 20 };
    // stations calmes hors champ : petite forme au bord, sans anneau
    for (const s of st.stations) {
      if (s.o > 0.05) continue;
      const p = this.toScreen(s.x, s.y);
      if (p.x > 4 && p.x < this.W - 4 && p.y > 4 && p.y < this.H - 4) continue;
      const x = Math.max(sf.l + 10, Math.min(this.W - sf.r - 10, p.x)), y = Math.max(sf.t + 10, Math.min(this.H - sf.b - 10, p.y));
      // pastille encre + pointe vers la station : un repère, pas une station
      const ang = Math.atan2(p.y - y, p.x - x);
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.85;
      ctx.fillStyle = T.ink; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.fill();
      ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(8, -4.5); ctx.lineTo(8, 4.5); ctx.closePath(); ctx.fill();
      ctx.rotate(-ang); shapePath(ctx, s.shape, 0, 0, 4.2); ctx.fillStyle = T.paper; ctx.fill();
      ctx.restore();
    }
    for (const s of st.stations) {
      if (s.o <= 0.05) continue;
      const p = this.toScreen(s.x, s.y);
      const x0 = sf.l + 22, x1 = this.W - sf.r - 22, y0 = sf.t + 22, y1 = this.H - sf.b - 22;
      if (p.x > 4 && p.x < this.W - 4 && p.y > 4 && p.y < this.H - 4) continue; // visible : pas de repère
      const x = Math.max(x0, Math.min(x1, p.x)), y = Math.max(y0, Math.min(y1, p.y));
      const ang = Math.atan2(p.y - y, p.x - x);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = T.paper; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = s.o >= cfgOf(st).overload.warnAt ? T.alert : T.ink;
      ctx.beginPath(); ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + s.o * Math.PI * 2); ctx.stroke();
      ctx.fillStyle = T.ink; shapePath(ctx, s.shape, 0, 0, 6); ctx.fill();
      ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(16, -5); ctx.lineTo(16, 5); ctx.closePath(); ctx.fillStyle = T.alert; ctx.fill();
      ctx.restore();
    }
  }

  // ── effets éphémères (déclenchés par les événements du moteur) ──
  onEvents(st, evs) {
    for (const e of evs) {
      if (e.k === 'station') { this.anim.set('st' + e.s, this.now || performance.now()); this.ring(st, e.s, 'spawn'); }
      else if (e.k === 'deliver') this.ring(st, e.s, 'deliver');
      else if (e.k === 'shape') this.ring(st, e.s, 'shape');
    }
  }
  ring(st, sid, kind) {
    if (this.reduced && kind !== 'shape' && kind !== 'peer') return;
    const s = stationById(st, sid);
    if (!s) return;
    if (this.fx.length > 80) this.fx.shift();
    this.fx.push({ x: s.x, y: s.y, kind, t0: this.now || performance.now() });
  }
  drawFx(T) {
    const { ctx } = this;
    const now = this.now;
    const k = this.k;
    this.fx = this.fx.filter(fx => now - fx.t0 < 900);
    for (const fx of this.fx) {
      const u = (now - fx.t0) / 900;
      if (fx.kind === 'deliver') {
        ctx.globalAlpha = (1 - u) * 0.5; ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5 * k;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, (ST_R + 4 + u * 12) * k, 0, 7); ctx.stroke();
      } else {
        ctx.globalAlpha = (1 - u) * 0.8; ctx.strokeStyle = fx.kind === 'shape' || fx.kind === 'peer' ? '#F2A516' : T.ink; ctx.lineWidth = (fx.kind === 'peer' ? 3.5 : 2.2) * k;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, (ST_R + 6 + u * 34) * k, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── sélection ──
  stationAt(st, wx, wy, slop = 26) {
    let best = null, bd = (slop * this.k) ** 2 / Math.max(0.6, this.cam.z);
    for (const s of st.stations) {
      const d = (s.x - wx) ** 2 + (s.y - wy) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  terminalAt(st, wx, wy) {
    const off = this.lineOffsets(st);
    let best = null, bd = (22 * this.k) ** 2 / Math.max(0.6, this.cam.z);
    for (const l of st.lines) {
      if (l.s.length < 2 || l.loop) continue;
      for (const end of [0, 1]) {
        const g = this.terminalGeom(st, l, end, off);
        const d = (g.x1 - wx) ** 2 + (g.y1 - wy) ** 2;
        const d2 = ((g.x0 + g.x1) / 2 - wx) ** 2 + ((g.y0 + g.y1) / 2 - wy) ** 2;
        const m = Math.min(d, d2);
        if (m < bd) { bd = m; best = { l: l.id, end }; }
      }
    }
    return best;
  }
  segmentAt(st, wx, wy) {
    const off = this.lineOffsets(st);
    let best = null, bd = 14 * this.k / Math.max(0.6, this.cam.z);
    for (const l of st.lines) for (const [a, b] of lineSegments(l)) {
      const pts = this.segPts(st, off, l.id, a, b);
      for (let i = 2; i < pts.length; i += 2) {
        const d = distSeg(wx, wy, pts[i - 2], pts[i - 1], pts[i], pts[i + 1]);
        if (d < bd) { bd = d; best = { l: l.id, a, b, pts }; }
      }
    }
    return best;
  }
  trainAt(st, wx, wy) {
    const off = this.lineOffsets(st);
    let best = null, bd = (18 * this.k) ** 2;
    for (const t of st.trains) {
      const g = this.trainGeom(st, t, off, 0);
      if (!g) continue;
      const d = (g.x - wx) ** 2 + (g.y - wy) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
}

// ── formes ──
export function shapePath(ctx, shape, x, y, r) {
  ctx.beginPath();
  switch (shape) {
    case 'circle': ctx.arc(x, y, r, 0, Math.PI * 2); break;
    case 'triangle': { const h = r * 1.18; ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.98, y + h * 0.62); ctx.lineTo(x - h * 0.98, y + h * 0.62); break; }
    case 'square': { const a = r * 0.9; ctx.rect(x - a, y - a, 2 * a, 2 * a); break; }
    case 'diamond': { const a = r * 1.22; ctx.moveTo(x, y - a); ctx.lineTo(x + a * 0.85, y); ctx.lineTo(x, y + a); ctx.lineTo(x - a * 0.85, y); break; }
    case 'pentagon': poly(ctx, x, y + r * 0.06, r * 1.08, 5, -Math.PI / 2); break;
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.55 : r * 1.25;
        const px = x + Math.cos(a) * rr, py = y + 0.08 * r + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      break;
    }
    case 'cross': {
      const a = r * 0.36, b = r * 1.0;
      ctx.moveTo(x - a, y - b); ctx.lineTo(x + a, y - b); ctx.lineTo(x + a, y - a); ctx.lineTo(x + b, y - a); ctx.lineTo(x + b, y + a);
      ctx.lineTo(x + a, y + a); ctx.lineTo(x + a, y + b); ctx.lineTo(x - a, y + b); ctx.lineTo(x - a, y + a); ctx.lineTo(x - b, y + a);
      ctx.lineTo(x - b, y - a); ctx.lineTo(x - a, y - a); break;
    }
    case 'egg': ctx.ellipse(x, y, r * 0.78, r * 1.1, 0, 0, Math.PI * 2); break;
    case 'gem': { const a = r * 1.08; ctx.moveTo(x - a * 0.55, y - a * 0.75); ctx.lineTo(x + a * 0.55, y - a * 0.75); ctx.lineTo(x + a, y - a * 0.15); ctx.lineTo(x, y + a); ctx.lineTo(x - a, y - a * 0.15); break; }
    case 'wedge': { const a = r * 1.1; ctx.moveTo(x, y - a); ctx.lineTo(x + a, y + a * 0.7); ctx.lineTo(x, y + a * 0.2); ctx.lineTo(x - a, y + a * 0.7); break; }
    default: ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}
function poly(ctx, x, y, r, n, a0) {
  for (let i = 0; i < n; i++) { const a = a0 + (i * Math.PI * 2) / n; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
}

// Icône SVG d'une forme (menus, aide, succès) : mêmes silhouettes que sur la carte.
export function shapeSVG(shape, size = 16, fill = 'currentColor', stroke = 'none', sw = 0) {
  const c = document.createElement('canvas');
  void c;
  const r = 7, x = 10, y = 10;
  const d = [];
  const fakeCtx = {
    beginPath() {}, closePath() { d.push('Z'); },
    moveTo(a, b) { d.push(`M${a.toFixed(2)} ${b.toFixed(2)}`); }, lineTo(a, b) { d.push(`L${a.toFixed(2)} ${b.toFixed(2)}`); },
    rect(a, b, w, h) { d.push(`M${a} ${b}h${w}v${h}h${-w}Z`); },
    arc(a, b, rr) { d.push(`M${a - rr} ${b}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0`); },
    ellipse(a, b, rx, ry) { d.push(`M${a - rx} ${b}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`); },
  };
  shapePath(fakeCtx, shape, x, y, r);
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><path d="${d.join('')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
}

// ── utilitaires de tracé ──
function path(ctx, pts, closed) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (closed) ctx.closePath();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function offsetPoly(p, o) {
  const out = [];
  const n = p.length / 2;
  const nrm = (i, j) => { const dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1]; const l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    let nx, ny;
    if (i === 0) [nx, ny] = nrm(0, 1);
    else if (i === n - 1) [nx, ny] = nrm(n - 2, n - 1);
    else {
      const a = nrm(i - 1, i), b = nrm(i, i + 1);
      if (Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]) < 0.01) [nx, ny] = b;
      else if (Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]) < 0.01) [nx, ny] = a;
      else {
        let mx = a[0] + b[0], my = a[1] + b[1];
        const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
        const cos = mx * a[0] + my * a[1];
        nx = mx / Math.max(0.5, cos); ny = my / Math.max(0.5, cos);
      }
    }
    out.push(p[i * 2] + nx * o, p[i * 2 + 1] + ny * o);
  }
  return out;
}
function subPath(pts, d0, d1) {
  const L = polyLen(pts);
  d0 = Math.max(0, d0); d1 = Math.min(L, d1);
  const out = [];
  const a = pointAt(pts, d0); out.push(a.x, a.y);
  let acc = 0;
  for (let i = 2; i < pts.length; i += 2) {
    acc += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (acc > d0 && acc < d1) out.push(pts[i], pts[i + 1]);
  }
  const b = pointAt(pts, d1); out.push(b.x, b.y);
  return out;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - ax - dx * u, py - ay - dy * u);
}
const backOut = u => { const s = 1.9; u -= 1; return u * u * ((s + 1) * u + s) + 1; };
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lighten(h, a) { const [r, g, b] = hexToRgb(h); const f = v => Math.round(v + (255 - v) * a); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function shade(h, a) { const [r, g, b] = hexToRgb(h); const f = v => Math.max(0, Math.min(255, Math.round(v + 255 * a))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
