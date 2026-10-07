// Faux backend IA pour les tests : execute le VRAI Worker (ai-host/src/worker.js)
// dans Node, avec Gemini et OpenRouter SIMULES. Aucune cle reelle, aucun
// appel externe.
//
//   node tools/ai-mock.js            # http://localhost:8787/host
//   POST /__mode  {"mode":"ok"}                                  meme comportement pour tous
//   POST /__mode  {"gemini":"fail","openrouter":"ok"}           par fournisseur
//        modes : ok | fail (503) | slow (15 s) | quota (429) | junk (« User Safety: safe »)
//   GET  /__last                                                 dernier contexte recu + appels

const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.AI_MOCK_PORT || 8787);
const HOSTS = { 'generativelanguage.googleapis.com': 'gemini', 'openrouter.ai': 'openrouter' };
let modes = { gemini: 'ok', openrouter: 'ok' };
let last = null;
let calls = [];

(async () => {
  const worker = (await import(pathToFileURL(path.join(__dirname, '..', 'ai-host', 'src', 'worker.js')).href)).default;
  const env = {
    GEMINI_API_KEY: 'test-gemini-not-real',
    OPENROUTER_API_KEY: 'test-openrouter-not-real',
    ALLOWED_ORIGINS: 'http://localhost:4173,http://127.0.0.1:4173',
  };
  const realFetch = globalThis.fetch;

  // Les deux fournisseurs simules : chacun renvoie une replique qui prouve que le
  // contexte est bien arrive, dans le format de reponse de sa propre API.
  globalThis.fetch = async (url, init) => {
    const provider = HOSTS[new URL(String(url)).hostname];
    if (!provider) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const userText = provider === 'gemini' ? body.contents[0].parts[0].text : body.messages[1].content;
    const ctx = JSON.parse(userText.replace(/^[^\n]*\n/, ''));
    const mode = modes[provider] || 'ok';
    calls.push({ provider, mode });
    last = { provider, model: body.model || String(url).split('/models/')[1], ctx };
    if (mode === 'fail') return new Response('{"error":"down"}', { status: 503 });
    if (mode === 'quota') return new Response('{"error":"quota"}', { status: 429 });
    if (mode === 'slow') {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 15000);
        if (init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      });
    }
    const quote = ctx.memory && ctx.memory.quotes && ctx.memory.quotes[0];
    const who = ctx.addressedBy || (ctx.event && ctx.event.type) || '?';
    const text = mode === 'junk' ? 'User Safety: safe'
      : `[IA ${provider}] ${ctx.mode === 'chat' ? 'Réponse à ' + who : 'Commentaire ' + who}` + (quote ? ` — on se souvient de « ${quote.text} »` : '');
    const payload = provider === 'gemini'
      ? { candidates: [{ content: { parts: [{ text }] } }], modelVersion: 'gemini-mock' }
      : { model: provider + '-mock', choices: [{ message: { content: text } }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    if (req.url === '/__mode') {
      const m = JSON.parse(raw || '{}');
      modes = m.mode ? { gemini: m.mode, openrouter: m.mode } : { ...modes, ...m };
      calls = [];
      res.end(JSON.stringify(modes));
      return;
    }
    if (req.url === '/__last') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...last, calls })); return; }
    const request = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
    });
    const out = await worker.fetch(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  }).listen(PORT, () => console.log(`ai-mock prêt sur http://localhost:${PORT}/host`));
})();
