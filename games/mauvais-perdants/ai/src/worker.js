// Mauvais Perdants — Worker Cloudflare du présentateur et du correcteur du Petit Bac.
//
//   POST /host   { roast, crude, event, facts, players, localLine } -> { text, provider, model }
//   POST /judge  { letter, items:[{id, category, answer}] }       -> { results:[…], provider, model }
//   GET  /health                                                    -> fournisseurs configurés
//
// - Clés : secrets du Worker (GEMINI_API_KEY, OPENROUTER_API_KEY) ; Workers AI par binding.
// - Le navigateur n'envoie que des données ; les consignes sont ici (prompts.js).
// - Le Worker ne renvoie que du texte ou des verdicts validés : il ne touche à aucun
//   point, à aucun classement. Le jeu garde toujours une solution locale (réplique
//   locale, vote des joueurs) si ce Worker est lent, absent ou en panne.
// - Journal : fournisseur et raison d'un échec, jamais de clé ni de contenu.

import { orchestrate } from './orchestrator.js';
import { hostSystem, sanitizeHost, acceptLine, JUDGE_PROMPT, JUDGE_SCHEMA, sanitizeJudge, acceptJudge, clip } from './prompts.js';
import { PROVIDERS, ORDER } from './providers.js';

const MAX_BODY = 8000;
export const HOST_BUDGET_MS = 8000;
export const JUDGE_BUDGET_MS = 9500;

const hits = new Map();
function limited(k, max, windowMs) {
  const t = Date.now();
  const l = (hits.get(k) || []).filter(x => t - x < windowMs);
  if (l.length >= max) { hits.set(k, l); return true; }
  l.push(t); hits.set(k, l);
  return false;
}

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env, ctx, fetchImpl = fetch) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, providers: ORDER.map(id => ({ id, configured: PROVIDERS[id].configured(env) })) }, 200, headers);
    }
    if (request.method !== 'POST' || !['/host', '/judge'].includes(url.pathname)) return json({ error: 'not_found' }, 404, headers);
    if (!allowed.includes(origin)) return json({ error: 'origin' }, 403, headers);
    if (!ORDER.some(id => PROVIDERS[id].configured(env))) return json({ error: 'not_configured' }, 503, headers);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, headers);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400, headers); }
    const room = clip(body.code, 12) || 'anon';

    if (url.pathname === '/judge') {
      if (limited('j:' + room, 6, 60000) || limited('all', 40, 60000)) return json({ error: 'rate_limited' }, 429, headers);
      const input = sanitizeJudge(body);
      if (!input) return json({ error: 'bad_items' }, 400, headers);
      const ids = new Set(input.items.map(i => i.id));
      const out = await orchestrate({
        system: JUDGE_PROMPT, user: `Manche de Petit Bac. Données JSON :\n${JSON.stringify(input)}`, json: true, schema: JUDGE_SCHEMA, env,
        budgetMs: JUDGE_BUDGET_MS, perProviderMs: 5000, accept: t => acceptJudge(t, ids), fetchImpl,
      });
      if (out.tried.length) console.log('judge', out.ok ? out.provider : 'none', JSON.stringify(out.tried));
      if (!out.ok) return json({ error: 'all_failed', tried: out.tried.map(t => `${t.id}:${t.reason}`) }, 502, headers);
      return json({ results: out.value, provider: out.provider, model: out.model || null }, 200, headers);
    }

    if (limited('h:' + room, 14, 60000) || limited('all', 40, 60000)) return json({ error: 'rate_limited' }, 429, headers);
    const c = sanitizeHost(body);
    const out = await orchestrate({
      system: hostSystem(c), user: `Commente ce moment de l'émission. Contexte JSON :\n${JSON.stringify(c)}`, json: false, env,
      budgetMs: HOST_BUDGET_MS, perProviderMs: 4000, accept: acceptLine, fetchImpl,
    });
    if (out.tried.length) console.log('host', out.ok ? out.provider : 'local', JSON.stringify(out.tried));
    if (!out.ok) return json({ error: 'all_failed', tried: out.tried.map(t => `${t.id}:${t.reason}`) }, 502, headers);
    return json({ text: out.value, provider: out.provider, model: out.model || null }, 200, headers);
  },
};
