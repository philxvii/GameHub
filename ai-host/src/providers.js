// Adaptateurs des fournisseurs d'IA, tous GRATUITS : Gemini (AI Studio), OpenRouter
// (modeles :free), puis Workers AI (binding Cloudflare, sans cle). Chacun recoit le meme prompt et renvoie
// { text, model }, ou leve une ProviderError (le chef d'orchestre passe au suivant).
// Les cles ne sortent jamais d'ici : elles ne sont ni journalisees ni renvoyees.

import { modelsFrom } from './prompt.js';

// Une cle collee dans le terminal peut emporter une espace ou un retour chariot (Windows).
const key = v => String(v || '').trim();

export class ProviderError extends Error {
  constructor(provider, reason, status, detail) {
    super(`${provider}: ${reason}`);
    this.provider = provider;
    this.reason = reason;      // missing_key | timeout | quota | http | empty | network
    this.status = status || 0;
    this.detail = detail || '';  // ex. raison de fin et modele : jamais de contenu ni de cle
  }
}

async function post(provider, url, headers, body, signal) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    throw new ProviderError(provider, e && e.name === 'AbortError' ? 'timeout' : 'network');
  }
  if (res.status === 429) throw new ProviderError(provider, 'quota', 429);
  if (!res.ok) {
    // Diagnostic : code et debut du message d'erreur du fournisseur (jamais la cle, jamais le contenu envoye).
    let detail = '';
    try { const e = (await res.json()).error || {}; detail = `${e.status || e.code || ''} ${String(e.message || '').slice(0, 140)}`.trim(); } catch { /* corps non JSON */ }
    throw new ProviderError(provider, 'http', res.status, detail);
  }
  // Un delai depasse pendant la lecture du corps reste un delai depasse, pas une reponse vide.
  try { return await res.json(); } catch (e) { throw new ProviderError(provider, e && e.name === 'AbortError' ? 'timeout' : 'empty', res.status); }
}

// ------------------------------------------------------------ Gemini (offre gratuite Google AI Studio)
// GEMINI_MODEL peut lister plusieurs modeles (« a,b ») : si le premier cale (lenteur
// passagere de l'offre gratuite, quota, modele retire), le suivant est essaye dans le
// temps alloue a Gemini, avant de passer a OpenRouter.
const GEMINI_DEFAULT = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';
const FIRST_MODEL_MS = 5000;     // le premier modele repond en ~1 s ; au-dela, il cale

export const geminiModels = env => String((env && env.GEMINI_MODEL) || GEMINI_DEFAULT).split(',').map(m => m.trim()).filter(Boolean).slice(0, 3);

async function geminiOnce(model, system, user, env, signal) {
  const generationConfig = { temperature: 1, maxOutputTokens: 800 };
  // Reflexion au plus bas : une replique de presentateur n'a pas besoin de raisonner,
  // et la reflexion par defaut depassait le delai. Gemini 3 : thinkingLevel ;
  // Gemini 2.5 Flash : thinkingBudget 0. Autre modele : reglage par defaut.
  if (/^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };   // 'minimal' est refuse par gemini-3.8-flash
  else if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig,
    // Le roast reste dans le cadre du jeu : on ne bloque que les contenus vraiment graves.
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH'].map(category => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await post('gemini', url, { 'x-goog-api-key': key(env.GEMINI_API_KEY) }, body, signal);
  const candidate = data && data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  // Les parties « thought » sont la reflexion interne du modele : jamais affichees.
  const text = (parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) {
    const why = (data && data.promptFeedback && data.promptFeedback.blockReason) || (candidate && candidate.finishReason) || '?';
    throw new ProviderError('gemini', 'empty', 200, `${why} ${model}`);
  }
  return { text, model: data.modelVersion || model };
}

export const gemini = {
  id: 'gemini',
  configured: env => !!key(env.GEMINI_API_KEY),
  model: env => geminiModels(env).join(','),
  async call({ system, user, env, signal }) {
    const models = geminiModels(env);
    const errors = [];
    for (let i = 0; i < models.length; i++) {
      if (signal && signal.aborted) break;
      // Chaque modele a son propre delai ; le dernier prend le reste du temps de Gemini.
      const ctrl = new AbortController();
      const stop = () => ctrl.abort();
      if (signal) signal.addEventListener('abort', stop, { once: true });
      const timer = i < models.length - 1 ? setTimeout(stop, FIRST_MODEL_MS) : null;
      try {
        return await geminiOnce(models[i], system, user, env, ctrl.signal);
      } catch (e) {
        errors.push(`${models[i]}:${e && e.reason || 'error'}${e && e.status ? ' ' + e.status : ''}`);
        if (i === models.length - 1 || (signal && signal.aborted)) {
          throw new ProviderError('gemini', e && e.reason || 'error', e && e.status, [errors.join(' | '), e && e.detail].filter(Boolean).join(' — '));
        }
      } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', stop);
      }
    }
    throw new ProviderError('gemini', 'timeout', 0, errors.join(' | '));
  },
};

// ------------------------------------------------------------ OpenRouter (modeles gratuits)
export const openrouter = {
  id: 'openrouter',
  configured: env => !!key(env.OPENROUTER_API_KEY),
  model: env => modelsFrom(env).join(','),
  async call({ system, user, env, signal }) {
    const models = modelsFrom(env);
    const data = await post('openrouter', 'https://openrouter.ai/api/v1/chat/completions', {
      Authorization: `Bearer ${key(env.OPENROUTER_API_KEY)}`,
      'HTTP-Referer': 'https://roulia.me/banqueroll.html',
      'X-Title': 'Banqueroll',
    }, {
      model: models[0],
      models,                                      // bascule automatique d'OpenRouter
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      // Les modeles gratuits raisonnent souvent : sans plafond, la reflexion mangeait
      // tout le budget et la reponse revenait vide (finish_reason « length »).
      max_tokens: 1200,
      temperature: 0.95,
      reasoning: { effort: 'low', exclude: true },
    }, signal);
    const choice = data && data.choices && data.choices[0];
    const text = choice && choice.message && choice.message.content;
    if (!text) throw new ProviderError('openrouter', 'empty', 200, `${(choice && choice.finish_reason) || '?'} ${data && data.model || ''}`);
    return { text, model: data.model || models[0] };
  },
};

// ------------------------------------------------------------ Workers AI (Cloudflare, sans cle)
// Branche directement sur le Worker par le binding `AI` (wrangler.toml) : aucune cle,
// offre gratuite de 10 000 « neurons » par jour, independante de Google et d'OpenRouter.
// WORKERS_AI_MODEL peut lister plusieurs modeles : le suivant est essaye si l'un echoue.
const WORKERS_AI_DEFAULT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const workersAiModels = env => String((env && env.WORKERS_AI_MODEL) || WORKERS_AI_DEFAULT).split(',').map(m => m.trim()).filter(Boolean).slice(0, 3);

// env.AI.run ne prend pas de signal : on fait la course avec l'abandon du chef d'orchestre.
function withAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const stop = () => reject(new ProviderError('workersai', 'timeout'));
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

export const workersai = {
  id: 'workersai',
  configured: env => !!(env && env.AI && typeof env.AI.run === 'function'),
  model: env => workersAiModels(env).join(','),
  async call({ system, user, env, signal }) {
    const errors = [];
    for (const model of workersAiModels(env)) {
      if (signal && signal.aborted) break;
      let data;
      try {
        data = await withAbort(env.AI.run(model, {
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          max_tokens: 320,
          temperature: 0.95,
        }), signal);
      } catch (e) {
        if (e instanceof ProviderError) throw e;                       // delai depasse
        const msg = String((e && e.message) || e || '').slice(0, 140);
        // Allocation gratuite du jour epuisee (code 4006) : inutile d'essayer un autre modele.
        if (/4006|neuron|daily free allocation|quota|rate limit/i.test(msg)) throw new ProviderError('workersai', 'quota', 429, msg);
        errors.push(`${model}: ${msg}`);
        continue;
      }
      // Selon le modele : { response } ou format OpenAI { choices: [{ message }] }.
      const text = String((data && (data.response || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content))) || '').trim();
      if (text) return { text, model };
      errors.push(`${model}: vide`);
    }
    throw new ProviderError('workersai', 'http', 0, errors.join(' | '));
  },
};

export const PROVIDERS = { gemini, openrouter, workersai };
