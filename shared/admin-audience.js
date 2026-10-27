// Rubrique « Audience » du panneau admin. Données : GET /_stats/summary (Worker roulia-stats),
// protégé côté serveur par le jeton Firebase de l'admin. Rien n'est affiché qui ne vienne de ce
// point d'accès : en cas d'échec, une erreur, jamais de chiffres de remplacement.
//
// Carte : MapLibre GL (copie locale, shared/vendor/) et les fonds vectoriels d'OpenFreeMap (gratuits,
// sans clé ni compte, données OpenStreetMap). Chaque point est une VILLE (au moins 5 pages vues sur la
// période), placée sur un point représentatif arrondi à ~10 km : jamais un visiteur.
//
// Graphiques : une seule série chacun (courbe des pages vues, carte de chaleur jour × heure en une
// teinte), survol avec info-bulle, chiffres repris en tableau.
import { auth } from './firebase.js';

const RANGES = [['24h', '24 h'], ['7d', '7 j'], ['30d', '30 j'], ['90d', '90 j'], ['365d', '1 an']];
const PAGE_NAMES = { home: 'Accueil', banqueroll: 'Banqueroll', 'bataille-navale': 'Bataille Navale', 'mauvais-perdants': 'Mauvais Perdants', 'mini-golf': 'Mini Golf',
  'mini-subway': 'Mini Subway', puissance4: 'Puissance 4', 'qui-est-ce': 'Qui est-ce ?', roulette: 'Roulette', undercover: 'Undercover', uno: 'UNO', wikirace: 'WikiRace' };
const DEVICE = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' };
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
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
.aud-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:4px 0 18px}
.aud-meta{display:flex;align-items:center;gap:10px;margin-left:auto;font-size:13px;color:var(--muted)}
.aud-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;border:none;background:var(--ap-fill);color:var(--text);transition:transform .5s var(--e-out,ease)}
.aud-icon:active{transform:rotate(180deg)} .aud-icon svg{width:15px;height:15px}
.aud-demo{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;margin-bottom:12px}
.aud-demo i{width:7px;height:7px;border-radius:50%;background:#E0A800}
.aud .ap-kpis{margin-top:0}
.aud .ap-kpi .n{font-size:clamp(26px,2.6vw,36px)}
.aud-block{margin-top:26px}
.aud-h{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 16px;margin:0 4px 8px}
.aud-h h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-.02em}
.aud-h p{margin:0;font-size:12.5px;color:var(--muted)}
.aud-pad{padding:16px 18px}
.aud-plot{position:relative;height:220px;margin:6px 0 22px 34px;touch-action:pan-y}
.aud-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.aud-plot .grid{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--ap-sep)}
.aud-plot .grid span{position:absolute;right:calc(100% + 8px);top:-8px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.aud-plot .x{position:absolute;top:calc(100% + 6px);font-size:11px;color:var(--muted);white-space:nowrap;transform:translateX(-50%)}
.aud-plot .x.first{transform:none} .aud-plot .x.last{transform:translateX(-100%)}
.aud-cross{position:absolute;top:0;bottom:0;width:0;border-left:1px solid var(--text);opacity:.35;pointer-events:none}
.aud-pt{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:${BRAND};box-shadow:0 0 0 2px var(--ap-card);pointer-events:none}
.aud-tip{position:absolute;z-index:3;pointer-events:none;padding:7px 10px;border-radius:9px;background:var(--text);color:var(--bg);font-size:12.5px;line-height:1.35;white-space:nowrap;box-shadow:0 8px 20px -6px rgba(0,0,0,.35)}
.aud-tip b{font-size:14px;font-variant-numeric:tabular-nums}
.aud-heat{display:grid;grid-template-columns:38px repeat(24,minmax(0,1fr));gap:3px;position:relative}
.aud-heat span{font-size:11px;color:var(--muted);display:flex;align-items:center}
.aud-heat .hh{justify-content:center;font-variant-numeric:tabular-nums}
.aud-heat i{height:20px;border-radius:4px;background:var(--ap-fill)}
.aud-heat i:hover{outline:2px solid var(--text);outline-offset:1px}
.aud-legend{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11.5px;color:var(--muted)}
.aud-legend b{display:inline-block;width:120px;height:8px;border-radius:9px;background:linear-gradient(90deg,var(--ap-fill),${BRAND})}
.aud-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
.aud-cols3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.aud h4{margin:0 0 6px;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.aud-rank{list-style:none;margin:0;padding:0}
.aud-rank li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:4px 12px;padding:9px 0;border-bottom:1px solid var(--ap-sep);font-size:14px}
.aud-rank li:last-child{border-bottom:none}
.aud-rank .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aud-rank .v{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12.5px;white-space:nowrap}
.aud-rank .v b{color:var(--text);font-weight:600;font-size:14px;margin-right:6px}
.aud-rank .bar{grid-column:1/-1;height:4px;border-radius:4px;background:var(--ap-fill);overflow:hidden}
.aud-rank .bar i{display:block;height:100%;border-radius:4px;background:var(--text);opacity:.72}
.aud-rank img,.aud-rank .home{width:26px;height:34px;border-radius:6px;object-fit:cover;background:var(--ap-fill)}
.aud-rank .tr{font-size:11.5px;font-weight:600;margin-left:6px}
.aud-rank .tr.up{color:var(--ap-green)} .aud-rank .tr.down{color:var(--ap-red)}
.aud-mapwrap{position:relative}
.aud-map{height:clamp(320px,50vh,520px);border-radius:14px;overflow:hidden;background:var(--ap-fill);z-index:0}
.aud-map .maplibregl-ctrl-attrib{font:11px var(--f,system-ui);background:color-mix(in srgb,var(--surface) 85%,transparent);color:var(--muted)}
.aud-map .maplibregl-ctrl-attrib a{color:var(--text)}
.aud-map .maplibregl-ctrl-group{background:var(--surface);border-radius:10px;box-shadow:var(--shadow)}
.aud-map .maplibregl-ctrl-group button+button{border-top-color:var(--border)}
:root[data-theme=dark] .aud-map .maplibregl-ctrl-icon{filter:invert(1)}
.aud-map .maplibregl-popup-content{font:13px var(--f,system-ui);border-radius:8px;background:var(--accent);color:var(--on-accent);box-shadow:var(--shadow);padding:5px 9px}
.aud-map .maplibregl-popup-tip{display:none}
.aud-views{position:absolute;top:12px;right:12px;z-index:500}
.aud-info{min-height:1.5em;margin:12px 4px 0;font-size:13.5px}
.aud table{width:100%;border-collapse:collapse;font-size:14px}
.aud caption{text-align:left;font-size:12px;font-weight:600;color:var(--muted);padding-bottom:6px}
.aud th,.aud td{text-align:left;padding:8px 0;border-bottom:1px solid var(--ap-sep);font-weight:400}
.aud thead th{font-size:12px;color:var(--muted)}
.aud td:last-child,.aud th:last-child{text-align:right;font-variant-numeric:tabular-nums}
.aud td.sub,.aud .sub{color:var(--muted);font-size:13px}
.aud tfoot td,.aud tfoot th{color:var(--muted);font-size:13px;border-bottom:none}
.aud tr[data-k]{cursor:pointer}
.aud tr[data-k]:hover td{color:${BRAND}}
.aud tr.sel td{color:${BRAND};font-weight:600}
.aud details{font-size:13px;color:var(--muted);line-height:1.6}
.aud summary{cursor:pointer;color:var(--text);font-weight:500;font-size:14px}
.aud details ul{margin:10px 0 0 1.1em;max-width:75ch}
.aud details li{margin-bottom:5px}
.aud-state{padding:56px 0;text-align:center;font-size:15px;color:var(--muted)}
.aud-state.err{color:var(--ap-red)}
.aud-empty{font-size:13.5px;color:var(--muted);padding:8px 0}
.aud tr:focus-visible{outline:2px solid var(--focus,#2F5BE3);outline-offset:2px}
@media (max-width:1000px){.aud-cols3{grid-template-columns:1fr}}
@media (max-width:760px){.aud-cols{grid-template-columns:1fr}.aud-map{height:340px}.aud-meta{margin-left:0}.aud-heat{grid-template-columns:30px repeat(24,minmax(0,1fr));gap:2px}.aud-heat .hh:nth-child(odd){visibility:hidden}}
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
  return { cls: v >= 0 ? 'up' : 'down', txt: `${v >= 0 ? '▲' : '▼'} ${Math.abs(v)} %` };
}

export function mountAudience(root, { devEndpoint } = {}) {
  if (!document.getElementById('aud-css')) document.head.append(el('style', { id: 'aud-css', textContent: STYLES }));
  const st = { range: '7d', game: 'all', sel: null, data: null, seq: 0, view: 'fr' };
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
    [['all', 'Tout le site'], ['home', 'Accueil'], ...Object.entries(PAGE_NAMES).filter(([k]) => k !== 'home').sort((a, b) => a[1].localeCompare(b[1], 'fr'))]
      .map(([v, t]) => el('option', { value: v, textContent: t })));
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
    el('div', { className: 'aud-bar' }, seg, gameSel, el('div', { className: 'aud-meta' }, updated, refresh)),
    body);

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
    else body.style.opacity = '.5';
    try {
      const res = await fetch(`${devEndpoint || ''}/_stats/summary?range=${st.range}&game=${encodeURIComponent(st.game)}`,
        { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
      if (my !== st.seq) return;
      if (res.status === 401) throw new Error('Accès refusé.');
      if (res.status === 404) throw new Error('Le service de mesure n’est pas encore déployé.');
      if (res.status === 400) throw new Error('Cette période ou ce jeu demande la nouvelle version du service de mesure (edge-stats/dist/worker.bundle.js à publier).');
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
    return el('ul', { className: 'aud-rank' }, d.pages.map(p => {
      const tr = 'prev' in p ? trend(p.n, p.prev) : null;
      return el('li', { style: 'grid-template-columns:auto 1fr auto' },
        p.key === 'home' ? el('span', { className: 'home' }) : el('img', { src: `/games/${p.key}/cover.webp`, alt: '', decoding: 'async', width: 26, height: 34 }),
        el('span', { className: 't' }, PAGE_NAMES[p.key] || p.key, tr ? el('span', { className: 'tr ' + tr.cls, textContent: tr.txt }) : null),
        el('span', { className: 'v' }, el('b', { textContent: nf.format(p.n) }), pct(p.n, d.totals.views)),
        el('span', { className: 'bar' }, el('i', { style: `width:${Math.max(2, Math.round(p.n / max * 100))}%` })));
    }));
  }

  // Courbe des pages vues : aire + trait de 2 px, axe discret, réticule et info-bulle au survol.
  function chart(d) {
    const pts = d.series, n = pts.length, max = Math.max(1, ...pts.map(p => p.n));
    const hourly = d.query.granularity === 'hour';
    const label = p => hourly ? when(p.t, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : new Date(p.label + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const nice = (() => { const e = 10 ** Math.floor(Math.log10(max)), f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; })();
    const X = i => n === 1 ? 50 : i / (n - 1) * 100, Y = v => 100 - v / nice * 100;
    const box = el('div', { className: 'aud-plot', role: 'img' });
    box.setAttribute('aria-label', `Pages vues par ${hourly ? 'heure' : 'jour'} : total ${nf.format(d.totals.views)}, maximum ${nf.format(max)}. ${periodText(d)}. Le détail est dans le tableau des jeux.`);
    [0, nice / 2, nice].forEach(v => { const g = el('div', { className: 'grid', style: `top:${Y(v)}%` }, el('span', { textContent: nf.format(v) })); box.append(g); });
    const s = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const id = 'aud-g' + Math.random().toString(36).slice(2, 7);
    const defs = svg('defs'), lg = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(svg('stop', { offset: 0, 'stop-color': BRAND, 'stop-opacity': .28 }), svg('stop', { offset: 1, 'stop-color': BRAND, 'stop-opacity': 0 }));
    defs.append(lg); s.append(defs);
    const line = pts.map((p, i) => `${X(i)},${Y(p.n)}`).join(' ');
    s.append(svg('polygon', { points: `0,100 ${line} 100,100`, fill: `url(#${id})` }));
    s.append(svg('polyline', { points: line, fill: 'none', stroke: BRAND, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    box.append(s);
    const ticks = n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
    [...new Set(ticks)].forEach((i, k, a) => box.append(el('span', { className: 'x' + (k === 0 ? ' first' : k === a.length - 1 ? ' last' : ''), style: `left:${X(i)}%`, textContent: label(pts[i]) })));
    const cross = el('div', { className: 'aud-cross' }), pt = el('div', { className: 'aud-pt' }), tip = el('div', { className: 'aud-tip' });
    [cross, pt, tip].forEach(x => { x.hidden = true; box.append(x); });
    const show = e => {
      const r = box.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / r.width * (n - 1))));
      const p = pts[i], x = X(i) / 100 * r.width, y = Y(p.n) / 100 * r.height;
      cross.hidden = pt.hidden = tip.hidden = false;
      cross.style.left = x + 'px'; pt.style.left = x + 'px'; pt.style.top = y + 'px';
      tip.innerHTML = `<b>${nf.format(p.n)}</b> page${p.n > 1 ? 's' : ''} vue${p.n > 1 ? 's' : ''}<br>${label(p)}`;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(r.width - tw, x - tw / 2)) + 'px'; tip.style.top = Math.max(-46, y - 58) + 'px';
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
    for (let h = 0; h < 24; h++) g.append(el('span', { className: 'hh', textContent: h % 3 ? '' : String(h) }));
    const tip = el('div', { className: 'aud-tip' }); tip.hidden = true;
    d.heat.forEach((row, di) => {
      g.append(el('span', { textContent: DAYS[di].slice(0, 3) + '.' }));
      row.forEach((v, h) => {
        const c = el('i');
        const k = v ? .1 + .9 * (v / max) ** 1.3 : 0;
        if (v) c.style.background = `color-mix(in srgb, ${BRAND} ${Math.round(k * 100)}%, var(--ap-fill))`;
        c.dataset.t = `${DAYS[di]} ${h} h – ${h + 1} h : ${nf.format(v)} page${v > 1 ? 's' : ''} vue${v > 1 ? 's' : ''}`;
        c.setAttribute('aria-label', c.dataset.t);
        g.append(c);
      });
    });
    g.append(tip);
    g.addEventListener('pointerover', e => {
      const c = e.target.closest('i'); if (!c) return;
      tip.hidden = false; tip.textContent = c.dataset.t;
      const gr = g.getBoundingClientRect(), cr = c.getBoundingClientRect(), tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(gr.width - tw, cr.left - gr.left + cr.width / 2 - tw / 2)) + 'px';
      tip.style.top = (cr.top - gr.top - 38) + 'px';
    });
    g.addEventListener('pointerleave', () => { tip.hidden = true; });
    return g;
  }

  function peak(d) {
    if (!d.heat) return null;
    let best = null;
    d.heat.forEach((row, di) => row.forEach((v, h) => { if (v && (!best || v > best.v)) best = { v, di, h }; }));
    return best;
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
    root.querySelectorAll('.aud-views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
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
    const cityShown = d.cities.rows.reduce((s, r) => s + r.n, 0);
    const unplaced = d.totals.views - cityShown;
    const fr = d.countries.rows.find(r => r.key === 'FR');
    const prev = d.previous;
    const days = d.query.granularity === 'hour' ? null : d.series.length;
    const top = peak(d);

    const kpi = (label, value, tr, sub) => el('div', { className: 'ap-kpi' },
      el('span', { className: 'k', textContent: label }), el('span', { className: 'n', textContent: value }),
      el('span', { className: 's' }, tr ? el('span', { className: 'ap-delta ' + tr.cls, textContent: tr.txt + ' ' }) : null, sub || ''));
    const vsPrev = prev ? 'vs la période d’avant' : '';
    const kpis = el('div', { className: 'ap-kpis' },
      kpi('Pages vues', nf.format(d.totals.views), prev && trend(d.totals.views, prev.views), vsPrev),
      kpi('Arrivées sur le site', nf.format(d.totals.entries), prev && trend(d.totals.entries, prev.entries), prev ? vsPrev : 'estimation'),
      days ? kpi('Moyenne par jour', nf.format(Math.round(d.totals.views / days)), null, `sur ${days} jours, aujourd’hui compris`)
        : kpi('Depuis la France', fr ? pct(fr.n, d.totals.views) : '—', null, 'des pages vues'),
      top ? kpi('Moment le plus fréquenté', `${DAYS[top.di].slice(0, 3)}. ${top.h} h`, null, `${nf.format(top.v)} pages vues sur ce créneau`)
        : kpi('Depuis la France', fr ? pct(fr.n, d.totals.views) : '—', null, 'des pages vues'));

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

    const viewBtns = el('div', { className: 'aud-views ap-seg', role: 'group' }, [['fr', 'France'], ['world', 'Monde']].map(([v, t]) => {
      const b = el('button', { type: 'button', textContent: t }); b.dataset.v = v;
      b.addEventListener('click', () => setView(v)); return b;
    }));
    viewBtns.setAttribute('aria-label', 'Cadrage de la carte');
    const mapBox = el('div', { className: 'aud-map', role: 'region' });
    mapBox.setAttribute('aria-label', 'Carte des villes d’où viennent les pages vues. Le tableau « Villes » donne les mêmes chiffres.');
    const info = el('p', { className: 'aud-info', role: 'status' });
    const block = (title, sub, ...kids) => el('section', { className: 'aud-block' },
      el('div', { className: 'aud-h' }, el('h3', { textContent: title }), sub ? el('p', { textContent: sub }) : null), ...kids);
    const card = (...kids) => el('div', { className: 'ap-card aud-pad' }, ...kids);

    body.replaceChildren(...[
      kpis,
      !d.heat ? html('div', 'ap-note', '<div><b>Service de mesure à mettre à jour.</b> Tendances, carte de chaleur, 90 jours, 1 an et Mauvais Perdants arrivent avec la nouvelle version (edge-stats/dist/worker.bundle.js).</div>') : null,
      block(`Fréquentation par ${d.query.granularity === 'hour' ? 'heure' : 'jour'}`, `${periodText(d)} · heure de Paris`, card(chart(d))),
      d.heat ? block('Quand viennent-ils', 'Pages vues par jour de la semaine et heure de Paris, sur la période', card(heatmap(d), el('div', { className: 'aud-legend' }, 'moins', el('b'), 'plus'))) : null,
      el('div', { className: 'aud-cols' },
        block('Jeux et pages', prev ? 'Évolution vs la période d’avant' : '', card(gamesList(d))),
        block('Sources des arrivées', 'Site d’où viennent les visiteurs', card(ranking(d.refs.rows, d.refs.other, k => k === 'direct' ? 'Accès direct' : k, sum(d.refs))))),
      block('Où sont les joueurs', `Villes avec au moins ${d.kMin} pages vues`,
        el('div', { className: 'aud-mapwrap' }, mapBox, viewBtns), info,
        el('div', { className: 'aud-cols', style: 'margin-top:18px' }, card(cityTable), card(countryTable))),
      block('Appareils', '',
        el('div', { className: 'aud-cols3' },
          card(el('h4', { textContent: 'Type d’appareil' }), ranking(d.devices.rows, d.devices.other, k => DEVICE[k] || k, sum(d.devices))),
          card(el('h4', { textContent: 'Navigateur' }), ranking(d.browsers.rows, d.browsers.other, k => k, sum(d.browsers))),
          card(el('h4', { textContent: 'Système' }), ranking(d.os.rows, d.os.other, k => k, sum(d.os))))),
      el('section', { className: 'aud-block' }, card(
        el('details', {}, el('summary', { textContent: 'Ce que mesurent ces chiffres' }), el('ul', {},
          el('li', { textContent: 'Pages vues : un chargement de page compté par le serveur (exact). Les robots connus, Do Not Track, Global Privacy Control et l’opposition ne sont pas comptés.' }),
          el('li', { textContent: 'Arrivées : pages vues venant d’un autre site ou sans référent (estimation : un rechargement compte comme une arrivée).' }),
          el('li', { textContent: 'Aucun visiteur unique : aucun identifiant n’est utilisé, une page vue n’est pas une personne. Les joueurs présents en ce moment sont dans « En direct ».' }),
          el('li', { textContent: 'Tendances : comparées à la période de même durée juste avant (même nombre d’heures).' }),
          el('li', { textContent: 'Villes et pays : déduits de l’adresse IP par Cloudflare. Approximatif (souvent la ville du fournisseur d’accès, faux avec un VPN ou un réseau mobile). Chaque point est une ville placée à ~10 km près, jamais une personne. L’IP n’est pas conservée.' }),
          el('li', { textContent: `Groupes de moins de ${d.kMin} pages vues regroupés ; comptes conservés 13 mois. 24 h : heures glissantes ; autres périodes : jours de Paris, aujourd’hui compris (en cours).` }),
          el('li', { textContent: 'Appareil, navigateur, système : déduits du User-Agent, catégories seulement.' })))))].filter(Boolean));

    try { await drawMap(mapBox, d); select(null); }
    catch (e) { console.warn('Carte', e); if (map) { map.remove(); map = null; } mapBox.replaceChildren(el('div', { className: 'aud-state err', role: 'alert', textContent: 'Carte indisponible : le tableau « Villes » donne les mêmes chiffres.' })); }
  }

  return { load };
}
