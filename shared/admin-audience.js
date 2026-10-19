// Rubrique « Audience » du panneau admin. Données : GET /_stats/summary (Worker roulia-stats),
// protégé côté serveur par le jeton Firebase de l'admin. Rien n'est affiché qui ne vienne de ce
// point d'accès : en cas d'échec, une erreur, jamais de chiffres de remplacement.
//
// Carte : MapLibre GL (copie locale, shared/vendor/) et les fonds vectoriels d'OpenFreeMap (gratuits,
// sans clé ni compte, données OpenStreetMap). Chaque point est une VILLE (au moins 5 pages vues sur la
// période), placée sur un point représentatif arrondi à ~10 km : jamais un visiteur.
import { auth } from './firebase.js';

const RANGES = [['24h', '24 h'], ['7d', '7 jours'], ['30d', '30 jours']];
const GAMES = [['all', 'Tout le site'], ['home', 'Accueil'], ['banqueroll', 'Banqueroll'], ['bataille-navale', 'Bataille navale'], ['mini-golf', 'Mini Golf'],
  ['mini-subway', 'Mini Subway'], ['puissance4', 'Puissance 4'], ['qui-est-ce', 'Qui est-ce ?'], ['roulette', 'Roulette'], ['undercover', 'Undercover'], ['uno', 'UNO'], ['wikirace', 'WikiRace']];
const GAME_NAME = Object.fromEntries(GAMES);
const DEVICE = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' };
const FRANCE = [[-5.2, 41.3], [9.6, 51.1]];   // [lon, lat]
const MAPLIBRE = new URL('./vendor/maplibre-gl-4.7.1/', import.meta.url).href;
const MAP_STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
const BRAND = '#FF5A3C';

const regions = new Intl.DisplayNames('fr', { type: 'region' });
const nf = new Intl.NumberFormat('fr-FR');
const countryName = c => c === 'ZZ' ? 'Inconnu' : (() => { try { return regions.of(c) || c; } catch (_) { return c; } })();
const when = (ms, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(ms);
const pct = (n, t) => t ? Math.round(n / t * 100) + ' %' : '—';

const STYLES = `
.aud{--aud-gap:clamp(28px,4vw,48px)}
.aud-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;margin-bottom:28px}
.aud-bar-l{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.aud-seg{display:flex;gap:2px}
.aud-chip{height:34px;padding:0 13px;border-radius:999px;border:none;background:transparent;font:inherit;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;transition:color var(--d-2,.2s),background-color var(--d-2,.2s)}
.aud-chip:hover{color:var(--text)}
.aud-chip[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}
.aud-select{height:34px;padding:0 32px 0 14px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text);font:inherit;font-size:14px;font-weight:500;cursor:pointer;appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 17px) 15px,calc(100% - 12px) 15px;background-size:5px 5px;background-repeat:no-repeat}
.aud-select option{background:var(--surface);color:var(--text)}
.aud-meta{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}
.aud-icon{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;border:1px solid var(--border2);background:transparent;color:var(--text);cursor:pointer;transition:border-color .2s,transform .5s var(--e-out,ease)}
.aud-icon:hover{border-color:var(--text)} .aud-icon:active{transform:rotate(180deg)}
.aud-icon svg{width:15px;height:15px}
.aud-demo{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:18px}
.aud-demo i{width:7px;height:7px;border-radius:50%;background:#E0A800}
.aud-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;padding-bottom:var(--aud-gap);border-bottom:1px solid var(--border)}
.aud-kpi b{display:block;font-weight:600;font-size:clamp(28px,3.2vw,42px);line-height:1.05;letter-spacing:-.04em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.aud-kpi span{display:block;margin-top:6px;font-size:13.5px;color:var(--muted)}
.aud-kpi em{font-style:normal;font-size:11.5px;color:var(--muted);opacity:.8}
.aud-block{padding:var(--aud-gap) 0;border-bottom:1px solid var(--border)}
.aud-block:last-child{border-bottom:none}
.aud-h{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 16px;margin-bottom:18px}
.aud-h h3{font-weight:600;font-size:19px;letter-spacing:-.02em}
.aud-h p{font-size:13px;color:var(--muted)}
.aud-chart{display:block;width:100%;height:170px}
.aud-chart rect.b{fill:var(--text);opacity:.82;transition:opacity .15s,fill .15s}
.aud-chart rect.b:hover{fill:${BRAND};opacity:1}
.aud-chart text{fill:var(--muted);font:11px var(--f,system-ui)}
.aud-chart line{stroke:var(--border);stroke-width:1}
.aud-mapwrap{position:relative}
.aud-map{height:clamp(320px,52vh,540px);border-radius:var(--r-sm);overflow:hidden;background:var(--surface2);z-index:0}
:root[data-theme=dark] .aud-map{background:#1b1922}
.aud-map .maplibregl-ctrl-attrib{font:11px var(--f,system-ui);background:color-mix(in srgb,var(--surface) 85%,transparent);color:var(--muted)}
.aud-map .maplibregl-ctrl-attrib a{color:var(--text)}
.aud-map .maplibregl-ctrl-group{background:var(--surface);border-radius:10px;box-shadow:var(--shadow)}
.aud-map .maplibregl-ctrl-group button+button{border-top-color:var(--border)}
:root[data-theme=dark] .aud-map .maplibregl-ctrl-icon{filter:invert(1)}
.aud-map .maplibregl-popup-content{font:13px var(--f,system-ui);border-radius:8px;background:var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:5px 9px}
.aud-map .maplibregl-popup-tip{display:none}
.aud-map canvas:focus-visible{outline:2px solid var(--focus,#2F5BE3);outline-offset:-2px}
.aud-views{position:absolute;top:12px;right:12px;z-index:500;display:flex;gap:2px;padding:3px;border-radius:999px;background:color-mix(in srgb,var(--surface) 88%,transparent);box-shadow:var(--shadow);backdrop-filter:blur(6px)}
.aud-views .aud-chip{height:30px;font-size:13px}
.aud-info{min-height:1.5em;margin:14px 0 0;font-size:14px;color:var(--text)}
.aud-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--aud-gap)}
.aud-cols4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:28px}
.aud h4{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.aud table{width:100%;border-collapse:collapse;font-size:14px}
.aud caption{text-align:left;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding-bottom:12px}
.aud th,.aud td{text-align:left;padding:9px 0;border-bottom:1px solid var(--border);font-weight:400}
.aud thead th{font-size:12px;color:var(--muted);padding-top:0}
.aud td:last-child,.aud th:last-child{text-align:right;font-variant-numeric:tabular-nums}
.aud td.sub{color:var(--muted);font-size:13px}
.aud tfoot td,.aud tfoot th{color:var(--muted);font-size:13px;border-bottom:none}
.aud tr[data-k]{cursor:pointer}
.aud tr[data-k]:hover td{color:${BRAND}}
.aud tr.sel td{color:${BRAND};font-weight:600}
.aud-rank{list-style:none;margin:0;padding:0}
.aud-rank li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);font-size:14px}
.aud-rank li:last-child{border-bottom:none}
.aud-rank .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aud-rank .v{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
.aud-rank .v b{color:var(--text);font-weight:500;margin-right:8px}
.aud-rank .bar{grid-column:1/-1;height:3px;border-radius:2px;background:var(--surface2);margin-top:-4px;overflow:hidden}
.aud-rank .bar i{display:block;height:100%;background:var(--text);opacity:.75}
.aud-rank img{width:28px;height:28px;border-radius:7px;object-fit:cover;background:var(--surface2)}
.aud-rank .n{width:20px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.aud-games li{grid-template-columns:auto auto 1fr auto}
.aud details{font-size:13.5px;color:var(--muted);line-height:1.65}
.aud summary{cursor:pointer;color:var(--text);font-weight:500;font-size:14px;list-style:none;display:inline-flex;align-items:center;gap:8px}
.aud summary::-webkit-details-marker{display:none}
.aud summary::before{content:'+';display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--border2);font-size:13px}
.aud details[open] summary::before{content:'–'}
.aud details ul{margin:12px 0 0 1.1em;max-width:75ch}
.aud details li{margin-bottom:6px}
.aud-state{padding:56px 0;text-align:center;font-size:15px;color:var(--muted)}
.aud-state.err{color:#D2402A}
.aud-empty{font-size:13.5px;color:var(--muted);padding:8px 0}
.aud button:focus-visible,.aud select:focus-visible,.aud tr:focus-visible,.aud summary:focus-visible{outline:2px solid var(--focus,#2F5BE3);outline-offset:2px;border-radius:6px}
@media (max-width:900px){.aud-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.aud-cols4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.aud-cols,.aud-cols4{grid-template-columns:1fr}.aud-bar{align-items:flex-start}.aud-map{height:360px}}
`;

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
};
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

export function mountAudience(root, { devEndpoint } = {}) {
  if (!document.getElementById('aud-css')) document.head.append(el('style', { id: 'aud-css', textContent: STYLES }));
  const st = { range: '7d', game: 'all', sel: null, data: null, seq: 0, view: 'fr' };
  const demo = !!devEndpoint;
  let map = null;

  const seg = el('div', { className: 'aud-seg', role: 'group' });
  seg.setAttribute('aria-label', 'Période');
  const segBtns = RANGES.map(([v, t]) => {
    const b = el('button', { type: 'button', className: 'aud-chip', textContent: t });
    b.addEventListener('click', () => { if (st.range !== v) { st.range = v; st.sel = null; load(); } });
    seg.append(b); return [v, b];
  });
  const gameSel = el('select', { className: 'aud-select' }, GAMES.map(([v, t]) => el('option', { value: v, textContent: t })));
  gameSel.setAttribute('aria-label', 'Page ou jeu');
  gameSel.addEventListener('change', () => { st.game = gameSel.value; st.sel = null; load(); });
  const refresh = el('button', { type: 'button', className: 'aud-icon', innerHTML: REFRESH_ICON });
  refresh.setAttribute('aria-label', 'Actualiser');
  refresh.addEventListener('click', () => load());
  const updated = el('span');
  updated.setAttribute('aria-live', 'polite');
  const body = el('div');
  root.classList.add('aud');
  root.replaceChildren(
    demo ? el('div', { className: 'aud-demo' }, el('i'), 'Données synthétiques — démonstration locale, aucune visite réelle') : null,
    el('div', { className: 'aud-bar' }, el('div', { className: 'aud-bar-l' }, seg, gameSel), el('div', { className: 'aud-meta' }, updated, refresh)),
    body);

  async function token() {
    if (demo) return 'dev';
    await auth.authStateReady();
    if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Connexion administrateur requise.');
    return auth.currentUser.getIdToken();
  }

  async function load() {
    const my = ++st.seq;
    for (const [v, b] of segBtns) b.setAttribute('aria-pressed', String(v === st.range));
    gameSel.value = st.game;
    if (!st.data) body.replaceChildren(el('div', { className: 'aud-state', textContent: 'Chargement…' }));
    else body.style.opacity = '.5';
    try {
      const res = await fetch(`${devEndpoint || ''}/_stats/summary?range=${st.range}&game=${encodeURIComponent(st.game)}`,
        { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
      if (my !== st.seq) return;
      if (res.status === 401) throw new Error('Accès refusé : ce compte n’est pas administrateur.');
      if (res.status === 404) throw new Error('Le service de mesure n’est pas encore déployé.');
      if (!res.ok) throw new Error('Service indisponible (' + res.status + ').');
      st.data = await res.json();
      await render();
    } catch (e) {
      if (my !== st.seq) return;
      st.data = null; updated.textContent = '';
      body.replaceChildren(el('div', { className: 'aud-state err', role: 'alert', textContent: 'Statistiques indisponibles. ' + (e && e.message || '') }));
    } finally { if (my === st.seq) body.style.opacity = ''; }
  }

  const periodText = d => `${when(d.query.from, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} → ${when(d.query.to, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  const sum = d => d.rows.reduce((s, r) => s + r.n, 0) + d.other;

  function ranking(rows, other, label, total) {
    const max = Math.max(1, ...rows.map(r => r.n), other || 0);
    const li = (k, n) => el('li', {}, el('span', { className: 't', textContent: k }), el('span'),
      el('span', { className: 'v' }, el('b', { textContent: nf.format(n) }), pct(n, total)),
      el('span', { className: 'bar' }, el('i', { style: `width:${Math.max(2, Math.round(n / max * 100))}%` })));
    const items = rows.map(r => li(label(r.key), r.n));
    if (other) items.push(li(`Autres (moins de ${st.data.kMin} chacun)`, other));
    return items.length ? el('ul', { className: 'aud-rank' }, items) : el('p', { className: 'aud-empty', textContent: 'Aucune donnée.' });
  }

  function gamesList(d) {
    if (!d.pages.length) return el('p', { className: 'aud-empty', textContent: 'Aucune donnée.' });
    const max = d.pages[0].n;
    return el('ul', { className: 'aud-rank aud-games' }, d.pages.map((p, i) => el('li', {},
      el('span', { className: 'n', textContent: String(i + 1) }),
      p.key === 'home' ? el('span', { style: 'width:28px;height:28px;border-radius:7px;background:var(--surface2);display:inline-block' })
        : el('img', { src: `/games/${p.key}/cover.webp`, alt: '', decoding: 'async', width: 28, height: 28 }),
      el('span', { className: 't', textContent: GAME_NAME[p.key] || p.key }),
      el('span', { className: 'v' }, el('b', { textContent: nf.format(p.n) }), pct(p.n, d.totals.views)),
      el('span', { className: 'bar' }, el('i', { style: `width:${Math.max(2, Math.round(p.n / max * 100))}%` })))));
  }

  function chart(d) {
    const W = 1000, H = 170, padB = 22, padT = 14, n = d.series.length, max = Math.max(1, ...d.series.map(p => p.n));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aud-chart', role: 'img', preserveAspectRatio: 'none' });
    s.append(svg('line', { x1: 0, x2: W, y1: H - padB + .5, y2: H - padB + .5 }));
    const bw = W / n, hourly = d.query.granularity === 'hour';
    const label = p => hourly ? when(p.t, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : new Date(p.label + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    d.series.forEach((p, i) => {
      const h = Math.round((H - padB - padT) * p.n / max);
      const r = svg('rect', { class: 'b', x: i * bw + bw * .14, y: H - padB - h, width: bw * .72, height: Math.max(h, p.n ? 2 : 0), rx: Math.min(4, bw * .2) });
      const t = svg('title'); t.textContent = `${label(p)} : ${nf.format(p.n)} pages vues`; r.append(t); s.append(r);
    });
    const tick = (i, anchor) => { const tx = svg('text', { x: anchor === 'end' ? W - 2 : anchor === 'middle' ? (i + .5) * bw : 2, y: H - 5, 'text-anchor': anchor }); tx.textContent = label(d.series[i]); s.append(tx); };
    tick(0, 'start'); if (n > 2) tick(Math.floor(n / 2), 'middle'); tick(n - 1, 'end');
    const mx = svg('text', { x: W - 2, y: 10, 'text-anchor': 'end' }); mx.textContent = `max ${nf.format(max)}`; s.append(mx);
    s.setAttribute('aria-label', `Pages vues par ${hourly ? 'heure' : 'jour'} : total ${nf.format(d.totals.views)}, maximum ${nf.format(max)}. ${periodText(d)}.`);
    return s;
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
    root.querySelectorAll('tr.sel').forEach(r => r.classList.remove('sel'));
    const info = root.querySelector('.aud-info');
    if (!st.sel) { if (info) info.textContent = 'Survolez ou touchez une ville pour son détail ; touchez le fond de carte pour revenir à la vue d’ensemble.'; return; }
    root.querySelector(`tr[data-k="${CSS.escape(st.sel)}"]`)?.classList.add('sel');
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
    const inFrance = d.cities.rows.some(c => c.country === 'FR');
    if (!inFrance) st.view = 'world';
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
    map.addSource('cities', { type: 'geojson', data: { type: 'FeatureCollection', features: d.cities.rows.map((c, i) => ({
      type: 'Feature', id: i, properties: { key: c.key, name: c.name, n: c.n }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) } });
    const text = getComputedStyle(root).getPropertyValue('--text').trim() || '#0E1016';
    map.addLayer({ id: 'cities', type: 'circle', source: 'cities', paint: {
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 5, Math.sqrt(max), 26],
      'circle-color': BRAND,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], .9, .6],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'sel'], false], text, '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 1.5],
    } });
    map.on('mouseenter', 'cities', e => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      popup.setLngLat(f.geometry.coordinates).setText(`${f.properties.name} · ${nf.format(f.properties.n)} pages vues`).addTo(map);
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
    root.querySelectorAll('.aud-views .aud-chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (!map) return;
    if (v === 'fr') map.fitBounds(FRANCE, { padding: 24, duration: instant ? 0 : 600 });
    else map.flyTo({ center: [10, 30], zoom: 1.2, duration: instant ? 0 : 600 });
  }

  async function render() {
    const d = st.data;
    updated.textContent = `Mis à jour à ${when(d.generatedAt, { hour: '2-digit', minute: '2-digit' })}`;
    if (map) { map.remove(); map = null; }
    if (!d.totals.views) {
      body.replaceChildren(el('div', { className: 'aud-state', textContent: `Aucune page vue sur cette période (${periodText(d)}).` }));
      return;
    }
    const topGame = d.pages.find(p => p.key !== 'home');
    const cityShown = d.cities.rows.reduce((s, r) => s + r.n, 0);
    const unplaced = d.totals.views - cityShown;
    const fr = d.countries.rows.find(r => r.key === 'FR');

    const kpis = el('div', { className: 'aud-kpis' },
      el('div', { className: 'aud-kpi' }, el('b', { textContent: nf.format(d.totals.views) }), el('span', { textContent: 'Pages vues' })),
      el('div', { className: 'aud-kpi' }, el('b', { textContent: nf.format(d.totals.entries) }), el('span', {}, 'Arrivées sur le site ', el('em', { textContent: '(estimation)' }))),
      el('div', { className: 'aud-kpi' }, el('b', { textContent: fr ? pct(fr.n, d.totals.views) : '—' }), el('span', { textContent: 'Depuis la France' })),
      d.query.game === 'all'
        ? el('div', { className: 'aud-kpi' }, el('b', { textContent: topGame ? (GAME_NAME[topGame.key] || topGame.key) : '—' }), el('span', { textContent: 'Jeu le plus consulté' }))
        : el('div', { className: 'aud-kpi' }, el('b', { textContent: d.cities.rows.length ? d.cities.rows[0].name : '—' }), el('span', { textContent: 'Ville en tête pour ce jeu' })));

    // Tableau des villes : mêmes chiffres que la carte, plus la part non placée, pour retomber sur le total.
    const cityBody = el('tbody', {}, d.cities.rows.map(c => {
      const tr = el('tr', { tabIndex: 0 }, el('td', {}, c.name, ' ', el('span', { className: 'sub', textContent: c.country === 'FR' ? '' : '· ' + countryName(c.country) })), el('td', { textContent: nf.format(c.n) }));
      tr.dataset.k = c.key; return tr;
    }));
    cityBody.addEventListener('click', e => { const tr = e.target.closest('tr[data-k]'); if (tr) select(tr.dataset.k, { fly: true }); });
    cityBody.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-k]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(tr.dataset.k, { fly: true }); } });
    const cityTable = el('table', {},
      el('caption', { textContent: 'Villes' }),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', textContent: 'Ville' }), el('th', { scope: 'col', textContent: 'Pages vues' }))),
      cityBody,
      el('tfoot', {},
        unplaced ? el('tr', {}, el('td', { textContent: `Non placées (ville < ${d.kMin} vues ou inconnue)` }), el('td', { textContent: nf.format(unplaced) })) : null,
        el('tr', {}, el('th', { scope: 'row', textContent: 'Total' }), el('td', { textContent: nf.format(d.totals.views) }))));
    if (!d.cities.rows.length) cityBody.append(el('tr', {}, el('td', { className: 'sub', colSpan: 2, textContent: `Aucune ville n’atteint ${d.kMin} pages vues sur la période.` })));

    const countryTable = el('table', {},
      el('caption', { textContent: 'Pays' }),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', textContent: 'Pays' }), el('th', { scope: 'col', textContent: 'Pages vues' }))),
      el('tbody', {}, d.countries.rows.map(r => el('tr', {}, el('td', { textContent: countryName(r.key) }), el('td', { textContent: nf.format(r.n) }))),
        d.countries.other ? el('tr', {}, el('td', { className: 'sub', textContent: `Autres pays (moins de ${d.kMin} chacun)` }), el('td', { textContent: nf.format(d.countries.other) })) : null),
      el('tfoot', {}, el('tr', {}, el('th', { scope: 'row', textContent: 'Total' }), el('td', { textContent: nf.format(sum(d.countries)) }))));

    const viewBtns = el('div', { className: 'aud-views', role: 'group' }, [['fr', 'France'], ['world', 'Monde']].map(([v, t]) => {
      const b = el('button', { type: 'button', className: 'aud-chip', textContent: t }); b.dataset.v = v;
      b.addEventListener('click', () => setView(v)); return b;
    }));
    viewBtns.setAttribute('aria-label', 'Cadrage de la carte');
    const mapBox = el('div', { className: 'aud-map', role: 'region' });
    mapBox.setAttribute('aria-label', 'Carte des villes d’où viennent les pages vues. Le tableau « Villes » donne les mêmes chiffres.');
    const info = el('p', { className: 'aud-info', role: 'status' });

    body.replaceChildren(
      kpis,
      el('section', { className: 'aud-block' },
        el('div', { className: 'aud-h' }, el('h3', { textContent: 'Où sont les joueurs' }), el('p', { textContent: `Villes avec au moins ${d.kMin} pages vues · ${periodText(d)}` })),
        el('div', { className: 'aud-mapwrap' }, mapBox, viewBtns), info,
        el('div', { className: 'aud-cols', style: 'margin-top:28px' }, cityTable, countryTable)),
      el('section', { className: 'aud-block' },
        el('div', { className: 'aud-h' }, el('h3', { textContent: `Fréquentation par ${d.query.granularity === 'hour' ? 'heure' : 'jour'}` }), el('p', { textContent: `${periodText(d)} · heure de Paris` })),
        chart(d)),
      el('section', { className: 'aud-block' },
        el('div', { className: 'aud-cols' },
          el('div', {}, el('h4', { textContent: 'Jeux et pages' }), gamesList(d)),
          el('div', {}, el('h4', { textContent: 'Sources des arrivées' }), ranking(d.refs.rows, d.refs.other, k => k === 'direct' ? 'Accès direct' : k, sum(d.refs))))),
      el('section', { className: 'aud-block' },
        el('div', { className: 'aud-cols4' },
          el('div', {}, el('h4', { textContent: 'Appareils' }), ranking(d.devices.rows, d.devices.other, k => DEVICE[k] || k, sum(d.devices))),
          el('div', {}, el('h4', { textContent: 'Navigateurs' }), ranking(d.browsers.rows, d.browsers.other, k => k, sum(d.browsers))),
          el('div', {}, el('h4', { textContent: 'Systèmes' }), ranking(d.os.rows, d.os.other, k => k, sum(d.os))),
          el('div', {}, el('h4', { textContent: 'Visiteurs uniques' }), el('p', { className: 'aud-empty', textContent: 'Non disponible : aucun identifiant n’est utilisé, une page vue n’est pas une personne.' })))),
      el('section', { className: 'aud-block' },
        el('details', {}, el('summary', { textContent: 'Ce que mesurent ces chiffres' }), el('ul', {},
          el('li', { textContent: 'Pages vues : un chargement de page compté par le serveur (exact). Les robots connus, Do Not Track, Global Privacy Control et l’opposition ne sont pas comptés ; un script peut fausser les chiffres.' }),
          el('li', { textContent: 'Arrivées : pages vues venant d’un autre site ou sans référent (estimation : un rechargement compte comme une arrivée).' }),
          el('li', { textContent: 'Villes et pays : déduits de l’adresse IP par Cloudflare. Approximatif (souvent la ville du fournisseur d’accès, faux avec un VPN ou un réseau mobile). Chaque point est une ville placée à ~10 km près, jamais une personne. L’IP n’est pas conservée.' }),
          el('li', { textContent: `Groupes de moins de ${d.kMin} pages vues regroupés ; comptes conservés 13 mois. Fenêtres glissantes en heures pleines ; jours en heure de Paris (le premier et le dernier peuvent être partiels).` }),
          el('li', { textContent: 'Appareil, navigateur, système : déduits du User-Agent, catégories seulement.' })))));

    try { await drawMap(mapBox, d); select(null); }
    catch (e) { console.warn('Carte', e); if (map) { map.remove(); map = null; } mapBox.replaceChildren(el('div', { className: 'aud-state err', role: 'alert', textContent: 'Carte indisponible : le tableau « Villes » donne les mêmes chiffres.' })); }
  }

  return { load };
}
