// Firebase + etat de session du client. Seul module qui importe le SDK.

import {
  ref, set, get, update, onValue, remove, push, onDisconnect, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// Configuration et compte anonyme communs a GameHub (shared/firebase.js) : la
// securite repose sur les regles de la base (membres, hote). AUCUNE cle d'IA ici.
import { db, ensureAuth, createRoom, openRoom, closeRoom } from '../../../shared/firebase.js';
export { db, ensureAuth, createRoom, openRoom, closeRoom };
export { ref, set, get, update, onValue, remove, push, onDisconnect, runTransaction };

export const gameRef = code => ref(db, `banqueroll/${code}`);

// Heure du serveur Firebase : les mini-jeux (quelques secondes) demarrent au meme
// instant chez tout le monde, meme si les horloges des appareils different.
let serverOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), snap => { serverOffset = Number(snap.val()) || 0; });
export const serverNow = () => Date.now() + serverOffset;
export const presenceRef = (code, playerId) => ref(db, `banqueroll/${code}/presence/${playerId}`);

// Session locale. Rien ici n'est lu par la logique d'un autre client.
export const S = {
  code:null, name:null, playerId:null, color:null, isHost:false,
  game:null, listener:null, busy:null,
};

export function pushHistory(code, text, meta) {
  const entry = { text, ts: Date.now() };
  if (meta) entry.meta = meta;
  return push(ref(db, `banqueroll/${code}/history`), entry);
}

export function pushChat(code, entry) {
  return push(ref(db, `banqueroll/${code}/chat`), { ts: Date.now(), ...entry });
}

export function patchChat(code, key, fields) {
  return update(ref(db, `banqueroll/${code}/chat/${key}`), fields);
}

export function commit(code, updates) {
  return update(gameRef(code), updates);
}

const KEYS = ['code', 'playerId', 'name', 'color'];
export function loadLocal() {
  try { KEYS.forEach(k => { S[k] = localStorage.getItem('banqueroll-' + k); }); } catch (e) { /* stockage bloque */ }
}
export function saveLocal() {
  try { KEYS.forEach(k => localStorage.setItem('banqueroll-' + k, S[k])); } catch (e) { /* stockage bloque */ }
}
export function clearLocal() {
  try { KEYS.forEach(k => localStorage.removeItem('banqueroll-' + k)); } catch (e) { /* stockage bloque */ }
}
