// Firebase + etat de session du client. Seul module qui importe le SDK.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getDatabase, ref, set, get, update, onValue, remove, push, onDisconnect, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// Configuration publique du client Firebase (ce n'est pas un secret : la
// securite repose sur les regles de la base). AUCUNE cle d'IA ici.
const firebaseConfig = {
  apiKey:'AIzaSyDYrmf-ThU5x0SQBdEvUy5k83LyTXxhgFA',
  authDomain:'undercover-game-b0d2a.firebaseapp.com',
  databaseURL:'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:'undercover-game-b0d2a',
  storageBucket:'undercover-game-b0d2a.firebasestorage.app',
  messagingSenderId:'195280531653',
  appId:'1:195280531653:web:94d72b25760b05af6bc0ac'
};
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, set, get, update, onValue, remove, push, onDisconnect, runTransaction };

export const gameRef = code => ref(db, `banqueroll/${code}`);
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
