// Test du plateau jouable (board.html) dans Chrome : une partie complete contre le bot.
//
//   python -m http.server 4173                       # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/test-board.js
//
// Joue : choix du secret, questions utiles, reponses honnetes aux questions du bot, croix,
// designation ; verifie la revelation (deux secrets, pastille), les statistiques locales, la
// planche contact PNG, la revanche en un clic, l'adversaire qui s'en va, le survol (regard),
// la console, et le 390 px. Captures dans build/board/ ; mesures dans build/board/stats.json.

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU_FLAGS = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11']
  : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
// QE_PAGE=v3d : la meme partie sur l'entree du jeu (games/qui-est-ce/v3d/, maintenance + mode en ligne)
const PAGE = process.env.QE_PAGE === 'v3d' ? 'v3d/index.html' : 'prototype-3d/board.html';
const URL = (q) => `${ORIGIN}/games/qui-est-ce/${PAGE}?seed&fast${WIN ? '' : '&idle=30'}${q ? '&' + q : ''}`;
const OUT = path.join(__dirname, '..', 'build', 'board');
const results = [];
const check = (name, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${d !== '' ? ' | ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); };
const ev = (p, js) => p.eval(js).catch(async () => { await sleep(3000); return p.eval(js); });
const until = async (p, js, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(p, `return !!(${js})`).catch(() => false)) return true; await sleep(250); } return false; };
async function shot(p, name) {
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await Browser.launch({ headless: true, windowSize: '1440,900', extraArgs: GPU_FLAGS });
  const p = await b.newPage('about:blank', 'board');
  await localCdn(p);
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const t0 = Date.now();
  try {
    await p.goto(URL(''));
    check('Accueil charge (24 personnages 3D prets)', await until(p, 'document.documentElement.dataset.ready === "1"', 180000), `${Date.now() - t0} ms`);
    await ev(p, 'localStorage.clear()');
    await shot(p, 'accueil');
    await ev(p, 'document.querySelector("[data-do=play-bot]").click()');
    check('Partie contre le bot : choix du secret', await until(p, '__game.view() && __game.view().phase === "choose"'));
    // survol : regard vers le curseur
    const box = await ev(p, `const r = __game.board.cards[7].slot.getBoundingClientRect(); return { l: r.left, r: r.right, y: r.top + r.height * .35 }`);
    const move = async (x) => { for (let i = 0; i < 4; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: box.y }).catch(() => {}); await sleep(40); } };
    await move(box.l + 3); await sleep(4000); const left = await ev(p, 'return __game.board.cards[7].rig.state.eye.yaw');
    await move(box.r - 3); await sleep(4000); const right = await ev(p, 'return __game.board.cards[7].rig.state.eye.yaw');
    const target = await ev(p, 'const c = __game.board.cards[7]; return { hovering: c.hovering, x: c.pointer.x, active: c.pointer.active }');
    // la cible du regard suit le curseur ; le mouvement des yeux, lui, depend du nombre d'images (SwiftShader : ~4 s par carte)
    check('Survol : le personnage vise le curseur', target.hovering && target.active && target.x > 0.5 && (WIN ? left < -0.05 && right > 0.05 : true),
      { cibleX: +target.x.toFixed(2), yeuxGauche: +left.toFixed(3), yeuxDroite: +right.toFixed(3) });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }).catch(() => {});
    await ev(p, '__game.pick(0)');
    await shot(p, 'choix-secret');
    await ev(p, 'document.querySelector("[data-do=secret]").click()');
    check('Les deux secrets choisis : la manche commence', await until(p, '__game.view().phase === "play"'));
    const leak = await ev(p, `const v = __game.view(); return v.reveal !== null || JSON.stringify(v).includes('secrets')`);
    check("Le secret de l'adversaire n'est pas dans la vue", !leak);
    // boucle de jeu : je pose la meilleure question, je raye, le bot joue ; je reponds honnetement
    let turns = 0; const shots = { tour: false, repondre: false };
    for (let k = 0; k < 80; k++) {
      const v = await ev(p, 'const v = __game.view(); return { phase: v.phase, turn: v.turn, ask: v.ask, me: v.me }');
      if (v.phase === 'end') break;
      if (v.ask && v.ask.by !== v.me && v.ask.answer === null) {
        if (!shots.repondre) { await shot(p, 'repondre'); shots.repondre = true; }
        await ev(p, `const v = __game.view(); if (!v.ask || v.ask.by === v.me || v.ask.answer !== null) return;   // l'etat a deja change
          const q = (await import(new URL('js/game/questions.js', document.baseURI))).byId[v.ask.q];
          document.querySelector(q.test(__game.people[v.mySecret].attributs) ? '[data-do=yes]' : '[data-do=no]')?.click();`);
      } else if (v.turn === v.me && !v.ask) {
        const left = await ev(p, `return __game.people.map((_, i) => i).filter((i) => !__game.crossed().includes(i))`);
        if (left.length === 1) await ev(p, `__game.guessMode(true); __game.pick(${left[0]}); document.querySelector('[data-do=guess]').click()`);
        else {
          if (!shots.tour) { await shot(p, 'mon-tour'); shots.tour = true; }
          await ev(p, `const m = await import(new URL('js/game/questions.js', document.baseURI)); const q = m.bestQuestion(${JSON.stringify(left)}, __game.people);
            document.querySelector('[data-q="' + q.id + '"]').click(); document.querySelector('[data-do=ask]').click();`);
          turns++;
        }
      } else if (v.turn === v.me && v.ask && v.ask.answer !== null) {
        await ev(p, `document.querySelector('[data-do=auto]')?.click()`); await sleep(400);
        if (turns === 2) await shot(p, 'ecartees');
        await ev(p, `document.querySelector('[data-do=done]')?.click()`);
      }
      await sleep(300);
    }
    check('Partie terminee (designation)', await until(p, '__game.view().phase === "end"', 90000), { mesQuestions: turns });
    await sleep(2500);
    const end = await ev(p, `const v = __game.view(); return { winner: v.winner, me: v.me, shown: !document.getElementById('reveal').hidden,
      frames: document.querySelectorAll('#hang .hung').length, dot: !!document.querySelector('#hang .dot'), titles: document.getElementById('titles').textContent,
      stats: (JSON.parse(localStorage.getItem('qe3d.stats.v1') || '{}').games || []).length }`);
    check('Revelation : deux secrets accroches, pastille, statistiques enregistrees', end.shown && end.frames === 2 && end.dot && end.stats === 1, { gagnant: end.winner, titres: end.titles.slice(0, 140) });
    await shot(p, 'revelation');
    const png = await ev(p, `const u = await __game.contactSheet(); window.__png = u; return u.length`);
    const data = await ev(p, 'return window.__png');
    fs.writeFileSync(path.join(OUT, 'planche-contact.png'), Buffer.from(data.split(',')[1], 'base64'));
    check('Planche contact exportee en PNG', png > 50000, `${Math.round(png / 1024)} Ko (data URL)`);
    await ev(p, `document.querySelector('[data-do=rematch]').click()`);
    check('Revanche en un clic : nouvelle manche, plateau remis a neuf', await until(p, '__game.view().phase === "choose" && __game.view().round === 2 && __game.crossed().length === 0'));
    await ev(p, `__game.net().send(__game.view().code, 'p2', { type: 'leave' })`);
    check("Adversaire parti : l'ecran le dit", await until(p, "!document.getElementById('away').hidden"));
    await shot(p, 'adversaire-parti');
    const N = WIN ? 24 : 2;
    const ms = await ev(p, `return __game.board.paintMs(${N})`);
    const st = await ev(p, 'return __game.board.stats()');
    // ERR_TUNNEL_CONNECTION_FAILED : hote refuse par le reseau du cloud (interrupteur de maintenance du site)
    const errs = p.errors().filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED/.test(e));
    check('Console sans erreur', errs.length === 0, errs.slice(0, 3));
    const measures = { ...st, loadWallMs: Date.now() - t0, repaintAll24Ms: +(ms * 24 / N).toFixed(1), note: WIN ? 'GPU' : 'SwiftShader : temps sans valeur, a mesurer sur le PC' };
    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(measures, null, 1));
    console.log('       Mesures :', JSON.stringify(measures));
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await p.goto(URL('autostart'));
    await until(p, '__game.view() && __game.view().phase === "choose"', 180000);
    const sw = await ev(p, 'return document.documentElement.scrollWidth');
    check('Mobile 390 px : pas de defilement horizontal', sw <= 390, { scrollWidth: sw });
    await shot(p, 'mobile');
  } catch (e) {
    check('Execution', false, e.message);
  } finally {
    await b.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== PLATEAU JOUABLE : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
