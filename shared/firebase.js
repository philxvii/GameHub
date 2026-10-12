// Firebase commun à GameHub : configuration, connexion anonyme, salons, admin.
//
// Chaque joueur reçoit un compte anonyme Firebase (invisible pour lui, conservé
// par le navigateur) : les règles de la base reconnaissent ainsi l'hôte d'une
// partie et ses membres. Voir firebase/README.md.
//
// Une partie `<préfixe>/<code>` porte `hostUid` (son créateur, immuable) et
// `members/<uid>: true`. Seuls les membres la lisent et l'écrivent ; seul l'hôte
// la supprime. Tout compte connecté peut lire `phase`, pour savoir si un code
// existe et si l'on peut encore y entrer.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, connectDatabaseEmulator, ref, get, set, remove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously, signInWithPopup, linkWithPopup, GoogleAuthProvider }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDYrmf-ThU5x0SQBdEvUy5k83LyTXxhgFA',
  authDomain: 'undercover-game-b0d2a.firebaseapp.com',
  databaseURL: 'https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'undercover-game-b0d2a',
  storageBucket: 'undercover-game-b0d2a.firebasestorage.app',
  messagingSenderId: '195280531653',
  appId: '1:195280531653:web:94d72b25760b05af6bc0ac',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Émulateurs : seulement en local et sur demande (?emu, retenu pour l'onglet).
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
if (LOCAL && (new URLSearchParams(location.search).has('emu') || sessionStorage.getItem('gh-emu'))) {
  sessionStorage.setItem('gh-emu', '1');
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

// Un seul compte par navigateur, partagé par ses onglets. Le compte qu'un onglet crée
// n'arrive dans les autres qu'après ~1 s (synchronisation entre onglets) : un second
// onglet qui en créait un entre-temps remplaçait celui du premier, qui changeait alors
// d'identité en pleine partie (plus hôte, plus membre). D'où le verrou et l'attente.
const SIGNED = 'gh-auth-uid';
const waitUser = ms => new Promise(resolve => {
  if (auth.currentUser) { resolve(auth.currentUser); return; }
  const off = onAuthStateChanged(auth, u => { if (u) { off(); clearTimeout(t); resolve(u); } });
  const t = setTimeout(() => { off(); resolve(null); }, ms);
});
const withLock = fn => (navigator.locks ? navigator.locks.request('gh-auth', fn) : fn());

let ready = null;
// Le compte courant ; en crée un anonyme au premier passage.
export function ensureAuth() {
  if (!ready) {
    ready = (async () => {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
      return withLock(async () => {
        if (localStorage.getItem(SIGNED)) { const u = await waitUser(2500); if (u) return u; }
        if (auth.currentUser) return auth.currentUser;
        const { user } = await signInAnonymously(auth);
        try { localStorage.setItem(SIGNED, user.uid); } catch (_) {}
        return user;
      });
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

export const isDenied = e => /permission/i.test(String(e && (e.code || e.message) || e));

// Un code libre : `gen` est le générateur du jeu, on évite tout code déjà pris.
export async function freeRoomCode(prefix, gen) {
  await ensureAuth();
  for (let i = 0; i < 15; i++) {
    const code = gen();
    if (!(await get(ref(db, `${prefix}/${code}/phase`))).exists()) return code;
  }
  throw new Error('aucun code libre');
}

// Crée la partie : le créateur en devient l'hôte et le premier membre.
export async function createRoom(prefix, code, game) {
  const me = await ensureAuth();
  await set(ref(db, `${prefix}/${code}`), { ...game, hostUid: me.uid, members: { [me.uid]: true } });
  return me.uid;
}

const EMPTY = { exists: () => false, val: () => null };
// Ce que voit un non-membre d'une partie où il ne peut plus entrer : sa phase seule.
const preview = phase => ({ exists: () => true, val: () => ({ phase, players: [] }), preview: true });

// Lit la partie pour la rejoindre. Membre : lecture directe (reconnexion). Sinon,
// si la phase le permet, on s'inscrit membre puis on lit. Renvoie un instantané
// (ou équivalent) : la suite du code du jeu reste inchangée.
export async function openRoom(prefix, code, joinable = phase => phase === 'lobby') {
  const me = await ensureAuth();
  const base = `${prefix}/${code}`;
  try {
    const snap = await get(ref(db, base));
    // Lisible sans être membre : règles de transition (encore ouvertes par code). On
    // s'inscrit quand même, pour garder l'accès quand les règles finales s'appliquent.
    const g = snap.val();
    if (g && !(g.members || {})[me.uid] && joinable(g.phase)) await set(ref(db, `${base}/members/${me.uid}`), true);
    return g && !(g.members || {})[me.uid] ? get(ref(db, base)) : snap;
  } catch (e) { if (!isDenied(e)) throw e; }
  const phase = (await get(ref(db, `${base}/phase`))).val();
  if (phase === null) return EMPTY;
  if (!joinable(phase)) return preview(phase);
  await set(ref(db, `${base}/members/${me.uid}`), true);
  return get(ref(db, base));
}

// L'hôte supprime la partie ; un invité la quitte simplement (la règle le lui refuse).
export async function closeRoom(prefix, code) {
  try { await remove(ref(db, `${prefix}/${code}`)); } catch (e) { if (!isDenied(e)) throw e; }
}

// Connexion admin par Google. L'uid doit figurer dans `admins/` (ajouté depuis la
// console Firebase) ; il est renvoyé pour pouvoir l'y ajouter la première fois.
// Le compte anonyme du navigateur est rattaché au compte Google (même uid) : les
// parties ouvertes dans d'autres onglets gardent leur hôte. Si ce compte Google est
// déjà rattaché ailleurs, on s'y connecte (l'uid de ce navigateur change alors).
export async function adminSignIn() {
  const provider = new GoogleAuthProvider();
  await auth.authStateReady();
  let user;
  if (auth.currentUser && auth.currentUser.isAnonymous) {
    try { ({ user } = await linkWithPopup(auth.currentUser, provider)); }
    catch (e) { if (!/credential-already-in-use|email-already-in-use/.test(e.code || '')) throw e; }
  }
  if (!user) ({ user } = await signInWithPopup(auth, provider));
  try { localStorage.setItem(SIGNED, user.uid); } catch (_) {}
  ready = Promise.resolve(user);
  let isAdmin = false;
  try { isAdmin = (await get(ref(db, `admins/${user.uid}`))).val() === true; } catch (_) {}
  return { uid: user.uid, isAdmin };
}
