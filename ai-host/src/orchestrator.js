// Chef d'orchestre : Gemini d'abord, puis OpenRouter, puis Workers AI. 100 % gratuit.
// Un fournisseur sans cle est saute. Echec, delai depasse, quota ou reponse qui
// n'est pas une vraie replique -> fournisseur suivant. Tous en echec -> erreur :
// le jeu garde alors sa replique locale (dernier maillon de la chaine).

import { PROVIDERS, ProviderError } from './providers.js';
import { cleanReply, looksLikeLine } from './prompt.js';

export const ORDER = ['gemini', 'openrouter', 'workersai'];
// Les modeles gratuits d'OpenRouter montent a 10-18 s aux heures chargees. La replique
// locale est deja affichee : une reponse tardive la remplace simplement sur place.
export const TOTAL_BUDGET_MS = 20000;     // le jeu abandonne a 22 s
// 7 s par fournisseur (sauf le dernier) : meme si Gemini et OpenRouter calent tous les
// deux, Workers AI garde ~6 s, assez pour une replique courte.
export const PROVIDER_TIMEOUT_MS = 7000;

export function orderFrom() {
  return ORDER;
}

export function providerStatus(env) {
  return orderFrom(env).map(id => ({ id, configured: PROVIDERS[id].configured(env), model: PROVIDERS[id].model(env) }));
}

export async function orchestrate({ system, user, env, now = () => Date.now() }) {
  const start = now();
  const tried = [];
  const usable = orderFrom(env).filter(id => PROVIDERS[id].configured(env));
  for (const id of orderFrom(env)) {
    const provider = PROVIDERS[id];
    if (!provider.configured(env)) { tried.push({ id, reason: 'missing_key' }); continue; }
    const left = TOTAL_BUDGET_MS - (now() - start);
    if (left < 1500) { tried.push({ id, reason: 'no_time' }); continue; }
    const ctrl = new AbortController();
    // Le dernier fournisseur disponible recoit tout le budget restant (rien ne le suit).
    const isLast = usable[usable.length - 1] === id;
    const timer = setTimeout(() => ctrl.abort(), isLast ? left : Math.min(PROVIDER_TIMEOUT_MS, left));
    try {
      const out = await provider.call({ system, user, env, signal: ctrl.signal });
      const text = cleanReply(out.text);
      if (!text || !looksLikeLine(text)) { tried.push({ id, reason: 'not_a_line' }); continue; }
      return { ok: true, text, provider: id, model: out.model, tried };
    } catch (e) {
      tried.push({ id, reason: e instanceof ProviderError ? e.reason : 'error', status: e && e.status, detail: e && e.detail || undefined });
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, tried };
}
