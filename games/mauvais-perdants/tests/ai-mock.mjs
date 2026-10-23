// Exécute le VRAI Worker de Mauvais Perdants (ai/src/worker.js) dans Node, avec des
// fournisseurs simulés : aucune clé, aucun appel externe.
//
//   node games/mauvais-perdants/tests/ai-mock.mjs [port]           # défaut 8787
//   puis http://localhost:4174/games/mauvais-perdants/?emu&ai=http://localhost:8787
//
// Comportement réglable à chaud : GET /mode?m=ok|slow|bad|down|quota|inject
//   ok     Gemini répond (correcteur : règles ci-dessous ; présentateur : une réplique)
//   slow   Gemini met 30 s (dépasse tous les budgets) -> le jeu passe en jury / local
//   bad    JSON du correcteur mal formé, réplique d'assistant -> rejetés
//   down   erreur réseau partout
//   quota  429 partout
// Correcteur simulé : réponse contenant « zz » -> ambiguous ; « xq » -> invalid ;
// sinon valid (confiance 0,9). Il ne voit jamais de pseudo : on le vérifie (journal).

import http from 'node:http';
import worker from '../ai/src/worker.js';

const PORT = Number(process.argv[2]) || 8787;
let mode = process.env.MOCK_MODE || 'ok';
export const seen = [];          // corps reçus par les « fournisseurs » (pour les tests)

const env = {
  GEMINI_API_KEY: 'fausse-cle-de-test', OPENROUTER_API_KEY: '',
  ALLOWED_ORIGINS: 'http://localhost:4174,http://localhost:4173,http://127.0.0.1:4174',
  GEMINI_MODEL: 'gemini-simule',
};

const reply = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
const gem = text => reply({ candidates: [{ content: { parts: [{ text }] } }], modelVersion: 'gemini-simule' });

export async function fakeFetch(url, init) {
  const body = JSON.parse(init.body);
  seen.push({ url: String(url), body });
  if (mode === 'down') throw new TypeError('network');
  if (mode === 'quota') return new Response('{}', { status: 429 });
  if (mode === 'slow') await new Promise((res, rej) => { const t = setTimeout(res, 30000); init.signal && init.signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('abort'), { name: 'AbortError' })); }); });
  const user = body.contents[0].parts[0].text;
  const isJudge = !!(body.generationConfig && body.generationConfig.responseMimeType);
  if (isJudge) {
    if (mode === 'bad') return gem('{"results":[{"submissionId":"g999","verdict":"oui"}]}');
    const data = JSON.parse(user.slice(user.indexOf('{')));
    const results = data.items.map(it => {
      const a = it.answer.toLowerCase();
      if (a.includes('zz')) return { submissionId: it.id, verdict: 'ambiguous', categoryFit: 'douteux', shortReason: 'Rattachement discutable à la catégorie.', confidence: 0.5, normalizedAnswer: a };
      if (a.includes('xq')) return { submissionId: it.id, verdict: 'invalid', categoryFit: 'non', shortReason: 'Ce mot n’existe pas.', confidence: 0.95, normalizedAnswer: a };
      return { submissionId: it.id, verdict: 'valid', categoryFit: 'oui', shortReason: `Bien un élément de « ${it.category} ».`, confidence: 0.9, normalizedAnswer: a };
    });
    return gem(JSON.stringify({ results }));
  }
  if (mode === 'bad') return gem('En tant qu’IA, je ne peux pas commenter.');
  const ctx = JSON.parse(user.slice(user.indexOf('{')));
  return gem(`(IA simulée) ${ctx.localLine ? 'Je confirme : ' + ctx.localLine.slice(0, 120) : 'Quel spectacle navrant, vraiment.'}`);
}

export function server(port = PORT) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/mode') {
      mode = url.searchParams.get('m') || mode;
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end(mode);
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const out = await worker.fetch(request, env, {}, fakeFetch);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  }).listen(port, () => console.log(`IA simulée sur http://localhost:${port} (mode ${mode})`));
}

if (process.argv[1] && process.argv[1].endsWith('ai-mock.mjs')) server();
export const setMode = m => { mode = m; };
