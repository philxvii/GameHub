// Génère games/mini-subway/cover.webp (720 × 960, carte du hub) avec le moteur et le
// rendu du jeu : un réseau joué par le joueur automatique, cadré en portrait.
//
//   node games/mini-subway/tests/cover.cjs     (dépôt servi sur :4173, émulateurs lancés)

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../tools/cdp.js');

(async () => {
  const b = await Browser.launch({ headless: true });
  try {
    const p = await b.newPage('http://localhost:4173/games/mini-subway/?emu');
    await sleep(1500);
    const data = await p.eval(`
      const sim = await import('/games/mini-subway/js/engine/sim.js');
      const ap = await import('/games/mini-subway/js/engine/autoplay.js');
      const { Renderer } = await import('/games/mini-subway/js/render.js');
      const st = sim.createGame({ map: 'delta-sauge', mode: 'infinite', seed: 20251 });
      for (let i = 0; i < 9000; i++) { sim.step(st); if (i % 30 === 0) ap.botTurn(st); if (st.reward) sim.apply(st, { type: 'reward', pick: 0 }); }
      const cv = document.createElement('canvas');
      const R = new Renderer(cv, { w: 720, h: 960 });
      R.setOptions({ theme: 'day', palette: 'standard', reduced: true });
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of st.stations) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
      // portrait plein cadre : on zoome sur la hauteur du réseau, centré sur son barycentre
      const cx = st.stations.reduce((a, s) => a + s.x, 0) / st.stations.length;
      const z = 960 / (y1 - y0 + 300);
      Object.assign(R.cam, { x: cx, y: Math.max(480 / z, Math.min(1000 - 480 / z, (y0 + y1) / 2 + 40)), z });
      R.now = 0;
      for (const s of st.stations) { s.o = 0; }
      R.frame(st, 0.5, null, 0);
      return cv.toDataURL('image/webp', 0.9);`);
    const out = path.join(__dirname, '..', 'cover.webp');
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
    console.log('écrit', out, fs.statSync(out).size, 'octets');
  } finally { await b.close(); }
})();
