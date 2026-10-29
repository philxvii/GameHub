// Cartes « mode d'emploi » : avant chaque épreuve, un mini-écran qui rejoue la manche en boucle
// (un doigt touche, des cases s'allument, on tape une réponse) avec une légende en trois temps.
// Tout est du texte passé par h() : rien n'est interprété comme du HTML. Animations réduites :
// pas de scène, seulement les trois légendes numérotées.
import { h, clear, reduced } from './dom.js';

const STOP = Symbol('stop');

const T = (txt, cls = '') => h('span', { class: `dm-t ${cls}`, text: txt });
const BIG = (txt, cls = '') => h('div', { class: `dm-big ${cls}`, text: txt });
const FIELD = () => h('div', { class: 'dm-field' });
const BADGE = (txt, cls = '') => h('span', { class: `dm-badge ${cls}`, text: txt });
const GRID = (n, cells) => h('div', { class: 'dm-grid', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } }, cells);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INKS = { Rouge: '#d8321e', Bleu: '#3a8fc4', Vert: '#2f9e6a', Jaune: '#e9b23a' };

// Chaque épreuve : trois légendes (regarde / agis / gagne) et le scénario du mini-écran.
const SPECS = {
  gong: {
    say: ['Le panneau est rouge : ne touche à rien.', 'Il passe au VERT : touche-le !', 'Le temps de réaction le plus court gagne.'],
    async run(d) {
      d.step(0); const p = d.put(BIG('Attends…', 'dm-red')); await d.wait(1600);
      d.step(1); p.textContent = 'Maintenant !'; p.className = 'dm-big dm-green'; await d.wait(650);
      await d.tap(p); d.step(2); d.put(BADGE('212 ms')); await d.wait(2000);
    }
  },
  tir: {
    say: ['Une cible apparaît.', 'Touche-la : la suivante arrive. Un tir à côté coûte 0,3 s.', 'Les 20 cibles le plus vite possible : le temps total le plus bas gagne.'],
    async run(d) {
      const at = (x, y) => { const t = h('span', { class: 'dm-target', style: { left: `${x}%`, top: `${y}%` } }); d.put(t); return t; };
      d.step(0); let t = at(25, 40); await d.wait(1100);
      d.step(1); await d.tap(t); t.remove(); t = at(70, 62); await d.wait(500);
      await d.tap([40, 30]); d.put(BADGE('+0,3 s', 'bad')); await d.wait(600);
      await d.tap(t); t.remove(); t = at(60, 28); await d.wait(300);
      await d.tap(t); t.remove();
      d.step(2); d.put(BADGE('20 cibles · 14,2 s')); await d.wait(2000);
    }
  },
  calcul: {
    say: ['Une opération s’affiche.', 'Tape le résultat, vite. Juste : +1. Faux : −1. Passer : 0.', 'Le meilleur total gagne.'],
    async run(d) {
      d.step(0); d.put(BIG('7 × 6 = ?')); const f = d.put(FIELD()); await d.wait(1300);
      d.step(1); await d.type(f, '42'); d.put(BADGE('+1')); await d.wait(700);
      d.step(2); d.put(BADGE('Total : 12', 'dm-badge-l')); await d.wait(1900);
    }
  },
  chemin: {
    say: ['Regarde les cases s’allumer, dans l’ordre.', 'Reproduis l’ordre. Une case de plus à chaque niveau.', 'Une erreur et c’est fini : le niveau le plus haut gagne.'],
    async run(d) {
      const cells = Array.from({ length: 9 }, () => T('')); d.put(GRID(3, cells));
      const seq = [0, 4, 2];
      d.step(0); await d.wait(600);
      for (const k of seq) { cells[k].classList.add('lit'); await d.wait(550); cells[k].classList.remove('lit'); await d.wait(200); }
      d.step(1); await d.wait(300);
      for (const k of seq) { await d.tap(cells[k]); cells[k].classList.add('ok'); }
      d.step(2); d.put(BADGE('Niveau 4')); await d.wait(2000);
    }
  },
  damier: {
    say: ['Des cases s’allument une seconde : retiens-les.', 'Retrouve-les toutes. Trois erreurs : une vie perdue.', '3 vies. Le niveau le plus haut gagne.'],
    async run(d) {
      const cells = Array.from({ length: 16 }, () => T('')); d.put(GRID(4, cells));
      const mark = [1, 6, 11];
      d.step(0); await d.wait(500);
      mark.forEach(k => cells[k].classList.add('lit')); await d.wait(1100);
      mark.forEach(k => cells[k].classList.remove('lit'));
      d.step(1); await d.wait(400);
      for (const k of mark) { await d.tap(cells[k]); cells[k].classList.add('ok'); }
      d.step(2); d.put(BADGE('❤️ ❤️ ❤️')); await d.wait(2000);
    }
  },
  numeros: {
    say: ['Repère les numéros.', 'Touche le 1 : les autres se cachent. Continue dans l’ordre.', '3 vies : le plus de numéros retenus gagne.'],
    async run(d) {
      const cells = Array.from({ length: 9 }, () => T('')); d.put(GRID(3, cells));
      const pos = { 1: 7, 2: 1, 3: 5 };
      d.step(0); await d.wait(400);
      Object.entries(pos).forEach(([n, k]) => { cells[k].textContent = n; cells[k].classList.add('num'); });
      await d.wait(1500);
      d.step(1); await d.tap(cells[pos[1]]); cells[pos[1]].classList.add('ok');
      [2, 3].forEach(n => cells[pos[n]].classList.add('off'));
      await d.wait(500);
      for (const n of [2, 3]) { await d.tap(cells[pos[n]]); cells[pos[n]].classList.remove('off'); cells[pos[n]].classList.add('ok'); }
      d.step(2); d.put(BADGE('3 numéros')); await d.wait(2000);
    }
  },
  dejavu: {
    say: ['Un mot que tu n’as jamais vu : « Nouveau ».', 'Un mot déjà passé plus tôt : « Déjà vu ».', '3 erreurs et c’est fini. Le plus de bonnes réponses gagne.'],
    async run(d) {
      const word = d.put(BIG('')), no = T('Nouveau'), yes = T('Déjà vu');
      d.put(h('div', { class: 'dm-row' }, no, yes));
      const ask = async (w, btn) => { word.textContent = w; await d.wait(900); await d.tap(btn); btn.classList.add('ok'); await d.wait(450); btn.classList.remove('ok'); };
      d.step(0); await ask('pomme', no); await ask('chaise', no);
      d.step(1); await ask('pomme', yes);
      d.step(2); d.put(BADGE('❤️ ❤️ ❤️')); await d.wait(2000);
    }
  },
  dictee: {
    say: ['Une phrase s’affiche.', 'Recopie-la exactement. Accents et majuscules : facultatifs.', 'Le premier à la terminer gagne.'],
    async run(d) {
      d.step(0); d.put(BIG('Le chat dort sur le canapé', 'dm-phrase')); const f = d.put(FIELD()); await d.wait(1500);
      d.step(1); await d.type(f, 'Le chat dort sur le canape', 70);
      d.step(2); d.put(BADGE('Terminé en 11 s')); await d.wait(2000);
    }
  },
  encre: {
    say: ['Un mot de couleur s’affiche, écrit dans une AUTRE couleur.', 'Touche la couleur de l’encre, pas celle du mot : ici BLEU.', 'Juste +1, faux −1. En 30 s, le plus de points gagne.'],
    async run(d) {
      const word = d.put(BIG('ROUGE', 'dm-ink')); word.style.color = INKS.Bleu;
      const btns = Object.fromEntries(Object.entries(INKS).map(([n, c]) => { const b = T(n); b.style.background = c; b.style.color = n === 'Jaune' ? '#1d140e' : '#fff'; return [n, b]; }));
      d.put(h('div', { class: 'dm-row' }, Object.values(btns)));
      d.step(0); await d.wait(1700);
      d.step(1); await d.tap(btns.Bleu); d.put(BADGE('+1')); await d.wait(700);
      d.step(2); word.textContent = 'VERT'; word.style.color = INKS.Rouge; await d.wait(900);
      await d.tap(btns.Rouge); d.put(BADGE('Total : 2', 'dm-badge-l')); await d.wait(1700);
    }
  },
  chrono: {
    say: ['Un chrono démarre. On te demande une durée : ici 5,5 s.', 'Au bout de 2 s il disparaît : compte de tête, puis touche STOP.', 'Trois essais : l’écart total le plus petit gagne.'],
    async run(d) {
      d.put(h('div', { class: 'dm-lab', text: 'Vise 5,5 s' })); const n = d.put(BIG('0,0')); const stop = d.put(T('STOP', 'dm-stop'));
      d.step(0); for (let k = 0; k <= 20; k += 2) { n.textContent = (k / 10).toFixed(1).replace('.', ','); await d.wait(130); }
      d.step(1); n.textContent = '· · ·'; n.classList.add('dm-hid'); await d.wait(1700);
      await d.tap(stop); n.classList.remove('dm-hid'); n.textContent = '5,3 s';
      d.step(2); d.put(BADGE('écart 0,2 s')); await d.wait(2000);
    }
  },
  intrus: {
    say: ['Une grille de signes presque identiques.', 'Un seul est différent : touche-le.', 'Douze grilles, de plus en plus grandes. Un signe à côté : +1,5 s.'],
    async run(d) {
      const cells = Array.from({ length: 16 }, (_, k) => T(k === 9 ? 'Q' : 'O', 'dm-sym')); d.put(GRID(4, cells));
      d.step(0); await d.wait(1600);
      d.step(1); await d.tap(cells[9]); cells[9].classList.add('ok'); await d.wait(900);
      d.step(2); clear(d.stage);
      const big = Array.from({ length: 25 }, (_, k) => T(k === 3 ? 'Q' : 'O', 'dm-sym sm')); d.put(GRID(5, big)); await d.wait(900);
      await d.tap(big[18]); big[18].classList.add('bad'); d.put(BADGE('+1,5 s', 'bad')); await d.wait(2000);
    }
  },
  anagramme: {
    say: ['Les lettres d’un mot sont mélangées.', 'Retrouve le mot et tape-le.', 'Huit mots (tu peux en passer un). Le plus de mots gagne.'],
    async run(d) {
      d.step(0); d.put(h('div', { class: 'dm-row' }, [...'MOPEM'].map(c => T(c, 'dm-sym')))); const f = d.put(FIELD()); await d.wait(1700);
      d.step(1); await d.type(f, 'POMME');
      d.step(2); d.put(BADGE('✓ 1 mot')); await d.wait(2000);
    }
  },
  metronome: {
    say: ['Un métronome bat quatre fois…', '…puis se tait. Continue à taper huit fois, au même rythme.', 'Trois tempos : l’écart moyen le plus petit gagne.'],
    async run(d) {
      const pulse = d.put(h('div', { class: 'dm-pulse' })), pad = d.put(T('TAPE', 'dm-stop')), pips = h('div', { class: 'dm-pips' }, Array.from({ length: 8 }, () => h('i')));
      d.put(pips);
      const hit = el => { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); };
      d.step(0); await d.wait(500);
      for (let k = 0; k < 4; k++) { hit(pulse); await d.wait(620); }
      d.step(1); pulse.classList.add('mute'); pulse.textContent = '🤫';
      for (let k = 0; k < 4; k++) { await d.tap(pad, 40); hit(pad); pips.children[k].classList.add('on'); await d.wait(480); }
      d.step(2); d.put(BADGE('écart 38 ms')); await d.wait(2000);
    }
  },
  nuage: {
    say: ['Un nuage de points s’affiche 4 secondes.', 'Il disparaît : combien y en avait-il ?', 'Trois nuages : le plus petit écart cumulé gagne.'],
    async run(d) {
      d.step(0);
      const dots = Array.from({ length: 25 }, (_, k) => { const a = k * 2.399, r = 8 + 34 * Math.sqrt((k + 1) / 25); return d.put(h('span', { class: 'dm-dot', style: { left: `${50 + r * 1.55 * Math.cos(a)}%`, top: `${50 + r * 1.05 * Math.sin(a)}%` } })); });
      await d.wait(2200);
      d.step(1); dots.forEach(x => x.remove()); const f = d.put(FIELD()); await d.type(f, '27', 220);
      d.step(2); d.put(BADGE('Vrai nombre : 25')); await d.wait(2100);
    }
  },
  prix: {
    say: ['Un produit de supermarché s’affiche, le même pour tous.', 'Tu as 12 secondes pour écrire son prix.', 'L’étiquette tombe : le plus petit écart sur 5 produits gagne.'],
    async run(d) {
      d.step(0); d.put(h('div', { class: 'dm-prod' }, h('span', { class: 'dm-emoji', text: '🥫' }), h('b', { text: 'Haricots verts, 400 g' }))); const f = d.put(FIELD()); await d.wait(1600);
      d.step(1); await d.type(f, '1,40 €', 180);
      d.step(2); d.put(h('span', { class: 'dm-price', text: '1,15 €' })); await d.wait(2300);
    }
  },
  bac: {
    say: ['Une lettre, quatre catégories.', 'Un mot par case, qui commence par la lettre.', 'Valide et unique : 10 points. Trouvé aussi par un autre : 5.'],
    async run(d) {
      d.step(0); d.put(h('div', { class: 'dm-letter', text: 'B' }));
      const cats = [['Animal', 'Baleine'], ['Pays', 'Brésil'], ['Fruit', 'Banane'], ['Métier', 'Boulanger']];
      const cells = cats.map(([c]) => { const v = h('span', { class: 'dm-v' }); return { v, row: h('div', { class: 'dm-cat' }, h('small', { text: c }), v) }; });
      d.put(h('div', { class: 'dm-cats' }, cells.map(c => c.row))); await d.wait(1300);
      d.step(1); for (let k = 0; k < 4; k++) await d.type(cells[k].v, cats[k][1], 45);
      d.step(2); d.put(BADGE('+10 · +10 · +5 · +10')); await d.wait(2200);
    }
  },
  coffre: {
    say: ['C’est ton tour : tu reçois TON nombre. Retiens-le.', 'Tape-le pendant que les autres te regardent.', 'Exact : le nombre s’allonge au tour suivant. Faux ou trop lent : éliminé.'],
    async run(d) {
      d.step(0); const n = d.put(BIG('4 8 2 9')); const f = d.put(FIELD()); await d.wait(2000);
      d.step(1); n.textContent = '• • • •'; n.classList.add('dm-hid'); await d.wait(500); await d.type(f, '4829', 200);
      d.put(BADGE('✓ Exact')); await d.wait(900);
      d.step(2); n.classList.remove('dm-hid'); n.textContent = '3 1 7 5 0'; f.textContent = ''; await d.wait(1100);
      d.put(BADGE('💀 Un autre est éliminé', 'bad dm-badge-l')); await d.wait(1800);
    }
  }
};

export function demoOf(id) {
  const spec = SPECS[id];
  if (!spec) return null;
  if (reduced()) {
    return h('ol', { class: 'demo demo-static', 'aria-hidden': 'true' }, spec.say.map(t => h('li', { text: t })));
  }
  const stage = h('div', { class: 'dm-stage' });
  const hand = h('span', { class: 'dm-hand', text: '👆' });
  const screen = h('div', { class: 'dm-screen' }, stage, hand);
  const num = h('b', { class: 'dm-num' }), say = h('span', { class: 'dm-say' });
  const cap = h('div', { class: 'dm-cap' }, num, say);
  const dots = spec.say.map(() => h('i'));
  const root = h('div', { class: 'demo', 'aria-hidden': 'true' }, screen, cap, h('div', { class: 'dm-dots' }, dots));

  const wait = async ms => { await sleep(ms); if (!root.isConnected) throw STOP; };
  const d = {
    stage, wait,
    put: el => { stage.append(el); return el; },
    step(n) {
      num.textContent = String(n + 1); say.textContent = spec.say[n];
      dots.forEach((x, k) => x.classList.toggle('on', k === n));
      cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
    },
    // Le doigt glisse vers un élément (ou un point [x%, y%] de l'écran) puis appuie.
    async tap(target, press = 160) {
      const s = screen.getBoundingClientRect();
      let x, y;
      if (Array.isArray(target)) { x = s.width * target[0] / 100; y = s.height * target[1] / 100; }
      else { const r = target.getBoundingClientRect(); x = r.left - s.left + r.width / 2; y = r.top - s.top + r.height / 2; }
      hand.style.left = `${x}px`; hand.style.top = `${y}px`; hand.classList.add('show');
      await wait(press < 100 ? 260 : 540);
      hand.classList.add('press'); await wait(press); hand.classList.remove('press');
    },
    async type(el, txt, ms = 130) { el.textContent = ''; for (const c of txt) { el.textContent += c; await wait(ms); } }
  };
  (async () => {
    await sleep(120);
    try {
      while (root.isConnected) {
        clear(stage); hand.classList.remove('show'); hand.style.left = '88%'; hand.style.top = '112%';
        await spec.run(d);
        await wait(1500);
      }
    } catch (e) { if (e !== STOP) console.error(e); }
  })();
  return root;
}
