// Vérification de roulia.me après une mise en ligne : les VRAIS clients sur la VRAIE
// base. Chaque joueur a son contexte de navigation, donc son compte anonyme. Pour
// chaque jeu : A crée (code libre, jamais celui d'une vraie partie), B rejoint,
// l'hôte lance puis supprime. Tout est lu avec le compte des joueurs : aucun accès
// administrateur. Les parties de test sont supprimées à la fin, même en cas d'échec.
//
//   CDP_PORT=9333 node firebase/tests/smoke-prod.cjs

const { Browser, Page, sleep } = require('../../tools/cdp');

const SITE = process.env.SITE || 'https://roulia.me';
// Répétition contre l'émulateur : SITE=http://localhost:4174 QS=emu
const QS = process.env.QS ? `?${process.env.QS}` : '';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${name}${detail ? ' | ' + detail : ''}`);
};
const denied = p => p.consoleErrors.concat(p.consoleAll).filter(e => /permission[_ ]denied/i.test(e.text)).map(e => e.text.slice(0, 160));
async function waitFor(fn, ms = 12000) {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(250); }
  return v;
}

async function player(browser, href, label) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(browser, sessionId, targetId, label);
  browser.pages.set(sessionId, page);
  for (const m of ['Runtime.enable', 'Log.enable', 'Page.enable', 'Network.enable']) await page.send(m);
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Network.setBlockedURLs', { urls: ['*api.anthropic.com*'] });
  page.context = browserContextId;
  if (href) await page.goto(href);
  return page;
}
const dispose = p => p.browser.send('Target.disposeBrowserContext', { browserContextId: p.context }).catch(() => {});
// Lecture avec le compte de la page : valeur, ou 'refusé'.
const readAs = (page, path) => page.eval(`
  const { db } = await import('/shared/firebase.js'); const { ref, get } = await import('${SDK}');
  try { return { v: (await get(ref(db, ${JSON.stringify(path)}))).val() }; } catch (e) { return /permission/i.test(e.message) ? 'refusé' : e.message; }`);
const account = page => page.eval(`const { auth } = await import('/shared/firebase.js'); const u = auth.currentUser; return u ? (u.isAnonymous ? 'anonyme' : 'autre') : null;`);
const lobbyCode = page => page.eval(`const el = document.getElementById('lobby-code'); const t = (el && (el.childNodes[0] ? el.childNodes[0].textContent : el.textContent) || '').trim(); return /^[A-Z]{3,5}-\\d{2}/.test(t) ? t : null;`);
const confirmAndDelete = page => page.eval(`window.confirm = () => true; await deleteGame(); return 1;`).catch(() => null);

const GAMES = [
  { dir: 'puissance4', prefix: 'p4', start: 'startGame' },
  { dir: 'qui-est-ce', prefix: 'qec2', start: 'startGame' },
  { dir: 'bataille-navale', prefix: 'bn', start: 'startPlacement' },
  { dir: 'roulette', prefix: 'rl', start: 'openTable' },
  { dir: 'mini-golf', prefix: 'mg', start: 'startGame' },
  { dir: 'uno', prefix: 'uno', start: 'startGame' },
];

async function simpleGame(browser, g) {
  const A = await player(browser, `${SITE}/games/${g.dir}/${QS}`, 'A');
  const B = await player(browser, `${SITE}/games/${g.dir}/${QS}`, 'B');
  let code = null;
  try {
    await A.eval(`document.getElementById('create-name').value='Sonde'; createGame();`);
    code = await waitFor(() => lobbyCode(A));
    check(`${g.dir} : création (compte ${await account(A)})`, code, code || 'pas de salon');
    if (!code) return;
    await B.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='Sondeb'; joinGame();`);
    const two = await waitFor(async () => { const r = await readAs(A, `${g.prefix}/${code}`); return r.v && Object.values(r.v.players || {}).filter(Boolean).length >= 2 && Object.keys(r.v.members || {}).length >= 2; });
    check(`${g.dir} : B rejoint (compte ${await account(B)}, membre distinct)`, two);
    await A.eval(`${g.start}();`);
    const started = await waitFor(async () => { const r = await readAs(B, `${g.prefix}/${code}/phase`); return r.v && r.v !== 'lobby' && r.v; });
    check(`${g.dir} : l'hôte lance, B voit la partie démarrer`, started, String(started));
    const errs = [...denied(A), ...denied(B)];
    check(`${g.dir} : aucun refus de permission`, errs.length === 0, errs.join(' || '));
  } finally {
    if (code) {
      await confirmAndDelete(A);
      const gone = await waitFor(async () => { const r = await readAs(A, `${g.prefix}/${code}/phase`); return r.v === null; }, 6000);
      check(`${g.dir} : partie de test supprimée`, gone);
    }
    await dispose(A); await dispose(B);
  }
}

async function undercover(browser) {
  const url = `${SITE}/games/undercover/${QS}`;
  const [A, B, C] = [await player(browser, url, 'A'), await player(browser, url, 'B'), await player(browser, url, 'C')];
  let code = null;
  try {
    await A.eval(`document.getElementById('player-count').value='3';document.getElementById('uc-count').value='1';document.getElementById('mw-count').value='0';
      document.getElementById('host-name').value='Sonde'; startCreation();`);
    code = await waitFor(() => lobbyCode(A), 20000);
    check(`undercover : création (compte ${await account(A)})`, code, code || 'pas de salon');
    if (!code) return;
    const pub = (await readAs(A, `games/${code}`)).v || {};
    check('undercover : aucun mot ni rôle dans la partie publique', pub.phase && !('civilWord' in pub) && !('roles' in pub));
    for (const [P, n] of [[B, 'Sondeb'], [C, 'Sondec']]) { await P.eval(`document.getElementById('join-code').value='${code}';document.getElementById('join-name').value='${n}'; joinGame();`); await sleep(800); }
    const g = await waitFor(async () => { const r = await readAs(A, `games/${code}`); return r.v && (r.v.players || []).length === 3 && r.v; });
    check('undercover : trois joueurs, trois comptes distincts', g && new Set(g.players.map(p => p.uid)).size === 3);
    if (!g) return;
    const uids = g.players.map(p => p.uid);
    await A.eval('startGame();');
    const words = await waitFor(async () => {
      const w = [];
      for (const p of [A, B, C]) w.push(await p.eval(`return document.getElementById('s-role').classList.contains('active') ? document.getElementById('role-word').textContent : null;`));
      return w.every(Boolean) && w;
    }, 15000);
    check('undercover : chacun voit son rôle', words, JSON.stringify(words));
    const host = (await readAs(A, `ucHost/${code}`)).v;
    check("undercover : l'hôte lit ucHost", host && host.roles && host.roles.length === 3);
    const expected = host ? host.roles.map(r => (r === 'civil' ? host.civilWord : r === 'undercover' ? host.undercoverWord : '???')) : [];
    check('undercover : les mots affichés correspondent aux rôles', words && words.every((w, i) => w === expected[i]));
    check('undercover : B lit son secret', ((await readAs(B, `ucSecret/${code}/${uids[1]}`)).v || {}).role);
    check("undercover : B ne lit ni le secret de C, ni ucHost, ni tous les secrets",
      (await readAs(B, `ucSecret/${code}/${uids[2]}`)) === 'refusé' && (await readAs(B, `ucHost/${code}`)) === 'refusé' && (await readAs(B, `ucSecret/${code}`)) === 'refusé');
    const E = await player(browser, url, 'E');
    check("undercover : un étranger ne lit ni ucHost ni les secrets", (await readAs(E, `ucHost/${code}`)) === 'refusé' && (await readAs(E, `ucSecret/${code}/${uids[1]}`)) === 'refusé');
    await dispose(E);
    const errs = [...denied(A), ...denied(B), ...denied(C)];
    check('undercover : aucun refus de permission pour les joueurs', errs.length === 0, errs.join(' || '));
  } finally {
    if (code) {
      await confirmAndDelete(A);
      // ucHost n'est plus lisible une fois la partie partie (plus d'hôte) : sa suppression se
      // vérifie à part, avec un accès administrateur (voir firebase/README.md).
      const gone = await waitFor(async () => (await readAs(A, `games/${code}/phase`)).v === null, 8000);
      check(`undercover : partie de test supprimée (secrets à vérifier : ucHost/${code}, ucSecret/${code})`, gone);
    }
    for (const p of [A, B, C]) await dispose(p);
  }
}

async function banqueroll(browser) {
  const url = `${SITE}/games/banqueroll/?ai=off${QS ? '&' + process.env.QS : ''}`;
  const [A, B] = [await player(browser, url, 'A'), await player(browser, url, 'B')];
  let code = null;
  try {
    await A.eval(`document.getElementById('create-name').value='Sonde'; document.getElementById('create-players').value='2';
      document.querySelector('[data-act="create"]').click(); await new Promise(r => setTimeout(r, 600));
      document.querySelector('[data-act="mode-pick"][data-arg="classic"]').click(); return 1;`);
    code = await waitFor(() => A.eval(`return document.getElementById('s-lobby').classList.contains('active') && __bq.S.code;`));
    check(`banqueroll : création (compte ${await account(A)})`, code, code || 'pas de salon');
    if (!code) return;
    await B.eval(`document.getElementById('join-code').value='${code}'; document.getElementById('join-name').value='Sondeb'; document.querySelector('[data-act="join"]').click(); return 1;`);
    check('banqueroll : B rejoint', await waitFor(() => B.eval(`return __bq.S.game && __bq.S.game.players.length === 2;`)));
    await A.eval(`document.getElementById('start-game-btn').click(); return 1;`);
    check('banqueroll : la partie démarre chez les deux joueurs',
      await waitFor(async () => (await A.eval(`return __bq.S.game && __bq.S.game.phase === 'playing';`)) && (await B.eval(`return __bq.S.game && __bq.S.game.phase === 'playing';`))));
    const errs = [...denied(A), ...denied(B)];
    check('banqueroll : aucun refus de permission', errs.length === 0, errs.join(' || '));
  } finally {
    if (code) {
      await A.eval(`window.confirm = () => true; await __bq.A.deleteGame(); return 1;`).catch(() => null);
      check('banqueroll : partie de test supprimée', await waitFor(async () => (await readAs(A, `banqueroll/${code}/phase`)).v === null, 6000));
    }
    await dispose(A); await dispose(B);
  }
}

(async () => {
  const browser = await Browser.launch({ headless: true });
  try {
    const H = await player(browser, `${SITE}/${QS}`, 'Hub');
    check('hub : compteur et présence affichés', await waitFor(() => H.eval(`return /connect/.test(document.getElementById('online-count')?.textContent || '') && document.getElementById('stat-visits')?.textContent;`)));
    check('hub : aucun refus de permission', denied(H).length === 0, denied(H).join(' || '));
    check('hub : réglages refusés à un visiteur', (await H.eval(`const { db } = await import('/shared/firebase.js'); const { ref, update } = await import('${SDK}');
      const { get } = await import('${SDK}'); const cur = (await get(ref(db, 'hub/settings/ageGate'))).val();
      // Valeur actuelle réécrite : inoffensif même si la règle laissait passer.
      try { await update(ref(db, 'hub/settings'), { ageGate: cur === null ? true : cur }); return 'ok'; } catch (e) { return 'refusé'; }`)) === 'refusé');
    await dispose(H);
    await undercover(browser);
    await banqueroll(browser);
    for (const g of GAMES) await simpleGame(browser, g);
  } finally {
    await browser.close();
  }
  const ok = results.filter(Boolean).length;
  console.log(`\n===== PRODUCTION : ${ok}/${results.length} =====`);
  process.exit(ok === results.length ? 0 : 1);
})();
