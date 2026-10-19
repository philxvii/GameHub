// Journal de l'administration : chaque action de l'admin, conservée en entier dans adminLog/
// (règles : lecture admin seule, ajout seulement, heure fixée par le serveur). Affichage par jour,
// filtres par catégorie, recherche, chargement par pages de 100.
import { ref, push, set, get, query, orderByKey, limitToLast, endBefore, onValue, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db, auth } from './firebase.js';

export const CATS = { connexion: 'Connexion', jeu: 'Jeux', reglage: 'Réglages', partie: 'Parties', joueur: 'Joueurs', stats: 'Statistiques', global: 'Global' };
const PAGE = 100;
const clip = (v, n) => String(v ?? '').replace(/</g, '‹').slice(0, n);

// Écrit une entrée. Ne bloque jamais l'action de l'admin : un échec est seulement signalé en console.
export async function logAdmin(cat, msg, target = '') {
  try {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid || !CATS[cat]) return;
    await set(push(ref(db, 'adminLog')), { ts: serverTimestamp(), cat, msg: clip(msg, 300), target: clip(target, 60), by: uid });
  } catch (e) { console.warn('Journal admin : entrée non enregistrée', e && e.code); }
}

const STYLES = `
.jr-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;margin-bottom:28px}
.jr-cats{display:flex;flex-wrap:wrap;gap:2px}
.jr-chip{height:34px;padding:0 13px;border-radius:999px;border:none;background:transparent;font:inherit;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;transition:color .2s,background-color .2s}
.jr-chip:hover{color:var(--text)}
.jr-chip[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}
.jr-search{height:36px;width:min(260px,100%);padding:0 14px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text);font:inherit;font-size:14px;outline:none}
.jr-search:focus{border-color:var(--text)}
.jr-count{font-size:13px;color:var(--muted);margin-bottom:8px}
.jr-day{margin-top:30px}
.jr-day h3{position:sticky;top:68px;z-index:1;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:8px 0;background:var(--bg)}
.jr-item{display:grid;grid-template-columns:56px 112px 1fr;gap:16px;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--border);font-size:14.5px}
.jr-item:last-child{border-bottom:none}
.jr-time{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.jr-cat{justify-self:start;font-size:12px;font-weight:600;color:var(--muted);border:1px solid var(--border2);border-radius:999px;padding:2px 9px;white-space:nowrap}
.jr-cat[data-c=connexion]{color:#2EB872;border-color:color-mix(in srgb,#2EB872 40%,transparent)}
.jr-cat[data-c=global],.jr-cat[data-c=joueur]{color:#D2402A;border-color:color-mix(in srgb,#D2402A 40%,transparent)}
.jr-msg span{color:var(--muted);font-size:13px;margin-left:6px}
.jr-more{margin-top:24px}
.jr-empty{font-size:14px;color:var(--muted);padding:12px 0}
.jr-old{margin-top:48px;font-size:14px;color:var(--muted)}
.jr-old summary{cursor:pointer;color:var(--text);font-weight:500}
@media (max-width:640px){.jr-item{grid-template-columns:48px 1fr;}.jr-item .jr-msg{grid-column:1/-1}.jr-day h3{top:60px}}
`;

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
};
const dayKey = ts => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
const dayLabel = ts => {
  const k = dayKey(ts), today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5);
  if (k === today) return 'Aujourd’hui';
  if (k === yest) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
};
const hm = ts => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(ts);

export function mountJournal(root) {
  if (!document.getElementById('jr-css')) document.head.append(el('style', { id: 'jr-css', textContent: STYLES }));
  const st = { live: new Map(), older: new Map(), cat: 'all', q: '', oldestKey: null, exhausted: false, off: null };

  const cats = el('div', { className: 'jr-cats', role: 'group' }, [['all', 'Tout'], ...Object.entries(CATS)].map(([k, t]) => {
    const b = el('button', { type: 'button', className: 'jr-chip', textContent: t });
    b.dataset.c = k; b.setAttribute('aria-pressed', String(k === 'all'));
    b.addEventListener('click', () => { st.cat = k; cats.querySelectorAll('.jr-chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
    return b;
  }));
  cats.setAttribute('aria-label', 'Filtrer par catégorie');
  const search = el('input', { type: 'search', className: 'jr-search', placeholder: 'Rechercher…' });
  search.setAttribute('aria-label', 'Rechercher dans le journal');
  search.addEventListener('input', () => { st.q = search.value.trim().toLowerCase(); draw(); });
  const count = el('p', { className: 'jr-count' });
  count.setAttribute('aria-live', 'polite');
  const list = el('div');
  const more = el('button', { type: 'button', className: 'btn-admin jr-more', textContent: 'Afficher les entrées plus anciennes' });
  more.addEventListener('click', loadMore);
  const old = el('details', { className: 'jr-old' });
  root.replaceChildren(el('div', { className: 'jr-bar' }, cats, search), count, list, more, old);

  function entries() {
    const all = new Map([...st.older, ...st.live]);
    return [...all.entries()].map(([k, v]) => ({ k, ...v })).filter(e => typeof e.ts === 'number').sort((a, b) => b.ts - a.ts || (a.k < b.k ? 1 : -1));
  }

  function draw() {
    const rows = entries().filter(e => (st.cat === 'all' || e.cat === st.cat) &&
      (!st.q || `${e.msg} ${e.target || ''} ${CATS[e.cat] || ''}`.toLowerCase().includes(st.q)));
    count.textContent = `${rows.length} entrée${rows.length > 1 ? 's' : ''}${st.cat !== 'all' || st.q ? ' (filtrées)' : ''}${st.exhausted ? '' : ' chargées'}`;
    more.hidden = st.exhausted;
    if (!rows.length) { list.replaceChildren(el('p', { className: 'jr-empty', textContent: st.live.size ? 'Aucune entrée ne correspond.' : 'Le journal est vide : les prochaines actions s’afficheront ici.' })); return; }
    const days = new Map();
    for (const e of rows) { const k = dayKey(e.ts); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
    list.replaceChildren(...[...days.values()].map(items => el('section', { className: 'jr-day' },
      el('h3', { textContent: dayLabel(items[0].ts) }),
      items.map(e => el('div', { className: 'jr-item' },
        el('time', { className: 'jr-time', dateTime: new Date(e.ts).toISOString(), textContent: hm(e.ts) }),
        (b => { b.dataset.c = e.cat; return b; })(el('span', { className: 'jr-cat', textContent: CATS[e.cat] || e.cat })),
        el('span', { className: 'jr-msg' }, e.msg, e.target ? el('span', { textContent: e.target }) : null))))));
  }

  async function loadMore() {
    if (!st.oldestKey) return;
    more.disabled = true;
    try {
      const snap = await get(query(ref(db, 'adminLog'), orderByKey(), endBefore(st.oldestKey), limitToLast(PAGE)));
      const got = Object.entries(snap.val() || {});
      for (const [k, v] of got) st.older.set(k, v);
      if (got.length) st.oldestKey = got[0][0];
      if (got.length < PAGE) st.exhausted = true;
      draw();
    } catch (e) { count.textContent = 'Lecture impossible : ' + (e && e.code || e); }
    more.disabled = false;
  }

  function start() {
    if (st.off) return;
    list.replaceChildren(el('p', { className: 'jr-empty', textContent: 'Chargement…' }));
    st.off = onValue(query(ref(db, 'adminLog'), orderByKey(), limitToLast(PAGE)), snap => {
      st.live = new Map(Object.entries(snap.val() || {}));
      const keys = [...st.live.keys()].sort();
      if (!st.older.size) { st.oldestKey = keys[0] || null; st.exhausted = keys.length < PAGE; }
      draw();
    }, e => { list.replaceChildren(el('p', { className: 'jr-empty', textContent: 'Lecture du journal refusée (' + (e && e.code || e) + ').' })); st.off = null; });
    // Ancien journal (20 entrées max, avant ce journal complet) : consultable, plus jamais écrit.
    get(ref(db, 'hub/updateLog')).then(snap => {
      const items = Object.values(snap.val() || {}).filter(Boolean).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (!items.length) { old.hidden = true; return; }
      old.replaceChildren(el('summary', { textContent: `Ancien journal (${items.length} entrées, avant le journal complet)` }),
        ...items.map(l => el('div', { className: 'jr-item' }, el('span', { className: 'jr-time', textContent: '' }),
          el('span', { className: 'jr-time', textContent: String(l.datetime || '') }),
          el('span', { className: 'jr-msg' }, String(l.change || ''), el('span', { textContent: String(l.game || '') })))));
    }).catch(() => { old.hidden = true; });
  }

  return { start };
}
