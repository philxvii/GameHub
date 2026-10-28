// Rubrique « Audience » du panneau admin. Données : GET /_stats/summary (Worker roulia-stats),
// protégé côté serveur par le jeton Firebase de l'admin. Rien n'est affiché qui ne vienne de ce
// point d'accès : en cas d'échec, une erreur, jamais de chiffres de remplacement.
//
// Carte : MapLibre GL (copie locale, shared/vendor/) et les fonds vectoriels d'OpenFreeMap (gratuits,
// sans clé ni compte, données OpenStreetMap). Chaque point est une VILLE (au moins 5 pages vues sur la
// période), placée sur un point représentatif arrondi à ~10 km : jamais un visiteur.
//
// Graphiques : une série par graphique (courbe, carte de chaleur en une teinte), sauf la barre des
// appareils (trois couleurs validées en clair et en sombre, légende et valeurs écrites). Survol avec
// info-bulle ; les chiffres sont repris en listes.
import { auth } from './firebase.js';

const RANGES = [['24h', '24 h'], ['7d', '7 jours'], ['30d', '30 jours'], ['90d', '90 jours'], ['365d', '1 an']];
const PAGE_NAMES = { home: 'Accueil', maintenance: 'Écran de maintenance', banqueroll: 'Banqueroll', 'bataille-navale': 'Bataille Navale', 'mauvais-perdants': 'Mauvais Perdants', 'mini-golf': 'Mini Golf',
  'mini-subway': 'Mini Subway', puissance4: 'Puissance 4', 'qui-est-ce': 'Qui est-ce ?', roulette: 'Roulette', undercover: 'Undercover', uno: 'UNO', wikirace: 'WikiRace' };
const DEVICE = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' };
const DEVICE_C = { desktop: '#EE4B2E', mobile: '#3A72FF', tablet: '#22A15D' };   // scripts/validate_palette.js : OK clair et sombre
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const FRANCE = [[-5.2, 41.3], [9.6, 51.1]];   // [lon, lat]
const MAPLIBRE = new URL('./vendor/maplibre-gl-4.7.1/', import.meta.url).href;
const MAP_STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
// Direction « encre + dé » : les données sont à l'encre du thème (noir en clair, blanc en sombre).
const BRAND = 'var(--text)';

const regions = new Intl.DisplayNames('fr', { type: 'region' });
const nf = new Intl.NumberFormat('fr-FR');
const countryName = c => c === 'ZZ' ? 'Inconnu' : (() => { try { return regions.of(c) || c; } catch (_) { return c; } })();
const when = (ms, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(ms);
const pct = (n, t) => t ? Math.round(n / t * 100) + ' %' : '—';
// #rrggbb (couleur du thème) + opacité, pour la carte (MapLibre ne lit pas les variables CSS).
const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return `rgba(128,128,128,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STYLES = `
.aud{--au-gap:18px}
.aud-bar{position:sticky;top:-8px;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 -4px 20px;padding:8px 4px;background:var(--ap-bg)}
.aud-meta{display:flex;align-items:center;gap:10px;margin-left:auto;font-size:12.5px;color:var(--muted)}
.aud-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;border:none;background:var(--ap-fill);color:var(--text);transition:transform .6s var(--ap-ease)}
.aud-icon:hover{transform:rotate(-60deg)} .aud-icon svg{width:15px;height:15px}
.aud-demo{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px}
.aud-demo i{width:7px;height:7px;border-radius:50%;background:#E0A800}
.aud-body{transition:opacity .3s}
.aud-body.busy{opacity:.45}
.aud-in{animation:aud-in .6s var(--ap-ease) both;animation-delay:calc(var(--i,0) * 55ms)}
@keyframes aud-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.aud-card{background:var(--ap-card);border-radius:22px;box-shadow:0 0 0 1px var(--ap-sep),0 1px 2px rgba(0,0,0,.03);padding:22px 24px}
.aud-sec{margin-top:var(--au-gap)}
.aud-h{display:flex;align-items:baseline;justify-content:space-between;gap:6px 16px;flex-wrap:wrap;margin:34px 6px 12px}
.aud-h h3{margin:0;font-size:19px;font-weight:600;letter-spacing:-.03em}
.aud-h p{margin:0;font-size:12.5px;color:var(--muted)}
.aud-label{font-size:12.5px;font-weight:500;color:var(--muted)}

/* Panneau principal */
.aud-hero{display:grid;grid-template-columns:250px minmax(0,1fr);gap:28px;align-items:stretch;padding:26px 26px 18px;background:var(--ap-card)}
.aud-big{display:block;margin:6px 0 10px;font-size:clamp(44px,5vw,60px);font-weight:600;letter-spacing:-.055em;line-height:.95;font-variant-numeric:tabular-nums}
.aud-pill{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;background:var(--ap-fill);color:var(--muted)}
.aud-pill.up{background:rgba(47,179,107,.14);color:var(--ap-green)}
.aud-pill.down{background:var(--ap-red-soft);color:var(--ap-red)}
.aud-vs{display:block;margin-top:8px;font-size:12px;color:var(--muted)}
.aud-minis{margin-top:22px;border-top:1px solid var(--ap-sep)}
.aud-mini{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--ap-sep);font-size:13px;color:var(--muted)}
.aud-mini:last-child{border-bottom:none}
.aud-mini b{font-size:17px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.aud-mini em{font-style:normal;font-size:11.5px;font-weight:600;margin-left:6px}
.aud-mini em.up{color:var(--ap-green)} .aud-mini em.down{color:var(--ap-red)}

/* Courbe */
.aud-plot{position:relative;height:250px;margin:4px 0 26px 40px;touch-action:pan-y}
.aud-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.aud-plot.draw svg{animation:aud-draw 1.2s var(--ap-ease) both}
@keyframes aud-draw{from{clip-path:inset(-10% 100% -10% 0)}to{clip-path:inset(-10% 0 -10% 0)}}
@keyframes aud-fade{from{opacity:0}}
.aud-plot .grid{position:absolute;left:0;right:0;height:0;border-top:1px dashed var(--ap-sep)}
.aud-plot .grid.base{border-top-style:solid}
.aud-plot .grid span{position:absolute;right:calc(100% + 10px);top:-8px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.aud-plot .x{position:absolute;top:calc(100% + 8px);font-size:11px;color:var(--muted);white-space:nowrap;transform:translateX(-50%)}
.aud-plot .x.first{transform:none} .aud-plot .x.last{transform:translateX(-100%)}
.aud-cross{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--text);opacity:.18;pointer-events:none;transition:left .12s var(--ap-ease)}
.aud-pt{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:${BRAND};box-shadow:0 0 0 3px var(--ap-card),0 0 0 7px color-mix(in srgb,${BRAND} 12%,transparent);pointer-events:none;transition:left .12s var(--ap-ease),top .12s var(--ap-ease)}
.aud-tip{position:absolute;z-index:3;pointer-events:none;padding:8px 11px;border-radius:12px;background:color-mix(in srgb,var(--ap-card) 88%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 0 0 .5px var(--ap-sep2),0 10px 26px -10px rgba(0,0,0,.35);font-size:12px;line-height:1.35;white-space:nowrap;color:var(--muted);transition:left .12s var(--ap-ease),top .12s var(--ap-ease)}
.aud-tip b{display:block;font-size:15px;color:var(--text);font-variant-numeric:tabular-nums}

/* Cartes de synthèse */
.aud-insights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--au-gap);margin-top:var(--au-gap)}
.aud-ins{position:relative;overflow:hidden;min-height:150px;display:flex;flex-direction:column;justify-content:space-between}
.aud-ins strong{display:block;margin-top:6px;font-size:24px;font-weight:600;letter-spacing:-.035em;line-height:1.1}
.aud-ins small{display:block;margin-top:4px;font-size:12.5px;color:var(--muted)}
.aud-ins.poster{color:#fff;background:#0D0B12}
.aud-ins.poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.75;transform:scale(1.04);transition:transform 1.2s var(--ap-ease)}
.aud-ins.poster:hover img{transform:scale(1.1)}
.aud-ins.poster::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.7))}
.aud-ins.poster>*:not(img){position:relative;z-index:1}
.aud-ins.poster .aud-label,.aud-ins.poster small{color:rgba(255,255,255,.8)}
.aud-spark{display:flex;align-items:flex-end;gap:2px;height:42px;margin-top:12px}
.aud-spark i{flex:1;border-radius:3px 3px 1px 1px;background:color-mix(in srgb,${BRAND} 18%,var(--ap-fill));min-height:2px;transform-origin:bottom;animation:aud-grow .8s var(--ap-ease) both;animation-delay:calc(var(--k) * 18ms)}
.aud-spark i.hot{background:${BRAND}}
.aud-spark i.hot::after{content:"";display:block;width:5px;height:5px;margin:-8px auto 0;border-radius:50%;background:#FF5A3C}
@keyframes aud-grow{from{transform:scaleY(0)}}
.aud-ring{display:flex;align-items:center;gap:16px;margin-top:10px}
.aud-ring i{width:56px;height:56px;border-radius:50%;flex:none;background:conic-gradient(${BRAND} calc(var(--p) * 1%),var(--ap-fill) 0);-webkit-mask:radial-gradient(circle,transparent 58%,#000 59%);mask:radial-gradient(circle,transparent 58%,#000 59%)}

/* Jeux */
.aud-games{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.aud-game{position:relative;border-radius:18px;overflow:hidden;background:#0D0B12;color:#fff;aspect-ratio:3/4;box-shadow:0 0 0 1px var(--ap-sep);transition:transform .5s var(--ap-ease),box-shadow .4s}
.aud-game:hover{transform:translateY(-4px);box-shadow:0 0 0 1px var(--ap-sep),0 20px 34px -18px rgba(0,0,0,.55)}
.aud-game img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.aud-game.home{background:var(--die) center 38%/40% no-repeat,repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 1px,transparent 1px 12px),#1C1826}
.aud-game::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.82))}
.aud-game .in{position:absolute;left:0;right:0;bottom:0;z-index:1;padding:12px}
.aud-game .rk{position:absolute;top:10px;left:10px;z-index:1;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:12px;font-weight:600;display:grid;place-items:center}
.aud-game .tr{position:absolute;top:10px;right:10px;z-index:1;height:22px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600;display:grid;place-items:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.aud-game .tr{background:rgba(0,0,0,.5)} .aud-game .tr.up{color:#7EE2A8} .aud-game .tr.down{color:#FF9EA1}
.aud-game b{display:block;font-size:14.5px;font-weight:600;letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aud-game span{display:block;font-size:12px;opacity:.8;font-variant-numeric:tabular-nums}
.aud-game .bar{height:3px;margin-top:8px;border-radius:3px;background:rgba(255,255,255,.2);overflow:hidden}
.aud-game .bar i{display:block;height:100%;border-radius:3px;background:#fff;transform-origin:left;animation:aud-bar 1s .2s var(--ap-ease) both}
@keyframes aud-bar{from{transform:scaleX(0)}}

/* Carte de chaleur */
.aud-heat{display:grid;grid-template-columns:44px repeat(24,minmax(0,1fr));gap:4px;position:relative}
.aud-heat span{font-size:11px;color:var(--muted);display:flex;align-items:center}
.aud-heat .hh{justify-content:center;font-variant-numeric:tabular-nums}
.aud-heat i{height:22px;border-radius:6px;background:var(--ap-fill);transition:transform .25s var(--ap-ease),box-shadow .25s;animation:aud-fade .6s ease both;animation-delay:calc(var(--k) * 4ms)}
.aud-heat i:hover{transform:scale(1.18);box-shadow:0 0 0 2px var(--ap-card),0 0 0 3.5px var(--text);position:relative;z-index:1}
.aud-legend{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:11.5px;color:var(--muted)}
.aud-legend b{display:inline-block;width:140px;height:8px;border-radius:9px;background:linear-gradient(90deg,var(--ap-fill),${BRAND})}

/* Listes */
.aud-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--au-gap)}
.aud-list{list-style:none;margin:0;padding:0}
.aud-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--ap-sep);font-size:14px}
.aud-list li:last-child{border-bottom:none}
.aud-list .av{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--ap-fill);font-size:12.5px;font-weight:600;color:var(--muted)}
.aud-list .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.aud-list .v{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--muted);white-space:nowrap}
.aud-list .v b{color:var(--text);font-weight:600;font-size:14px;margin-right:6px}
.aud-list .bar{grid-column:2/-1;height:4px;border-radius:4px;background:var(--ap-fill);overflow:hidden}
.aud-list .bar i{display:block;height:100%;border-radius:4px;background:${BRAND};opacity:.7;transform-origin:left;animation:aud-bar 1s .15s var(--ap-ease) both}
.aud-list li[data-k]{cursor:pointer;transition:background-color .2s}
.aud-list li[data-k]:hover .t{text-decoration:underline;text-underline-offset:3px}
.aud-list li.sel .t{font-weight:700}
.aud-sub{font-size:13px;color:var(--muted);font-weight:400}
.aud-stack{display:flex;gap:2px;height:14px;border-radius:8px;overflow:hidden;margin:14px 0 14px}
.aud-stack i{height:100%;transform-origin:left;animation:aud-bar 1s var(--ap-ease) both}
.aud-keys{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px}
.aud-keys span{display:inline-flex;align-items:center;gap:7px}
.aud-keys i{width:10px;height:10px;border-radius:3px}
.aud-keys b{font-weight:600;font-variant-numeric:tabular-nums}
.aud-two{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:20px}
.aud-two h4{margin:0 0 2px;font-size:12px;font-weight:600;color:var(--muted)}

/* Carte du monde */
.aud-geo{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0;padding:0;overflow:hidden}
.aud-mapwrap{position:relative}
.aud-map{height:520px;background:var(--ap-fill)}
.aud-geo-side{border-left:1px solid var(--ap-sep);padding:18px 20px;max-height:520px;overflow-y:auto;scrollbar-width:thin}
.aud-map .maplibregl-ctrl-attrib{font:11px var(--f,system-ui);background:color-mix(in srgb,var(--surface) 85%,transparent);color:var(--muted)}
.aud-map .maplibregl-ctrl-attrib a{color:var(--text)}
.aud-map .maplibregl-ctrl-group{background:var(--surface);border-radius:10px;box-shadow:var(--shadow)}
.aud-map .maplibregl-ctrl-group button+button{border-top-color:var(--border)}
:root[data-theme=dark] .aud-map .maplibregl-ctrl-icon{filter:invert(1)}
.aud-map .maplibregl-popup-content{font:12.5px/1.35 var(--f,system-ui);border-radius:12px;background:color-mix(in srgb,var(--ap-card) 90%,transparent);backdrop-filter:blur(14px);color:var(--muted);box-shadow:0 0 0 .5px var(--ap-sep2),0 10px 24px -10px rgba(0,0,0,.4);padding:8px 12px}
.aud-map .maplibregl-popup-content b{color:var(--text);font-size:13.5px}
.aud-map .maplibregl-popup-tip{display:none}
.aud-views{position:absolute;top:14px;right:14px;z-index:500}
.aud-info{position:absolute;left:14px;right:14px;bottom:14px;z-index:500;margin:0;padding:9px 13px;border-radius:12px;background:color-mix(in srgb,var(--ap-card) 86%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-size:12.5px;box-shadow:0 0 0 .5px var(--ap-sep2)}
.aud-info:empty{display:none}
.aud-cc{display:grid;place-items:center;width:30px;height:22px;border-radius:6px;background:var(--ap-fill);font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--muted)}
.aud details{font-size:13px;color:var(--muted);line-height:1.6}
.aud summary{cursor:pointer;color:var(--text);font-weight:500;font-size:14px;list-style:none}
.aud summary::-webkit-details-marker{display:none}
.aud summary::after{content:" +";color:var(--muted)}
.aud details[open] summary::after{content:" –"}
.aud details ul{margin:10px 0 0 1.1em;max-width:75ch}
.aud details li{margin-bottom:5px}
.aud-state{padding:80px 0;text-align:center;font-size:15px;color:var(--muted)}
.aud-state.err{color:var(--ap-red)}
.aud-empty{font-size:13px;color:var(--muted);padding:8px 0}
.aud-note{margin-top:var(--au-gap)}
.aud li[data-k]:focus-visible{outline:2px solid var(--focus,#2F5BE3);outline-offset:2px;border-radius:8px}
@media (max-width:1100px){.aud-geo{grid-template-columns:1fr}.aud-geo-side{border-left:none;border-top:1px solid var(--ap-sep);max-height:none}}
@media (max-width:900px){.aud-hero{grid-template-columns:1fr;gap:10px}.aud-insights{grid-template-columns:1fr}.aud-cols{grid-template-columns:1fr}}
@media (max-width:600px){.aud-card{padding:18px}.aud-hero{padding:20px 18px 14px}.aud-plot{margin-left:34px;height:200px}.aud-heat{grid-template-columns:30px repeat(24,minmax(0,1fr));gap:2px}.aud-heat i{height:16px;border-radius:4px}.aud-heat .hh:nth-child(odd){visibility:hidden}.aud-two{grid-template-columns:1fr}.aud-meta{margin-left:0}.aud-games{grid-template-columns:repeat(2,minmax(0,1fr))}.aud-map{height:340px}}
@media (prefers-reduced-motion:reduce){.aud *{animation:none!important;transition:none!important}}
`;

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
};
const html = (tag, cls, inner) => Object.assign(document.createElement(tag), { className: cls, innerHTML: inner });
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const REFRESH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let maplibreReady;
function loadMaplibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return maplibreReady || (maplibreReady = new Promise((resolve, reject) => {
    document.head.append(el('link', { rel: 'stylesheet', href: MAPLIBRE + 'maplibre-gl.css' }));
    const s = el('script', { src: MAPLIBRE + 'maplibre-gl.js' });
    s.onload = () => resolve(window.maplibregl);
    s.onerror = () => { maplibreReady = null; reject(new Error('MapLibre indisponible')); };
    document.head.append(s);
  }));
}

// Évolution par rapport à la période précédente de même durée.
function trend(n, p) {
  if (p == null) return null;
  if (!p) return n ? { cls: 'up', txt: 'nouveau' } : null;
  const v = Math.round((n - p) / p * 100);
  return { cls: v >= 0 ? 'up' : 'down', txt: `${v >= 0 ? '↑' : '↓'} ${Math.abs(v)} %` };
}

// Le grand chiffre monte doucement jusqu'à sa valeur.
function countUp(node, to) {
  if (reduce() || to < 10) { node.textContent = nf.format(to); return; }
  const t0 = performance.now(), D = 700;
  const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3; node.textContent = nf.format(Math.round(to * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function mountAudience(root, { devEndpoint } = {}) {
  if (!document.getElementById('aud-css')) document.head.append(el('style', { id: 'aud-css', textContent: STYLES }));
  const st = { range: '7d', game: 'all', sel: null, data: null, seq: 0, view: 'fit', anim: true };
  const demo = !!devEndpoint;
  let map = null;

  const seg = el('div', { className: 'ap-seg', role: 'group' });
  seg.setAttribute('aria-label', 'Période');
  const segBtns = RANGES.map(([v, t]) => {
    const b = el('button', { type: 'button', textContent: t });
    b.addEventListener('click', () => { if (st.range !== v) { st.range = v; st.sel = null; load(); } });
    seg.append(b); return [v, b];
  });
  const gameSel = el('select', { className: 'ap-field' },
    [['all', 'Tout le site'], ['home', 'Accueil'], ['maintenance', 'Écran de maintenance'], ...Object.entries(PAGE_NAMES).filter(([k]) => k !== 'home' && k !== 'maintenance').sort((a, b) => a[1].localeCompare(b[1], 'fr'))]
      .map(([v, t]) => el('option', { value: v, textContent: t })));
  gameSel.setAttribute('aria-label', 'Page ou jeu');
  gameSel.addEventListener('change', () => { st.game = gameSel.value; st.sel = null; load(); });
  const refresh = el('button', { type: 'button', className: 'aud-icon', innerHTML: REFRESH_ICON });
  refresh.setAttribute('aria-label', 'Actualiser');
  refresh.addEventListener('click', () => load());
  const updated = el('span');
  updated.setAttribute('aria-live', 'polite');
  const body = el('div', { className: 'aud-body' });
  root.classList.add('aud');
  root.replaceChildren(...[
    demo ? el('div', { className: 'aud-demo' }, el('i'), 'Données synthétiques — démonstration locale') : null,
    el('div', { className: 'aud-bar' }, seg, gameSel, el('div', { className: 'aud-meta' }, updated, refresh)),
    body].filter(Boolean));

  // Thème changé : la carte reprend le fond clair ou sombre (le reste suit les variables CSS).
  let theme = document.documentElement.dataset.theme;
  new MutationObserver(() => {
    const t = document.documentElement.dataset.theme;
    if (t === theme) return;
    theme = t;
    const box = root.querySelector('.aud-map');
    if (st.data && box && map) drawMap(box, st.data).then(() => select(st.sel, { toggle: false }), () => {});
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  async function token() {
    if (demo) return 'dev';
    await auth.authStateReady();
    if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Accès refusé.');
    return auth.currentUser.getIdToken();
  }

  async function load() {
    const my = ++st.seq;
    for (const [v, b] of segBtns) b.setAttribute('aria-pressed', String(v === st.range));
    gameSel.value = st.game;
    if (!st.data) body.replaceChildren(el('div', { className: 'aud-state', textContent: 'Chargement…' }));
    else body.classList.add('busy');
    try {
      const res = await fetch(`${devEndpoint || ''}/_stats/summary?range=${st.range}&game=${encodeURIComponent(st.game)}`,
        { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
      if (my !== st.seq) return;
      if (res.status === 401) throw new Error('Accès refusé.');
      if (res.status === 404) throw new Error('Le service de mesure n’est pas encore déployé.');
      if (res.status === 400) throw new Error('Cette période ou ce jeu demande la nouvelle version du service de mesure.');
      if (!res.ok) throw new Error('Service indisponible (' + res.status + ').');
      st.data = await res.json();
      await render();
    } catch (e) {
      if (my !== st.seq) return;
      st.data = null; updated.textContent = '';
      body.replaceChildren(el('div', { className: 'aud-state err', role: 'alert', textContent: 'Statistiques indisponibles. ' + (e && e.message || '') }));
    } finally { if (my === st.seq) body.classList.remove('busy'); }
  }

  const periodText = d => `${when(d.query.from, { day: 'numeric', month: 'short' })} → ${when(d.query.to - 1, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  const sum = d => d.rows.reduce((s, r) => s + r.n, 0) + d.other;

  function list(rows, other, label, total, avatar) {
    const max = Math.max(1, ...rows.map(r => r.n), other || 0);
    const li = (k, n, av) => el('li', {}, el('span', { className: 'av', textContent: av }), el('span', { className: 't', textContent: k }),
      el('span', { className: 'v' }, el('b', { textContent: nf.format(n) }), pct(n, total)),
      el('span', { className: 'bar' }, el('i', { style: `width:${Math.max(2, Math.round(n / max * 100))}%` })));
    const items = rows.map(r => li(label(r.key), r.n, avatar ? avatar(r.key) : (label(r.key)[0] || '?').toUpperCase()));
    if (other) items.push(li(`Autres (moins de ${st.data.kMin} chacun)`, other, '…'));
    return items.length ? el('ul', { className: 'aud-list' }, items) : el('p', { className: 'aud-empty', textContent: 'Aucune donnée.' });
  }

  // Courbe des pages vues : aire légère + trait de 2 px, axes discrets, réticule et info-bulle.
  function chart(d) {
    const pts = d.series, n = pts.length, max = Math.max(1, ...pts.map(p => p.n));
    const hourly = d.query.granularity === 'hour';
    const label = p => hourly ? when(p.t, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : new Date(p.label + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const short = p => hourly ? when(p.t, { hour: '2-digit', minute: '2-digit' }) : new Date(p.label + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const nice = (() => { const e = 10 ** Math.floor(Math.log10(max)), f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; })();
    const X = i => n === 1 ? 50 : i / (n - 1) * 100, Y = v => 100 - v / nice * 100;
    const box = el('div', { className: 'aud-plot' + (st.anim && !reduce() ? ' draw' : ''), role: 'img' });
    box.setAttribute('aria-label', `Pages vues par ${hourly ? 'heure' : 'jour'} : total ${nf.format(d.totals.views)}, maximum ${nf.format(max)}.`);
    [0, nice / 2, nice].forEach(v => box.append(el('div', { className: 'grid' + (v ? '' : ' base'), style: `top:${Y(v)}%` }, el('span', { textContent: nf.format(v) }))));
    const s = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const id = 'aud-g' + Math.random().toString(36).slice(2, 7);
    const defs = svg('defs'), lg = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(svg('stop', { offset: 0, style: `stop-color:${BRAND};stop-opacity:.14` }), svg('stop', { offset: 1, style: `stop-color:${BRAND};stop-opacity:0` }));
    defs.append(lg); s.append(defs);
    // Courbe lissée (Catmull-Rom → Bézier), sans dépasser zéro.
    const P = pts.map((p, i) => [X(i), Y(p.n)]);
    let dPath = `M${P[0][0]},${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(100, p1[1] + (p2[1] - p0[1]) / 6)], c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(100, p2[1] - (p3[1] - p1[1]) / 6)];
      dPath += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    s.append(svg('path', { class: 'area', d: `${dPath} L100,100 L0,100 Z`, fill: `url(#${id})` }));
    s.append(svg('path', { class: 'line', d: dPath, fill: 'none', style: `stroke:${BRAND}`, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    box.append(s);
    const ticks = n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
    [...new Set(ticks)].forEach((i, k, a) => box.append(el('span', { className: 'x' + (k === 0 ? ' first' : k === a.length - 1 ? ' last' : ''), style: `left:${X(i)}%`, textContent: short(pts[i]) })));
    const cross = el('div', { className: 'aud-cross' }), pt = el('div', { className: 'aud-pt' }), tip = el('div', { className: 'aud-tip' });
    [cross, pt, tip].forEach(x => { x.hidden = true; box.append(x); });
    const show = e => {
      const r = box.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / r.width * (n - 1))));
      const p = pts[i], x = X(i) / 100 * r.width, y = Y(p.n) / 100 * r.height;
      cross.hidden = pt.hidden = tip.hidden = false;
      cross.style.left = x + 'px'; pt.style.left = x + 'px'; pt.style.top = y + 'px';
      tip.innerHTML = `<b>${nf.format(p.n)}</b>${label(p)}`;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, x - tw / 2)) + 'px'; tip.style.top = Math.max(-52, y - 64) + 'px';
    };
    box.addEventListener('pointermove', show);
    box.addEventListener('pointerdown', show);
    box.addEventListener('pointerleave', () => { cross.hidden = pt.hidden = tip.hidden = true; });
    return box;
  }

  // Carte de chaleur : pages vues par jour de la semaine et heure de Paris, une seule teinte.
  function heatmap(d) {
    const max = Math.max(1, ...d.heat.flat());
    const g = el('div', { className: 'aud-heat' });
    g.append(el('span'));
    for (let h = 0; h < 24; h++) g.append(el('span', { className: 'hh', textContent: h % 3 ? '' : h + ' h' }));
    const tip = el('div', { className: 'aud-tip' }); tip.hidden = true;
    let k = 0;
    d.heat.forEach((row, di) => {
      g.append(el('span', { textContent: DAYS[di].slice(0, 3) + '.' }));
      row.forEach((v, h) => {
        const c = el('i', { style: `--k:${k++}` });
        const a = v ? .1 + .9 * (v / max) ** 1.2 : 0;
        if (v) c.style.background = `color-mix(in srgb, ${BRAND} ${Math.round(a * 100)}%, var(--ap-fill))`;
        c.dataset.t = `${DAYS[di]}, ${h} h – ${h + 1} h`; c.dataset.n = v;
        c.setAttribute('aria-label', `${c.dataset.t} : ${v} pages vues`);
        g.append(c);
      });
    });
    g.append(tip);
    g.addEventListener('pointerover', e => {
      const c = e.target.closest('i'); if (!c) return;
      tip.hidden = false; tip.innerHTML = `<b>${nf.format(+c.dataset.n)}</b>${c.dataset.t}`;
      const gr = g.getBoundingClientRect(), cr = c.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(gr.width - tw, cr.left - gr.left + cr.width / 2 - tw / 2)) + 'px';
      tip.style.top = (cr.top - gr.top - tip.offsetHeight - 8) + 'px';
    });
    g.addEventListener('pointerleave', () => { tip.hidden = true; });
    return g;
  }

  // ── Carte ──
  // toggle : un second appui sur la même ville revient à la vue d'ensemble (tableau) ;
  // sur la carte, un clic sur une bulle sélectionne, un clic sur le fond désélectionne.
  function select(key, { fly = false, toggle = true } = {}) {
    const d = st.data;
    const prev = st.sel;
    st.sel = key && (key !== st.sel || !toggle) ? key : null;
    if (map && map.getSource('cities')) {
      if (prev) map.setFeatureState({ source: 'cities', id: d.cities.rows.findIndex(r => r.key === prev) }, { sel: false });
      if (st.sel) map.setFeatureState({ source: 'cities', id: d.cities.rows.findIndex(r => r.key === st.sel) }, { sel: true });
    }
    root.querySelectorAll('li.sel').forEach(r => r.classList.remove('sel'));
    const info = root.querySelector('.aud-info');
    if (!st.sel) { if (info) info.textContent = ''; return; }
    root.querySelector(`li[data-k="${CSS.escape(st.sel)}"]`)?.classList.add('sel');
    const c = d.cities.rows.find(r => r.key === st.sel);
    if (c && info) info.textContent = `${c.name} (${countryName(c.country)}) : ${nf.format(c.n)} pages vues, ${pct(c.n, d.totals.views)} du total · ${periodText(d)}`;
    if (c && fly && map) map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 7), duration: 600 });
  }

  async function drawMap(box, d) {
    const ml = await loadMaplibre();
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL indisponible');
    if (map) { map.remove(); map = null; }
    const dark = document.documentElement.dataset.theme === 'dark';
    if (!d.cities.rows.length) st.view = 'world';
    map = new ml.Map({
      container: box, style: dark ? MAP_STYLE.dark : MAP_STYLE.light,
      ...(st.view === 'fr' ? { bounds: FRANCE } : { center: [10, 30], zoom: 1.2 }),
      fitBoundsOptions: { padding: 24 }, minZoom: 1, maxZoom: 11, scrollZoom: false, dragRotate: false, pitchWithRotate: false,
      attributionControl: { compact: false },
    });
    box.__map = map;   // accès pour les tests navigateur
    map.touchZoomRotate.disableRotation();
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const max = Math.max(1, ...d.cities.rows.map(r => r.n));
    await new Promise((resolve, reject) => { map.once('load', resolve); map.once('error', e => reject(e && e.error || new Error('fond de carte'))); });
    // Noms de lieux en français quand OpenStreetMap les connaît (sinon le nom local).
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field'))
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']]);
    }
    // Fond plus discret : on éteint les routes et les tracés secondaires, les villes ressortent.
    for (const layer of map.getStyle().layers) {
      if (/road|highway|tunnel|bridge|rail|aeroway|transit|building|poi/i.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    map.addSource('cities', { type: 'geojson', data: { type: 'FeatureCollection', features: d.cities.rows.map((c, i) => ({
      type: 'Feature', id: i, properties: { key: c.key, name: c.name, n: c.n, label: `${c.name}\n${nf.format(c.n)}` }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) } });
    const text = getComputedStyle(root).getPropertyValue('--text').trim() || '#0E1016';
    const card = getComputedStyle(root).getPropertyValue('--ap-card').trim() || (dark ? '#16141D' : '#FFFFFF');
    // Halo de densité (une teinte), puis bulles proportionnelles, puis noms des grandes villes.
    map.addLayer({ id: 'cities-heat', type: 'heatmap', source: 'cities', maxzoom: 9, paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, max, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, .8, 9, 2],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 18, 5, 42, 9, 70],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 4, .55, 9, 0],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, rgba(text, 0), .3, rgba(text, .08), .7, rgba(text, .18), 1, rgba(text, .3)],
    } });
    map.addLayer({ id: 'cities', type: 'circle', source: 'cities', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 4, Math.sqrt(max), 20], 8, ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 7, Math.sqrt(max), 34]],
      'circle-color': text,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], .95, .72],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'sel'], false], text, card],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 2],
      'circle-blur': .05,
    } });
    map.addLayer({ id: 'cities-label', type: 'symbol', source: 'cities',
      filter: ['>=', ['get', 'n'], max * .12],
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5, 'text-offset': [0, 1.6], 'text-anchor': 'top',
        'text-line-height': 1.15, 'text-allow-overlap': false, 'text-optional': true, 'symbol-sort-key': ['-', ['get', 'n']] },
      paint: { 'text-color': text, 'text-halo-color': card, 'text-halo-width': 1.6 } });
    map.on('mouseenter', 'cities', e => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      popup.setLngLat(f.geometry.coordinates).setHTML(`<b>${f.properties.name.replace(/[<&]/g, '')}</b><br>${nf.format(f.properties.n)} pages vues · ${pct(f.properties.n, d.totals.views)}`).addTo(map);
    });
    map.on('mouseleave', 'cities', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    map.on('click', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['cities'] })[0];
      select(f ? f.properties.key : null, { toggle: false });
    });
    setView(st.view, true);
  }
  function setView(v, instant = false) {
    st.view = v;
    root.querySelectorAll('.aud-views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (!map) return;
    const pts = (st.data && st.data.cities.rows) || [];
    if (v === 'fit' && pts.length) {
      // Les villes qui font 85 % des vues : les quelques villes lointaines ne réduisent pas tout le reste.
      const tot = pts.reduce((x, c) => x + c.n, 0), core = [];
      for (const c of [...pts].sort((a, b) => b.n - a.n)) { core.push(c); if (core.reduce((x, k) => x + k.n, 0) >= tot * .85) break; }
      const lons = core.map(c => c.lon), lats = core.map(c => c.lat);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 7, duration: instant ? 0 : 900 });
    } else if (v === 'fr') map.fitBounds(FRANCE, { padding: 24, duration: instant ? 0 : 900 });
    else map.flyTo({ center: [10, 30], zoom: 1.2, duration: instant ? 0 : 900 });
  }


  async function render() {
    const d = st.data;
    updated.textContent = `Mis à jour à ${when(d.generatedAt, { hour: '2-digit', minute: '2-digit' })}`;
    if (map) { map.remove(); map = null; }
    if (!d.totals.views) {
      body.replaceChildren(el('div', { className: 'aud-state', textContent: `Aucune page vue sur cette période (${periodText(d)}).` }));
      return;
    }
    let order = 0;
    const appear = node => { node.classList.add('aud-in'); node.style.setProperty('--i', order++); return node; };
    const prev = d.previous;
    const days = d.query.granularity === 'hour' ? null : d.series.length;
    const fr = d.countries.rows.find(r => r.key === 'FR');
    const tr = prev && trend(d.totals.views, prev.views), trE = prev && trend(d.totals.entries, prev.entries);
    const card = (...kids) => el('div', { className: 'aud-card' }, ...kids);
    const head = (title, sub) => el('div', { className: 'aud-h' }, el('h3', { textContent: title }), sub ? el('p', { textContent: sub }) : null);

    // ── Panneau principal ──
    const big = el('span', { className: 'aud-big', textContent: '0' });
    const mini = (k, v, t) => el('div', { className: 'aud-mini' }, k, el('span', {}, el('b', { textContent: v }), t ? el('em', { className: t.cls, textContent: t.txt }) : null));
    const hero = appear(el('section', { className: 'aud-card aud-hero' },
      el('div', {},
        el('span', { className: 'aud-label', textContent: `Pages vues · ${RANGES.find(r => r[0] === st.range)[1]}` }),
        big,
        tr ? el('span', { className: 'aud-pill ' + tr.cls, textContent: tr.txt }) : null,
        el('span', { className: 'aud-vs', textContent: prev ? `par rapport à ${nf.format(prev.views)} juste avant` : periodText(d) }),
        el('div', { className: 'aud-minis' },
          mini('Arrivées', nf.format(d.totals.entries), trE),
          days ? mini('Par jour', nf.format(Math.round(d.totals.views / days))) : mini('Par heure', nf.format(Math.round(d.totals.views / 24))),
          mini('Depuis la France', fr ? pct(fr.n, d.totals.views) : '—'))),
      el('div', {}, el('div', { className: 'aud-label', style: 'margin:0 0 14px', textContent: `${periodText(d)} · heure de Paris` }), chart(d))));
    countUp(big, d.totals.views);

    // ── Synthèse ──
    const topGame = d.pages.find(p => p.key !== 'home' && p.key !== 'maintenance');
    let peak = null;
    if (d.heat) d.heat.forEach((row, di) => row.forEach((v, h) => { if (v && (!peak || v > peak.v)) peak = { v, di, h }; }));
    const byHour = d.heat ? Array.from({ length: 24 }, (_, h) => d.heat.reduce((s, row) => s + row[h], 0)) : null;
    const hMax = byHour ? Math.max(1, ...byHour) : 1;
    const topRef = d.refs.rows[0], refTotal = sum(d.refs);
    const insights = el('div', { className: 'aud-insights' },
      appear(topGame ? el('div', { className: 'aud-card aud-ins poster' },
        el('img', { src: `/games/${topGame.key}/cover.webp`, alt: '', decoding: 'async' }),
        el('span', { className: 'aud-label', textContent: 'Jeu le plus consulté' }),
        el('div', {}, el('strong', { textContent: PAGE_NAMES[topGame.key] || topGame.key }), el('small', { textContent: `${nf.format(topGame.n)} pages vues · ${pct(topGame.n, d.totals.views)} du site` })))
        : el('div', { className: 'aud-card aud-ins' }, el('span', { className: 'aud-label', textContent: 'Jeu le plus consulté' }), el('strong', { textContent: '—' }))),
      appear(el('div', { className: 'aud-card aud-ins' },
        el('span', { className: 'aud-label', textContent: 'Moment le plus fréquenté' }),
        el('div', {}, el('strong', { textContent: peak ? `${DAYS[peak.di]}, ${peak.h} h` : '—' }), el('small', { textContent: peak ? `${nf.format(peak.v)} pages vues sur ce créneau` : 'Données horaires indisponibles' }),
          byHour ? el('div', { className: 'aud-spark', 'aria-hidden': 'true' }, byHour.map((v, h) => el('i', { className: v === hMax ? 'hot' : '', style: `height:${Math.max(4, v / hMax * 100)}%;--k:${h}`, title: `${h} h : ${nf.format(v)}` }))) : null))),
      appear(el('div', { className: 'aud-card aud-ins' },
        el('span', { className: 'aud-label', textContent: 'Première source d’arrivée' }),
        el('div', { className: 'aud-ring' }, el('i', { style: `--p:${topRef ? Math.round(topRef.n / refTotal * 100) : 0}` }),
          el('div', {}, el('strong', { textContent: topRef ? (topRef.key === 'direct' ? 'Accès direct' : topRef.key) : '—' }),
            el('small', { textContent: topRef ? `${pct(topRef.n, refTotal)} des arrivées` : 'Aucune arrivée' }))))));

    // ── Jeux ──
    const gmax = Math.max(1, ...d.pages.map(p => p.n));
    const games = el('div', { className: 'aud-games' }, d.pages.map((p, i) => {
      const t = 'prev' in p ? trend(p.n, p.prev) : null;
      // Accueil : dos de carte au dé (CSS) ; écran de maintenance : son affiche ; jeux : leur couverture.
      const cover = p.key === 'maintenance' ? '/shared/maintenance.webp' : p.key === 'home' ? null : `/games/${p.key}/cover.webp`;
      return el('div', { className: 'aud-game' + (p.key === 'home' ? ' home' : '') },
        cover ? el('img', { src: cover, alt: '', loading: 'lazy', decoding: 'async' }) : null,
        el('span', { className: 'rk', textContent: String(i + 1) }),
        t ? el('span', { className: 'tr ' + t.cls, textContent: t.txt }) : null,
        el('div', { className: 'in' }, el('b', { textContent: PAGE_NAMES[p.key] || p.key }), el('span', { textContent: `${nf.format(p.n)} vues · ${pct(p.n, d.totals.views)}` }),
          el('div', { className: 'bar' }, el('i', { style: `width:${Math.max(3, p.n / gmax * 100)}%` }))));
    }));

    // ── Appareils ──
    const devTotal = sum(d.devices);
    const devRows = [...d.devices.rows].sort((a, b) => ['desktop', 'mobile', 'tablet'].indexOf(a.key) - ['desktop', 'mobile', 'tablet'].indexOf(b.key));
    const devices = card(
      el('span', { className: 'aud-label', textContent: 'Type d’appareil' }),
      el('div', { className: 'aud-stack', role: 'img', 'aria-label': devRows.map(r => `${DEVICE[r.key] || r.key} ${pct(r.n, devTotal)}`).join(', ') },
        devRows.map(r => el('i', { style: `width:${r.n / devTotal * 100}%;background:${DEVICE_C[r.key] || 'var(--muted)'}`, title: `${DEVICE[r.key] || r.key} : ${nf.format(r.n)}` })),
        d.devices.other ? el('i', { style: `width:${d.devices.other / devTotal * 100}%;background:var(--ap-sep2)` }) : null),
      el('div', { className: 'aud-keys' }, devRows.map(r => el('span', {}, el('i', { style: `background:${DEVICE_C[r.key] || 'var(--muted)'}` }), DEVICE[r.key] || r.key, el('b', { textContent: pct(r.n, devTotal) })))),
      el('div', { className: 'aud-two' },
        el('div', {}, el('h4', { textContent: 'Navigateur' }), list(d.browsers.rows, d.browsers.other, k => k, sum(d.browsers))),
        el('div', {}, el('h4', { textContent: 'Système' }), list(d.os.rows, d.os.other, k => k, sum(d.os)))));

    // ── Carte et villes ──
    const cityShown = d.cities.rows.reduce((s, r) => s + r.n, 0), unplaced = d.totals.views - cityShown;
    const cmax = Math.max(1, ...d.cities.rows.map(c => c.n));
    const cityList = el('ul', { className: 'aud-list' }, d.cities.rows.map(c => {
      const li = el('li', { tabIndex: 0 }, el('span', { className: 'aud-cc', textContent: c.country }),
        el('span', { className: 't' }, c.name, c.country === 'FR' ? '' : el('span', { className: 'aud-sub', textContent: ' · ' + countryName(c.country) })),
        el('span', { className: 'v' }, el('b', { textContent: nf.format(c.n) })),
        el('span', { className: 'bar' }, el('i', { style: `width:${Math.max(3, c.n / cmax * 100)}%` })));
      li.dataset.k = c.key; return li;
    }));
    cityList.addEventListener('click', e => { const li = e.target.closest('li[data-k]'); if (li) select(li.dataset.k, { fly: true }); });
    cityList.addEventListener('keydown', e => { const li = e.target.closest('li[data-k]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(li.dataset.k, { fly: true }); } });
    const viewBtns = el('div', { className: 'aud-views ap-seg', role: 'group' }, [['fit', 'Ajuster'], ['fr', 'France'], ['world', 'Monde']].map(([v, t]) => {
      const b = el('button', { type: 'button', textContent: t }); b.dataset.v = v;
      b.addEventListener('click', () => setView(v)); return b;
    }));
    viewBtns.setAttribute('aria-label', 'Cadrage de la carte');
    const mapBox = el('div', { className: 'aud-map', role: 'region' });
    mapBox.setAttribute('aria-label', 'Carte des villes d’où viennent les pages vues. La liste à côté donne les mêmes chiffres.');
    const geo = el('div', { className: 'aud-card aud-geo' },
      el('div', { className: 'aud-mapwrap' }, mapBox, viewBtns, el('p', { className: 'aud-info', role: 'status' })),
      el('div', { className: 'aud-geo-side' },
        el('span', { className: 'aud-label', textContent: 'Villes' }),
        d.cities.rows.length ? cityList : el('p', { className: 'aud-empty', textContent: 'Aucune ville connue pour cette période.' }),
        unplaced ? el('p', { className: 'aud-empty', textContent: `${nf.format(unplaced)} page${unplaced > 1 ? 's' : ''} vue${unplaced > 1 ? 's' : ''} sans ville connue (adresse non localisable, VPN…).` }) : null,
        el('div', { style: 'margin-top:18px' }, el('span', { className: 'aud-label', textContent: 'Pays' }),
          list(d.countries.rows, d.countries.other, countryName, sum(d.countries), k => k === 'ZZ' ? '?' : k))));

    body.replaceChildren(...[
      !d.heat ? html('div', 'ap-note aud-note', '<div><b>Service de mesure à mettre à jour.</b> Tendances, carte de chaleur, 90 jours et 1 an arrivent avec la nouvelle version.</div>') : null,
      hero,
      appear(head('Où sont les joueurs', 'Chaque ville dès sa première vue · position à ~10 km près, jamais une personne')), appear(geo),
      insights,
      appear(head('Jeux et pages', prev ? 'Classement de la période, évolution par rapport à la période d’avant' : 'Classement de la période')), appear(games),
      d.heat ? appear(head('Quand viennent-ils', 'Jour de la semaine × heure de Paris')) : null,
      d.heat ? appear(card(heatmap(d), el('div', { className: 'aud-legend' }, 'moins', el('b'), 'plus'))) : null,
      appear(head('D’où et sur quoi', 'Sources des arrivées et appareils')),
      appear(el('div', { className: 'aud-cols' },
        card(el('span', { className: 'aud-label', textContent: 'Sources des arrivées' }), list(d.refs.rows, d.refs.other, k => k === 'direct' ? 'Accès direct' : k, refTotal)),
        devices)),
      appear(el('div', { className: 'aud-card aud-sec' },
        el('details', {}, el('summary', { textContent: 'Ce que mesurent ces chiffres' }), el('ul', {},
          el('li', { textContent: 'Pages vues : un chargement de page compté par le serveur. Les robots connus, Do Not Track, Global Privacy Control et l’opposition ne sont pas comptés.' }),
          el('li', { textContent: 'Arrivées : pages vues venant d’un autre site ou sans référent (un rechargement compte comme une arrivée).' }),
          el('li', { textContent: 'Aucun visiteur unique : aucun identifiant n’est utilisé. Les joueurs présents en ce moment sont dans « En direct ».' }),
          el('li', { textContent: 'Tendances : comparées à la période de même durée juste avant.' }),
          el('li', { textContent: 'Villes et pays : déduits de l’adresse IP par Cloudflare, approximatifs (VPN, réseau mobile). Chaque point est une ville à ~10 km près, jamais une personne. L’IP n’est pas conservée.' }),
          el('li', { textContent: `Pays, appareils, navigateurs et sources de moins de ${d.kMin} pages vues sont regroupés ; les villes sont toutes montrées. Comptes conservés 13 mois. 24 h : heures glissantes ; autres périodes : jours de Paris, aujourd’hui compris.` })))))].filter(Boolean));
    st.anim = false;   // les animations d'entrée ne jouent qu'au premier affichage

    try { await drawMap(mapBox, d); select(null); }
    catch (e) { console.warn('Carte', e); if (map) { map.remove(); map = null; } mapBox.replaceChildren(el('div', { className: 'aud-state err', role: 'alert', textContent: 'Carte indisponible : la liste des villes donne les mêmes chiffres.' })); }
  }

  return { load };
}
