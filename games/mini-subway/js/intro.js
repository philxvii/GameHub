// Cartes d'introduction animées, montrées avant chaque partie, quel que soit le mode :
// 4 cartes communes (formes, lignes, trains, saturation) puis une carte propre au mode.
// Dessins en SVG, animations CSS en boucle de 6 s (images clés générées ici, habillage dans style.css).

const T = [4, 12, 20, 28, 36, 44, 52, 60, 68];   // instants de départ possibles, en % de la boucle
const D = 16;                                    // durée d'un tracé, en %

let cssDone = false;
function ensureCss() {
  if (cssDone) return;
  cssDone = true;
  let css = '';
  for (const t of T) {
    css += `@keyframes k-pop${t}{0%,${t}%{opacity:0;transform:scale(.3)}${t + 5}%{opacity:1;transform:scale(1.12)}${t + 8}%,92%{opacity:1;transform:none}97%,100%{opacity:0}}`
      + `@keyframes k-out${t}{0%,${t}%{opacity:1}${t + 5}%,100%{opacity:0}}`
      + `@keyframes k-draw${t}{0%,${t}%{stroke-dashoffset:var(--len);opacity:1}${t + D}%,92%{stroke-dashoffset:0;opacity:1}97%,100%{stroke-dashoffset:0;opacity:0}}`
      + `@keyframes k-ride${t}{0%,${t - 1}%{opacity:0;offset-distance:0%}${t}%{opacity:1;offset-distance:0%}${t + 2 * D}%{opacity:1;offset-distance:100%}${t + 2 * D + 4}%,100%{opacity:0;offset-distance:100%}}`
      + `@keyframes k-float${t}{0%,${t}%{opacity:0;transform:translateY(8px)}${t + 4}%{opacity:1;transform:none}${t + 14}%{opacity:1;transform:translateY(-14px)}${t + 20}%,100%{opacity:0;transform:translateY(-20px)}}`
      + `@keyframes k-pulse${t}{0%,${t}%{transform:none}${t + 4}%{transform:scale(1.3)}${t + 8}%{transform:none}${t + 12}%{transform:scale(1.3)}${t + 16}%,100%{transform:none}}`
      + `@keyframes k-fill${t}{0%,${t}%{transform:scaleX(0)}${t + 2 * D}%,100%{transform:scaleX(1)}}`
      + `@keyframes k-ring${t}{0%,${t}%{stroke-dashoffset:var(--len);opacity:1}${t + 2 * D}%,92%{stroke-dashoffset:0;opacity:1}97%,100%{opacity:0}}`
      + `@keyframes k-shake${t}{0%,${t}%{opacity:0;transform:translateY(-12px)}${t + 4}%{opacity:1;transform:none}${t + 7}%{transform:rotate(-8deg)}${t + 10}%{transform:rotate(8deg)}${t + 13}%,92%{opacity:1;transform:none}97%,100%{opacity:0}}`;
    css += `.k-pop${t}{animation-name:k-pop${t}}.k-out${t}{animation-name:k-out${t}}.k-draw${t}{animation-name:k-draw${t}}.k-ride${t}{animation-name:k-ride${t}}`
      + `.k-float${t}{animation-name:k-float${t}}.k-pulse${t}{animation-name:k-pulse${t}}.k-fill${t}{animation-name:k-fill${t}}.k-ring${t}{animation-name:k-ring${t}}.k-shake${t}{animation-name:k-shake${t}}`;
  }
  const el = document.createElement('style');
  el.id = 'intro-keyframes';
  el.textContent = css;
  document.head.appendChild(el);
}

// ───────── briques de dessin ─────────
const INK = 'var(--ink)', CARD = 'var(--card)', RED = '#E0412F', BLUE = '#2F6FDB', GREEN = '#1E9E62';
const shp = {
  circle: (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`,
  square: (x, y, r) => `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`,
  triangle: (x, y, r) => `<path d="M${x} ${y - r * 1.15}L${x + r * 1.1} ${y + r * .8}H${x - r * 1.1}Z"/>`,
};
const station = (kind, x, y, r = 12, cls = '') => `<g class="k ${cls}" fill="${CARD}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" style="transform-origin:${x}px ${y}px">${shp[kind](x, y, r)}</g>`;
const mark = (kind, x, y, r = 6, fill = INK) => `<g fill="${fill}">${shp[kind](x, y, r)}</g>`;
const person = (x, y, cls) => `<g class="k ${cls}" style="transform-origin:${x}px ${y + 10}px"><circle cx="${x}" cy="${y}" r="5.5" fill="${INK}"/><path d="M${x - 8} ${y + 20}c.6-8 3.6-11 8-11s7.4 3 8 11z" fill="${INK}"/></g>`;
const bubble = (x, y, kind, cls) => `<g class="k ${cls}" style="transform-origin:${x}px ${y + 20}px"><rect x="${x - 20}" y="${y - 16}" width="40" height="32" rx="9" fill="${CARD}" stroke="${INK}" stroke-width="2.4"/><path d="M${x - 5} ${y + 16}l5 8 5-8z" fill="${CARD}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><rect x="${x - 6}" y="${y + 13}" width="12" height="5" fill="${CARD}"/>${mark(kind, x, y, 8)}</g>`;
const path = (d, len, color, cls, w = 8, dash = '') => `<path class="k ${cls}" d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash || len}" style="--len:${len}"/>`;
const text = (x, y, s, cls, color = INK, size = 20) => `<text class="k ${cls}" x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${color}" font-family="var(--disp)">${s}</text>`;
const cursor = (d, cls, color = INK) => `<g class="k k-cursor ${cls}" style="offset-path:path('${d}');offset-rotate:0deg"><circle r="13" fill="${color}" opacity=".16"/><circle r="6.5" fill="${CARD}" stroke="${color}" stroke-width="3"/></g>`;
const train = (d, cls, color = RED) => `<g class="k k-cursor ${cls}" style="offset-path:path('${d}');offset-rotate:0deg"><rect x="-17" y="-9" width="34" height="18" rx="5" fill="${color}" stroke="${INK}" stroke-width="2.4"/><rect x="-11" y="-4" width="8" height="7" rx="2" fill="${CARD}"/><rect x="1" y="-4" width="8" height="7" rx="2" fill="${CARD}"/></g>`;
const use = (id, x, y, s, cls, color = INK) => `<g class="k ${cls}" style="transform-origin:${x}px ${y}px;color:${color}"><use href="#${id}" x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}"/></g>`;

const P1 = 'M56 122L170 58', P2 = 'M170 58L284 122', PLINE = `${P1}L284 122`;
const stations3 = (c0 = '', c1 = '', c2 = '') => station('circle', 56, 122, 13, c0) + station('triangle', 170, 58, 12, c1) + station('square', 284, 122, 12, c2);

// ───────── scènes ─────────
const SCENES = {
  shapes: () => stations3('', 'k-pulse44') + person(56, 80, 'k-pop4') + bubble(56, 40, 'triangle', 'k-pop12')
    + path('M74 104Q104 78 148 64', 90, INK, 'k-draw28', 3.2)
    + text(170, 28, '= même forme', 'k-float44', INK, 16),
  lines: () => stations3() + path(P1, 130, RED, 'k-draw12') + path(P2, 130, RED, 'k-draw28') + cursor(PLINE, 'k-ride12') + station('circle', 56, 122, 13) + station('triangle', 170, 58, 12) + station('square', 284, 122, 12),
  trains: () => path(PLINE, 260, RED, '', 8) + stations3() + person(56, 80, 'k-out20') + bubble(56, 40, 'triangle', 'k-out20')
    + train(P1, 'k-ride20') + text(170, 24, '+1', 'k-float52', GREEN, 30) + station('triangle', 170, 58, 12, 'k-pulse52'),
  overflow: () => station('square', 170, 118, 16) + [0, 1, 2, 3, 4, 5, 6].map((i) => `<g class="k k-pop${T[i]}">${mark('square', 60 + i * 36, 52, 7)}</g>`).join('')
    + `<circle class="k k-ring44" cx="170" cy="118" r="36" fill="none" stroke="${RED}" stroke-width="5" stroke-linecap="round" stroke-dasharray="226" style="--len:226;transform:rotate(-90deg);transform-origin:170px 118px"/>`,
  classic: () => [0, 1, 2, 3, 4, 5, 6].map(i => `<g class="k k-pop${T[i]}"><circle cx="${60 + i * 36.6}" cy="46" r="10" fill="${CARD}" stroke="${INK}" stroke-width="2.6"/></g>`).join('')
    + `<g class="k k-pop60" style="transform-origin:170px 120px"><rect x="132" y="98" width="76" height="52" rx="8" fill="${CARD}" stroke="${INK}" stroke-width="3"/><path d="M170 98v52M132 120h76" stroke="${RED}" stroke-width="6"/></g>`
    + use('i-loco', 170, 78, 34, 'k-pop68', RED),
  infinite: () => `<rect x="50" y="86" width="240" height="22" rx="11" fill="${CARD}" stroke="${INK}" stroke-width="3"/><g clip-path="inset(0 round 0)"><rect class="k k-fill4" x="53" y="89" width="234" height="16" rx="8" fill="${GREEN}" style="transform-origin:53px 97px"/></g>`
    + use('i-hub', 170, 46, 36, 'k-pop60', 'var(--signal)') + text(170, 148, 'récompense !', 'k-float60', INK, 18),
  extreme: () => path(PLINE, 260, RED, '', 8) + stations3() + use('i-lock', 170, 100, 44, 'k-shake28', INK),
  creative: () => path('M170 92C140 40 70 40 70 92S140 144 170 92S200 40 270 92S200 144 170 92', 560, BLUE, 'k-draw4', 7)
    + station('circle', 70, 92, 11, 'k-pop44') + station('triangle', 170, 92, 11, 'k-pop52') + station('square', 270, 92, 11, 'k-pop60'),
  coop: () => stations3() + path(PLINE, 260, RED, 'k-draw12') + cursor(PLINE, 'k-ride12', RED) + cursor('M284 122L170 58L56 122', 'k-ride12', BLUE)
    + station('circle', 56, 122, 13) + station('triangle', 170, 58, 12) + station('square', 284, 122, 12) + text(170, 156, 'à plusieurs', 'k-float52', INK, 18),
  versus: () => `<rect x="14" y="20" width="148" height="140" rx="12" fill="${CARD}" stroke="${INK}" stroke-width="2.6"/><rect x="178" y="20" width="148" height="140" rx="12" fill="${CARD}" stroke="${INK}" stroke-width="2.6"/>`
    + path('M40 116L88 62L136 116', 160, RED, '', 6) + path('M204 116L252 62L300 116', 160, BLUE, '', 6)
    + station('circle', 40, 116, 10) + station('triangle', 88, 62, 9) + station('square', 136, 116, 10) + station('circle', 204, 116, 10) + station('triangle', 252, 62, 9) + station('square', 300, 116, 10)
    + `<circle class="k k-ring36" cx="136" cy="116" r="24" fill="none" stroke="${RED}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="151" style="--len:151;transform:rotate(-90deg);transform-origin:136px 116px"/>`
    + text(88, 150, '✕', 'k-pop60', RED, 22) + text(252, 150, '✓', 'k-pop60', GREEN, 22),
  challenge: () => use('i-target', 170, 82, 70, 'k-pulse12', RED) + text(170, 150, 'même partie pour tous', 'k-float36', INK, 16)
    + [0, 1, 2].map(i => `<g class="k k-pop${[44, 52, 60][i]}" style="transform-origin:${110 + i * 60}px 36px"><path d="M${110 + i * 60} 24l4 8 9 1-6.500 6 2 9-8.500-4.500L${110 + i * 60 - 8.500} 48l2-9-6.500-6 9-1z" fill="var(--signal)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`).join(''),
};

const COMMON = [
  { scene: 'shapes', title: 'Des voyageurs, une destination', cap: 'Chaque voyageur veut rejoindre une station de la forme qu’il affiche.' },
  { scene: 'lines', title: 'Relie les stations', cap: 'Glisse d’une station à l’autre pour tracer une ligne.' },
  { scene: 'trains', title: 'Les trains font le reste', cap: 'Chaque voyageur livré rapporte 1 point. Ajoute des trains !' },
  { scene: 'overflow', title: 'Évite le débordement', cap: 'Une station trop pleine trop longtemps ferme le réseau : fin de partie.' },
];
const MODE_CARD = {
  classic: { scene: 'classic', title: 'Chaque semaine, un cadeau', cap: 'Une locomotive et une amélioration au choix. Tiens le plus longtemps possible.' },
  infinite: { scene: 'infinite', title: 'Pas de défaite', cap: 'Livre bien tes voyageurs : la jauge d’efficacité se remplit, puis une récompense tombe.' },
  extreme: { scene: 'extreme', title: 'Tout est définitif', cap: 'Rien ne s’efface : une ligne ne peut que s’allonger. Réfléchis avant de poser.' },
  creative: { scene: 'creative', title: 'Tout est permis', cap: 'Ressources illimitées, pas de défaite : crée ton réseau comme tu veux.' },
  coop: { scene: 'coop', title: 'Un réseau pour tous', cap: 'Vous dessinez le même réseau et partagez le score. On gagne ensemble, on perd ensemble.' },
  versus: { scene: 'versus', title: 'Duel de réseaux', cap: 'Même ville, deux réseaux. Le premier réseau saturé perd.' },
  challenge: { scene: 'challenge', title: 'Le défi', cap: 'Même ville et mêmes voyageurs pour tout le monde. Bats l’objectif !' },
};

export const introCards = kind => [...COMMON, MODE_CARD[kind] || MODE_CARD.classic];

// Affiche l'intro et résout quand le joueur la ferme (Jouer ou Passer).
export function showIntro(kind) {
  ensureCss();
  const cards = introCards(kind);
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'modal intro';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'intro-title');
    root.innerHTML = `<div class="modal-card intro-card">
      <p class="eyebrow" id="intro-step"></p>
      <svg class="intro-scene" id="intro-scene" viewBox="0 0 340 180" aria-hidden="true"></svg>
      <h2 id="intro-title"></h2><p class="intro-cap" id="intro-cap" aria-live="polite"></p>
      <div class="intro-dots" id="intro-dots"></div>
      <div class="intro-actions"><button class="btn ghost" data-i="skip">Passer</button><button class="btn" data-i="prev" aria-label="Carte précédente">←</button><button class="btn primary" data-i="next">Suivant</button></div>
    </div>`;
    document.body.appendChild(root);
    let i = 0;
    const $ = s => root.querySelector(s);
    const draw = () => {
      const c = cards[i];
      $('#intro-scene').innerHTML = SCENES[c.scene]();
      $('#intro-title').textContent = c.title; $('#intro-cap').textContent = c.cap;
      $('#intro-step').textContent = `Avant de jouer · ${i + 1} / ${cards.length}`;
      $('#intro-dots').innerHTML = cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
      $('[data-i="prev"]').disabled = i === 0;
      $('[data-i="next"]').textContent = i === cards.length - 1 ? 'Jouer !' : 'Suivant';
    };
    const close = () => { document.removeEventListener('keydown', onKey, true); root.remove(); resolve(); };
    const go = d => { if (d > 0 && i === cards.length - 1) return close(); i = Math.max(0, Math.min(cards.length - 1, i + d)); draw(); };
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); go(1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); go(-1); }
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      if (b.dataset.i === 'skip') close(); else go(b.dataset.i === 'next' ? 1 : -1);
    });
    document.addEventListener('keydown', onKey, true);
    draw();
    $('[data-i="next"]').focus();
  });
}
