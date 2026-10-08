// Banqueroll — proxy du presentateur IA (Cloudflare Worker).
//
//   navigateur --(contexte de jeu)--> /host --> chef d'orchestre --> Gemini --> OpenRouter
//                                                    |
//                                         { text, provider, model }  (sinon erreur -> replique locale)
//
// - Les cles (GEMINI_API_KEY, OPENROUTER_API_KEY) sont des SECRETS du
//   Worker (wrangler secret put). Elles n'apparaissent ni dans le jeu, ni dans Git, ni
//   dans les journaux : on ne journalise que le fournisseur et la raison d'un echec.
// - Le prompt systeme vit ICI : le client n'envoie que des donnees, jamais
//   d'instructions. Les messages du chat sont traites comme des citations.
// - Le Worker renvoie seulement du texte. Il ne peut rien changer au jeu.

import { SYSTEM_PROMPT, sanitize, clip } from './prompt.js';
import { orchestrate, providerStatus, orderFrom } from './orchestrator.js';

const MAX_BODY = 14000;

// Limiteur en memoire, par isolat : un garde-fou contre les rafales, pas une
// comptabilite exacte. Les quotas reels sont ceux des fournisseurs.
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now();
  const list = (hits.get(key) || []).filter(x => t - x < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(t); hits.set(key, list);
  return false;
}

function cors(origin, allowed) {
  const ok = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const providers = providerStatus(env);
      return json({ ok: true, configured: providers.some(p => p.configured), order: orderFrom(env), providers }, 200, headers);
    }
    if (request.method !== 'POST' || url.pathname !== '/host') return json({ error: 'not_found' }, 404, headers);
    if (!allowed.includes(origin)) return json({ error: 'origin' }, 403, headers);
    if (!providerStatus(env).some(p => p.configured)) return json({ error: 'not_configured' }, 503, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, headers);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400, headers); }
    const game = clip(body.code, 16) || 'anon';
    if (limited('g:' + game, 8, 60000) || limited('all', 24, 60000)) return json({ error: 'rate_limited' }, 429, headers);

    const ctx = sanitize(body);
    const user = ctx.mode === 'chat'
      ? `Un joueur t'interpelle dans le chat. Réponds-lui. Contexte JSON :\n${JSON.stringify(ctx)}`
      : `Commente cet évènement de la partie. Contexte JSON :\n${JSON.stringify(ctx)}`;

    const out = await orchestrate({ system: SYSTEM_PROMPT, user, env });
    // Journal minimal : fournisseurs essayes et raisons, jamais de cle ni de contenu.
    if (out.tried.length) console.log('host', out.ok ? out.provider : 'local', JSON.stringify(out.tried));
    if (!out.ok) return json({ error: 'all_failed', tried: out.tried.map(t => `${t.id}:${t.reason}`) }, 502, headers);
    return json({ text: out.text, provider: out.provider, model: out.model || null }, 200, headers);
  },
};
