// roulia-stats — collecte et lecture des statistiques d'audience agrégées de GameHub.
//
//   POST /_stats/e        : événement de page (public, schéma strict, aucune donnée stockée sauf compteurs)
//   GET  /_stats/summary  : agrégats pour l'admin (jeton Firebase de l'admin exigé)
//
// Aucun journal de payload ni d'IP. L'IP sert uniquement de clé éphémère au limiteur de débit
// de Cloudflare ; ce Worker ne la lit ni ne la stocke ailleurs.

import { validateEvent, isBot, record, parseQuery, summarize, purge } from './lib.js';

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
