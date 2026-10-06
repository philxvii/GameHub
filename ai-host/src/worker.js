// Banqueroll — proxy du presentateur IA (Cloudflare Worker, offre gratuite).
//
//   navigateur --(contexte de jeu structure)--> ce Worker --(cle secrete)--> OpenRouter (modele gratuit)
//
// - La cle OPENROUTER_API_KEY est un SECRET du Worker (wrangler secret put) :
//   elle n'apparait jamais dans le code du jeu.
// - Le prompt systeme vit ICI : le client n'envoie que des donnees, jamais
//   d'instructions. Les messages du chat sont traites comme des citations.
// - Le Worker renvoie seulement du texte. Il ne peut rien changer au jeu.
// - En cas d'erreur, le jeu garde sa replique locale : rien ne bloque.

import { SYSTEM_PROMPT, sanitize, cleanReply, clip, modelsFrom, looksLikeLine } from './prompt.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_BODY = 14000;
// Les modeles gratuits repondent en 2 a 10 s, parfois plus : 9 s coupait une requete sur deux.
const UPSTREAM_TIMEOUT_MS = 14000;

// Limiteur en memoire, par isolat : un garde-fou contre les rafales, pas une
// comptabilite exacte. Le quota reel est celui d'OpenRouter (20/min, 50/jour).
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
      return json({ ok: true, configured: !!env.OPENROUTER_API_KEY, models: modelsFrom(env) }, 200, headers);
    }
    if (request.method !== 'POST' || url.pathname !== '/host') return json({ error: 'not_found' }, 404, headers);
    if (!allowed.includes(origin)) return json({ error: 'origin' }, 403, headers);
    if (!env.OPENROUTER_API_KEY) return json({ error: 'not_configured' }, 503, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, headers);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400, headers); }
    const game = clip(body.code, 16) || 'anon';
    if (limited('g:' + game, 8, 60000) || limited('all', 18, 60000)) return json({ error: 'rate_limited' }, 429, headers);

    const ctx = sanitize(body);
    const ask = ctx.mode === 'chat'
      ? `Un joueur t'interpelle dans le chat. Réponds-lui. Contexte JSON :\n${JSON.stringify(ctx)}`
      : `Commente cet évènement de la partie. Contexte JSON :\n${JSON.stringify(ctx)}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://roulia.me/banqueroll.html',
          'X-Title': 'Banqueroll',
        },
        body: JSON.stringify({
          model: modelsFrom(env)[0],
          models: modelsFrom(env),
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: ask }],
          max_tokens: 700,
          temperature: 0.95,
          // Certains modeles gratuits raisonnent avant de repondre : on garde la
          // reflexion courte et hors de la reponse.
          reasoning: { effort: 'low', exclude: true },
        }),
      });
      if (!upstream.ok) return json({ error: 'upstream', status: upstream.status }, upstream.status === 429 ? 429 : 502, headers);
      const data = await upstream.json();
      const text = cleanReply(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
      if (!text) return json({ error: 'empty' }, 502, headers);
      if (!looksLikeLine(text)) return json({ error: 'not_a_line', model: data.model || null }, 502, headers);
      return json({ text, model: data.model || null }, 200, headers);
    } catch (e) {
      return json({ error: e && e.name === 'AbortError' ? 'timeout' : 'upstream_error' }, 504, headers);
    } finally {
      clearTimeout(timer);
    }
  },
};

