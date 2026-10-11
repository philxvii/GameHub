// Sons du jeu : synthetises avec Web Audio (aucun fichier, aucune dependance).
// Un seul vocabulaire pour toutes les mecaniques :
//   dice   lancer de de          coin   argent qui passe        stamp  cachet / adjuge / acquis
//   tick   seconde qui tombe     beat   battement de tension     go     depart (vert)
//   win    resultat favorable    lose   resultat defavorable     pop    reaction
//   sting  grand moment (Money Time, faillite)
// Coupe par le bouton du bandeau (memorise sur l'appareil) ; muet si l'onglet est masque
// et tant que l'utilisateur n'a pas encore interagi avec la page.

const KEY = 'banqueroll-sound';
let ctx = null;
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch (e) { return false; } })();

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) { /* stockage bloque */ }
}

function audio() {
  if (muted || document.hidden) return null;
  // Pas de son avant un vrai geste de l'utilisateur (sinon Chrome bloque et avertit en console).
  if (!ctx && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
  try {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();     // debloque au premier geste de l'utilisateur
    return ctx;
  } catch (e) { return null; }
}

// Une note : frequence (glissee), enveloppe courte, type d'onde.
function tone(a, { f = 440, f2 = null, t = 0, d = 0.12, v = 0.18, type = 'sine' }) {
  const o = a.createOscillator(), g = a.createGain();
  const at = a.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + d);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + d);
  o.connect(g).connect(a.destination);
  o.start(at); o.stop(at + d + 0.02);
}

// Generateur propre au son : le bruit ne doit jamais consommer Math.random, qui sert
// aux tirages du jeu (et que les tests truquent pour les rendre reproductibles).
let seed = 0x9e3779b9;
function hiss() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }

// Bruit bref (de qui roule, cachet qui frappe).
function noise(a, { t = 0, d = 0.08, v = 0.2, hp = 800 }) {
  const len = Math.max(1, Math.floor(a.sampleRate * d));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (hiss() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  src.buffer = buf; g.gain.value = v;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + t);
}

const SOUNDS = {
  dice:  a => { for (let i = 0; i < 5; i++) noise(a, { t: i * 0.09, d: 0.05, v: 0.12, hp: 1500 }); },
  coin:  a => { tone(a, { f: 1320, d: 0.08, v: 0.08, type: 'triangle' }); tone(a, { f: 1760, t: 0.06, d: 0.12, v: 0.07, type: 'triangle' }); },
  stamp: a => { noise(a, { d: 0.12, v: 0.35, hp: 200 }); tone(a, { f: 110, f2: 60, d: 0.18, v: 0.25, type: 'square' }); },
  tick:  a => tone(a, { f: 1000, d: 0.04, v: 0.06, type: 'square' }),
  beat:  a => { tone(a, { f: 70, f2: 50, d: 0.12, v: 0.3 }); tone(a, { f: 65, f2: 45, t: 0.16, d: 0.12, v: 0.22 }); },
  go:    a => tone(a, { f: 660, f2: 990, d: 0.12, v: 0.12, type: 'triangle' }),
  win:   a => [523, 659, 784].forEach((f, i) => tone(a, { f, t: i * 0.09, d: 0.16, v: 0.1, type: 'triangle' })),
  lose:  a => [392, 330, 262].forEach((f, i) => tone(a, { f, t: i * 0.12, d: 0.2, v: 0.1, type: 'sawtooth' })),
  pop:   a => tone(a, { f: 300, f2: 900, d: 0.07, v: 0.08, type: 'sine' }),
  sting: a => { tone(a, { f: 220, f2: 110, d: 0.5, v: 0.2, type: 'sawtooth' }); tone(a, { f: 330, f2: 165, t: 0.05, d: 0.5, v: 0.12, type: 'square' }); noise(a, { d: 0.25, v: 0.2, hp: 300 }); },
};

export function sfx(name) {
  const fn = SOUNDS[name];
  const a = fn && audio();
  if (!a) return;
  try { fn(a); } catch (e) { /* son facultatif */ }
}
