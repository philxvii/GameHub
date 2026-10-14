// Partie a deux du Qui est-ce ? 3D, contre un bot, derriere le reseau factice (net-mock.js).
// Direction : casting (Polaroids, scotch, crayon gras) + revelation du salon + revanche en un clic.
// Aucun son : les evenements du jeu sont emis (events.js) pour un futur module.
//
// ?seed : hasard fige ; ?fast : bot sans temps de reflexion (tests) ; ?still : pas d'animation ;
// ?debug : bouton « l'adversaire s'en va » ; ?char=<glb> : personnage de base.

import { createNet } from './net-mock.js';
import { startBot } from './bot.js';
import { QUESTIONS, byId } from './questions.js';
import { loadStats, recordGame } from './stats.js';
import { createBoard3D } from './board3d.js';
import { seedRandom } from '../staging.js';
import { emit } from '../events.js';

const Q = new URLSearchParams(location.search);
if (Q.has('seed') || Q.has('still')) seedRandom();
const FAST = Q.has('fast');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CROSS = '<svg class="cross" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M14 12 C40 38 62 60 88 90"/><path pathLength="1" d="M86 10 C60 40 38 62 12 88"/></svg>';
const CIRCLE = '<svg class="circle" viewBox="0 0 120 140" aria-hidden="true"><path pathLength="1" d="M60 8 C104 6 116 50 112 78 C108 118 72 136 48 130 C14 122 4 84 8 56 C12 24 38 10 70 12 C96 16 112 38 110 60"/></svg>';
const BOT_NAMES = ['Lina', 'Hugo', 'Margaux', 'Basile'];
const fmt = (ms) => `${Math.floor(ms / 60000)} min ${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

let people = [], net, board, view = null, seat = 'p1', code = '', oppName = 'Lina', picked = null, crossed = new Set(), guessMode = false, chosenQ = null;
let lastAskKey = '', lastRound = 0, recorded = 0, portraits = [], hd = {};

function attrs(p) {
  const a = p.attributs;
  return [a.genre, a.age, a.coupe === 'chauve' ? 'chauve' : `cheveux ${a.cheveux} ${a.coupe}${a.cheveux_boucles ? ', bouclés' : ''}`, `yeux ${a.yeux}`,
    a.lunettes && 'lunettes', a.chapeau && 'casquette', a.barbe && 'barbe', a.moustache && 'moustache', a.boucles_oreilles && "boucles d'oreilles"].filter(Boolean).join(' · ');
}

function buildBoard() {
  const el = $('#board');
  el.innerHTML = people.map((p, i) => `<figure class="pola card" data-i="${i}" tabindex="0" role="button" aria-label="${p.prenom}" style="--tilt:${(((i * 37) % 7) - 3) * 0.5}deg">
      <div class="portrait"></div><figcaption>${p.prenom}</figcaption>${CROSS}${CIRCLE}
      <p class="fiche" aria-hidden="true">${attrs(p)}${p.statut === 'modelise' ? '' : '<em>substitut provisoire</em>'}</p></figure>`).join('');
  return $$('.card', el);
}

// ── Rendu de l'etat (vue du joueur) ──
function render(v) {
  const prev = view; view = v;
  const me = v.players[seat], oppSeat = seat === 'p1' ? 'p2' : 'p1', opp = v.players[oppSeat];
  document.body.dataset.phase = v.phase;
  document.body.dataset.turn = v.phase === 'play' ? (v.turn === seat ? 'me' : 'them') : 'none';
  $('#code').textContent = v.code;
  $('#score').innerHTML = `<span>Toi ${v.scores[seat]}</span><span>${v.scores[oppSeat]} ${oppName}</span>`;
  const left = 24 - crossed.size, oppLeft = 24 - (opp?.crossed.length || 0);
  $('#players').innerHTML = `
    <div class="player me${v.phase === 'play' && v.turn === seat ? ' on' : ''}"><span class="tally"></span><span class="pname">Toi</span><span class="pleft">${left} en jeu</span></div>
    <div class="player them${v.phase === 'play' && v.turn === oppSeat ? ' on' : ''}${opp?.left ? ' away' : ''}"><span class="tally"></span><span class="pname">${oppName}</span><span class="pleft">${opp?.left ? 'hors ligne' : `${oppLeft} en jeu`}</span></div>`;
  if (v.round !== lastRound) { lastRound = v.round; newRound(); }
  // mon secret, toujours visible une fois choisi
  if (v.mySecret !== null && portraits[v.mySecret]) {
    hd[v.mySecret] ||= board.portraitHD(v.mySecret);
    $('#mine').hidden = false; $('#mine img').src = hd[v.mySecret]; $('#mine figcaption').textContent = people[v.mySecret].prenom;
  } else $('#mine').hidden = true;
  // planche de l'adversaire : ses croix (jamais son secret)
  $('#their-sheet').innerHTML = `<p class="sheet-label">La planche de ${oppName} : ${oppLeft} en jeu</p><div class="frames">${people.map((_, i) =>
    `<span class="frame${opp?.crossed.includes(i) ? ' x' : ''}"><img alt="" src="${portraits[i] || ''}">${opp?.crossed.includes(i) ? CROSS : ''}<i>${i + 1}A</i></span>`).join('')}</div>`;
  $('#log').innerHTML = v.log.filter((l) => l.round === v.round).map((l, k) =>
    `<li class="${l.by === seat ? 'mine-q' : 'their-q'}"><b>${l.by === seat ? 'Toi' : oppName}</b> ${byId[l.q].short} <em>${l.answer ? 'oui' : 'non'}</em></li>`).join('');
  reactions(prev, v);
  actions(v);
  if (v.phase === 'end') reveal(v);
  else $('#reveal').hidden = true;
  $('#away').hidden = !(opp?.left && v.phase !== 'end');
}

// Reactions des visages : liees aux evenements du jeu, jamais a l'identite du secret.
function reactions(prev, v) {
  if (!board) return;
  const live = people.map((_, i) => i).filter((i) => !crossed.has(i));
  const key = v.ask ? `${v.round}:${v.log.length}:${v.ask.by}:${v.ask.q}` : '';
  if (v.ask && v.ask.answer === null && key !== lastAskKey) {           // question posee : mefiance generale
    lastAskKey = key; board.express(live, 'suspicious', 1.6); emit('question', { by: v.ask.by, q: v.ask.q });
  }
  if (v.ask && v.ask.by === seat && v.ask.answer !== null && prev?.ask?.answer === null) {   // reponse a ma question
    board.express(live, v.ask.answer ? 'smile' : 'surprised', 1.4); emit('answer', { yes: v.ask.answer });
  }
}

function actions(v) {
  const box = $('#action'); const oppSeat = seat === 'p1' ? 'p2' : 'p1';
  box.className = 'action'; let html = '';
  const myTurn = v.phase === 'play' && v.turn === seat;
  if (v.phase === 'lobby') {
    html = `<p class="ask-label">Salon ${v.code} : envoie ce code… ou laisse ${oppName} entrer.</p><button class="tape-btn film" data-do="bot-join">Faire entrer ${oppName}</button>`;
  } else if (v.phase === 'choose') {
    box.classList.add('me');
    html = v.players[seat].ready ? `<p>${oppName} choisit son personnage… pas de triche, on regarde ailleurs.</p>`
      : `<p class="ask-label">Choisis ton personnage secret</p><p class="guess">${picked !== null ? people[picked].prenom : '…'}</p>
         <button class="tape-btn film" data-do="secret"${picked === null ? ' disabled' : ''}>C'est mon personnage</button><p class="hint">${oppName} ne le verra qu'à la révélation.</p>`;
  } else if (v.phase === 'play' && v.ask && v.ask.by !== seat && v.ask.answer === null) {
    box.classList.add('them', 'answer');
    html = `<div class="incoming"><p class="from">${oppName} demande</p><p class="question">${byId[v.ask.q].label}</p></div>
      <button class="tape-btn" data-do="yes">Oui</button><button class="tape-btn film" data-do="no">Non</button>
      <p class="hint">Réponds honnêtement : les secrets sont vérifiés à la fin.</p>`;
  } else if (myTurn && v.ask && v.ask.answer === null) {
    box.classList.add('them', 'waiting');
    html = `<p>${byId[v.ask.q].label}</p><p>${oppName} réfléchit</p><span class="reel"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  } else if (myTurn && v.ask && v.ask.answer !== null) {
    box.classList.add('me');
    html = `<p class="ask-label">${byId[v.ask.q].label}</p><p class="guess">${v.ask.answer ? 'Oui.' : 'Non.'}</p>
      <p class="hint">Raye ceux qui ne collent pas (clic sur les Polaroïds).</p>
      <button class="tape-btn" data-do="auto">Laisse faire le stagiaire</button><button class="tape-btn film" data-do="done">Fin du tour</button>`;
  } else if (myTurn) {
    box.classList.add('me');
    if (guessMode) {
      html = `<p class="ask-label">Tu penses que c'est…</p><p class="guess">${picked !== null ? people[picked].prenom : 'clique un Polaroïd'}</p>
        <button class="tape-btn film" data-do="guess"${picked === null ? ' disabled' : ''}>C'est lui ou elle !</button><button class="tape-btn" data-do="cancel">Je me ravise</button>
        <p class="hint">Si tu te trompes, ${oppName} gagne la manche.</p>`;
    } else {
      html = `<p class="ask-label">Ta question</p><div class="chips">${QUESTIONS.map((q) => `<button class="chip${chosenQ === q.id ? ' picked' : ''}" data-q="${q.id}">${q.short}</button>`).join('')}</div>
        <button class="tape-btn film" data-do="ask"${chosenQ ? '' : ' disabled'}>Poser la question</button><button class="tape-btn" data-do="guess-mode">Désigner</button>`;
    }
  } else if (v.phase === 'play') {
    box.classList.add('them', 'waiting');
    html = `<p>${oppName} prépare sa question</p><span class="reel"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  }
  box.innerHTML = html;
  for (const c of $$('.card')) {
    const i = +c.dataset.i;
    c.classList.toggle('o', picked === i && (v.phase === 'choose' || guessMode));
    c.classList.toggle('x', crossed.has(i));
  }
}

async function send(a) { try { await net.send(code, seat, a); } catch (e) { say(e.message, true); } }

function cross(i, on) {
  if (on === crossed.has(i)) return;
  if (on) { crossed.add(i); board.express([i], 'surprised', 0); setTimeout(() => board.setOut(i, true), reduced ? 0 : 260); emit('cross', { i }); }
  else { crossed.delete(i); board.setOut(i, false); }
  render(view);
}

function newRound() {
  crossed = new Set(); picked = null; guessMode = false; chosenQ = null;
  if (board) for (const c of board.cards) { board.setOut(c.i, false); board.express([c.i], 'neutral'); }
  $('#reveal').hidden = true;
}

// ── Fin : la revelation du salon ──
function reveal(v) {
  const oppSeat = seat === 'p1' ? 'p2' : 'p1';
  const won = v.winner === seat, theirs = v.reveal[oppSeat], mine = v.reveal[seat];
  const myQs = v.log.filter((l) => l.round === v.round && l.by === seat).length;
  const ms = (v.endedAt || Date.now()) - v.startedAt;
  const g = v.guess;
  let line = won ? (g.by === seat ? `Trouvé en ${myQs} question${myQs > 1 ? 's' : ''}. Le studio applaudit.` : `${oppName} a désigné ${people[g.id].prenom}… raté. Merci pour le cadeau.`)
    : (g.by === seat ? `Ce n'était pas ${people[g.id].prenom}. Le crayon gras est cruel.` : `${oppName} t'a démasqué. Il paraît que ça arrive aux meilleurs.`);
  $('#reveal-title').textContent = won ? 'Tu gagnes la manche' : `${oppName} gagne la manche`;
  $('#reveal-sub').textContent = `${line} · ${fmt(ms)}`;
  hd[theirs] ||= board.portraitHD(theirs); hd[mine] ||= board.portraitHD(mine);
  $('#hang').innerHTML = [[theirs, `Le secret de ${oppName}`, won ? 'Trouvé par toi' : 'Il t’a échappé', won], [mine, 'Ton secret', g.by === oppSeat && g.right ? `Trouvé par ${oppName}` : 'Bien gardé', !won]]
    .map(([id, who, note, dot], k) => `<figure class="hung${dot ? ' win' : ''}"> <div class="gilt"><img alt="${people[id].prenom}" src="${hd[id]}" style="animation-delay:${0.3 + k * 0.6}s"></div>
      <figcaption class="cartel"><p class="c-title"><i>${people[id].prenom}</i></p><p>${who}</p><p class="c-num">${note}</p>${dot ? '<span class="dot" aria-hidden="true"></span>' : ''}</figcaption></figure>`).join('');
  $('#final-score').innerHTML = `<span>Toi ${v.scores[seat]}</span><span>${v.scores[oppSeat]} ${oppName}</span>`;
  if (recorded !== v.round) {
    recorded = v.round;
    const titles = recordGame({ opponent: oppName, won, questions: myQs, ms, mySecret: mine, guessRight: !!(g.by === seat && g.right),
      guessedByMe: g.by === seat, candidatesLeft: 24 - crossed.size });
    const st = loadStats().byOpponent[oppName];
    $('#titles').innerHTML = (titles.length ? titles.map((t) => `<li class="title"><b>${t.name}</b> ${t.hint}</li>`).join('') : '')
      + (st ? `<li>Contre ${oppName} : ${st.won} victoire${st.won > 1 ? 's' : ''} sur ${st.played}, ${st.avgQuestions} questions en moyenne${st.favoriteId !== null ? `, ton chouchou : ${people[st.favoriteId].prenom}` : ''}</li>` : '');
    emit('end', { won });
    if (board) { board.express([theirs, mine].filter((i) => !crossed.has(i)), 'smile', 2); }
  }
  $('#rematch').textContent = v.rematch[seat] ? `En attente de ${oppName}…` : 'Revanche';
  $('#reveal').hidden = false;
}

// Planche contact partageable : mes 24 vues, mes croix, le score ; export PNG.
function contactSheet() {
  const v = view, oppSeat = seat === 'p1' ? 'p2' : 'p1';
  const cw = 150, chh = 200, pad = 14, cols = 6, rows = 4, head = 64;
  const cv = document.createElement('canvas'); cv.width = pad * 2 + cols * cw + (cols - 1) * 8; cv.height = head + pad + rows * (chh + 22) + pad;
  const g = cv.getContext('2d');
  g.fillStyle = '#171615'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#E8A33D'; g.font = '500 18px "DM Mono", monospace';
  g.fillText(`Qui est-ce ? · partie ${v.code} · Toi ${v.scores[seat]} – ${v.scores[oppSeat]} ${oppName}`, pad, 36);
  const loads = people.map((_, i) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = portraits[i]; }));
  return Promise.all(loads).then((ims) => {
    ims.forEach((im, i) => {
      const x = pad + (i % cols) * (cw + 8), y = head + Math.floor(i / cols) * (chh + 22);
      if (im) g.drawImage(im, x, y, cw, chh);
      g.fillStyle = '#E8A33D'; g.font = '12px "DM Mono", monospace'; g.fillText(`${i + 1}A ${people[i].prenom}`, x, y + chh + 15);
      if (crossed.has(i)) {
        g.strokeStyle = '#C42F25'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + 18, y + 22); g.bezierCurveTo(x + 60, y + 80, x + 100, y + 130, x + cw - 16, y + chh - 20);
        g.moveTo(x + cw - 18, y + 20); g.bezierCurveTo(x + 100, y + 80, x + 50, y + 130, x + 16, y + chh - 22); g.stroke();
      }
    });
    return cv.toDataURL('image/png');
  });
}

function say(text, warn = false) {
  const b = $('#bubble'); b.textContent = text; b.classList.toggle('warn', warn); b.hidden = false;
  clearTimeout(say.t); say.t = setTimeout(() => { b.hidden = true; }, 3800);
}

function wireUi() {
  document.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-do]')?.dataset.do;
    const chip = e.target.closest('[data-q]');
    const card = e.target.closest('.card');
    if (chip) { chosenQ = chip.dataset.q; return render(view); }
    if (card && view) {
      const i = +card.dataset.i, v = view;
      if (v.phase === 'choose' && !v.players[seat].ready) { picked = i; emit('pick', { i }); return render(v); }
      if (v.phase === 'play' && v.turn === seat && guessMode) { if (!crossed.has(i)) picked = i; return render(v); }
      if (v.phase === 'play') return cross(i, !crossed.has(i));
      return;
    }
    switch (d) {
      case 'bot-join': await joinBot(); break;
      case 'secret': if (picked !== null) await send({ type: 'secret', id: picked }); picked = null; break;
      case 'ask': if (chosenQ) { const q = chosenQ; chosenQ = null; await send({ type: 'ask', q }); } break;
      case 'yes': case 'no': await send({ type: 'answer', yes: d === 'yes' }); break;
      case 'auto': {
        const q = byId[view.ask.q];
        people.forEach((p, i) => { if (q.test(p.attributs) !== view.ask.answer) cross(i, true); });
        say('Le stagiaire a rayé. Il a fait de son mieux.'); break;
      }
      case 'done': await send({ type: 'done', crossed: [...crossed] }); break;
      case 'guess-mode': guessMode = true; picked = null; render(view); break;
      case 'cancel': guessMode = false; picked = null; render(view); break;
      case 'guess': if (picked !== null) { guessMode = false; const id = picked; picked = null; await send({ type: 'guess', id }); } break;
      case 'rematch': emit('rematch'); await send({ type: 'rematch' }); break;
      case 'share': {
        const url = await contactSheet();
        const a = document.createElement('a'); a.href = url; a.download = `qui-est-ce-${view.code}-manche-${view.round}.png`; a.click();
        window.__lastSheet = url; break;
      }
      case 'home': location.href = location.pathname + location.search; break;
      case 'leave-sim': await net.send(code, seat === 'p1' ? 'p2' : 'p1', { type: 'leave' }); break;
      case 'play-bot': await start(true); break;
      case 'create': await start(false); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    const c = e.target.closest?.('.card'); if (!c) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); return; }
    const cols = getComputedStyle($('#board')).gridTemplateColumns.split(' ').length;
    const to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (to !== undefined) { e.preventDefault(); $$('.card')[Math.max(0, Math.min(23, +c.dataset.i + to))].focus(); }
  });
  $('#board').addEventListener('pointermove', (e) => {
    const c = e.target.closest('.card'); if (!c || !board) return;
    const r = $('.portrait', c).getBoundingClientRect();
    board.hover(+c.dataset.i, true, { x: Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)) * 0.9, y: Math.max(-1, Math.min(1, -((e.clientY - r.top) / r.height * 2 - 0.75))) * 0.8, active: true });
  });
  $('#board').addEventListener('pointerout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget) && board) board.hover(+c.dataset.i, false); });
  $('#board').addEventListener('focusin', (e) => { const c = e.target.closest('.card'); if (c && board) board.hover(+c.dataset.i, true, { x: 0, y: 0.05, active: true }); });
  $('#board').addEventListener('focusout', (e) => { const c = e.target.closest('.card'); if (c && board) board.hover(+c.dataset.i, false); });
}

async function joinBot() {
  await net.join(code, { name: oppName });
  startBot(net, code, 'p2', people, { think: FAST ? [20, 40] : [900, 1900], onSay: (t) => say(`${oppName} : ${t}`) });
}

async function start(vsBot) {
  oppName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  document.body.dataset.screen = 'game'; board.pause(false);
  ({ code } = await net.create({ name: 'Toi' }));
  net.subscribe(code, seat, render);
  if (vsBot) await joinBot();
}

async function main() {
  people = (await (await fetch('data/roster.json')).json()).personnages;
  net = createNet();
  wireUi();
  const slots = buildBoard().map((c) => $('.portrait', c));
  await document.fonts.ready;
  board = await createBoard3D({ wrap: $('.board-wrap'), canvas: $('#gl'), slots, people, still: Q.has('still'), reduced, idle: +(Q.get('idle') || 1.1), char: Q.get('char') });
  portraits = people.map((_, i) => board.portrait(i));
  board.pause(true);                                                // l'accueil ne montre que des images
  $$('.home-wall img').forEach((im, k) => { im.src = portraits[[4, 0, 9][k]]; });
  if (Q.has('debug')) $('#debug').hidden = false;
  window.__game = { net: () => net, view: () => view, seat, people, board, cross, crossed: () => [...crossed], send, start, contactSheet, pick: (i) => { picked = i; render(view); },
    guessMode: (on) => { guessMode = on; render(view); } };
  document.documentElement.dataset.ready = '1';
  if (Q.has('autostart')) await start(true);
}

main().catch((e) => { $('#note').textContent = 'Erreur : ' + e.message; console.error(e); });
