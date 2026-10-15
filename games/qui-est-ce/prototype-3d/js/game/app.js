// Qui est-ce ? 3D : partie a deux (bot ou en ligne). Ecran de jeu : barre d'etat, 24 suspects
// (portraits pre-rendus, le suspect actif prend vie en 3D), carnet du joueur (mon suspect,
// action du moment, journal de la manche, ou en est l'adversaire).
//
// ?seed : hasard fige ; ?fast : bot sans temps de reflexion (tests) ; ?still : aucune 3D vivante ;
// ?debug : bouton « l'adversaire s'en va » ; ?autostart : partie contre le bot.

import { createNet } from './net-mock.js';
import { startBot } from './bot.js';
import { QUESTIONS, byId } from './questions.js';
import { loadStats, recordGame } from './stats.js';
import { createCast, EXPRESSIONS } from './cast.js';
import { createLive } from './live.js';
import { seedRandom } from '../staging.js';
import { emit } from '../events.js';
import { createSfx } from './sfx.js';

const Q = new URLSearchParams(location.search);
if (Q.has('seed') || Q.has('still')) seedRandom();
const FAST = Q.has('fast'), STILL = Q.has('still');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BOT_NAMES = ['Lina', 'Hugo', 'Margaux', 'Basile'];
const fmt = (ms) => `${Math.floor(ms / 60000)} min ${String(Math.round(ms / 1000) % 60).padStart(2, '0')} s`;
const GROUPS = [['La personne', ['femme', 'jeune', 'senior']],
  ['Les cheveux', ['chauve', 'cheveux-noirs', 'cheveux-bruns', 'cheveux-blonds', 'cheveux-roux', 'cheveux-gris', 'courts', 'mi-longs', 'longs', 'boucles']],
  ['Les yeux', ['yeux-bleus', 'yeux-verts', 'yeux-marron']],
  ['Ce qu’il porte', ['lunettes', 'chapeau', 'barbe', 'moustache', 'boucles-oreilles']]];

let people = [], net, cast = null, live = null, view = null, seat = 'p1', code = '', oppName = 'Lina';
let picked = null, crossed = new Set(), guessMode = false, chosenQ = null, focusI = null;
let lastAskKey = '', lastRound = 0, recorded = 0, ONLINE = false;
const sfx = createSfx();
const portrait = (i, e = 'neutral') => `portraits/${people[i].id}-${e}.webp`;
// Papier de studio de chaque carte : voisins toujours differents, en ligne comme en colonne.
const BG = [0, 3, 1, 4, 2, 5, 4, 1, 5, 2, 0, 3, 2, 5, 3, 0, 4, 1, 5, 0, 4, 1, 3, 2];
const bgOf = (i) => BG[i % 24];
const other = (s) => (s === 'p1' ? 'p2' : 'p1');

// Ligne courte sous le nom : ce que le portrait provisoire ne montre pas toujours (genre, age,
// cheveux). Les accessoires, eux, se voient. Le detail complet est dans la fiche.
function traits(p) {
  const a = p.attributs, hair = a.coupe === 'chauve' ? 'chauve' : `${a.cheveux} ${a.coupe}`;
  return `${a.genre === 'femme' ? '♀' : '♂'} ${a.age} · ${hair}`;
}

function attrs(p) {
  const a = p.attributs;
  const pl = { noir: 'noirs', brun: 'bruns', blond: 'blonds', court: 'courts', long: 'longs', 'mi-long': 'mi-longs', bleu: 'bleus', vert: 'verts' };
  const P = (w) => pl[w] || w;
  return [a.genre, a.age, a.coupe === 'chauve' ? 'chauve' : `cheveux ${P(a.cheveux)} ${P(a.coupe)}${a.cheveux_boucles ? ', bouclés' : ''}`, `yeux ${P(a.yeux)}`,
    a.lunettes && 'lunettes', a.chapeau && 'casquette', a.barbe && 'barbe', a.moustache && 'moustache', a.boucles_oreilles && "boucles d'oreilles"].filter(Boolean);
}

// ── Plateau : 24 suspects ──
function buildLineup() {
  $('#lineup').innerHTML = people.map((p, i) => `<button class="suspect" data-i="${i}" data-bg="${bgOf(i)}" aria-label="${esc(p.prenom)} : ${esc(attrs(p).join(', '))}">
      <span class="shot"><img class="still" alt="" src="${portrait(i)}" width="480" height="600" decoding="async"><img class="still alt" alt="" width="480" height="600" decoding="async"></span>
      <span class="name">${esc(p.prenom)}</span><span class="traits" aria-hidden="true" title="${esc(attrs(p).join(', '))}">${esc(traits(p))}</span><span class="out" aria-hidden="true"></span></button>`).join('');
}
const cardOf = (i) => $(`.suspect[data-i="${i}"]`);

// Expression d'un portrait fixe : fondu entre deux images ; et du personnage vivant s'il est actif.
function express(list, expr, holdS = 0) {
  for (const i of list) {
    const c = cardOf(i); if (!c) continue;
    const delay = reduced ? 0 : Math.random() * 220;           // pas tous ensemble : un groupe, pas une machine
    setTimeout(() => setExpr(c, i, expr), delay);
    live?.express(i, expr);
    clearTimeout(c._t);
    if (holdS) c._t = setTimeout(() => { setExpr(c, i, 'neutral'); live?.express(i, 'neutral'); }, holdS * 1000 + delay);
  }
}
function setExpr(c, i, expr) {
  if (c.dataset.expr === expr || (expr === 'neutral' && !c.dataset.expr)) return;
  const [a, b] = $$('.still', c), front = c.classList.contains('flip') ? b : a, back = front === a ? b : a;
  back.src = portrait(i, expr); c.dataset.expr = expr;
  back.decode().catch(() => {}).then(() => c.classList.toggle('flip', back === b));
}

// ── Rendu de l'etat (vue du joueur) ──
function render(v) {
  const prev = view; view = v;
  const me = v.players[seat], oppSeat = other(seat), opp = v.players[oppSeat];
  if (ONLINE) oppName = opp?.name || 'ton adversaire';
  const myTurn = v.phase === 'play' && v.turn === seat;
  const answering = v.phase === 'play' && v.ask && v.ask.by !== seat && v.ask.answer === null;
  document.body.dataset.phase = v.phase;
  document.body.dataset.turn = v.phase !== 'play' ? 'none' : answering ? 'answer' : myTurn ? 'me' : 'them';
  if (v.round !== lastRound) { lastRound = v.round; newRound(); }
  bar(v, opp);
  secret(v);
  journal(v);
  rival(v, opp);
  reactions(prev, v);
  actions(v);
  if (v.phase === 'end') reveal(v); else $('#reveal').hidden = true;
  $('#away').hidden = !(opp?.left && v.phase !== 'end');
}

function bar(v, opp) {
  const oppSeat = other(seat);
  $('#code').textContent = v.code;
  $('#me-score').textContent = v.scores[seat]; $('#them-score').textContent = v.scores[oppSeat];
  $('#them-name').textContent = oppName; $('#round').textContent = `Manche ${v.round}`;
  $('.who.them').classList.toggle('away', !!opp?.left);
  const st = status(v, opp);
  $('#status-text').textContent = st;
  document.title = `${st} · Qui est-ce ?`;
}
function status(v, opp) {
  if (opp?.left && v.phase !== 'end') return `${oppName} a quitté la partie`;
  if (v.phase === 'lobby') return 'En attente d’un adversaire';
  if (v.phase === 'choose') return v.players[seat].ready ? `${oppName} choisit son suspect…` : 'Choisis ton suspect secret';
  if (v.phase === 'end') return v.winner === seat ? 'Tu gagnes la manche' : `${oppName} gagne la manche`;
  if (v.ask && v.ask.by !== seat && v.ask.answer === null) return `${oppName} te pose une question`;
  if (v.turn === seat) {
    if (v.ask && v.ask.answer === null) return `${oppName} répond…`;
    if (v.ask) {
      const q = byId[v.ask.q], left = people.some((p, i) => !crossed.has(i) && q.test(p.attributs) !== v.ask.answer);
      return `Réponse : ${v.ask.answer ? 'oui' : 'non'}. ${left ? 'Écarte les suspects' : 'Termine ton tour'}`;
    }
    return guessMode ? 'Désigne le suspect de ton adversaire' : 'À toi : pose une question';
  }
  return `${oppName} prépare sa question…`;
}

function secret(v) {
  const box = $('#secret');
  if (v.mySecret === null) { box.dataset.state = v.phase === 'choose' && picked !== null ? 'pick' : 'none'; }
  else box.dataset.state = 'set';
  const i = v.mySecret ?? (v.phase === 'choose' ? picked : null);
  $('#secret img').src = i !== null ? portrait(i) : '';
  $('#secret img').style.visibility = i !== null ? 'visible' : 'hidden';
  $('#secret .s-name').textContent = i !== null ? people[i].prenom : 'Pas encore choisi';
  $('#secret .s-note').textContent = v.mySecret !== null ? `Caché pour ${oppName} jusqu’à la révélation` : i !== null ? 'Pas encore confirmé' : 'Clique un visage du plateau';
  $('#secret .shot').dataset.bg = i !== null ? bgOf(i) : '';
}

function journal(v) {
  const rows = v.log.filter((l) => l.round === v.round);
  $('#log').innerHTML = rows.length ? rows.map((l) => `<li class="${l.by === seat ? 'mine' : 'theirs'}"><span class="j-who">${l.by === seat ? 'Toi' : esc(oppName)}</span>
    <span class="j-q">${esc(byId[l.q].label)}</span><span class="tag ${l.answer ? 'yes' : 'no'}">${l.answer ? 'Oui' : 'Non'}</span></li>`).reverse().join('')
    : '<li class="empty">Aucune question pour l’instant.</li>';
}

function rival(v, opp) {
  const n = 24 - (opp?.crossed.length || 0);
  $('#rival-count').textContent = n;
  $('#rival-name').textContent = oppName;
  $('#rival-bar').style.setProperty('--left', n / 24);
  $('#rival-note').textContent = n <= 3 && v.phase === 'play' ? '· il touche au but' : '';
}

// Reactions des visages : liees aux evenements de la partie, jamais a l'identite d'un secret.
function reactions(prev, v) {
  const liveIs = people.map((_, i) => i).filter((i) => !crossed.has(i));
  const key = v.ask ? `${v.round}:${v.log.length}:${v.ask.by}:${v.ask.q}` : '';
  if (v.ask && v.ask.answer === null && key !== lastAskKey) {
    lastAskKey = key; express(liveIs, 'suspicious', 1.6); emit('question', { by: v.ask.by, q: v.ask.q, mine: v.ask.by === seat });
  }
  if (v.ask && v.ask.by === seat && v.ask.answer !== null && prev?.ask?.answer === null) {
    express(liveIs, v.ask.answer ? 'smile' : 'suspicious', 1.2); emit('answer', { yes: v.ask.answer });   // « surpris » grimacait (revue n° 2)
  }
  if (v.phase === 'play' && prev?.phase === 'choose') emit('start');
}

function questionCount(q) {
  return people.filter((p, i) => !crossed.has(i) && q.test(p.attributs)).length;
}

function actions(v) {
  const box = $('#act'); let html = '';
  const myTurn = v.phase === 'play' && v.turn === seat, left = 24 - crossed.size;
  if (v.phase === 'lobby') {
    html = ONLINE ? `<h2>Envoie ce code à ton adversaire</h2><p class="big-code">${esc(v.code)}</p><button class="btn" data-do="copy">Copier le code</button><p class="hint">La partie commence dès qu’il entre.</p>`
      : `<h2>Salon ${esc(v.code)}</h2><p class="hint">En ligne, tu enverrais ce code. Ici, ${esc(oppName)} attend dans le couloir.</p><button class="btn primary" data-do="bot-join">Faire entrer ${esc(oppName)}</button>`;
  } else if (v.phase === 'choose') {
    html = v.players[seat].ready ? `<h2>C’est noté.</h2><p class="hint">${esc(oppName)} choisit le sien. Personne ne regarde.</p>${thinking()}`
      : `<h2>Choisis ton suspect secret</h2><p class="hint">${esc(oppName)} devra le trouver. Clique un visage, puis confirme.</p>
         <button class="btn primary" data-do="secret"${picked === null ? ' disabled' : ''}>${picked === null ? 'Choisis un visage' : `Garder ${esc(people[picked].prenom)}`}</button>`;
  } else if (v.phase === 'play' && v.ask && v.ask.by !== seat && v.ask.answer === null) {
    const mine = people[v.mySecret];
    html = `<p class="from">${esc(oppName)} demande</p><h2 class="question">${esc(byId[v.ask.q].label)}</h2>
      <div class="yesno"><button class="btn yes" data-do="yes">Oui</button><button class="btn no" data-do="no">Non</button></div>
      <p class="hint">Ton suspect, ${esc(mine.prenom)} : ${esc(attrs(mine).join(', '))}.</p>`;
  } else if (myTurn && v.ask && v.ask.answer === null) {
    html = `<p class="from">Ta question</p><h2 class="question">${esc(byId[v.ask.q].label)}</h2>${thinking(`${esc(oppName)} réfléchit`)}`;
  } else if (myTurn && v.ask && v.ask.answer !== null) {
    const q = byId[v.ask.q], wrong = people.map((p, i) => i).filter((i) => !crossed.has(i) && q.test(people[i].attributs) !== v.ask.answer);
    html = `<p class="from">${esc(q.label)}</p><h2 class="answer ${v.ask.answer ? 'yes' : 'no'}">${v.ask.answer ? 'Oui' : 'Non'}</h2>
      <p class="hint">${wrong.length ? `Clique les visages à écarter. ${wrong.length} ne collent pas.` : 'Tout est déjà écarté. Bien joué.'}</p>
      <div class="row">${wrong.length ? `<button class="btn" data-do="auto">Écarter les ${wrong.length}</button>` : ''}<button class="btn primary" data-do="done">Fin du tour</button></div>`;
  } else if (myTurn && guessMode) {
    html = `<h2>Qui est-ce ?</h2><p class="hint">Clique le suspect que tu accuses. Si tu te trompes, ${esc(oppName)} gagne la manche.</p>
      <div class="row"><button class="btn danger" data-do="guess"${picked === null ? ' disabled' : ''}>${picked === null ? 'Choisis un visage' : `Accuser ${esc(people[picked].prenom)}`}</button><button class="btn ghost" data-do="cancel">Annuler</button></div>`;
  } else if (myTurn) {
    html = `<h2>Ta question</h2><p class="hint">${left} en jeu · le chiffre : combien diraient oui</p>
      <div class="questions">${GROUPS.map(([g, ids]) => `<fieldset><legend>${g}</legend>${ids.map((id) => { const q = byId[id], n = questionCount(q);
        return `<button class="chip${chosenQ === id ? ' on' : ''}" data-q="${id}" aria-pressed="${chosenQ === id}"${n === 0 || n === left ? ' data-useless' : ''}>${esc(q.short.replace(/ \?$/, ''))}<span>${n}</span></button>`; }).join('')}</fieldset>`).join('')}</div>
      <div class="row sticky"><button class="btn primary" data-do="ask"${chosenQ ? '' : ' disabled'}>${chosenQ ? `Demander : ${esc(byId[chosenQ].short)}` : 'Choisis une question'}</button>
      <button class="btn ghost" data-do="guess-mode">Désigner</button></div>`;
  } else if (v.phase === 'play') {
    html = `<h2>${esc(oppName)} prépare sa question</h2>${thinking()}<p class="hint">Profite-en pour observer les visages.</p>`;
  }
  if (box.dataset.key !== html) { box.innerHTML = html; box.dataset.key = html; }
  for (const c of $$('.suspect')) {
    const i = +c.dataset.i;
    c.classList.toggle('picked', picked === i && (v.phase === 'choose' || guessMode));
    c.classList.toggle('x', crossed.has(i));
    c.classList.toggle('mine', v.mySecret === i);
    // apres une reponse a ma question : les suspects qui ne collent pas sont pre-marques
    const q = myTurn && v.ask && v.ask.answer !== null ? byId[v.ask.q] : null;
    c.classList.toggle('nope', !!q && !crossed.has(i) && q.test(people[i].attributs) !== v.ask.answer);
  }
}
const thinking = (label = '') => `<p class="thinking" role="status">${label ? `<span>${label}</span>` : ''}<i></i><i></i><i></i></p>`;

async function send(a) { try { await net.send(code, seat, a); } catch (e) { toast(e.message, true); } }

function cross(i, on) {
  if (on === crossed.has(i)) return;
  if (on) { crossed.add(i); emit('cross', { i }); }
  else { crossed.delete(i); emit('uncross', { i }); }
  live?.hide(i);
  render(view);
}

function newRound() {
  crossed = new Set(); picked = null; guessMode = false; chosenQ = null;
  for (const c of $$('.suspect')) { setExpr(c, +c.dataset.i, 'neutral'); }
  $('#reveal').hidden = true;
}

// ── Fin : la revelation ──
function reveal(v) {
  const oppSeat = other(seat);
  const won = v.winner === seat, theirs = v.reveal[oppSeat], mine = v.reveal[seat];
  if (theirs === null || theirs === undefined || mine === null || mine === undefined) return;   // en ligne : secrets en route
  const myQs = v.log.filter((l) => l.round === v.round && l.by === seat).length;
  const ms = (v.endedAt || Date.now()) - v.startedAt;
  const g = v.guess;
  const line = won ? (g.by === seat ? `Trouvé en ${myQs} question${myQs > 1 ? 's' : ''}.` : `${oppName} a accusé ${people[g.id].prenom}. Raté.`)
    : (g.by === seat ? `Ce n’était pas ${people[g.id].prenom}.` : `${oppName} t’a démasqué.`);
  $('#reveal').dataset.won = won ? '1' : '0';
  $('#reveal-title').textContent = won ? 'Tu gagnes la manche' : `${oppName} gagne la manche`;
  $('#reveal-sub').textContent = `${line} ${fmt(ms)}.`;
  $('#reveal-pair').innerHTML = [[theirs, `Le suspect de ${oppName}`, won ? 'smile' : 'suspicious'], [mine, 'Ton suspect', won ? 'surprised' : 'smile']]
    .map(([id, who, e], k) => ` <figure class="unveil" data-bg="${bgOf(id)}" style="--d:${k * 0.35}s"><span class="shot"><img alt="${esc(people[id].prenom)}" src="${portrait(id, e)}"></span>
      <figcaption><span>${esc(who)}</span><b>${esc(people[id].prenom)}</b></figcaption></figure>`).join('');
  $('#reveal-score').innerHTML = `<span>Toi <b>${v.scores[seat]}</b></span><span aria-hidden="true">–</span><span><b>${v.scores[oppSeat]}</b> ${esc(oppName)}</span>`;
  if (recorded !== v.round) {
    recorded = v.round;
    const titles = recordGame({ opponent: oppName, won, questions: myQs, ms, mySecret: mine, guessRight: !!(g.by === seat && g.right), guessedByMe: g.by === seat, candidatesLeft: 24 - crossed.size });
    const st = loadStats().byOpponent[oppName];
    const t = titles[0];
    $('#reveal-note').innerHTML = (t ? `<b>${esc(t.name)}</b> — ${esc(t.hint.charAt(0).toLowerCase() + t.hint.slice(1))}. ` : '') + (st ? `Contre ${esc(oppName)} : ${st.won} sur ${st.played}.` : '');
    emit(won ? 'win' : 'lose'); emit('reveal');
  }
  $('#rematch').textContent = v.rematch[seat] ? `${oppName} doit accepter…` : 'Revanche';
  $('#rematch').disabled = !!v.rematch[seat];
  $('#reveal').hidden = false;
}

// Planche contact partageable : mes 24 suspects, mes croix, le score ; export PNG.
async function contactSheet() {
  const v = view, oppSeat = other(seat), css = getComputedStyle(document.documentElement);
  const cw = 160, chh = 200, gap = 10, pad = 24, cols = 6, rows = 4, head = 76;
  const cv = document.createElement('canvas'); cv.width = pad * 2 + cols * cw + (cols - 1) * gap; cv.height = head + rows * (chh + 30) + pad;
  const g = cv.getContext('2d'), col = (n) => css.getPropertyValue(n).trim();
  g.fillStyle = col('--room'); g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = col('--on-room'); g.font = `600 30px ${col('--font-title')}`; g.fillText('Qui est-ce ?', pad, 46);
  g.font = `500 16px ${col('--font-text')}`; g.fillText(`Partie ${v.code} · manche ${v.round} · Toi ${v.scores[seat]} – ${v.scores[oppSeat]} ${oppName}`, pad + 220, 44);
  const ims = await Promise.all(people.map((_, i) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = portrait(i); })));
  ims.forEach((im, i) => {
    const x = pad + (i % cols) * (cw + gap), y = head + Math.floor(i / cols) * (chh + 30);
    g.fillStyle = col(`--set-${bgOf(i)}`); g.fillRect(x, y, cw, chh);
    if (im) g.drawImage(im, x, y, cw, chh);
    if (crossed.has(i)) { g.fillStyle = 'rgba(12,20,24,.62)'; g.fillRect(x, y, cw, chh); }
    g.fillStyle = col('--on-room'); g.font = `500 14px ${col('--font-text')}`; g.fillText(people[i].prenom, x, y + chh + 20);
  });
  return cv.toDataURL('image/png');
}

function toast(text, warn = false) {
  const b = $('#toast'); b.textContent = text; b.classList.toggle('warn', warn); b.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { b.hidden = true; }, 3800);
}

// Fiche du suspect observe (survol, focus, toucher) : les attributs restent accessibles sans survol.
function observe(i) {
  focusI = i;
  const f = $('#fiche');
  if (i === null) { f.dataset.on = '0'; $('#fiche b').textContent = 'Visages provisoires'; $('#fiche span').textContent = provisional(); return; }
  f.dataset.on = '1';
  $('#fiche b').textContent = people[i].prenom;
  $('#fiche span').textContent = attrs(people[i]).join(' · ');
}

// Honnetete : la plupart des visages sont provisoires (le 01 grime) ; on le dit, et on renvoie a la legende.
function provisional() {
  const own = people.filter((p) => p.glb || p.statut === 'modelise').map((p) => p.prenom);
  return `seuls ${own.join(', ')} ont leur propre visage ; les autres portent celui de Raphaël, grimé. Fie-toi à la ligne sous chaque nom.`;
}

function activate(c, e) {
  if (!live || !c || c.classList.contains('x')) return;
  const shot = $('.shot', c), r = shot.getBoundingClientRect();
  const ptr = e ? { x: Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)) * 0.9, y: Math.max(-1, Math.min(1, -((e.clientY - r.top) / r.height * 2 - 0.8))) * 0.8, active: true }
    : { x: 0, y: 0.05, active: true };
  live.show(+c.dataset.i, shot, ptr);
}

function wireUi() {
  document.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-do]')?.dataset.do;
    const chip = e.target.closest('[data-q]');
    const card = e.target.closest('.suspect');
    if (chip) { chosenQ = chip.dataset.q; emit('select'); return render(view); }
    if (card && view) {
      const i = +card.dataset.i, v = view;
      observe(i);
      if (v.phase === 'choose' && !v.players[seat].ready) { picked = i; emit('pick', { i }); return render(v); }
      if (v.phase === 'play' && v.turn === seat && guessMode) { if (!crossed.has(i)) { picked = i; emit('select'); } return render(v); }
      if (v.phase === 'play') return cross(i, !crossed.has(i));
      return;
    }
    switch (d) {
      case 'bot-join': await joinBot(); break;
      case 'secret': if (picked !== null) { const id = picked; picked = null; emit('confirm'); await send({ type: 'secret', id }); } break;
      case 'ask': if (chosenQ) { const q = chosenQ; chosenQ = null; emit('ask'); await send({ type: 'ask', q }); } break;
      case 'yes': case 'no': emit('reply', { yes: d === 'yes' }); await send({ type: 'answer', yes: d === 'yes' }); break;
      case 'auto': {
        const q = byId[view.ask.q];
        people.forEach((p, i) => { if (!crossed.has(i) && q.test(p.attributs) !== view.ask.answer) cross(i, true); }); break;
      }
      case 'done': emit('confirm'); await send({ type: 'done', crossed: [...crossed] }); break;
      case 'guess-mode': guessMode = true; picked = null; render(view); break;
      case 'cancel': guessMode = false; picked = null; render(view); break;
      case 'guess': if (picked !== null) { guessMode = false; const id = picked; picked = null; emit('accuse'); await send({ type: 'guess', id }); } break;
      case 'rematch': emit('rematch'); await send({ type: 'rematch' }); break;
      case 'share': {
        const url = await contactSheet();
        const a = document.createElement('a'); a.href = url; a.download = `qui-est-ce-${view.code}-manche-${view.round}.png`; a.click();
        window.__lastSheet = url; break;
      }
      case 'copy': try { await navigator.clipboard.writeText(code); toast('Code copié'); } catch (_) { toast(code); } break;
      case 'sound': sfx.toggle(); $('#sound').setAttribute('aria-pressed', String(sfx.on)); $('#sound span').textContent = sfx.on ? 'Son activé' : 'Son coupé'; if (sfx.on) sfx.play('select'); break;
      case 'home': location.href = location.pathname + location.search.replace(/[?&]autostart/, ''); break;
      case 'leave-sim': await net.send(code, other(seat), { type: 'leave' }); break;
      case 'play-bot': await start(true); break;
      case 'online-create': await online(false); break;
      case 'online-join': await online(true); break;
      case 'create': await start(false); break;
    }
  });
  const lineup = $('#lineup');
  document.addEventListener('keydown', (e) => {
    const c = e.target.closest?.('.suspect');
    if (e.key === 'Escape') { if (guessMode) { guessMode = false; picked = null; render(view); } return; }
    if (!c) return;
    const cols = getComputedStyle(lineup).gridTemplateColumns.split(' ').length;
    const to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (to !== undefined) { e.preventDefault(); cardOf(Math.max(0, Math.min(23, +c.dataset.i + to)))?.focus(); }
  });
  lineup.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const c = e.target.closest('.suspect'); if (!c) return;
    if (focusI !== +c.dataset.i) observe(+c.dataset.i);
    activate(c, e);
  });
  lineup.addEventListener('pointerleave', () => { live?.hide(); observe(null); });
  lineup.addEventListener('focusin', (e) => { const c = e.target.closest('.suspect'); if (c) { observe(+c.dataset.i); if (c.matches(':focus-visible')) activate(c); } });
  lineup.addEventListener('focusout', (e) => { const c = e.target.closest('.suspect'); if (c && !c.contains(e.relatedTarget)) live?.hide(+c.dataset.i); });
  addEventListener('resize', () => live?.reposition());
  addEventListener('scroll', () => live?.reposition(), { passive: true });
}

async function joinBot() {
  await net.join(code, { name: oppName });
  startBot(net, code, other(seat), people, { think: FAST ? [20, 40] : [900, 1900], onSay: (t) => toast(`${oppName} : ${t}`) });
}

async function start(vsBot) {
  oppName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  document.body.dataset.screen = 'game';
  ({ code } = await net.create({ name: 'Toi' }));
  net.subscribe(code, seat, render);
  if (vsBot) await joinBot();
}

// En ligne (games/qui-est-ce/v3d/, window.QE_ONLINE) : Firebase n'est charge qu'ici, a la demande.
async function online(join) {
  const name = ($('#my-name').value || 'Anonyme').trim().slice(0, 20); try { localStorage.setItem('qe3d.name', name); } catch (_) {}
  try {
    const [{ db, ensureAuth }, fb, { createNetFirebase }] = await Promise.all([
      import('../../../../../shared/firebase.js'), import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'), import('./net-firebase.js')]);
    const user = await ensureAuth();
    net = createNetFirebase({ db, uid: user.uid, fb }); ONLINE = true;
    if (join) { code = $('#join-code').value.trim().toUpperCase(); ({ seat } = await net.join(code, { name })); }
    else { ({ code, seat } = await net.create({ name })); }
  } catch (e) { toast(e.message, true); return; }
  document.body.dataset.screen = 'game';
  net.subscribe(code, seat, render);
}

async function main() {
  people = (await (await fetch('data/roster.json')).json()).personnages;
  net = createNet();
  buildLineup();
  wireUi();
  observe(null);
  $('.home .provisional').innerHTML = `<b>Visages provisoires.</b> ${esc(provisional())}`;
  $('#sound').setAttribute('aria-pressed', String(sfx.on)); $('#sound span').textContent = sfx.on ? 'Son activé' : 'Son coupé';
  await Promise.all($$('#lineup img.still:not(.alt)').map((im) => im.decode().catch(() => {})));
  $$('.home-cast img').forEach((im, k) => { im.src = portrait([4, 0, 9, 14, 21][k], ['smile', 'suspicious', 'neutral', 'surprised', 'neutral'][k]); });
  if (!STILL) {                                                   // la 3D vivante se charge apres les images
    cast = createCast(people);
    live = createLive({ host: $('#game'), cast, reduced });
  }
  if (Q.has('debug')) $('#debug').hidden = false;
  if (window.QE_ONLINE) { $('#online').hidden = false; $('[data-do=create]').hidden = true; try { $('#my-name').value = localStorage.getItem('qe3d.name') || ''; } catch (_) {} }
  window.__game = { net: () => net, view: () => view, seat: () => seat, people, live: () => live, cross, crossed: () => [...crossed], send, start, contactSheet,
    pick: (i) => { picked = i; render(view); }, guessMode: (on) => { guessMode = on; render(view); }, observe };
  document.documentElement.dataset.ready = '1';
  // Precharge discrete : les autres expressions, puis les modeles 3D des premiers suspects.
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  idle(() => { for (const p of people) for (const e of EXPRESSIONS.slice(1)) { const im = new Image(); im.src = `portraits/${p.id}-${e}.webp`; } });
  if (Q.has('autostart')) await start(true);
}

main().catch((e) => { $('#toast').textContent = 'Erreur : ' + e.message; $('#toast').hidden = false; console.error(e); });
