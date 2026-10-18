// Puissance 4 à deux vrais joueurs, contre les émulateurs Firebase (jamais la production).
// Chaque joueur a son propre contexte de navigation, donc son propre compte anonyme.
//
//   Banc : émulateurs database + auth, règles phase 2, maintenance à false, site servi
//   par firebase/tests/serve-emulated.js 4174 (procédure : en-tête de smoke-games.cjs).
//   node games/puissance4/tests/duo.cjs                 # contrôles
//   node games/puissance4/tests/duo.cjs --shots=<dir>   # + captures (clair, sombre, mobile)
//   node games/puissance4/tests/duo.cjs --visible       # fenêtres visibles
//
// Les coups passent par de vrais évènements souris, tactiles et clavier. Les parties
// créées sont supprimées à la fin.

const path = require('path');
const { Browser, Page, sleep } = require('../../../tools/cdp');

const SITE = process.env.SITE || 'http://localhost:4174';
const EMU = 'http://127.0.0.1:9000';
const NS = 'ns=undercover-game-b0d2a-default-rtdb';
// P4_2D=1 : force le plateau de repli (sans WebGL).
const URL_P4 = `${SITE}/games/puissance4/?emu${process.env.P4_2D ? '&2d' : ''}`;
const args = process.argv.slice(2);
const SHOTS = (args.find(a => a.startsWith('--shots=')) || '').slice(8);
const VISIBLE = args.includes('--visible');

const admin = (p, method = 'GET', body) => fetch(`${EMU}/${p}.json?${NS}`, {
  method, headers: { Authorization: 'Bearer owner' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}).then(r => r.json());

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};
async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) { try { v = await fn(); } catch (_) { v = null; } if (v) return v; await sleep(120); }
  return v;
}

// Une fenêtre dans un contexte isolé (stockage séparé : compte anonyme distinct).
async function player(browser, label, { w = 1440, h = 900, mobile = false, dark = false } = {}) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(browser, sessionId, targetId, label);
  browser.pages.set(sessionId, page);
  for (const m of ['Runtime.enable', 'Log.enable', 'Page.enable']) await page.send(m);
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  page.context = browserContextId; page.mobile = mobile;
  await page.goto(URL_P4);
  await waitFor(() => page.eval(`return document.body.dataset.screen === 's-home' && getComputedStyle(document.documentElement).visibility !== 'hidden'`));
  page.intro = await page.eval(`return getComputedStyle(document.getElementById('intro-veil')).display !== 'none'`);
  await waitFor(() => page.eval(`return !document.documentElement.classList.contains('intro') && getComputedStyle(document.getElementById('intro-veil')).display === 'none'`), 8000);   // fin de l'ouverture
  return page;
}
const dispose = p => p.browser.send('Target.disposeBrowserContext', { browserContextId: p.context }).catch(() => {});

const screen = p => p.eval(`return document.body.dataset.screen`);
const pieces = g => (g.board || []).flat().filter(Boolean).length;
async function shot(p, name) {
  if (!SHOTS) return;
  await sleep(250);
  await p.screenshot(path.join(SHOTS, name + '.png'));
}
// Pistes typographiques comparées dans le jeu réel (--fonts) : mêmes états, polices injectées.
const FONTS = {
  unbounded: { family: 'Unbounded:wght@500;600', display: "'Unbounded'", w: 600, track: '-.03em' },
  caprasimo: { family: 'Caprasimo', display: "'Caprasimo'", w: 400, track: '-.01em' },
  ultra: { family: 'Ultra', display: "'Ultra'", w: 400, track: '0em' },
  limelight: { family: 'Limelight', display: "'Limelight'", w: 400, track: '0em' },
};
async function shotFonts(p, name) {
  if (!SHOTS || !args.includes('--fonts')) return;
  for (const [k, v] of Object.entries(FONTS)) {
    await p.eval(`if (!document.getElementById('f-${k}')) { const l = document.createElement('link'); l.id = 'f-${k}'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=${v.family}&display=block'; document.head.appendChild(l); await new Promise(r => { l.onload = r; setTimeout(r, 4000); }); }
      const r = document.documentElement.style; r.setProperty('--f-display', ${JSON.stringify(v.display)} + ',serif'); r.setProperty('--f-num', ${JSON.stringify(v.display)} + ',serif'); r.setProperty('--display-w', '${v.w}'); r.setProperty('--display-track', '${v.track}'); await document.fonts.ready;`);
    await sleep(500);
    await p.screenshot(path.join(SHOTS, `typo-${name}-${k}.png`));
  }
  await p.eval(`['--f-display','--f-num','--display-w','--display-track'].forEach(v => document.documentElement.style.removeProperty(v));`);
}
// Rafale (--film) : des images rapprochées du plateau pendant une animation, pour juger le mouvement.
async function film(p, name, action, ms = 900) {
  if (!SHOTS || !args.includes('--film')) { await action(); return; }
  const box = await p.eval(`const r = document.querySelector('#s-game .stage').getBoundingClientRect(); return { x: r.left, y: r.top - 70, width: r.width, height: r.height + 140 }`);
  const frames = [];
  const t0 = Date.now();
  const run = action();
  while (Date.now() - t0 < ms) {
    const { data } = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { ...box, scale: .5 } });
    frames.push({ t: Date.now() - t0, data });
  }
  await run;
  require('fs').mkdirSync(SHOTS, { recursive: true });
  frames.forEach((f, i) => require('fs').writeFileSync(path.join(SHOTS, `film-${name}-${String(i).padStart(2, '0')}-${f.t}ms.jpg`), Buffer.from(f.data, 'base64')));
}
async function setTheme(p, theme) {
  await p.eval(`if (document.documentElement.dataset.theme !== '${theme}') document.getElementById('theme-toggle').click();`);
  await sleep(600);
}

// Centre d'une colonne, à hauteur du plateau.
const colPoint = (p, c) => p.eval(`const r = document.querySelectorAll('#cols .col')[${c}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .55 };`);
async function hover(p, c) {
  const { x, y } = await colPoint(p, c);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
// Joue une colonne : souris (survol + clic) ou doigt (appui, relâché).
async function playCol(p, c) {
  const { x, y } = await colPoint(p, c);
  if (p.mobile) {
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(40);
    await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
// Joue une suite de colonnes en alternant les joueurs, en attendant chaque coup validé.
async function sequence(code, P, cols) {
  for (const c of cols) {
    const g = await admin(`p4/${code}`);
    const n = pieces(g);
    await playCol(P[g.turn], c);
    const ok = await waitFor(async () => pieces(await admin(`p4/${code}`)) === n + 1, 5000);
    if (!ok) throw new Error(`coup ${c} de J${g.turn + 1} non appliqué`);
    await sleep(80);
  }
}

async function main() {
  const browser = await Browser.launch({ headless: !VISIBLE, windowSize: '1440,900' });
  const before = Object.keys((await admin('p4')) || {});
  const A = await player(browser, 'A', { w: 1440, h: 900 });
  const B = await player(browser, 'B', { w: 390, h: 844, mobile: true });
  try {
    // ── Accueil ──
    await shot(A, '01-accueil-clair-desktop');
    await shotFonts(A, 'accueil');
    await setTheme(A, 'dark'); await shot(A, '02-accueil-sombre-desktop'); await setTheme(A, 'light');
    await shot(B, '03-accueil-clair-mobile');
    check('ouverture : jouée à la première visite, puis retirée', A.intro && await A.eval(`return getComputedStyle(document.getElementById('intro-veil')).display === 'none' && getComputedStyle(document.querySelector('#s-home h1')).opacity === '1'`));
        check('accueil : titre, deux actions, vitrine du plateau', await A.eval(`return !!document.querySelector('#s-home h1') && document.querySelectorAll('#demo .disc.p1,#demo .disc.p2').length > 5`));

    // ── Création (premier à 2 victoires) ──
    await setTheme(A, 'dark');
    await A.eval(`show('s-create'); document.getElementById('create-name').value = 'Alice'; document.querySelector('input[name=bo][value="2"]').click();`);
    await shot(A, '03b-creation-desktop-sombre');
    await setTheme(A, 'light');
    await B.eval(`show('s-join'); document.getElementById('join-code').value = 'DISC-42'; document.getElementById('join-name').value = 'Bob';`);
    await shot(B, '03c-rejoindre-mobile');
    await A.eval(`createGame();`);
    const code = await waitFor(async () => Object.keys((await admin('p4')) || {}).find(k => !before.includes(k)));
    check('création : une partie dans l’émulateur', code, code);
    if (!code) throw new Error('pas de partie');
    const g0 = await admin(`p4/${code}`);
    check('création : hôte, membre, uid du joueur, format', g0.hostUid && g0.members[g0.hostUid] && g0.players[0].uid === g0.hostUid && g0.bo === 2 && g0.phase === 'lobby');
    check('salon : l’hôte voit le code et attend', await waitFor(async () => (await screen(A)) === 's-lobby' && (await A.eval(`return document.getElementById('lobby-code').textContent`)) === code));
    check('salon : « Lancer » désactivé sans adversaire', await A.eval(`return document.getElementById('lobby-start').disabled`));
    await shot(A, '04-salon-attente-desktop');

    // ── Rejoindre : homonyme refusé, puis B ──
    await B.eval(`show('s-join'); document.getElementById('join-code').value = '${code}'; document.getElementById('join-name').value = 'alice'; joinGame();`);
    check('rejoindre : le prénom de l’hôte est refusé', await waitFor(async () => /déjà pris/.test(await B.eval(`return document.getElementById('join-err').textContent`))));
    await B.eval(`document.getElementById('join-name').value = 'Bob'; joinGame();`);
    check('rejoindre : B entre au salon', await waitFor(async () => (await screen(B)) === 's-lobby'));
    const g1 = await admin(`p4/${code}`);
    check('rejoindre : deux membres distincts, B sur le siège 2 avec son uid', Object.keys(g1.members).length === 2 && g1.players[1].name === 'Bob' && g1.players[1].uid && g1.players[1].uid !== g1.hostUid);
    check('salon : « Lancer » s’active chez l’hôte', await waitFor(() => A.eval(`return !document.getElementById('lobby-start').disabled`)));
    check('salon : l’invité n’a pas de bouton « Lancer »', await B.eval(`return document.getElementById('lobby-start').hidden`));
    // ── Couleurs : B prend l'émeraude ; A la voit indisponible, prend l'ocre ──
    await B.eval(`document.querySelector('#swatches .swatch[data-color="emeraude"]').click()`);
    check('couleurs : le choix de B est enregistré', await waitFor(async () => (await admin(`p4/${code}`)).players?.[1]?.color === 'emeraude'));
    check('couleurs : chez A, l’émeraude est indisponible', await waitFor(() => A.eval(`return document.querySelector('#swatches .swatch[data-color="emeraude"]').disabled`)));
    await A.eval(`window.pickColor('emeraude')`); await sleep(600);
    check('couleurs : A ne peut pas prendre la couleur de B', (await admin(`p4/${code}`)).players?.[0]?.color !== 'emeraude');
    await A.eval(`document.querySelector('#swatches .swatch[data-color="jaune"]').click()`);
    check('couleurs : A passe à l’ocre, les jetons suivent', await waitFor(async () => (await admin(`p4/${code}`)).players?.[0]?.color === 'jaune'
      && (await B.eval(`return getComputedStyle(document.documentElement).getPropertyValue('--p1').trim().toUpperCase()`)) === '#D9A33A'));
    await shot(A, '05-salon-pret-desktop');
    await shot(B, '06-salon-mobile');

    // Un troisième navigateur ne peut pas prendre une place.
    const E = await player(browser, 'E', { w: 1000, h: 800 });
    await E.eval(`show('s-join'); document.getElementById('join-code').value = '${code}'; document.getElementById('join-name').value = 'Eve'; joinGame();`);
    check('rejoindre : partie complète pour un troisième', await waitFor(async () => /complète/.test(await E.eval(`return document.getElementById('join-err').textContent`))));
    await dispose(E);

    // ── L'invité quitte le salon : son siège se libère, il peut revenir ──
    await B.eval(`await deleteGame()`);
    check('salon : l’invité qui part libère son siège', await waitFor(async () => !(await admin(`p4/${code}`)).players?.[1]) && (await screen(B)) === 's-home'
      && await waitFor(() => A.eval(`return document.getElementById('lobby-start').disabled`)));
    await B.eval(`show('s-join'); document.getElementById('join-code').value = '${code}'; document.getElementById('join-name').value = 'Bob'; joinGame();`);
    check('salon : il revient sur le même siège', await waitFor(async () => (await screen(B)) === 's-lobby' && (await admin(`p4/${code}`)).players?.[1]?.name === 'Bob'));

    // ── Lancement ──
    await A.eval(`startGame()`);
    check('lancement : les deux voient le plateau', await waitFor(async () => (await screen(A)) === 's-game' && (await screen(B)) === 's-game'));
    const fit = p => p.eval(`const d = document.documentElement; return { x: d.scrollWidth - innerWidth, y: d.scrollHeight - innerHeight }`);
    const fa = await fit(A), fb = await fit(B);
    check('mise en page : aucun défilement horizontal (bureau, mobile)', fa.x <= 0 && fb.x <= 0, JSON.stringify({ fa, fb }));
    check('mise en page : la partie tient dans l’écran (bureau 1440×900, mobile 390×844)', fa.y <= 0 && fb.y <= 0, JSON.stringify({ fa, fb }));
    const sizes = [];
    for (const [w, h, m] of [[1914, 835, false], [1920, 1080, false], [1280, 720, false], [1024, 768, false], [820, 1180, true], [768, 1024, true], [360, 640, true]]) {
      await A.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: m });
      await sleep(250);
      const f = await fit(A), cell = await A.eval(`return Math.round(document.querySelector('#cols .col').getBoundingClientRect().width)`);
      sizes.push(`${w}x${h}: ${f.x > 0 ? 'déborde en x ' : ''}${f.y > 0 ? 'défile ' + f.y + 'px ' : ''}colonne ${cell}px`);
      if (w === 1280) await shot(A, '07b-partie-1280x720');
      if (w === 1914) { await sleep(900); await shot(A, '07d-partie-1914x835'); }
      if (w === 360) await shot(A, '07c-partie-360x640');
      // L'aide ne doit jamais passer sous les réserves de pions.
      const clash = await A.eval(`const h = document.getElementById('hint').getBoundingClientRect(); return [...document.querySelectorAll('#s-game .reserve')].some(r => { const b = r.getBoundingClientRect(); return b.width && getComputedStyle(r).display !== 'none' && b.left < h.right && b.right > h.left && b.top < h.bottom && b.bottom > h.top; })`);
      if (clash) sizes.push(`${w}x${h}: aide recouverte par une pile`);
      if (f.x > 0 || f.y > 0 || cell < 36 || clash) sizes.bad = true;
    }
    await A.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await sleep(300);
    check('mise en page : partie sans défilement, colonnes ≥ 36 px, aide jamais sous les piles, de 360×640 à 1920×1080', !sizes.bad, sizes.join(' · '));
    check('tour : l’hôte commence, l’invité attend', (await A.eval(`return document.getElementById('turn').textContent.trim()`)) === 'À toi de jouer'
      && /Alice réfléchit/.test(await B.eval(`return document.getElementById('turn').textContent`)));

    // ── Survol : pion en main + cercle d'arrivée, retirés en sortant ──
    await hover(A, 3); await sleep(250);
    check('survol : pion en main et case d’arrivée', await A.eval(`const b = document.getElementById('board'); return b.classList.contains('aiming') && document.querySelectorAll('#board .disc.landing').length === 1 && document.querySelector('#board .disc.landing').style.getPropertyValue('--r') === '5'`));
    await shot(A, '07-survol-desktop');
    await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 400 }); await sleep(200);
    check('survol : retiré quand le pointeur s’éloigne', await A.eval(`return !document.getElementById('board').classList.contains('aiming') && !document.querySelector('#board .disc.landing')`));

    // ── Hors tour : B clique, rien ne part ──
    await playCol(B, 2); await sleep(700);
    check('hors tour : le clic de l’invité est sans effet', pieces(await admin(`p4/${code}`)) === 0);
    check('hors tour : colonnes inactives chez l’invité', await B.eval(`return [...document.querySelectorAll('#cols .col')].every(b => b.getAttribute('aria-disabled') === 'true') && !document.getElementById('board').classList.contains('live')`));

    // ── Double clic : un seul pion ──
    const { x, y } = await colPoint(A, 3);
    for (let i = 0; i < 2; i++) {
      await A.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i + 1 });
      await A.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i + 1 });
    }
    await sleep(900);
    const g2 = await admin(`p4/${code}`);
    check('double clic : un seul pion posé, tour passé', pieces(g2) === 1 && g2.turn === 1 && g2.board[5][3] === 1, `${pieces(g2)} pion(s)`);
    check('synchronisation : B voit le pion d’Alice', await waitFor(() => B.eval(`return document.querySelectorAll('#board .disc.p1').length === 1`)));

    // ── Coup obsolète : la transaction refuse un état dépassé ──
    const stale = await B.eval(`
      const { db } = await import('/shared/firebase.js');
      const { ref, runTransaction } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      const { playMove } = await import('/games/puissance4/rules.js');
      let reason = null;
      const r = await runTransaction(ref(db, 'p4/${code}'), cur => { if (!cur) return cur; const m = playMove(cur, { col: 0, pnum: 1, expect: 0 }); reason = m.reason; return m.ok ? m.game : undefined; }, { applyLocally: false });
      return { committed: r.committed, reason };`);
    check('transaction : un coup calculé sur un plateau dépassé est refusé', !stale.committed && stale.reason === 'stale', JSON.stringify(stale));

    // ── Partie au milieu, captures ──
    await sequence(code, [A, B], [3, 2, 4, 2]);
    await film(A, 'chute', () => sequence(code, [A, B], [4]), 800);
    await sleep(500);
    await hover(A, 5); await sleep(250);
    await shot(A, '08-milieu-partie-desktop-clair');
    await setTheme(A, 'dark'); await hover(A, 1); await sleep(250);
    await shot(A, '09-milieu-partie-desktop-sombre');
    await shotFonts(A, 'partie');
    await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
    await shot(B, '10-milieu-partie-mobile');

    // ── Clavier : flèches puis Entrée (au tour de l'hôte) ──
    const gk = await admin(`p4/${code}`);
    const P = [A, B], K = P[gk.turn];
    await K.eval(`document.querySelectorAll('#cols .col')[3].focus()`);
    await K.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); // active :focus-visible
    await K.eval(`document.querySelectorAll('#cols .col')[3].focus()`);
    for (const k of [['ArrowRight', 39], ['ArrowRight', 39]]) {
      await K.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
      await K.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
    }
    const focused = await K.eval(`return document.activeElement.dataset.col`);
    await K.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await K.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter' });
    await K.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    check('clavier : flèches déplacent le focus, Entrée joue la colonne', focused === '5' && await waitFor(async () => pieces(await admin(`p4/${code}`)) === pieces(gk) + 1 && (await admin(`p4/${code}`)).last.c === 5), `focus ${focused}`);

    // ── Colonne pleine ──
    // Plateau mis en place par l'admin : colonne 6 pleine, rien d'aligné, au tour d'Alice.
    await admin(`p4/${code}`, 'PATCH', { turn: 0, last: null, board: [
      [0, 0, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 2],
      [0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 1]] });
    await waitFor(() => A.eval(`return document.querySelectorAll('#board .disc.p1,#board .disc.p2').length === 6`));
    await sleep(300);
    check('colonne pleine : marquée et désactivée', await A.eval(`const b = document.querySelectorAll('#cols .col')[6]; return b.classList.contains('full') && b.getAttribute('aria-disabled') === 'true' && /pleine/.test(b.getAttribute('aria-label'))`));
    await playCol(A, 6); await sleep(700);
    check('colonne pleine : clic sans effet', pieces(await admin(`p4/${code}`)) === 6 && (await admin(`p4/${code}`)).turn === 0);
    await hover(A, 6); await sleep(150);
    check('colonne pleine : pas d’aperçu au survol', await A.eval(`return !document.getElementById('board').classList.contains('aiming')`));

    // ── Victoire (diagonale) : même résultat pour les deux ──
    // A passe en mouvement réduit : ni chute animée, ni fil qui se dessine, état final direct.
    await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sequence(code, [A, B], [0, 1, 1, 2, 2, 3, 2, 3, 3, 5]);
    const nb = pieces(await admin(`p4/${code}`));
    await film(B, 'victoire', () => playCol(A, 3), 1900);
    await waitFor(() => A.eval(`return document.querySelectorAll('#board .threads line').length === 1`), 3000);
    const rm = await A.eval(`await new Promise(r => setTimeout(r, 60)); const l = document.querySelector('#board .threads line'); return { off: l && parseFloat(getComputedStyle(l).strokeDashoffset), anims: document.querySelectorAll('#board .disc')[2 * 7 + 3].getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().duration > 50).length }`);
    check('mouvement réduit : pas de chute animée, fil de victoire tracé d’emblée', rm.off === 0 && rm.anims === 0 && pieces(await admin(`p4/${code}`)) === nb + 1, JSON.stringify(rm));
    await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await sleep(1600);
    const gw = await admin(`p4/${code}`);
    check('victoire : phase, gagnant, 4 cases, score 1–0', gw.phase === 'win' && gw.winner === 0 && gw.winCells.length === 4 && gw.players[0].score === 1 && gw.players[1].score === 0);
    const endA = await A.eval(`return { t: document.getElementById('end-title').textContent, win: document.querySelectorAll('#board .disc.win').length, line: document.querySelectorAll('#board .threads line').length, shown: document.getElementById('end').classList.contains('in'), btn: document.getElementById('rematch-btn').textContent }`);
    const endB = await B.eval(`return { t: document.getElementById('end-title').textContent, win: document.querySelectorAll('#board .disc.win').length, line: document.querySelectorAll('#board .threads line').length, shown: document.getElementById('end').classList.contains('in') }`);
    check('victoire : 4 pions marqués et le fil, chez les deux', endA.win === 4 && endB.win === 4 && endA.line === 1 && endB.line === 1, JSON.stringify([endA, endB]));
    const lit = await B.eval(`const w = [...document.querySelectorAll('#board .disc.win')], o = document.querySelector('#board .disc.p1:not(.win),#board .disc.p2:not(.win)'); return { win: w.map(d => getComputedStyle(d).filter), other: o && getComputedStyle(o).filter }`);
    check('victoire : les 4 gagnants restent pleinement éclairés, les autres s’effacent', lit.win.every(f => f === 'none') && /brightness/.test(lit.other || ''), JSON.stringify(lit));
    const gl3 = await A.eval(`return window.__p4gl ? window.__p4gl() : null`);
    if (gl3) check('3D : 4 pions avancés et cerclés, le fil, les autres dans l’ombre, couleurs (ocre ; bleu après son retour au salon)', gl3.lifted === 4 && gl3.halos === 4 && gl3.threads === 1 && gl3.dimmed === gl3.pieces - 4 && gl3.colors.join() === '#D9A33A,#2D5BB5', JSON.stringify(gl3));
    else check('3D : WebGL indisponible, repli 2D', true, 'pas de contexte WebGL');
    check('victoire : annonce cohérente (toi / Alice)', endA.t === 'Tu gagnes la manche' && endB.t === 'Alice gagne la manche' && endA.shown && endB.shown);
    check('victoire : match en 2 victoires → « Manche suivante »', endA.btn === 'Manche suivante');
    check('victoire : le plateau reste visible', await A.eval(`const r = document.getElementById('board').getBoundingClientRect(); return r.height > 300 && document.body.dataset.screen === 's-game'`));
    await shot(A, '11-victoire-desktop-sombre');
    await shotFonts(A, 'victoire');
    await setTheme(A, 'light'); await shot(A, '12-victoire-desktop-clair');
    await shot(B, '13-victoire-mobile');
    await playCol(B, 4); await sleep(500);
    check('après la fin : plus aucun coup', pieces(await admin(`p4/${code}`)) === pieces(gw));

    // ── Revanche simultanée : une seule manche lancée, B commence ──
    await film(A, 'vidange', () => Promise.all([A.eval(`rematch()`), B.eval(`rematch()`)]), 900);
    const gr = await waitFor(async () => { const g = await admin(`p4/${code}`); return g.phase === 'playing' && g; });
    check('revanche : manche 2, plateau vide, l’invité commence', gr && gr.gameNum === 2 && pieces(gr) === 0 && gr.turn === 1 && !gr.winCells, gr && `manche ${gr.gameNum}, tour ${gr.turn}`);
    check('revanche : plus de marque de victoire', await waitFor(() => A.eval(`return !document.querySelector('#board .disc.win') && !document.querySelector('#board .threads line') && document.getElementById('end').hidden && document.querySelectorAll('#board .disc.p1,#board .disc.p2').length === 0`)));

    // ── Reconnexion : B recharge, reprend la partie ──
    await sequence(code, [A, B], [3, 3]);
    await B.goto(`${SITE}/games/puissance4/`);
    await waitFor(async () => (await screen(B)) === 's-home');
    check('reconnexion : l’accueil propose de reprendre', await B.eval(`return !document.getElementById('resume').hidden && document.getElementById('resume-code').textContent === '${code}'`));
    await B.eval(`resumeGame()`);
    check('reconnexion : retour dans la partie, même plateau', await waitFor(async () => (await screen(B)) === 's-game' && (await B.eval(`return document.querySelectorAll('#board .disc.p1,#board .disc.p2').length`)) === 2));
    // Lien ?code= : reprise directe.
    await B.goto(`${SITE}/games/puissance4/?code=${code}`);
    check('reconnexion : le lien de la partie y ramène directement', await waitFor(async () => (await screen(B)) === 's-game'));

    // ── Perte de connexion : bandeau, coups bloqués, puis retour ──
    const turnNow = (await admin(`p4/${code}`)).turn;
    const T = [A, B][turnNow];
    await T.eval(`const { db } = await import('/shared/firebase.js'); const { goOffline } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'); goOffline(db);`);
    check('hors ligne : bandeau affiché, plateau bloqué', await waitFor(() => T.eval(`return !document.getElementById('netbar').hidden && !document.getElementById('board').classList.contains('live')`), 5000));
    await shot(T, '14-connexion-perdue');
    await T.eval(`const { db } = await import('/shared/firebase.js'); const { goOnline } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'); goOnline(db);`);
    check('hors ligne : retour, bandeau retiré', await waitFor(() => T.eval(`return document.getElementById('netbar').hidden && document.getElementById('board').classList.contains('live')`), 8000));

    // ── Nul : plateau presque plein, dernier coup ──
    await admin(`p4/${code}`, 'PATCH', { turn: 0, last: null, phase: 'playing', board: [
      [1, 1, 2, 1, 1, 2, 0], [2, 2, 1, 2, 2, 1, 2], [1, 1, 2, 1, 1, 2, 1],
      [2, 2, 1, 2, 2, 1, 2], [1, 1, 2, 1, 1, 2, 1], [2, 2, 1, 2, 2, 1, 2]] });
    await waitFor(() => A.eval(`return document.querySelectorAll('#board .disc.p1,#board .disc.p2').length === 41`));
    await playCol(A, 6);
    const gd = await waitFor(async () => { const g = await admin(`p4/${code}`); return g.phase === 'draw' && g; });
    check('nul : plateau plein sans alignement → match nul, scores inchangés', gd && gd.players[0].score === 1 && gd.players[1].score === 0);
    check('nul : annoncé aux deux, « Rejouer »', await waitFor(async () => (await A.eval(`return document.getElementById('end-title').textContent`)) === 'Match nul'
      && (await B.eval(`return document.getElementById('end-title').textContent`)) === 'Match nul' && (await A.eval(`return document.getElementById('rematch-btn').textContent`)) === 'Rejouer'));
    await sleep(900);
    await shot(A, '15-nul-desktop');

    // ── Fin du match (premier à 2) puis nouveau match ──
    await A.eval(`rematch()`);
    await waitFor(async () => (await admin(`p4/${code}`)).gameNum === 3);
    const g3 = await admin(`p4/${code}`);
    await sequence(code, [A, B], [0, 1, 0, 1, 0, 1, 0]);    // le premier joueur aligne 4 en colonne 0
    const gm = await admin(`p4/${code}`);
    const champ = gm.winner;
    await sleep(1400);
    const btn = await A.eval(`return document.getElementById('rematch-btn').textContent`);
    check('match : vainqueur à 2 victoires, « Nouveau match »', gm.players[champ].score === 2 && btn === 'Nouveau match', `${gm.players[0].score}-${gm.players[1].score}`);
    await shot(B, '16-fin-de-match-mobile');
    await B.eval(`rematch()`);
    const gn = await waitFor(async () => { const g = await admin(`p4/${code}`); return g.phase === 'playing' && g.gameNum === 1 && g; });
    check('nouveau match : scores à zéro, manche 1', gn && gn.players[0].score === 0 && gn.players[1].score === 0);

    // ── Données hostiles : un membre écrit un score piégé et un format démesuré ──
    await admin(`p4/${code}/players/1/score`, 'PUT', '<img src=x onerror="window.__p4xss=1">');
    await admin(`p4/${code}/bo`, 'PUT', 1e9);
    await sleep(900);
    const hostile = await A.eval(`return { xss: window.__p4xss === 1, img: !!document.querySelector('#s-game img'), score: document.querySelector('#duel-2 .d-score').textContent, alive: true }`);
    check('données hostiles : score piégé affiché comme nombre, format borné, aucun script', !hostile.xss && !hostile.img && hostile.alive && hostile.score === '0', JSON.stringify(hostile));
    await admin(`p4/${code}`, 'PATCH', { bo: 2, players: gn.players });

    // ── Présence : B ferme son onglet → « Hors ligne » chez A ──
    await B.goto('about:blank');
    check('présence : l’adversaire parti apparaît hors ligne', await waitFor(() => A.eval(`return /Hors ligne/.test(document.querySelector('#duel-2 .d-state').textContent)`), 10000));

    // ── L'hôte ferme : la partie disparaît ──
    await A.eval(`document.getElementById('quit').click()`);
    check('quitter : demande une confirmation', await A.eval(`return document.getElementById('quit').classList.contains('armed') && document.body.dataset.screen === 's-game'`));
    await A.eval(`document.getElementById('quit').click()`);
    check('quitter : l’hôte ferme la partie', await waitFor(async () => (await admin(`p4/${code}`)) === null) && (await screen(A)) === 's-home');
    await sleep(800);
    const errs = [...A.errors(), ...B.errors()];
    check('console : aucune erreur ni exception, du début à la fermeture', errs.length === 0, errs.join(' || '));
  } finally {
    for (const k of Object.keys((await admin('p4')) || {})) if (!before.includes(k)) await admin(`p4/${k}`, 'DELETE');
    await dispose(A); await dispose(B);
    await browser.close();
  }
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} contrôles OK`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
