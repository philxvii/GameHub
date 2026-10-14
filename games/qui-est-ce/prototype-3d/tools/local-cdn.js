// CDN servis depuis des copies npm locales, pour les tests en machine cloud ou le reseau
// refuse cdn.jsdelivr.net et Google Fonts. Les pages ne changent pas : le navigateur de test
// intercepte (CDP Fetch) ces requetes et repond avec les memes fichiers :
//   - three@0.186.1 (paquet npm three, identique au CDN) ;
//   - Google Fonts : feuille css2 regeneree a partir des paquets @fontsource (memes polices,
//     sous-ensemble latin, woff2).
//
//   npm install --prefix build/tools three@0.186.1 @fontsource/<police> ...   # une fois
//   THREE_LOCAL=1 node tools/test-proto.js                                     # active l'interception
//
// Sans THREE_LOCAL, rien n'est intercepte (PC de l'utilisateur : les CDN repondent).

const fs = require('fs');
const path = require('path');

const MODULES = path.join(__dirname, '..', 'build', 'tools', 'node_modules');
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.186.1/';
const FONTS_CSS = 'https://fonts.googleapis.com/css2';
const FONT_FILES = 'https://fonts.gstatic.com/fontsource/';
const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2', '.css': 'text/css' };

// family=Zilla+Slab:wght@600;700 | family=Cormorant+Garamond:ital,wght@0,600;1,600 | family=Permanent+Marker
function fontsCss(url) {
  const out = [];
  for (const fam of new URL(url).searchParams.getAll('family')) {
    const [name, axes] = fam.split(':');
    const id = name.trim().toLowerCase().replace(/\s+/g, '-');
    let faces = [[0, 400]];
    if (axes) {
      const [keys, vals] = axes.split('@');
      const k = keys.split(',');
      faces = vals.split(';').map((t) => {
        const v = t.split(',').map(Number);
        return [k.includes('ital') ? v[k.indexOf('ital')] : 0, k.includes('wght') ? v[k.indexOf('wght')] : 400];
      });
    }
    for (const [ital, w] of faces) {
      const style = ital ? 'italic' : 'normal';
      out.push(`@font-face{font-family:'${name}';font-style:${style};font-weight:${w};font-display:swap;` +
        `src:url(${FONT_FILES}${id}/${id}-latin-${w}-${style}.woff2) format('woff2');}`);
    }
  }
  return out.join('\n');
}

function resolve(url) {
  if (url.startsWith(THREE)) return path.join(MODULES, 'three', decodeURIComponent(url.slice(THREE.length).split(/[?#]/)[0]));
  if (url.startsWith(FONT_FILES)) {
    const [id, file] = url.slice(FONT_FILES.length).split('/');
    return path.join(MODULES, '@fontsource', id, 'files', file);
  }
  return null;
}

async function localCdn(page) {
  if (!process.env.THREE_LOCAL) return false;
  if (!fs.existsSync(path.join(MODULES, 'three', 'package.json'))) throw new Error('three absent : npm install --prefix build/tools three@0.186.1');
  const onEvent = page._onEvent.bind(page);
  const reply = (requestId, type, body) => page.send('Fetch.fulfillRequest', {
    requestId, responseCode: 200, body: Buffer.from(body).toString('base64'),
    responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }],
  }).catch(() => {});
  page._onEvent = (msg) => {
    if (msg.method !== 'Fetch.requestPaused') return onEvent(msg);
    const { requestId, request } = msg.params;
    if (request.url.startsWith(FONTS_CSS)) return reply(requestId, 'text/css', fontsCss(request.url));
    const file = resolve(request.url);
    if (!file || !file.startsWith(MODULES) || !fs.existsSync(file)) {
      page.consoleErrors.push({ type: 'local-cdn', text: 'non servi localement : ' + request.url });
      page.send('Fetch.failRequest', { requestId, errorReason: 'FileNotFound' }).catch(() => {});
      return;
    }
    reply(requestId, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  };
  await page.send('Fetch.enable', { patterns: [{ urlPattern: THREE + '*' }, { urlPattern: FONTS_CSS + '*' }, { urlPattern: FONT_FILES + '*' }] });
  return true;
}

module.exports = { localCdn };
