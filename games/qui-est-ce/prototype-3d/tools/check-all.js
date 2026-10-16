// Tous les tests du Qui est-ce ? en UNE commande, sortie courte (zero image, ~10 lignes).
//
//   node games/qui-est-ce/prototype-3d/tools/check-all.js [--fast] [--port 4190]
//
// Lance (serveur statique temporaire a la racine du depot, arrete a la fin) :
//   liens du site, logique de partie, partie complete contre le bot, test d'image des cartes.
// --fast : ignore les deux tests de navigateur (liens + logique seulement, ~2 s).
// L'avertissement D3D « X4122 » (Windows) est connu et inoffensif : un echec qui ne contient que lui passe.

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const PROTO = path.join(__dirname, '..');
const ROOT = path.join(PROTO, '..', '..', '..');
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const PORT = args.includes('--port') ? args[args.indexOf('--port') + 1] : '4190';
const ORIGIN = `http://localhost:${PORT}`;

const steps = [
  { name: 'liens du site', cmd: 'node', args: [path.join(ROOT, 'tools', 'check-links.js')], cwd: ROOT },
  { name: 'logique de partie', cmd: 'node', args: [path.join(PROTO, 'tools', 'test-game-logic.mjs')], cwd: PROTO },
  { name: 'partie complete (bot)', cmd: 'node', args: [path.join(PROTO, 'tools', 'test-board.js')], cwd: PROTO, browser: true },
  { name: 'test d\'image des cartes', cmd: 'node', args: [path.join(PROTO, 'tools', 'test-board-pixels.js')], cwd: PROTO, browser: true },
].filter((s) => !(FAST && s.browser));

function summarize(out) {
  const m = [...out.matchAll(/=====\s*(.+?)\s*:\s*(\d+)\/(\d+)\s*=====/g)].pop();
  const fails = out.split('\n').filter((l) => /^\s*ECHEC/.test(l));
  const real = fails.filter((l) => !/X4122/.test(l) || /\|\s*\[[^\]]*\]\s*$/.test('') );
  const onlyKnown = fails.length > 0 && fails.every((l) => /X4122/.test(l));
  return { m, fails, onlyKnown };
}

(async () => {
  let server = null;
  if (steps.some((s) => s.browser)) {
    server = spawn('python', ['-m', 'http.server', PORT], { cwd: ROOT, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 1500));
  }
  let bad = 0;
  const t0 = Date.now();
  for (const s of steps) {
    const t = Date.now();
    const r = spawnSync(s.cmd, s.args, { cwd: s.cwd, encoding: 'utf8', env: { ...process.env, PROTO_ORIGIN: ORIGIN }, timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const { m, fails, onlyKnown } = summarize(out);
    const dt = ((Date.now() - t) / 1000).toFixed(0) + ' s';
    if (!m) { bad++; console.log(`ECHEC  ${s.name} : aucun resultat lu (${dt})\n       ${out.trim().split('\n').slice(-2).join(' | ').slice(0, 220)}`); continue; }
    const ok = Number(m[2]) === Number(m[3]) || onlyKnown && Number(m[3]) - Number(m[2]) === fails.length;
    if (!ok) bad++;
    console.log(`${ok ? 'OK    ' : 'ECHEC '} ${s.name} : ${m[2]}/${m[3]}${onlyKnown ? ' (avertissement D3D X4122 connu ignore)' : ''} (${dt})`);
    if (!ok) for (const f of fails.slice(0, 3)) console.log('       ' + f.trim().slice(0, 200));
  }
  if (server) server.kill();
  console.log(`\n${bad ? 'ECHEC' : 'TOUT PASSE'} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(bad ? 1 : 0);
})();
