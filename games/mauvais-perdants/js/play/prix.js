// L'Étiquette : le même produit pour tout le monde, au même instant (heure du serveur).
// 12 s pour écrire son prix (ce qui est tapé compte, même sans valider), puis l'étiquette
// rouge tombe avec le vrai prix et ton écart. Cinq produits, puis l'envoi.

import { h } from '../ui/dom.js';
import { parsePrice, slotAt, euros, errorOf, ITEMS_PER_ROUND } from '../rounds/prix.js';

const NOTED = ['C’est noté. On ne juge pas. Pas encore.', 'Enregistré. Le marché appréciera.', 'Noté. Courageux.', 'Vu. La régie retient son souffle.'];
const verdictOf = pct => (pct <= 5 ? 'Dans le mille.' : pct <= 15 ? 'Pas loin du tout.' : pct <= 35 ? 'Correct, sans plus.' : pct <= 80 ? 'Tu fais tes courses de temps en temps ?' : 'Tu ne fais jamais tes courses.');

export default function mount(root, { p, now, startAt, submit, progress }) {
  const answers = Array(ITEMS_PER_ROUND).fill(0);
  let shown = -1, revealed = -1, alive = true, sent = false;
  const idx = h('b');
  const left = h('b');
  const photo = h('img', { class: 'pc-photo', alt: '', decoding: 'async' });
  photo.addEventListener('error', () => { photo.hidden = true; card.classList.add('no-photo'); });
  photo.addEventListener('load', () => { photo.hidden = false; card.classList.remove('no-photo'); });
  const brand = h('div', { class: 'pc-brand' }), name = h('div', { class: 'pc-name' }), qty = h('div', { class: 'pc-qty' });
  const tag = h('div', { class: 'pc-price', 'aria-live': 'polite' });
  const card = h('div', { class: 'price-card' }, h('div', { class: 'pc-media' }, photo), h('div', { class: 'pc-text' }, brand, name, qty), tag);
  const input = h('input', { class: 'inp', inputmode: 'decimal', autocomplete: 'off', maxlength: '10', placeholder: '0,00 €', 'aria-label': 'Prix en euros' });
  const btn = h('button', { class: 'btn btn-main', type: 'button', text: 'Valider' });
  const fb = h('div', { class: 'feedback' });
  root.append(h('div', { class: 'play-head' }, h('span', {}, 'Produit ', idx), h('span', {}, 'Réponse dans ', left)), card, fb, h('div', { class: 'answer-row' }, input, btn));

  const lock = on => { input.disabled = on; btn.disabled = on; };
  function show(k) {
    const it = p.items[k];
    shown = k;
    idx.textContent = `${k + 1} / ${ITEMS_PER_ROUND}`;
    brand.textContent = it.brand; name.textContent = it.name; qty.textContent = it.qty;
    photo.hidden = false; card.classList.remove('no-photo', 'revealed');
    photo.src = `img/prix/${it.code}.jpg`;
    tag.textContent = '';
    fb.className = 'feedback'; fb.textContent = '';
    input.value = ''; lock(false);
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    setTimeout(() => { if (alive && !input.disabled) input.focus(); }, 60);
  }
  function take() {
    const v = parsePrice(input.value);
    if (v !== null) answers[shown] = v;
    return v;
  }
  function validate() {
    if (!alive || input.disabled) return;
    const v = take();
    if (v === null) { fb.className = 'feedback ko'; fb.textContent = 'Un prix en euros, par exemple 2 ou 3,50'; return; }
    lock(true);
    progress(answers.filter(x => x > 0).length);
    fb.className = 'feedback'; fb.textContent = `${euros(v)} · ${NOTED[shown % NOTED.length]}`;
  }
  function reveal(k) {
    revealed = k;
    if (!input.disabled) { take(); lock(true); progress(answers.filter(x => x > 0).length); }
    const it = p.items[k], g = answers[k];
    tag.textContent = euros(it.price);
    card.classList.add('revealed');
    if (g > 0) {
      const pct = Math.round((Math.exp(errorOf(g, it.price)) - 1) * 100);
      fb.className = 'feedback'; fb.textContent = `Toi : ${euros(g)} · écart ${pct} %. ${verdictOf(pct)}`;
    } else { fb.className = 'feedback ko'; fb.textContent = 'Pas de réponse. Le silence coûte cher.'; }
  }
  const tick = () => {
    if (!alive) return;
    const s = slotAt(now() - startAt);
    if (s.done) {
      if (!sent) { sent = true; alive = false; clearInterval(timer); submit({ a: answers }); }
      return;
    }
    if (s.k !== shown) show(s.k);
    left.textContent = s.reveal ? '—' : `${s.left} s`;
    if (s.reveal && revealed !== s.k) reveal(s.k);
  };
  btn.addEventListener('click', validate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
  const timer = setInterval(tick, 100);
  tick();
  return { partial: () => ({ a: answers }), destroy() { alive = false; clearInterval(timer); } };
}
