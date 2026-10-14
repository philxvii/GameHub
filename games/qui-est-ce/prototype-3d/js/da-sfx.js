// Sons des directions artistiques, synthetises en Web Audio (aucun fichier, aucun droit).
// Chaque son est court, sec et grave plutot que brillant : des objets, pas des bips.

let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c, dur) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; return s;
}

// Rafale de bruit filtre avec enveloppe : la brique de presque tous les sons.
function burst({ t = 0, dur = 0.08, type = 'bandpass', freq = 1200, q = 1, gain = 0.5, attack = 0.002, sweep = null }) {
  const c = ac(), at = c.currentTime + t;
  const src = noise(c, dur + 0.05), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(c.destination); src.start(at); src.stop(at + dur + 0.05);
}

function tone({ t = 0, dur = 0.3, freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.005 }) {
  const c = ac(), at = c.currentTime + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + dur + 0.02);
}

const SFX = {
  // A · le dossier
  type() { for (let i = 0; i < 5; i++) { const t = i * 0.085 + Math.random() * 0.03; burst({ t, dur: 0.035, freq: 2600, q: 2.5, gain: 0.45 }); burst({ t, dur: 0.05, type: 'lowpass', freq: 400, gain: 0.25 }); } },
  stamp() { burst({ dur: 0.16, type: 'lowpass', freq: 260, gain: 0.9, attack: 0.003 }); tone({ dur: 0.12, freq: 120, to: 60, gain: 0.35 }); burst({ t: 0.01, dur: 0.05, freq: 1800, q: 1.2, gain: 0.18 }); },
  drawer() { burst({ dur: 0.45, freq: 900, q: 3, gain: 0.22, attack: 0.05, sweep: 500 }); burst({ t: 0.42, dur: 0.12, type: 'lowpass', freq: 300, gain: 0.7 }); },
  // B · la seance de casting
  shutter() { burst({ dur: 0.03, freq: 4200, q: 1.5, gain: 0.5 }); burst({ t: 0.06, dur: 0.04, freq: 3000, q: 1.5, gain: 0.45 }); burst({ t: 0.06, dur: 0.06, type: 'lowpass', freq: 500, gain: 0.25 }); },
  flash() { burst({ dur: 0.05, freq: 5200, q: 1, gain: 0.25 }); tone({ t: 0.05, dur: 0.9, freq: 2200, to: 7800, gain: 0.025, attack: 0.08 }); },
  marker() { burst({ dur: 0.22, freq: 1500, q: 6, gain: 0.25, attack: 0.02, sweep: 2300 }); burst({ t: 0.22, dur: 0.2, freq: 1700, q: 6, gain: 0.22, attack: 0.02, sweep: 1200 }); },
  // C · le salon des portraits
  thunk() { tone({ dur: 0.22, freq: 180, to: 90, gain: 0.35 }); burst({ dur: 0.12, type: 'lowpass', freq: 700, gain: 0.45 }); },
  bell() { for (const [f, g] of [[1318, 0.12], [2637, 0.04], [3950, 0.02]]) tone({ dur: 1.6, freq: f, gain: g, attack: 0.003 }); },
  step() { for (let i = 0; i < 2; i++) { burst({ t: i * 0.42, dur: 0.1, type: 'lowpass', freq: 380, gain: 0.5 }); burst({ t: i * 0.42 + 0.03, dur: 0.18, freq: 620, q: 8, gain: 0.08 }); } },
};

export function sfx(name) { try { SFX[name]?.(); } catch (_) { /* pas d'audio : silence */ } }
