// Portail statique : tout ce qui se vérifie SANS navigateur ni réseau.
// Rapide, déterministe, et c'est le premier filet après toute modification.
//
//   node tools/check-static.js
//
// Couvre : syntaxe du module, ordre du plateau, contrat DOM (ids lus par le JS),
// logique des faces de dés, contraste WCAG des 28 cases.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'banqueroll.html'), 'utf8');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};

// ---------------------------------------------------------------- 1. syntaxe
try {
  execFileSync('node', [path.join(ROOT, 'extract_script.mjs')], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('node', ['--check', path.join(ROOT, 'banqueroll_extracted.mjs')], { stdio: 'pipe' });
  check('1. Syntaxe du module JS (node --check)', true);
} catch (e) {
  check('1. Syntaxe du module JS (node --check)', false, String(e.stderr || e.message).slice(0, 300));
}

// ---------------------------------------------------------------- 2. plateau
// L'ordre des villes est une contrainte produit : il ne doit JAMAIS bouger.
const EXPECTED = {
  bas:    ['START', 'NEW YORK', 'TOKYO', 'AIRPORT', 'LONDON', 'HONG KONG', 'PARIS', 'AUCTION'],
  droite: ['DUBAI', 'BEIJING', 'EVENT', 'SYDNEY', 'RIYADH', 'ZURICH', 'JAIL'],
  haut:   ['JAIL', 'SEOUL', 'TORONTO', 'RAILWAY', 'MOSCOW', 'BERLIN', 'JAKARTA', 'CHANCE'],
  gauche: ['MADRID', 'CAIRO', 'BOAT', 'EVENT', 'DELHI', 'RIO'],
};
const BOARD = eval(HTML.match(/const BOARD = (\[[\s\S]*?\n\]);/)[1]);
const layout = [];
for (let c = 1; c <= 8; c++) layout.push({ r: 1, c });
for (let r = 2; r <= 7; r++) layout.push({ r, c: 8 });
for (let c = 8; c >= 1; c--) layout.push({ r: 8, c });
for (let r = 7; r >= 2; r--) layout.push({ r, c: 1 });
const at = (r, c) => BOARD[layout.findIndex(p => p.r === r && p.c === c)].name.toUpperCase();
const actual = {
  bas:    [1, 2, 3, 4, 5, 6, 7, 8].map(c => at(8, c)),
  droite: [7, 6, 5, 4, 3, 2, 1].map(r => at(r, 8)),
  haut:   [8, 7, 6, 5, 4, 3, 2, 1].map(c => at(1, c)),
  gauche: [2, 3, 4, 5, 6, 7].map(r => at(r, 1)),
};
check('2a. BOARD contient 28 cases', BOARD.length === 28, `${BOARD.length} cases`);
for (const side of Object.keys(EXPECTED)) {
  const same = JSON.stringify(actual[side]) === JSON.stringify(EXPECTED[side]);
  check(`2b. Ordre des villes — ${side}`, same, same ? actual[side].join(' > ') : `attendu ${EXPECTED[side].join(' > ')} | obtenu ${actual[side].join(' > ')}`);
}

// ---------------------------------------------------------------- 3. contrat DOM
const body = HTML.slice(HTML.indexOf('<body>'), HTML.indexOf('<script type="module">'));
const needed = [...new Set([...HTML.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
const missing = needed.filter(id => !body.includes(`id="${id}"`));
check('3. Tous les ids lus par le JS existent dans le HTML', missing.length === 0,
  missing.length ? 'manquants : ' + missing.join(', ') : `${needed.length} ids vérifiés`);

// ---------------------------------------------------------------- 4. faces de dés
// On exécute le code RÉELLEMENT livré, avec un DOM minimal.
const diceSrc = HTML.slice(HTML.indexOf('const DIE_PIPS='), HTML.indexOf('function animateDiceRoll'));
const mkDie = () => {
  const el = { dataset: {}, attrs: {}, inner: '', classes: new Set() };
  el.classList = { contains: c => el.classes.has(c), add: c => el.classes.add(c), remove: c => el.classes.delete(c) };
  el.face = { set innerHTML(v) { el.inner = v; }, get innerHTML() { return el.inner; } };
  el.querySelector = () => el.face;
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  return el;
};
const d1 = mkDie(), d2 = mkDie(), total = { textContent: '' };
global.document = { getElementById: id => ({ 'die-1': d1, 'die-2': d2, 'dice-total': total }[id]) };
eval(diceSrc);
let diceOk = true;
for (let v = 1; v <= 6; v++) {
  setDieValue(d1, v);
  const pips = (d1.inner.match(/die-pip/g) || []).length;
  const areas = [...d1.inner.matchAll(/grid-area:(\d)\/(\d)/g)];
  if (pips !== v) diceOk = false;
  if (new Set(areas.map(a => a[0])).size !== v) diceOk = false;
  if (areas.some(a => +a[1] < 1 || +a[1] > 3 || +a[2] < 1 || +a[2] > 3)) diceOk = false;
}
setDieValue(d1, 3); setDieValue(d2, 5);
if (total.textContent !== '3 + 5 = 8') diceOk = false;
setDieValue(d1, null);
if (!d1.inner.includes('die-idle')) diceOk = false;
for (const bad of [0, 7, -1, 'x', NaN]) { setDieValue(d1, bad); if (!d1.inner.includes('die-idle')) diceOk = false; }
check('4. Faces de dés : points = valeur, total = somme, valeurs invalides rejetées', diceOk);

// ---------------------------------------------------------------- 5. contraste
// Audité avec les fonctions réellement embarquées, pas une réimplémentation.
const SQUARE_COLORS = eval('(' + HTML.match(/const SQUARE_COLORS = (\{[\s\S]*?\n\});/)[1] + ')');
const GROUP_COLORS = eval('(' + HTML.match(/const GROUP_COLORS = (\{[\s\S]*?\n\});/)[1] + ')');
eval(HTML.slice(HTML.indexOf('const INK_DARK'), HTML.indexOf('function squarePriceText')));
const colorOf = sq => SQUARE_COLORS[sq.id] || GROUP_COLORS[sq.group] || '#D5D7D8';
let worst = 99;
const fails = [];
BOARD.forEach(sq => {
  const band = colorOf(sq);
  const r = contrastRatio(readableInk(band), band);
  worst = Math.min(worst, r);
  if (r < 4.5) fails.push(`${sq.name} ${band} = ${r.toFixed(2)}`);
});
check('5. Contraste prix/bandeau des 28 cases >= 4.5:1 (WCAG AA)', fails.length === 0,
  fails.length ? fails.join(' | ') : `minimum ${worst.toFixed(2)}:1`);

// ---------------------------------------------------------------- bilan
const passed = results.filter(Boolean).length;
console.log(`\n===== STATIQUE : ${passed}/${results.length} =====`);
process.exit(results.every(Boolean) ? 0 : 1);
