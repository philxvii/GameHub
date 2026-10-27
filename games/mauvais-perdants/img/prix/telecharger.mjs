// Télécharge les photos des produits de L'Étiquette depuis Open Food Facts (CC BY-SA).
// Lit sources.json ([{ code, img }]) et écrit <code>.jpg à côté ; saute les fichiers déjà là.
// Usage : node img/prix/telecharger.mjs   (Node 18+, aucune dépendance)

import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const list = JSON.parse(await readFile(join(dir, 'sources.json'), 'utf8'));
let ok = 0, skip = 0, ko = 0;
for (const { code, img } of list) {
  const out = join(dir, `${code}.jpg`);
  if (await access(out).then(() => true, () => false)) { skip++; continue; }
  try {
    const r = await fetch(img, { headers: { 'User-Agent': 'MauvaisPerdants/1.0 (roulia.me)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('pas une image JPEG');
    await writeFile(out, buf);
    ok++;
  } catch (e) { ko++; console.error(`${code} : ${e.message}`); }
}
console.log(`${ok} téléchargée(s), ${skip} déjà là, ${ko} en échec.`);
if (ko) process.exitCode = 1;
