// Prompt systeme et nettoyage des donnees : fonctions pures, testables dans Node.

// Le ton, la liste d'actu et les exemples sont dans persona.js (prive, non versionne).
import { SYSTEM_PROMPT, ADULT_PROMPT, NEWS, NEWS_DATE } from './persona.js';
export { SYSTEM_PROMPT, ADULT_PROMPT, NEWS, NEWS_DATE };

// Prompt envoye au modele : la base + quelques actus tirees au hasard.
export function systemPrompt(rng = Math.random, n = 6, { adult = false } = {}) {
  const pool = NEWS.slice();
  const picks = [];
  while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const news = picks.length ? `\n\nACTU DU MOMENT (${NEWS_DATE}) : choisis-en une seule quand tu t'en sers.\n${picks.map(x => `- ${x}`).join('\n')}` : '';
  return `${SYSTEM_PROMPT}${adult && ADULT_PROMPT ? `\n\n${ADULT_PROMPT}` : ''}${news}`;
}

export const clip = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);

// On reconstruit un contexte propre et borne : rien d'autre ne part chez le modele.
export function sanitize(body) {
  const arr = (a, n) => (Array.isArray(a) ? a.slice(-n) : []);
  return {
    mode: body.mode === 'chat' ? 'chat' : 'event',
    adult: body.adult === true ? true : undefined,
    intensity: Math.max(0, Math.min(5, num(body.intensity) || 0)),
    addressedBy: clip(body.addressedBy, 24) || undefined,
    message: clip(body.message, 200) || undefined,
    event: body.event ? { type: clip(body.event.type, 24), text: clip(body.event.text, 240), facts: clip(body.event.facts, 300) } : undefined,
    round: num(body.round),
    currentPlayer: clip(body.currentPlayer, 24) || undefined,
    players: arr(body.players, 8).map(p => ({
      name: clip(p.name, 24), cash: num(p.cash), netWorth: num(p.netWorth), rank: num(p.rank),
      properties: num(p.properties), fullGroups: arr(p.fullGroups, 8).map(g => clip(g, 16)),
      inJail: !!p.inJail, bankrupt: !!p.bankrupt,
    })),
    recentEvents: arr(body.recentEvents, 8).map(t => clip(t, 200)),
    chat: arr(body.chat, 14).map(m => ({ who: clip(m.who, 24), text: clip(m.text, 160) })),
    memory: {
      quotes: arr(body.memory && body.memory.quotes, 6).map(q => ({ who: clip(q.who, 24), text: clip(q.text, 140), roundsAgo: num(q.roundsAgo), boast: q.boast ? true : undefined })),
      gags: arr(body.memory && body.memory.gags, 6).map(g => clip(g, 160)),
      facts: arr(body.memory && body.memory.facts, 8).map(f => clip(f, 160)),
    },
    localLine: clip(body.localLine, 240) || undefined,
  };
}

// Modeles de conversation gratuits, dans l'ordre de preference. OpenRouter bascule
// sur le suivant si le premier est indisponible. Le routeur `openrouter/free` est
// ecarte : il tirait aussi des classifieurs (« User Safety: safe ») et des modeles de code.
export const DEFAULT_MODELS = ['google/gemma-4-31b-it:free', 'dots-studio/dots-3-note-preview:free', 'nvidia/nemotron-3.5-lightning:free'];

export function modelsFrom(env) {
  const list = String((env && (env.OPENROUTER_MODELS || env.OPENROUTER_MODEL)) || '').split(',').map(s => s.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT_MODELS).slice(0, 3);
}

// Une vraie replique : une phrase, pas une etiquette de classifieur ni un fragment.
export function looksLikeLine(text) {
  const t = String(text || '').trim();
  if (t.length < 25 || !/\s/.test(t)) return false;
  if (/^(user|assistant|response)?\s*(safety|safe|unsafe|harmful|category)/i.test(t)) return false;
  if (/^(safe|unsafe)\s*$/i.test(t) || /^\{.*\}$/.test(t)) return false;
  return true;
}

export function cleanReply(text) {
  let t = clip(text, 600)
    .replace(/^(bankroll host|banqueroll host|présentateur|host)\s*[:：-]\s*/i, '')
    .replace(/^["«“'\s]+|["»”'\s]+$/g, '')
    // Aucun emoji : le modele en colle par reflexe, et ca fait animateur gene.
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length > 280) {
    const cut = t.slice(0, 280);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > 80 ? cut.slice(0, end + 1) : cut.slice(0, 279).replace(/\s+\S*$/, '') + '…';
  }
  return t;
}

