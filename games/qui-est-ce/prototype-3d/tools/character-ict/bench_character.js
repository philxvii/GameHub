// Banc de mesure d'un personnage : coiffure V4.1 optimisee attachee, meme camera, meme
// lumiere, poses rejouees a l'identique (compare.html?bench=...&char=...). Une page neuve
// par personnage.
//
//   python -m http.server 4173                                   # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/character-ict/bench_character.js models/character-01-ict.glb build/bench/ict-ref [--no-time] [--acc a.glb,b.glb]
//
// Ecrit <dossier>/<etat>.png, <dossier>/zones.json (yeux et bouche, en pixels, par etat) et
// <dossier>/stats.json : poids, temps d'analyse du GLB, triangles, draw calls, cout d'une
// image (ms, CPU + GPU, ombres comprises). Comparer ensuite avec tools/hair/diff_shots.py.

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../../tools/cdp');
const { localCdn } = require('../local-cdn');                  // THREE_LOCAL=1 : CDN servis depuis npm (cloud)

const [glb, outDir, ...rest] = process.argv.slice(2);
const NO_TIME = rest.includes('--no-time');           // machine sans GPU : les temps ne valent rien
const ACC = rest.includes('--acc') ? rest[rest.indexOf('--acc') + 1] : '';   // accessoires (liste separee par des virgules)
if (!glb || !outDir) { console.error('usage : bench_character.js <personnage.glb> <dossier>'); process.exit(2); }
const HAIR = 'models/hair/hair-curly-v41-opt.glb';
const ROOT = path.join(__dirname, '..', '..');
// Drapeaux GPU : D3D11 sous Windows ; ailleurs (machine cloud sans GPU), rendu logiciel
// SwiftShader (deterministe, mais les temps de rendu ne valent pas ceux d'un vrai GPU).
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const GPU_FLAGS = process.platform === 'win32'
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const URL = `${ORIGIN}/games/qui-est-ce/prototype-3d/compare.html?bench=${HAIR}&char=${glb}${ACC ? '&acc=' + ACC : ''}`;
// [nom, expression, regard, options] : les 6 etats de jeu (memes noms que bench_hair.js),
// puis yeux fermes et gros plans. L'ordre est fixe : le temps simule avance d'un etat a l'autre.
const STATES = [
  ['neutral', 'neutral', 'front'], ['smile', 'smile', 'front'],
  ['suspicious', 'suspicious', 'front'], ['surprised', 'surprised', 'front'],
  ['left', 'neutral', 'left'], ['right', 'neutral', 'right'],
  ['yeux-fermes', 'neutral', 'front', { closed: true }],
  ['gp-yeux', 'neutral', 'front', { zoom: 'eyes' }],
  ['gp-yeux-fermes', 'neutral', 'front', { zoom: 'eyes', closed: true }],
  ['gp-yeux-mefiant', 'suspicious', 'front', { zoom: 'eyes' }],
  ['gp-bouche-sourire', 'smile', 'front', { zoom: 'mouth' }],
  ['gp-bouche-surpris', 'surprised', 'front', { zoom: 'mouth' }],
];

(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '1000,1300', extraArgs: GPU_FLAGS });
  try {
    const p = await b.newPage('about:blank', 'bench');
    await localCdn(p);
    await p.goto(URL);
    for (let i = 0; i < 180 && (await p.eval('return document.title')) !== 'bench-ready'; i++) await sleep(500);
    if ((await p.eval('return document.title')) !== 'bench-ready') throw new Error('banc non pret : ' + JSON.stringify(p.errors()));
    const info = await p.eval('return __bench.info()');
    const gpu = await p.eval(`const gl = document.createElement('canvas').getContext('webgl2');
      const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'`);
    fs.mkdirSync(path.join(ROOT, outDir), { recursive: true });
    let calls = 0;
    const zones = {};
    for (const [name, expr, look, opts = {}] of STATES) {
      const r = await p.eval(`return __bench.pose(${JSON.stringify(expr)}, ${JSON.stringify(look)}, ${JSON.stringify(opts)})`);
      if (!opts.zoom) { calls = r.calls; zones[name] = r.zones; }
      fs.writeFileSync(path.join(ROOT, outDir, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    for (const [name, deg] of [['profil', 90], ['trois-quarts-dos', 135], ['dos', 180]]) {   // hors etats de jeu
      const r = await p.eval(`return __bench.orbit(${deg})`);
      fs.writeFileSync(path.join(ROOT, outDir, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    fs.writeFileSync(path.join(ROOT, outDir, 'zones.json'), JSON.stringify(zones));
    const ms = [];
    if (!NO_TIME) {
      await p.eval('__bench.time(20)');                                // chauffe
      for (let i = 0; i < 5; i++) ms.push(await p.eval('return __bench.time(60)'));
      ms.sort((x, y) => x - y);
    }
    const stats = { glb, bytes: info.charBytes, parseMs: +info.charParseMs.toFixed(1), triangles: info.triangles,
      drawCalls: calls, frameMs: ms.length ? +ms[2].toFixed(2) : null, frameMsAll: ms.map((x) => +x.toFixed(2)),
      hair: HAIR, hairBytes: info.bytes, acc: info.acc, gpu, errors: p.errors() };
    fs.writeFileSync(path.join(ROOT, outDir, 'stats.json'), JSON.stringify(stats, null, 1));
    console.log(JSON.stringify(stats));
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
