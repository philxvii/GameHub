// Serveur de DÉMONSTRATION local : exécute le vrai code du Worker sur SQLite en mémoire, avec des
// visites SYNTHÉTIQUES (aléatoires, générées ici). Jamais déployé, jamais relié aux données réelles.
//   node edge-stats/dev-server.mjs            puis, depuis le site servi en local :
//   http://localhost:<port>/home?audience-dev=http://127.0.0.1:8788  (ouvrir le panneau admin)
// Le jeton 'dev' y vaut administrateur ; le serveur n'écoute que sur 127.0.0.1.
import { createServer } from 'node:http';
import { fakeD1 } from './test/d1-sqlite.mjs';
import { handleSummary, handleCollect } from './src/worker.js';
import { PAGES, HOUR } from './src/lib.js';

const env = { DB: fakeD1(), ALLOWED_ORIGINS: 'https://roulia.me' };
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = list => { let t = rnd() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) if ((t -= w) <= 0) return v; return list[0][0]; };
// Lieux SYNTHÉTIQUES (villes connues, coordonnées publiques de centre-ville), majoritairement en France.
const P = (country, city, latitude, longitude) => ({ country, city, latitude: String(latitude), longitude: String(longitude) });
const PLACES = [[P('FR', 'Paris', 48.857, 2.352), 30], [P('FR', 'Lyon', 45.764, 4.836), 10], [P('FR', 'Marseille', 43.297, 5.381), 8],
  [P('FR', 'Toulouse', 43.605, 1.444), 7], [P('FR', 'Lille', 50.629, 3.057), 6], [P('FR', 'Bordeaux', 44.838, -0.579), 6],
  [P('FR', 'Nantes', 47.218, -1.554), 5], [P('FR', 'Strasbourg', 48.573, 7.752), 4], [P('FR', 'Rennes', 48.117, -1.678), 4],
  [P('FR', 'Montpellier', 43.611, 3.877), 3], [P('FR', 'Grenoble', 45.188, 5.724), 2], [P('FR', 'Brest', 48.390, -4.486), 1],
  [P('FR', 'Saint-Flour', 45.034, 3.093), .1], [{ country: 'FR' }, 3], [P('BE', 'Bruxelles', 50.847, 4.357), 3],
  [P('CH', 'Genève', 46.204, 6.143), 2], [P('CA', 'Montréal', 45.502, -73.567), 2], [P('MA', 'Casablanca', 33.573, -7.589), 1],
  [P('US', 'New York', 40.713, -74.006), .4], [{ country: 'ZZ' }, .5]];
const UAS = [
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 40],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 25],
  ['Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 18],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 8],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', 6],
  ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 3]];
const REFS = [[undefined, 50], ['-', 0], ['discord.com', 20], ['google.com', 15], ['reddit.com', 6], ['t.co', 3]];
const GAME_W = PAGES.map(p => [p, p === 'home' ? 30 : p === 'puissance4' ? 25 : p === 'uno' ? 14 : p === 'wikirace' ? 4 : 8]);

const now = Date.now();
for (let i = 0; i < 4000; i++) {
  const at = now - Math.floor(Math.pow(rnd(), 1.6) * 30 * 24) * HOUR - Math.floor(rnd() * HOUR);
  const page = pick(GAME_W), r = rnd() < .45 ? '-' : pick(REFS);
  const path = page === 'home' ? '/home' : `/games/${page}/`;
  const req = new Request('https://roulia.me/_stats/e', { method: 'POST', body: JSON.stringify(r ? { p: path, r } : { p: path }),
    headers: { Origin: 'https://roulia.me', 'Content-Type': 'text/plain', 'User-Agent': pick(UAS) } });
  Object.defineProperty(req, 'cf', { value: pick(PLACES) });
  await handleCollect(req, env, at);
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' };
createServer(async (rq, rs) => {
  if (rq.method === 'OPTIONS') { rs.writeHead(204, CORS).end(); return; }
  const url = new URL(rq.url, 'http://127.0.0.1:8788');
  if (url.pathname !== '/_stats/summary') { rs.writeHead(404, CORS).end(); return; }
  if (rq.headers.authorization !== 'Bearer dev') { rs.writeHead(401, CORS).end('{}'); return; }
  const q = (await import('./src/lib.js')).parseQuery(url.searchParams);
  if (!q) { rs.writeHead(400, CORS).end('{}'); return; }
  const out = await (await import('./src/lib.js')).summarize(env.DB, q);
  rs.writeHead(200, { 'Content-Type': 'application/json', ...CORS }).end(JSON.stringify(out));
}).listen(8788, '127.0.0.1', () => console.log('Démo synthétique sur http://127.0.0.1:8788'));
