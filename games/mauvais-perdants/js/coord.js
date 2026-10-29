// Coordinateur du tournoi : tourne dans l'onglet dont l'uid est `coord` (l'hôte, ou le
// membre qui l'a remplacé). Il interroge machine.decide() toutes les 250 ms, calcule les
// résultats (en rejouant les entrées brutes) et écrit l'état. Les autres clients lisent.
//
// Idempotence : chaque transition passe par une transaction sur `match` qui vérifie
// (tid, rk, step, seq) — deux coordinateurs simultanés ou un message rejoué ne peuvent
// pas avancer deux fois. Les totaux sont TOUJOURS recalculés à partir de res/<i> : un
// point ne peut pas être compté deux fois.

import { decide, contenders, gameOf, INTRO_MS, allowed, STALL_MS } from './machine.js';
import { drawPlan, decodePicks, ROUNDS_PER_TOURNAMENT, roundsOf } from './draw.js';
import { round, TIEBREAK } from './rounds/index.js';
import { rankRound, standings, needsTiebreak, tiebreakOrder, awards, FINAL_MULT, MIN_PLAYERS } from './scoring.js';
import { prepare, aiItems, triage, resolve, scoreBac, voteList } from './petitbac.js';
import { roundEvents, boardEvents, speakFor, soloRoundEvents, soloFinal } from './presenter.js';
import { pickLine } from './lines.js';
import { newSeed } from './rng.js';
import { hostLine, judge, aiBase } from './ai.js';
import { serverNow } from './net.js';
import { derive, verdictOf } from './rounds/coffre.js';
import { roomInfo, paramsOf, namesOf, computeRound, computeBac, GHOST, isSolo } from './results.js';
export { paramsOf, namesOf, finalSummary } from './results.js';

const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

const TICK_MS = 250;

export class Coordinator {
  constructor(room) {
    this.room = room;
    this.timer = null;
    this.busy = false;
    this.judging = null;          // { key, done, needsVote }
    this.used = [];               // répliques récentes (pas de répétition)
    this.lineSeq = 0;
    this.skipFlag = false;
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.tick().catch(e => console.warn('coord', e)), TICK_MS); }

  // Salon : accueil, puis une réplique à chaque arrivée (au plus une toutes les 4 s).
  lobbyWatch() {
    const room = this.room;
    if (room.s.phase !== 'lobby') { this.known = null; return; }
    const ids = room.players().map(p => p.uid);
    if (!this.known) {
      this.known = new Set(ids);
      if (!Object.keys(room.s.mc || {}).length) this.sayType('lobby', {});
      return;
    }
    const fresh = ids.filter(u => !this.known.has(u));
    fresh.forEach(u => this.known.add(u));
    if (fresh.length && Date.now() - (this.lastJoin || 0) > 4000) {
      this.lastJoin = Date.now();
      this.sayType('lobby_join', { P: room.s.players[fresh[fresh.length - 1]].name, n: ids.length });
    }
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  skip() { this.skipFlag = true; }

  cfg() { return this.room.s.cfg || { roast: 'soft', crude: false }; }

  // ───────── présentateur
  // Une réplique à la fois : la suivante part 4 s plus tard, si l'étape n'a pas changé
  // (sinon la plus importante, envoyée en premier, serait aussitôt recouverte).
  async say(lines, ctx = {}) {
    const list = lines.filter(Boolean);
    const m0 = this.room.s.match;
    const stepKey = m0 ? `${m0.tid}:${m0.rk}:${m0.step}` : 'lobby';
    const one = async line => {
      const m = this.room.s.match;
      if ((m ? `${m.tid}:${m.rk}:${m.step}` : 'lobby') !== stepKey) return;
      const id = `l${serverNow().toString(36)}${(this.lineSeq++ % 36).toString(36)}`;
      this.used.push(line.id); this.used = this.used.slice(-40);
      await this.room.say(id, { t: line.text.slice(0, 300).replace(/</g, '‹'), ts: serverNow(), ev: (line.ev || '').slice(0, 24), src: 'local' }).catch(() => {});
      this.enrich(id, line, ctx);
    };
    list.slice(1).forEach((line, k) => setTimeout(() => one(line), 4000 * (k + 1)));
    if (list[0]) await one(list[0]);
  }
  sayType(type, ctx) {
    const line = pickLine(type, ctx, { ...this.cfg(), used: this.used });
    return this.say(line ? [{ ...line, ev: type }] : []);
  }
  // L'IA réécrit la réplique si elle répond à temps ; sinon la locale reste.
  async enrich(id, line, ctx) {
    const m = this.room.s.match;
    const cfg = this.cfg();
    const totals = m ? standings(Object.keys(m.roster || {}), m.res || {}, roundsOf(m)) : [];
    const names = m ? namesOf(m) : {};
    const reply = await hostLine({
      code: this.room.code, roast: cfg.roast, crude: !!cfg.crude, event: line.ev || '', facts: line.facts || '',
      round: m && m.i < ROUNDS_PER_TOURNAMENT ? round(gameOf(m)).title : '', roundNo: m ? m.i + 1 : 0,
      players: totals.map(r => ({ name: names[r.uid], total: r.total, place: r.place })), localLine: line.text,
    });
    const now = this.room.s.match;
    // Trop tard (on a changé d'étape) : la réplique locale reste.
    if (!reply || !now || !m || now.step !== m.step || now.rk !== m.rk) return;
    this.room.patchLine(id, { t: reply.text.replace(/</g, '‹'), src: reply.provider });
  }

  // ───────── lancement / revanche / retour au salon
  async startTournament({ rematch = false } = {}) {
    const room = this.room;
    const now = serverNow();
    const online = room.onlineSet(now);
    const players = room.players().filter(p => online.has(p.uid));
    if (players.length < 1) throw Object.assign(new Error('min'), { userMessage: `Il faut au moins ${MIN_PLAYERS} joueurs connectés.` });
    const prev = room.s.match;
    const roster = Object.fromEntries(players.map(p => [p.uid, { name: p.name, c: p.c, dev: p.dev }]));
    // Seul : duel contre Gonzague, qui pose un score de référence à chaque manche.
    const solo = players.length === 1;
    if (solo) roster[GHOST] = { name: 'Gonzague', c: players[0].c === 1 ? 2 : 1, dev: players[0].dev };
    const seed = (typeof window !== 'undefined' && window.__mpSeed) || newSeed();
    // Les manches de la partie précédente : celle qui vient de finir, ou, après un retour au salon (match effacé), celle mémorisée.
    const recent = prev && prev.plan ? prev.plan.map(x => x.g) : (this.lastPlan || []);
    const plan = drawPlan(seed, { devices: players.map(p => p.dev), solo, ai: !!aiBase() }, recent, decodePicks((room.s.cfg || {}).v));
    // Revanche : numéro suivant ; nouveau salon ou retour au salon : numéro neuf (jamais réutilisé d'affilée).
    const tid = `t${prev && prev.tid ? (Number(prev.tid.slice(1)) % 9999) + 1 : 1 + Math.floor(Math.random() * 9999)}`;
    this.lastPlan = plan.map(x => x.g);
    await room.clearRoundData();
    await room.write({
      match: { tid, rk: 'r0', i: 0, step: 'intro', at: now, end: now + INTRO_MS, seq: 1, seed, plan, roster, recent: recent.length ? recent : null },
      phase: 'playing',
    });
    this.judging = null;
    const names = Object.values(roster).map(p => p.name);
    if (rematch && prev && prev.res) {
      const rows = standings(Object.keys(prev.roster), prev.res, roundsOf(prev));
      const pn = namesOf(prev);
      await this.sayType('rematch', { champ: pn[rows[0].uid], last: pn[rows[rows.length - 1].uid] });
    } else await this.sayType(solo ? 'solo_welcome' : 'welcome', { n: names.length, P: players[0].name });
    await this.introLine();
  }
  // Exclure un candidat parti : il sort du tournoi (plus attendu, plus classé) et devient spectateur.
  // Passe par `match`, que le coordinateur écrit déjà : aucune règle de la base à changer.
  async kick(uid) {
    await this.room.txMatch(cur => {
      if (!cur || !cur.roster || !cur.roster[uid] || Object.keys(cur.roster).length < 2) return undefined;
      const roster = { ...cur.roster }; delete roster[uid];
      const next = { ...cur, roster };
      if (cur.tb) { const tb = { ...cur.tb }; delete tb[uid]; next.tb = tb; }
      return next;
    });
  }

  async backToLobby() {
    const cur = this.room.s.match;
    if (cur && cur.plan) this.lastPlan = cur.plan.map(x => x.g);
    await this.room.clearRoundData();
    await this.room.write({ match: null, phase: 'lobby' });
  }

  async introLine() {
    const m = this.room.s.match;
    if (!m) return;
    if (m.i >= ROUNDS_PER_TOURNAMENT) {
      const names = namesOf(m);
      return this.sayType('tiebreak', { names: (m.tb ? Object.keys(m.tb) : []).map(u => names[u]).join(' et ') });
    }
    const def = round(gameOf(m));
    const rows = standings(Object.keys(m.roster), m.res || {}, roundsOf(m));
    const names = namesOf(m);
    const leader = m.i > 0 && rows.filter(r => r.place === 1).length === 1 ? names[rows[0].uid] : null;
    const last = m.i > 0 && rows.length > 2 ? names[rows[rows.length - 1].uid] : null;
    const ctx = { no: m.i + 1, total: roundsOf(m), title: def.title, hint: def.rules[0], leader, last, g: def.id };
    // Dernière manche : l'annonce des points doublés passe avant tout le reste.
    if (m.i === roundsOf(m) - 1 && m.i > 0) return this.sayType('intro_final', ctx);
    return this.sayType(Math.random() < 0.6 ? 'intro_game' : 'intro', ctx);
  }

  // ───────── boucle
  facts(m) {
    const s = this.room.s;
    const now = serverNow();
    const online = this.room.onlineSet(now);
    const tag = `${m.tid}:${m.rk}`;
    const ready = new Set(Object.entries(s.ready || {}).filter(([, v]) => v === tag).map(([u]) => u));
    const voted = new Set(Object.entries(s.ready || {}).filter(([, v]) => v === `${tag}:v`).map(([u]) => u));
    const next = new Set(Object.entries(s.ready || {}).filter(([, v]) => v === `${tag}:n`).map(([u]) => u));
    const submitted = new Set(Object.keys(s.subs || {}));
    // Inactivité : dernière évolution de la progression de chacun, vue par le coordinateur.
    const now0 = Date.now();
    if (!this.seen || this.seen.key !== `${m.tid}:${m.rk}:${m.step}`) this.seen = { key: `${m.tid}:${m.rk}:${m.step}`, at: {}, v: {} };
    const stalled = new Set();
    if (m.step === 'play') for (const u of contenders(m)) {
      const pr = s.prog && s.prog[u];
      const v = pr && pr.k === tag ? pr.v : null;
      if (!(u in this.seen.at) || this.seen.v[u] !== v) { this.seen.at[u] = now0; this.seen.v[u] = v; }
      if (now0 - this.seen.at[u] >= STALL_MS) stalled.add(u);
    }
    const key = `${m.tid}/${m.rk}`;
    const j = this.judging && this.judging.key === key ? this.judging : null;
    let tiebreak = null;
    if (m.step === 'board' && m.i === roundsOf(m) - 1) {
      tiebreak = needsTiebreak(standings(Object.keys(m.roster), m.res || {}, roundsOf(m)));
    }
    const skip = this.skipFlag; this.skipFlag = false;
    return { now, online, ready, next, voted, submitted, stalled, judged: !!(j && j.done), needsVote: j ? j.needsVote : true, tiebreak, skip };
  }

  async tick() {
    if (this.busy) return;
    const room = this.room;
    if (!room.isCoord || room.closed) return;
    this.lobbyWatch();
    const m = room.s.match;
    if (!m || room.s.phase !== 'playing') return;
    // Petit Bac : correction lancée dès l'entrée dans l'étape judge.
    if (m.step === 'judge' && (!this.judging || this.judging.key !== `${m.tid}/${m.rk}`)) this.runJudge(m);
    const f = this.facts(m);
    const next = decide(m, f);
    if (!next) return;
    this.busy = true;
    try { await this.apply(m, next, f); } finally { this.busy = false; }
  }

  async apply(m, next, f) {
    if (!allowed(m.step, next.step)) return;
    const patch = { step: next.step, at: next.at, end: next.end, seq: (m.seq || 0) + 1 };
    if (next.i !== undefined) { patch.i = next.i; patch.rk = `r${next.i}`; }
    if (next.tb) {
      patch.tb = Object.fromEntries(next.tb.map(u => [u, true]));
      patch.tbg = round('gong').eligible(roomInfo(m)) ? 'gong' : 'calcul';
    }
    const extra = {};
    if (next.action === 'score') Object.assign(extra, await this.score(m));
    if (next.action === 'jury') Object.assign(extra, await this.jury(m));
    // Transaction : n'applique que si personne n'a avancé entre-temps.
    const res = await this.room.txMatch(cur => {
      if (!cur || cur.tid !== m.tid || cur.rk !== m.rk || cur.step !== m.step || (cur.seq || 0) !== (m.seq || 0)) return undefined;
      const out = { ...cur, ...patch };
      if (extra.res) out.res = { ...(cur.res || {}), [m.i]: extra.res };
      if (extra.det) out.det = { ...(cur.det || {}), [m.i]: extra.det };
      return out;
    });
    if (!res.committed) return;
    const after = res.snapshot.val();
    if (next.action === 'final') await this.finish(after);
    await this.narrate(m, after, extra);
  }

  // Réponses de la manche : relues à la source (pas seulement l'abonnement local).
  async score(m) {
    const [subs, boasts] = await Promise.all([this.room.readSubs(m.tid, m.rk), this.room.readBoasts(m.tid, m.rk)]);
    if (gameOf(m) === 'bac' && m.i < ROUNDS_PER_TOURNAMENT) {
      const st = this.bacState(m, subs);
      const votes = await this.room.readVotes(m.tid, m.rk);
      const final = resolve(st.prep, st.tri, votes, contenders(m));
      const { res, bac } = computeBac(m, st.prep, final, boasts);
      const det = { kind: 'bac', mode: st.mode, letter: st.params.letter, cats: st.params.cats, cells: Object.fromEntries(Object.entries(bac).map(([u, b]) => [u, b.cells.map(c => { const f = c.group ? final[c.group] : null; return { t: c.text, st: c.st, p: c.pts, w: c.why || '', ...(f ? { src: f.src, no: f.no, of: f.of } : {}) }; })])), votes: Object.fromEntries(Object.entries(final).filter(([, v]) => v.src === 'vote').map(([g, v]) => [g, { no: v.no, of: v.of, s: v.s }])) };
      return { res, det: JSON.stringify(det).slice(0, 30000) };
    }
    // Le Coffre en élimination : le classement vient du journal des tours, pas de ce que chaque client déclare.
    const p = gameOf(m) === 'coffre' ? paramsOf(m) : null;
    if (p && p.mode === 'turns') {
      const d = derive(p, await this.room.readTurns(m.tid, m.rk), m.at);
      for (const uid of Object.keys(subs)) subs[uid] = { ...subs[uid], d: JSON.stringify(verdictOf(d, uid)) };
    }
    const out = computeRound(m, subs, boasts);
    if (out.order) return { det: JSON.stringify({ kind: 'tb', order: out.order, labels: Object.fromEntries(Object.entries(out.scored).map(([u, s]) => [u, s.label])) }) };
    return { res: out.res };
  }

  // ───────── Petit Bac
  bacState(m, subs) {
    const key = `${m.tid}/${m.rk}`;
    if (this.judging && this.judging.key === key && this.judging.prep) return this.judging;
    const params = paramsOf(m);
    const parsed = Object.fromEntries(Object.entries(subs).map(([u, s]) => [u, parse(s.d) || {}]));
    const prep = prepare(parsed, params, contenders(m));
    prep.present = Object.fromEntries(contenders(m).map(u => [u, !!subs[u]]));
    // Coordinateur de relève : reprend la correction publiée (det), sinon tout passe au vote.
    const det = parse((m.det || {})[m.i] || '');
    let tri = triage(prep, {});
    let mode = 'jury';
    if (det && det.kind === 'vote' && det.tri) {
      tri = Object.fromEntries(Object.keys(prep.groups).map(g => [g, { s: det.tri[g] === 'y' ? 'valid' : det.tri[g] === 'n' ? 'invalid' : 'vote', why: '', src: det.tri[g] === 'v' ? 'jury' : 'ia' }]));
      mode = det.mode;
    }
    return { key, params, prep, tri, mode };
  }
  async runJudge(m) {
    const key = `${m.tid}/${m.rk}`;
    const job = this.judging = { key, done: false, needsVote: true };
    this.sayType('judging', {});
    const subs = await this.room.readSubs(m.tid, m.rk);
    const params = paramsOf(m);
    const parsed = Object.fromEntries(Object.entries(subs).map(([u, s]) => [u, parse(s.d) || {}]));
    const prep = prepare(parsed, params, contenders(m));
    prep.present = Object.fromEntries(contenders(m).map(u => [u, !!subs[u]]));
    const out = await judge(aiItems(prep, params), prep, this.room.code);
    // Arrivée après la bascule en jury : ignorée (le vote est déjà ouvert).
    if (this.judging !== job) return;
    const tri = triage(prep, out.ok ? out.verdicts : {});
    const mode = out.ok ? `ia:${out.provider}` : 'jury';
    Object.assign(job, { prep, tri, params, mode, reason: out.reason || null });
    // Ce que voient les joueurs pendant le vote, écrit AVANT de passer à l'étape suivante.
    await this.writeJudgeDetail(m, prep, tri, mode);
    if (this.judging !== job) return;
    job.done = true;
    job.needsVote = voteList(prep, tri).length > 0;
  }
  async jury(m) {
    // Correction en retard : on bascule en jury, sans attendre l'IA.
    const subs = await this.room.readSubs(m.tid, m.rk);
    const st = this.bacState(m, subs);
    this.judging = { ...st, done: true, needsVote: true };
    return { det: JSON.stringify(this.voteDetail(st.prep, st.tri, 'jury', st.params)) };
  }
  voteDetail(prep, tri, mode, params) {
    // tri : verdict provisoire de chaque groupe, pour qu'un coordinateur de relève reprenne la même correction.
    return { kind: 'vote', mode, letter: params.letter, cats: params.cats, tri: Object.fromEntries(Object.entries(tri).map(([g, t]) => [g, t.s === 'vote' ? 'v' : t.s === 'valid' ? 'y' : 'n'])), items: voteList(prep, tri).map(g => ({ g: g.gid, cat: g.cat, t: g.text, why: tri[g.gid].why || '', by: g.uids })) };
  }
  async writeJudgeDetail(m, prep, tri, mode) {
    const det = JSON.stringify(this.voteDetail(prep, tri, mode, paramsOf(m))).slice(0, 30000);
    await this.room.txMatch(cur => {
      if (!cur || cur.tid !== m.tid || cur.rk !== m.rk) return undefined;
      return { ...cur, det: { ...(cur.det || {}), [m.i]: det } };
    });
  }

  // ───────── fin
  async finish(m) {
    await this.room.write({ phase: 'ended' });
  }

  // ───────── commentaires
  async narrate(before, after, extra) {
    const cfg = this.cfg();
    const names = namesOf(after);
    const roster = Object.keys(after.roster);
    if (after.step === 'intro') return this.introLine();
    if (after.step === 'vote') {
      const det = parse((after.det || {})[after.i] || '') || {};
      return this.sayType(det.mode === 'jury' ? 'jury' : 'vote', {});
    }
    if (after.step === 'reveal' && extra.res) {
      const g = gameOf(before);
      const rows = roster.map(uid => ({ uid, ...extra.res[uid], stats: parse(extra.res[uid].st) || {} })).sort((a, b) => a.rank - b.rank);
      const prevRes = before.i > 0 && after.res ? after.res[before.i - 1] : null;
      const lastRound = prevRes ? Object.fromEntries(Object.entries(prevRes).map(([u, r]) => [u, r.rank])) : null;
      const streaks = {};
      for (const uid of roster) { let k = before.i, n = 0; while (k >= 0 && after.res[k] && after.res[k][uid] && after.res[k][uid].rank === 1) { n++; k--; } streaks[uid] = n; }
      let bacInfo = null;
      if (g === 'bac') {
        const det = parse(extra.det || '') || {};
        const weird = [], bold = [];
        Object.entries(det.cells || {}).forEach(([uid, cells]) => cells.forEach((c, k) => {
          if (c.st === 'invalid' && c.t) weird.push({ uid, text: c.t, cat: det.cats[k] });
          if (c.st === 'unique') bold.push({ uid, text: c.t });
        }));
        bacInfo = { weird: weird[Math.floor(Math.random() * weird.length)] || null, bold: bold[Math.floor(Math.random() * bold.length)] || null };
      }
      if (isSolo(after)) return this.say(speakFor(soloRoundEvents(rows, names), { ...cfg, used: this.used }, 1));
      const ev = roundEvents(g, rows, names, roster.length, { lastRound, streaks, bac: bacInfo });
      return this.say(speakFor(ev, { ...cfg, used: this.used }, 2));
    }
    if (after.step === 'reveal' && before.i >= ROUNDS_PER_TOURNAMENT) return null;
    if (after.step === 'board') {
      const prev = standings(roster, Object.fromEntries(Object.entries(after.res || {}).filter(([k]) => Number(k) < before.i)), roundsOf(after));
      const cur = standings(roster, after.res || {}, roundsOf(after));
      if (isSolo(after)) return null;
      return this.say(speakFor(boardEvents(prev, cur, names, before.i, roundsOf(after)), { ...cfg, used: this.used }, 1));
    }
    if (after.step === 'final') {
      const tbDet = parse((after.det || {})[ROUNDS_PER_TOURNAMENT] || '');
      const rows = standings(roster, after.res || {}, roundsOf(after), tbDet && tbDet.order);
      if (isSolo(after)) return this.say(soloFinal(rows, names, { ...cfg, used: this.used }));
      const winners = rows.filter(r => r.place === 1);
      const lines = [];
      const w = pickLine('final_win', { P: winners.map(r => names[r.uid]).join(' et '), total: rows[0].total, gap: rows[1] ? rows[0].total - rows[1].total : 0, O: rows[1] && names[rows[1].uid], shared: winners.length > 1 }, { ...cfg, used: this.used });
      if (w) lines.push({ ...w, ev: 'final_win' });
      if (rows.length > 2) {
        const l = pickLine('final_last', { P: names[rows[rows.length - 1].uid] }, { ...cfg, used: this.used });
        if (l) lines.push({ ...l, ev: 'final_last' });
      }
      return this.say(lines);
    }
    return null;
  }
}

