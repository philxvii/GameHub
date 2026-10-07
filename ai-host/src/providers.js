// Adaptateurs des fournisseurs d'IA, tous GRATUITS : Gemini (AI Studio) puis
// OpenRouter (modeles :free). Chacun recoit le meme prompt et renvoie
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
export const gemini = {
  id: 'gemini',
  configured: env => !!key(env.GEMINI_API_KEY),
  model: env => env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  async call({ system, user, env, signal }) {
    const model = this.model(env);
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

export const PROVIDERS = { gemini, openrouter };
