// Chat de salon : texte libre (140 caractères), visible au salon et pendant l'émission.
// Les messages sont dans mp/<code>/chat (écrits une fois, jamais modifiés). Le nom affiché est celui
// de la fiche du joueur, jamais un texte fourni avec le message. Filtre de gros mots à l'AFFICHAGE
// (la base ne filtre que les balises), limite d'envoi côté client, et chacun peut masquer le chat.

import { h, $ } from './ui/dom.js';
import { fold } from './text.js';

const MAX = 140, GAP_MS = 1500, BURST = 5, BURST_MS = 10000;
// Racines de mots grossiers ; comparées sans accent, sans casse, sans espaces ni ponctuation répétée.
const BAD = ['connard', 'connasse', 'salope', 'pute', 'enculé', 'encule', 'pd', 'fdp', 'ntm', 'nique', 'merde', 'batard', 'bâtard', 'putain', 'bite', 'couille', 'tg', 'ferme ta gueule', 'negre', 'nègre', 'bougnoule', 'youpin', 'tapette', 'suicide'];
const ROOTS = BAD.map(w => fold(w).replace(/[^a-z ]/g, '')).filter(Boolean);
const bad = w => { const f = fold(w).replace(/[^a-z]/g, ''); return ROOTS.some(r => f === r.replace(/ /g, '') || (r.length >= 5 && f.includes(r.replace(/ /g, '')))); };
export const mask = text => String(text).replace(/\s+/g, ' ').trim().split(' ').map(w => (bad(w) ? '•'.repeat(Math.max(3, w.length)) : w)).join(' ');

let room = null, off = null, timer = null, open = false, unread = 0, seenTs = 0, sent = [];
let fab, badge, panel, list, input, hint, mutedBtn;
const store = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
let muted = store.get('mp-chat-muted') === '1';

function build() {
  if (fab) return;
  badge = h('i', { class: 'chat-badge', hidden: true });
  fab = h('button', { class: 'chat-fab', id: 'chat-fab', type: 'button', 'aria-label': 'Ouvrir le chat', hidden: true }, h('span', { 'aria-hidden': 'true', text: '💬' }), badge);
  list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
  input = h('input', { class: 'inp chat-in', type: 'text', maxlength: String(MAX), autocomplete: 'off', placeholder: 'Écris un message…', 'aria-label': 'Message' });
  hint = h('div', { class: 'chat-hint' });
  const send = h('button', { class: 'btn btn-main', type: 'button', text: 'Envoyer' });
  mutedBtn = h('button', { class: 'chat-mute', type: 'button' });
  const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer le chat', text: '✕' });
  panel = h('aside', { class: 'chat-panel', id: 'chat', role: 'dialog', 'aria-label': 'Chat du salon', hidden: true },
    h('div', { class: 'chat-head' }, h('b', { text: 'Chat du salon' }), mutedBtn, close), list, hint, h('div', { class: 'chat-row' }, input, send));
  document.body.append(fab, panel);
  fab.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  mutedBtn.addEventListener('click', () => { muted = !muted; store.set('mp-chat-muted', muted ? '1' : '0'); paint(); });
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } e.stopPropagation(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
}

function toggle(on) {
  open = on;
  panel.hidden = !on;
  if (on) { input.focus(); paint(); list.scrollTop = list.scrollHeight; }
}

async function submit() {
  const text = input.value.replace(/\s+/g, ' ').trim();
  if (!text || !room) return;
  const now = Date.now();
  sent = sent.filter(t => now - t < BURST_MS);
  if (sent.length && now - sent[sent.length - 1] < GAP_MS) return say('Doucement : un message à la fois.');
  if (sent.length >= BURST) return say('Trop de messages : attends quelques secondes.');
  sent.push(now);
  input.value = '';
  try { await room.say(text.slice(0, MAX)); say(''); } catch (_) { say('Message refusé. Réessaie.'); }
}
const say = t => { if (hint) hint.textContent = t; };

function paint() {
  if (!fab) return;
  const chat = room ? room.s.chat || {} : {};
  const msgs = Object.entries(chat).map(([id, c]) => ({ id, ...c })).filter(c => c && typeof c.t === 'string').sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const names = room ? Object.fromEntries(Object.entries(room.s.players || {}).map(([u, p]) => [u, p.name])) : {};
  mutedBtn.textContent = muted ? 'Chat masqué · afficher' : 'Masquer le chat';
  list.replaceChildren();
  if (muted) list.append(h('p', { class: 'chat-empty', text: 'Le chat est masqué sur cet écran. Tu peux toujours écrire.' }));
  else if (!msgs.length) list.append(h('p', { class: 'chat-empty', text: 'Personne n’a encore écrit. Lance la conversation !' }));
  else msgs.forEach(c => list.append(h('div', { class: `chat-msg${room && c.u === room.me ? ' mine' : ''}` }, h('b', { text: names[c.u] || '?' }), h('span', { text: mask(c.t) }))));
  if (open) { list.scrollTop = list.scrollHeight; seenTs = Math.max(seenTs, ...msgs.map(c => c.ts || 0), 0); }
  unread = muted ? 0 : msgs.filter(c => (!room || c.u !== room.me) && (c.ts || 0) > seenTs).length;
  badge.hidden = open || muted || unread < 1;
  badge.textContent = unread > 9 ? '9+' : String(unread);
}
export const chat = {
  attach(r) {
    build();
    this.detach();
    room = r; unread = 0; seenTs = 0; sent = [];
    off = r.on(k => { if (k === 'chat' || k === 'players') paint(); });
    // Visible seulement dans un salon (pas sur l'accueil).
    timer = setInterval(() => { fab.hidden = !room || $('#app').dataset.screen === 'home'; if (fab.hidden && open) toggle(false); }, 400);
    paint();
  },
  detach() {
    if (off) off(); off = null;
    clearInterval(timer); timer = null;
    room = null; open = false;
    if (fab) { fab.hidden = true; panel.hidden = true; }
  },
};
