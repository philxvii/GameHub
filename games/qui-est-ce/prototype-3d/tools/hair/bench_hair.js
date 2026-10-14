// Banc de mesure d'une coiffure : meme personnage, meme camera, meme lumiere, poses
// rejouees a l'identique (compare.html?bench=). Une page neuve par coiffure.
//
//   python -m http.server 4173                                   # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/hair/bench_hair.js models/hair/x.glb build/bench/x
//   ... --vis build/bench/x-vis.json      # + visibilite de chaque carte (passe d'identifiants)
//   ... --no-time                         # sans mesure de temps (machine sans GPU)
//
// Ecrit <dossier>/<etat>.png et <dossier>/stats.json : poids, triangles, draw calls,
// temps d'analyse du GLB, cout d'une image (ms, CPU + GPU, ombres comprises).

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../../tools/cdp');
const { localCdn } = require('../local-cdn');                  // THREE_LOCAL=1 : CDN servis depuis npm (cloud)

const [glb, outDir, ...rest] = process.argv.slice(2);
const visOut = rest.includes('--vis') ? rest[rest.indexOf('--vis') + 1] : null;
const NO_TIME = rest.includes('--no-time');           // machine sans GPU : les temps ne valent rien
const ROOT = path.join(__dirname, '..', '..');
// Drapeaux GPU : D3D11 sous Windows ; ailleurs (machine cloud sans GPU), rendu logiciel
// SwiftShader (deterministe, mais les temps de rendu ne valent pas ceux d'un vrai GPU).
// ORIGIN : serveur statique a la racine du depot (PROTO_ORIGIN pour changer de port).
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = `${ORIGIN}/games/qui-est-ce/prototype-3d/compare.html?bench=${glb}`;
const STATES = [
  ['neutral', 'neutral', 'front'], ['smile', 'smile', 'front'],
  ['suspicious', 'suspicious', 'front'], ['surprised', 'surprised', 'front'],
  ['left', 'neutral', 'left'], ['right', 'neutral', 'right'],
];

// Vues de la passe de visibilite : toute la sphere au-dessus du menton, plus la lumiere
// principale (orthographique, alpha de la texture seul, comme la passe d'ombre).
function views() {
  const v = [];
  for (let yaw = -180; yaw < 180; yaw += 15) for (const pitch of [-35, -15, 5, 25, 45, 65]) v.push({ yaw, pitch });
  v.push({ yaw: 0, pitch: 89 });
  return v;
}
function lightViews() {
  const v = [];
  for (let yaw = -75; yaw <= 15; yaw += 10) for (const pitch of [22, 32, 42]) v.push({ yaw, pitch, ortho: true });
  return v;
}

(async () => {
  const b = await Browser.launch({
    headless: true, windowSize: '1000,1300',
    extraArgs: GPU_FLAGS,
  });
  try {
    const p = await b.newPage('about:blank', 'bench');
    await localCdn(p);
    await p.goto(URL);
    for (let i = 0; i < 120 && (await p.eval('return document.title')) !== 'bench-ready'; i++) await sleep(500);
    const info = await p.eval('return __bench.info()');
    const gpu = await p.eval(`const gl = document.createElement('canvas').getContext('webgl2');
      const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'`);
    fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
    let calls = 0;
    for (const [name, expr, look] of STATES) {
      const r = await p.eval(`return __bench.pose(${JSON.stringify(expr)}, ${JSON.stringify(look)})`);
      calls = r.calls;
      fs.writeFileSync(path.join(ROOT, outDir, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    for (const [name, deg] of [['profil', 90], ['trois-quarts-dos', 135], ['dos', 180]]) {   // hors etats de jeu
      const r = await p.eval(`return __bench.orbit(${deg})`);
      fs.writeFileSync(path.join(ROOT, outDir, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    const ms = [];
    if (!NO_TIME) {
      await p.eval('__bench.time(30)');                                // chauffe
      for (let i = 0; i < 5; i++) ms.push(await p.eval('return __bench.time(120)'));
      ms.sort((a, b) => a - b);
    }
    const stats = { glb, ...info, drawCalls: calls, frameMs: ms.length ? +ms[2].toFixed(2) : null, frameMsAll: ms.map((x) => +x.toFixed(2)),
      fpsEquivalent: ms.length ? Math.round(1000 / ms[2]) : null, gpu, errors: p.errors() };
    if (visOut) {
      const cam = await p.eval(`return __bench.visibility({ views: ${JSON.stringify(views())} })`);
      const light = await p.eval(`return __bench.visibility({ views: ${JSON.stringify(lightViews())}, texAlphaOnly: true, size: 2048 })`);
      fs.writeFileSync(path.join(ROOT, visOut), JSON.stringify({ views: views(), lightViews: lightViews(), cam, light }));
      stats.visibility = visOut;
    }
    fs.writeFileSync(path.join(ROOT, outDir, 'stats.json'), JSON.stringify(stats, null, 1));
    console.log(JSON.stringify(stats));
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
