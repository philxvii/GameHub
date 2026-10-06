// Presentateur « Bankroll Host » : commente la partie ET participe au chat.
//
// - Un seul ecrivain : l'onglet de l'HOTE (comme l'arbitrage), donc pas de doublons.
// - Il lit les evenements structures (history/*.meta) et le chat recent.
// - Il choisit ses interventions : intensite 0..4, delai entre deux prises de parole.
// - Replique LOCALE immediate, puis tentative IA ; si l'IA repond, la replique
//   est remplacee sur place. Sinon la locale reste. Rien n'attend l'IA.
// - Il n'ecrit QUE dans chat/ et hostMem/ : il ne touche jamais au gameplay.

import { BOARD, GROUP_LABELS, GROUPS } from './board.js';
import { netWorth, ranking, ownedBy, ownsFullGroup, rentFor, playerById, currentPlayer } from './rules.js';
import { pickLine } from './lines.js';
import { S, pushChat, patchChat, commit } from './net.js';

export const HOST_NAME = 'Bankroll Host';

// URL du Worker Cloudflare deploye (voir ai-host/README.md). Vide = local seulement.
// Ce n'est PAS un secret : la cle OpenRouter reste dans le Worker.
export const AI_ENDPOINT = 'https://banqueroll-host.banqueroll-host.workers.dev/host';

const AI_TIMEOUT_MS = 16000;           // le Worker abandonne l'amont a 14 s
const AI_MAX_CALLS = 40;              // par partie : l'offre gratuite plafonne a 50/jour
const AI_GAP_EVENT_MS = 12000;
const AI_GAP_CHAT_MS = 6000;
const BATCH_MS = 1400;
const COOLDOWN_MS = 7000;
const SPEAK_CHANCE = [0, 0.25, 0.7, 1, 1];
const MENTION = /(^|[^\p{L}])(host|pr[ée]sentateur|animateur|bankroll|banqueroll)([^\p{L}]|$)|@host|@bot|🎤/iu;
const TAUNT = /(nul|naze|nulle|vengeance|revanche|attends?|tu vas voir|jamais|facile|gagn|perd|pleur|ruin|trop fort|ez\b|gg\b|😂|🤣|lol|mdr|ptdr|cheh|loser|rattrap)/i;

let code = null;
let seenHist = null;
let seenChat = null;
let queue = [];
let batchTimer = null;
let lastSpeak = 0;
let lastAi = 0;
let failStreak = 0;
let aiPausedUntil = 0;
let mem = null;
let memTimer = null;
let prevLeader = null;

export function aiEndpoint() {
  try {
    // Surcharge de test, refusee hors de la machine locale : ?ai=off coupe l'IA
    // (tests automatiques reproductibles), ?ai=<url> pointe vers un autre Worker.
    const o = new URL(location.href).searchParams.get('ai');
    if (o && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return o === 'off' ? '' : o;
  } catch (e) { /* hors navigateur */ }
  return AI_ENDPOINT;
}

function reset(newCode) {
  code = newCode; seenHist = null; seenChat = null; queue = []; mem = null; prevLeader = null;
  clearTimeout(batchTimer); clearTimeout(memTimer);
}

function normalizeMem(m) {
  m = m || {};
  return { quotes: m.quotes || [], stats: m.stats || {}, pairs: m.pairs || {}, used: m.used || [], facts: m.facts || [], aiCalls: m.aiCalls || 0 };
}

function saveMemSoon() {
  clearTimeout(memTimer);
  memTimer = setTimeout(() => {
    if (!S.isHost || !S.game || S.game.code !== code || !mem) return;
    commit(code, { hostMem: { ...mem, quotes: mem.quotes.slice(-14), used: mem.used.slice(-30), facts: mem.facts.slice(-10) } });
  }, 3500);
}

const stat = pid => (mem.stats[pid] = mem.stats[pid] || { rentPaid:0, jail:0, wheelLoss:0, wheelWin:0, afk:0, chat:0, bigLoss:0 });
const nameOf = (game, id) => (playerById(game, id) || {}).name || '?';
const entries = obj => Object.entries(obj || {}).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.ts - b.ts);

// ================================================================ point d'entree
export function observe(game) {
  if (!game) return;
  if (game.code !== code) reset(game.code);
  if (!S.isHost) return;
  if (!mem) mem = normalizeMem(game.hostMem);
  const hist = entries(game.history);
  const chat = entries(game.chat);
  if (seenHist === null) {
    // Premier passage (creation, rechargement) : on ne commente pas le passe.
    seenHist = new Set(hist.map(h => h.key));
    seenChat = new Set(chat.map(c => c.key));
    prevLeader = (ranking(game)[0] || {}).id || null;
    return;
  }
  hist.forEach(h => {
    if (seenHist.has(h.key)) return;
    seenHist.add(h.key);
    if (h.meta) ingestEvent(game, h.meta, h.text);
  });
  chat.forEach(c => {
    if (seenChat.has(c.key)) return;
    seenChat.add(c.key);
    if (c.kind !== 'host') ingestChat(game, c);
  });
  if (game.phase === 'playing' && (game.round || 1) >= 2) {
    const leader = (ranking(game)[0] || {}).id || null;
    if (leader && prevLeader && leader !== prevLeader) enqueue({ type:'leader', intensity:2, ctx: baseCtx(game, { p: leader }), text:`${nameOf(game, leader)} prend la tête.` });
    prevLeader = leader;
  }
}

// ================================================================ evenements
const TYPE_OF = {
  rent:'rent', buy:'buy', build:'build', sell:'sell', jail:'jail', bail:'bail', steal:'steal', seize:'seize',
  swap:'swap', auction:'auction', trade:'trade', bankrupt:'bankrupt', win:'win', afk:'afk', begin:'begin', event:'event',
};

function lineType(meta) {
  if (meta.t === 'chance') {
    if (meta.kind === 'card') return meta.key === 'jail' ? 'jail' : 'card';
    return meta.kind;            // dilemma | wheel
  }
  return TYPE_OF[meta.t] || null;
}

function quoteFor(game, pid, minRoundsAgo = 0) {
  const round = game.round || 1;
  const mine = mem.quotes.filter(x => x.pid === pid && round - (x.r || round) >= minRoundsAgo);
  const pickQ = mine[mine.length - 1];
  if (!pickQ) return null;
  const ago = round - (pickQ.r || round);
  return { text: pickQ.text, who: pickQ.who, ago: ago >= 2 ? ` il y a ${ago} manches` : ago === 1 ? ' à la manche précédente' : '' };
}

// Citation d'un AUTRE joueur qui parlait de `pid` (pour les retournements).
function mockOf(game, pid) {
  const name = nameOf(game, pid).toLowerCase();
  const found = [...mem.quotes].reverse().find(x => x.pid !== pid && x.text.toLowerCase().includes(name));
  return found ? { who: found.who, text: found.text } : null;
}

function baseCtx(game, meta) {
  const p = playerById(game, meta.p);
  const pos = meta.pos;
  const sq = pos !== undefined ? BOARD[pos] : null;
  const ranks = ranking(game);
  const chatCounts = game.players.map(x => (mem.stats[x.id] || {}).chat || 0);
  return {
    P: nameOf(game, meta.p), O: meta.o ? nameOf(game, meta.o) : '',
    amt: Math.abs(meta.amt || 0), signed: meta.amt || 0, city: sq ? sq.name : '',
    cash: p ? p.cash : undefined, before: meta.before !== undefined ? meta.before : (p ? p.cash : 0),
    full: !!meta.full, lvl: meta.lvl || 0, boost: !!meta.boost, completes: !!meta.completes,
    group: sq && sq.group ? GROUP_LABELS[sq.group] : '', key: meta.key, choice: meta.choice, coin: meta.coin,
    net: p ? netWorth(game, p) : 0, n: game.players.length, rent: pos !== undefined ? rentFor(game, pos) : 0,
    quote: meta.p ? quoteFor(game, meta.p, 1) || quoteFor(game, meta.p) : null,
    karma: meta.p && meta.o ? (() => { const q = quoteFor(game, meta.p); return q && q.text.toLowerCase().includes(nameOf(game, meta.o).toLowerCase()) ? q : null; })() : null,
    mock: meta.p ? mockOf(game, meta.p) : null,
    paidTo: meta.p && meta.o ? ((mem.pairs[`${meta.p}_${meta.o}`] || {}).n || 0) : 0,
    jailCount: meta.p ? stat(meta.p).jail : 0, wheelLosses: meta.p ? stat(meta.p).wheelLoss : 0,
    afkCount: meta.p ? stat(meta.p).afk : 0, props: meta.p ? ownedBy(game, meta.p).length : 0,
    chatty: !!p && chatCounts.length > 1 && stat(p.id).chat >= 4 && stat(p.id).chat === Math.max(...chatCounts) && ranks[ranks.length - 1] && ranks[ranks.length - 1].id === p.id,
    first: ranks[0] && p && ranks[0].id === p.id, last: ranks.length > 1 && p && ranks[ranks.length - 1].id === p.id,
  };
}

function scoreEvent(type, meta, c) {
  switch (type) {
    case 'rent': {
      let s = c.amt >= 400 || c.amt / Math.max(c.before, 1) >= 0.6 ? 3 : c.amt >= 200 || c.amt / Math.max(c.before, 1) >= 0.35 ? 2 : 1;
      if (c.cash < 0 || c.boost) s++;
      if (c.paidTo >= 3) s = Math.max(s, 2);
      return Math.min(4, s);
    }
    case 'buy': return c.completes ? 3 : c.cash < 100 ? 2 : c.amt >= 400 || c.props >= 6 ? 1 : 0;
    case 'build': return c.lvl === 3 ? 2 : 1;
    case 'sell': return c.before < 0 ? 2 : 1;
    case 'jail': return c.jailCount >= 2 ? 3 : 2;
    case 'bail': return 1;
    case 'card': return c.amt >= 150 ? 2 : 1;
    case 'dilemma': return meta.key === 'double' && meta.choice === 'A' ? 3 : meta.key === 'loan' && meta.choice === 'A' ? 3 : meta.choice === 'A' ? 2 : 1;
    case 'wheel': return ({ jackpot:4, minus500:3, jail:3, fire:3, swap:3, nothing:2, triple:2, raid:2 })[meta.key] || 1;
    case 'steal': case 'seize': return 3;
    case 'swap': case 'trade': return 2;
    case 'auction': {
      const price = BOARD[meta.pos] ? BOARD[meta.pos].price : 0;
      c.over = meta.p && c.amt >= price * 1.15; c.cheap = meta.p && c.amt <= price * 0.6;
      return !meta.p ? 0 : c.over ? 3 : c.cheap ? 2 : 1;
    }
    case 'bankrupt': case 'win': return 4;
    case 'afk': return c.afkCount >= 2 ? 2 : 1;
    case 'begin': return 3;
    case 'event': return c.amt >= 140 ? 1 : 0;
    default: return 0;
  }
}

function updateStats(type, meta, game) {
  if (!meta.p) return;
  const st = stat(meta.p);
  if (type === 'rent') {
    const k = `${meta.p}_${meta.o}`;
    const pair = mem.pairs[k] = mem.pairs[k] || { n:0, sum:0 };
    pair.n++; pair.sum += meta.amt || 0;
    st.rentPaid += meta.amt || 0;
    if ((meta.amt || 0) >= 300) st.bigLoss++;
  }
  if (type === 'jail' || (type === 'wheel' && meta.key === 'jail')) st.jail++;
  if (type === 'wheel') {
    if (['minus500', 'jail', 'fire'].includes(meta.key)) st.wheelLoss++;
    if (['jackpot', 'plus300'].includes(meta.key)) st.wheelWin++;
  }
  if (type === 'afk') st.afk++;
}

function ingestEvent(game, meta, text) {
  const type = lineType(meta);
  if (!type) return;
  if (type === 'begin') meta = { ...meta, p: (currentPlayer(game) || {}).id };
  updateStats(type, meta, game);
  const ctx = baseCtx(game, meta);
  const intensity = scoreEvent(type, meta, ctx);
  ctx.intensity = intensity;
  if (intensity >= 3) { mem.facts.push(`Manche ${game.round || 1} : ${text}`); }
  saveMemSoon();
  enqueue({ type, intensity, ctx, text, meta });
}

// ================================================================ chat
function ingestChat(game, msg) {
  const text = String(msg.text || '').slice(0, 160);
  const pid = msg.pid || (game.players.find(p => p.name === msg.author) || {}).id;
  if (!pid) return;
  stat(pid).chat++;
  const mentionsPlayer = game.players.some(p => p.id !== pid && text.toLowerCase().includes(String(p.name).toLowerCase()));
  if (TAUNT.test(text) || mentionsPlayer) {
    mem.quotes.push({ pid, who: msg.author, text: text.slice(0, 140), r: game.round || 1, ts: msg.ts || Date.now() });
    mem.quotes = mem.quotes.slice(-14);
  }
  saveMemSoon();
  if (game.phase === 'lobby') return;
  const ctx = baseCtx(game, { p: pid });
  ctx.question = /\?\s*$/.test(text);
  ctx.paid = stat(pid).rentPaid;
  if (MENTION.test(text)) {
    ctx.intensity = 2;
    return enqueue({ type:'chat', intensity:2, ctx, text, mode:'chat', addressedBy: msg.author, message: text, urgent:true });
  }
  if (TAUNT.test(text)) enqueue({ type:'taunt', intensity:1, ctx: { ...ctx, intensity:1 }, text, mode:'chat', addressedBy: msg.author, message: text });
}

// ================================================================ prise de parole
function enqueue(item) {
  queue.push(item);
  clearTimeout(batchTimer);
  batchTimer = setTimeout(flush, item.urgent ? 450 : BATCH_MS);
}

function flush() {
  if (!queue.length || !S.isHost || !S.game || S.game.code !== code) { queue = []; return; }
  // Une salve d'evenements (un tour) -> une seule reaction : la plus forte.
  const best = queue.reduce((a, b) => (b.urgent && !a.urgent) || (b.urgent === a.urgent && b.intensity >= a.intensity) ? b : a);
  queue = [];
  const t = Date.now();
  const since = t - lastSpeak;
  if (!best.urgent) {
    if (best.intensity < 4 && since < COOLDOWN_MS && !(best.intensity >= 3 && since > 3000)) return;
    if (Math.random() > SPEAK_CHANCE[best.intensity]) return;
  } else if (since < 2500) {
    queue.push(best);
    batchTimer = setTimeout(flush, 2500 - since);
    return;
  }
  speak(best);
}

async function speak(item) {
  const line = pickLine(item.type, item.ctx, mem.used);
  if (!line) return;
  lastSpeak = Date.now();
  mem.used.push(line.id); mem.used = mem.used.slice(-30);
  saveMemSoon();
  const ref = await pushChat(code, { author: HOST_NAME, kind:'host', text: line.text, src:'local', lvl: item.intensity, ev: item.type });
  if (!aiAllowed(item)) return;
  const text = await requestAI(aiPayload(item, line.text));
  if (text && S.game && S.game.code === code) patchChat(code, ref.key, { text, src:'ai' });
}

function aiAllowed(item) {
  if (!aiEndpoint() || Date.now() < aiPausedUntil || mem.aiCalls >= AI_MAX_CALLS) return false;
  const gap = item.mode === 'chat' ? AI_GAP_CHAT_MS : AI_GAP_EVENT_MS;
  if (Date.now() - lastAi < gap) return false;
  return item.mode === 'chat' ? item.type === 'chat' : item.intensity >= 3;
}

function aiFailed() {
  failStreak++;
  if (failStreak >= 3) { aiPausedUntil = Date.now() + 120000; failStreak = 0; }
}

export async function requestAI(payload) {
  const url = aiEndpoint();
  if (!url) return null;
  lastAi = Date.now();
  mem.aiCalls++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    if (!res.ok) { aiFailed(); return null; }
    const data = await res.json();
    const text = String((data && data.text) || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    // Defense en profondeur : une etiquette de classifieur ne remplace jamais une vraie replique.
    if (!text || text.length < 25 || /^(user|assistant)?\s*(safety|safe|unsafe)/i.test(text)) { aiFailed(); return null; }
    failStreak = 0;
    return text;
  } catch (e) {
    aiFailed();
    return null;
  } finally { clearTimeout(timer); }
}

// ================================================================ contexte IA
function gags(game) {
  const out = [];
  Object.entries(mem.pairs).forEach(([k, v]) => {
    if (v.n < 2) return;
    const [a, b] = k.split('_');
    out.push(`${nameOf(game, a)} a déjà payé ${v.n} loyers à ${nameOf(game, b)} (${v.sum} $ au total)`);
  });
  game.players.forEach(p => {
    const st = mem.stats[p.id] || {};
    if (st.wheelLoss >= 2) out.push(`${p.name} a perdu ${st.wheelLoss} fois à la roue`);
    if (st.jail >= 2) out.push(`${p.name} est allé ${st.jail} fois en prison`);
    if (st.afk >= 2) out.push(`${p.name} a laissé passer ${st.afk} tours sans jouer`);
    const props = ownedBy(game, p.id).length;
    if (props >= 6) out.push(`${p.name} possède ${props} propriétés`);
  });
  const ranks = ranking(game);
  const last = ranks[ranks.length - 1];
  if (last && (mem.stats[last.id] || {}).chat >= 4) out.push(`${last.name} parle beaucoup dans le chat mais est dernier`);
  return out.slice(-6);
}

function eventFacts(game, item) {
  const m = item.meta || {};
  const p = playerById(game, m.p);
  if (!p) return '';
  const groups = Object.keys(GROUPS).filter(g => ownsFullGroup(game, p.id, g)).map(g => GROUP_LABELS[g]);
  const parts = [`${p.name} a maintenant ${p.cash} $ (fortune nette ${netWorth(game, p)} $), ${ownedBy(game, p.id).length} propriété(s)`];
  if (groups.length) parts.push(`groupes complets : ${groups.join(', ')}`);
  if (m.before !== undefined) parts.push(`il avait ${m.before} $ avant`);
  if (m.amt) parts.push(`montant : ${Math.abs(m.amt)} $`);
  if (m.pos !== undefined) parts.push(`case : ${BOARD[m.pos].name}`);
  if (m.o) parts.push(`autre joueur : ${nameOf(game, m.o)}`);
  return parts.join(' ; ');
}

export function aiPayload(item, localLine) {
  const game = S.game;
  const ranks = ranking(game);
  const round = game.round || 1;
  const chat = entries(game.chat).slice(-14).map(c => ({ who: c.kind === 'host' ? HOST_NAME : c.author, text: c.text }));
  return {
    code: game.code, mode: item.mode === 'chat' ? 'chat' : 'event', intensity: item.intensity,
    addressedBy: item.addressedBy, message: item.message,
    event: item.mode === 'chat' ? undefined : { type: item.type, text: item.text, facts: eventFacts(game, item) },
    round, currentPlayer: (currentPlayer(game) || {}).name,
    players: game.players.map(p => ({
      name: p.name, cash: p.cash, netWorth: netWorth(game, p), rank: ranks.findIndex(r => r.id === p.id) + 1,
      properties: ownedBy(game, p.id).length,
      fullGroups: Object.keys(GROUPS).filter(g => ownsFullGroup(game, p.id, g)).map(g => GROUP_LABELS[g]),
      inJail: !!p.inJail, bankrupt: !!p.bankrupt,
    })),
    recentEvents: entries(game.history).slice(-8).map(h => h.text),
    chat,
    memory: {
      quotes: mem.quotes.slice(-6).map(x => ({ who: x.who, text: x.text, roundsAgo: round - (x.r || round) })),
      gags: gags(game), facts: mem.facts.slice(-8),
    },
    localLine,
  };
}

// Pour les tests : etat interne en lecture seule.
export function presenterDebug() {
  return { code, mem, lastSpeak, lastAi, failStreak, aiPausedUntil, endpoint: aiEndpoint(), queue: queue.length };
}
