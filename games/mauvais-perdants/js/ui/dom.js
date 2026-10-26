// Fabrique d'éléments SÛRE : le texte passe toujours par textContent. Aucune donnée
// de joueur (pseudo, réponse) ni réplique d'IA n'est jamais interprétée comme du HTML.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([prop, val]) => (prop.startsWith('--') ? el.style.setProperty(prop, val) : (el.style[prop] = val)));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const PCOLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)'];
export const chip = c => h('span', { class: 'chip', style: { '--pc': PCOLORS[(Number(c) || 0) % 8] } });
// Dessin vectoriel STATIQUE (emblèmes, couronne) : jamais de donnée de joueur ici.
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}
export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
