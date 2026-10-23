// Assemble src/*.js en un seul fichier, à coller dans l'éditeur du tableau de bord
// Cloudflare (wrangler est bloqué sur le PC pro) : node games/mauvais-perdants/ai/build-bundle.mjs
// Puis vérifie que le bundle s'exécute (même test que tests/ai.test.mjs, version courte).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const strip = src => src
  .replace(/^import [\s\S]*?from '\.\/[a-z]+\.js';\n/gm, '')
  .replace(/^export (const|function|async function|class) /gm, '$1 ')
  .replace(/^export default /m, 'const __worker = ');
const parts = ['providers', 'orchestrator', 'prompts', 'worker'].map(n => `// ── src/${n}.js\n${strip(read(`./src/${n}.js`))}`);
const out = `// Généré par games/mauvais-perdants/ai/build-bundle.mjs — ne pas modifier : modifier src/ puis relancer.\n${parts.join('\n')}\nexport default __worker;\n`;
if (/^import /m.test(out) || (out.match(/^export /gm) || []).length !== 1) throw new Error('import/export non retiré');
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
const file = new URL('./dist/worker.bundle.js', import.meta.url);
writeFileSync(file, out);
const w = (await import(file.href + '?t=' + Date.now())).default;
const res = await w.fetch(new Request('http://w/health'), { ALLOWED_ORIGINS: '' });
if (res.status !== 200) throw new Error('bundle : /health ne répond pas');
console.log('games/mauvais-perdants/ai/dist/worker.bundle.js écrit et vérifié');
