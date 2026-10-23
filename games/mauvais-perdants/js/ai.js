// Appels du coordinateur vers le Worker de Mauvais Perdants (présentateur + correcteur).
// Rien n'attend l'IA : la réplique locale est déjà affichée, le Petit Bac a son vote.
// Toute réponse est revalidée ici (défense en profondeur) avant usage.
// AUCUNE clé ici : ce n'est qu'une URL publique.

import { parseJudge } from './petitbac.js';

// URL du Worker une fois déployé (ai/README.md). Vide = local seulement.
export const AI_ENDPOINT = '';

export const HOST_TIMEOUT_MS = 9000;
export const JUDGE_TIMEOUT_MS = 11000;     // < JUDGE_MAX_MS de machine.js
const PROVIDERS = ['gemini', 'openrouter', 'workersai'];

// ?ai=<url> ou ?ai=off, seulement sur la machine locale (tests).
export function aiBase(loc = typeof location !== 'undefined' ? location : null) {
  try {
    if (loc && /^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) {
      const o = new URL(loc.href).searchParams.get('ai');
      if (o) return o === 'off' ? '' : o.replace(/\/(host|judge)$/, '');
    }
  } catch (_) { /* hors navigateur */ }
  return AI_ENDPOINT.replace(/\/(host|judge)$/, '');
}

async function call(path, payload, timeout, fetchImpl) {
  const base = aiBase();
  if (!base) return { ok: false, reason: 'off' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchImpl(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(timer); }
}

const ROLE = /(en tant qu['’]\s*(ia|assistant)|je suis (une|un) (ia|assistant|mod[eè]le)|mod[eè]le de langage|\bsorry\b|d[ée]sol[ée],? (mais|je )|\*\*)/i;

export async function hostLine(payload, fetchImpl = (...a) => fetch(...a)) {
  const r = await call('/host', payload, HOST_TIMEOUT_MS, fetchImpl);
  if (!r.ok) return null;
  const text = String((r.data && r.data.text) || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const provider = String((r.data && r.data.provider) || '').toLowerCase();
  if (text.length < 20 || ROLE.test(text) || !PROVIDERS.includes(provider)) return null;
  return { text, provider };
}

// Renvoie { ok, verdicts, provider, reason }. ok=false => jury (vote des joueurs).
export async function judge(items, prep, code, fetchImpl = (...a) => fetch(...a)) {
  if (!items.items.length) return { ok: true, verdicts: {}, provider: 'none' };
  const r = await call('/judge', { code, ...items }, JUDGE_TIMEOUT_MS, fetchImpl);
  if (!r.ok) return { ok: false, verdicts: {}, reason: r.reason };
  const provider = String((r.data && r.data.provider) || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) return { ok: false, verdicts: {}, reason: 'provider' };
  const parsed = parseJudge(r.data, prep);
  if (!parsed.ok) return { ok: false, verdicts: {}, reason: 'schema' };
  return { ok: true, verdicts: parsed.verdicts, provider };
}
