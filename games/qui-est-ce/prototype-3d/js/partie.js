// Declinaison multijoueur de la DA validee : B « casting » + revelation du salon (C) +
// revanche en un clic. Maquettes de tous les ecrans d'une partie a deux, bureau et 390 px.
//
// Lecture du tour sans texte : chaque joueur a son voyant de tournage (rouge allume = c'est
// son tour), son Polaroid se souleve et s'eclaire, l'autre palit ; la barre d'action est en
// film noir quand c'est a moi, en papier quand c'est a l'adversaire.
//
// ?ecran=<id> un seul ecran ; sans parametre : tous, a la suite. ?still : rendu fige.
// Les portraits sont rendus une fois (6 poses, decor casting ; 2 poses, decor salon pour la
// revelation) puis reutilises en images : la page n'anime pas 24 visages 3D (c'est le role
// du plateau).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterRig } from './rig.js';
import { loadGlb, seedRandom, computeFrame, buildSet, makeCamera, dressedClone } from './staging.js';
import { emit } from './events.js';

const Q = new URLSearchParams(location.search);
const ONLY = Q.get('ecran');
const CHAR = Q.get('char') || 'models/character-01-ict.glb';
const HAIR = 'models/hair/hair-curly-v41-opt.glb';
seedRandom();
const $ = (s, el = document) => el.querySelector(s);

// ── Portraits : rendus une fois ──
async function portraits() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [base, hair] = await Promise.all([loadGlb(loader, CHAR), loadGlb(loader, HAIR)]);
  const frame = computeFrame(base, hair);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(300, 400, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = makeCamera(frame);
  const shoot = (look, poses) => {
    const scene = new THREE.Scene();
    const set = buildSet(scene, look, frame, renderer, RoomEnvironment);
    renderer.toneMappingExposure = set.look.exposure;
    const model = dressedClone(base, hair, frame, set.look.sweater); scene.add(model);
    const rig = new CharacterRig(model); rig._startBlink = () => {};
    let t = 0;
    return poses.map(([expr, x, y]) => {
      rig.setExpression(expr);
      for (let i = 0; i < 240; i++) { t += 1 / 60; rig.update(1 / 60, t, { x, y, active: true }); }
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/jpeg', 0.9);
    });
  };
  const casting = shoot('casting', [['neutral', 0, 0.05], ['smile', 0.3, 0.05], ['neutral', -0.6, 0.05], ['suspicious', 0, 0.05], ['neutral', 0.6, 0.1], ['surprised', 0, 0.1]]);
  const salon = shoot('salon', [['smile', 0, 0.05], ['neutral', 0.2, 0.05]]);
  renderer.dispose();
  return { casting, salon };
}

// ── Composants ──
let IMG = null, PEOPLE = [];
const img = (i) => IMG.casting[i % IMG.casting.length];
const CROSS = '<svg class="cross" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="1" d="M14 12 C40 38 62 60 88 90"/><path pathLength="1" d="M86 10 C60 40 38 62 12 88"/></svg>';
const CIRCLE = '<svg class="circle" viewBox="0 0 120 140" aria-hidden="true"><path pathLength="1" d="M60 8 C104 6 116 50 112 78 C108 118 72 136 48 130 C14 122 4 84 8 56 C12 24 38 10 70 12 C96 16 112 38 110 60"/></svg>';

function pola(i, { cls = '', name = true, crossed = false, circled = false, tilt = null, src = null } = {}) {
  const p = PEOPLE[i];
  const t = tilt ?? (((i * 37) % 7) - 3) * 0.6;
  return `<figure class="pola ${cls}${crossed ? ' x' : ''}${circled ? ' o' : ''}" style="--tilt:${t}deg" data-i="${i}">
    <img alt="${p.prenom}" src="${src || img(i)}">${name ? `<figcaption>${p.prenom}</figcaption>` : ''}${CROSS}${circled ? CIRCLE : ''}</figure>`;
}

function board({ crossed = [], circled = -1, lifted = [], dim = false, cls = '' } = {}) {
  const x = new Set(crossed), l = new Set(lifted);
  return `<div class="wall-board ${dim ? 'dim' : ''} ${cls}" role="group" aria-label="Mon plateau">${PEOPLE.map((_, i) =>
    pola(i, { crossed: x.has(i), circled: i === circled, cls: l.has(i) ? 'lift' : '' })).join('')}</div>`;
}

// Planche contact de l'adversaire : ses 24 vues, ses croix ; jamais son secret.
function sheet(crossed, label) {
  const x = new Set(crossed);
  return `<div class="sheet" aria-label="${label}"><p class="sheet-label">${label}</p><div class="frames">${PEOPLE.map((_, i) =>
    `<span class="frame${x.has(i) ? ' x' : ''}"><img alt="" src="${img(i)}">${x.has(i) ? CROSS : ''}<i>${i + 1}A</i></span>`).join('')}</div></div>`;
}

function players(turn, { meLeft = 24, themLeft = 24, them = 'Lina', away = false, themStatus = '' } = {}) {
  const p = (who, name, left, on, extra = '') => `<div class="player ${who}${on ? ' on' : ''}${extra}">
      <span class="tally" aria-hidden="true"></span><span class="pname">${name}</span><span class="pleft">${left}</span></div>`;
  return `<div class="players" aria-label="${turn === 'me' ? 'À toi de jouer' : turn === 'them' ? `Au tour de ${them}` : ''}">
    ${p('me', 'Toi', meLeft === null ? '' : `${meLeft} en jeu`, turn === 'me')}
    ${p('them', them, away ? themStatus : (themStatus || (themLeft === null ? '' : `${themLeft} en jeu`)), turn === 'them', away ? ' away' : '')}</div>`;
}

function bar(turn, code = 'K7RQ') {
  return `<header class="studio-bar"><p class="logo">Qui est-ce ?</p><p class="code" title="Code de la partie">${code}</p>
    <p class="score" aria-label="Score : toi 2, Lina 1"><span>Toi 2</span><span>1 Lina</span></p>${players(turn.turn, turn)}</header>`;
}

function secretCard(i = 0, label = 'Mon personnage') {
  return `<aside class="mine"><p class="mine-label">${label}</p>${pola(i, { cls: 'pinned', tilt: -4 })}<span class="tape" aria-hidden="true"></span></aside>`;
}

const btn = (label, cls = '', sfxName = '') => `<button class="tape-btn ${cls}"${sfxName ? ` data-sfx="${sfxName}"` : ''}>${label}</button>`;

// ── Ecrans ──
const ME_X = [2, 5, 6, 9, 12, 13, 17, 20, 23];              // mes croix apres trois questions
const THEM_X = [1, 3, 4, 7, 10, 11, 14, 16, 18, 19, 22];     // les siennes
const SCREENS = {
  accueil: { titre: 'Accueil', turn: 'none', html: () => `
    <section class="home">
      <div class="home-wall" aria-hidden="true">${pola(4, { tilt: -7 })}${pola(0, { tilt: 4 })}${pola(2, { tilt: -2 })}</div>
      <div class="home-text">
        <h1>Qui est-ce ?</h1>
        <p class="home-sub">Le casting à deux. Trouve son personnage avant qu'il trouve le tien.</p>
        <div class="home-actions">
          ${btn('Créer une partie', 'film', 'shutter')}
          <form class="join" onsubmit="return false"><label for="code">Code</label>
            <input id="code" maxlength="4" value="K7RQ" autocomplete="off" spellcheck="false">${btn('Rejoindre')}</form>
        </div>
        <p class="rules">Chacun choisit un personnage secret. À tour de rôle, une question oui / non ; on raye ceux qui ne collent pas. Le premier qui désigne le bon gagne la manche.</p>
      </div>
    </section>` },

  salon: { titre: "Salon d'attente", turn: 'none', html: () => `${bar({ turn: 'none', meLeft: null, themLeft: null, away: true, themStatus: 'en route…' })}
    <section class="lobby">
      <p class="lobby-label">Envoie ce code à ton adversaire</p>
      <p class="big-code" aria-label="Code K 7 R Q"><span>K</span><span>7</span><span>R</span><span>Q</span></p>
      <p class="lobby-actions">${btn('Copier le lien', 'film')}${btn('Contre le bot')}</p>
      <div class="slots">
        <figure class="slot ready">${pola(0, { name: false, tilt: -2 })}<figcaption>Toi · prêt</figcaption></figure>
        <figure class="slot empty"><span class="empty-photo" aria-hidden="true"></span><figcaption>En attente…</figcaption></figure>
      </div>
    </section>` },

  secret: { titre: 'Choix du secret', turn: 'none', html: () => `${bar({ turn: 'none', meLeft: null, themLeft: null, themStatus: 'choisit…' })}
    <section class="play">
      <div class="main"><p class="prompt">Choisis ton personnage secret</p>${board({ circled: 0 })}</div>
      <div class="side">
        <aside class="mine choosing"><p class="mine-label">Ton secret</p>${pola(0, { cls: 'pinned', tilt: -3 })}</aside>
        <p class="hint">Lina ne le verra qu'à la fin de la manche.</p>
        <div class="action me">${btn("C'est mon personnage", 'film', 'shutter')}</div>
      </div>
    </section>` },

  'mon-tour': { titre: 'Mon tour : poser une question', turn: 'me', html: () => `${bar({ turn: 'me', meLeft: 15, themLeft: 13 })}
    <section class="play">
      <div class="main">${board({ crossed: ME_X })}</div>
      <div class="side">${secretCard()}
        <div class="action me">
          <p class="ask-label">Ta question</p>
          <div class="chips">${['Lunettes ?', 'Chapeau ?', 'Barbe ?', 'Moustache ?', "Boucles d'oreilles ?", 'Cheveux…', 'Yeux…', 'Âge…', 'Femme ?']
            .map((c, k) => `<button class="chip${k === 0 ? ' picked' : ''}">${c}</button>`).join('')}</div>
          ${btn('Poser la question', 'film', 'shutter')}
        </div>
      </div>
    </section>` },

  repondre: { titre: "Tour de l'adversaire : je réponds", turn: 'them', html: () => `${bar({ turn: 'them', meLeft: 15, themLeft: 13 })}
    <section class="play">
      <div class="main">${board({ crossed: ME_X, dim: true })}</div>
      <div class="side">
        <div class="incoming"><p class="from">Lina demande</p><p class="question">Porte-t-il des lunettes ?</p></div>
        ${secretCard(0, 'Ton personnage')}
        <div class="action them answer">${btn('Oui', '', 'marker')}${btn('Non', 'film', 'marker')}</div>
        <p class="hint">Réponds honnêtement : les secrets sont vérifiés à la fin.</p>
      </div>
    </section>` },

  attente: { titre: 'Attente', turn: 'them', html: () => `${bar({ turn: 'them', meLeft: 15, themLeft: 13 })}
    <section class="play">
      <div class="main">${board({ crossed: ME_X, dim: true })}</div>
      <div class="side">${secretCard()}
        <div class="action them waiting"><p>Lina réfléchit</p><span class="reel" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
      </div>
    </section>` },

  ecartees: { titre: 'Cartes écartées des deux côtés', turn: 'them', html: () => `${bar({ turn: 'them', meLeft: 15, themLeft: 13 })}
    <section class="play">
      <div class="main">${board({ crossed: ME_X })}
        <ol class="log"><li><b>Q1</b> Femme ? <em>non</em></li><li><b>Q2</b> Cheveux courts ? <em>oui</em></li><li><b>Q3</b> Barbe ? <em>oui</em></li></ol></div>
      <div class="side">${secretCard()}${sheet(THEM_X, 'La planche de Lina : 13 en jeu')}</div>
    </section>` },

  designation: { titre: 'Désignation finale', turn: 'me', html: () => `${bar({ turn: 'me', meLeft: 3, themLeft: 6 })}
    <section class="play">
      <div class="main"><p class="prompt">Désigne son personnage</p>${board({ crossed: PEOPLE.map((_, i) => i).filter((i) => ![1, 8, 10].includes(i)), lifted: [1, 8, 10], circled: 1 })}</div>
      <div class="side">${secretCard()}
        <div class="action me"><p class="ask-label">Tu penses que c'est…</p><p class="guess">${PEOPLE[1].prenom}</p>${btn("C'est elle !", 'film', 'flash')}
          <p class="hint">Si tu te trompes, Lina gagne la manche.</p></div>
      </div>
    </section>` },

  'designation-ratee': { titre: 'Désignation ratée', turn: 'them', html: () => `${bar({ turn: 'them', meLeft: 3, themLeft: 6 })}
    <section class="play">
      <div class="main">${board({ crossed: PEOPLE.map((_, i) => i).filter((i) => ![8, 10].includes(i)), lifted: [8, 10] })}</div>
      <div class="side">
        <div class="miss">${pola(1, { crossed: true, tilt: 3 })}<p class="miss-note">Raté : ce n'était pas ${PEOPLE[1].prenom}.</p></div>
        <div class="action them"><p>La manche passe à Lina…</p></div>
      </div>
    </section>` },

  fin: { titre: 'Fin de partie : révélation et revanche', turn: 'none', html: () => `${bar({ turn: 'none', meLeft: 1, themLeft: 6 })}
    <section class="reveal">
      <h2>Tu gagnes la manche</h2>
      <p class="reveal-sub">En 7 questions · 4 min 12</p>
      <div class="hang">
        <figure class="hung win"><div class="gilt"><img alt="${PEOPLE[1].prenom}" src="${IMG.salon[0]}"></div>
          <figcaption class="cartel"><p class="c-title"><i>${PEOPLE[1].prenom}</i></p><p>Le secret de Lina</p><p class="c-num">Trouvé par toi</p><span class="dot" aria-hidden="true"></span></figcaption></figure>
        <figure class="hung"><div class="gilt"><img alt="${PEOPLE[0].prenom}" src="${IMG.salon[1]}"></div>
          <figcaption class="cartel"><p class="c-title"><i>${PEOPLE[0].prenom}</i></p><p>Ton secret</p><p class="c-num">Lina en était à 6</p></figcaption></figure>
      </div>
      <p class="final-score"><span>Toi 3</span><span>1 Lina</span></p>
      <p class="reveal-actions">${btn('Revanche', 'film big', 'shutter')}${btn('Partager la planche')}<a class="quit" href="#">Quitter</a></p>
      <div class="share">${sheet(PEOPLE.map((_, i) => i).filter((i) => i !== 1), 'Planche contact · partie K7RQ · 7 questions')}</div>
    </section>` },

  deconnexion: { titre: 'Adversaire déconnecté', turn: 'none', html: () => `${bar({ turn: 'none', meLeft: 15, themLeft: null, away: true, themStatus: 'hors ligne' })}
    <section class="play">
      <div class="main">${board({ crossed: ME_X, dim: true })}</div>
      <div class="side">
        <div class="gone"><span class="empty-photo" aria-hidden="true"></span><p class="gone-note">Lina a quitté le studio</p></div>
        <p class="hint countdown">On l'attend encore <b>25 s</b></p>
        <div class="action">${btn('Finir contre le bot', 'film')}${btn("Retour à l'accueil")}</div>
      </div>
    </section>` },
};

function wire(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sfx]'); if (b) emit(b.dataset.sfx);
    const p = e.target.closest('.wall-board .pola');
    if (p) { p.classList.toggle('x'); emit('cross', { i: +p.dataset.i }); }
    const c = e.target.closest('.chip'); if (c) { root.querySelectorAll('.chip').forEach((k) => k.classList.toggle('picked', k === c)); }
  });
}

async function main() {
  const [shots, roster] = await Promise.all([portraits(), fetch('data/roster.json').then((r) => r.json())]);
  IMG = shots; PEOPLE = roster.personnages;
  await document.fonts.ready;
  const app = $('#app');
  const ids = ONLY ? [ONLY] : Object.keys(SCREENS);
  app.innerHTML = ids.map((id) => `<div class="ecran" id="${id}" data-turn="${SCREENS[id].turn}">${ONLY ? '' : `<p class="ecran-name">${SCREENS[id].titre}</p>`}${SCREENS[id].html()}</div>`).join('');
  wire(app);
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => { $('#app').textContent = 'Erreur : ' + e.message; console.error(e); });
export { SCREENS };
