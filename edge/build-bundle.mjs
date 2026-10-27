// Assemble src/maintenance-art.js + maintenance-view.js + worker.js en un seul fichier, à coller dans
// l'éditeur du tableau de bord Cloudflare (wrangler est bloqué sur le PC pro) : node edge/build-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const flat = s => s.replace(/^import \{[^}]+\} from '[^']+';\n/gm, '').replace(/^export (const|function|async function) /gm, '$1 ');
const parts = ['./src/maintenance-art.js', './src/maintenance-view.js', './src/worker.js'].map(f => flat(read(f)));
const out = parts.join('\n');
if (/^import /m.test(out)) throw new Error('import non retiré');
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/worker.bundle.js', import.meta.url),
  `// Généré par edge/build-bundle.mjs — ne pas modifier : modifier src/ puis relancer.\n${out}`);
console.log('edge/dist/worker.bundle.js écrit');
