// Harnais commun des manches côté joueur.
//  - l'action démarre à `startAt` (heure serveur) : même instant pour tous ;
//  - une seule soumission (verrou local + écriture unique côté base) ;
//  - à l'échéance, le résultat partiel est envoyé automatiquement (500 ms avant end) ;
//  - après envoi : écran « verrouillé », en attendant les autres.

import { h, clear } from '../ui/dom.js';
import { sfx } from '../sfx.js';
import gong from './gong.js';
import tir from './tir.js';
import dictee from './dictee.js';
import chemin from './chemin.js';
import numeros from './numeros.js';
import damier from './damier.js';
import coffre from './coffre.js';
import dejavu from './dejavu.js';
import bac from './bac.js';
import calcul from './calcul.js';
import nuage from './nuage.js';
import prix from './prix.js';
import encre from './encre.js';
import chrono from './chrono.js';
import intrus from './intrus.js';
import anagramme from './anagramme.js';
import metronome from './metronome.js';

export const PLAY = { gong, tir, dictee, chemin, numeros, damier, coffre, dejavu, bac, calcul, nuage, prix, encre, chrono, intrus, anagramme, metronome };

export function mountPlay(el, { gameId, params, startAt, endAt, now, send, progress, peers, turn, doneText, save, finished }) {
  clear(el);
  const root = h('div', { class: 'play' });
  el.append(root);
  let sent = false, mod = null, autoTimer = null, startTimer = null, saveTimer = null, destroyed = false;
  const finish = async payload => {
    if (sent || destroyed) return;
    sent = true;
    clearTimeout(autoTimer); clearInterval(saveTimer);
    sfx.lock();
    try { await send(payload); } catch (e) { console.warn('envoi refusé', e); }
    if (mod) try { mod.destroy(); } catch (_) {}
    mod = null;
    clear(root);
    root.append(h('div', { class: 'done-card' }, h('div', { class: 'big', text: 'Verrouillé' }), h('p', { text: doneText || 'Réponse enregistrée. On attend les autres…' })));
  };
  const api = { p: params, now, startAt, endAt, submit: finish, progress, peers: peers || (() => []), turn, sfx, el: root, finished: finished || (() => {}) };
  const begin = () => {
    if (destroyed) return;
    mod = PLAY[gameId](root, api);
    const ms = endAt - now() - 500;
    autoTimer = setTimeout(() => finish(mod ? mod.partial() : {}), Math.max(0, ms));
    // Partiel gardé sur l'appareil : un rechargement envoie ce qui était joué, sans rejouer.
    if (save) saveTimer = setInterval(() => { if (mod && !sent) save(mod.partial()); }, 1000);
  };
  const wait = startAt - now();
  if (wait > 30) startTimer = setTimeout(begin, wait); else begin();
  return {
    destroy() { destroyed = true; clearTimeout(autoTimer); clearTimeout(startTimer); clearInterval(saveTimer); if (mod) try { mod.destroy(); } catch (_) {} },
    submitNow() { if (mod) finish(mod.partial()); },
    get sent() { return sent; },
  };
}

// Petits outils partagés par les manches.
export function lives(n, max) {
  return h('span', { class: 'lives', 'aria-label': `${n} vie${n > 1 ? 's' : ''} sur ${max}` }, ...Array.from({ length: max }, (_, k) => h('span', { class: k < n ? '' : 'lost', text: '♥' })));
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
export function keyHandler(fn) {
  const on = e => { if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; fn(e); };
  window.addEventListener('keydown', on);
  return () => window.removeEventListener('keydown', on);
}
