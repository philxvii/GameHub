// Chat de salon : texte libre (140 caractères), collé à droite de l'écran au salon et pendant
// l'émission (ordinateur) ; en bulle sur téléphone. Les messages sont dans mp/<code>/chat
// (écrits une fois, jamais modifiés). Le nom affiché est celui de la fiche du joueur, jamais un
// texte fourni avec le message. Filtre de gros mots à l'AFFICHAGE (la base ne filtre que les
// balises), limite d'envoi côté client, et chacun peut masquer le chat.

import { h, $, svg } from './ui/dom.js';
import { fold } from './text.js';

const MAX = 140, GAP_MS = 1500, BURST = 5, BURST_MS = 10000;
// Racines de mots grossiers ; comparées sans accent, sans casse, sans ponctuation.
const BAD = ['connard', 'connasse', 'salope', 'pute', 'enculé', 'encule', 'pd', 'fdp', 'ntm', 'nique', 'merde', 'batard', 'bâtard', 'putain', 'bite', 'couille', 'tg', 'ferme ta gueule', 'negre', 'nègre', 'bougnoule', 'youpin', 'tapette', 'suicide'];
const ROOTS = BAD.map(w => fold(w).replace(/[^a-z ]/g, '')).filter(Boolean);
const bad = w => { const f = fold(w).replace(/[^a-z]/g, ''); return ROOTS.some(r => f === r.replace(/ /g, '') || (r.length >= 5 && f.includes(r.replace(/ /g, '')))); };
export const mask = text => String(text).replace(/\s+/g, ' ').trim().split(' ').map(w => (bad(w) ? '•'.repeat(Math.max(3, w.length)) : w)).join(' ');

let room = null, off = null, timer = null, open = false, unread = 0, seenTs = 0, sent = [], wide = null;
let tab, badge, panel, list, input, hint, mutedBtn;
const store = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
let muted = store.get('mp-chat-muted') === '1';
const desktop = () => typeof matchMedia === 'function' && matchMedia('(min-width: 961px)').matches;
// Icône propre au jeu : une bulle de dialogue avec le « 7 » de Canal 7 (dessin vectoriel, aucune donnée de joueur).
const bubble = (px = 30) => svg(`<svg class="chat-ico" width="${px}" height="${px}" viewBox="0 0 30 30" aria-hidden="true" focusable="false"><path d="M8 4h14a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-7l-7 5.5V20H8a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill="#e9b23a" stroke="#1d140e" stroke-width="2.2" stroke-linejoin="round"/><path d="M10.5 9.5h9l-5 7.5" fill="none" stroke="#1d140e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
const pcol = c => `var(--p${(Number(c) || 0) % 8})`;
const clock = ts => { const d = new Date(ts || Date.now()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function build() {
  if (tab) return;
  badge = h('i', { class: 'chat-badge', hidden: true });
  tab = h('button', { class: 'chat-tab', id: 'chat-tab', type: 'button', 'aria-label': 'Ouvrir le chat', hidden: true }, h('span', { class: 'ic', 'aria-hidden': 'true' }, bubble(30)), h('span', { class: 'lb', text: 'Chat' }), badge);
  list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
  input = h('input', { class: 'chat-in', type: 'text', maxlength: String(MAX), autocomplete: 'off', placeholder: 'Écris un message…', 'aria-label': 'Message' });
  hint = h('div', { class: 'chat-hint' });
  const send = h('button', { class: 'chat-send', type: 'button', 'aria-label': 'Envoyer' }, h('span', { text: 'Envoyer' }), h('b', { 'aria-hidden': 'true', text: '➤' }));
  mutedBtn = h('button', { class: 'chat-mute', type: 'button' });
  const close = h('button', { class: 'chat-x', type: 'button', 'aria-label': 'Réduire le chat', text: '›' });
  panel = h('aside', { class: 'chat-panel', id: 'chat', role: 'complementary', 'aria-label': 'Chat du salon', hidden: true },
    h('div', { class: 'chat-head' }, h('div', {}, h('small', { text: 'Canal 7 · en direct' }), h('b', { text: 'Le chat du plateau' })), close),
    list, hint,
    h('div', { class: 'chat-row' }, input, send),
    h('div', { class: 'chat-foot' }, mutedBtn, h('span', { class: 'chat-count', id: 'chat-count', text: `0/${MAX}` })));
  document.body.append(panel, tab);
  tab.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  mutedBtn.addEventListener('click', () => { muted = !muted; store.set('mp-chat-muted', muted ? '1' : '0'); paint(); });
  send.addEventListener('click', submit);
  input.addEventListener('input', () => { $('#chat-count').textContent = `${input.value.length}/${MAX}`; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } e.stopPropagation(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open && !desktop()) toggle(false); });
}

function toggle(on) {
  open = on;
  store.set('mp-chat-open', on ? '1' : '0');
  layout();
  if (on) { paint(); list.scrollTop = list.scrollHeight; }
}

// Ordinateur : le chat est collé à droite et le jeu se décale ; téléphone : bulle par-dessus.
function layout() {
  const inRoom = !!room && $('#app').dataset.screen !== 'home';
  panel.hidden = !(inRoom && open);
  tab.hidden = !inRoom || open;
  document.documentElement.classList.toggle('chat-dock', inRoom && open && desktop());
  document.documentElement.classList.toggle('chat-sheet', inRoom && open && !desktop());
}

async function submit() {
  const text = input.value.replace(/\s+/g, ' ').trim();
  if (!text || !room) return;
  const now = Date.now();
  sent = sent.filter(t => now - t < BURST_MS);
  if (sent.length && now - sent[sent.length - 1] < GAP_MS) return say('Doucement : un message à la fois.');
  if (sent.length >= BURST) return say('Trop de messages : attends quelques secondes.');
  sent.push(now);
  input.value = ''; $('#chat-count').textContent = `0/${MAX}`;
  try { await room.chatSend(text.slice(0, MAX)); say(''); } catch (_) { say('Message refusé. Réessaie.'); }
}
const say = t => { if (hint) hint.textContent = t; };

function paint() {
  if (!tab) return;
  const chat = room ? room.s.chat || {} : {};
  const msgs = Object.entries(chat).map(([id, c]) => ({ id, ...c })).filter(c => c && typeof c.t === 'string').sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const players = room ? room.s.players || {} : {};
  mutedBtn.textContent = muted ? 'Afficher les messages' : 'Masquer les messages';
  const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 40;
  list.replaceChildren();
  if (muted) list.append(h('p', { class: 'chat-empty', text: 'Messages masqués sur cet écran. Tu peux toujours écrire.' }));
  else if (!msgs.length) list.append(h('div', { class: 'chat-empty' }, h('span', { 'aria-hidden': 'true' }, bubble(46)), h('p', { text: 'Personne n’a encore écrit.' }), h('small', { text: 'Lance la conversation, ou chambre ton voisin.' })));
  else {
    let prev = null;
    msgs.forEach(c => {
      const p = players[c.u] || {}, mine = !!room && c.u === room.me;
      const first = prev !== c.u;
      prev = c.u;
      list.append(h('div', { class: `chat-msg${mine ? ' mine' : ''}${first ? ' first' : ''}`, style: { '--pc': pcol(p.c) } },
        first ? h('span', { class: 'chat-av', 'aria-hidden': 'true', text: (String(p.name || '?').trim()[0] || '?').toUpperCase() }) : h('span', { class: 'chat-av gap' }),
        h('div', { class: 'chat-bub' }, first ? h('div', { class: 'chat-who' }, h('b', { text: mine ? 'Toi' : p.name || '?' }), h('time', { text: clock(c.ts) })) : null, h('span', { class: 'chat-txt', text: mask(c.t) }))));
    });
  }
  if (open && stick) list.scrollTop = list.scrollHeight;
  if (open) seenTs = Math.max(seenTs, ...msgs.map(c => c.ts || 0), 0);
  unread = muted ? 0 : msgs.filter(c => (!room || c.u !== room.me) && (c.ts || 0) > seenTs).length;
  badge.hidden = open || muted || unread < 1;
  badge.textContent = unread > 9 ? '9+' : String(unread);
}

export const chat = {
  attach(r) {
    build();
    this.detach();
    room = r; unread = 0; seenTs = 0; sent = [];
    // Ouvert par défaut partout, sauf si le joueur l'a réduit lui-même.
    open = store.get('mp-chat-open') !== '0';
    wide = desktop();
    off = r.on(k => { if (k === 'chat' || k === 'players') paint(); });
    timer = setInterval(() => { layout(); }, 400);
    layout(); paint();
  },
  detach() {
    if (off) off(); off = null;
    clearInterval(timer); timer = null;
    room = null; open = false;
    if (tab) { tab.hidden = true; panel.hidden = true; }
    document.documentElement.classList.remove('chat-dock', 'chat-sheet');
  },
};
