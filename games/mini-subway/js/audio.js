// Audio original de Mini Subway, entièrement synthétisé (Web Audio) : aucun fichier,
// aucune ressource sous licence. La musique naît du réseau : chaque arrivée de train joue
// une note de la gamme de sa ligne ; une nappe s'épaissit avec le réseau, une tension
// discrète apparaît quand une station sature, puis se relâche.
// Rien ne démarre avant une interaction de l'utilisateur (politique des navigateurs).

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // pentatonique majeure
const ROOT = 220 * Math.pow(2, 3 / 12); // do

export class Audio {
  constructor() {
    this.ctx = null; this.music = 0.5; this.sfx = 0.7; this.muted = false;
    this.last = {}; this.layers = null; this.tension = 0; this.chord = 0;
  }

  // À appeler depuis un geste utilisateur.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.connect(this.master);
    this.mBus = c.createGain(); this.mBus.connect(this.comp);
    this.sBus = c.createGain(); this.sBus.connect(this.comp);
    // réverbération courte synthétique (bruit décroissant)
    const len = c.sampleRate * 1.6, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb = c.createConvolver(); this.verb.buffer = buf;
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.28;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.comp);
    this.apply();
  }

  set({ music, sfx, muted }) {
    if (music !== undefined) this.music = music;
    if (sfx !== undefined) this.sfx = sfx;
    if (muted !== undefined) this.muted = muted;
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.mBus.gain.setTargetAtTime(this.music * 0.55, t, 0.1);
    this.sBus.gain.setTargetAtTime(this.sfx * 0.6, t, 0.05);
  }
  get live() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  // Limite les sons répétitifs (plusieurs trains en même temps).
  gate(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone(freq, { type = 'sine', dur = 0.4, vol = 0.2, bus = this.sBus, attack = 0.005, verb = 0.3, glide = 0, delay = 0 } = {}) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  note(deg, oct = 0) { const st = SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + 12 * oct; return ROOT * Math.pow(2, st / 12); }

  // ── effets ──
  ui() { if (this.gate('ui', 60)) this.tone(1320, { type: 'triangle', dur: 0.06, vol: 0.05, verb: 0 }); }
  line(l) { this.tone(this.note(l), { type: 'triangle', dur: 0.35, vol: 0.16 }); this.tone(this.note(l + 2), { type: 'triangle', dur: 0.5, vol: 0.13, delay: 0.09 }); }
  station() { if (this.gate('st', 300)) { this.tone(this.note(4, 1), { type: 'sine', dur: 0.9, vol: 0.12, verb: 0.6 }); this.tone(this.note(7, 1), { type: 'sine', dur: 0.7, vol: 0.05, delay: 0.05, verb: 0.6 }); } }
  board() { if (this.gate('board', 90)) this.tone(2100 + Math.random() * 200, { type: 'sine', dur: 0.05, vol: 0.025, verb: 0 }); }
  deliver() { if (this.gate('deliver', 110)) this.tone(1560, { type: 'triangle', dur: 0.08, vol: 0.04, verb: 0.1 }); }
  reward() { [0, 2, 4, 7].forEach((d, i) => this.tone(this.note(d, 1), { type: 'triangle', dur: 0.6, vol: 0.12, delay: i * 0.09 })); }
  warn() { if (this.gate('warn', 2500)) { this.tone(196, { type: 'square', dur: 0.14, vol: 0.05, verb: 0.1 }); this.tone(185, { type: 'square', dur: 0.18, vol: 0.05, delay: 0.2, verb: 0.1 }); } }
  over() { [7, 4, 2, 0].forEach((d, i) => this.tone(this.note(d, 0), { type: 'triangle', dur: 0.9, vol: 0.14, delay: i * 0.22, verb: 0.5 })); }
  achieve() { [4, 7, 9].forEach((d, i) => this.tone(this.note(d, 2), { type: 'sine', dur: 0.5, vol: 0.08, delay: i * 0.07, verb: 0.5 })); }
  deny() { this.tone(160, { type: 'triangle', dur: 0.16, vol: 0.09, verb: 0 }); }

  // Note du réseau : arrivée d'un train en station (ligne = degré de gamme).
  arrive(l, station) {
    if (!this.gate('arr', 160)) return;
    const deg = (l * 2 + (station % 3)) % SCALE.length;
    this.tone(this.note(deg, 1), { type: 'sine', dur: 1.1, vol: 0.07, bus: this.mBus, attack: 0.01, verb: 0.7 });
  }

  // ── nappe adaptative ──
  startMusic() {
    if (!this.ctx || this.layers) return;
    const c = this.ctx;
    const mk = (f, type, vol) => {
      const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.value = 0; o.connect(lp); lp.connect(g); g.connect(this.mBus);
      const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.verb);
      o.start(); return { o, g, lp, vol };
    };
    this.layers = {
      pad1: mk(ROOT / 2, 'triangle', 0.05), pad2: mk(this.note(4, -1), 'sine', 0.04), pad3: mk(this.note(7, -1), 'sine', 0.035),
      drone: mk(ROOT / 4, 'sawtooth', 0.025),
    };
    this.layers.drone.lp.frequency.value = 260;
  }
  stopMusic() {
    if (!this.layers) return;
    const t = this.ctx.currentTime;
    for (const L of Object.values(this.layers)) { L.g.gain.setTargetAtTime(0, t, 0.3); L.o.stop(t + 1.5); }
    this.layers = null;
  }
  // density ∈ [0,1] : taille du réseau ; tension ∈ [0,1] : saturation maximale.
  mood(density, tension, paused) {
    if (!this.layers || !this.ctx) return;
    const t = this.ctx.currentTime, L = this.layers;
    const p = paused ? 0.4 : 1;
    L.pad1.g.gain.setTargetAtTime(L.pad1.vol * p, t, 1.5);
    L.pad2.g.gain.setTargetAtTime(L.pad2.vol * Math.min(1, density * 2) * p, t, 2);
    L.pad3.g.gain.setTargetAtTime(L.pad3.vol * Math.max(0, density * 2 - 1) * p, t, 2);
    L.drone.g.gain.setTargetAtTime(L.drone.vol * tension * p, t, tension > this.tension ? 0.8 : 2.5);
    L.pad1.lp.frequency.setTargetAtTime(500 + density * 1400, t, 2);
    this.tension = tension;
  }
  // Toutes les ~8 s, la nappe glisse vers un autre accord de la gamme.
  advance() {
    if (!this.layers) return;
    this.chord = (this.chord + 1) % 4;
    const roots = [0, 3, 4, 2];
    const r = roots[this.chord], t = this.ctx.currentTime;
    this.layers.pad1.o.frequency.setTargetAtTime(this.note(r, -1) / 2, t, 1.2);
    this.layers.pad2.o.frequency.setTargetAtTime(this.note(r + 2, -1), t, 1.2);
    this.layers.pad3.o.frequency.setTargetAtTime(this.note(r + 4, -1), t, 1.2);
  }
}
