// Pilote Chrome minimal via le protocole CDP (DevTools).
//
// Pourquoi maison plutôt que Playwright : aucune dépendance npm, le dépôt reste
// un site statique sans package.json. Node 22+ suffit (WebSocket natif).
// Si le serveur MCP Playwright est disponible, préfère-le : ses instantanés
// d'accessibilité en texte coûtent bien moins cher que des captures d'écran.
//
// Usage :
//   const { Browser, sleep } = require('./cdp');
//   const b = await Browser.launch({ headless: true });
//   const p = await b.newPage('http://localhost:4173/banqueroll.html', 'A');
//   const v = await p.eval(`return document.title;`);
//   await b.close();

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const PORT = Number(process.env.CDP_PORT || 9222);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findChrome() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const found = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!found) throw new Error('chrome introuvable — définis CHROME_PATH');
  return found;
}

async function waitForDevtools(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch (_) { /* pas encore prêt */ }
    await sleep(250);
  }
  throw new Error('DevTools injoignable sur le port ' + PORT);
}

class Browser {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.pages = new Map(); }

  static async launch({ headless = true, windowSize = '1280,900' } = {}) {
    // Profil unique par exécution : un Chrome resté ouvert ne bloque plus le run suivant.
    const dir = path.join(process.env.TEMP || process.env.TMPDIR || '.', 'bq-cdp-' + Date.now().toString(36));
    const args = [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${dir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      // Sans ça, un onglet en arrière-plan voit ses timers bridés et les tests traînent.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--window-size=' + windowSize,
      'about:blank',
    ];
    if (headless) args.unshift('--headless=new');
    const proc = spawn(findChrome(), args, { detached: true, stdio: 'ignore' });
    proc.unref();
    const ws = new WebSocket(await waitForDevtools());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const browser = new Browser(ws);
    browser.proc = proc;
    browser.profileDir = dir;
    ws.onmessage = ev => browser._onMessage(JSON.parse(ev.data));
    return browser;
  }

  _onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message + ' ' + (msg.error.data || ''))) : resolve(msg.result);
      return;
    }
    if (msg.sessionId && this.pages.has(msg.sessionId)) this.pages.get(msg.sessionId)._onEvent(msg);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout CDP: ' + method)); }
      }, 60000);
    });
  }

  async newPage(url, label) {
    // Une FENETRE par joueur : sans fenetre, Chrome ne produit d'images que pour l'onglet
    // au premier plan, et les animations de l'autre joueur ne progressaient pas.
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId, label);
    this.pages.set(sessionId, page);
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.enable');
    // Onglet considéré visible : sinon document.hidden coupe les animations.
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (url) await page.goto(url);
    return page;
  }

  async close() {
    try { await this.send('Browser.close'); } catch (_) {}
    try { this.ws.close(); } catch (_) {}
    await sleep(600);
    try { if (this.proc && this.proc.pid) process.kill(this.proc.pid); } catch (_) {}
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch (_) {}
  }
}

class Page {
  constructor(browser, sessionId, targetId, label) {
    this.browser = browser; this.sessionId = sessionId; this.targetId = targetId;
    this.label = label || sessionId.slice(0, 6);
    this.consoleErrors = []; this.consoleAll = [];
    this._loaded = null;
  }

  _onEvent({ method, params }) {
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args || [])
        .map(a => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
      this.consoleAll.push({ type: params.type, text });
      if (params.type === 'error' || params.type === 'warning') this.consoleErrors.push({ type: params.type, text });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      this.consoleErrors.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
    } else if (method === 'Log.entryAdded') {
      const e = params.entry;
      this.consoleAll.push({ type: e.level, text: e.text });
      if (e.level === 'error') this.consoleErrors.push({ type: 'log.error', text: e.text + ' ' + (e.url || '') });
    } else if (method === 'Page.loadEventFired' && this._loaded) {
      this._loaded();
    }
  }

  send(method, params) { return this.browser.send(method, params, this.sessionId); }

  async goto(url) {
    const done = new Promise(r => { this._loaded = r; });
    await this.send('Page.navigate', { url });
    await Promise.race([done, sleep(15000)]);
    this._loaded = null;
    await sleep(400);
  }

  // Le corps est enveloppé dans une async IIFE : `await` et `return` marchent directement.
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async()=>{ ${expression} })()`,
      awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('JS: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
    }
    return r.result.value;
  }

  async setViewport(width, height = 900, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
    await sleep(350);
  }

  async clearViewport() { await this.send('Emulation.clearDeviceMetricsOverride'); await sleep(250); }

  // À n'utiliser que pour juger l'esthétique : une capture coûte ~2 000 tokens
  // si un agent la regarde. Pour vérifier un comportement, interroge le DOM.
  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  // Coupe une URL : sert à tester le repli quand le CDN GSAP est inaccessible.
  async blockUrls(patterns) {
    await this.send('Network.enable');
    await this.send('Network.setBlockedURLs', { urls: patterns });
  }

  errors() {
    return this.consoleErrors
      .filter(e => !/favicon|fonts\.googleapis/i.test(e.text))
      .map(e => `[${this.label}][${e.type}] ${e.text}`.slice(0, 300));
  }
}

module.exports = { Browser, Page, sleep };
