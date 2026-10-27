// Généré par edge-stats/build-bundle.mjs — ne pas modifier : modifier src/ puis relancer.
// Mesure d'audience de GameHub — logique pure (sans réseau), testée dans test/stats.test.mjs.
//
// Principe : un événement = un chargement de page. Il n'est jamais stocké : il incrémente des
// compteurs (heure, portée, dimension, valeur). Pas d'IP, pas d'identifiant, pas de cookie.

// 'maintenance' : l'écran de maintenance servi par le portier (roulia-gate), quelle que soit l'adresse demandée.
const PAGES = ['home', 'maintenance', 'banqueroll', 'bataille-navale', 'mauvais-perdants', 'mini-golf', 'mini-subway',
  'puissance4', 'qui-est-ce', 'roulette', 'undercover', 'uno', 'wikirace'];
const DIMS = ['page', 'entry', 'country', 'city', 'device', 'browser', 'os', 'ref'];
const K_MIN = 5;                    // seuil d'affichage : une valeur sous ce seuil est regroupée
const TZ = 'Europe/Paris';
const OWN_HOSTS = ['roulia.me', 'www.roulia.me'];
// 24 h : heures glissantes. Les autres : jours calendaires de Paris, aujourd'hui compris (en cours).
const RANGES = { '24h': 24, '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
const HOUR = 3600000;

// ── Événement entrant ─────────────────────────────────────────────────────────────────────
// Schéma strict : { p: "/chemin", r?: "domaine.referent" }. Tout autre champ => refus.
function pageOf(pathname) {
  if (typeof pathname !== 'string' || pathname.length > 64 || !pathname.startsWith('/')) return null;
  if (/[?#\s]/.test(pathname)) return null;                       // pas de query ni de hash
  const p = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (p === '/' || p === '/home') return 'home';
  if (p === '/maintenance') return 'maintenance';
  const m = p.match(/^\/games\/([a-z0-9-]+)\/?$/);
  return m && PAGES.includes(m[1]) ? m[1] : null;
}

// Source de l'arrivée : '' = accès direct, '-' = navigation interne (pas une arrivée), sinon le
// seul nom de domaine du référent (jamais l'URL complète).
function refHost(r) {
  if (r === undefined || r === '') return 'direct';
  if (r === '-') return '-';
  if (typeof r !== 'string' || r.length > 100 || !/^[a-z0-9.-]+$/i.test(r)) return null;
  const h = r.toLowerCase().replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h)) return null;
  return OWN_HOSTS.includes(h) || h === 'roulia.me' ? '-' : h;
}

function validateEvent(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > 512) return null;
  let o;
  try { o = JSON.parse(text); } catch (_) { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (Object.keys(o).some(k => k !== 'p' && k !== 'r')) return null;
  const page = pageOf(o.p);
  if (!page) return null;
  const ref = refHost(o.r);
  if (ref === null) return null;
  return { page, ref, entry: ref !== '-' };
}

// ── Robots et classification du User-Agent (catégories seulement, aucune empreinte) ───────
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|uptime|curl|wget|python|node-fetch|axios|java\/|okhttp|httpclient|go-http|scrapy|facebookexternalhit|embedly|pingdom/i;
const isBot = ua => !ua || BOT.test(ua);

function classifyUA(ua) {
  ua = String(ua || '').slice(0, 400);
  const device = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua) ? 'tablet'
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Autre';
  const os = /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux|X11/.test(ua) ? 'Linux' : 'Autre';
  return { device, browser, os };
}

const countryOf = c => (typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1') ? c : 'ZZ';

// Ville estimée par Cloudflare à partir de l'IP (request.cf). On ne garde que le nom de la ville et
// un point représentatif arrondi à 0,1° (~10 km) : jamais l'IP, jamais les coordonnées brutes.
function placeOf(cf) {
  if (!cf) return null;
  const country = countryOf(cf.country);
  const city = typeof cf.city === 'string' ? cf.city.normalize('NFC').trim() : '';
  const lat = Number(cf.latitude), lon = Number(cf.longitude);
  if (country === 'ZZ' || !city || city.length > 60 || /[\x00-\x1f|<>]/.test(city)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const r = v => Math.round(v * 10) / 10;
  return { key: `${country}|${city}`, lat: r(lat), lon: r(lon) };
}

// Les compteurs à incrémenter pour un événement. Portée 'all' = tout le site ; portée = page,
// pour filtrer par jeu. Aucune combinaison de dimensions n'est stockée (pas de ville × navigateur).
function increments(evt, ua, cf, now = Date.now()) {
  const hour = Math.floor(now / HOUR);
  const c = classifyUA(ua);
  const place = placeOf(cf);
  const dims = [['country', countryOf(cf && cf.country)], ['device', c.device], ['browser', c.browser], ['os', c.os]];
  if (place) dims.push(['city', place.key]);
  if (evt.entry) dims.push(['ref', evt.ref], ['entry', evt.page]);
  const out = [[hour, 'all', 'page', evt.page], ...dims.map(([d, k]) => [hour, 'all', d, k])];
  out.push(...dims.filter(([d]) => d !== 'entry').map(([d, k]) => [hour, evt.page, d, k]));
  return out;
}

const UPSERT = 'INSERT INTO counters (hour, scope, dim, key, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (hour, scope, dim, key) DO UPDATE SET n = n + 1';
const PLACE = 'INSERT OR IGNORE INTO places (key, lat, lon) VALUES (?, ?, ?)';

async function record(db, evt, ua, cf, now = Date.now()) {
  const stmts = increments(evt, ua, cf, now).map(a => db.prepare(UPSERT).bind(...a));
  const place = placeOf(cf);
  if (place) stmts.push(db.prepare(PLACE).bind(place.key, place.lat, place.lon));
  await db.batch(stmts);
}

// ── Lecture agrégée ───────────────────────────────────────────────────────────────────────
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const parisDay = ms => dayFmt.format(ms);                 // AAAA-MM-JJ, fuseau Europe/Paris

// Regroupe les valeurs rares (< K_MIN) en « autres » : aucune ligne ne décrit un petit groupe.
function maskSmall(rows, k = K_MIN) {
  const kept = rows.filter(r => r.n >= k).sort((a, b) => b.n - a.n);
  const rest = rows.filter(r => r.n < k).reduce((s, r) => s + r.n, 0);
  return { rows: kept, other: rest };
}

function parseQuery(params, now = Date.now()) {
  const range = params.get('range') || '7d';
  const game = params.get('game') || 'all';
  if (!(range in RANGES) || (game !== 'all' && !PAGES.includes(game))) return null;
  const to = Math.floor(now / HOUR);
  const from = range === '24h' ? to - 23 : parisMidnightHour(now, RANGES[range] - 1);
  return { range, game, from, to };
}

// Heure (époque / 3600000) du minuit de Paris, `back` jours avant aujourd'hui. Minuit à Paris tombe
// toujours sur une heure UTC pleine (décalage d'une ou deux heures).
function parisMidnightHour(now, back) {
  const d = new Date(parisDay(now) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - back);
  const day = d.toISOString().slice(0, 10);
  let h = Math.floor(d.getTime() / HOUR) - 14;
  while (parisDay(h * HOUR) !== day) h++;
  return h;
}

// Jour de la semaine (0 = lundi) et heure, à Paris.
const wdFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function parisSlot(ms) {
  const parts = Object.fromEntries(wdFmt.formatToParts(ms).map(p => [p.type, p.value]));
  return [WD[parts.weekday], Number(parts.hour) % 24];
}

async function summarize(db, q, now = Date.now()) {
  const all = async sql => (await sql.all()).results;
  const scoped = q.game === 'all';
  const pageRows = await all(db.prepare(
    `SELECT hour, key, n FROM counters WHERE scope = 'all' AND dim = 'page' AND hour BETWEEN ? AND ?${scoped ? '' : ' AND key = ?'}`)
    .bind(...(scoped ? [q.from, q.to] : [q.from, q.to, q.game])));
  const dimRows = await all(db.prepare(
    'SELECT dim, key, SUM(n) AS n FROM counters WHERE scope = ? AND dim != ? AND hour BETWEEN ? AND ? GROUP BY dim, key')
    .bind(q.game, 'page', q.from, q.to));
  const entryRows = scoped ? dimRows : await all(db.prepare(
    "SELECT key, SUM(n) AS n FROM counters WHERE scope = 'all' AND dim = 'entry' AND key = ? AND hour BETWEEN ? AND ? GROUP BY key")
    .bind(q.game, q.from, q.to));

  // Période précédente de même durée, juste avant : pour les tendances.
  const len = q.to - q.from + 1, pFrom = q.from - len, pTo = q.from - 1;
  const prevPages = await all(db.prepare(
    `SELECT key, SUM(n) AS n FROM counters WHERE scope = 'all' AND dim = 'page' AND hour BETWEEN ? AND ?${scoped ? '' : ' AND key = ?'} GROUP BY key`)
    .bind(...(scoped ? [pFrom, pTo] : [pFrom, pTo, q.game])));
  const prevEntries = await all(db.prepare(
    `SELECT SUM(n) AS n FROM counters WHERE scope = 'all' AND dim = 'entry' AND hour BETWEEN ? AND ?${scoped ? '' : ' AND key = ?'}`)
    .bind(...(scoped ? [pFrom, pTo] : [pFrom, pTo, q.game])));

  const views = pageRows.reduce((s, r) => s + r.n, 0);
  const byHour = new Map();
  for (const r of pageRows) byHour.set(r.hour, (byHour.get(r.hour) || 0) + r.n);
  const hourly = q.range === '24h';
  const points = [];
  if (hourly) for (let h = q.from; h <= q.to; h++) points.push({ t: h * HOUR, label: String(h * HOUR), n: byHour.get(h) || 0 });
  else {
    const days = new Map();
    for (let h = q.from; h <= q.to; h++) { const d = parisDay(h * HOUR + HOUR / 2); days.set(d, (days.get(d) || 0) + (byHour.get(h) || 0)); }
    for (const [d, n] of days) points.push({ t: d, label: d, n });
  }

  const dim = name => {
    const m = maskSmall(dimRows.filter(r => r.dim === name).map(r => ({ key: r.key, n: r.n })));
    return { rows: m.rows, other: m.other };
  };
  const pages = new Map();
  for (const r of pageRows) pages.set(r.key, (pages.get(r.key) || 0) + r.n);
  const prevByPage = new Map(prevPages.map(r => [r.key, r.n]));
  // Carte de chaleur : jour de la semaine (lundi d'abord) × heure de Paris, pages vues.
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const [h, n] of byHour) { const [d, hh] = parisSlot(h * HOUR); heat[d][hh] += n; }
  const entries = scoped ? dimRows.filter(r => r.dim === 'entry') : entryRows;
  const entryTotal = entries.reduce((s, r) => s + r.n, 0);

  return {
    generatedAt: now,
    timezone: TZ,
    query: { range: q.range, game: q.game, from: q.from * HOUR, to: (q.to + 1) * HOUR, granularity: hourly ? 'hour' : 'day' },
    kMin: K_MIN,
    totals: { views, entries: entryTotal },
    previous: { from: pFrom * HOUR, to: (pTo + 1) * HOUR, views: prevPages.reduce((s, r) => s + r.n, 0), entries: (prevEntries[0] && prevEntries[0].n) || 0 },
    series: points,
    heat,
    pages: [...pages].map(([key, n]) => ({ key, n, prev: prevByPage.get(key) || 0 })).sort((a, b) => b.n - a.n),
    entries: entries.map(r => ({ key: r.key, n: r.n })).sort((a, b) => b.n - a.n),
    countries: dim('country'),
    devices: dim('device'),
    browsers: dim('browser'),
    os: dim('os'),
    refs: dim('ref'),
    cities: await cities(db, q, dim('city')),
  };
}

// Les villes au-dessus du seuil, avec leur point représentatif. Les autres restent dans le total
// de leur pays, sans point sur la carte.
async function cities(db, q, d) {
  if (!d.rows.length) return { rows: [], other: d.other };
  const keys = d.rows.map(r => r.key);
  const geo = new Map((await db.prepare(`SELECT key, lat, lon FROM places WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all())
    .results.map(r => [r.key, r]));
  const rows = [];
  let other = d.other;
  for (const r of d.rows) {
    const g = geo.get(r.key);
    if (!g) { other += r.n; continue; }
    const [country, ...name] = r.key.split('|');
    rows.push({ key: r.key, country, name: name.join('|'), lat: g.lat, lon: g.lon, n: r.n });
  }
  return { rows, other };
}

async function purge(db, retentionDays, now = Date.now()) {
  const cutoff = Math.floor(now / HOUR) - retentionDays * 24;
  const r = await db.prepare('DELETE FROM counters WHERE hour < ?').bind(cutoff).run();
  await db.prepare("DELETE FROM places WHERE key NOT IN (SELECT DISTINCT key FROM counters WHERE dim = 'city')").run();
  return r.meta && r.meta.changes;
}

// roulia-stats — collecte et lecture des statistiques d'audience agrégées de GameHub.
//
//   POST /_stats/e        : événement de page (public, schéma strict, aucune donnée stockée sauf compteurs)
//   GET  /_stats/summary  : agrégats pour l'admin (jeton Firebase de l'admin exigé)
//
// Aucun journal de payload ni d'IP. L'IP sert uniquement de clé éphémère au limiteur de débit
// de Cloudflare ; ce Worker ne la lit ni ne la stocke ailleurs.


const DB_URL = 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app';
const PROJECT = 'undercover-game-b0d2a';
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

const json = (status, obj, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE, ...extra } });
const empty = status => new Response(null, { status, headers: NO_STORE });
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// Même contrôle que roulia-gate : la base elle-même valide le jeton et renvoie admins/<uid>.
const adminCache = new Map();   // jeton -> expiration (mémoire de l'instance, 60 s)
export async function isAdmin(token, now = Date.now(), fetcher = fetch) {
  if (typeof token !== 'string' || token.length > 4096) return false;
  if ((adminCache.get(token) || 0) > now) return true;
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(b64u(token.split('.')[1]))); } catch (_) { return false; }
  if (!claims || claims.aud !== PROJECT || typeof claims.sub !== 'string' || !(claims.exp > now / 1000)) return false;
  if (!claims.firebase || claims.firebase.sign_in_provider !== 'google.com') return false;
  try {
    const res = await fetcher(`${DB_URL}/admins/${encodeURIComponent(claims.sub)}.json?auth=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok || (await res.json()) !== true) return false;
  } catch (_) { return false; }
  if (adminCache.size > 50) adminCache.clear();
  adminCache.set(token, now + 60000);
  return true;
}

const originsOf = env => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

export async function handleCollect(request, env, now = Date.now()) {
  const origin = request.headers.get('Origin');
  if (!origin || !originsOf(env).includes(origin)) return empty(403);
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return empty(403);
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'text/plain' && type !== 'application/json') return empty(415);
  if (Number(request.headers.get('Content-Length') || 0) > 512) return empty(413);

  // Opposition : Do Not Track / Global Privacy Control => rien n'est compté.
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return empty(204);

  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'none' });
    if (!success) return empty(429);
  }
  const evt = validateEvent(await request.text());
  if (!evt) return empty(400);
  const ua = request.headers.get('User-Agent');
  if (isBot(ua)) return empty(204);                               // robots : ignorés, sans signal
  await record(env.DB, evt, ua, request.cf, now);
  return empty(204);
}

export async function handleSummary(request, env, now = Date.now()) {
  const auth = request.headers.get('Authorization') || '';
  if (!(await isAdmin(auth.startsWith('Bearer ') ? auth.slice(7) : '', now))) return json(401, { error: 'refusé' });
  const q = parseQuery(new URL(request.url).searchParams, now);
  if (!q) return json(400, { error: 'paramètres invalides' });
  return json(200, await summarize(env.DB, q, now));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/_stats/e') return request.method === 'POST' ? await handleCollect(request, env) : empty(405);
      if (pathname === '/_stats/summary') return request.method === 'GET' ? await handleSummary(request, env) : empty(405);
      return empty(404);
    } catch (_) { return empty(500); }   // aucun détail, rien dans les journaux
  },
  async scheduled(_event, env) {
    await purge(env.DB, Number(env.RETENTION_DAYS) || 395);
  },
};
