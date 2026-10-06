// Faux backend IA pour les tests : execute le VRAI Worker (ai-host/src/worker.js)
// dans Node, avec un OpenRouter simule. Aucune cle, aucun appel externe.
//
//   node tools/ai-mock.js            # http://localhost:8787/host
//   POST /__mode  {"mode":"ok"|"fail"|"slow"}   change le comportement de l'amont
//   GET  /__last                                 dernier contexte recu par le "modele"

const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.AI_MOCK_PORT || 8787);
let mode = 'ok';
let last = null;

(async () => {
  const worker = (await import(pathToFileURL(path.join(__dirname, '..', 'ai-host', 'src', 'worker.js')).href)).default;
  const env = {
    OPENROUTER_API_KEY: 'test-key-not-real',
    ALLOWED_ORIGINS: 'http://localhost:4173,http://127.0.0.1:4173',
  };
  const realFetch = globalThis.fetch;
  // OpenRouter simule : renvoie une replique qui prouve que le contexte est bien arrive.
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://openrouter.ai/')) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const ctx = JSON.parse(body.messages[1].content.replace(/^[^\n]*\n/, ''));
    last = { model: body.model, system: body.messages[0].content.slice(0, 60), ctx };
    if (mode === 'fail') return new Response('{"error":"down"}', { status: 503 });
    if (mode === 'slow') await new Promise(r => setTimeout(r, 15000));
    const quote = ctx.memory && ctx.memory.quotes && ctx.memory.quotes[0];
    const who = ctx.addressedBy || (ctx.event && ctx.event.type) || '?';
    const text = `[IA] ${ctx.mode === 'chat' ? 'Réponse à ' + who : 'Commentaire ' + who}` + (quote ? ` — on se souvient de « ${quote.text} »` : '');
    return new Response(JSON.stringify({ model: 'mock', choices: [{ message: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    if (req.url === '/__mode') { mode = JSON.parse(raw || '{}').mode || 'ok'; res.end(JSON.stringify({ mode })); return; }
    if (req.url === '/__last') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(last)); return; }
    const request = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw,
    });
    const out = await worker.fetch(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  }).listen(PORT, () => console.log(`ai-mock prêt sur http://localhost:${PORT}/host`));
})();
