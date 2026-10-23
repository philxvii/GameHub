// Chef d'orchestre : même principe que Banqueroll (ordre fixe, un fournisseur sans clé
// est sauté, échec/délai/quota/réponse inexploitable -> suivant), mais avec un budget
// court : le jeu n'attend jamais. accept(text) décide si la réponse est exploitable
// (réplique valide, ou JSON conforme au schéma du correcteur).

import { PROVIDERS, ORDER, ProviderError } from './providers.js';

export async function orchestrate({ system, user, json, schema, env, budgetMs, perProviderMs, accept, fetchImpl, now = () => Date.now() }) {
  const start = now();
  const tried = [];
  const usable = ORDER.filter(id => PROVIDERS[id].configured(env));
  for (const id of ORDER) {
    const p = PROVIDERS[id];
    if (!p.configured(env)) { tried.push({ id, reason: 'missing_key' }); continue; }
    const left = budgetMs - (now() - start);
    if (left < 800) { tried.push({ id, reason: 'no_time' }); continue; }
    const isLast = usable[usable.length - 1] === id;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), isLast ? left : Math.min(perProviderMs, left));
    try {
      const out = await p.call({ system, user, json, schema, env, signal: ctrl.signal, fetchImpl });
      const value = accept(out.text);
      if (value === null || value === undefined) { tried.push({ id, reason: 'rejected' }); continue; }
      return { ok: true, value, provider: id, model: out.model, tried };
    } catch (e) {
      tried.push({ id, reason: e instanceof ProviderError ? e.reason : 'error', status: e && e.status });
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, tried };
}
