// Structure de GameHub : verifie, sans navigateur ni reseau, que chaque chemin
// relatif mene a un fichier existant.
//
//   node tools/check-links.js
//
// Couvre : liens du hub, pages relais a la racine (anciennes URL), et pour
// chaque jeu de games/<jeu>/ : href / src du HTML, url() des CSS, imports des
// modules JS. Signale aussi tout code de jeu laisse a la racine.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAMES = path.join(ROOT, 'games');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};

// %23 = « # » encode, p. ex. url(%23n) dans un SVG inline : un fragment, pas un fichier.
const isExternal = u => /^(https?:|data:|mailto:|javascript:|blob:|#|%23|\/\/)/.test(u) || u.includes('${');
// Resout une URL relative comme le ferait le navigateur : un dossier sert son index.html.
function resolves(fromFile, url) {
  const clean = url.split(/[?#]/)[0];
  if (!clean) return true;
  const p = path.resolve(path.dirname(fromFile), decodeURI(clean));
  if (clean.endsWith('/')) return fs.existsSync(path.join(p, 'index.html'));
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'shots') return [];
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

// Les references relatives d'un fichier, selon son type.
function refsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const grab = re => { for (const m of src.matchAll(re)) out.push(m[1]); };
  if (file.endsWith('.html')) grab(/\s(?:href|src)="([^"]+)"/g);
  if (file.endsWith('.css')) grab(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g);
  if (file.endsWith('.js')) {
    grab(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g);
    grab(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g);
  }
  return out.filter(u => !isExternal(u));
}

// 1. Le hub pointe vers des jeux qui existent.
const hub = path.join(ROOT, 'index.html');
const hubLinks = [...fs.readFileSync(hub, 'utf8').matchAll(/class="game-card" href="([^"]+)"/g)].map(m => m[1]);
check('Hub : chaque carte mene a games/<jeu>/',
  hubLinks.length > 0 && hubLinks.every(u => u.startsWith('games/') && resolves(hub, u)),
  `${hubLinks.length} cartes${hubLinks.filter(u => !resolves(hub, u)).map(u => ' ; casse : ' + u).join('')}`);

// 2. Chaque dossier de games/ a son entree, et chaque jeu son ancienne URL relais.
const games = fs.readdirSync(GAMES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const noEntry = games.filter(g => !fs.existsSync(path.join(GAMES, g, 'index.html')));
check('Chaque jeu a games/<jeu>/index.html', noEntry.length === 0, `${games.length} jeux${noEntry.length ? ' ; sans entree : ' + noEntry.join(', ') : ''}`);

const relays = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html');
const badRelays = relays.filter(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = s.match(/location\.replace\('([^']+)' \+ location\.search \+ location\.hash\)/);
  return !m || m[1] !== `games/${f.replace('.html', '')}/` || !resolves(path.join(ROOT, f), m[1]) || s.length > 1500;
});
const missingRelays = games.filter(g => !relays.includes(g + '.html'));
check('Pages relais : ancienne URL -> games/<jeu>/ avec ?query et #hash',
  badRelays.length === 0 && missingRelays.length === 0,
  `${relays.length} relais${badRelays.length ? ' ; invalides : ' + badRelays.join(', ') : ''}${missingRelays.length ? ' ; manquants : ' + missingRelays.join(', ') : ''}`);

// 3. Plus aucun code de jeu a la racine : seulement le hub, les relais et les dossiers prevus.
const allowed = new Set(['index.html', 'CNAME', 'CLAUDE.md', 'games', 'tools', 'shared', 'banqueroll', ...relays]);
const stray = fs.readdirSync(ROOT).filter(f => !f.startsWith('.') && !allowed.has(f));
const bqDir = path.join(ROOT, 'banqueroll');
const bqDirOk = !fs.existsSync(bqDir) || (fs.readdirSync(bqDir).join() === 'index.html'
  && fs.readFileSync(path.join(bqDir, 'index.html'), 'utf8').includes("location.replace('../games/banqueroll/'"));
check('Racine : aucun code de jeu', stray.length === 0 && bqDirOk,
  stray.length ? 'en trop : ' + stray.join(', ') : 'banqueroll/ ne contient que le relais du raccourci /banqueroll/');

// 4. Dans chaque jeu, tout chemin relatif mene a un fichier, sans sortir du jeu
//    (sauf le retour au hub, ../../index.html).
for (const g of games) {
  const files = walk(path.join(GAMES, g)).filter(f => /\.(html|css|js)$/.test(f));
  const broken = [], escaping = [];
  for (const f of files) {
    for (const u of refsOf(f)) {
      if (!resolves(f, u)) broken.push(`${rel(f)} -> ${u}`);
      const target = path.resolve(path.dirname(f), u.split(/[?#]/)[0]);
      if (!target.startsWith(path.join(GAMES, g)) && target !== hub) escaping.push(`${rel(f)} -> ${u}`);
    }
  }
  check(`games/${g} : chemins relatifs`, broken.length === 0 && escaping.length === 0,
    `${files.length} fichiers${broken.length ? ' ; introuvables : ' + broken.join(' ; ') : ''}${escaping.length ? ' ; sortent du jeu : ' + escaping.join(' ; ') : ''}`);
}

const ok = results.filter(Boolean).length;
console.log(`\n===== STRUCTURE : ${ok}/${results.length} =====`);
process.exit(ok === results.length ? 0 : 1);
