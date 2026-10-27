// Aperçu LOCAL du panneau admin, avec les statistiques SYNTHÉTIQUES de dev-server.mjs.
//
//   node edge-stats/dev-server.mjs     # données synthétiques sur 127.0.0.1:8788
//   node edge-stats/dev-preview.mjs    # puis ouvrir http://localhost:4175/home
//
// Sert le dépôt en modifiant les pages à la volée, sans rien écrire sur disque :
//  - l'écran de maintenance (shared/maintenance.js) n'est pas chargé ;
//  - l'adresse de la base pointe sur l'émulateur local (127.0.0.1:9000) et la clé Firebase est
//    remplacée par une valeur morte : aucune lecture ni écriture ne part vers la production ;
//  - le panneau admin s'ouvre directement, branché sur le serveur de démo.
// Sans émulateur lancé, les rubriques qui lisent la base (Jeux, Parties, Journal) restent vides.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4175;
const DEAD = [
  // Base : l'émulateur local s'il tourne (dev-seed-firebase.mjs le remplit), sinon rien ne répond.
  ['https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app', 'http://127.0.0.1:9000?ns=apercu-local'],
  ['AIzaSyDYrmf-ThU5x0SQBdEvUy5k83LyTXxhgFA', 'apercu-local-cle-invalide'],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const OPEN_ADMIN = `<script type="module">
const { openAdmin } = await import('/shared/admin-panel.js');
openAdmin(document.getElementById('admin-panel'), { devEndpoint: 'http://127.0.0.1:8788' });
</script>`;

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/home') p = '/home.html';
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const ext = path.extname(file);
    let body = await readFile(file);
    if (ext === '.html' || ext === '.js') {
      let t = body.toString('utf8');
      for (const [a, b] of DEAD) t = t.split(a).join(b);
      if (ext === '.html') t = t.replace(/<style id="mx-guard">.*?<\/script>/, '');
      if (file.endsWith('home.html')) t = t.replace('</body>', OPEN_ADMIN + '\n</body>');
      body = t;
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('introuvable');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Aperçu admin sur http://localhost:${PORT}/home`));
