// Salon Mauvais Perdants sur Firebase Realtime Database (sa/<code>). Seul module (avec
// coord.js) qui parle à la base. Modèle et règles : firebase/build-rules.js (saRules).
//
// - Compte anonyme et salons communs à GameHub (shared/firebase.js).
// - Heure du SERVEUR (.info/serverTimeOffset) : échéances et départs communs.
// - Présence : battement toutes les 4 s, horodaté par le serveur ; un joueur est
//   « en ligne » si son dernier battement a moins de 12 s.
// - Chaque joueur n'écrit que ses nœuds ; le coordinateur écrit l'état du tournoi.

import { ref, get, set, push, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction, query, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db, ensureAuth, freeRoomCode, createRoom as fbCreate, openRoom, isDenied } from '../../../shared/firebase.js';
import { cleanName } from './text.js';
import { MAX_PLAYERS } from './scoring.js';

export const P = 'mp';
export const ONLINE_MS = 12000;
const GONE_MS = 60000;
const BEAT_MS = 4000;
const WORDS = ['GONG', 'BUZZ', 'FLOP', 'BIDE', 'TRAC', 'CHUTE', 'HONTE', 'PRIME', 'CRAN', 'DUEL', 'JURY', 'ROAST', 'OLE'];
export const genCode = (random = Math.random) => `${WORDS[Math.floor(random() * WORDS.length)]}-${String(Math.floor(random() * 90) + 10)}`;
export const CODE_RE = /^[A-Z]{3,5}-[0-9]{2}$/;
export const normalizeCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3,5})([0-9]{2})$/, '$1-$2');

let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; });
export const serverNow = () => Date.now() + offset;

const userErr = (m, cause) => Object.assign(new Error(m), { userMessage: m, cause });
const wrap = e => (e && e.userMessage ? e : isDenied(e) ? userErr('Accès refusé : salon fermé ou tournoi déjà lancé.', e) : userErr('Connexion impossible : vérifie le réseau et réessaie.', e));
export const device = () => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');

export async function createRoom({ name, scene, roast, crude, v }) {
  try {
    const me = await ensureAuth();
    const code = await freeRoomCode(P, genCode);
    const game = { phase: 'lobby', coord: me.uid, cfg: { roast: roast === 'hard' ? 'hard' : 'soft', crude: crude === true, v: Number.isInteger(v) && v >= 1 ? v : 1 } };
    if (!scene) game.players = { [me.uid]: { name: cleanName(name), c: 0, dev: device(), t: Date.now() } };
    await fbCreate(P, code, game);
    return new Room(code, me.uid);
  } catch (e) { throw wrap(e); }
}

export async function joinRoom(code, { name, scene }) {
  code = normalizeCode(code);
  if (!CODE_RE.test(code)) throw userErr('Code invalide : quatre lettres, un tiret, deux chiffres (ex. GONG-42).');
  let g;
  const me = await ensureAuth().catch(e => { throw wrap(e); });
  try {
    const snap = await openRoom(P, code, ph => ph === 'lobby');
    if (!snap.exists()) throw userErr('Code inconnu : vérifie-le auprès de l’hôte.');
    g = snap.val();
    if (snap.preview) throw userErr('Tournoi déjà lancé : attends la fin pour rejoindre le salon.');
  } catch (e) { throw wrap(e); }
  const players = g.players || {};
  if (!scene && !players[me.uid]) {
    if (g.phase !== 'lobby') throw userErr('Tournoi déjà lancé : attends la fin pour rejoindre le salon.');
    if (Object.keys(players).length >= MAX_PLAYERS) throw userErr(`Salon complet (${MAX_PLAYERS} joueurs).`);
    const used = new Set(Object.values(players).map(p => p.c));
    // Deux pseudos identiques prêteraient à confusion : on numérote le second.
    const taken = new Set(Object.values(players).map(p => String(p.name).toLowerCase()));
    let nm = cleanName(name);
    for (let k = 2; taken.has(nm.toLowerCase()) && k < 10; k++) nm = `${cleanName(name).slice(0, 14)} ${k}`;
    name = nm;
    const c = [0, 1, 2, 3, 4, 5, 6, 7].find(x => !used.has(x)) ?? 0;
    try { await set(ref(db, `${P}/${code}/players/${me.uid}`), { name: cleanName(name), c, dev: device(), t: Date.now() }); } catch (e) { throw wrap(e); }
  }
  return new Room(code, me.uid);
}

// Reconnexion : déjà membre, on relit simplement le salon.
export async function resumeRoom(code) {
  const me = await ensureAuth();
  const snap = await get(ref(db, `${P}/${code}/hostUid`));
  if (!snap.exists()) return null;
  return new Room(code, me.uid);
}

export class Room {
  constructor(code, uid) {
    this.code = code; this.me = uid; this.base = `${P}/${code}`;
    this.s = { players: {}, presence: {}, ready: {}, prog: {}, mc: {}, subs: {}, boast: {}, votes: {}, start: {}, turns: {} };
    this.unsubs = []; this.roundUnsubs = []; this.closed = false; this.listeners = new Set();
    this.loaded = new Set();          // nœuds déjà reçus au moins une fois
    this.roundKey = null;
    this.presenceRef = ref(db, `${this.base}/presence/${uid}`);
    this.unsubs.push(onValue(ref(db, '.info/connected'), s => {
      this.connected = !!s.val();
      this.emit();
      if (!s.val() || this.closed) return;
      onDisconnect(this.presenceRef).remove().catch(() => {});
      this.beat();
    }));
    this.beatTimer = setInterval(() => this.beat(), BEAT_MS);
    for (const k of ['hostUid', 'phase', 'coord', 'cfg', 'players', 'presence', 'ready', 'prog', 'match', 'typing']) {
      this.unsubs.push(onValue(ref(db, `${this.base}/${k}`), snap => {
        this.s[k] = snap.val() || (['players', 'presence', 'ready', 'prog', 'typing'].includes(k) ? {} : snap.val());
        this.loaded.add(k);
        if (k === 'hostUid' && this.s.hostUid) this.seenHost = true;
        if (k === 'hostUid' && !this.s.hostUid && this.seenHost) return this.close('Le salon a été fermé par l’hôte.');
        if (k === 'match') this.followRound();
        this.emit(k);
      }, e => this.lost(e)));
    }
    this.s.chat = {};
    this.unsubs.push(onValue(query(ref(db, `${this.base}/chat`), limitToLast(60)), snap => { this.s.chat = snap.val() || {}; this.emit('chat'); }, () => {}));
    this.unsubs.push(onValue(query(ref(db, `${this.base}/mc`), limitToLast(8)), snap => { this.s.mc = snap.val() || {}; this.emit('mc'); }, e => this.lost(e)));
  }
  beat() { if (!this.closed) set(this.presenceRef, serverTimestamp()).catch(() => {}); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(k) { for (const fn of this.listeners) { try { fn(k, this); } catch (e) { console.error(e); } } }
  lost(e) { if (!this.closed && isDenied(e) && this.seenHost) this.close('Accès au salon perdu (fermé ou maintenance).'); }

  // Abonnements propres à la manche en cours (réponses, fanfaronnades, votes).
  followRound() {
    const m = this.s.match;
    const key = m ? `${m.tid}/${m.rk}` : null;
    if (key === this.roundKey) return;
    this.roundUnsubs.forEach(u => { try { u(); } catch (_) {} });
    this.roundUnsubs = [];
    this.roundKey = key;
    this.s.subs = {}; this.s.boast = {}; this.s.votes = {}; this.s.start = {}; this.s.turns = {};
    ['subs', 'boast', 'votes', 'start', 'turns'].forEach(k => this.loaded.delete(k));
    if (!key) return;
    for (const k of ['subs', 'boast', 'votes', 'start', 'turns']) {
      this.roundUnsubs.push(onValue(ref(db, `${this.base}/${k}/${key}`), snap => { this.s[k] = snap.val() || {}; this.loaded.add(k); this.emit(k); }, () => {}));
    }
  }

  get isHost() { return this.s.hostUid === this.me; }
  get isCoord() { return this.s.coord === this.me; }
  get isPlayer() { return !!this.s.players[this.me]; }
  online(uid, now = serverNow()) { const t = this.s.presence[uid]; return typeof t === 'number' && now - t < ONLINE_MS; }
  // Voyant de présence : 'on' (vert) il bat, 'away' (jaune) il ne bat plus (onglet en veille, réseau coupé),
  // 'gone' (rouge) sa présence a disparu de la base : il a fermé la page.
  presence(uid, now = serverNow()) {
    const t = this.s.presence[uid];
    if (typeof t !== 'number') return 'gone';
    const age = now - t;
    return age < ONLINE_MS ? 'on' : age < GONE_MS ? 'away' : 'gone';
  }
  onlineSet(now = serverNow()) { return new Set(Object.keys(this.s.presence || {}).filter(u => this.online(u, now))); }
  players() {
    return Object.entries(this.s.players || {}).map(([uid, p]) => ({ uid, ...p, online: this.online(uid), host: uid === this.s.hostUid }))
      .sort((a, b) => (b.host - a.host) || (a.t || 0) - (b.t || 0));
  }

  // ───────── écritures d'un joueur
  setName(name) { return set(ref(db, `${this.base}/players/${this.me}/name`), cleanName(name)).catch(e => { throw wrap(e); }); }
  submit(tid, rk, payload) {
    const d = JSON.stringify(payload);
    if (d.length > 4000) return Promise.reject(userErr('Réponse trop longue.'));
    return set(ref(db, `${this.base}/subs/${tid}/${rk}/${this.me}`), { d, t: serverTimestamp() });
  }
  // Coffre : les chiffres que je tape en ce moment, visibles des autres (tour n). Écrasé à chaque frappe.
  typing(n, digits) { return set(ref(db, `${this.base}/typing/${this.me}`), { k: String(n), d: String(digits).slice(0, 24) }).catch(() => {}); }
  // Journal du Coffre (élimination) : une entrée par tour et par joueur, écrite une fois. `uid` = le
  // joueur dont c'est le tour ; un autre membre peut y inscrire l'élimination (r = 'x') si celui-ci a disparu.
  turn(tid, rk, n, uid, r) { return set(ref(db, `${this.base}/turns/${tid}/${rk}/${n}/${uid}`), { r, t: serverTimestamp() }).catch(() => {}); }
  chatSend(text) { return set(push(ref(db, `${this.base}/chat`)), { u: this.me, t: String(text).slice(0, 140), ts: serverTimestamp() }); }
  ready(tag) { return set(ref(db, `${this.base}/ready/${this.me}`), tag).catch(() => {}); }
  boast(tid, rk) { return set(ref(db, `${this.base}/boast/${tid}/${rk}/${this.me}`), true); }
  markStart(tid, rk) { return set(ref(db, `${this.base}/start/${tid}/${rk}/${this.me}`), serverTimestamp()); }
  vote(tid, rk, gid, refuse) { return set(ref(db, `${this.base}/votes/${tid}/${rk}/${this.me}/${gid}`), !!refuse).catch(() => {}); }
  // Progression en direct, bornée à ~2 écritures/s ; la dernière valeur part toujours.
  progress(k, v) {
    const t = Date.now();
    clearTimeout(this.progTimer);
    if (this.lastProg && t - this.lastProg < 400 && this.lastProgK === k) {
      this.progTimer = setTimeout(() => this.progress(k, v), 420 - (t - this.lastProg));
      return;
    }
    this.lastProg = t; this.lastProgK = k;
    return set(ref(db, `${this.base}/prog/${this.me}`), { k, v: Math.round(v) }).catch(() => {});
  }
  async leave() {
    try {
      if (this.isHost) await remove(ref(db, this.base));
      else if (this.s.phase === 'lobby') await remove(ref(db, `${this.base}/players/${this.me}`));
    } catch (_) { /* déjà fermé */ }
    this.dispose();
  }

  // ───────── écritures de l'hôte / du coordinateur
  setCfg(cfg) { return set(ref(db, `${this.base}/cfg`), cfg).catch(e => { throw wrap(e); }); }
  takeover() { return set(ref(db, `${this.base}/coord`), this.me); }
  write(updates) { return update(ref(db, this.base), updates); }
  txMatch(fn) { return runTransaction(ref(db, `${this.base}/match`), fn, { applyLocally: false }); }
  readSubs(tid, rk) { return get(ref(db, `${this.base}/subs/${tid}/${rk}`)).then(s => s.val() || {}); }
  readTurns(tid, rk) { return get(ref(db, `${this.base}/turns/${tid}/${rk}`)).then(s => s.val() || {}); }
  readVotes(tid, rk) { return get(ref(db, `${this.base}/votes/${tid}/${rk}`)).then(s => s.val() || {}); }
  readBoasts(tid, rk) { return get(ref(db, `${this.base}/boast/${tid}/${rk}`)).then(s => s.val() || {}); }
  clearRoundData() { return Promise.all(['subs', 'boast', 'votes', 'start', 'turns'].map(k => remove(ref(db, `${this.base}/${k}`)).catch(() => {}))); }
  say(id, line) { return set(ref(db, `${this.base}/mc/${id}`), line); }
  patchLine(id, fields) { return update(ref(db, `${this.base}/mc/${id}`), fields).catch(() => {}); }

  close(msg) { if (this.closed) return; this.dispose(); this.onClosed && this.onClosed(msg); }
  dispose() {
    this.closed = true;
    clearInterval(this.beatTimer);
    [...this.unsubs, ...this.roundUnsubs].forEach(u => { try { u(); } catch (_) {} });
    this.unsubs = []; this.roundUnsubs = [];
    onDisconnect(this.presenceRef).cancel().catch(() => {});
    remove(this.presenceRef).catch(() => {});
  }
}
