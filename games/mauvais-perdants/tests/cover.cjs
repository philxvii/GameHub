// Génère l'affiche du hub (cover.webp, 720×960) à partir du SVG du présentateur.
//   node games/mauvais-perdants/tests/cover.cjs
// Rendu par Chrome sans tête ; aucune image externe.

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require(path.join(__dirname, '..', '..', '..', 'tools', 'cdp.js'));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sym = html.match(/<symbol id="host"[^>]*>([\s\S]*?)<\/symbol>/)[1];
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'show.css'), 'utf8');

const page = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Sans:wght@600;700&display=swap" rel="stylesheet">
<style>${css}
html,body{width:720px;height:960px;overflow:hidden;margin:0}
body::before{display:none}
.cv{position:relative;width:720px;height:960px;background:
  radial-gradient(60% 45% at 50% 62%, rgba(214,168,74,.30), transparent 70%),
  linear-gradient(90deg, #5a1a16, #141110 18%, #141110 82%, #5a1a16);overflow:hidden}
.cv .curtain{position:absolute;inset:0;background:repeating-linear-gradient(90deg, rgba(0,0,0,.25) 0 6px, transparent 6px 40px);-webkit-mask:linear-gradient(90deg,#000 0 16%,transparent 22% 78%,#000 84%)}
.cv .bulbs{position:absolute;top:44px;left:0;right:0;display:flex;justify-content:center;gap:22px}
.cv .bulbs i{width:14px;height:14px;border-radius:50%;background:#d6a84a;box-shadow:0 0 16px #d6a84a}
.cv .bulbs i:nth-child(3n){opacity:.35;box-shadow:none}
.cv h1{position:absolute;top:96px;left:0;right:0;margin:0;text-align:center;font-family:Anton;font-weight:400;text-transform:uppercase;line-height:.84}
.cv h1 .a{display:block;font-size:128px;color:#f3ebdc}
.cv h1 .b{display:block;font-size:158px;color:#d6a84a;text-shadow:0 8px 0 #a77e2c;transform:rotate(-3deg)}
.cv .host{position:absolute;left:50%;bottom:-10px;width:470px;transform:translateX(-50%)}
.cv .host svg{width:100%;height:auto;display:block}
.cv .flapsrow{position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center}
.cv .flapsrow .flap{font-size:46px}
</style></head><body>
<div class="cv"><div class="curtain"></div><div class="bulbs">${'<i></i>'.repeat(11)}</div>
<h1><span class="a">Mauvais</span><span class="b">Perdants</span></h1>
<div class="host glee"><svg viewBox="0 0 200 220"><g>${sym}</g></svg></div>
</div></body></html>`;

(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '720,960' });
  const p = await b.newPage('about:blank', 'cover');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 960, deviceScaleFactor: 1, mobile: false });
  const file = path.join(require('os').tmpdir(), 'mp-cover.html');
  fs.writeFileSync(file, page);
  await p.goto('file:///' + file.replace(/\\/g, '/'));
  await p.eval('await document.fonts.ready; return 1;');
  await sleep(600);
  const { data } = await p.send('Page.captureScreenshot', { format: 'webp', quality: 86 });
  const out = path.join(__dirname, '..', 'cover.webp');
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('écrit', out, fs.statSync(out).size, 'octets');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
