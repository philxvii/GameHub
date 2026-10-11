// Structure de GameHub : verifie, sans navigateur ni reseau, que chaque chemin
// relatif mene a un fichier existant.
//
//   node tools/check-links.js
//
// Couvre : liens du hub, redirection des anciennes URL par 404.html, et pour
// chaque jeu de games/<jeu>/ : href / src du HTML, url() des CSS, imports des
// modules JS. Signale aussi tout code de jeu laisse a la racine.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// 2. Chaque dossier de games/ a son entree.
const games = fs.readdirSync(GAMES, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const noEntry = games.filter(g => !fs.existsSync(path.join(GAMES, g, 'index.html')));
check('Chaque jeu a games/<jeu>/index.html', noEntry.length === 0, `${games.length} jeux${noEntry.length ? ' ; sans entree : ' + noEntry.join(', ') : ''}`);

// 3. Anciennes URL publiques : 404.html (servie par GitHub Pages pour toute adresse
//    inconnue) renvoie /<jeu>.html et /<jeu>/ vers /games/<jeu>/ en gardant ?query et #hash.
//    On execute son script avec de fausses adresses.
const page404 = path.join(ROOT, '404.html');
const redirectOf = (pathname, search = '', hash = '') => {
  const script = (fs.readFileSync(page404, 'utf8').match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  let to = null;
  vm.runInNewContext(script, { location: { pathname, search, hash, replace: u => { to = u; } } });
  return to;
};
if (!fs.existsSync(page404)) check('404.html : redirection des anciennes URL', false, 'absente');
else {
  const wrong = [];
  for (const g of games) {
    for (const old of [`/${g}.html`, `/${g}/`, `/${g}`, `/${g}/index.html`]) {
      const to = redirectOf(old, '?code=ABCD-12', '#j');
      if (to !== `/games/${g}/?code=ABCD-12#j`) wrong.push(`${old} -> ${to}`);
    }
  }
  for (const other of ['/', '/inconnu.html', '/games/uno/x', '/uno.html/x']) if (redirectOf(other) !== null) wrong.push(`${other} ne doit pas rediriger`);
  check('404.html : /<jeu>.html et /<jeu>/ -> /games/<jeu>/ avec ?query et #hash', wrong.length === 0,
    `${games.length} jeux${wrong.length ? ' ; ' + wrong.join(' ; ') : ''}`);
}

// 4. Racine : seulement le hub, la page 404, les icones et les dossiers prevus.
// Icones du site : dans icons/, declarees par chaque page (hub, 404, jeux).
const allowed = new Set(['index.html', '404.html', 'CNAME', 'README.md', 'LICENSE', 'games', 'icons', 'tools', 'shared']);
const stray = fs.readdirSync(ROOT).filter(f => !f.startsWith('.') && !allowed.has(f));
check('Racine propre : aucun code de jeu ni fichier en trop', stray.length === 0, stray.length ? 'en trop : ' + stray.join(', ') : '');

// 5. Dans chaque jeu, tout chemin relatif mene a un fichier, sans sortir du jeu
//    (sauf le retour au hub, ../../index.html, et les icones du site, ../../icons/).
for (const g of games) {
  const files = walk(path.join(GAMES, g)).filter(f => /\.(html|css|js)$/.test(f));
  const broken = [], escaping = [];
  for (const f of files) {
    for (const u of refsOf(f)) {
      if (!resolves(f, u)) broken.push(`${rel(f)} -> ${u}`);
      const target = path.resolve(path.dirname(f), u.split(/[?#]/)[0]);
      if (!target.startsWith(path.join(GAMES, g)) && target !== hub && !target.startsWith(path.join(ROOT, 'icons') + path.sep)) escaping.push(`${rel(f)} -> ${u}`);
    }
  }
  check(`games/${g} : chemins relatifs`, broken.length === 0 && escaping.length === 0,
    `${files.length} fichiers${broken.length ? ' ; introuvables : ' + broken.join(' ; ') : ''}${escaping.length ? ' ; sortent du jeu : ' + escaping.join(' ; ') : ''}`);
}

const ok = results.filter(Boolean).length;
console.log(`\n===== STRUCTURE : ${ok}/${results.length} =====`);
process.exit(ok === results.length ? 0 : 1);
