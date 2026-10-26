// Habillage sonore, synthétisé (Web Audio) : aucun fichier, aucune licence. Un orchestre
// de plateau en miniature : bois (top du chrono), cuivres (départ, verdict, fanfare),
// caisse claire (roulement avant un résultat), mécanique (palettes, verrou), trombone
// (la lanterne rouge). Chaque son est court et suit un mouvement visible ; aucun n'est
// un signal de jeu (le Gong est visuel : la latence audio varie d'un appareil à l'autre).
// Coupé d'un clic (mémorisé). Rien ne joue avant une interaction (règle des navigateurs).
// Les actions du joueur sont aussi signalées à la scène (évènement mp:fx), pour que le
// présentateur y réagisse, son coupé ou non.

let ctx = null, bus = null;
let muted = false;
try { muted = localStorage.getItem('mp-mute') === '1'; } catch (_) { /* stockage bloqué */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('mp-mute', muted ? '1' : '0'); } catch (_) {}
}

function ac() {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Un léger compresseur : les cuivres ne saturent pas, les bois restent présents.
      bus = ctx.createDynamicsCompressor();
      bus.threshold.value = -18; bus.ratio.value = 4;
      bus.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (_) { return null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.12, at = 0, slide = 0, attack = 0.008 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.08, at = 0, hp = 1800, lp = 0, decay = true } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (decay ? 1 - i / d.length : 1);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f).connect(g).connect(bus);
  s.start(t);
}

// Cuivre : dents de scie désaccordées, filtre qui s'ouvre à l'attaque (le « blat »).
function brass(freqs, dur, { at = 0, vol = 0.05 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'lowpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(1200, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(bus);
  freqs.forEach(fr => [-6, 6].forEach(cents => {
    const o = a.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = cents;
    o.connect(f); o.start(t); o.stop(t + dur + 0.05);
  }));
}

const fx = kind => { try { dispatchEvent(new CustomEvent('mp:fx', { detail: kind })); } catch (_) {} };
let lastFlap = 0;
export const sfx = {
  // palette du tableau : un claquement sec, avec le petit choc du volet qui retombe
  flap() { const t = performance.now(); if (t - lastFlap < 28) return; lastFlap = t; noise(0.014, { vol: 0.06, hp: 3000 }); tone(160, 0.03, { type: 'square', vol: 0.012 }); },
  // top du chrono : un bois ; le dernier est plus aigu
  tick(last = false) { tone(last ? 1560 : 1180, 0.06, { type: 'triangle', vol: 0.06 }); noise(0.02, { vol: 0.03, hp: 4000 }); },
  // départ : accord de cuivres bref et cymbale
  go() { brass([392, 494, 587], 0.32, { vol: 0.045 }); noise(0.5, { vol: 0.04, hp: 6000 }); },
  // verrou : le pêne qui tombe
  lock() { tone(110, 0.14, { type: 'sine', vol: 0.18 }); noise(0.05, { vol: 0.08, lp: 1400 }); tone(1900, 0.02, { type: 'square', vol: 0.02, at: 0.04 }); fx('lock'); },
  // bonne action : clochette à deux tons
  good() { tone(1318, 0.12, { type: 'sine', vol: 0.06 }); tone(1975, 0.18, { type: 'sine', vol: 0.035, at: 0.05 }); fx('good'); },
  // erreur : un « tonk » mat, pas une alarme
  bad() { tone(196, 0.2, { type: 'triangle', vol: 0.09, slide: -50 }); noise(0.06, { vol: 0.04, lp: 600 }); fx('bad'); },
  // révélation : roulement court puis coup
  sting() { this.drum(0.55); brass([523, 659, 784], 0.28, { at: 0.55, vol: 0.05 }); noise(0.4, { vol: 0.04, hp: 5000, at: 0.55 }); },
  // roulement de caisse claire (crescendo)
  drum(dur = 1.2, at = 0) {
    const a = ac();
    if (!a) return;
    for (let k = 0, n = Math.floor(dur / 0.045); k < n; k++) noise(0.04, { vol: 0.012 + 0.05 * (k / n), hp: 1200, at: at + k * 0.045 });
  },
  // un coup de grosse caisse et de cymbale (le verdict)
  hit(at = 0) { tone(70, 0.4, { type: 'sine', vol: 0.25, slide: -30, at }); noise(0.9, { vol: 0.05, hp: 5000, at }); },
  // tampon « Sans appel »
  stamp() { tone(90, 0.12, { type: 'sine', vol: 0.2 }); noise(0.08, { vol: 0.09, lp: 900 }); },
  // trombone triste de la lanterne rouge
  wah(at = 0) { [233, 220, 208].forEach((f, k) => brass([f], k === 2 ? 0.6 : 0.26, { at: at + k * 0.28, vol: 0.035 })); },
  fanfare() { [[392, 523], [523, 659], [659, 784], [784, 1046, 1318]].forEach((fr, k) => brass(fr, k === 3 ? 0.9 : 0.2, { at: k * 0.16, vol: 0.045 })); this.hit(0.48); },
  // applaudissements : une pluie de claquements filtrés
  applause(dur = 2.4) { const a = ac(); if (!a) return; for (let k = 0; k < dur * 60; k++) noise(0.012, { vol: 0.03 * (1 - k / (dur * 60)) + 0.005, hp: 1400 + Math.random() * 2000, at: Math.random() * dur }); },
  boo() { this.wah(); },
  // glissement d'un élément de décor (poursuite qui pivote, carton qui descend des cintres)
  whoosh() { noise(0.35, { vol: 0.03, lp: 900, decay: false }); },
};
