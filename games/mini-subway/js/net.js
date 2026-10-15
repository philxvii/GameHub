// Multijoueur de Mini Subway (Firebase Realtime Database, chemins ms/<code>).
//
// Modèle « lockstep » à journal de commandes (cahier §25) :
//  - chaque client fait tourner le même moteur déterministe, depuis la même graine ;
//  - on ne synchronise que des commandes : un invité écrit une demande (req/<id>),
//    l'hôte la date d'un tick futur et l'ajoute au journal ordonné (cmds/cNNNNNN),
//    à écriture unique ; l'hôte publie aussi la tête du journal (head : tick, nombre) ;
//  - un client n'avance jamais au-delà de head.tick et applique les commandes au tick
//    prévu : tous les états restent identiques ; une empreinte d'état publiée toutes
//    les 100 ticks détecte toute dérive, réparée depuis l'instantané de l'hôte ;
//  - identifiants de commande uniques : une demande rejouée est ignorée, et une
//    ressource ne peut pas être dépensée deux fois (le moteur revalide chaque commande).
// Pas de serveur arbitre : l'hôte fait foi (voir docs/DECISIONS.md, limites anti-triche).

import { ref, get, set, update, onValue, onChildAdded, onDisconnect, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db, ensureAuth, freeRoomCode, createRoom as fbCreateRoom, openRoom, closeRoom, isDenied } from '../../../shared/firebase.js';
import { createGame, step, apply, stateHash, duelOutcome } from './engine/sim.js';
import { RULES_VERSION, TICK_HZ } from './engine/params.js';

const P = 'ms';
const DT = 1000 / TICK_HZ;
export const LEAD = 8;              // avance de la tête du journal sur l'horloge de l'hôte (ticks)
export const RECONNECT_MS = 45000;  // fenêtre de reconnexion avant abandon
const MAX = { coop: 4, versus: 2 };
const WORDS = ['RAIL', 'QUAI', 'TRAM', 'GARE', 'VOIE', 'LIGNE', 'METRO', 'NOEUD', 'PONT', 'ARRET'];

const userErr = (m, cause) => Object.assign(new Error(m), { userMessage: m, cause });
const genCode = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${String(Math.floor(Math.random() * 90) + 10)}`;
const wrap = e => (e && e.userMessage ? e : isDenied(e) ? userErr('Accès refusé : salon fermé, complet ou déjà lancé.', e) : userErr('Connexion impossible : vérifiez le réseau et réessayez.', e));

export async function createRoom({ kind, map, mode, name }) {
  try {
    const me = await ensureAuth();
    const code = await freeRoomCode(P, genCode);
    await fbCreateRoom(P, code, {
      phase: 'lobby',
      cfg: { kind, map, mode: kind === 'versus' ? 'classic' : mode, seed: 0, round: 0, v: RULES_VERSION, handicaps: { v: 1 } },
      players: { [me.uid]: { name, ready: false, t: Date.now() } },
    });
    return new Lobby(code, me.uid);
  } catch (e) { throw wrap(e); }
}

export async function joinRoom(code, name) {
  let g;
  const me = await ensureAuth().catch(e => { throw wrap(e); });
  try {
    const snap = await openRoom(P, code, ph => ph === 'lobby');
    if (!snap.exists()) throw userErr('Code inconnu : vérifiez-le auprès de l’hôte.');
    g = snap.val();
    if (snap.preview) throw userErr(g.phase === 'lobby' ? 'Salon inaccessible.' : 'Partie déjà lancée : impossible de la rejoindre.');
  } catch (e) { throw wrap(e); }
  const players = g.players || {};
  if (!players[me.uid]) {
    if (g.phase !== 'lobby') throw userErr('Partie déjà lancée : impossible de la rejoindre.');
    if (Object.keys(players).length >= MAX[g.cfg.kind]) throw userErr('Partie pleine.');
    try { await set(ref(db, `${P}/${code}/players/${me.uid}`), { name, ready: false, t: Date.now() }); } catch (e) { throw wrap(e); }
  }
  return new Lobby(code, me.uid);
}

// ───────── salon ─────────
export class Lobby {
  constructor(code, uid) {
    this.code = code; this.me = uid; this.base = `${P}/${code}`;
    this.room = {}; this.unsubs = []; this.session = null; this.closed = false; this.seenHost = false;
    this.onChange = null; this.onStart = null; this.onClosed = null;
    this.presenceRef = ref(db, `${this.base}/presence/${uid}`);
    this.unsubs.push(onValue(ref(db, '.info/connected'), s => {
      if (!s.val() || this.closed) return;
      onDisconnect(this.presenceRef).remove().catch(() => {});
      set(this.presenceRef, serverTimestamp()).catch(() => {});
    }));
    for (const k of ['hostUid', 'phase', 'cfg', 'players', 'presence', 'result']) {
      this.unsubs.push(onValue(ref(db, `${this.base}/${k}`), s => { this.room[k] = s.val(); this.changed(k); }, e => this.lost(e)));
    }
  }
  get isHost() { return this.room.hostUid === this.me; }
  info() {
    const r = this.room, cfg = r.cfg || {};
    const pres = r.presence || {};
    const players = Object.entries(r.players || {}).map(([uid, p]) => ({ uid, name: p.name, ready: !!p.ready, t: p.t || 0, online: pres[uid] != null, host: uid === r.hostUid }))
      .sort((a, b) => (b.host - a.host) || a.t - b.t);
    return { code: this.code, kind: cfg.kind || 'coop', map: cfg.map || 'val-dorme', mode: cfg.mode || 'classic', players, me: this.me, isHost: this.isHost, phase: r.phase, error: this.error };
  }
  changed(k) {
    const r = this.room;
    if (k === 'hostUid') { if (r.hostUid) this.seenHost = true; else if (this.seenHost) return this.close('Le salon a été fermé par l’hôte.'); }
    const cfg = r.cfg;
    if (r.phase === 'playing' && cfg && cfg.seats && (!this.session || this.session.round !== cfg.round)) {
      if (cfg.seats[this.me] === undefined) return this.close('Partie pleine : la partie a commencé sans vous.');
      if (this.session) this.session.destroy();
      this.session = new NetSession(this);
      this.onStart && this.onStart(this.session);
    }
    if (this.session) this.session.peers();
    this.onChange && this.onChange(this.info());
  }
  lost(e) { if (!this.closed && isDenied(e) && this.seenHost) this.close('Accès au salon perdu (fermé ou maintenance).'); }
  close(msg) {
    if (this.closed) return;
    this.dispose();
    this.onClosed && this.onClosed(msg);
  }
  dispose() {
    this.closed = true;
    for (const u of this.unsubs) try { u(); } catch (_) {}
    this.unsubs = [];
    if (this.session) { this.session.destroy(); this.session = null; }
    onDisconnect(this.presenceRef).cancel().catch(() => {});
  }
  async toggleReady() {
    const p = (this.room.players || {})[this.me];
    try { await set(ref(db, `${this.base}/players/${this.me}/ready`), !(p && p.ready)); } catch (e) { this.error = wrap(e).userMessage; this.changed(); }
  }
  // Lancement par l'hôte : sièges dans l'ordre d'arrivée, nouvelle graine, journal vierge.
  async start() {
    const info = this.info();
    const max = MAX[info.kind];
    const seated = info.players.filter(p => p.online || p.host).slice(0, max);
    if (seated.length < 2) throw userErr('Il faut au moins deux joueurs connectés.');
    if (!seated.every(p => p.host || p.ready)) throw userErr('Tout le monde n’est pas prêt.');
    const seats = Object.fromEntries(seated.map((p, i) => [p.uid, i]));
    await this.launch(seats);
  }
  async rematch() {
    if (!this.isHost || !this.room.cfg) return;
    await this.launch(this.room.cfg.seats);
  }
  async launch(seats) {
    const cfg = this.room.cfg;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    try {
      await update(ref(db, this.base), {
        'cfg/seed': seed, 'cfg/seats': seats, 'cfg/round': (cfg.round || 0) + 1,
        cmds: null, head: { tick: 0, n: 0 }, hash: null, snap: null, result: null, phase: 'playing',
      });
    } catch (e) { throw wrap(e); }
  }
  async leave() {
    const host = this.isHost;
    if (this.session && this.session.kind === 'versus' && !this.session.ended) this.session.submit({ type: 'forfeit' });
    this.dispose();
    try {
      if (host) await closeRoom(P, this.code);
      else { await set(ref(db, `${this.base}/players/${this.me}`), null); await set(this.presenceRef, null); }
    } catch (_) { /* déjà fermé */ }
  }
}

// ───────── partie en réseau ─────────
export class NetSession {
  constructor(lobby) {
    const cfg = lobby.room.cfg;
    this.L = lobby; this.kind = cfg.kind; this.me = lobby.me; this.round = cfg.round;
    this.host = lobby.isHost; this.seats = cfg.seats; this.seat = cfg.seats[this.me];
    this.base = lobby.base;
    const opts = { map: cfg.map, mode: cfg.mode, seed: cfg.seed, multi: true, handicaps: { v: (cfg.handicaps && cfg.handicaps.v) || 1, list: [] } };
    this.states = this.kind === 'versus' ? [createGame({ ...opts, indep: true }), createGame({ ...opts, indep: true })] : [createGame(opts)];
    this.cmds = []; this.cmdIdx = 0; this.head = { tick: 0, n: 0 }; this.tick = 0; this.acc = 0;
    this.pending = new Map(); this.seen = new Set(); this.myHash = new Map(); this.hostHash = new Map();
    this.ended = null; this.unsubs = []; this.nextSeq = 0; this.headPub = 0; this.lastPub = 0; this.absent = new Map(); this.left = new Set();
    this.autoPaused = false; this.lastHeadAt = performance.now(); this.counter = 0; this.drifts = 0;
    const r = sub => ref(db, `${this.base}/${sub}`);
    this.unsubs.push(onChildAdded(r('cmds'), s => this.onCmd(s.key, s.val())));
    this.unsubs.push(onValue(r('head'), s => {
      const h = s.val();
      if (!h || h.tick < this.head.tick) return;
      this.head = h; this.lastHeadAt = performance.now();
      if (this.host) this.headPub = Math.max(this.headPub, h.tick); // reprise de l'hôte après rechargement
    }));
    if (this.host) {
      this.unsubs.push(onChildAdded(r('req'), s => this.onReq(s.key, s.val())));
      this.watch = setInterval(() => this.hostDuties(), 1000);
      // onglet masqué : le navigateur coupe requestAnimationFrame, l'horloge de l'hôte continue.
      this.bg = setInterval(() => { if (document.hidden) this.update(1000); }, 1000);
    } else {
      this.unsubs.push(onValue(r('hash'), s => { const h = s.val(); if (h) { this.hostHash.set(h.tick, h.h); this.checkHash(h.tick); } }));
    }
  }

  bind(game) { this.game = game; }
  mine() { return this.states[this.kind === 'versus' ? this.seat : 0]; }
  other() { return this.kind === 'versus' ? this.states[1 - this.seat] : null; }
  canSpeed() { return this.host; }
  hostUid() { return this.L.room.hostUid; }
  nameOf(uid) { const p = (this.L.room.players || {})[uid]; return p ? p.name : 'Un joueur'; }

  // ── commandes ──
  submit(cmd) {
    const id = `${this.me.slice(0, 8)}-${this.round}-${++this.counter}-${Math.floor(Math.random() * 1e6).toString(36)}`.replace(/[^A-Za-z0-9_-]/g, '');
    const net = cmd.type === 'speed' ? -1 : this.kind === 'versus' ? this.seat : 0;
    const c = JSON.stringify(cmd);
    if (c.length > 2000) return { ok: false, err: 'Commande trop longue.' };
    this.pending.set(id, cmd);
    if (this.host) this.append({ id, by: this.me, c, net });
    else set(ref(db, `${this.base}/req/${id}`), { by: this.me, c, net }).catch(e => { this.pending.delete(id); this.game?.result({ ok: false, err: wrap(e).userMessage }, cmd); });
    return { pending: true };
  }
  // Hôte : date la commande d'un tick que personne n'a encore simulé, l'ajoute au journal.
  append(rec) {
    if (this.seen.has(rec.id)) return; // demande rejouée : sans effet
    this.seen.add(rec.id);
    const tick = Math.max(this.headPub, this.tick + LEAD) + 1;
    const seq = this.nextSeq++;
    const key = 'c' + String(seq).padStart(6, '0');
    const full = { id: rec.id, by: rec.by, tick, c: rec.c, net: rec.net };
    const upd = { [`cmds/${key}`]: full, head: { tick, n: seq + 1 } };
    if (rec.by !== this.me) upd[`req/${rec.id}`] = null;
    this.headPub = tick;
    this.cmds[seq] = full;
    update(ref(db, this.base), upd).catch(e => {
      // écriture refusée : on comble la place par une commande neutre, sinon le journal
      // resterait troué et tous les clients attendraient
      console.warn('journal', e);
      const noop = { id: `noop-${seq}-${this.round}`, by: this.me, tick, c: '{"type":"noop"}', net: -1 };
      this.cmds[seq] = noop;
      update(ref(db, this.base), { [`cmds/${key}`]: noop, ...(rec.by !== this.me ? { [`req/${rec.id}`]: null } : {}) }).catch(() => {});
    });
  }
  onReq(id, v) {
    if (!v || this.ended || this.seen.has(id)) { if (v && this.seen.has(id)) update(ref(db, this.base), { [`req/${id}`]: null }).catch(() => {}); return; }
    // Demande invalide (inconnu, parti, réseau d'un autre siège, contenu illisible) :
    // retirée sans être journalisée — sinon la tête du journal attendrait une commande
    // que les règles refuseraient d'écrire.
    let c = null;
    try { c = JSON.parse(v.c); } catch (_) { /* rejetée ci-dessous */ }
    const netOk = this.kind === 'versus' ? v.net === this.seats[v.by] : v.net === 0;
    if (!this.seats.hasOwnProperty(v.by) || this.left.has(v.by) || !netOk || !c || typeof c.type !== 'string' || c.type === 'speed' || c.type === 'leave') {
      update(ref(db, this.base), { [`req/${id}`]: null }).catch(() => {});
      return;
    }
    this.append({ id, by: v.by, c: v.c, net: v.net });
  }
  onCmd(key, v) {
    const seq = Number(key.slice(1));
    if (!v || this.cmds[seq]) return;
    this.cmds[seq] = v;
    this.seen.add(v.id);
    if (this.host) this.nextSeq = Math.max(this.nextSeq, seq + 1);
  }

  applyRec(rec) {
    let c;
    try { c = JSON.parse(rec.c); } catch (_) { return; }
    if (!c || typeof c !== 'object') return;
    const host = this.hostUid();
    let r = { ok: false, err: 'Commande refusée.' };
    if (c.type === 'leave') { if (rec.by === host) this.applyLeave(c.who); return; }
    let targets;
    if (c.type === 'speed') targets = rec.by === host ? this.states : [];
    else if (this.kind === 'versus') targets = rec.net === this.seats[rec.by] ? [this.states[rec.net]] : [];
    else targets = this.left.has(rec.by) ? [] : [this.states[0]];
    for (const st of targets) r = apply(st, { ...c, by: rec.by });
    if (rec.by === this.me && this.pending.has(rec.id)) {
      const cmd = this.pending.get(rec.id);
      this.pending.delete(rec.id);
      this.game?.result(r, cmd);
    } else if (r.ok && this.kind === 'coop' && this.game && c.type !== 'speed') {
      const who = this.nameOf(rec.by);
      const msg = c.type === 'line' ? (c.s.length ? `${who} modifie la ligne ${c.l + 1}.` : `${who} supprime la ligne ${c.l + 1}.`)
        : c.type === 'reward' ? `${who} a choisi la récompense.` : c.type === 'train' ? `${who} pose une locomotive.` : c.type === 'hub' ? `${who} ouvre un pôle d’échange.` : null;
      if (msg) this.game.toast(msg);
      this.game.peer?.(c);
    }
  }
  applyLeave(who) {
    this.left.add(who);
    if (this.kind === 'versus' && this.seats[who] !== undefined) {
      const st = this.states[this.seats[who]];
      if (!st.over) apply(st, { type: 'forfeit' });
    }
    if (this.game && who !== this.me) this.game.toast(`${this.nameOf(who)} a quitté la partie.`, 'warn');
  }

  // ── horloge ──
  // Dernier tick simulable : la tête du journal, si toutes ses commandes sont arrivées.
  knownTick() {
    for (let i = this.cmdIdx; i < this.head.n; i++) if (!this.cmds[i]) return this.tick;
    return this.head.tick;
  }
  stepOne() {
    const T = this.tick + 1;
    while (this.cmdIdx < this.cmds.length && this.cmds[this.cmdIdx] && this.cmds[this.cmdIdx].tick <= T) this.applyRec(this.cmds[this.cmdIdx++]);
    for (const st of this.states) step(st);
    this.tick = T;
    if (T % 100 === 0) this.hashAt(T);
    if (this.host && T % 600 === 0) set(ref(db, `${this.base}/snap`), { tick: T, s: JSON.stringify({ states: this.states, cmdIdx: this.cmdIdx }) }).catch(() => {});
    this.checkEnd();
  }
  update(ms) {
    if (this.ended) return 0;
    if (this.host) {
      // Reprise après rechargement : rattraper d'abord le journal déjà publié.
      let guard = 0;
      while (this.tick < this.head.tick - LEAD && guard++ < 600) { if (this.knownTick() <= this.tick) break; this.stepOne(); }
      this.acc += Math.min(ms, document.hidden ? 1000 : 250);
      let n = 0;
      while (this.acc >= DT && n < 30 && !this.ended) { this.stepOne(); this.acc -= DT; n++; }
      const now = performance.now();
      const want = this.tick + LEAD;
      if (want > this.headPub && now - this.lastPub > 150) {
        this.headPub = want; this.lastPub = now;
        set(ref(db, `${this.base}/head`), { tick: want, n: this.nextSeq }).catch(() => {});
      }
      return Math.min(1, this.acc / DT);
    }
    const known = this.knownTick();
    const behind = known - this.tick;
    if (behind <= 0) { this.acc = 0; return 0; }
    this.acc += Math.min(ms, 250);
    let n = 0;
    // en retard (reconnexion, onglet revenu) : rattrapage accéléré, sans dépasser la tête
    const extra = behind > LEAD * 3 ? Math.min(400, behind - LEAD) : 0;
    while ((this.acc >= DT || n < extra) && this.tick < known && n < 450 && !this.ended) { this.stepOne(); if (this.acc >= DT) this.acc -= DT; n++; }
    return this.tick < known ? Math.min(1, this.acc / DT) : 0;
  }

  // ── dérive ──
  hashAt(T) {
    const h = stateHash({ s: this.states });
    if (this.host) { set(ref(db, `${this.base}/hash`), { tick: T, h }).catch(() => {}); return; }
    this.myHash.set(T, h);
    if (this.myHash.size > 30) this.myHash.delete(this.myHash.keys().next().value);
    this.checkHash(T);
  }
  checkHash(T) {
    if (!this.myHash.has(T) || !this.hostHash.has(T)) return;
    const same = this.myHash.get(T) === this.hostHash.get(T);
    this.hostHash.delete(T);
    if (same) return;
    this.drifts++;
    console.warn('Mini Subway : dérive détectée au tick', T);
    this.resync();
  }
  async resync() {
    try {
      const s = (await get(ref(db, `${this.base}/snap`))).val();
      if (!s || s.tick > this.tick) return;
      const data = JSON.parse(s.s);
      // Rejoue depuis l'instantané de l'hôte avec le journal (les commandes après lui).
      this.states.splice(0, this.states.length, ...data.states);
      this.tick = s.tick; this.cmdIdx = data.cmdIdx;
      this.game?.toast('Resynchronisation avec l’hôte.');
    } catch (_) { /* nouvelle tentative au prochain écart */ }
  }

  // ── fin de partie ──
  checkEnd() {
    if (this.ended) return;
    if (this.kind === 'coop') {
      const st = this.states[0];
      if (st.over) this.ended = { coop: true, outcome: 'lose', text: 'Défaite collective : le réseau commun a saturé.' };
    } else {
      const [a, b] = this.states;
      if (!a.over && !b.over) return;
      const me = this.states[this.seat], op = this.states[1 - this.seat];
      const outcome = duelOutcome(me, op);
      const why = st => (st.over.reason === 'forfeit' ? 'abandon' : 'saturation');
      const text = me.over && op.over
        ? `Saturation au même instant : ${me.score} contre ${op.score} voyageurs${outcome === 'draw' ? ', match nul.' : '.'}`
        : me.over ? `Votre réseau a cédé le premier (${why(me)}). Vous ${me.score} · adversaire ${op.score}.` : `Le réseau adverse a cédé le premier (${why(op)}). Vous ${me.score} · adversaire ${op.score}.`;
      this.ended = { versus: true, outcome, text, tick: this.tick };
    }
    if (this.ended && this.host) {
      const outcome = this.kind === 'coop' ? 'coop-lose' : this.ended.outcome === 'draw' ? 'draw' : `win:${this.ended.outcome === 'win' ? this.me : Object.keys(this.seats).find(u => u !== this.me)}`.slice(0, 64);
      update(ref(db, this.base), { result: { outcome, tick: this.tick }, phase: 'ended' }).catch(() => {});
    }
  }
  result() { return this.ended && !this.ended.aborted ? this.ended : null; }

  // ── présence (hôte) : pause collective, fenêtre de reconnexion, abandon ──
  hostDuties() {
    if (this.ended) return;
    const pres = this.L.room.presence || {};
    const now = Date.now();
    let missing = false;
    for (const uid of Object.keys(this.seats)) {
      if (uid === this.me || this.left.has(uid)) continue;
      if (pres[uid] != null) { this.absent.delete(uid); continue; }
      if (!this.absent.has(uid)) { this.absent.set(uid, now); this.game?.toast(`${this.nameOf(uid)} est déconnecté : ${Math.round(RECONNECT_MS / 1000)} s pour revenir.`, 'warn'); }
      if (now - this.absent.get(uid) > (window.__msReconnectMs || RECONNECT_MS)) {
        this.absent.delete(uid);
        this.left.add(uid);
        this.append({ id: `leave-${uid.slice(0, 12)}-${this.round}`, by: this.me, c: JSON.stringify({ type: 'leave', who: uid }), net: -1 });
      } else missing = true;
    }
    if (this.kind === 'coop') {
      const st = this.states[0];
      if (missing && !this.autoPaused && st.speed) { this.autoPaused = st.speed; this.submit({ type: 'speed', v: 0 }); }
      if (!missing && this.autoPaused) { const v = this.autoPaused; this.autoPaused = false; this.submit({ type: 'speed', v }); }
    }
  }

  // Bandeau des joueurs (HUD).
  peers() { this.hudDirty = true; }
  hud() {
    const bar = document.getElementById('mp-bar');
    if (!bar) return;
    const pres = this.L.room.presence || {};
    const stalled = !this.host && performance.now() - this.lastHeadAt > 3000 && !this.ended;
    const html = Object.keys(this.seats).sort((a, b) => this.seats[a] - this.seats[b]).map(uid => {
      const on = pres[uid] != null && !this.left.has(uid);
      const tag = uid === this.me ? ' (vous)' : uid === this.hostUid() ? ' · hôte' : '';
      return `<div class="mpp"><span class="pnum">J${this.seats[uid] + 1}</span><span>${escapeHtml(this.nameOf(uid))}${tag}</span>${on ? '' : `<span class="off">${this.left.has(uid) ? 'parti' : 'hors ligne'}</span>`}</div>`;
    }).join('') + (stalled ? '<div class="off">En attente de l’hôte…</div>' : '') + (this.kind === 'coop' && this.autoPaused ? '<div class="off">Pause : joueur déconnecté</div>' : '');
    if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; }
    bar.hidden = false;
    if (this.kind === 'versus') { const n = document.getElementById('opp-name'); if (n) n.textContent = this.nameOf(Object.keys(this.seats).find(u => u !== this.me)); }
  }

  destroy() {
    for (const u of this.unsubs) try { u(); } catch (_) {}
    this.unsubs = [];
    clearInterval(this.watch); clearInterval(this.bg);
    this.ended = this.ended || { aborted: true };
    const bar = document.getElementById('mp-bar');
    if (bar) { bar.hidden = true; bar.dataset.html = ''; }
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
