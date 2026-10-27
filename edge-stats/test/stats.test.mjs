import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './d1-sqlite.mjs';
import * as L from '../src/lib.js';
import worker, { handleCollect, handleSummary, isAdmin } from '../src/worker.js';

const ORIGIN = 'https://roulia.me';
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const T0 = Date.UTC(2026, 9, 19, 12, 30);

const env = () => ({ DB: fakeD1(), ALLOWED_ORIGINS: 'https://roulia.me,https://www.roulia.me' });
const post = (body, headers = {}, cf = { country: 'FR' }) => {
  const r = new Request('https://roulia.me/_stats/e', { method: 'POST', body, headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'User-Agent': CHROME_WIN, ...headers } });
  Object.defineProperty(r, 'cf', { value: cf });
  return r;
};
const rows = e => e.DB.raw.prepare('SELECT * FROM counters').all();

async function summarize(e, range, game = 'all', now = T0) {
  return L.summarize(e.DB, L.parseQuery(new URLSearchParams({ range, game }), now), now);
}
async function seed(e, n, { country = 'FR', ua = CHROME_WIN, page = '/home', at = T0, r } = {}) {
  for (let i = 0; i < n; i++) await handleCollect(post(JSON.stringify(r ? { p: page, r } : { p: page }), { 'User-Agent': ua }, { country }), e, at);
}

test('événement valide accepté et compté', async () => {
  const e = env();
  const res = await handleCollect(post('{"p":"/games/puissance4/","r":"google.com"}'), e, T0);
  assert.equal(res.status, 204);
  const r = rows(e);
  const get = (scope, dim, key) => r.find(x => x.scope === scope && x.dim === dim && x.key === key)?.n;
  assert.equal(get('all', 'page', 'puissance4'), 1);
  assert.equal(get('all', 'country', 'FR'), 1);
  assert.equal(get('puissance4', 'country', 'FR'), 1);
  assert.equal(get('all', 'ref', 'google.com'), 1);
  assert.equal(get('all', 'entry', 'puissance4'), 1);
  assert.equal(get('all', 'browser', 'Chrome'), 1);
  assert.equal(get('all', 'os', 'Windows'), 1);
  assert.equal(get('all', 'device', 'desktop'), 1);
});

test('navigation interne : vue comptée, pas une arrivée, pas de source', async () => {
  const e = env();
  await handleCollect(post('{"p":"/home","r":"-"}'), e, T0);
  const r = rows(e);
  assert.ok(r.some(x => x.dim === 'page' && x.key === 'home'));
  assert.ok(!r.some(x => x.dim === 'entry' || x.dim === 'ref'));
});

test('rejets : origine, méthode, chemin, champs, taille, type, JSON', async () => {
  const e = env();
  assert.equal((await handleCollect(post('{"p":"/home"}', { Origin: 'https://evil.example' }), e, T0)).status, 403);
  assert.equal((await handleCollect(post('{"p":"/home"}', { Origin: '' }), e, T0)).status, 403);
  assert.equal((await handleCollect(post('{"p":"/home"}', { 'Sec-Fetch-Site': 'cross-site' }), e, T0)).status, 403);
  assert.equal((await handleCollect(post('{"p":"/home"}', { 'Content-Type': 'text/html' }), e, T0)).status, 415);
  for (const body of ['{"p":"/admin"}', '{"p":"/home?code=ABCD"}', '{"p":"/home#x"}', '{"p":"/games/uno/ABCD"}',
    '{"p":"/home","pseudo":"bob"}', '{"p":"/home","r":"http://a.com/?x=1"}', '{"p":"/home","r":"a b.com"}', '{"p":"/home","r":5}',
    '[]', 'null', 'pas du json', '', '{"p":"' + 'a'.repeat(600) + '"}'])
    assert.equal((await handleCollect(post(body), e, T0)).status, 400, body);
  assert.equal(rows(e).length, 0);
  assert.equal((await worker.fetch(new Request('https://roulia.me/_stats/e'), e)).status, 405);
  assert.equal((await worker.fetch(new Request('https://roulia.me/_stats/zzz'), e)).status, 404);
});

test('robots, DNT et GPC : ignorés (204) sans rien compter', async () => {
  const e = env();
  for (const h of [{ 'User-Agent': 'Googlebot/2.1' }, { 'User-Agent': 'curl/8' }, { 'User-Agent': '' }, { DNT: '1' }, { 'Sec-GPC': '1' }])
    assert.equal((await handleCollect(post('{"p":"/home"}', h), e, T0)).status, 204);
  assert.equal(rows(e).length, 0);
});

test('limiteur de débit : 429 sans écriture', async () => {
  const e = { ...env(), LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await handleCollect(post('{"p":"/home"}'), e, T0)).status, 429);
  assert.equal(rows(e).length, 0);
});

test('aucune IP ni donnée personnelle stockée', async () => {
  const e = env();
  await handleCollect(post('{"p":"/home","r":"x.org"}', { 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '203.0.113.9' }), e, T0);
  assert.ok(!JSON.stringify(rows(e)).includes('203.0.113'));
  assert.deepEqual([...new Set(rows(e).map(r => r.dim))].sort(), ['browser', 'country', 'device', 'entry', 'os', 'page', 'ref']);
  assert.deepEqual(Object.keys(rows(e)[0]).sort(), ['dim', 'hour', 'key', 'n', 'scope']);
});

test('pays inconnu ou invalide => ZZ ; User-Agent classés', () => {
  assert.equal(L.countryOf('fr'), 'ZZ'); assert.equal(L.countryOf('XX'), 'ZZ'); assert.equal(L.countryOf(undefined), 'ZZ'); assert.equal(L.countryOf('FR'), 'FR');
  assert.deepEqual(L.classifyUA(IPHONE), { device: 'mobile', browser: 'Safari', os: 'iOS' });
  assert.deepEqual(L.classifyUA(CHROME_WIN), { device: 'desktop', browser: 'Chrome', os: 'Windows' });
  assert.equal(L.classifyUA('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120 Mobile Safari/537.36').device, 'mobile');
  assert.equal(L.classifyUA('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1').device, 'tablet');
});

test('agrégation, filtre par jeu, regroupement des petits effectifs', async () => {
  const e = env();
  await seed(e, 8, { country: 'FR', page: '/games/uno/' });
  await seed(e, 3, { country: 'BR', page: '/games/uno/' });
  await seed(e, 1, { country: 'JP', page: '/games/uno/' });
  await seed(e, 6, { country: 'FR', ua: IPHONE, page: '/home', r: 'discord.com' });
  const all = await summarize(e, '7d');
  assert.equal(all.totals.views, 18);
  assert.deepEqual(all.pages.map(p => [p.key, p.n]), [['uno', 12], ['home', 6]]);
  assert.deepEqual(all.countries.rows, [{ key: 'FR', n: 14 }]);   // BR (3) + JP (1) < 5 => regroupés
  assert.equal(all.countries.other, 4);
  assert.deepEqual(all.refs.rows, [{ key: 'direct', n: 12 }, { key: 'discord.com', n: 6 }]);
  const uno = await summarize(e, '7d', 'uno');
  assert.equal(uno.totals.views, 12);
  assert.deepEqual(uno.countries.rows, [{ key: 'FR', n: 8 }]);
  assert.equal(uno.countries.other, 4);
  assert.equal(uno.devices.rows[0].key, 'desktop');
});

test('fenêtres 24 h / 7 j / 30 j et frontières', async () => {
  const e = env();
  await seed(e, 1, { at: T0 });
  await seed(e, 1, { at: T0 - 23 * L.HOUR });          // dans les 24 h glissantes
  await seed(e, 1, { at: T0 - 24 * L.HOUR });          // juste hors 24 h
  await seed(e, 1, { at: T0 - 8 * 24 * L.HOUR });      // hors 7 j, dans 30 j
  await seed(e, 1, { at: T0 - 31 * 24 * L.HOUR });     // hors 30 j
  const v = async r => (await summarize(e, r)).totals.views;
  assert.equal(await v('24h'), 2); assert.equal(await v('7d'), 3); assert.equal(await v('30d'), 4);
  const h = await summarize(e, '24h');
  assert.equal(h.series.length, 24); assert.equal(h.query.granularity, 'hour');
});

test('jours en Europe/Paris, minuit et changement d’heure', async () => {
  assert.equal(L.parisDay(Date.UTC(2026, 9, 18, 22, 30)), '2026-10-19');   // 00:30 à Paris (UTC+2)
  assert.equal(L.parisDay(Date.UTC(2026, 9, 18, 21, 30)), '2026-10-18');
  assert.equal(L.parisDay(Date.UTC(2026, 9, 25, 23, 30)), '2026-10-26');   // retour à UTC+1 le 25 oct.
  const e = env();
  await seed(e, 1, { at: Date.UTC(2026, 9, 18, 22, 30) });
  await seed(e, 1, { at: Date.UTC(2026, 9, 18, 21, 30) });
  const s = await summarize(e, '7d', 'all', Date.UTC(2026, 9, 19, 12, 0));
  const by = Object.fromEntries(s.series.map(p => [p.label, p.n]));
  assert.equal(by['2026-10-18'], 1); assert.equal(by['2026-10-19'], 1);
});

test('base vide : des zéros, aucune valeur inventée', async () => {
  const s = await summarize(env(), '30d');
  assert.equal(s.totals.views, 0); assert.deepEqual(s.pages, []); assert.deepEqual(s.countries, { rows: [], other: 0 });
});

test('purge de la rétention', async () => {
  const e = env();
  await seed(e, 1, { at: T0 }); await seed(e, 1, { at: T0 - 400 * 24 * L.HOUR });
  await L.purge(e.DB, 395, T0);
  assert.ok(rows(e).length > 0);
  assert.ok(rows(e).every(r => r.hour >= Math.floor(T0 / L.HOUR) - 395 * 24));
});

// ── Accès admin ───────────────────────────────────────────────────────────────────────────
const tok = claims => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
const good = { aud: 'undercover-game-b0d2a', sub: 'uidAdmin1234', exp: T0 / 1000 + 600, firebase: { sign_in_provider: 'google.com' } };

test('lecture : anonyme refusé, jeton invalide refusé, admin vérifié auprès de la base', async () => {
  const e = env();
  const get = (h = {}, q = '?range=7d') => handleSummary(new Request('https://roulia.me/_stats/summary' + q, { headers: h }), e, T0);
  assert.equal((await get()).status, 401);
  assert.equal((await get({ Authorization: 'Bearer abc' })).status, 401);
  assert.equal((await get({ Authorization: 'Bearer ' + tok({ ...good, aud: 'autre' }) })).status, 401);
  assert.equal((await get({ Authorization: 'Bearer ' + tok({ ...good, firebase: { sign_in_provider: 'anonymous' } }) })).status, 401);
  assert.equal((await get({ Authorization: 'Bearer ' + tok({ ...good, exp: 1 }) })).status, 401);
  assert.equal(await isAdmin(tok(good), T0, async () => ({ ok: true, json: async () => null })), false);
  assert.equal(await isAdmin(tok(good), T0, async () => { throw new Error('réseau'); }), false);
  let url;
  assert.equal(await isAdmin(tok({ ...good, sub: 'uidAdmin5678' }), T0, async u => { url = u; return { ok: true, json: async () => true }; }), true);
  assert.match(url, /admins\/uidAdmin5678\.json\?auth=/);
});

test('paramètres de lecture invalides => 400 ; réponse jamais mise en cache', async () => {
  const t = tok({ ...good, sub: 'uidAdminOK99' });
  await isAdmin(t, T0, async () => ({ ok: true, json: async () => true }));   // jeton mis en cache 60 s
  const e = env();
  const r = q => handleSummary(new Request('https://roulia.me/_stats/summary' + q, { headers: { Authorization: 'Bearer ' + t } }), e, T0);
  assert.equal((await r('?range=1y')).status, 400);
  assert.equal((await r('?game=../../x')).status, 400);
  const ok = await r('?range=30d&game=uno');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
});

test('aucun secret, jeton admin ni donnée de partie dans le script public', () => {
  const client = readFileSync(new URL('../../shared/analytics.js', import.meta.url), 'utf8');
  assert.ok(!/Bearer|COOKIE_SECRET|admins\/|getIdToken|firebase|localStorage\.getItem\(.gh-auth|location\.search|location\.hash/i.test(client));
});

test('villes : point arrondi à 0,1°, seuil de 5, pas de coordonnées brutes', async () => {
  const e = env();
  const lyon = { country: 'FR', city: 'Lyon', latitude: '45.7578', longitude: '4.8320' };
  const rare = { country: 'FR', city: 'Bourg-Perdu', latitude: '44.123', longitude: '5.456' };
  for (let i = 0; i < 6; i++) await handleCollect(post('{"p":"/home"}', {}, lyon), e, T0);
  for (let i = 0; i < 2; i++) await handleCollect(post('{"p":"/home"}', {}, rare), e, T0);
  const places = e.DB.raw.prepare('SELECT * FROM places').all();
  assert.ok(places.every(p => Math.round(p.lat * 10) === p.lat * 10 && Math.round(p.lon * 10) === p.lon * 10));
  assert.ok(!JSON.stringify(places).includes('45.7578'));
  const s = await summarize(e, '7d');
  assert.deepEqual(s.cities.rows, [{ key: 'FR|Lyon', country: 'FR', name: 'Lyon', lat: 45.8, lon: 4.8, n: 6 }]);
  assert.equal(s.cities.other, 2);                       // Bourg-Perdu : pas de point, reste dans la France
  assert.equal(s.countries.rows[0].n, 8);
});

test('villes invalides ou absentes : ignorées, le pays reste compté', async () => {
  for (const cf of [{ country: 'FR' }, { country: 'FR', city: 'X<script>', latitude: '1', longitude: '1' },
    { country: 'FR', city: 'Paris', latitude: 'abc', longitude: '2' }, { country: 'XX', city: 'Paris', latitude: '48.8', longitude: '2.3' },
    { country: 'FR', city: 'a'.repeat(80), latitude: '1', longitude: '1' }])
    assert.equal(L.placeOf(cf), null, JSON.stringify(cf));
  const e = env();
  await handleCollect(post('{"p":"/home"}', {}, { country: 'FR', city: 'Paris' }), e, T0);
  assert.ok(!rows(e).some(r => r.dim === 'city'));
  assert.ok(rows(e).some(r => r.dim === 'country' && r.key === 'FR'));
});

test('purge : les villes sans compteur disparaissent', async () => {
  const e = env();
  await handleCollect(post('{"p":"/home"}', {}, { country: 'FR', city: 'Lille', latitude: '50.63', longitude: '3.06' }), e, T0 - 400 * 24 * L.HOUR);
  await L.purge(e.DB, 395, T0);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS c FROM places').get().c, 0);
});

test('jours calendaires : 7 j = 7 barres, aujourd’hui compris ; 90 j et 365 j acceptés', async () => {
  const e = env();
  await seed(e, 2, { at: T0 });
  await seed(e, 1, { at: Date.UTC(2026, 9, 12, 22, 30) });   // 13 oct. 00:30 à Paris : premier jour de la fenêtre
  await seed(e, 1, { at: Date.UTC(2026, 9, 12, 21, 30) });   // 12 oct. 23:30 à Paris : hors fenêtre
  const s = await summarize(e, '7d');
  assert.equal(s.series.length, 7);
  assert.equal(s.series[0].label, '2026-10-13'); assert.equal(s.series[6].label, '2026-10-19');
  assert.equal(s.totals.views, 3);
  assert.equal((await summarize(e, '30d')).series.length, 30);
  assert.equal((await summarize(e, '90d')).series.length, 90);
  assert.equal((await summarize(e, '365d')).totals.views, 4);
});

test('période précédente de même durée et tendance par jeu', async () => {
  const e = env();
  await seed(e, 3, { at: T0, page: '/games/uno/' });
  await seed(e, 1, { at: T0 - 30 * L.HOUR, page: '/games/uno/' });      // hier : période précédente du 24 h
  await seed(e, 2, { at: T0 - 30 * L.HOUR, page: '/home', r: 'google.com' });
  const s = await summarize(e, '24h');
  assert.equal(s.totals.views, 3);
  assert.equal(s.previous.views, 3); assert.equal(s.previous.entries, 3);   // sans référent : arrivée directe
  assert.deepEqual(s.pages.map(p => [p.key, p.n, p.prev]), [['uno', 3, 1]]);
  const uno = await summarize(e, '24h', 'uno');
  assert.equal(uno.previous.views, 1);
});

test('carte de chaleur : jour de la semaine × heure de Paris, même total', async () => {
  const e = env();
  await seed(e, 2, { at: T0 });                                    // lundi 19 oct., 14:30 à Paris
  await seed(e, 1, { at: Date.UTC(2026, 9, 18, 22, 30) });         // lundi 00:30 à Paris
  const s = await summarize(e, '7d');
  assert.equal(s.heat.length, 7); assert.equal(s.heat[0].length, 24);
  assert.equal(s.heat[0][14], 2); assert.equal(s.heat[0][0], 1);
  assert.equal(s.heat.flat().reduce((a, b) => a + b, 0), s.totals.views);
});

test('Mauvais Perdants est compté', async () => {
  const e = env();
  const res = await handleCollect(post('{"p":"/games/mauvais-perdants/"}'), e, T0);
  assert.equal(res.status, 204);
  assert.deepEqual((await summarize(e, '24h', 'mauvais-perdants')).totals.views, 1);
});

test('écran de maintenance : compté comme une page, avec sa provenance', async () => {
  const e = env();
  assert.equal((await handleCollect(post('{"p":"/maintenance","r":"discord.com"}'), e, T0)).status, 204);
  assert.equal(L.pageOf('/maintenance'), 'maintenance');
  const s = await summarize(e, '24h', 'maintenance');
  assert.equal(s.totals.views, 1); assert.equal(s.totals.entries, 1);
  assert.deepEqual(s.countries.other, 1);
});
