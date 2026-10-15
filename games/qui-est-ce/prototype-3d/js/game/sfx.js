// Effets sonores synthetises (Web Audio : aucun fichier, aucune licence). Courts, discrets,
// COUPES PAR DEFAUT : le joueur les active (bouton « Son »), le choix est memorise. Pas de musique.
// Ecoute les evenements du jeu emis par events.js (window, « qe:<nom> »).

const KEY = 'qe3d.sound';
const NOTES = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, F4: 349.23, D4: 293.66, B3: 246.94 };

export function createSfx() {
  let ctx = null, master = null;
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (_) {}
  const audio = () => {
    if (!ctx) { ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.16; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  // une note : enveloppe percussive (attaque 4 ms), timbre doux (sinus + triangle a l'octave)
  function tone(f, at, dur = 0.16, vol = 0.5, type = 'sine') {
    const c = audio(), t = c.currentTime + at;
    for (const [k, w, v] of [[1, type, vol], [2, 'triangle', vol * 0.18]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = w; o.frequency.value = f * k;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  // souffle filtre : le trait qui ecarte un suspect
  function swish(at = 0, dur = 0.09, freq = 1800) {
    const c = audio(), t = c.currentTime + at, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur); f.Q.value = 0.9;
    g.gain.value = 0.55; s.buffer = buf; s.connect(f).connect(g).connect(master); s.start(t);
  }
  const SOUNDS = {
    select: () => tone(NOTES.G5, 0, 0.07, 0.22),
    pick: () => tone(NOTES.E5, 0, 0.09, 0.3),
    confirm: () => { tone(NOTES.C5, 0, 0.12, 0.32); tone(NOTES.G5, 0.07, 0.18, 0.3); },
    ask: () => { tone(NOTES.E4, 0, 0.1, 0.28); tone(NOTES.A4, 0.06, 0.16, 0.28); },
    question: () => { tone(NOTES.A4, 0, 0.1, 0.26); tone(NOTES.D5, 0.08, 0.2, 0.26); },
    yes: () => { tone(NOTES.C5, 0, 0.12, 0.3); tone(NOTES.E5, 0.08, 0.22, 0.3); },
    no: () => { tone(NOTES.E4, 0, 0.12, 0.3); tone(NOTES.C4, 0.09, 0.24, 0.3); },
    cross: () => swish(),
    uncross: () => tone(NOTES.G4, 0, 0.08, 0.2),
    accuse: () => { tone(NOTES.B3, 0, 0.3, 0.38, 'triangle'); tone(NOTES.F4, 0.02, 0.3, 0.2); },
    reveal: () => { [NOTES.C4, NOTES.G4, NOTES.E5].forEach((f, k) => tone(f, k * 0.05, 0.9, 0.18)); },
    win: () => { [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, k) => tone(f, 0.25 + k * 0.09, 0.32, 0.26)); },
    lose: () => { tone(NOTES.E4, 0.25, 0.3, 0.26); tone(NOTES.D4, 0.4, 0.5, 0.22); },
    rematch: () => { tone(NOTES.G4, 0, 0.1, 0.28); tone(NOTES.C5, 0.07, 0.18, 0.28); },
  };
  const play = (name) => { if (on && SOUNDS[name]) try { SOUNDS[name](); } catch (_) {} };
  const map = { pick: 'pick', select: 'select', confirm: 'confirm', ask: 'ask', question: null, reply: null, cross: 'cross', uncross: 'uncross', accuse: 'accuse', reveal: 'reveal', win: 'win', lose: 'lose', rematch: 'rematch' };
  for (const [ev, snd] of Object.entries(map)) if (snd) addEventListener(`qe:${ev}`, () => play(snd));
  // question recue de l'adversaire, reponse a ma question
  addEventListener('qe:question', (e) => { if (e.detail?.mine === false) play('question'); });
  addEventListener('qe:answer', (e) => play(e.detail?.yes ? 'yes' : 'no'));
  return {
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} if (on) audio(); },
    play,
  };
}
