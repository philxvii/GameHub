// Habillage sonore, synthétisé (Web Audio) : aucun fichier, aucune licence. Court et
// rare : palettes du tableau, top du chrono, verrouillage, jingle, fanfare. Coupé
// d'un clic (mémorisé), et jamais utilisé comme signal de jeu (le Gong est visuel :
// la latence audio varie d'un appareil à l'autre).

let ctx = null;
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
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (_) { return null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.12, at = 0, slide = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.08, at = 0, hp = 1800 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t);
}

let lastFlap = 0;
export const sfx = {
  flap() { const t = performance.now(); if (t - lastFlap < 28) return; lastFlap = t; noise(0.018, { vol: 0.05, hp: 2600 }); },
  tick() { tone(1250, 0.05, { type: 'square', vol: 0.03 }); },
  go() { tone(660, 0.12, { type: 'triangle', vol: 0.1 }); tone(990, 0.18, { type: 'triangle', vol: 0.08, at: 0.08 }); },
  lock() { tone(220, 0.16, { type: 'square', vol: 0.06 }); noise(0.08, { vol: 0.05, hp: 900 }); },
  good() { tone(880, 0.07, { type: 'triangle', vol: 0.06 }); },
  bad() { tone(180, 0.18, { type: 'sawtooth', vol: 0.05, slide: -60 }); },
  sting() { [523, 659, 784].forEach((f, k) => tone(f, 0.16, { type: 'triangle', vol: 0.07, at: k * 0.07 })); },
  fanfare() { [392, 523, 659, 784, 1046].forEach((f, k) => tone(f, k === 4 ? 0.6 : 0.16, { type: 'triangle', vol: 0.08, at: k * 0.11 })); },
  boo() { tone(196, 0.5, { type: 'sawtooth', vol: 0.04, slide: -70 }); },
};
