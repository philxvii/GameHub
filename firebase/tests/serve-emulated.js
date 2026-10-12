// Sert le dépôt comme GitHub Pages, pour tester contre les émulateurs.
//
//   node tests/serve-emulated.js [port]            # défaut 4174 ; ouvrir les pages avec ?emu
//   node tests/serve-emulated.js [port] --rewrite  # anciens clients sans ?emu : l'URL de la
//                                                  # base de production est remplacée à la volée
//
// Rien n'est modifié sur disque, et aucune requête ne part vers la base de production.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.argv[2]) || 4174;
const REWRITE = process.argv.includes('--rewrite');
const PROD = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app';
const EMU = 'http://127.0.0.1:9000?ns=undercover-game-b0d2a-default-rtdb';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    let body = await readFile(file);
    const ext = path.extname(file);
    if (REWRITE && (ext === '.html' || ext === '.js')) body = body.toString('utf8').split(PROD).join(EMU);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('introuvable');
  }
}).listen(PORT, () => console.log(`GameHub sur http://localhost:${PORT}/${REWRITE ? ` -> émulateur ${EMU}` : ' (ajouter ?emu)'}`));
