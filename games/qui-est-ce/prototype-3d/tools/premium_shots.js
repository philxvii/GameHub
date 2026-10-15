// Captures des ecrans cles du jeu (partie reelle contre le bot), pour comparer les pistes
// artistiques et pour les revues visuelles.
//
//   python -m http.server 4173                       # racine du depot
//   node games/qui-est-ce/prototype-3d/tools/premium_shots.js [--da a,b,c] [--sizes 1440x900,1920x1080,390x844] [--page board.html] [--out build/premium]
//
// Ecrans : accueil, choix du secret, ma question, reponse recue, suspects ecartes, question de
// l'adversaire, survol (personnage vivant), revelation. PNG dans <out>/<da>-<taille>/.

const fs = require('fs');
const path = require('path');
const { Browser, sleep } = require('../../../../tools/cdp');
const { localCdn } = require('./local-cdn');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ORIGIN = process.env.PROTO_ORIGIN || 'http://localhost:4173';
const WIN = process.platform === 'win32';
const GPU = WIN ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const DAS = arg('--da', 'a').split(',');
const SIZES = arg('--sizes', '1440x900').split(',').map((s) => s.split('x').map(Number));
const PAGE = arg('--page', 'board.html');
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'build', 'premium')));
const ONLY = arg('--states', '').split(',').filter(Boolean);
const ev = (p, js) => p.eval(js).catch(async () => { await sleep(2000); return p.eval(js); });
const until = async (p, js, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(p, `return !!(${js})`).catch(() => false)) return true; await sleep(200); } return false; };

(async () => {
  const b = await Browser.launch({ headless: true, windowSize: '1920,1080', extraArgs: GPU });
  const log = [];
  try {
    for (const da of DAS) for (const [w, h] of SIZES) {
      const dir = path.join(OUT, `${da}-${w}x${h}`); fs.mkdirSync(dir, { recursive: true });
      const p = await b.newPage('about:blank', `${da}-${w}`);
      await localCdn(p);
      const mobile = w < 700;
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
      if (mobile) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true }).catch(() => {});
      const shot = async (name, full = false) => {
        if (ONLY.length && !ONLY.includes(name)) return;
        await sleep(450);
        const r = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
        fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(r.data, 'base64'));
      };
      await p.goto(`${ORIGIN}/games/qui-est-ce/prototype-3d/${PAGE}?seed&fast&da=${da}`);
      if (!(await until(p, 'document.documentElement.dataset.ready === "1"', 300000))) { log.push(`${da} ${w}x${h} : page non prete`); continue; }
      await ev(p, 'localStorage.clear()');
      await shot('1-accueil');
      await ev(p, 'document.querySelector("[data-do=play-bot]").click()');
      await until(p, '__game.view() && __game.view().phase === "choose"');
      await ev(p, '__game.pick(13)');
      await shot('2-choix-secret');
      await ev(p, 'document.querySelector("[data-do=secret]").click()');
      await until(p, '__game.view().phase === "play" && __game.view().turn === __game.seat() && !__game.view().ask', 60000);
      await ev(p, 'document.querySelector("[data-q=lunettes]")?.click()');
      await shot('3-ma-question');
      if (!mobile) {                                   // survol : la carte prend vie
        const pt = await ev(p, 'const r = document.querySelector(\'.suspect[data-i="8"] .shot\').getBoundingClientRect(); return [r.left + r.width * .7, r.top + r.height * .35]');
        for (let k = 0; k < 3; k++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt[0] + k, y: pt[1] }); await sleep(100); }
        await until(p, 'document.querySelector(".live.on")', 60000);
        await sleep(1500);
        await shot('4-survol-vivant');
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
      }
      await ev(p, 'document.querySelector("[data-do=ask]").click()');
      await until(p, '__game.view().ask && __game.view().ask.answer !== null', 30000);
      await shot('5-reponse');
      await ev(p, 'document.querySelector("[data-do=auto]")?.click()'); await sleep(600);
      await shot('6-ecartes');
      await ev(p, 'document.querySelector("[data-do=done]").click()');
      await until(p, '__game.view().ask && __game.view().ask.by !== __game.seat() && __game.view().ask.answer === null', 30000);
      await shot('7-question-adverse');
      if (mobile) await shot('7b-question-adverse-page', true);
      await ev(p, `const v = __game.view(), q = (await import(new URL('js/game/questions.js', document.baseURI))).byId[v.ask.q];
        document.querySelector(q.test(__game.people[v.mySecret].attributs) ? '[data-do=yes]' : '[data-do=no]').click();`);
      await until(p, '__game.view().turn === __game.seat() && !__game.view().ask', 30000);
      await ev(p, '__game.guessMode(true)');
      const left = await ev(p, 'return __game.people.map((_, i) => i).filter((i) => !__game.crossed().includes(i))');
      await ev(p, `__game.pick(${left[0]})`);
      await shot('8-designation');
      await ev(p, 'document.querySelector("[data-do=guess]").click()');
      await until(p, '!document.getElementById("reveal").hidden', 30000);
      await sleep(1200);
      await shot('9-revelation');
      const errs = p.errors().filter((e) => !/ERR_TUNNEL/.test(e));
      const sw = await ev(p, 'return document.documentElement.scrollWidth');
      if (sw > w) log.push('  debordent : ' + JSON.stringify(await ev(p, `return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 6).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))`)));
      log.push(`${da} ${w}x${h} : ${errs.length} erreur(s) console, largeur de page ${sw}/${w}${errs.length ? ' : ' + errs.slice(0, 2).join(' | ') : ''}`);
      await b.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
    }
  } finally { await b.close(); }
  console.log(log.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
