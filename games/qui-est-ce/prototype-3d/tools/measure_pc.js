// Mesures sur le PC (vrai GPU), en une commande, depuis la racine du depot :
//
//   node games/qui-est-ce/prototype-3d/tools/measure_pc.js
//
// Lance (si besoin) le serveur local, puis : test-proto.js, le banc du personnage optimise,
// le plateau (chargement, images par seconde au repos et au survol, allumage d'une carte vivante,
// memoire), et une partie complete contre le bot (test-board.js). Ecrit
// reports/pc/résumé.md avec les seuils attendus. Les journaux bruts vont dans build/pc/.
// Dans le cloud (sans GPU), les temps ne valent rien : le script le dit et s'arrete.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');                       // THREE_LOCAL=1 seulement (cloud) ; sur le PC, rien

const PROTO = path.join(__dirname, '..');
const ROOT = path.join(PROTO, '..', '..', '..');
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const OUT = path.join(PROTO, 'build', 'pc');
const REPORT = path.join(PROTO, 'reports', 'pc', 'résumé.md');
const GPU_FLAGS = ['--ignore-gpu-blocklist', '--enable-gpu', ...(WIN ? ['--use-angle=d3d11'] : ['--enable-unsafe-swiftshader'])];
const ONLY_BOARD = process.argv.includes('--plateau');            // le plateau seul (essai rapide)
const HEADLESS = process.env.PC_HEADLESS === '1';                // navigateur visible par defaut (vrai GPU, vraie fenetre)
// Seuils : ce que le jeu doit tenir sur l'ordinateur de l'utilisateur (Iris Xe, ecran 60 Hz).
const SEUILS = { fpsSurvol: 50, fpsRepos: 55, chargementMs: 6000, allumageMs: 1500, allumageCacheMs: 120, imagePersoMs: 8 };

async function up() { try { return (await fetch(ORIGIN + '/index.html')).ok; } catch (_) { return false; } }
function node(script, args, log) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8', env: process.env, timeout: 20 * 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(OUT, log), out);
  const score = (out.match(/=====\s*([^=]+?)\s*=====\s*$/m) || [])[1] || `code ${r.status}`;
  return { ok: r.status === 0, score, s: Math.round((Date.now() - t0) / 1000) };
}
const ev = (p, js) => p.eval(js);
const until = async (p, js, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(p, `return !!(${js})`).catch(() => false)) return true; await sleep(200); } return false; };

// Images par seconde mesurees dans la page (requestAnimationFrame) pendant `ms`.
const FPS_JS = (ms) => `return await new Promise((res) => { const t = []; const t0 = performance.now();
  const f = (now) => { t.push(now); if (now - t0 < ${ms}) requestAnimationFrame(f); else {
    const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
    res({ fps: +(1000 * (t.length - 1) / (t[t.length - 1] - t[0])).toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), images: d.length }); } };
  requestAnimationFrame(f); })`;

async function board() {
  const b = await Browser.launch({ headless: HEADLESS, windowSize: '1600,1000', extraArgs: GPU_FLAGS });
  const p = await b.newPage('about:blank', 'pc');
  await localCdn(p);
  try {
    const t0 = Date.now();
    await p.goto(`${ORIGIN}/games/qui-est-ce/prototype-3d/board.html?autostart`);
    const ready = await until(p, '__game.view() && __game.view().phase === "choose" && [...document.querySelectorAll("#lineup img.still:not(.alt)")].every((i) => i.complete)', 120000);
    const chargementMs = Date.now() - t0;
    if (!ready) throw new Error('plateau non charge en 2 min');
    await sleep(2000);
    const repos = await ev(p, FPS_JS(5000));
    // allumage d'une carte (le personnage prend vie) : premiere fois (chargement du GLB) puis en memoire
    const centre = (i) => ev(p, `const r = document.querySelector('.suspect[data-i="${i}"] .shot').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * .4]`);
    const allume = async (i) => {
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }); await sleep(400);
      const [x, y] = await centre(i); const t = Date.now();
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await until(p, `document.querySelector('.live.on') && __game.live().stats().active === ${i}`, 60000);
      return Date.now() - t;
    };
    const allumage1 = await allume(4), allumage2 = await allume(9), allumageCache = await allume(4);
    const gpu = await ev(p, `const gl = __game.live().renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info');
      return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)`);
    // survol : la souris balaie les cartes pendant la mesure (une carte vivante a la fois)
    const pts = []; for (let i = 0; i < 24; i++) pts.push(await centre(i));
    let sweeping = true;
    const sweep = (async () => { for (let k = 0; sweeping; k++) { const [x, y] = pts[k % pts.length];
      for (let j = 0; j < 6 && sweeping; j++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 30 + j * 12, y }).catch(() => {}); await sleep(40); } } })();
    const survol = await ev(p, FPS_JS(8000));
    sweeping = false; await sweep;
    const mem = await ev(p, `const res = performance.getEntriesByType('resource'), sum = (re) => res.filter((r) => re.test(r.name)).reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0);
      return { portraitsMo: +(sum(/\.webp/) / 1048576).toFixed(1), glbMo: +(sum(/\.glb/) / 1048576).toFixed(1), tasJsMo: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, ...__game.live().stats() }`);
    const errs = p.errors();
    return { gpu, chargementMs, repos, survol, allumage1, allumage2, allumageCache, mem, errs };
  } finally { await b.close(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  let server = null;
  if (!(await up())) {
    server = spawn(WIN ? 'python' : 'python3', ['-m', 'http.server', '4173'], { cwd: ROOT, stdio: 'ignore' });
    for (let k = 0; k < 50 && !(await up()); k++) await sleep(200);
  }
  try {
    const R = {};
    if (ONLY_BOARD) { const B = await board(); console.log(JSON.stringify(B, null, 1)); return; }
    console.log('1/4 test-proto.js'); R.proto = node('games/qui-est-ce/prototype-3d/tools/test-proto.js', [], 'test-proto.log');
    console.log('2/4 banc du personnage'); R.banc = node('games/qui-est-ce/prototype-3d/tools/character-ict/bench_character.js', ['models/character-01-ict-opt.glb', 'build/pc/banc'], 'banc.log');
    let perso = {}; try { perso = JSON.parse(fs.readFileSync(path.join(OUT, 'banc', 'stats.json'), 'utf8')); } catch (_) {}
    console.log('3/4 plateau 24 cartes'); const B = await board();
    if (/swiftshader|llvmpipe|software/i.test(B.gpu)) console.log(`ATTENTION : rendu logiciel (${B.gpu}) : temps sans valeur`);
    console.log('4/4 partie contre le bot'); R.partie = node('games/qui-est-ce/prototype-3d/tools/test-board.js', [], 'partie.log');

    const imagePersoMs = perso.frameMs ?? null;
    const lignes = [
      ['Chargement (24 portraits prêts, partie lancée)', `${(B.chargementMs / 1000).toFixed(1)} s`, `≤ ${SEUILS.chargementMs / 1000} s`, B.chargementMs <= SEUILS.chargementMs],
      ['Images par seconde au repos', `${B.repos.fps} (p95 ${B.repos.p95Ms} ms)`, `≥ ${SEUILS.fpsRepos}`, B.repos.fps >= SEUILS.fpsRepos],
      ['Images par seconde au survol (une carte vivante)', `${B.survol.fps} (p95 ${B.survol.p95Ms} ms)`, `≥ ${SEUILS.fpsSurvol}`, B.survol.fps >= SEUILS.fpsSurvol],
      ['Allumage d’une carte : 1er personnage (chargement)', `${B.allumage1} ms`, `≤ ${SEUILS.allumageMs} ms`, B.allumage1 <= SEUILS.allumageMs],
      ['Allumage d’une carte : autre personnage', `${B.allumage2} ms`, `≤ ${SEUILS.allumageMs} ms`, B.allumage2 <= SEUILS.allumageMs],
      ['Allumage d’une carte déjà vue', `${B.allumageCache} ms`, `≤ ${SEUILS.allumageCacheMs} ms`, B.allumageCache <= SEUILS.allumageCacheMs],
      ['Image du personnage seul (banc)', imagePersoMs === null ? 'voir build/pc/banc/stats.json' : `${imagePersoMs} ms`, `≤ ${SEUILS.imagePersoMs} ms`, imagePersoMs === null ? null : imagePersoMs <= SEUILS.imagePersoMs],
      ['Portraits téléchargés', `${B.mem.portraitsMo} Mo`, '—', null],
      ['GLB chargés pendant la mesure', `${B.mem.glbMo} Mo`, '—', null],
      ['Tas JavaScript', B.mem.tasJsMo === null ? '—' : `${B.mem.tasJsMo} Mo`, '—', null],
    ];
    const etat = (ok) => (ok === null ? '' : ok ? 'OK' : '**À revoir**');
    const md = `# Mesures sur le PC

${new Date().toISOString().slice(0, 16).replace('T', ' ')} · GPU : ${B.gpu} · navigateur visible, ${ORIGIN}

## Tests

| Test | Résultat | Durée |
| --- | --- | --- |
| test-proto.js | ${R.proto.score} | ${R.proto.s} s |
| banc du personnage (build/pc/banc/) | ${R.banc.ok ? 'fait' : 'échec, voir build/pc/banc.log'} | ${R.banc.s} s |
| partie complète contre le bot (test-board.js) | ${R.partie.score} | ${R.partie.s} s |

## Plateau et personnage

| Mesure | Valeur | Seuil | État |
| --- | --- | --- | --- |
${lignes.map((l) => `| ${l[0]} | ${l[1]} | ${l[2]} | ${etat(l[3])} |`).join('\n')}

Personnages 3D en mémoire : ${B.mem.loaded} ; géométries ${B.mem.memory.geometries}, textures ${B.mem.memory.textures}, programmes ${B.mem.programs}.
Mémoire GPU réelle : Gestionnaire des tâches → Performances → GPU (dédiée + partagée) pendant la mesure.
${B.errs.length ? `\nConsole : ${B.errs.length} erreur(s) : ${B.errs.slice(0, 3).join(' · ')}\n` : '\nConsole sans erreur.\n'}`;
    fs.writeFileSync(REPORT, md);
    fs.writeFileSync(path.join(OUT, 'mesures.json'), JSON.stringify({ R, B, perso }, null, 1));
    console.log(md); console.log('->', path.relative(ROOT, REPORT));
  } finally { if (server) server.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
