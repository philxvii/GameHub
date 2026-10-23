// Adaptateurs des fournisseurs, tous GRATUITS, dans le même ordre que Banqueroll :
// Gemini (AI Studio) -> OpenRouter (modèles :free) -> Workers AI (binding, sans clé).
// Repris du modèle de games/banqueroll/ai-host/src/providers.js, avec deux
// différences : un mode JSON (correcteur du Petit Bac) et aucun import du persona
// privé de Banqueroll. Chaque adaptateur renvoie { text, model } ou lève ProviderError.

const key = v => String(v || '').trim();

export class ProviderError extends Error {
  constructor(provider, reason, status, detail) {
    super(`${provider}: ${reason}`);
    this.provider = provider;
    this.reason = reason;          // missing_key | timeout | quota | http | empty | network
    this.status = status || 0;
    this.detail = detail || '';    // jamais de contenu ni de clé
  }
}

async function post(provider, url, headers, body, signal, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    throw new ProviderError(provider, e && e.name === 'AbortError' ? 'timeout' : 'network');
  }
  if (res.status === 429) throw new ProviderError(provider, 'quota', 429);
  if (!res.ok) throw new ProviderError(provider, 'http', res.status);
  try { return await res.json(); } catch (e) { throw new ProviderError(provider, e && e.name === 'AbortError' ? 'timeout' : 'empty', res.status); }
}

const list = (v, dflt) => String(v || dflt).split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);

export const gemini = {
  id: 'gemini',
  configured: env => !!key(env.GEMINI_API_KEY),
  async call({ system, user, json, schema, env, signal, fetchImpl = fetch }) {
    const model = list(env.GEMINI_MODEL, 'gemini-3.5-flash-lite')[0];
    const generationConfig = { temperature: json ? 0.2 : 1, maxOutputTokens: json ? 2400 : 400 };
    if (/^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    if (json) { generationConfig.responseMimeType = 'application/json'; if (schema) generationConfig.responseSchema = schema; }
    const data = await post('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': key(env.GEMINI_API_KEY) },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig,
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH'].map(category => ({ category, threshold: 'BLOCK_ONLY_HIGH' })) },
      signal, fetchImpl);
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = (parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!text) throw new ProviderError('gemini', 'empty', 200);
    return { text, model: data.modelVersion || model };
  },
};

export const openrouter = {
  id: 'openrouter',
  configured: env => !!key(env.OPENROUTER_API_KEY),
  async call({ system, user, json, env, signal, fetchImpl = fetch }) {
    const models = list(env.OPENROUTER_MODEL, 'google/gemma-4-31b-it:free');
    const body = {
      model: models[0], models,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: json ? 2400 : 600, temperature: json ? 0.2 : 0.95,
      reasoning: { effort: 'low', exclude: true },
    };
    if (json) body.response_format = { type: 'json_object' };
    const data = await post('openrouter', 'https://openrouter.ai/api/v1/chat/completions', {
      Authorization: `Bearer ${key(env.OPENROUTER_API_KEY)}`, 'HTTP-Referer': 'https://roulia.me/games/mauvais-perdants/', 'X-Title': 'Mauvais Perdants',
    }, body, signal, fetchImpl);
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new ProviderError('openrouter', 'empty', 200);
    return { text, model: data.model || models[0] };
  },
};

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
  async call({ system, user, json, env, signal }) {
    const model = list(env.WORKERS_AI_MODEL, '@cf/meta/llama-3.3-70b-instruct-fp8-fast')[0];
    let data;
    try {
      data = await withAbort(env.AI.run(model, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: json ? 2000 : 300, temperature: json ? 0.2 : 0.95 }), signal);
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const msg = String((e && e.message) || e || '');
      throw new ProviderError('workersai', /4006|neuron|quota|rate limit/i.test(msg) ? 'quota' : 'http', 0);
    }
    const raw = data && (data.response !== undefined ? data.response : data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
    const text = typeof raw === 'string' ? raw.trim() : raw ? JSON.stringify(raw) : '';
    if (!text) throw new ProviderError('workersai', 'empty', 200);
    return { text, model };
  },
};

export const PROVIDERS = { gemini, openrouter, workersai };
export const ORDER = ['gemini', 'openrouter', 'workersai'];
